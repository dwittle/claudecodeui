"""
PAN-OS SSH Client

Secure SSH client for executing read-only operational commands on PAN-OS firewalls.
Implements strict validation to prevent any configuration changes or command injection.
"""

import os
import re
import paramiko
from typing import Optional, List
from io import StringIO


class PanosError(Exception):
    """Base exception for PAN-OS client errors"""
    pass


class SecurityViolation(PanosError):
    """Raised when a command violates security policies"""
    pass


class SafetyCheckRequired(PanosError):
    """Raised when a command requires LLM safety validation before execution"""
    pass


class PanosClient:
    """
    Secure SSH client for PAN-OS firewalls.

    Security Features:
    - Only allows operational commands (show, test, debug, safe request)
    - Prevents configuration changes
    - Prevents command chaining and injection
    - Validates all input before execution
    - Read-only operations only
    """

    # Dangerous patterns that could enable command chaining or escapes
    FORBIDDEN_PATTERNS = [
        r';',           # Command separator
        r'\|\|',        # OR operator
        r'&&',          # AND operator
        r'`',           # Command substitution
        r'\$\(',        # Command substitution
        r'>(?!\s)',     # Redirect output (but allow '>' in prompts)
        r'<',           # Redirect input
        r'!',           # Shell escape
        r'\n',          # Newline (command separator)
        r'\r',          # Carriage return
    ]

    # Forbidden commands (PAN-OS configuration/destructive commands)
    FORBIDDEN_COMMANDS = [
        r'\bconfigure\b',
        r'\bset\b',
        r'\bdelete\b',
        r'\bcommit\b',
        r'\bcommit-all\b',
        r'\brequest\s+restart\b',
        r'\brequest\s+reboot\b',
        r'\brequest\s+shutdown\b',
        r'\brequest\s+system\s+private-data-reset\b',
        r'\brequest\s+commit\b',
        r'\brename\b',
        r'\bmove\b',
        r'\bexit\b',
        r'\bquit\b',
        # Destructive debug commands
        r'\bdebug\s+software\s+restart\b',
        r'\bdebug\s+software\s+crash\b',
        r'\bdebug\s+software\s+reset\b',
        r'\bdebug\s+dataplane\s+restart\b',
        r'\bdebug\s+dataplane\s+reset\b',
        # Destructive clear commands
        r'\bclear\s+session\s+all\b',
        r'\bclear\s+routing\s+protocol\b',
        r'\bclear\s+arp\s+all\b',
    ]

    # Valid operational command prefixes (case-insensitive)
    ALLOWED_COMMAND_PREFIXES = [
        'show',         # Show commands
        'test',         # Test commands (routing, policy matching, etc.)
        'debug',        # Debug commands (read-only)
        'request',      # Safe request commands (needs additional validation)
    ]

    # Allowed request commands (whitelist approach for safety)
    ALLOWED_REQUEST_COMMANDS = [
        r'^request\s+system\s+software\s+check',
        r'^request\s+system\s+software\s+info',
        r'^request\s+support\s+info',
        r'^request\s+tech-support',
        r'^request\s+system\s+info',
        r'^request\s+license\s+info',
        r'^request\s+high-availability\s+state',
        r'^request\s+session\s+info',
        r'^request\s+stats\s+',
    ]

    # Allowed debug commands (whitelist approach for safety)
    ALLOWED_DEBUG_COMMANDS = [
        r'^debug\s+software\s+status',
        r'^debug\s+dataplane\s+packet-diag\s+show',
    ]

    # Allowed test commands (whitelist approach for safety)
    ALLOWED_TEST_COMMANDS = [
        r'^test\s+routing\s+fib-lookup',
        r'^test\s+security-policy-match',
        r'^test\s+nat-policy-match',
        r'^test\s+url',
        r'^test\s+vpn',
    ]

    def __init__(self,
                 hostname: str,
                 username: Optional[str] = None,
                 password: Optional[str] = None,
                 port: int = 22,
                 timeout: int = 30,
                 bastion_host: Optional[str] = None,
                 bastion_username: Optional[str] = None,
                 bastion_password: Optional[str] = None,
                 bastion_port: int = 22):
        """
        Initialize SSH client for PAN-OS firewall.

        Credentials priority: environment variables first, then explicit parameters.

        Args:
            hostname: Firewall hostname or IP address
            username: SSH username (fallback if PANOS_USERNAME not set)
            password: SSH password (fallback if PANOS_PASSWORD not set)
            port: SSH port (default: 22)
            timeout: Connection timeout in seconds
            bastion_host: Optional bastion/jump host (fallback if PANOS_BASTION_HOST not set)
            bastion_username: Username for bastion host (fallback if NETSWITCH_USERNAME/PANOS_BASTION_USERNAME not set)
            bastion_password: Password for bastion host (fallback if NETSWITCH_PASSWORD/PANOS_BASTION_PASSWORD not set)
            bastion_port: SSH port for bastion host (default: 22)
        """
        self.hostname = hostname

        # Priority: environment variables first, then parameters
        self.username = os.environ.get('PANOS_USERNAME') or username
        self.password = os.environ.get('PANOS_PASSWORD') or password

        if not self.username:
            raise PanosError("Username required: set PANOS_USERNAME environment variable or provide as argument")
        if not self.password:
            raise PanosError("Password required: set PANOS_PASSWORD environment variable or provide as argument")

        self.port = port
        self.timeout = timeout

        # Bastion config: environment first
        self.bastion_host = os.environ.get('PANOS_BASTION_HOST') or bastion_host

        # For bastion credentials, try NETSWITCH env vars first, then PANOS_BASTION, then parameters
        if self.bastion_host:
            self.bastion_username = (
                os.environ.get('NETSWITCH_USERNAME') or
                os.environ.get('PANOS_BASTION_USERNAME') or
                bastion_username
            )
            self.bastion_password = (
                os.environ.get('NETSWITCH_PASSWORD') or
                os.environ.get('PANOS_BASTION_PASSWORD') or
                bastion_password
            )

            if not self.bastion_username or not self.bastion_password:
                raise PanosError("Bastion credentials required: set NETSWITCH_USERNAME/PASSWORD or PANOS_BASTION_USERNAME/PASSWORD environment variables")
        else:
            self.bastion_username = bastion_username
            self.bastion_password = bastion_password

        self.bastion_port = bastion_port
        self.client: Optional[paramiko.SSHClient] = None
        self.bastion_client: Optional[paramiko.SSHClient] = None
        self.bastion_transport = None
        self.shell = None

    def connect(self, debug=False):
        """Establish SSH connection to the firewall (optionally through bastion)"""
        self.debug = debug
        try:
            # If bastion host is specified, connect through it
            if self.bastion_host:
                if self.debug:
                    print(f"[DEBUG] Connecting to bastion host: {self.bastion_host}:{self.bastion_port}", flush=True)
                # Connect to bastion host first
                if self.debug:
                    print(f"[DEBUG] Creating bastion SSH client...", flush=True)
                self.bastion_client = paramiko.SSHClient()
                self.bastion_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

                if self.debug:
                    print(f"[DEBUG] Authenticating to bastion as {self.bastion_username}...", flush=True)
                self.bastion_client.connect(
                    hostname=self.bastion_host,
                    port=self.bastion_port,
                    username=self.bastion_username,
                    password=self.bastion_password,
                    timeout=self.timeout,
                    look_for_keys=False,
                    allow_agent=False
                )
                if self.debug:
                    print(f"[DEBUG] ✓ Connected to bastion", flush=True)

                # Create a tunnel through the bastion
                if self.debug:
                    print(f"[DEBUG] Opening tunnel to {self.hostname}:{self.port}...", flush=True)
                self.bastion_transport = self.bastion_client.get_transport()
                dest_addr = (self.hostname, self.port)
                local_addr = ('127.0.0.1', 0)
                channel = self.bastion_transport.open_channel(
                    "direct-tcpip",
                    dest_addr,
                    local_addr
                )
                if self.debug:
                    print(f"[DEBUG] ✓ Tunnel established", flush=True)

                # Connect to final host through the tunnel
                if self.debug:
                    print(f"[DEBUG] Connecting to {self.hostname} through tunnel...", flush=True)
                self.client = paramiko.SSHClient()
                self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

                self.client.connect(
                    hostname=self.hostname,
                    port=self.port,
                    username=self.username,
                    password=self.password,
                    timeout=self.timeout,
                    look_for_keys=False,
                    allow_agent=False,
                    sock=channel
                )
                if self.debug:
                    print(f"[DEBUG] ✓ Connected to firewall", flush=True)
            else:
                # Direct connection (no bastion)
                self.client = paramiko.SSHClient()
                self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

                self.client.connect(
                    hostname=self.hostname,
                    port=self.port,
                    username=self.username,
                    password=self.password,
                    timeout=self.timeout,
                    look_for_keys=False,
                    allow_agent=False
                )

            # Open an interactive shell
            if self.debug:
                print(f"[DEBUG] Opening interactive shell...", flush=True)
            self.shell = self.client.invoke_shell()
            self.shell.settimeout(self.timeout)
            if self.debug:
                print(f"[DEBUG] ✓ Shell opened", flush=True)

            # Wait for initial prompt and clear buffer
            if self.debug:
                print(f"[DEBUG] Waiting for initial prompt...", flush=True)
            self._read_until_prompt()
            if self.debug:
                print(f"[DEBUG] ✓ Got prompt", flush=True)

            # Disable pager for continuous output
            if self.debug:
                print(f"[DEBUG] Disabling pager...", flush=True)
            self._disable_pager()
            if self.debug:
                print(f"[DEBUG] ✓ Ready for commands", flush=True)

        except paramiko.AuthenticationException as e:
            if self.bastion_host:
                raise PanosError(f"Authentication failed (check both bastion and firewall credentials): {str(e)}")
            else:
                raise PanosError(f"Authentication failed for {self.username}@{self.hostname}")
        except paramiko.SSHException as e:
            raise PanosError(f"SSH connection failed: {str(e)}")
        except Exception as e:
            raise PanosError(f"Connection error: {str(e)}")

    def disconnect(self):
        """Close SSH connection"""
        if self.shell:
            self.shell.close()
        if self.client:
            self.client.close()
        if self.bastion_client:
            self.bastion_client.close()

    def __enter__(self):
        """Context manager entry"""
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.disconnect()

    def _read_until_prompt(self, timeout: Optional[int] = None) -> str:
        """
        Read output until a PAN-OS prompt is detected.

        PAN-OS prompts look like:
        - admin@PA-VM> (operational mode)
        - admin@PA-VM(active)> (HA active node)
        - admin@PA-VM(passive)> (HA passive node)
        - admin@PA-VM# (configuration mode - shouldn't see this)

        Returns:
            The output received
        """
        if not self.shell:
            raise PanosError("Not connected")

        output = StringIO()
        if timeout:
            original_timeout = self.shell.gettimeout()
            self.shell.settimeout(timeout)

        try:
            buffer = ""
            while True:
                if self.shell.recv_ready():
                    chunk = self.shell.recv(4096).decode('utf-8', errors='ignore')
                    output.write(chunk)
                    buffer += chunk

                    # Check for PAN-OS prompt patterns
                    # Matches: username@hostname> or username@hostname(active)> or username@hostname#
                    if re.search(r'[\w-]+@[\w-]+(\([^)]+\))?[>#]\s*$', buffer):
                        break
                else:
                    # Small delay to avoid busy waiting
                    import time
                    time.sleep(0.1)
        except Exception as e:
            raise PanosError(f"Error reading output: {str(e)}")
        finally:
            if timeout:
                self.shell.settimeout(original_timeout)

        return output.getvalue()

    def _disable_pager(self):
        """Disable PAN-OS CLI pager for continuous output"""
        if not self.shell:
            return

        try:
            self.shell.send('set cli pager off\n')
            self._read_until_prompt(timeout=5)
        except Exception:
            pass  # Ignore errors, this is best-effort

    def validate_command(self, command: str) -> None:
        """
        Validate that a command is safe to execute.

        Raises:
            SecurityViolation: If command violates security policy
        """
        if not command or not command.strip():
            raise SecurityViolation("Empty command not allowed")

        # Normalize whitespace
        cmd_normalized = ' '.join(command.split())
        cmd_lower = cmd_normalized.lower()

        # Check for forbidden patterns
        for pattern in self.FORBIDDEN_PATTERNS:
            if re.search(pattern, command):
                raise SecurityViolation(
                    f"Command contains forbidden pattern: {pattern}"
                )

        # Check for forbidden commands
        for pattern in self.FORBIDDEN_COMMANDS:
            if re.search(pattern, cmd_lower):
                raise SecurityViolation(
                    f"Command contains forbidden operation: {pattern}"
                )

        # Check that command starts with an allowed prefix
        first_word = cmd_normalized.split()[0].lower()
        if first_word not in [p.lower() for p in self.ALLOWED_COMMAND_PREFIXES]:
            raise SecurityViolation(
                f"Command must start with one of: {', '.join(self.ALLOWED_COMMAND_PREFIXES)}"
            )

        # Special validation for 'request' commands - must match whitelist
        if first_word == 'request':
            allowed = False
            for allowed_pattern in self.ALLOWED_REQUEST_COMMANDS:
                if re.match(allowed_pattern, cmd_lower):
                    allowed = True
                    break

            if not allowed:
                raise SecurityViolation(
                    "This 'request' command is not allowed. Only safe request commands are permitted "
                    "(e.g., 'request system software check', 'request support info'). "
                    "Destructive commands like 'request restart' are blocked."
                )

        # Special validation for 'debug' commands - must match whitelist
        if first_word == 'debug':
            allowed = False
            for allowed_pattern in self.ALLOWED_DEBUG_COMMANDS:
                if re.match(allowed_pattern, cmd_lower):
                    allowed = True
                    break

            if not allowed:
                raise SecurityViolation(
                    "This 'debug' command is not allowed. Only safe read-only debug commands are permitted. "
                    "Destructive commands like 'debug software restart' are blocked. "
                    "Use 'show' commands instead for most diagnostic needs."
                )

        # Special validation for 'test' commands - must match whitelist
        if first_word == 'test':
            allowed = False
            for allowed_pattern in self.ALLOWED_TEST_COMMANDS:
                if re.match(allowed_pattern, cmd_lower):
                    allowed = True
                    break

            if not allowed:
                raise SecurityViolation(
                    "This 'test' command is not allowed. Only safe test commands are permitted "
                    "(e.g., 'test security-policy-match', 'test routing fib-lookup'). "
                    "If you need this test command, please verify it's read-only and add it to the whitelist."
                )

    def execute_command(self, command: str, timeout: Optional[int] = None, skip_safety_check: bool = False) -> str:
        """
        Execute a validated operational command on the firewall.

        Args:
            command: The command to execute
            timeout: Optional command timeout in seconds
            skip_safety_check: If True, skip LLM-based safety validation (use with caution)

        Returns:
            Command output as string

        Raises:
            SecurityViolation: If command violates security policy
            SafetyCheckRequired: If command requires LLM safety validation
            PanosError: If execution fails
        """
        # Validate command before execution
        self.validate_command(command)

        # Safety check: Non-show commands require LLM validation unless explicitly skipped
        cmd_lower = command.strip().lower()
        if not cmd_lower.startswith('show') and not skip_safety_check:
            raise SafetyCheckRequired(
                f"SAFETY_CHECK_REQUIRED: Command '{command}' requires safety validation. "
                f"This is a production firewall. Non-'show' commands (test, debug, request) "
                f"could potentially impact services. Please validate this command is safe "
                f"and will not cause service interruption, then retry with --confirmed-safe flag."
            )

        if not self.shell:
            raise PanosError("Not connected. Call connect() first.")

        try:
            # Execute the command
            self.shell.send(f'{command}\n')

            # Read output
            output = self._read_until_prompt(timeout=timeout or self.timeout)

            # Clean up output (remove echo of command and prompt)
            lines = output.split('\n')

            # Remove echo line (first line usually contains the command)
            if lines and command in lines[0]:
                lines = lines[1:]

            # Remove trailing prompt line
            if lines and re.search(r'[\w-]+@[\w-]+[>#]\s*$', lines[-1]):
                lines = lines[:-1]

            return '\n'.join(lines).strip()

        except SecurityViolation:
            raise  # Re-raise security violations
        except Exception as e:
            raise PanosError(f"Command execution failed: {str(e)}")

    def execute_multiple_commands(self, commands: List[str]) -> dict:
        """
        Execute multiple operational commands and return results.

        Args:
            commands: List of commands to execute

        Returns:
            Dictionary mapping command to output
        """
        results = {}
        for cmd in commands:
            try:
                results[cmd] = self.execute_command(cmd)
            except Exception as e:
                results[cmd] = f"ERROR: {str(e)}"

        return results

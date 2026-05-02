"""
Network Switch SSH Client

Secure SSH client for executing read-only "show" commands on network switches.
Implements strict validation to prevent any configuration changes or command injection.
"""

import re
import paramiko
from typing import Optional, List
from io import StringIO


class NetSwitchError(Exception):
    """Base exception for network switch client errors"""
    pass


class SecurityViolation(NetSwitchError):
    """Raised when a command violates security policies"""
    pass


class NetSwitchClient:
    """
    Secure SSH client for network switches.

    Security Features:
    - Only allows "show" commands
    - Prevents command chaining and injection
    - Validates all input before execution
    - Read-only operations only
    """

    # Dangerous patterns that could enable command chaining or escapes
    FORBIDDEN_PATTERNS = [
        r';',           # Command separator
        r'\|\|',        # OR operator
        r'&&',          # AND operator
        r'\|',          # Pipe
        r'`',           # Command substitution
        r'\$\(',        # Command substitution
        r'>',           # Redirect output
        r'<',           # Redirect input
        r'!',           # Shell escape or negation
        r'\n',          # Newline (command separator)
        r'\r',          # Carriage return
        r'configure',   # Config mode (case will be checked)
        r'write',       # Save config
        r'copy',        # Copy config
        r'reload',      # Reload device
        r'enable',      # Privilege escalation (when not standalone)
    ]

    # Valid show command prefixes (case-insensitive)
    ALLOWED_COMMAND_PREFIXES = [
        'show',
        'display',      # Some vendors use this
    ]

    def __init__(self,
                 hostname: str,
                 username: str,
                 password: str,
                 port: int = 22,
                 timeout: int = 30,
                 enable_password: Optional[str] = None):
        """
        Initialize SSH client for network switch.

        Args:
            hostname: Switch hostname or IP address
            username: SSH username
            password: SSH password
            port: SSH port (default: 22)
            timeout: Connection timeout in seconds
            enable_password: Optional enable/privileged mode password
        """
        self.hostname = hostname
        self.username = username
        self.password = password
        self.port = port
        self.timeout = timeout
        self.enable_password = enable_password
        self.client: Optional[paramiko.SSHClient] = None
        self.shell = None

    def connect(self):
        """Establish SSH connection to the switch"""
        try:
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
            self.shell = self.client.invoke_shell()
            self.shell.settimeout(self.timeout)

            # Wait for initial prompt and clear buffer
            self._read_until_prompt()

            # Enter enable mode if password provided
            if self.enable_password:
                self._enter_enable_mode()

        except paramiko.AuthenticationException:
            raise NetSwitchError(f"Authentication failed for {self.username}@{self.hostname}")
        except paramiko.SSHException as e:
            raise NetSwitchError(f"SSH connection failed: {str(e)}")
        except Exception as e:
            raise NetSwitchError(f"Connection error: {str(e)}")

    def disconnect(self):
        """Close SSH connection"""
        if self.shell:
            self.shell.close()
        if self.client:
            self.client.close()

    def __enter__(self):
        """Context manager entry"""
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.disconnect()

    def _read_until_prompt(self, timeout: Optional[int] = None) -> str:
        """
        Read output until a prompt is detected.

        Returns:
            The output received
        """
        if not self.shell:
            raise NetSwitchError("Not connected")

        output = StringIO()
        if timeout:
            self.shell.settimeout(timeout)

        try:
            while True:
                if self.shell.recv_ready():
                    chunk = self.shell.recv(4096).decode('utf-8', errors='ignore')
                    output.write(chunk)

                    # Check for common prompt patterns
                    if re.search(r'[>#$]\s*$', chunk):
                        break
                else:
                    # Small delay to avoid busy waiting
                    import time
                    time.sleep(0.1)
        except Exception as e:
            raise NetSwitchError(f"Error reading output: {str(e)}")

        return output.getvalue()

    def _enter_enable_mode(self):
        """Enter privileged/enable mode if needed"""
        if not self.shell or not self.enable_password:
            return

        # Send enable command
        self.shell.send('enable\n')
        output = self._read_until_prompt(timeout=5)

        # Check if password prompt appeared
        if 'assword' in output.lower():
            self.shell.send(f'{self.enable_password}\n')
            self._read_until_prompt(timeout=5)

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
            if re.search(pattern, command, re.IGNORECASE):
                raise SecurityViolation(
                    f"Command contains forbidden pattern: {pattern}"
                )

        # Check that command starts with an allowed prefix
        allowed = False
        for prefix in self.ALLOWED_COMMAND_PREFIXES:
            if cmd_lower.startswith(prefix.lower()):
                allowed = True
                break

        if not allowed:
            raise SecurityViolation(
                f"Command must start with one of: {', '.join(self.ALLOWED_COMMAND_PREFIXES)}"
            )

        # Additional check: ensure "show" is the first word (not in middle of something)
        first_word = cmd_normalized.split()[0].lower()
        if first_word not in [p.lower() for p in self.ALLOWED_COMMAND_PREFIXES]:
            raise SecurityViolation(
                f"First word must be a valid command: {', '.join(self.ALLOWED_COMMAND_PREFIXES)}"
            )

    def execute_command(self, command: str, timeout: Optional[int] = None) -> str:
        """
        Execute a validated show command on the switch.

        Args:
            command: The command to execute (must be a "show" command)
            timeout: Optional command timeout in seconds

        Returns:
            Command output as string

        Raises:
            SecurityViolation: If command violates security policy
            NetSwitchError: If execution fails
        """
        # Validate command before execution
        self.validate_command(command)

        if not self.shell:
            raise NetSwitchError("Not connected. Call connect() first.")

        try:
            # Disable pagination (common commands for different vendors)
            pagination_cmds = [
                'terminal length 0',      # Cisco IOS
                'terminal length 0',      # Cisco NXOS
                'screen-length 0',        # Huawei
                'screen-length disable',  # HP
            ]

            for pag_cmd in pagination_cmds:
                try:
                    self.shell.send(f'{pag_cmd}\n')
                    self._read_until_prompt(timeout=2)
                except:
                    pass  # Ignore errors, command might not exist on this vendor

            # Execute the actual command
            self.shell.send(f'{command}\n')

            # Read output
            output = self._read_until_prompt(timeout=timeout or self.timeout)

            # Clean up output (remove echo of command and prompt)
            lines = output.split('\n')
            if lines and command in lines[0]:
                lines = lines[1:]  # Remove echo line

            # Remove trailing prompt
            if lines and re.search(r'[>#$]\s*$', lines[-1]):
                lines = lines[:-1]

            return '\n'.join(lines).strip()

        except SecurityViolation:
            raise  # Re-raise security violations
        except Exception as e:
            raise NetSwitchError(f"Command execution failed: {str(e)}")

    def execute_multiple_commands(self, commands: List[str]) -> dict:
        """
        Execute multiple show commands and return results.

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

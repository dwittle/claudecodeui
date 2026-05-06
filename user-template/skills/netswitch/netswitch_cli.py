#!/usr/bin/env python3
"""
Network Switch CLI Tool

Secure command-line interface for executing read-only "show" commands on network switches via SSH.
"""

import os
import sys
import json
import argparse
from typing import Optional
from netswitch_client import NetSwitchClient, NetSwitchError, SecurityViolation


def get_credentials(args) -> tuple:
    """
    Get connection credentials from environment first, then arguments.

    Priority: environment variables > command arguments

    Returns:
        Tuple of (hostname, username, password, enable_password)
    """
    hostname = args.hostname

    # Username: environment first, then argument
    username = os.environ.get('NETSWITCH_USERNAME') or args.username
    if not username:
        print("ERROR: Username required (set NETSWITCH_USERNAME env var or use --username)", file=sys.stderr)
        sys.exit(1)

    # Password: environment first (no argument option for security)
    password = os.environ.get('NETSWITCH_PASSWORD')
    if not password:
        print("ERROR: NETSWITCH_PASSWORD environment variable must be set", file=sys.stderr)
        sys.exit(1)

    # Enable password: optional, from environment only
    enable_password = os.environ.get('NETSWITCH_ENABLE_PASSWORD')

    return hostname, username, password, enable_password


def cmd_show(args):
    """Execute a single show command"""
    hostname, username, password, enable_password = get_credentials(args)

    try:
        with NetSwitchClient(
            hostname=hostname,
            username=username,
            password=password,
            port=args.port,
            timeout=args.timeout,
            enable_password=enable_password
        ) as client:
            output = client.execute_command(args.command)

            if args.json:
                print(json.dumps({
                    'hostname': hostname,
                    'command': args.command,
                    'output': output,
                    'success': True
                }, indent=2))
            else:
                print(output)

    except SecurityViolation as e:
        if args.json:
            print(json.dumps({
                'hostname': hostname,
                'command': args.command,
                'error': str(e),
                'success': False,
                'security_violation': True
            }, indent=2))
        else:
            print(f"SECURITY VIOLATION: {e}", file=sys.stderr)
        sys.exit(1)

    except NetSwitchError as e:
        if args.json:
            print(json.dumps({
                'hostname': hostname,
                'command': args.command,
                'error': str(e),
                'success': False
            }, indent=2))
        else:
            print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_show_multiple(args):
    """Execute multiple show commands"""
    hostname, username, password, enable_password = get_credentials(args)

    # Read commands from file or arguments (file takes precedence)
    if args.file:
        try:
            with open(args.file, 'r') as f:
                commands = [line.strip() for line in f if line.strip() and not line.startswith('#')]
        except Exception as e:
            print(f"ERROR: Failed to read command file: {e}", file=sys.stderr)
            sys.exit(1)
    elif args.commands:
        commands = args.commands
    else:
        print("ERROR: No commands provided. Use command arguments or --file option.", file=sys.stderr)
        sys.exit(1)

    if not commands:
        print("ERROR: No valid commands found", file=sys.stderr)
        sys.exit(1)

    try:
        with NetSwitchClient(
            hostname=hostname,
            username=username,
            password=password,
            port=args.port,
            timeout=args.timeout,
            enable_password=enable_password
        ) as client:
            results = client.execute_multiple_commands(commands)

            if args.json:
                print(json.dumps({
                    'hostname': hostname,
                    'results': results
                }, indent=2))
            else:
                for cmd, output in results.items():
                    print(f"\n{'='*60}")
                    print(f"Command: {cmd}")
                    print('='*60)
                    print(output)

    except NetSwitchError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_validate(args):
    """Validate command(s) without executing"""
    # Read commands from file or arguments (file takes precedence)
    if args.file:
        try:
            with open(args.file, 'r') as f:
                commands = [line.strip() for line in f if line.strip() and not line.startswith('#')]
        except Exception as e:
            print(f"ERROR: Failed to read command file: {e}", file=sys.stderr)
            sys.exit(1)
    elif args.command:
        commands = [args.command]
    else:
        print("ERROR: No command provided. Use command argument or --file option.", file=sys.stderr)
        sys.exit(1)

    client = NetSwitchClient(
        hostname='dummy',
        username='dummy',
        password='dummy'
    )

    results = []
    all_valid = True

    for cmd in commands:
        try:
            client.validate_command(cmd)
            results.append({
                'command': cmd,
                'valid': True,
                'message': 'Command is valid'
            })
        except SecurityViolation as e:
            results.append({
                'command': cmd,
                'valid': False,
                'message': str(e)
            })
            all_valid = False

    if args.json:
        print(json.dumps({'validation_results': results}, indent=2))
    else:
        for result in results:
            status = "✓ VALID" if result['valid'] else "✗ INVALID"
            print(f"{status}: {result['command']}")
            if not result['valid']:
                print(f"  Reason: {result['message']}")

    sys.exit(0 if all_valid else 1)


def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        description='Secure SSH interface for network switch show commands',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Security Features:
  - Only "show" and "display" commands are allowed
  - Command injection and chaining are prevented
  - No configuration changes possible
  - All commands are validated before execution

Environment Variables:
  NETSWITCH_USERNAME        - Default SSH username
  NETSWITCH_PASSWORD        - SSH password (REQUIRED)
  NETSWITCH_ENABLE_PASSWORD - Optional enable/privileged mode password

Examples:
  # Execute a single show command
  netswitch_cli.py show 192.168.1.1 "show version"

  # Execute multiple commands
  netswitch_cli.py show-multiple 192.168.1.1 "show version" "show interfaces"

  # Execute commands from a file
  netswitch_cli.py show-multiple 192.168.1.1 --file commands.txt

  # Validate commands without executing
  netswitch_cli.py validate "show version"
  netswitch_cli.py validate --file commands.txt
        """
    )

    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    subparsers.required = True

    # Common arguments for connection commands
    def add_connection_args(p):
        p.add_argument('hostname', help='Switch hostname or IP address')
        p.add_argument('--username', '-u', help='SSH username (or set NETSWITCH_USERNAME)')
        p.add_argument('--port', '-p', type=int, default=22, help='SSH port (default: 22)')
        p.add_argument('--timeout', '-t', type=int, default=30, help='Connection timeout in seconds (default: 30)')
        p.add_argument('--json', '-j', action='store_true', help='Output in JSON format')

    # show command
    p = subparsers.add_parser('show', help='Execute a single show command')
    add_connection_args(p)
    p.add_argument('command', help='Show command to execute (e.g., "show version")')
    p.set_defaults(func=cmd_show)

    # show-multiple command
    p = subparsers.add_parser('show-multiple', help='Execute multiple show commands')
    add_connection_args(p)
    p.add_argument('commands', nargs='*', help='Show commands to execute (or use --file)')
    p.add_argument('--file', '-f', help='Read commands from file (one per line, overrides commands)')
    p.set_defaults(func=cmd_show_multiple)

    # validate command
    p = subparsers.add_parser('validate', help='Validate command(s) without executing')
    p.add_argument('--json', '-j', action='store_true', help='Output in JSON format')
    p.add_argument('command', nargs='?', help='Command to validate (or use --file)')
    p.add_argument('--file', '-f', help='Read commands from file (one per line, overrides command)')
    p.set_defaults(func=cmd_validate)

    args = parser.parse_args()

    try:
        args.func(args)
    except KeyboardInterrupt:
        print("\nInterrupted", file=sys.stderr)
        sys.exit(130)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()

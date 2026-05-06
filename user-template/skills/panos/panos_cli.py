#!/usr/bin/env python3
"""
PAN-OS CLI Tool

Secure command-line interface for executing read-only operational commands on PAN-OS firewalls via SSH.
"""

import os
import sys
import json
import argparse
from typing import Optional
from panos_client import PanosClient, PanosError, SecurityViolation, SafetyCheckRequired


def get_credentials(args) -> tuple:
    """
    Get connection credentials from environment first, then arguments.

    Priority: environment variables > command arguments

    Returns:
        Tuple of (hostname, username, password, bastion_host, bastion_username, bastion_password)
    """
    hostname = args.hostname

    # Username: environment first, then argument
    username = os.environ.get('PANOS_USERNAME') or args.username
    if not username:
        print("ERROR: Username required (set PANOS_USERNAME env var or use --username)", file=sys.stderr)
        sys.exit(1)

    # Password: environment first (no argument option for security)
    password = os.environ.get('PANOS_PASSWORD')
    if not password:
        print("ERROR: PANOS_PASSWORD environment variable must be set", file=sys.stderr)
        sys.exit(1)

    # Bastion host: environment first, then argument
    bastion_host = os.environ.get('PANOS_BASTION_HOST') or getattr(args, 'bastion_host', None)
    bastion_username = None
    bastion_password = None

    if bastion_host:
        # For bastion, try NETSWITCH env first, then PANOS_BASTION env, then argument
        bastion_username = (
            os.environ.get('NETSWITCH_USERNAME') or
            os.environ.get('PANOS_BASTION_USERNAME') or
            getattr(args, 'bastion_username', None)
        )
        bastion_password = (
            os.environ.get('NETSWITCH_PASSWORD') or
            os.environ.get('PANOS_BASTION_PASSWORD')
        )

        if not bastion_username or not bastion_password:
            print("ERROR: Bastion credentials required (set NETSWITCH_USERNAME/PASSWORD or PANOS_BASTION_USERNAME/PASSWORD)", file=sys.stderr)
            sys.exit(1)

    return hostname, username, password, bastion_host, bastion_username, bastion_password


def cmd_show(args):
    """Execute a single operational command"""
    hostname, username, password, bastion_host, bastion_username, bastion_password = get_credentials(args)

    try:
        with PanosClient(
            hostname=hostname,
            username=username,
            password=password,
            port=args.port,
            timeout=args.timeout,
            bastion_host=bastion_host,
            bastion_username=bastion_username,
            bastion_password=bastion_password
        ) as client:
            # Pass skip_safety_check flag if --confirmed-safe was provided
            skip_safety = getattr(args, 'confirmed_safe', False)
            output = client.execute_command(args.command, skip_safety_check=skip_safety)

            if args.json:
                print(json.dumps({
                    'hostname': hostname,
                    'command': args.command,
                    'output': output,
                    'success': True
                }, indent=2))
            else:
                print(output)

    except SafetyCheckRequired as e:
        if args.json:
            print(json.dumps({
                'hostname': hostname,
                'command': args.command,
                'error': str(e),
                'success': False,
                'safety_check_required': True,
                'requires_confirmation': True
            }, indent=2))
        else:
            print(f"SAFETY CHECK REQUIRED: {e}", file=sys.stderr)
        sys.exit(2)  # Exit code 2 indicates safety check needed

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

    except PanosError as e:
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
    """Execute multiple operational commands"""
    hostname, username, password, bastion_host, bastion_username, bastion_password = get_credentials(args)

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
        with PanosClient(
            hostname=hostname,
            username=username,
            password=password,
            port=args.port,
            timeout=args.timeout,
            bastion_host=bastion_host,
            bastion_username=bastion_username,
            bastion_password=bastion_password
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

    except PanosError as e:
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

    client = PanosClient(
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
        description='Secure SSH interface for PAN-OS firewall operational commands',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Security Features:
  - Only operational commands allowed (show, test, debug, safe request)
  - Configuration changes are prevented
  - Command injection and chaining are prevented
  - All commands are validated before execution

Environment Variables (all optional, used as defaults):
  PANOS_USERNAME          - SSH username for firewall
  PANOS_PASSWORD          - SSH password for firewall
  PANOS_BASTION_HOST      - Bastion/jump host for SSH tunneling
  NETSWITCH_USERNAME      - Bastion username (tried first)
  NETSWITCH_PASSWORD      - Bastion password (tried first)
  PANOS_BASTION_USERNAME  - Bastion username (fallback)
  PANOS_BASTION_PASSWORD  - Bastion password (fallback)

Examples:
  # Execute a single command
  panos_cli.py show 192.168.1.1 "show system info"

  # Execute multiple commands
  panos_cli.py show-multiple 192.168.1.1 "show system info" "show interface all"

  # Execute commands from a file
  panos_cli.py show-multiple 192.168.1.1 --file commands.txt

  # Validate commands without executing
  panos_cli.py validate "show system info"
  panos_cli.py validate --file commands.txt
        """
    )

    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    subparsers.required = True

    # Common arguments for connection commands
    def add_connection_args(p):
        p.add_argument('hostname', help='Firewall hostname or IP address')
        p.add_argument('--username', '-u', help='SSH username (or set PANOS_USERNAME)')
        p.add_argument('--port', '-p', type=int, default=22, help='SSH port (default: 22)')
        p.add_argument('--timeout', '-t', type=int, default=30, help='Connection timeout in seconds (default: 30)')
        p.add_argument('--bastion-host', '-b', help='Bastion/jump host to tunnel through (default: netprod0001 from PANOS_BASTION_HOST)')
        p.add_argument('--bastion-username', help='Bastion username (or set NETSWITCH_USERNAME/PANOS_BASTION_USERNAME)')
        p.add_argument('--json', '-j', action='store_true', help='Output in JSON format')

    # show command
    p = subparsers.add_parser('show', help='Execute a single operational command')
    add_connection_args(p)
    p.add_argument('command', help='Operational command to execute (e.g., "show system info")')
    p.add_argument('--confirmed-safe', action='store_true',
                   help='Confirm that non-show command has been validated as safe (production safety check)')
    p.set_defaults(func=cmd_show)

    # show-multiple command
    p = subparsers.add_parser('show-multiple', help='Execute multiple operational commands')
    add_connection_args(p)
    p.add_argument('commands', nargs='*', help='Operational commands to execute (or use --file)')
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

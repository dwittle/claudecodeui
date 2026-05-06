#!/usr/bin/env python3
"""
Example: Using Environment Variables for Configuration

This example demonstrates how to use environment variables to configure
the PAN-OS client instead of hardcoding credentials.

Prerequisites:
    Set environment variables before running:

    export PANOS_USERNAME='admin'
    export PANOS_PASSWORD='your-password'

    Optional (for bastion):
    export PANOS_BASTION_HOST='bastion.example.com'
    export NETSWITCH_USERNAME='bastion-user'
    export NETSWITCH_PASSWORD='bastion-password'

Usage:
    python env_config_example.py firewall.example.com
"""

import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from panos_client import PanosClient, PanosError


def main():
    if len(sys.argv) < 2:
        print("Usage: python env_config_example.py <hostname>")
        print("\nMake sure to set environment variables first:")
        print("  export PANOS_USERNAME='admin'")
        print("  export PANOS_PASSWORD='your-password'")
        sys.exit(1)

    hostname = sys.argv[1]

    # Check if credentials are set
    if not os.environ.get('PANOS_USERNAME'):
        print("ERROR: PANOS_USERNAME environment variable not set")
        sys.exit(1)
    if not os.environ.get('PANOS_PASSWORD'):
        print("ERROR: PANOS_PASSWORD environment variable not set")
        sys.exit(1)

    print(f"Connecting to {hostname}...")
    print(f"Username: {os.environ.get('PANOS_USERNAME')}")

    if os.environ.get('PANOS_BASTION_HOST'):
        print(f"Via bastion: {os.environ.get('PANOS_BASTION_HOST')}")

    try:
        # Create client - credentials loaded automatically from environment
        with PanosClient(hostname=hostname) as client:
            print("✓ Connected successfully\n")

            # Execute a simple command
            print("Running: show system info")
            print("-" * 60)
            output = client.execute_command('show system info')
            print(output)
            print("-" * 60)
            print("\n✓ Command executed successfully")

    except PanosError as e:
        print(f"\n✗ Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()

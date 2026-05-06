#!/usr/bin/env python3
"""
AKiPS CLI Tool

Direct command-line interface for querying AKiPS network monitoring systems.
"""

import os
import sys
import json
import argparse
from typing import Optional
from akips_client import AKiPSClient, AKiPSError


def get_client() -> AKiPSClient:
    """Create AKiPS client from environment variables with defaults"""
    # Environment variables with defaults
    server = os.environ.get('AKIPS_SERVER') or 'akipsdcm0001.llnl.gov'
    username = os.environ.get('AKIPS_USERNAME') or 'api-ro'
    verify_ssl = (os.environ.get('AKIPS_VERIFY_SSL') or 'false').lower() == 'true'

    # Password from environment (required)
    password = os.environ.get('AKIPS_API_PASSWORD')

    if not password:
        print("ERROR: AKIPS_API_PASSWORD environment variable must be set", file=sys.stderr)
        sys.exit(1)

    return AKiPSClient(
        server=server,
        password=password,
        username=username,
        verify_ssl=verify_ssl
    )


def cmd_list_devices(args):
    """List devices in AKiPS"""
    client = get_client()
    devices = client.list_devices(pattern=args.pattern, group=args.group)
    print(json.dumps({'devices': devices}, indent=2))


def cmd_list_interfaces(args):
    """List interfaces on device(s)"""
    client = get_client()
    interfaces = client.list_interfaces(
        device=args.device,
        interface=args.interface,
        group=args.group
    )
    print(json.dumps({'interfaces': interfaces}, indent=2))


def cmd_get_device_info(args):
    """Get detailed information about a device"""
    client = get_client()
    info = client.get_device_info(args.device)
    print(json.dumps({'device': args.device, 'info': info}, indent=2))


def cmd_get_top_interfaces(args):
    """Get top N interfaces by traffic or utilization"""
    client = get_client()
    top = client.get_top_interfaces(
        n=args.n,
        time_filter=args.time_filter,
        attribute=args.attribute,
        device=args.device,
        child=args.child,
        group=args.group
    )
    print(json.dumps({'top_interfaces': top}, indent=2))


def cmd_get_events(args):
    """Get events from AKiPS"""
    client = get_client()
    events = client.get_events(
        event_type=args.event_type,
        time_filter=args.time_filter,
        device=args.device,
        child=args.child,
        attribute=args.attribute,
        group=args.group
    )
    print(json.dumps({'events': events}, indent=2))


def cmd_get_series_data(args):
    """Get time-series data"""
    client = get_client()
    series = client.get_series_data(
        interval=args.interval,
        time_filter=args.time_filter,
        attr_type=args.attr_type,
        device=args.device,
        child=args.child,
        attribute=args.attribute,
        group=args.group
    )
    print(json.dumps({'series_data': series}, indent=2))


def cmd_list_groups(args):
    """List available groups"""
    client = get_client()
    groups = client.list_groups(group_type=args.group_type)
    print(json.dumps({'groups': groups}, indent=2))


def cmd_execute(args):
    """Execute a raw AKiPS command"""
    client = get_client()
    result = client.execute_command(args.command)
    print(result)


def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        description='Query and monitor AKiPS network management systems',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )

    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    subparsers.required = True

    # list-devices command
    p = subparsers.add_parser('list-devices', help='List devices in AKiPS')
    p.add_argument('--pattern', default='*', help='Device name pattern (use * for all, or /regex/ for pattern)')
    p.add_argument('--group', help='Optional device group name to filter by')
    p.set_defaults(func=cmd_list_devices)

    # list-interfaces command
    p = subparsers.add_parser('list-interfaces', help='List interfaces on device(s)')
    p.add_argument('--device', default='*', help='Device name or pattern (default: *)')
    p.add_argument('--interface', default='*', help='Interface name or pattern (default: *)')
    p.add_argument('--group', help='Optional group name to filter by')
    p.set_defaults(func=cmd_list_interfaces)

    # get-device-info command
    p = subparsers.add_parser('get-device-info', help='Get detailed information about a specific device')
    p.add_argument('device', help='Device name')
    p.set_defaults(func=cmd_get_device_info)

    # get-top-interfaces command
    p = subparsers.add_parser('get-top-interfaces', help='Get top N interfaces by traffic or utilization')
    p.add_argument('n', type=int, help='Number of results to return')
    p.add_argument('--time-filter', default='yesterday', help='Time filter (e.g., yesterday, last1h, last24h, last7d)')
    p.add_argument('--attribute', default='/ifHC.*Octets/', help='Attribute to measure (e.g., /ifHCInOctets/, /ifHCOutOctets/)')
    p.add_argument('--device', default='*', help='Device name or pattern (default: * for all)')
    p.add_argument('--child', default='*', help='Interface/child pattern (default: * for all)')
    p.add_argument('--group', help='Optional group name to filter by')
    p.set_defaults(func=cmd_get_top_interfaces)

    # get-events command
    p = subparsers.add_parser('get-events', help='Get events from AKiPS')
    p.add_argument('event_type', choices=['all', 'critical', 'enum', 'threshold', 'uptime'],
                   help='Event type: all, critical, enum (status changes), threshold, or uptime')
    p.add_argument('time_filter', help='Time filter (e.g., last1h, last24h, yesterday, today)')
    p.add_argument('--device', default='*', help='Device pattern (default: *)')
    p.add_argument('--child', default='*', help='Child pattern (default: *)')
    p.add_argument('--attribute', default='*', help='Attribute pattern (default: *)')
    p.add_argument('--group', help='Optional group name to filter by')
    p.set_defaults(func=cmd_get_events)

    # get-series-data command
    p = subparsers.add_parser('get-series-data', help='Get time-series data for counters, gauges, or RTT')
    p.add_argument('interval', type=int, help='Interval in seconds (300=5min, 3600=1hr, 86400=1day)')
    p.add_argument('time_filter', help='Time filter (e.g., yesterday, last24h)')
    p.add_argument('attr_type', choices=['counter', 'gauge', 'rtt'], help='Attribute type')
    p.add_argument('--device', default='*', help='Device pattern (default: *)')
    p.add_argument('--child', default='*', help='Child pattern (default: *)')
    p.add_argument('--attribute', default='*', help='Attribute pattern (default: *)')
    p.add_argument('--group', help='Optional group name to filter by')
    p.set_defaults(func=cmd_get_series_data)

    # list-groups command
    p = subparsers.add_parser('list-groups', help='List available groups of a specific type')
    p.add_argument('--group-type', default='device', help='Type of group: device, interface, etc.')
    p.set_defaults(func=cmd_list_groups)

    # execute command
    p = subparsers.add_parser('execute', help='Execute a raw AKiPS command')
    p.add_argument('command', help='AKiPS command to execute (e.g., "mlist device *")')
    p.set_defaults(func=cmd_execute)

    args = parser.parse_args()

    try:
        args.func(args)
    except AKiPSError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
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


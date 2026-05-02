#!/usr/bin/env python3
"""
Robust Interface Status Parser
Template for parsing Cisco IOS 'show interfaces status' output

This parser demonstrates best practices learned from the Gi2/0/4 bug:
- Uses anchor-based positioning (status keyword)
- Handles variable-length descriptions
- Validates parsed results
- Provides diagnostic output

Usage:
    python3 robust_interface_parser.py <input_file>
"""

import sys
import re
from pathlib import Path
from collections import Counter


# Known status keywords (use as anchor points)
VALID_STATUSES = [
    'connected',
    'notconnect',
    'disabled',
    'err-disabled',
    'monitoring',
    'faulty',
    'inactive'
]


def parse_interface_status_line(line, debug=False):
    """
    Parse a line from 'show interfaces status' output.

    Uses anchor-based parsing to handle variable-length descriptions.

    Args:
        line: Raw line from command output
        debug: Print diagnostic information

    Returns:
        Dict with interface details, or None if line can't be parsed
    """
    original_line = line
    line = line.strip()

    # Skip empty lines and headers
    if not line or line.startswith('Port'):
        return None

    parts = line.split()

    # Minimum validation
    if len(parts) < 3:
        if debug:
            print(f"⚠️  Insufficient columns: {len(parts)} < 3")
        return None

    # Validate interface name format (Gi, Te, Fa, etc.)
    interface = parts[0]
    if not re.match(r'^[A-Z][a-z]{1,2}\d+/\d+(/\d+)?$', interface):
        if debug:
            print(f"⚠️  Invalid interface format: {interface}")
        return None

    # ANCHOR POINT: Find status keyword
    status = None
    status_idx = -1
    for i, part in enumerate(parts):
        if part in VALID_STATUSES:
            status = part
            status_idx = i
            break

    if status_idx == -1:
        if debug:
            print(f"⚠️  No valid status found in: {line}")
        return None

    # Extract fields relative to anchor
    # Description is everything between interface (0) and status
    if status_idx > 1:
        description = ' '.join(parts[1:status_idx])
    else:
        description = ''

    # VLAN is typically the next column after status
    vlan = parts[status_idx + 1] if status_idx + 1 < len(parts) else ''

    # Last 3 columns are typically: Duplex, Speed, Type
    port_type = parts[-1] if len(parts) >= 1 else ''
    speed = parts[-2] if len(parts) >= 2 else ''
    duplex = parts[-3] if len(parts) >= 3 else ''

    result = {
        'interface': interface,
        'description': description,
        'status': status,
        'vlan': vlan,
        'duplex': duplex,
        'speed': speed,
        'type': port_type,
        'raw_line': original_line
    }

    if debug:
        print(f"✓ Parsed: {interface:12} | status_idx={status_idx:2} | desc_len={len(description):2} | vlan={vlan:4}")

    return result


def parse_interface_status_file(filepath, debug=False):
    """Parse entire file of interface status output."""
    results = []
    skipped = []

    with open(filepath) as f:
        for line_num, line in enumerate(f, 1):
            result = parse_interface_status_line(line, debug=debug)
            if result:
                results.append(result)
            elif line.strip() and not line.startswith('Port'):
                skipped.append((line_num, line.strip()))

    return results, skipped


def validate_results(results, total_lines):
    """
    Validate parsing results and detect potential issues.

    Returns list of warning messages.
    """
    warnings = []

    # Check if we parsed a reasonable percentage
    parse_rate = len(results) / total_lines if total_lines > 0 else 0
    if parse_rate < 0.80:
        warnings.append(
            f"⚠️  Low parse rate: {len(results)}/{total_lines} ({parse_rate:.1%})"
        )

    # Check description distribution
    empty_desc = sum(1 for r in results if not r['description'])
    multi_word_desc = sum(1 for r in results if ' ' in r['description'])

    if empty_desc == len(results) and len(results) > 5:
        warnings.append(
            "⚠️  ALL descriptions are empty - parser may be broken"
        )

    # Check VLAN distribution
    vlan_dist = Counter(r['vlan'] for r in results)
    if len(vlan_dist) == 0:
        warnings.append("⚠️  No VLANs detected - check VLAN parsing")

    # Check status distribution
    status_dist = Counter(r['status'] for r in results)
    if len(status_dist) == 0:
        warnings.append("⚠️  No statuses detected - parser is broken")

    return warnings


def print_summary(results):
    """Print summary statistics."""
    print("\n" + "="*80)
    print("PARSING SUMMARY")
    print("="*80)
    print(f"Total interfaces parsed: {len(results)}")
    print()

    # Status distribution
    status_dist = Counter(r['status'] for r in results)
    print("Status Distribution:")
    for status, count in status_dist.most_common():
        print(f"  {status:20} {count:4} ports")
    print()

    # VLAN distribution (top 10)
    vlan_dist = Counter(r['vlan'] for r in results if r['vlan'] not in ['trunk', ''])
    if vlan_dist:
        print("Top 10 VLANs:")
        for vlan, count in vlan_dist.most_common(10):
            print(f"  VLAN {vlan:6} {count:4} ports")
        print()

    # Description statistics
    with_desc = sum(1 for r in results if r['description'])
    without_desc = len(results) - with_desc
    multi_word = sum(1 for r in results if ' ' in r['description'])
    print("Descriptions:")
    print(f"  With description:      {with_desc:4} ports")
    print(f"  Without description:   {without_desc:4} ports")
    print(f"  Multi-word desc:       {multi_word:4} ports")
    print()

    # Port type distribution
    type_dist = Counter(r['type'] for r in results)
    print("Port Types:")
    for ptype, count in type_dist.most_common():
        print(f"  {ptype:20} {count:4} ports")
    print()


def print_sample_results(results, n=5):
    """Print first and last N results for manual verification."""
    print("="*80)
    print(f"FIRST {n} PARSED RESULTS (Manual Verification)")
    print("="*80)
    for i, r in enumerate(results[:n], 1):
        print(f"\n{i}. {r['interface']}")
        print(f"   Description: '{r['description']}'")
        print(f"   Status:      {r['status']}")
        print(f"   VLAN:        {r['vlan']}")
        print(f"   Type:        {r['type']}")

    print("\n" + "="*80)
    print(f"LAST {n} PARSED RESULTS (Manual Verification)")
    print("="*80)
    for i, r in enumerate(results[-n:], len(results) - n + 1):
        print(f"\n{i}. {r['interface']}")
        print(f"   Description: '{r['description']}'")
        print(f"   Status:      {r['status']}")
        print(f"   VLAN:        {r['vlan']}")
        print(f"   Type:        {r['type']}")
    print()


def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <interface_status_file>")
        print()
        print("Example:")
        print(f"  {sys.argv[0]} switch1_interfaces_status.txt")
        sys.exit(1)

    filepath = Path(sys.argv[1])
    if not filepath.exists():
        print(f"Error: File not found: {filepath}")
        sys.exit(1)

    # Count total non-empty, non-header lines
    with open(filepath) as f:
        total_lines = sum(1 for line in f
                         if line.strip() and not line.startswith('Port'))

    print(f"\nParsing: {filepath}")
    print(f"Total lines to parse: {total_lines}")
    print()

    # Parse file
    debug = '--debug' in sys.argv
    results, skipped = parse_interface_status_file(filepath, debug=debug)

    # Validate results
    warnings = validate_results(results, total_lines)
    if warnings:
        print("\n" + "!"*80)
        print("VALIDATION WARNINGS")
        print("!"*80)
        for warning in warnings:
            print(warning)
        print()

    # Print summary
    print_summary(results)

    # Print samples for manual verification
    print_sample_results(results, n=3)

    # Report skipped lines
    if skipped:
        print("="*80)
        print(f"SKIPPED LINES ({len(skipped)})")
        print("="*80)
        for line_num, line in skipped[:10]:  # Show first 10
            print(f"  Line {line_num}: {line[:70]}")
        if len(skipped) > 10:
            print(f"  ... and {len(skipped) - 10} more")
        print()

    # Return success/failure
    if warnings:
        print("⚠️  Parsing completed with warnings - review results carefully")
        sys.exit(1)
    else:
        print("✓ Parsing completed successfully")
        sys.exit(0)


if __name__ == '__main__':
    main()

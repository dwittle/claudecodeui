#!/usr/bin/env python3
"""
AKiPS Graph Generator

Generate visual graphs from AKiPS time-series data
"""

import os
import sys
import json
import argparse
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from akips_client import AKiPSClient, AKiPSError


def parse_series_data(series_data: Dict[str, List[str]],
                      interval_seconds: int,
                      time_filter: str) -> List[Tuple[datetime, List[Tuple[str, List[float]]]]]:
    """
    Parse series data into plottable format

    Returns:
        List of (timestamp, [(label, values)]) tuples
    """
    if not series_data:
        return []

    # Determine number of data points from first series
    first_key = list(series_data.keys())[0]
    num_points = len(series_data[first_key])

    # Calculate timestamps based on interval and time filter
    now = datetime.now()
    timestamps = []
    for i in range(num_points - 1, -1, -1):
        timestamps.append(now - timedelta(seconds=interval_seconds * i))

    # Parse all series
    parsed_series = []
    for key, values in series_data.items():
        # Convert string values to floats, handling empty strings
        float_values = []
        for v in values:
            try:
                float_values.append(float(v) if v else 0.0)
            except ValueError:
                float_values.append(0.0)
        parsed_series.append((key, float_values))

    return list(zip(timestamps, [parsed_series] * len(timestamps)))


def format_bytes(bytes_val: float) -> str:
    """Format bytes into human-readable format"""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB', 'PB']:
        if bytes_val < 1024.0:
            return f"{bytes_val:.2f} {unit}"
        bytes_val /= 1024.0
    return f"{bytes_val:.2f} EB"


def format_bps(bps_val: float) -> str:
    """Format bits per second into human-readable format"""
    for unit in ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps']:
        if bps_val < 1000.0:
            return f"{bps_val:.2f} {unit}"
        bps_val /= 1000.0
    return f"{bps_val:.2f} Pbps"


def calculate_rate(bytes_values: List[float], interval_seconds: int) -> List[float]:
    """Calculate rate in bits per second from byte counters"""
    rates = []
    for bytes_val in bytes_values:
        # Convert bytes per interval to bits per second
        bits = bytes_val * 8
        bps = bits / interval_seconds
        rates.append(bps)
    return rates


def plot_series(series_data: Dict[str, List[str]],
                interval_seconds: int,
                time_filter: str,
                title: str = "AKiPS Time-Series Data",
                ylabel: str = "Value",
                output_file: Optional[str] = None,
                show_rate: bool = False,
                figsize: Tuple[int, int] = (14, 8),
                max_series: int = 10) -> None:
    """
    Create and display/save a graph from series data

    Args:
        series_data: Dictionary mapping series names to value lists
        interval_seconds: Interval between data points in seconds
        time_filter: Time filter used (for title)
        title: Graph title
        ylabel: Y-axis label
        output_file: Optional file path to save graph
        show_rate: Convert byte counters to rate (bps)
        figsize: Figure size (width, height) in inches
        max_series: Maximum number of series to plot
    """
    if not series_data:
        print("No data to plot")
        return

    # Limit number of series
    if len(series_data) > max_series:
        print(f"Warning: Limiting to first {max_series} series (out of {len(series_data)})")
        series_data = dict(list(series_data.items())[:max_series])

    # Calculate timestamps
    first_key = list(series_data.keys())[0]
    num_points = len(series_data[first_key])

    now = datetime.now()
    timestamps = []
    for i in range(num_points - 1, -1, -1):
        timestamps.append(now - timedelta(seconds=interval_seconds * i))

    # Create figure
    fig, ax = plt.subplots(figsize=figsize)

    # Plot each series
    for label, values_str in series_data.items():
        # Convert to floats
        values = []
        for v in values_str:
            try:
                values.append(float(v) if v else 0.0)
            except ValueError:
                values.append(0.0)

        # Convert to rate if requested
        if show_rate:
            values = calculate_rate(values, interval_seconds)

        # Plot
        ax.plot(timestamps, values, marker='o', markersize=3, label=label, linewidth=1.5)

    # Format x-axis
    ax.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M'))
    ax.xaxis.set_major_locator(mdates.AutoDateLocator())
    plt.xticks(rotation=45, ha='right')

    # Labels and title
    ax.set_xlabel('Time', fontsize=11, fontweight='bold')

    if show_rate:
        ax.set_ylabel('Rate (bps)', fontsize=11, fontweight='bold')
        # Format y-axis with bps units
        ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda y, _: format_bps(y)))
    else:
        ax.set_ylabel(ylabel, fontsize=11, fontweight='bold')
        # Try to auto-detect if values are bytes
        first_val = list(series_data.values())[0][0]
        try:
            if float(first_val) > 1000000:  # Likely bytes
                ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda y, _: format_bytes(y)))
        except:
            pass

    ax.set_title(f"{title}\n{time_filter} - {interval_seconds}s interval",
                 fontsize=13, fontweight='bold', pad=20)

    # Grid
    ax.grid(True, alpha=0.3, linestyle='--')

    # Legend
    if len(series_data) <= 15:
        ax.legend(bbox_to_anchor=(1.05, 1), loc='upper left', fontsize=8)
    else:
        print(f"Legend hidden (too many series: {len(series_data)})")

    # Layout
    plt.tight_layout()

    # Save or show
    if output_file:
        plt.savefig(output_file, dpi=150, bbox_inches='tight')
        print(f"Graph saved to: {output_file}")
    else:
        plt.show()


def get_client() -> AKiPSClient:
    """Create AKiPS client from environment variables"""
    server = os.environ.get('AKIPS_SERVER', 'akipsdcm0001.llnl.gov')
    username = os.environ.get('AKIPS_USERNAME', 'api-ro')
    verify_ssl = os.environ.get('AKIPS_VERIFY_SSL', 'false').lower() == 'true'
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


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description='Generate graphs from AKiPS time-series data',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Graph last 24 hours of traffic for all interfaces (5-min interval)
  %(prog)s 300 last24h counter --attribute "/ifHCInOctets/"

  # Graph specific device interface with rate conversion
  %(prog)s 900 last12h counter --device "router01" --child "GigabitEthernet0/1" --rate

  # Save graph to file
  %(prog)s 3600 yesterday counter --attribute "/ifHC.*Octets/" --output traffic.png

  # Graph top interfaces only (limit result set)
  %(prog)s 300 last6h counter --device "sw-core*" --max-series 5
"""
    )

    parser.add_argument('interval', type=int,
                        help='Interval in seconds (300=5min, 900=15min, 3600=1hr, 86400=1day)')
    parser.add_argument('time_filter',
                        help='Time filter (e.g., last1h, last24h, yesterday, today)')
    parser.add_argument('attr_type', choices=['counter', 'gauge', 'rtt'],
                        help='Attribute type')

    parser.add_argument('--device', default='*',
                        help='Device name or pattern (default: *)')
    parser.add_argument('--child', default='*',
                        help='Child/interface pattern (default: *)')
    parser.add_argument('--attribute', default='*',
                        help='Attribute pattern (default: *)')
    parser.add_argument('--group',
                        help='Optional group name to filter by')

    parser.add_argument('--title',
                        help='Graph title (auto-generated if not specified)')
    parser.add_argument('--ylabel', default='Value',
                        help='Y-axis label')
    parser.add_argument('--output', '-o',
                        help='Output file path (PNG, PDF, SVG supported)')
    parser.add_argument('--rate', '-r', action='store_true',
                        help='Convert byte counters to rate (bits per second)')
    parser.add_argument('--max-series', type=int, default=10,
                        help='Maximum number of series to plot (default: 10)')
    parser.add_argument('--width', type=int, default=14,
                        help='Graph width in inches (default: 14)')
    parser.add_argument('--height', type=int, default=8,
                        help='Graph height in inches (default: 8)')
    parser.add_argument('--from-json',
                        help='Read series data from JSON file instead of querying API')

    args = parser.parse_args()

    try:
        # Get series data
        if args.from_json:
            # Load from file
            print(f"Loading data from {args.from_json}...")
            with open(args.from_json, 'r') as f:
                data = json.load(f)
                series_data = data.get('series_data', data)
        else:
            # Query API
            print(f"Querying AKiPS for time-series data...")
            client = get_client()
            series_data = client.get_series_data(
                interval=args.interval,
                time_filter=args.time_filter,
                attr_type=args.attr_type,
                device=args.device,
                child=args.child,
                attribute=args.attribute,
                group=args.group
            )

        if not series_data:
            print("No data returned from query")
            sys.exit(1)

        print(f"Retrieved {len(series_data)} time-series")

        # Generate title if not provided
        if not args.title:
            title = f"{args.device} {args.child} {args.attribute}"
            if len(series_data) > 1:
                title = f"Multiple Series ({len(series_data)})"
        else:
            title = args.title

        # Create graph
        plot_series(
            series_data=series_data,
            interval_seconds=args.interval,
            time_filter=args.time_filter,
            title=title,
            ylabel=args.ylabel,
            output_file=args.output,
            show_rate=args.rate,
            figsize=(args.width, args.height),
            max_series=args.max_series
        )

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

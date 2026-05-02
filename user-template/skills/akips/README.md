# AKiPS CLI Tool

Direct command-line interface for querying AKiPS network management systems.

## Features

- List devices and interfaces
- Get device information (sysName, location, description, IPs)
- Find top interfaces by traffic/utilization
- Query events (interface status changes, threshold violations, uptime resets)
- Retrieve time-series data for counters, gauges, and RTT
- **Generate graphs from time-series data with automatic rate conversion**
- List device/interface groups
- Execute raw AKiPS commands for advanced queries
- JSON output for easy integration with other tools

## Installation

### Prerequisites

- Python 3.7 or higher
- Access to an AKiPS server
- API credentials (username and password)

### Quick Install (Recommended)

Use the provided `install.sh` script to automatically install the skill to any directory:

```bash
# Install to your home directory
./install.sh ~/

# Install to a specific project directory
./install.sh /path/to/your/project

# Install to current directory
./install.sh .
```

The script will:
- Create a `.claude/skills/akips` subdirectory in the target location
- Copy all necessary files
- Create and configure a virtual environment
- Install all dependencies automatically

After installation, the skill will be available at `<target>/.claude/skills/akips/`.

**Example for home directory:**
```bash
./install.sh ~/
cd ~/.claude/skills/akips
cp .env.example .env
# Edit .env with your credentials
./akips_cli.py list-devices
```

### Manual Setup

If you prefer manual installation or want to work directly from the repository:

1. Clone or download this repository

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

   Or if using a virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

3. Set the required API password environment variable:
   ```bash
   export AKIPS_API_PASSWORD=your-api-password-here
   ```

The tool uses these hardcoded defaults:
```bash
AKIPS_SERVER=akipsdcm0001.llnl.gov
AKIPS_USERNAME=api-ro
AKIPS_VERIFY_SSL=false
```

To override the defaults, create a `.env` file or set environment variables:
```bash
cp .env.example .env
# Edit .env to override defaults (optional)
export AKIPS_SERVER=your-custom-server.example.com
export AKIPS_USERNAME=api-ro
export AKIPS_VERIFY_SSL=true
```

**Security Note:** The password is intentionally NOT read from `.env` files and must be set as a shell environment variable.

## Usage

The CLI provides several commands for interacting with AKiPS:

### List Devices
```bash
./akips_cli.py list-devices [--pattern PATTERN] [--group GROUP]
```

Examples:
```bash
./akips_cli.py list-devices
./akips_cli.py list-devices --pattern "router*"
./akips_cli.py list-devices --group production
```

### List Interfaces
```bash
./akips_cli.py list-interfaces [--device DEVICE] [--interface INTERFACE] [--group GROUP]
```

Examples:
```bash
./akips_cli.py list-interfaces
./akips_cli.py list-interfaces --device "router01"
./akips_cli.py list-interfaces --device "*" --interface "GigabitEthernet*"
```

### Get Device Info
```bash
./akips_cli.py get-device-info DEVICE
```

Example:
```bash
./akips_cli.py get-device-info router01
```

### Get Top Interfaces
```bash
./akips_cli.py get-top-interfaces N [--time-filter FILTER] [--attribute ATTR] [--group GROUP]
```

Examples:
```bash
./akips_cli.py get-top-interfaces 10
./akips_cli.py get-top-interfaces 20 --time-filter last24h
./akips_cli.py get-top-interfaces 10 --attribute "/ifHCInOctets/"
```

### Get Events
```bash
./akips_cli.py get-events EVENT_TYPE TIME_FILTER [OPTIONS]
```

Event types: `all`, `critical`, `enum`, `threshold`, `uptime`

Examples:
```bash
./akips_cli.py get-events all last1h
./akips_cli.py get-events critical last24h --device "router*"
./akips_cli.py get-events enum today
```

### Get Series Data
```bash
./akips_cli.py get-series-data INTERVAL TIME_FILTER ATTR_TYPE [OPTIONS]
```

Attribute types: `counter`, `gauge`, `rtt`

Examples:
```bash
./akips_cli.py get-series-data 3600 yesterday counter
./akips_cli.py get-series-data 300 last24h counter --device "router01" --attribute "/ifHCInOctets/"
```

### List Groups
```bash
./akips_cli.py list-groups [--group-type TYPE]
```

Examples:
```bash
./akips_cli.py list-groups
./akips_cli.py list-groups --group-type interface
```

### Execute Raw Command
```bash
./akips_cli.py execute "COMMAND"
```

Examples:
```bash
./akips_cli.py execute "mlist device *"
./akips_cli.py execute "list device group"
```

## Graphing Time-Series Data

The `akips_graph.py` tool generates visual graphs from AKiPS time-series data with support for rate conversion, multiple series, and customization.

### Basic Usage
```bash
./akips_graph.py INTERVAL TIME_FILTER ATTR_TYPE [OPTIONS]
```

### Graph Options
- `--device DEVICE` - Filter by device name or pattern
- `--child CHILD` - Filter by interface/child pattern
- `--attribute ATTR` - Filter by attribute pattern
- `--rate, -r` - Convert byte counters to bits per second
- `--output FILE, -o FILE` - Save to file (PNG, PDF, SVG)
- `--title TITLE` - Custom graph title
- `--max-series N` - Limit number of series to plot (default: 10)
- `--width W` - Graph width in inches (default: 14)
- `--height H` - Graph height in inches (default: 8)

### Examples

**Graph interface traffic with rate conversion:**
```bash
./akips_graph.py 900 last12h counter \
  --device "mds-9706-san2" \
  --child "fc6/2" \
  --attribute "IF-MIB.ifHCInOctets" \
  --rate \
  --output traffic.png \
  --title "SAN Traffic - Last 12 Hours"
```

**Graph multiple interfaces (5-minute intervals):**
```bash
./akips_graph.py 300 last24h counter \
  --device "core-sw*" \
  --attribute "/ifHCInOctets/" \
  --rate \
  --max-series 5
```

**Graph hourly data for yesterday:**
```bash
./akips_graph.py 3600 yesterday counter \
  --attribute "/ifHC.*Octets/" \
  --output yesterday_traffic.png
```

**Graph from saved JSON data:**
```bash
# First save the data
./akips_cli.py get-series-data 900 last12h counter --device "router01" > data.json

# Then graph it
./akips_graph.py 900 last12h counter --from-json data.json --rate --output graph.png
```

### Features
- **Automatic rate conversion** - Convert byte counters to Gbps/Mbps automatically
- **Smart formatting** - Bytes displayed as GB/TB, rates as Gbps/Mbps
- **Time-based x-axis** - Properly formatted timestamps
- **Multiple series** - Plot up to 10 series by default (configurable)
- **Export formats** - Save as PNG, PDF, or SVG
- **Customizable** - Control size, colors, and labels

## Testing

Test the connection and basic functionality:
```bash
./test_connection.py
```

## Important Notes

### API Limitations

Based on comprehensive testing (see `docs/akips_critical.md`), be aware that:

- **NO `limit` parameter** - The AKiPS API does not support limiting results server-side. All filtering must be done client-side.
- **Only `total` and `avg` aggregations** - `max`, `min`, and `median` are NOT supported.
- **Group names must be exact** - Wildcards in group names don't work. Query available groups first.
- **Strict command syntax** - Follow the documented patterns exactly.

### Time Filters

Supported time filter formats:
- `last1h`, `last24h`, `last7d` (relative)
- `yesterday`, `today` (named periods)
- `thisweek`, `lastweek`, `thismonth`, `lastmonth` (periods)

### Regex Patterns

AKiPS supports regex patterns enclosed in `/`:
- `/.*sw.*/` - Substring matching
- `/^sw/` - Start anchor
- `/sw$/` - End anchor
- `/(sw|rtr)/` - Alternation

## Troubleshooting

### "ERROR: Unexpected token limit"
Remove any `limit` parameters from your query. The AKiPS API doesn't support this.

### "Invalid group name"
Group names must be exact matches. Use `akips_list_groups` to see available groups first.

### SSL Certificate Errors
SSL verification is disabled by default (`AKIPS_VERIFY_SSL=false`). If you need to enable SSL verification for production environments, set `AKIPS_VERIFY_SSL=true`.

## Documentation

See the `docs/` directory for comprehensive AKiPS API documentation:
- `akips_critical.md` - Critical findings and limitations
- `akips-docs.txt` - Full API reference

## Support

For issues with the skill itself, contact the maintainer.
For AKiPS API questions, consult the official AKiPS documentation.

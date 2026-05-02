# AKiPS Graph Generator - Quick Reference

Generate visual graphs from AKiPS time-series data.

## Installation

Matplotlib is required:
```bash
source .venv/bin/activate
pip install matplotlib
```

## Basic Syntax

```bash
./akips_graph.py INTERVAL TIME_FILTER ATTR_TYPE [OPTIONS]
```

## Common Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `INTERVAL` | Seconds between data points | `300` (5min), `900` (15min), `3600` (1hr) |
| `TIME_FILTER` | Time period | `last1h`, `last12h`, `last24h`, `yesterday` |
| `ATTR_TYPE` | Data type | `counter`, `gauge`, `rtt` |

## Filtering Options

```bash
--device DEVICE          Device name or pattern (default: *)
--child CHILD            Interface/child pattern (default: *)
--attribute ATTR         Attribute pattern (default: *)
--group GROUP            Filter by group name
```

## Output Options

```bash
--output FILE, -o        Save to file (PNG/PDF/SVG)
--title TITLE            Custom graph title
--rate, -r               Convert bytes to bits/second
--max-series N           Limit plotted series (default: 10)
--width W                Graph width in inches (default: 14)
--height H               Graph height in inches (default: 8)
```

## Examples

### Single Interface Traffic (15-min intervals, 12 hours)
```bash
./akips_graph.py 900 last12h counter \
  --device "mds-9706-san2" \
  --child "fc6/2" \
  --attribute "IF-MIB.ifHCInOctets" \
  --rate \
  --output san_traffic.png
```

### Multiple Interfaces (5-min intervals, 24 hours)
```bash
./akips_graph.py 300 last24h counter \
  --device "core-sw01" \
  --child "/Gi[0-9]/" \
  --attribute "/ifHCInOctets/" \
  --rate \
  --max-series 5 \
  --title "Core Switch - Top 5 Ports"
```

### Hourly Summary (1-hour intervals, yesterday)
```bash
./akips_graph.py 3600 yesterday counter \
  --attribute "/ifHC.*Octets/" \
  --device "router*" \
  --rate \
  --output yesterday_summary.png \
  --width 16 \
  --height 10
```

### All Devices - Specific Attribute
```bash
./akips_graph.py 900 last6h counter \
  --device "*" \
  --attribute "IF-MIB.ifHCInOctets" \
  --rate \
  --max-series 10 \
  --output top10_traffic.png
```

### From Saved JSON Data
```bash
# Save data first
./akips_cli.py get-series-data 900 last12h counter \
  --device "router01" \
  --attribute "/ifHCInOctets/" > data.json

# Graph later
./akips_graph.py 900 last12h counter \
  --from-json data.json \
  --rate \
  --output graph.png
```

### RTT/Latency Data
```bash
./akips_graph.py 300 last6h rtt \
  --device "router01" \
  --child "sys" \
  --attribute "SNMP.pingTime" \
  --output latency.png \
  --ylabel "RTT (ms)"
```

## Tips

### Rate Conversion
- Use `--rate` to convert byte counters to bits per second
- Automatically formats as Gbps, Mbps, Kbps
- Perfect for traffic graphs

### Pattern Matching
- Use `*` for wildcards: `core-sw*`, `*router*`
- Use `/regex/` for patterns: `/^sw[0-9]+/`, `/Gi[0-9]\/[0-9]/`
- Escape special characters in regex: `/fc6\/[0-9]/`

### Limiting Series
- Too many series makes graphs unreadable
- Use `--max-series` to limit (default: 10)
- Combine with specific patterns to filter first

### Time Intervals
| Interval | Seconds | Best For |
|----------|---------|----------|
| 5 min | 300 | Real-time monitoring (hours) |
| 15 min | 900 | Short-term analysis (12-24 hrs) |
| 1 hour | 3600 | Daily/weekly trends |
| 1 day | 86400 | Monthly trends |

### File Formats
- `.png` - Best for viewing, sharing (default)
- `.pdf` - Vector format, publication quality
- `.svg` - Vector format, web-friendly

## Troubleshooting

### No Data Returned
- Check device/interface names with `./akips_cli.py list-devices`
- Verify attribute exists with `./akips_cli.py execute "mget * DEVICE * *"`
- Try broader patterns first: `--device "*"`

### Too Many Series
- Use `--max-series N` to limit
- Filter with more specific patterns
- Graph subsets separately

### Graph Too Small/Large
- Adjust `--width` and `--height`
- Default is 14x8 inches (good for most cases)
- For presentations: 16x10 or 20x12

### Rate Conversion Issues
- Only use `--rate` with byte counters (ifHCInOctets, etc.)
- Don't use with gauges or RTT data
- Values divided by interval to get per-second rate

## Integration with Scripts

```bash
#!/bin/bash
# Generate daily traffic reports

DATE=$(date +%Y%m%d)
DEVICE="core-sw01"

./akips_graph.py 3600 yesterday counter \
  --device "$DEVICE" \
  --attribute "/ifHC.*Octets/" \
  --rate \
  --output "reports/${DEVICE}_${DATE}.png" \
  --title "$DEVICE Traffic Report - $(date -d yesterday +%Y-%m-%d)"
```

## Environment Variables

Same as `akips_cli.py`:
```bash
export AKIPS_API_PASSWORD=your-password
export AKIPS_SERVER=akips.example.com      # optional
export AKIPS_USERNAME=api-ro               # optional
export AKIPS_VERIFY_SSL=false              # optional
```

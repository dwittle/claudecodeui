#!/usr/bin/env python3
"""Test bastion host connection"""
import os
import sys
sys.path.insert(0, '/space/tucker28/code/python/skills/netswitch/.claude/skills/panos')

from panos_client import PanosClient

def log(msg):
    print(msg, flush=True)

# Get credentials from environment
panos_user = os.environ.get('PANOS_USERNAME')
panos_pass = os.environ.get('PANOS_PASSWORD')
bastion_user = os.environ.get('NETSWITCH_USERNAME')
bastion_pass = os.environ.get('NETSWITCH_PASSWORD')

log(f"PAN-OS Username: {panos_user}")
log(f"PAN-OS Password: {'***' if panos_pass else 'NOT SET'}")
log(f"Bastion Username: {bastion_user}")
log(f"Bastion Password: {'***' if bastion_pass else 'NOT SET'}")
log("")

log("Connecting to ngfw1-1-mgt through netprod0001...")
try:
    client = PanosClient(
        hostname='ngfw1-1-mgt',
        username=panos_user,
        password=panos_pass,
        timeout=60,
        bastion_host='netprod0001',
        bastion_username=bastion_user,
        bastion_password=bastion_pass
    )

    log("Connecting...")
    client.connect(debug=True)
    log("✓ Connected successfully!")

    log("\nExecuting: show system info")
    output = client.execute_command("show system info")
    log(output)

    client.disconnect()
    log("\n✓ Test complete!")

except Exception as e:
    log(f"\n✗ ERROR: {e}")
    import traceback
    traceback.log_exc()
    sys.exit(1)

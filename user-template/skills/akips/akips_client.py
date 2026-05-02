"""
AKiPS API Client Library

Handles HTTP communication with AKiPS servers and provides a clean interface
for executing AKiPS commands.
"""

import requests
import urllib.parse
from typing import Optional, Dict, Any, List
import logging
import warnings
import urllib3

# Suppress SSL warnings for HTTPS connections
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logger = logging.getLogger(__name__)


class AKiPSError(Exception):
    """Base exception for AKiPS client errors"""
    pass


class AKiPSClient:
    """Client for interacting with AKiPS API"""

    def __init__(self, server: str, password: str, username: str = "api-ro", verify_ssl: bool = True):
        """
        Initialize AKiPS client

        Args:
            server: AKiPS server hostname or IP (e.g., "akips.example.com")
            password: API password
            username: API username (default: api-ro for read-only)
            verify_ssl: Whether to verify SSL certificates
        """
        self.server = server.rstrip('/')
        self.password = password
        self.username = username
        self.verify_ssl = verify_ssl
        self.base_url = f"https://{self.server}"

    def _build_url(self, endpoint: str, params: Dict[str, Any]) -> str:
        """Build the full API URL with parameters"""
        # Add password to params
        params['password'] = self.password

        # Build query string
        query_parts = []
        for key, value in params.items():
            if value is not None:
                query_parts.append(f"{key}={urllib.parse.quote(str(value))}")

        query_string = ";".join(query_parts)
        return f"{self.base_url}/{endpoint}?{query_string}"

    def execute_command(self, command: str) -> str:
        """
        Execute an AKiPS command via the Config and Events API

        Args:
            command: AKiPS command to execute (e.g., "mlist device *")

        Returns:
            Command output as string

        Raises:
            AKiPSError: If the command fails or returns an error
        """
        url = self._build_url("api-db", {"cmds": command})

        try:
            response = requests.get(url, verify=self.verify_ssl, timeout=30)
            response.raise_for_status()

            result = response.text

            # Check for AKiPS error messages (status 200 but error in body)
            if result.startswith("ERROR:"):
                raise AKiPSError(f"AKiPS command error: {result}")

            return result

        except requests.RequestException as e:
            raise AKiPSError(f"HTTP request failed: {str(e)}")

    def list_devices(self, pattern: str = "*", group: Optional[str] = None) -> List[str]:
        """
        List devices matching pattern

        Args:
            pattern: Device name pattern (regex or wildcard)
            group: Optional device group filter

        Returns:
            List of device names
        """
        cmd = f"mlist device {pattern}"
        if group:
            cmd += f" any group {group}"

        result = self.execute_command(cmd)
        return [line.strip() for line in result.strip().split('\n') if line.strip()]

    def list_interfaces(self, device: str = "*", interface: str = "*", group: Optional[str] = None) -> List[str]:
        """
        List interfaces on device(s)

        Args:
            device: Device name or pattern
            interface: Interface name or pattern
            group: Optional group filter

        Returns:
            List of "device interface" strings
        """
        cmd = f"mlist interface {device} {interface}"
        if group:
            cmd += f" any group {group}"

        result = self.execute_command(cmd)
        return [line.strip() for line in result.strip().split('\n') if line.strip()]

    def get_device_info(self, device: str) -> Dict[str, str]:
        """
        Get basic information about a device

        Args:
            device: Device name

        Returns:
            Dictionary of device attributes
        """
        # Get system attributes for the device
        cmd = f"mget text {device} sys *"
        result = self.execute_command(cmd)

        info = {}
        for line in result.strip().split('\n'):
            if not line.strip():
                continue
            parts = line.split(' = ', 1)
            if len(parts) == 2:
                # Extract attribute name from "device child attribute"
                attr_parts = parts[0].strip().split()
                if len(attr_parts) >= 3:
                    attr_name = attr_parts[2]
                    info[attr_name] = parts[1].strip()

        return info

    def get_top_interfaces(self, n: int, time_filter: str, attribute: str,
                          device: str = "*", child: str = "*",
                          group: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get top N interfaces by traffic/utilization

        Args:
            n: Number of results to return
            time_filter: Time filter (e.g., "yesterday", "last1h")
            attribute: Attribute to measure (e.g., "/ifHCInOctets/")
            device: Device pattern (default: "*" for all)
            child: Interface/child pattern (default: "*" for all)
            group: Optional group filter

        Returns:
            List of dictionaries with interface info and values
        """
        cmd = f"top {n} total time {time_filter} counter {device} {child} {attribute}"
        if group:
            cmd += f" any group {group}"

        result = self.execute_command(cmd)

        interfaces = []
        for line in result.strip().split('\n'):
            if not line.strip():
                continue
            # Parse: "device interface attribute = value"
            parts = line.split(' = ', 1)
            if len(parts) == 2:
                left_parts = parts[0].strip().split()
                if len(left_parts) >= 3:
                    interfaces.append({
                        'device': left_parts[0],
                        'interface': left_parts[1],
                        'attribute': ' '.join(left_parts[2:]),
                        'value': parts[1].strip()
                    })

        return interfaces

    def get_events(self, event_type: str, time_filter: str,
                   device: str = "*", child: str = "*", attribute: str = "*",
                   group: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get events from AKiPS

        Args:
            event_type: Event type (all, critical, enum, threshold, uptime)
            time_filter: Time filter (e.g., "last1h", "yesterday")
            device: Device pattern
            child: Child pattern
            attribute: Attribute pattern
            group: Optional group filter

        Returns:
            List of event dictionaries
        """
        cmd = f"mget event {event_type} time {time_filter} {device} {child} {attribute}"
        if group:
            cmd += f" any group {group}"

        result = self.execute_command(cmd)

        events = []
        for line in result.strip().split('\n'):
            if not line.strip():
                continue
            parts = line.split(None, 6)  # Split on whitespace, max 7 parts
            if len(parts) >= 5:
                event = {
                    'timestamp': parts[0],
                    'device': parts[1],
                    'child': parts[2],
                    'attribute': parts[3],
                    'type': parts[4],
                    'details': ' '.join(parts[5:]) if len(parts) > 5 else ''
                }
                events.append(event)

        return events

    def get_series_data(self, interval: int, time_filter: str,
                       attr_type: str, device: str, child: str, attribute: str,
                       group: Optional[str] = None) -> Dict[str, List[str]]:
        """
        Get time-series data

        Args:
            interval: Interval in seconds (300, 3600, 86400)
            time_filter: Time filter (e.g., "yesterday", "last24h")
            attr_type: Attribute type (counter, gauge, rtt)
            device: Device pattern
            child: Child pattern
            attribute: Attribute pattern
            group: Optional group filter

        Returns:
            Dictionary mapping "device child attribute" to list of values
        """
        cmd = f"series interval total {interval} time {time_filter} {attr_type} {device} {child} {attribute}"
        if group:
            cmd += f" any group {group}"

        result = self.execute_command(cmd)

        series = {}
        for line in result.strip().split('\n'):
            if not line.strip():
                continue
            parts = line.split(' = ', 1)
            if len(parts) == 2:
                key = parts[0].strip()
                values = parts[1].strip().split(',')
                series[key] = values

        return series

    def list_groups(self, group_type: str = "device") -> List[str]:
        """
        List available groups

        Args:
            group_type: Type of group (device, interface, etc.)

        Returns:
            List of group names
        """
        cmd = f"list {group_type} group"
        result = self.execute_command(cmd)
        return [line.strip() for line in result.strip().split('\n') if line.strip()]

    def get_attribute_value(self, device: str, child: str, attribute: str) -> str:
        """
        Get a specific attribute value

        Args:
            device: Device name
            child: Child name
            attribute: Attribute name

        Returns:
            Attribute value as string
        """
        cmd = f"get {device} {child} {attribute}"
        return self.execute_command(cmd).strip()


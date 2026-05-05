#!/bin/bash
# Enable CPU controller delegation for user slice

set -e

echo "Enabling CPU controller for user slice..."

# Enable CPU controller in user.slice
echo "+cpu +cpuset" > /sys/fs/cgroup/user.slice/cgroup.subtree_control 2>/dev/null || true

# Enable CPU controller in user-25905.slice
echo "+cpu +cpuset" > /sys/fs/cgroup/user.slice/user-25905.slice/cgroup.subtree_control 2>/dev/null || true

echo "Checking if CPU is now available..."
cat /sys/fs/cgroup/user.slice/user-25905.slice/cgroup.subtree_control

echo "Done! CPU controller should now be available for containers."

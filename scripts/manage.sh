#!/usr/bin/env bash

# CloudCLI Management Script
# Manage the CloudCLI server and database

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored messages
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_section() {
    echo -e "\n${BLUE}===${NC} $1 ${BLUE}===${NC}\n"
}

# Get the project root directory (one level up from scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_PATH="${DATABASE_PATH:-$HOME/.cloudcli/auth.db}"

# Get podman storage paths from configuration
get_podman_storage_root() {
    if ! command -v jq &> /dev/null; then
        print_warning "jq is not installed. Cannot determine podman storage path."
        return 1
    fi
    podman info --format json 2>/dev/null | jq -r '.store.graphRoot' 2>/dev/null || echo ""
}

get_podman_volume_path() {
    if ! command -v jq &> /dev/null; then
        print_warning "jq is not installed. Cannot determine podman volume path."
        return 1
    fi
    podman info --format json 2>/dev/null | jq -r '.store.volumePath' 2>/dev/null || echo ""
}

# Function to check if server is running
is_server_running() {
    # Check for concurrently process or vite (more reliable than server/index.js)
    pgrep -f "concurrently.*npm run" > /dev/null 2>&1
}

# Function to start the server
start_server() {
    print_section "Starting CloudCLI Server"

    if is_server_running; then
        print_warning "Server is already running"
        return 0
    fi

    cd "$PROJECT_ROOT"
    print_info "Starting dev server..."
    npm run dev > /tmp/dev-server.log 2>&1 &

    # Wait for server to start
    for i in {1..10}; do
        sleep 1
        if is_server_running; then
            print_info "✓ Server started successfully"
            print_info "Frontend: http://localhost:5173/"
            print_info "Backend:  http://localhost:3001/"
            print_info "Logs:     tail -f /tmp/dev-server.log"
            return 0
        fi
    done

    print_error "Failed to start server. Check /tmp/dev-server.log for errors"
    return 1
}

# Function to stop worker containers
stop_containers() {
    print_section "Stopping Worker Containers"

    local containers=$(podman ps -q --filter "name=cloudcli-user" 2>/dev/null)

    if [ -z "$containers" ]; then
        print_warning "No worker containers running"
        return 0
    fi

    print_info "Stopping worker containers..."
    echo "$containers" | xargs podman stop 2>/dev/null || true

    sleep 2

    local still_running=$(podman ps -q --filter "name=cloudcli-user" 2>/dev/null)
    if [ -z "$still_running" ]; then
        print_info "✓ All worker containers stopped"
    else
        print_warning "Some containers still running. Trying force stop..."
        echo "$still_running" | xargs podman kill 2>/dev/null || true
        print_info "✓ Worker containers force stopped"
    fi
}

# Function to stop the server
stop_server() {
    local stop_containers_flag="$1"

    if [ "$stop_containers_flag" = "--containers-only" ]; then
        stop_containers
        return 0
    fi

    print_section "Stopping CloudCLI Gateway"

    if ! is_server_running; then
        print_warning "Gateway is not running"
    else
        print_info "Stopping gateway..."
        pkill -f "concurrently" || true
        pkill -f "server/index.js" || true
        pkill -f "vite" || true

        sleep 2

        if ! is_server_running; then
            print_info "✓ Gateway stopped successfully"
        else
            print_warning "Some processes may still be running. Trying force kill..."
            pkill -9 -f "server/index.js" || true
            pkill -9 -f "vite" || true
            print_info "✓ Gateway force stopped"
        fi
    fi

    if [ "$stop_containers_flag" = "--all" ]; then
        echo ""
        stop_containers
    fi
}

# Function to restart the server
restart_server() {
    local restart_flag="$1"
    print_section "Restarting CloudCLI Server"
    stop_server "$restart_flag"
    sleep 2
    start_server
}

# Function to check server status
status_server() {
    print_section "Gateway Status"

    if is_server_running; then
        print_info "✓ Gateway is running"
        echo ""
        print_info "Processes:"
        pgrep -fl "server/index.js|vite|concurrently" | sed 's/^/  /'
        echo ""
        print_info "URLs:"
        echo "  Frontend: http://localhost:5173/"
        echo "  Backend:  http://localhost:3001/"
    else
        print_warning "✗ Gateway is not running"
    fi

    echo ""
    print_section "Worker Container Status"

    local running=$(podman ps --filter "name=cloudcli-user" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | tail -n +2)
    local stopped=$(podman ps -a --filter "name=cloudcli-user" --filter "status=exited" --format "table {{.Names}}\t{{.Status}}" 2>/dev/null | tail -n +2)

    if [ -n "$running" ]; then
        print_info "Running containers:"
        echo "$running" | sed 's/^/  /'
    else
        print_warning "No running worker containers"
    fi

    if [ -n "$stopped" ]; then
        echo ""
        print_info "Stopped containers:"
        echo "$stopped" | sed 's/^/  /'
    fi
}

# Function to delete user database
delete_database() {
    print_section "Delete User Database and Volumes"

    local has_db=false
    if [ -f "$DB_PATH" ]; then
        has_db=true
    fi

    # Check for legacy database in source directory
    local legacy_db="$PROJECT_ROOT/server/database/auth.db"
    local has_legacy=false
    if [ -f "$legacy_db" ]; then
        has_legacy=true
    fi

    # Check for user volumes
    local volumes=$(podman volume ls --filter "name=cloudcli-data-user" -q 2>/dev/null)
    local has_volumes=false
    if [ -n "$volumes" ]; then
        has_volumes=true
    fi

    # Check for user networks
    local networks=$(podman network ls --filter "label=cloudcli.managed=true" --format "{{.Name}}" 2>/dev/null | grep -v "^podman$")
    local has_networks=false
    if [ -n "$networks" ]; then
        has_networks=true
    fi

    if ! $has_db && ! $has_legacy && ! $has_volumes && ! $has_networks; then
        print_warning "No database files, volumes, or networks found"
        return 0
    fi

    # Confirm deletion
    echo -e "${YELLOW}This will delete all users, containers, credentials, settings, and persistent data!${NC}"
    echo ""
    if $has_db || $has_legacy; then
        echo -e "Databases to delete:"
        if $has_db; then
            echo -e "  ${BLUE}$DB_PATH${NC}"
        fi
        if $has_legacy; then
            echo -e "  ${BLUE}$legacy_db${NC} (legacy)"
        fi
        echo ""
    fi
    if $has_volumes; then
        echo -e "User volumes to delete:"
        echo "$volumes" | sed 's/^/  /'
        echo ""
    fi
    if $has_networks; then
        echo -e "User networks to delete:"
        echo "$networks" | sed 's/^/  /'
        echo ""
    fi
    read -p "Are you sure? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        print_info "Cancelled"
        return 0
    fi

    # Stop server and containers if running
    if is_server_running; then
        print_info "Stopping server and containers first..."
        stop_server "--all"
        sleep 2
    fi

    # Delete primary database
    if $has_db; then
        print_info "Deleting primary database..."
        rm -f "$DB_PATH" "${DB_PATH}-wal" "${DB_PATH}-shm"
    fi

    # Delete legacy database
    if $has_legacy; then
        print_info "Deleting legacy database..."
        rm -f "$legacy_db" "${legacy_db}-wal" "${legacy_db}-shm"
    fi

    # Delete user volumes
    if $has_volumes; then
        print_info "Deleting user volumes..."
        echo "$volumes" | xargs podman volume rm -f 2>/dev/null || true
    fi

    # Delete user networks
    if $has_networks; then
        print_info "Deleting user networks..."
        echo "$networks" | xargs podman network rm 2>/dev/null || true
    fi

    print_info "✓ All databases, volumes, and networks deleted successfully"
    print_info "A fresh environment will be created on next server start"
}

# Function to list users (simple)
list_users() {
    if [ ! -f "$DB_PATH" ]; then
        print_warning "Database does not exist: $DB_PATH"
        print_info "No users found. Start the server to create the database."
        return 0
    fi

    local user_count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "0")

    if [ "$user_count" = "0" ]; then
        print_info "No users found"
        return 0
    fi

    print_section "Users ($user_count)"
    sqlite3 "$DB_PATH" "SELECT id, username, is_active, created_at FROM users;" 2>/dev/null | \
        awk -F'|' '{printf "  %-3s  %-20s  %-8s  %s\n", $1, $2, ($3 == 1 ? "active" : "inactive"), $4}' || \
        print_warning "Failed to query users table"
}

# Function to show database info
database_info() {
    print_section "Database Information"

    if [ ! -f "$DB_PATH" ]; then
        print_warning "Database does not exist: $DB_PATH"
        return 0
    fi

    print_info "Database path: $DB_PATH"
    print_info "Database size: $(du -h "$DB_PATH" | cut -f1)"
    echo ""

    print_info "Users:"
    sqlite3 "$DB_PATH" "SELECT id, username, is_active, created_at FROM users;" 2>/dev/null | \
        awk -F'|' '{printf "  ID: %-3s Username: %-20s Active: %-5s Created: %s\n", $1, $2, $3, $4}' || \
        print_warning "Failed to query users table"

    echo ""
    print_info "Containers:"
    sqlite3 "$DB_PATH" "SELECT user_id, container_name, status, internal_port FROM user_containers;" 2>/dev/null | \
        awk -F'|' '{printf "  User: %-3s Container: %-20s Status: %-10s Port: %s\n", $1, $2, $3, $4}' || \
        print_warning "Failed to query containers table"
}

# Function to remove a specific user
remove_user() {
    local username="$1"

    if [ -z "$username" ]; then
        print_error "Username is required"
        echo "Usage: $0 remove-user <username>"
        return 1
    fi

    print_section "Remove User: $username"

    # Check if database exists
    if [ ! -f "$DB_PATH" ]; then
        print_warning "Database does not exist: $DB_PATH"
        return 0
    fi

    # Get user ID from database
    local user_id=$(sqlite3 "$DB_PATH" "SELECT id FROM users WHERE username='$username';" 2>/dev/null)

    if [ -z "$user_id" ]; then
        print_warning "User '$username' not found in database"
        return 0
    fi

    # Find associated resources
    local container_name="cloudcli-user-${user_id}"
    local volume_name="cloudcli-data-user-${user_id}"
    local network_name="cloudcli-net-${user_id}"

    # Get podman storage paths
    local volume_path=$(get_podman_volume_path)
    local storage_dir=""
    if [ -n "$volume_path" ]; then
        storage_dir="${volume_path}/${volume_name}"
    fi

    # Check what exists
    local has_container=false
    local has_volume=false
    local has_network=false
    local has_storage=false

    if podman ps -a --filter "name=^${container_name}$" --format "{{.Names}}" 2>/dev/null | grep -q "^${container_name}$"; then
        has_container=true
    fi

    if podman volume ls --filter "name=^${volume_name}$" --format "{{.Name}}" 2>/dev/null | grep -q "^${volume_name}$"; then
        has_volume=true
    fi

    if podman network ls --filter "name=^${network_name}$" --format "{{.Name}}" 2>/dev/null | grep -q "^${network_name}$"; then
        has_network=true
    fi

    if [ -n "$storage_dir" ] && [ -d "$storage_dir" ]; then
        has_storage=true
    fi

    # Show what will be deleted
    echo -e "${YELLOW}This will delete all data for user: ${username} (ID: ${user_id})${NC}"
    echo ""
    echo "Resources to delete:"
    echo "  - Database entry: $username"
    if $has_container; then
        echo "  - Container: $container_name"
    fi
    if $has_volume; then
        echo "  - Volume: $volume_name"
    fi
    if $has_network; then
        echo "  - Network: $network_name"
    fi
    if $has_storage; then
        echo "  - Storage: $storage_dir"
    fi
    echo ""
    read -p "Are you sure? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        print_info "Cancelled"
        return 0
    fi

    # Stop and remove container
    if $has_container; then
        print_info "Stopping and removing container: $container_name"
        podman stop "$container_name" 2>/dev/null || true
        podman rm -f "$container_name" 2>/dev/null || true
    fi

    # Remove volume
    if $has_volume; then
        print_info "Removing volume: $volume_name"
        podman volume rm -f "$volume_name" 2>/dev/null || true
    fi

    # Remove network
    if $has_network; then
        print_info "Removing network: $network_name"
        podman network rm "$network_name" 2>/dev/null || true
    fi

    # Remove storage directory if it still exists
    if [ -n "$storage_dir" ] && [ -d "$storage_dir" ]; then
        print_info "Removing storage directory: $storage_dir"
        rm -rf "$storage_dir" 2>/dev/null || \
            print_warning "Failed to remove storage directory (may require elevated permissions)"
    fi

    # Remove from database
    print_info "Removing user from database..."
    sqlite3 "$DB_PATH" "DELETE FROM user_containers WHERE user_id=$user_id;" 2>/dev/null || true
    sqlite3 "$DB_PATH" "DELETE FROM users WHERE id=$user_id;" 2>/dev/null || true

    print_info "✓ User '$username' (ID: $user_id) removed successfully"
}

# Function to remove all users
remove_all_users() {
    print_section "Remove ALL Users"

    # Check if database exists
    if [ ! -f "$DB_PATH" ]; then
        print_warning "Database does not exist: $DB_PATH"
        return 0
    fi

    # Get count of users
    local user_count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "0")

    if [ "$user_count" = "0" ]; then
        print_warning "No users found in database"
        return 0
    fi

    # Get podman storage paths
    local volume_path=$(get_podman_volume_path)

    # Find all resources
    local containers=$(podman ps -a --filter "name=cloudcli-user" --format "{{.Names}}" 2>/dev/null)
    local volumes=$(podman volume ls --filter "name=cloudcli-data-user" --format "{{.Name}}" 2>/dev/null)
    local networks=$(podman network ls --filter "label=cloudcli.managed=true" --format "{{.Name}}" 2>/dev/null | grep -v "^podman$")
    local storage_dirs=""
    if [ -n "$volume_path" ]; then
        storage_dirs=$(ls -d "${volume_path}"/cloudcli-data-user-* 2>/dev/null || true)
    fi

    # Show what will be deleted
    echo -e "${RED}WARNING: This will delete ALL users and their data!${NC}"
    echo ""
    echo "Database users to delete: $user_count"
    if [ -n "$containers" ]; then
        echo "Containers to delete: $(echo "$containers" | wc -l)"
        echo "$containers" | sed 's/^/  - /'
    fi
    if [ -n "$volumes" ]; then
        echo ""
        echo "Volumes to delete: $(echo "$volumes" | wc -l)"
        echo "$volumes" | sed 's/^/  - /'
    fi
    if [ -n "$networks" ]; then
        echo ""
        echo "Networks to delete: $(echo "$networks" | wc -l)"
        echo "$networks" | sed 's/^/  - /'
    fi
    if [ -n "$storage_dirs" ]; then
        echo ""
        echo "Storage directories to delete: $(echo "$storage_dirs" | wc -l)"
        echo "$storage_dirs" | sed 's/^/  - /'
    fi
    echo ""
    read -p "Are you sure? Type 'DELETE ALL' to confirm: " confirm

    if [ "$confirm" != "DELETE ALL" ]; then
        print_info "Cancelled"
        return 0
    fi

    # Stop server if running
    if is_server_running; then
        print_info "Stopping server and containers first..."
        stop_server "--all"
        sleep 2
    fi

    # Stop and remove all containers
    if [ -n "$containers" ]; then
        print_info "Stopping and removing containers..."
        echo "$containers" | xargs podman stop 2>/dev/null || true
        echo "$containers" | xargs podman rm -f 2>/dev/null || true
    fi

    # Remove all volumes
    if [ -n "$volumes" ]; then
        print_info "Removing volumes..."
        echo "$volumes" | xargs podman volume rm -f 2>/dev/null || true
    fi

    # Remove all networks
    if [ -n "$networks" ]; then
        print_info "Removing networks..."
        echo "$networks" | xargs podman network rm 2>/dev/null || true
    fi

    # Remove storage directories
    if [ -n "$storage_dirs" ]; then
        print_info "Removing storage directories..."
        echo "$storage_dirs" | while read -r dir; do
            rm -rf "$dir" 2>/dev/null || \
                print_warning "Failed to remove $dir (may require elevated permissions)"
        done
    fi

    # Clear database tables
    print_info "Clearing database tables..."
    sqlite3 "$DB_PATH" "DELETE FROM user_containers;" 2>/dev/null || true
    sqlite3 "$DB_PATH" "DELETE FROM users;" 2>/dev/null || true

    print_info "✓ All users and their data removed successfully"
    print_info "Database file preserved but emptied. Use 'db-delete' to remove completely."
}

# Function to show help
show_help() {
    cat << EOF
CloudCLI Management Script

Usage: $0 <command> [options]

Commands:
  start                 Start the CloudCLI server
  stop [--all]          Stop the CloudCLI gateway (add --all to stop workers too)
  stop --containers     Stop worker containers only (leave gateway running)
  restart [--all]       Restart the CloudCLI gateway (add --all to restart workers)
  status                Show server and container status
  list-users            List all users (simple format)
  db-info               Show database information (detailed)
  db-delete             Delete the user database (requires confirmation)
  remove-user <name>    Remove a specific user and all their data
  remove-all-users      Remove ALL users and their data (requires confirmation)
  help                  Show this help message

Examples:
  $0 start              # Start the gateway server
  $0 stop               # Stop gateway only (workers keep running)
  $0 stop --all         # Stop gateway AND all worker containers
  $0 stop --containers  # Stop worker containers only
  $0 restart --all      # Restart gateway and stop all workers
  $0 status             # Show what's running
  $0 list-users         # List all users
  $0 db-info            # Show detailed database information
  $0 remove-user john   # Remove user 'john' and all their data
  $0 remove-all-users   # Remove ALL users (requires 'DELETE ALL' confirmation)
  $0 db-delete          # Delete all users and recreate fresh database

Environment Variables:
  DATABASE_PATH         Path to the database (default: ~/.cloudcli/auth.db)
EOF
}

# Main command handler
case "${1:-help}" in
    start)
        start_server
        ;;
    stop)
        if [ "$2" = "--all" ]; then
            stop_server "--all"
        elif [ "$2" = "--containers" ]; then
            stop_server "--containers-only"
        else
            stop_server
        fi
        ;;
    restart)
        if [ "$2" = "--all" ]; then
            restart_server "--all"
        else
            restart_server
        fi
        ;;
    status)
        status_server
        ;;
    list-users|users)
        list_users
        ;;
    db-info|info)
        database_info
        ;;
    db-delete|delete)
        delete_database
        ;;
    remove-user)
        remove_user "$2"
        ;;
    remove-all-users)
        remove_all_users
        ;;
    help|-h|--help)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac

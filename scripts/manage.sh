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
    print_section "Delete User Database"

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

    if ! $has_db && ! $has_legacy; then
        print_warning "No database files found"
        return 0
    fi

    # Confirm deletion
    echo -e "${YELLOW}This will delete all users, containers, credentials, and settings!${NC}"
    echo ""
    echo -e "Databases to delete:"
    if $has_db; then
        echo -e "  ${BLUE}$DB_PATH${NC}"
    fi
    if $has_legacy; then
        echo -e "  ${BLUE}$legacy_db${NC} (legacy)"
    fi
    echo ""
    read -p "Are you sure? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        print_info "Cancelled"
        return 0
    fi

    # Stop server if running
    if is_server_running; then
        print_info "Stopping server first..."
        stop_server
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

    if [ ! -f "$DB_PATH" ] && [ ! -f "$legacy_db" ]; then
        print_info "✓ All databases deleted successfully"
        print_info "A fresh database will be created on next server start"
    else
        print_error "Failed to delete some database files"
        return 1
    fi
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
  db-info               Show database information
  db-delete             Delete the user database (requires confirmation)
  help                  Show this help message

Examples:
  $0 start              # Start the gateway server
  $0 stop               # Stop gateway only (workers keep running)
  $0 stop --all         # Stop gateway AND all worker containers
  $0 stop --containers  # Stop worker containers only
  $0 restart --all      # Restart gateway and stop all workers
  $0 status             # Show what's running
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
    db-info|info)
        database_info
        ;;
    db-delete|delete)
        delete_database
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

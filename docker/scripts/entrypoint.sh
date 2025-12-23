#!/bin/sh
# Entrypoint script for Baileys Docker containers
# Handles initialization and graceful startup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to log messages
log() {
    echo "${GREEN}[Baileys]${NC} $1"
}

error() {
    echo "${RED}[Baileys ERROR]${NC} $1" >&2
}

warn() {
    echo "${YELLOW}[Baileys WARN]${NC} $1"
}

# Check if required directories exist
check_directories() {
    log "Checking required directories..."

    if [ ! -d "/app/baileys_auth_info" ]; then
        warn "Authentication directory not found, creating..."
        mkdir -p /app/baileys_auth_info
    fi

    if [ ! -d "/app/Media" ]; then
        warn "Media directory not found, creating..."
        mkdir -p /app/Media
    fi

    log "Directory check complete"
}

# Check if authentication state exists
check_auth_state() {
    if [ -f "/app/baileys_auth_info/creds.json" ]; then
        log "Found existing authentication state"
    else
        warn "No authentication state found - QR code will be displayed on first run"
    fi
}

# Wait for dependencies (if any)
wait_for_deps() {
    # Add any dependency checks here
    # Example: wait for database, redis, etc.
    log "Checking dependencies..."
}

# Main entrypoint logic
main() {
    log "Starting Baileys container..."
    log "Environment: ${NODE_ENV:-production}"

    check_directories
    check_auth_state
    wait_for_deps

    log "Initialization complete, starting application..."

    # Execute the command passed to docker run
    exec "$@"
}

# Run main function
main "$@"

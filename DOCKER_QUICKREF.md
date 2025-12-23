# Docker Quick Reference

Quick command reference for WhatsApp Baileys Device Toolkit Docker deployment.

## Initial Setup

```bash
# Copy environment template
cp .env.docker .env

# Edit configuration (set JWT_SECRET and ADMIN_PASSWORD)
nano .env

# Create auth directory
mkdir -p baileys_auth_info
```

## Common Commands

### Starting Services

```bash
# Start CLI (interactive)
docker-compose --profile cli run --rm baileys-cli

# Start Web UI (detached)
docker-compose --profile web up -d

# Start in foreground (see logs)
docker-compose --profile web up

# Start development mode
docker-compose -f docker-compose.dev.yml --profile web up
```

### Stopping Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (CAUTION!)
docker-compose down -v

# Stop specific service
docker-compose stop web-server
```

### Viewing Logs

```bash
# Follow all logs
docker-compose logs -f

# Follow specific service
docker-compose logs -f web-server

# Last 100 lines
docker-compose logs --tail=100 web-server

# Since specific time
docker-compose logs --since=10m
```

### Building and Updating

```bash
# Build all images
docker-compose build

# Build without cache
docker-compose build --no-cache

# Build specific service
docker-compose build web-server

# Pull latest and rebuild
git pull && docker-compose build && docker-compose --profile web up -d
```

### Container Management

```bash
# List containers
docker-compose ps

# Restart service
docker-compose restart web-server

# Execute command in container
docker-compose exec web-server sh

# View container resource usage
docker stats
```

### Volume Management

```bash
# List volumes
docker volume ls

# Inspect volume
docker volume inspect baileys-toolkit_baileys-auth

# Backup auth state
tar -czf auth-backup-$(date +%Y%m%d).tar.gz baileys_auth_info/

# Restore auth state
tar -xzf auth-backup-20231215.tar.gz
```

### Debugging

```bash
# Check container health
docker-compose ps

# View container details
docker inspect baileys-web-server

# Enter container shell
docker-compose exec web-server sh

# View environment variables
docker-compose exec web-server env

# Check network connectivity
docker network inspect baileys-frontend
```

### Cleanup

```bash
# Remove stopped containers
docker-compose rm

# Remove unused images
docker image prune

# Remove unused volumes (CAUTION!)
docker volume prune

# Complete cleanup (CAUTION!)
docker system prune -a
```

## Development Workflow

```bash
# Start development stack
docker-compose -f docker-compose.dev.yml --profile web up

# Watch server logs
docker-compose -f docker-compose.dev.yml logs -f web-server-dev

# Rebuild after dependency change
docker-compose -f docker-compose.dev.yml build web-server-dev
docker-compose -f docker-compose.dev.yml restart web-server-dev
```

## Production Deployment

```bash
# Build production images
docker-compose build

# Start production stack
docker-compose --profile web up -d

# Check health
docker-compose ps
docker-compose logs --tail=50

# Update to new version
git pull
docker-compose build
docker-compose --profile web up -d --no-deps web-server
```

## Troubleshooting

```bash
# Service won't start
docker-compose logs web-server
docker-compose ps

# Port conflicts
sudo lsof -i :3001
docker-compose down
docker-compose --profile web up -d

# Permission issues
sudo chown -R $(id -u):$(id -g) baileys_auth_info
chmod -R 755 baileys_auth_info

# Reset everything (CAUTION!)
docker-compose down -v
rm -rf baileys_auth_info/*
docker-compose --profile web up -d
```

## Environment Variables

Key variables in `.env`:

```bash
# Security (MUST CHANGE!)
JWT_SECRET=your-secret-here
ADMIN_PASSWORD=your-password-here

# Ports
HTTP_PORT=80
HTTPS_PORT=443

# Paths
AUTH_PATH=./baileys_auth_info

# CORS
CORS_ORIGIN=http://localhost
```

## Health Checks

```bash
# Check if services are healthy
curl http://localhost/health
curl http://localhost:3001/api/status

# View health check logs
docker inspect baileys-web-server | jq '.[0].State.Health'
```

## Backup Strategy

```bash
# Daily backup script
#!/bin/bash
DATE=$(date +%Y%m%d)
tar -czf backups/auth-$DATE.tar.gz baileys_auth_info/
find backups/ -name "auth-*.tar.gz" -mtime +7 -delete
```

## Quick URLs

- **Web UI**: http://localhost
- **API Status**: http://localhost:3001/api/status
- **Health Check**: http://localhost/health
- **Nginx Status**: http://localhost (should return 200)

## Getting Help

- Full documentation: [DOCKER.md](DOCKER.md)
- Web UI docs: [web-ui/README.md](web-ui/README.md)
- Issues: https://github.com/talbeerysec/WhatsApp-baileys-device-toolkit/issues

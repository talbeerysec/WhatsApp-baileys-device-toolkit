# Docker Deployment Guide for WhatsApp Baileys Device Toolkit

This guide covers everything you need to know about running the WhatsApp Baileys Device Toolkit using Docker.

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
  - [CLI Mode](#cli-mode)
  - [Web UI Mode](#web-ui-mode)
  - [Development Mode](#development-mode)
- [Configuration](#configuration)
- [Volumes and Data Persistence](#volumes-and-data-persistence)
- [Networking](#networking)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Production Deployment](#production-deployment)
- [Advanced Topics](#advanced-topics)

---

## Quick Start

### CLI Mode (Interactive Example)

```bash
# Build and run the CLI
docker-compose --profile cli up baileys-cli

# Or run directly with docker
docker build -t baileys-toolkit .
docker run -it \
  -v $(pwd)/baileys_auth_info:/app/baileys_auth_info \
  baileys-toolkit
```

### Web UI Mode (Full Stack)

```bash
# Copy environment configuration
cp .env.docker .env

# Edit .env and set your credentials
nano .env

# Build and start all services
docker-compose --profile web up -d

# View logs
docker-compose logs -f

# Access the web UI at http://localhost
```

---

## Architecture Overview

The Docker setup consists of multiple services:

### Production Stack (`docker-compose.yml`)

```
┌─────────────────────────────────────────────────┐
│                   Internet                       │
└───────────────────┬─────────────────────────────┘
                    │
                    ↓
            ┌───────────────┐
            │  Nginx (80)   │  Reverse Proxy
            └───────┬───────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ↓                       ↓
┌───────────────┐      ┌──────────────┐
│  Web Client   │      │ Web Server   │
│ (React/Vite)  │      │ (Express.js) │
│   Port 80     │      │  Port 3001   │
└───────────────┘      └──────┬───────┘
                              │
                              ↓
                    ┌──────────────────┐
                    │  Baileys Library │
                    │  (WhatsApp API)  │
                    └──────────────────┘
                              │
                              ↓
                    ┌──────────────────┐
                    │  Auth Storage    │
                    │   (Volume)       │
                    └──────────────────┘
```

### Components

1. **Baileys CLI** - Interactive command-line interface for direct WhatsApp interaction
2. **Web Server** - Express.js backend with Socket.io for real-time communication
3. **Web Client** - React frontend with Material-UI
4. **Nginx** - Reverse proxy and static file server
5. **Volumes** - Persistent storage for authentication and media

---

## Prerequisites

- **Docker** 20.10+ ([Install Docker](https://docs.docker.com/get-docker/))
- **Docker Compose** 2.0+ (included with Docker Desktop)
- **At least 2GB RAM** available for containers
- **10GB disk space** for images and data

### Verify Installation

```bash
docker --version
# Docker version 20.10.0 or higher

docker-compose --version
# Docker Compose version 2.0.0 or higher
```

---

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/talbeerysec/WhatsApp-baileys-device-toolkit.git
cd WhatsApp-baileys-device-toolkit
```

### 2. Configure Environment

```bash
# Copy the environment template
cp .env.docker .env

# Edit configuration
nano .env
```

**Important**: Change these values in `.env`:

```bash
JWT_SECRET=your-super-secret-jwt-key-here
ADMIN_PASSWORD=your-secure-password-here
```

### 3. Create Required Directories

```bash
# Create authentication storage directory
mkdir -p baileys_auth_info

# Create media storage directory
mkdir -p Media

# Set proper permissions (if needed)
chmod 755 baileys_auth_info Media
```

---

## Usage

### CLI Mode

Run the interactive CLI example:

```bash
# Start CLI container
docker-compose --profile cli run --rm baileys-cli

# Or with custom command
docker-compose --profile cli run --rm baileys-cli yarn example
```

**Available Commands in CLI:**

```
send <number> <message>          Send a message
sendimage <number> <file>        Send an image
silentping <number> <deviceId>   Send silent ping type 1
silentping2 <number> <deviceId>  Send silent ping type 2
# ... and more (see Example/example.ts)
```

**Stop CLI:**

Press `Ctrl+C` or type `exit`

---

### Web UI Mode

#### Start All Services

```bash
# Start in detached mode
docker-compose --profile web up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f web-server
```

#### Access Web Interface

Open your browser and navigate to:
- **Web UI**: http://localhost
- **API Direct**: http://localhost:3001/api/status

#### Default Credentials

- **Password**: Set in `.env` file (`ADMIN_PASSWORD`)

#### Stop Services

```bash
# Stop all services
docker-compose --profile web down

# Stop and remove volumes (CAUTION: This deletes auth state!)
docker-compose --profile web down -v
```

---

### Development Mode

Development mode includes hot-reload for rapid development.

#### Start Development Stack

```bash
# Build development images
docker-compose -f docker-compose.dev.yml build

# Start development services
docker-compose -f docker-compose.dev.yml --profile web up

# Or start specific service
docker-compose -f docker-compose.dev.yml up web-server-dev
```

#### Features

- **Hot Reload**: Source code changes trigger automatic reload
- **Debug Ports**: Node.js debugger exposed on port 9229
- **Development Tools**: Additional dev dependencies included
- **Source Maps**: Full TypeScript source maps enabled

#### Access Development Services

- **Frontend (Vite)**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **Debugger**: `chrome://inspect` or VS Code debugger

---

## Configuration

### Environment Variables

All configuration is done via `.env` file. See [.env.docker](.env.docker) for full options.

#### Essential Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | JWT signing secret | **MUST CHANGE** |
| `ADMIN_PASSWORD` | Web UI password | **MUST CHANGE** |
| `NODE_ENV` | Environment mode | `production` |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `AUTH_PATH` | Auth state directory | `./baileys_auth_info` |
| `HTTP_PORT` | Nginx HTTP port | `80` |
| `CORS_ORIGIN` | CORS allowed origin | `http://localhost` |

#### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HTTPS_PORT` | Nginx HTTPS port | `443` |
| `VITE_API_URL` | Frontend API URL | `http://localhost:3001` |
| `DATABASE_URL` | PostgreSQL connection | Not set |
| `REDIS_URL` | Redis connection | Not set |

### Docker Compose Profiles

Profiles allow running specific service groups:

```bash
# CLI only
docker-compose --profile cli up

# Web UI only
docker-compose --profile web up

# Both
docker-compose --profile cli --profile web up
```

---

## Volumes and Data Persistence

### Critical Volumes

#### 1. Authentication State (`baileys-auth`)

**Location**: `./baileys_auth_info`

**Contains**: WhatsApp session credentials, encryption keys

**⚠️ CRITICAL**: Loss of this data requires re-authentication via QR code

**Backup**:
```bash
# Backup authentication state
tar -czf baileys-auth-backup-$(date +%Y%m%d).tar.gz baileys_auth_info/

# Restore
tar -xzf baileys-auth-backup-YYYYMMDD.tar.gz
```

#### 2. Media Files (`baileys-media`)

**Location**: Docker named volume

**Contains**: Uploaded images, videos, documents

**Backup**:
```bash
# List volume location
docker volume inspect baileys-toolkit_baileys-media

# Backup using container
docker run --rm \
  -v baileys-toolkit_baileys-media:/data \
  -v $(pwd):/backup \
  alpine tar -czf /backup/media-backup.tar.gz -C /data .
```

#### 3. Application Logs (`baileys-logs`)

**Location**: Docker named volume

**Contains**: Application logs, error logs

**View Logs**:
```bash
# Real-time logs
docker-compose logs -f web-server

# Last 100 lines
docker-compose logs --tail=100 web-server
```

### Volume Management

```bash
# List all volumes
docker volume ls

# Inspect volume
docker volume inspect baileys-toolkit_baileys-auth

# Remove unused volumes (CAUTION!)
docker volume prune

# Remove specific volume
docker volume rm baileys-toolkit_baileys-media
```

---

## Networking

### Network Architecture

The Docker setup uses two isolated networks:

1. **baileys-frontend** - Public-facing network
   - Nginx
   - Web Client
   - Web Server (dual-homed)

2. **baileys-backend** - Internal network
   - Web Server (dual-homed)
   - Baileys Library
   - Future: Database, Redis

### Port Mapping

| Service | Internal Port | External Port | Purpose |
|---------|--------------|---------------|---------|
| Nginx | 80 | 80 | HTTP |
| Nginx | 443 | 443 | HTTPS (optional) |
| Web Server | 3001 | 3001 | API (optional) |
| Web Client Dev | 5173 | 5173 | Vite HMR (dev only) |

### Custom Ports

Edit `.env` to change external ports:

```bash
HTTP_PORT=8080
HTTPS_PORT=8443
```

Then restart:

```bash
docker-compose --profile web up -d
```

---

## Security

### Security Best Practices

#### 1. Change Default Credentials

**Before first run**, edit `.env`:

```bash
# Generate secure JWT secret
JWT_SECRET=$(openssl rand -base64 32)

# Set strong password
ADMIN_PASSWORD=your-strong-password-here
```

#### 2. Use HTTPS in Production

Generate SSL certificates:

```bash
# Create certificate directory
mkdir -p docker/nginx/certs

# Generate self-signed cert (for testing)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout docker/nginx/certs/key.pem \
  -out docker/nginx/certs/cert.pem

# For production, use Let's Encrypt
```

Uncomment HTTPS server block in `docker/nginx/default.conf`.

#### 3. Non-Root User

All containers run as non-root user `baileys` (UID 1001) for security.

#### 4. Network Isolation

Backend network is marked `internal: true` - no direct internet access.

#### 5. Read-Only Filesystems

Where possible, containers use read-only root filesystems.

### Security Headers

Nginx adds security headers automatically:
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: no-referrer-when-downgrade`

---

## Troubleshooting

### Common Issues

#### 1. Container Won't Start

**Symptoms**: Container exits immediately

**Check logs**:
```bash
docker-compose logs baileys-cli
```

**Common causes**:
- Missing environment variables
- Port already in use
- Insufficient memory

**Solutions**:
```bash
# Check port usage
sudo lsof -i :3001

# Check container status
docker-compose ps

# Rebuild without cache
docker-compose build --no-cache
```

#### 2. Cannot Connect to WhatsApp

**Symptoms**: QR code not displayed, authentication fails

**Solutions**:
```bash
# Remove old authentication
rm -rf baileys_auth_info/*

# Restart container
docker-compose --profile cli restart baileys-cli

# Check auth directory permissions
ls -la baileys_auth_info/
```

#### 3. Web UI Not Accessible

**Symptoms**: Cannot access http://localhost

**Check**:
```bash
# Verify nginx is running
docker-compose ps nginx

# Check nginx logs
docker-compose logs nginx

# Test backend directly
curl http://localhost:3001/api/status
```

**Solutions**:
```bash
# Restart nginx
docker-compose restart nginx

# Check network connectivity
docker network inspect baileys-frontend
```

#### 4. Permission Denied Errors

**Symptoms**: Cannot read/write files

**Solutions**:
```bash
# Fix ownership (Linux)
sudo chown -R $(id -u):$(id -g) baileys_auth_info Media

# Or change permissions
chmod -R 755 baileys_auth_info Media
```

#### 5. Out of Memory

**Symptoms**: Container killed by OOM

**Solutions**:

Add memory limits to `docker-compose.yml`:

```yaml
services:
  web-server:
    mem_limit: 512m
    mem_reservation: 256m
```

Or increase Docker daemon memory limit.

#### 6. Module Not Found: "make-in-memory-store.js"

**Symptoms**: Server fails to start with error:
```
Error: Cannot find module '../../../../lib/Store/make-in-memory-store.js'
```

**Cause**: Building Docker image from wrong directory (e.g., from `web-ui/` instead of project root)

**Solution**:

**ALWAYS build Docker images from the project root directory:**

```bash
# ✅ CORRECT - Build from project root
cd /path/to/WhatsApp-baileys-device-toolkit
docker build -t baileys-web-server -f web-ui/Dockerfile.server --target production .

# ❌ INCORRECT - Building from web-ui/ directory will fail
cd /path/to/WhatsApp-baileys-device-toolkit/web-ui
docker build -t baileys-web-server -f Dockerfile.server --target production .
```

**Why this happens**:
- The server code imports `makeInMemoryStore` from the parent project's `lib/Store/` directory
- The Dockerfile copies the parent's `lib/` directory at line 91
- Building from `web-ui/` means the parent `lib/Store/` is not accessible in the build context

**Verification**:
After building, verify the Store module is present in the image:

```bash
docker run --rm baileys-web-server ls -la /app/lib/Store/
```

You should see:
- `make-in-memory-store.js`
- `make-in-memory-store.d.ts`
- Other store-related files

**Using docker-compose**:
The `docker-compose.yml` file already has the correct build context set to `.` (project root), so this issue won't occur when using:
```bash
docker-compose --profile web build
```

### Debug Mode

Enable verbose logging:

```bash
# Edit .env
LOG_LEVEL=debug

# Restart services
docker-compose --profile web restart

# View detailed logs
docker-compose logs -f
```

### Health Checks

Check container health:

```bash
# View health status
docker-compose ps

# Inspect health check logs
docker inspect baileys-web-server | jq '.[0].State.Health'
```

### Interactive Shell Access

Enter running container:

```bash
# Web server
docker-compose exec web-server sh

# Baileys CLI
docker-compose exec baileys-cli sh

# Check processes
docker-compose exec web-server ps aux

# Check files
docker-compose exec web-server ls -la /app
```

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] Change `JWT_SECRET` to secure random value
- [ ] Set strong `ADMIN_PASSWORD`
- [ ] Configure SSL certificates
- [ ] Set `NODE_ENV=production`
- [ ] Configure proper `CORS_ORIGIN`
- [ ] Set up automated backups
- [ ] Configure log rotation
- [ ] Set resource limits
- [ ] Enable health checks
- [ ] Configure monitoring

### Deployment Steps

#### 1. Prepare Environment

```bash
# Production environment file
cp .env.docker .env.production

# Edit with production values
nano .env.production
```

#### 2. Build Production Images

```bash
# Build optimized images
docker-compose build --no-cache

# Tag for registry
docker tag baileys-toolkit:latest registry.example.com/baileys:v6.7.21
docker tag baileys-web-server:latest registry.example.com/baileys-web:v6.7.21
docker tag baileys-web-client:latest registry.example.com/baileys-ui:v6.7.21
```

#### 3. Push to Registry (Optional)

```bash
# Login to registry
docker login registry.example.com

# Push images
docker-compose push
```

#### 4. Deploy

```bash
# On production server
docker-compose --env-file .env.production --profile web up -d

# Verify deployment
docker-compose ps
docker-compose logs
```

#### 5. Set Up Monitoring

Use Docker health checks with monitoring tools:

```bash
# Example: Prometheus monitoring
# Add monitoring service to docker-compose.yml
```

### Automated Backups

Create backup script:

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="./backups"

mkdir -p "$BACKUP_DIR"

# Backup authentication state
tar -czf "$BACKUP_DIR/auth-$DATE.tar.gz" baileys_auth_info/

# Backup media
docker run --rm \
  -v baileys-toolkit_baileys-media:/data \
  -v $(pwd)/$BACKUP_DIR:/backup \
  alpine tar -czf /backup/media-$DATE.tar.gz -C /data .

# Keep only last 7 days
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

Schedule with cron:
```bash
0 2 * * * /path/to/backup.sh
```

### Updating

```bash
# Pull latest changes
git pull origin main

# Rebuild images
docker-compose build

# Restart with new images (zero-downtime)
docker-compose --profile web up -d --no-deps --build web-server

# Or full restart
docker-compose --profile web down
docker-compose --profile web up -d
```

---

## Advanced Topics

### Multi-Host Deployment

Use Docker Swarm or Kubernetes for multi-host:

```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.yml baileys
```

### External Database

Add PostgreSQL service:

```yaml
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: baileys
      POSTGRES_USER: baileys
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
```

Update `.env`:
```bash
DATABASE_URL=postgresql://baileys:${DB_PASSWORD}@postgres:5432/baileys
```

### Redis Caching

Add Redis service:

```yaml
services:
  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
```

Update `.env`:
```bash
REDIS_URL=redis://redis:6379
```

### Custom Domain

Configure nginx with your domain:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    # ... rest of config
}
```

Update `.env`:
```bash
CORS_ORIGIN=https://yourdomain.com
```

### CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: Docker Build

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build images
        run: docker-compose build
      - name: Push to registry
        run: docker-compose push
```

---

## Support

For issues and questions:

- **GitHub Issues**: https://github.com/talbeerysec/WhatsApp-baileys-device-toolkit/issues
- **Discussions**: https://github.com/talbeerysec/WhatsApp-baileys-device-toolkit/discussions

---

## License

This project is licensed under GPLv3. See [LICENSE](LICENSE) for details.

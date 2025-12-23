# Multi-stage Dockerfile for WhatsApp Baileys Device Toolkit
# Optimized for both development and production use

# ===================================
# Stage 1: Base Image with Dependencies
# ===================================
FROM node:22-alpine AS base

# Install system dependencies required for native modules
# - python3, make, g++: Required for node-gyp and libsignal compilation
# - git: Required for git dependencies
# - cairo, jpeg, pango, giflib, pixman: Required for canvas/image processing
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    curl \
    && ln -sf python3 /usr/bin/python

# Enable Corepack for Yarn 4.x support
RUN corepack enable && corepack prepare yarn@4.9.2 --activate

# Set working directory
WORKDIR /app

# Copy package manager files
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn

# ===================================
# Stage 2: Builder - Install and Build Everything
# ===================================
FROM base AS builder

# Copy source files
COPY src ./src
COPY WAProto ./WAProto
COPY Example ./Example
COPY tsconfig.json tsconfig.build.json ./
COPY engine-requirements.js ./

# Install dependencies
RUN yarn install --immutable

# Build the project (prepare script uses npm, so run yarn build explicitly)
RUN yarn build

# ===================================
# Stage 4: Production Runtime
# ===================================
FROM node:22-alpine AS production

# Install only runtime system dependencies
RUN apk add --no-cache \
    cairo \
    jpeg \
    pango \
    giflib \
    pixman \
    curl \
    tini

# Enable Corepack for Yarn 4.x support and prepare Yarn
RUN corepack enable && corepack prepare yarn@4.9.2 --activate

# Create non-root user for security
RUN addgroup -g 1001 -S baileys && \
    adduser -S -D -H -u 1001 -h /app -s /sbin/nologin -G baileys -g baileys baileys

# Create and set ownership of corepack cache directory before switching users
RUN mkdir -p /root/.cache && \
    mkdir -p /home/baileys/.cache && \
    cp -r /root/.cache/node /home/baileys/.cache/ 2>/dev/null || true && \
    chown -R baileys:baileys /home/baileys/.cache

WORKDIR /app

# Copy package files
COPY --chown=baileys:baileys package.json yarn.lock .yarnrc.yml ./
COPY --chown=baileys:baileys .yarn ./.yarn

# Copy node_modules from builder (already built with all dependencies)
COPY --from=builder --chown=baileys:baileys /app/node_modules ./node_modules

# Copy built artifacts from builder
COPY --from=builder --chown=baileys:baileys /app/lib ./lib
COPY --from=builder --chown=baileys:baileys /app/WAProto ./WAProto
COPY --from=builder --chown=baileys:baileys /app/engine-requirements.js ./
COPY --from=builder --chown=baileys:baileys /app/Example ./Example
# Copy src for tsx to compile example.ts which imports from src
COPY --from=builder --chown=baileys:baileys /app/src ./src

# Keep tsx in production for running the example
# Don't prune dev dependencies to keep tsx available
# RUN YARN_ENABLE_SCRIPTS=0 yarn workspaces focus --production && \
#     yarn cache clean

# Create directories for persistent data and corepack cache
RUN mkdir -p /app/baileys_auth_info /app/Media /app/.cache && \
    chown -R baileys:baileys /app/baileys_auth_info /app/Media /app/.cache

# Give baileys user write permission to /app for log files
RUN chown -R baileys:baileys /app

# Set environment variables
ENV NODE_ENV=production \
    LOG_LEVEL=info

# Switch to non-root user
USER baileys

# Expose no ports by default (CLI mode)
# Web UI components will expose ports in their own Dockerfiles

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "console.log('OK')" || exit 1

# Use tini as entrypoint for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Default command: run the interactive example
# Run tsx directly from node_modules bin
CMD ["./node_modules/.bin/tsx", "Example/example.ts"]

# ===================================
# Stage 5: Development
# ===================================
FROM dependencies AS development

# Install development tools
RUN apk add --no-cache \
    bash \
    vim

# Copy all source files for development
COPY . .

# Expose ports for debugging
EXPOSE 9229

# Set development environment
ENV NODE_ENV=development \
    LOG_LEVEL=debug

# Development command with watch mode
CMD ["yarn", "example"]

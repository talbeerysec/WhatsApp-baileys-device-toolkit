# Baileys Web UI

A modern web interface for the Baileys WhatsApp Web API library, providing a user-friendly dashboard to manage WhatsApp operations through a browser.

## Features

- 🌐 **Web Interface** - Modern React-based UI with Material Design
- 🔐 **Authentication** - Secure JWT-based authentication with QR code display
- 📱 **Real-time Updates** - Live connection status and message updates via Socket.io
- 💬 **Message Management** - Send messages, reactions, and device-specific communications
- 👥 **Contact & Chat Management** - View and manage chats and contacts
- 📟 **Device Control** - Device discovery and silent ping functionality
- 🎛️ **Presence Control** - Update presence status (typing, online, etc.)
- 🔧 **Developer Tools** - Advanced testing tools for protocol development
- 📊 **Dashboard** - Overview of connection status and statistics
- 🔄 **Session Management** - Automatic session reuse and QR code regeneration
- ⚡ **Enhanced Stability** - Improved connection handling and timeout management

## Architecture

```
web-ui/
├── server/          # Express.js backend with Socket.io
├── client/          # React frontend with Material-UI
├── shared/          # Shared TypeScript types
└── README.md        # This file
```

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Existing Baileys installation (this web UI integrates with your Baileys setup)

## Quick Start

### 1. Install Dependencies

From the `web-ui` directory:

```bash
# Install root dependencies
npm install

# Install all dependencies (server + client)
npm run install:all
```

### 2. Configure Environment

Copy the example environment file and configure:

```bash
cd server
cp .env.example .env
```

Edit `.env` file:
```env
PORT=3001
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
ADMIN_PASSWORD=admin123
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

### 3. Start Development Server

From the `web-ui` directory:

```bash
# Start both server and client in development mode
npm run dev
```

This will start:
- Backend server on http://localhost:3001
- Frontend client on http://localhost:5173

### 4. Access the Web Interface

1. Open your browser to http://localhost:5173
2. Login with the admin password (default: `admin123`)
3. The interface will connect to your existing Baileys WhatsApp session
4. If no existing session is found, scan the QR code displayed in the web interface

## Development

### Server Development

```bash
cd server
npm run dev    # Start with auto-reload
npm run build  # Build TypeScript
npm start      # Start production server
```

### Client Development

```bash
cd client
npm run dev     # Start development server
npm run build   # Build for production
npm run preview # Preview production build
```

### Full Stack Development

```bash
# From web-ui root directory
npm run dev           # Start both server and client
npm run build         # Build both server and client
npm run dev:server    # Server only
npm run dev:client    # Client only
```

## API Documentation

### Authentication
- `POST /api/auth/login` - Login with password
- `POST /api/auth/logout` - Logout
- `GET /api/auth/verify` - Verify token

### WhatsApp Operations
- `GET /api/status` - Get connection status
- `GET /api/chats` - List chats
- `GET /api/contacts` - List contacts
- `GET /api/devices/:user` - Get user devices
- `POST /api/messages/send` - Send message
- `POST /api/messages/device` - Send to specific device
- `POST /api/messages/react` - Send reaction
- `POST /api/messages/read` - Mark as read
- `POST /api/presence/update` - Update presence
- `POST /api/devices/ping` - Silent ping device

### Developer Tools (Admin Only)
- `POST /api/dev/corrupt-message` - Send corrupted message

## Socket.io Events

### Client → Server
- `request.chats` - Request chats update
- `request.contacts` - Request contacts update
- `request.status` - Request status update

### Server → Client
- `connection.status` - Connection status update
- `chats.update` - Chats list update
- `contacts.update` - Contacts list update
- `messages.upsert` - New messages
- `messages.update` - Message updates
- `qr` - QR code for authentication

## QR Code Authentication

The web interface provides seamless QR code authentication:

### Automatic Session Detection
- **Existing Sessions**: If valid WhatsApp authentication files exist, the interface connects automatically
- **Fresh Setup**: If no session is found, a QR code is displayed in the web interface
- **Session Recovery**: Clear sessions via the "Start Fresh Authentication" button

### QR Code Features
- **Real-time Generation**: QR codes are generated server-side and sent to clients via Socket.io
- **Automatic Refresh**: QR codes refresh every 60 seconds with improved timeout handling
- **Multiple Client Support**: New clients connecting receive the latest QR code immediately
- **Web-based Display**: QR codes appear in a modal dialog with scanning instructions

### Authentication Flow
1. **Session Check**: Server verifies existing authentication files
2. **QR Generation**: If needed, generates new QR code with 60-second timeout
3. **Real-time Delivery**: QR code sent to all connected web clients
4. **Scanning**: User scans QR code with WhatsApp mobile app
5. **Connection**: Successful scan establishes WhatsApp Web connection
6. **Session Storage**: Authentication data saved for future automatic connection

### Troubleshooting Authentication
- **QR Not Displaying**: Check browser console and ensure Socket.io connection is active
- **QR Expired**: QR codes auto-refresh; wait for new QR or refresh the page
- **Connection Loops**: Ensure WhatsApp Desktop app is closed to avoid conflicts
- **Clear Session**: Use "Start Fresh Authentication" if authentication is stuck

## Configuration

### Server Configuration

Edit `server/.env`:

```env
# Server port
PORT=3001

# JWT secret for authentication
JWT_SECRET=your-secret-key

# Admin password for web interface
ADMIN_PASSWORD=your-admin-password

# Environment
NODE_ENV=development

# CORS origin for client
CORS_ORIGIN=http://localhost:5173
```

### Client Configuration

The client automatically connects to the server. For custom configurations, create `client/.env`:

```env
# API server URL (optional, defaults to current host)
VITE_API_URL=http://localhost:3001
```

## Integration with Existing Baileys Setup

The web UI integrates with your existing Baileys WhatsApp session by:

1. **Sharing Auth State** - Uses the same `baileys_auth_info` directory
2. **Sharing Store** - Uses the same `baileys_store_multi.json` file
3. **Single Connection** - Manages one WhatsApp connection for both console and web UI

### Migration from Console UI

If you're currently using the console interface (`Example/example.ts`), the web UI will:

- Use your existing authentication
- Access your existing chats and contacts
- Maintain message history
- Provide the same functionality through a web interface

## Security Considerations

### Authentication
- JWT-based authentication with configurable secret
- Session timeout (2 hours by default)
- Admin-only access to developer tools

### Network Security
- CORS protection
- Request rate limiting
- Input validation and sanitization
- HTTPS support in production

### Data Protection
- No sensitive data logged
- WhatsApp credentials never exposed to frontend
- Secure session management

## Production Deployment

### Environment Setup

1. **Server Environment**:
```env
NODE_ENV=production
JWT_SECRET=your-secure-production-secret
ADMIN_PASSWORD=your-secure-admin-password
PORT=3001
```

2. **Build Applications**:
```bash
npm run build
```

3. **Start Production Server**:
```bash
npm start
```

### Reverse Proxy (Nginx)

Example Nginx configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Troubleshooting

### Common Issues

**1. Connection Refused**
- Ensure Baileys server is running
- Check port configuration
- Verify auth state directory exists

**2. Authentication Failed**
- Check admin password in `.env`
- Verify JWT secret is configured
- Clear browser local storage

**3. WhatsApp Not Connecting**
- Ensure only one Baileys instance is running
- Check auth state files permissions
- Verify QR code scanning (check browser console)
- Clear existing session with "Start Fresh Authentication" button
- Ensure WhatsApp Desktop app is closed (prevents connection conflicts)

**4. Socket Connection Issues**
- Check CORS configuration
- Verify WebSocket support
- Check firewall settings

**5. Contacts Showing Phone Numbers Instead of Names**

This is **expected behavior** due to WhatsApp protocol changes:

- **Individual contacts** sync WITHOUT names during history sync
- **Groups** sync WITH names during history sync
- Initial sync typically shows only ~18-20% of contacts with names
- Contact names populate **gradually** as contacts send you messages

**What you'll see:**
```
Total contacts: 578
With names: 106 (18%)
  - Groups: ~124 (have names)
  - Individuals: ~395 (show as phone numbers initially)
```

**How names populate:**
- When a contact sends you a message, their `pushName` is captured
- The UI automatically updates via `contacts.update` events
- Over time, active contacts will show names based on messaging activity

**This is NOT a bug** - it's how WhatsApp's protocol works. Names for individual contacts are no longer sent during initial history sync.

**6. Docker Build Fails with "Cannot find module make-in-memory-store.js"**

This error occurs when building the Docker image from the wrong directory:

**Problem:**
```
Error: Cannot find module '../../../../lib/Store/make-in-memory-store.js'
```

**Solution:**
- **ALWAYS build Docker images from the project root directory**, not from `web-ui/`
- The Dockerfile expects the parent `lib/Store/` directory to be available

**Correct build command:**
```bash
# From project root (WhatsApp-baileys-device-toolkit/)
docker build -t baileys-web-server -f web-ui/Dockerfile.server --target production .
```

**Incorrect (will fail):**
```bash
# From web-ui/ directory - this will NOT work
docker build -t baileys-web-server -f Dockerfile.server --target production .
```

**Why this happens:**
- The server code imports `makeInMemoryStore` from `../../../../lib/Store/make-in-memory-store.js`
- This path resolves to the parent project's `lib/Store/` directory
- Building from `web-ui/` directory means the parent `lib/Store/` is not accessible
- The Dockerfile at line 91 copies `/app/lib` which must include the Store subdirectory

**Verification:**
After building, verify the Store module is present:
```bash
docker run --rm your-image-name ls -la /app/lib/Store/
```

You should see:
- `make-in-memory-store.js`
- `make-in-memory-store.d.ts`
- Other store-related files

### Debug Mode

Enable debug logging:

```bash
# Server debug
cd server && DEBUG=* npm run dev

# Check browser console for client logs
```

### Port Conflicts

If default ports are in use:

1. **Change server port**: Edit `server/.env` `PORT` variable
2. **Change client port**: Edit `client/vite.config.ts` server port
3. **Update proxy**: Update client proxy configuration

## Recent Improvements

### v1.2.0 - December 2025 (Docker & Contact Sync)
- **Docker Support**: Complete Docker deployment with multi-stage builds
  - Development and production configurations
  - Health checks and proper signal handling with tini
  - Non-root user security hardening
  - Volume mounts for persistent auth storage
- **Full History Sync**: Enabled `syncFullHistory: true` in WhatsApp configuration
  - Populates contacts and chats from WhatsApp on authentication
  - Comprehensive logging of history sync events
  - Statistics tracking for contacts with/without names
- **Contact Filtering**: Improved contact list management
  - Filters out groups (`@g.us`) from individual contacts
  - Excludes broadcasts and linked devices
  - Only shows individual phone number contacts (`@s.whatsapp.net`)
- **Enhanced Contact Name Resolution**: Multi-source name fallback
  - Tries contact.name, contact.notify, contact.verifiedName
  - Falls back to formatted phone number extraction
  - Automatic updates via `contacts.update` events
- **Status Broadcast Filtering**: Removed `status@broadcast` from chats list
- **Improved Logging**: Detailed history sync debugging and statistics

### v1.1.0 - Enhanced QR Code & Stability
- **QR Code in Web Interface**: QR codes now display directly in the web browser instead of terminal
- **Automatic QR Delivery**: New clients receive latest QR code immediately upon connection
- **Improved Timeout Handling**: Extended QR timeout to 60 seconds with better reconnection logic
- **Session Management**: Enhanced detection and reuse of existing WhatsApp sessions
- **Connection Stability**: Better handling of WhatsApp Desktop conflicts and connection loops
- **Real-time Updates**: Improved Socket.io event handling for connection status
- **Relative Path Support**: More portable auth directory configuration

### Key Technical Improvements
- **Docker Architecture**: Multi-stage builds with separate client and server Dockerfiles
- **TypeScript Runtime**: Using tsx to run TypeScript directly in production (avoids compilation issues)
- **History Sync Logging**: Comprehensive logging of syncType, contacts, chats, and messages
- **QR Code Storage**: Latest QR codes stored in memory for new client connections
- **Enhanced Error Handling**: Better detection of connection replacement (WhatsApp Desktop conflicts)
- **Improved Reconnection**: Faster QR regeneration on timeout (2-second restart vs 5-second)
- **Material-UI Fixes**: Corrected icon imports for better UI stability
- **Path Resolution**: Relative auth directory paths for better project portability

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project follows the same license as the Baileys library.

## Support

For issues and questions:
1. Check this README and troubleshooting section
2. Review the browser console and server logs
3. Check existing GitHub issues
4. Create a new issue with detailed information

---

**⚠️ Important**: This web interface provides powerful WhatsApp automation capabilities. Use responsibly and in compliance with WhatsApp's Terms of Service.
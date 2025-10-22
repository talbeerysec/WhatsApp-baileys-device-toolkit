# Baileys Web UI - API Documentation

This document provides detailed API documentation for the Baileys Web UI server.

## Base URL

```
http://localhost:3001/api
```

## Authentication

All API endpoints (except authentication) require a JWT token in the Authorization header:

```http
Authorization: Bearer <your-jwt-token>
```

### Get Token

```http
POST /api/auth/login
Content-Type: application/json

{
  "password": "admin123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 7200
  }
}
```

## Endpoints

### Authentication

#### Login
- **POST** `/auth/login`
- **Body:** `{ "password": "string" }`
- **Response:** JWT token and expiration

#### Logout  
- **POST** `/auth/logout`
- **Headers:** Authorization required
- **Response:** Success message

#### Verify Token
- **GET** `/auth/verify`
- **Headers:** Authorization required  
- **Response:** Token validity and user info

### WhatsApp Status

#### Get Connection Status
- **GET** `/status`
- **Headers:** Authorization required
- **Response:**
```json
{
  "success": true,
  "data": {
    "state": "open|connecting|close",
    "isAuthenticated": true,
    "user": {
      "id": "1234567890@s.whatsapp.net",
      "name": "Your Name"
    },
    "lastUpdate": "2025-08-16T19:55:00.000Z"
  }
}
```

#### Clear Session
- **POST** `/status/clear-session`
- **Headers:** Authorization required
- **Response:** Success message

### Messages

#### Send Text Message
- **POST** `/messages/send`
- **Headers:** Authorization required
- **Body:**
```json
{
  "jid": "1234567890@s.whatsapp.net",
  "message": "Hello, World!"
}
```

#### Send Message to Specific Device
- **POST** `/messages/device`
- **Headers:** Authorization required
- **Body:**
```json
{
  "user": "1234567890",
  "deviceId": 0,
  "message": "Hello from device 0!"
}
```

#### Send Reaction
- **POST** `/messages/react`
- **Headers:** Authorization required
- **Body:**
```json
{
  "user": "1234567890@s.whatsapp.net",
  "messageId": "optional-message-id",
  "reaction": "👍"
}
```

#### Mark Messages as Read
- **POST** `/messages/read`
- **Headers:** Authorization required
- **Body:**
```json
{
  "jid": "1234567890@s.whatsapp.net"
}
```

### Chats

#### Get Chats List
- **GET** `/chats`
- **Headers:** Authorization required
- **Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "1234567890@s.whatsapp.net",
      "name": "Contact Name",
      "unreadCount": 2,
      "lastMessage": {
        "text": "Last message text",
        "timestamp": 1692123456789,
        "fromMe": false
      }
    }
  ]
}
```

### Contacts

#### Get Contacts List
- **GET** `/contacts`
- **Headers:** Authorization required
- **Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "1234567890@s.whatsapp.net",
      "name": "Contact Name",
      "notify": "Contact Display Name",
      "isBlocked": false
    }
  ]
}
```

### Devices

#### Get User Devices
- **GET** `/devices/:user`
- **Headers:** Authorization required
- **Parameters:** `user` - WhatsApp user ID (without @s.whatsapp.net)
- **Response:**
```json
{
  "success": true,
  "data": [
    {
      "user": "1234567890@s.whatsapp.net",
      "device": 0
    }
  ]
}
```

#### Silent Ping Device
- **POST** `/devices/ping`
- **Headers:** Authorization required
- **Body:**
```json
{
  "user": "1234567890",
  "deviceId": 0
}
```

### Presence

#### Update Presence Status
- **POST** `/presence/update`
- **Headers:** Authorization required
- **Body:**
```json
{
  "jid": "1234567890@s.whatsapp.net",
  "presence": "available|unavailable|composing|recording|paused"
}
```

### Developer Tools

#### Send Corrupted Message (Admin Only)
- **POST** `/dev/corrupt-message`
- **Headers:** Authorization required
- **Body:**
```json
{
  "user": "1234567890",
  "deviceId": 0,
  "message": "Test corrupted message"
}
```

## Socket.io Events

### Connection

Connect to the Socket.io server with authentication:

```javascript
const socket = io('http://localhost:3001', {
  auth: { token: 'your-jwt-token' }
});
```

### Client Events (Send to Server)

- `request.chats` - Request chats update
- `request.contacts` - Request contacts update  
- `request.status` - Request connection status update

### Server Events (Receive from Server)

- `connection.status` - Connection status updates
- `chats.update` - Updated chats list
- `contacts.update` - Updated contacts list
- `messages.upsert` - New messages received
- `messages.update` - Message status updates
- `qr` - QR code for WhatsApp authentication

### Example Socket Usage

```javascript
// Listen for connection status updates
socket.on('connection.status', (status) => {
  console.log('WhatsApp status:', status.state);
  if (status.user) {
    console.log('Logged in as:', status.user.name);
  }
});

// Listen for QR codes
socket.on('qr', (qrCode) => {
  console.log('Scan this QR code:', qrCode);
  // Display QR code to user
});

// Listen for new messages
socket.on('messages.upsert', (messageUpdate) => {
  console.log('New messages:', messageUpdate.messages);
});

// Request data updates
socket.emit('request.chats');
socket.emit('request.contacts');
```

## Error Handling

All API responses follow this format:

**Success Response:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional success message"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error description"
}
```

### Common HTTP Status Codes

- `200` - Success
- `400` - Bad Request (validation error)
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

### Common Error Messages

- `"Access token required"` - No Authorization header provided
- `"Invalid token"` - JWT token is invalid or expired
- `"WhatsApp not connected"` - WhatsApp connection not established
- `"Validation failed"` - Request body validation error
- `"Server configuration error"` - Missing environment variables

## Rate Limiting

The API is rate limited to 100 requests per 15 minutes per IP address.

## Development

For testing API endpoints during development:

```bash
# Get auth token
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"admin123"}'

# Use token in subsequent requests
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/status
```
# WhatsApp Message Types, Replies, and Errors - Complete Reference

This document provides a comprehensive overview of all WhatsApp message types, replies, status updates, and errors as implemented in the Baileys library.

## Table of Contents

1. [Message Types](#message-types)
2. [Message Receipt Types](#message-receipt-types)
3. [Message Status Types](#message-status-types)
4. [Presence Types](#presence-types)
5. [Connection States](#connection-states)
6. [Disconnect Reasons](#disconnect-reasons)
7. [Error Types](#error-types)
8. [Events](#events)
9. [Protocol Message Types](#protocol-message-types)

---

## Message Types

### Text Messages
- `conversation` - Simple text messages
- `extendedTextMessage` - Rich text with formatting, links, mentions

### Media Messages
- `imageMessage` - Images (JPEG, PNG)
- `videoMessage` - Videos (MP4, etc.)
- `audioMessage` - Audio files and voice notes
- `documentMessage` - Documents, PDFs, files
- `stickerMessage` - Stickers and animated stickers
- `contactMessage` - Contact cards (vCard)
- `contactsArrayMessage` - Multiple contacts
- `locationMessage` - Location sharing
- `liveLocationMessage` - Live location sharing

### Interactive Messages
- `pollMessage` - Poll with multiple options
- `reactionMessage` - Message reactions (emojis)
- `buttonsMessage` - Interactive buttons
- `buttonsResponseMessage` - Response to button interaction
- `listMessage` - List selection messages
- `listResponseMessage` - Response to list selection
- `templateMessage` - Template messages with buttons

### Business Messages
- `productMessage` - Product catalog items
- `orderMessage` - Order information
- `invoiceMessage` - Invoice messages

### System Messages
- `protocolMessage` - System protocol messages
- `ephemeralMessage` - Disappearing messages
- `viewOnceMessage` - View once media
- `groupInviteMessage` - Group invite links

### Advanced Messages
- `interactiveMessage` - Interactive message components
- `ptvMessage` - Video note messages
- `newsletterAdminInviteMessage` - Newsletter admin invites
- `botInvokeMessage` - Bot interactions
- `callLogMessage` - Call logs

---

## Message Receipt Types

These indicate the delivery status of messages:

- `'read'` - Message was read by recipient
- `'read-self'` - Message was read by sender (self)
- `'hist_sync'` - Historical message sync
- `'peer_msg'` - Peer message acknowledgment
- `'sender'` - Sender acknowledgment
- `'inactive'` - Inactive device receipt
- `'played'` - Media was played (audio/video)
- `undefined` - No specific receipt type

---

## Message Status Types

Based on `proto.WebMessageInfo.Status`:

- `PENDING = 0` - Message is pending
- `SERVER_ACK = 1` - Server acknowledged (sent)
- `DELIVERY_ACK = 2` - Delivered to device
- `READ = 3` - Read by recipient
- `PLAYED = 4` - Media played by recipient

---

## Presence Types

User presence status (`WAPresence`):

- `'available'` - User is online/available
- `'unavailable'` - User is offline
- `'composing'` - User is typing
- `'recording'` - User is recording audio
- `'paused'` - User paused typing

---

## Connection States

Connection status (`ConnectionState`):

- `'connecting'` - Establishing connection
- `'open'` - Connected and authenticated
- `'close'` - Connection closed

Additional properties:
- `isAuthenticated: boolean` - Whether user is authenticated
- `user?: { id: string; name: string }` - User information if authenticated
- `lastUpdate: string` - ISO timestamp of last update

---

## Disconnect Reasons

Reasons for connection termination (`DisconnectReason`):

- `connectionClosed = 428` - Connection was closed
- `connectionLost = 408` - Connection lost/timeout
- `connectionReplaced = 440` - Connection replaced by another session
- `timedOut = 408` - Operation timed out
- `loggedOut = 401` - User logged out
- `badSession = 400` - Invalid session
- `restartRequired = 515` - Client restart required
- `multideviceMismatch = 411` - Multi-device mismatch

---

## Error Types

### Boom Errors
All errors extend `@hapi/boom` for consistent error handling:

```javascript
{
  isBoom: true,
  isServer: boolean,
  output: {
    statusCode: number,
    payload: {
      statusCode: number,
      error: string,
      message: string
    }
  }
}
```

### Common Error Scenarios

1. **Authentication Errors**
   - Invalid credentials
   - Session expired
   - QR code timeout

2. **Connection Errors**
   - Network issues
   - WebSocket failures
   - Protocol mismatches

3. **Message Errors**
   - Encryption failures
   - Invalid recipients
   - Media upload failures

4. **Rate Limiting**
   - Too many requests
   - Spam detection

---

## Events

### Core Events (`BaileysEventMap`)

#### Connection Events
- `'connection.update'` - Connection state changes
- `'creds.update'` - Authentication credentials updated

#### Message Events
- `'messages.upsert'` - New messages received/sent
- `'messages.update'` - Message status updates
- `'messages.delete'` - Messages deleted
- `'messages.reaction'` - Message reactions
- `'message-receipt.update'` - Receipt status updates
- `'messages.media-update'` - Media download updates

#### Chat Events
- `'chats.upsert'` - New chats created
- `'chats.update'` - Chat information updated
- `'chats.delete'` - Chats deleted
- `'chats.phoneNumberShare'` - Phone number shared

#### Contact Events
- `'contacts.upsert'` - New contacts added
- `'contacts.update'` - Contact information updated

#### Group Events
- `'groups.upsert'` - New groups joined
- `'groups.update'` - Group metadata updated
- `'group-participants.update'` - Participant changes
- `'group.join-request'` - Join requests received

#### Presence Events
- `'presence.update'` - User presence status changes

#### Other Events
- `'call'` - Call events (incoming, outgoing)
- `'blocklist.set'` - Blocklist initialized
- `'blocklist.update'` - Blocklist updated
- `'labels.edit'` - Message labels edited
- `'labels.association'` - Label associations changed

---

## Protocol Message Types

Special system messages (`proto.Message.ProtocolMessage.Type`):

- `REVOKE = 0` - Message revocation (delete for everyone)
- `EPHEMERAL_SETTING = 3` - Disappearing messages setting
- `EPHEMERAL_SYNC_RESPONSE = 4` - Ephemeral sync response
- `HISTORY_SYNC_NOTIFICATION = 5` - History sync notification
- `APP_STATE_SYNC_KEY_SHARE = 6` - App state sync key sharing
- `APP_STATE_SYNC_KEY_REQUEST = 7` - App state sync key request
- `MSG_FANOUT_BACKFILL_REQUEST = 8` - Message backfill request
- `INITIAL_SECURITY_NOTIFICATION_SETTING_SYNC = 9` - Security settings sync
- `APP_STATE_FATAL_EXCEPTION_NOTIFICATION = 10` - Fatal exception notification
- `SHARE_PHONE_NUMBER = 11` - Phone number sharing
- `MESSAGE_EDIT = 14` - Message editing
- `PEER_DATA_OPERATION_REQUEST_MESSAGE = 16` - Peer data operations
- `PEER_DATA_OPERATION_REQUEST_RESPONSE_MESSAGE = 17` - Peer data response

---

## Message Content Examples

### Simple Text Message
```javascript
{
  text: "Hello World!"
}
```

### Text with Mentions
```javascript
{
  text: "Hello @user!",
  mentions: ["1234567890@s.whatsapp.net"]
}
```

### Image Message
```javascript
{
  image: Buffer.from(...), // or { url: "https://..." }
  caption: "Check this out!",
  jpegThumbnail: "base64-thumbnail"
}
```

### Location Message
```javascript
{
  location: {
    degreesLatitude: 37.7749,
    degreesLongitude: -122.4194,
    name: "San Francisco"
  }
}
```

### Poll Message
```javascript
{
  poll: {
    name: "What's your favorite color?",
    values: ["Red", "Blue", "Green"],
    selectableCount: 1
  }
}
```

### Reaction Message
```javascript
{
  react: {
    text: "👍", // emoji or empty string to remove
    key: messageKey // key of message to react to
  }
}
```

---

## Status Code Reference

### HTTP-like Status Codes Used
- `200` - Success
- `400` - Bad request/Invalid session
- `401` - Unauthorized/Logged out
- `408` - Request timeout
- `411` - Multi-device mismatch
- `428` - Connection closed
- `440` - Connection replaced
- `515` - Restart required

---

## Best Practices

1. **Error Handling**: Always check for `isBoom` property and handle different error types appropriately
2. **Message Status**: Monitor `messages.update` events for delivery confirmations
3. **Connection Management**: Handle connection state changes gracefully
4. **Rate Limiting**: Implement delays between message sends to avoid rate limits
5. **Media Messages**: Always provide proper MIME types and handle upload failures
6. **Presence Updates**: Use presence sparingly to avoid excessive API calls
7. **Group Operations**: Check admin permissions before performing group modifications

---

This reference covers all major WhatsApp message types, status indicators, and error conditions as implemented in Baileys. For specific implementation details, refer to the TypeScript definitions in the `src/Types/` directory.
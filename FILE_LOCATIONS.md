# File Locations Summary

## Frontend (React Components & Services)

### Device Screen Component
- **File**: `web-ui/client/src/pages/DevicesPage.tsx`
- **Purpose**: Main UI for device discovery and ping management
- **Key Components**:
  - Device discovery form (Get Devices button)
  - Device list table with status indicators
  - Ping test buttons (11 different ping types)
  - Fingerprinting buttons (for OS/type detection)
  - Profile All button for batch operations
  - Ping results list (collapsible)

### API Service Client
- **File**: `web-ui/client/src/services/api.ts`
- **Purpose**: HTTP client for backend API communication
- **Key Methods**:
  - `getDevices(user)` - GET /api/devices/:user
  - `silentPing(request)` - POST /api/devices/ping
  - `sendToDevice(request)` - POST /api/messages/device

### Socket Context
- **File**: `web-ui/client/src/contexts/SocketContext.ts`
- **Purpose**: WebSocket connection management
- **Events**:
  - Listens for `ping.result` events from backend

---

## Backend (Server Routes & Services)

### Devices Routes
- **File**: `web-ui/server/src/routes/devices.ts`
- **Endpoints**:
  - `GET /api/devices/:user` - Discover devices
  - `POST /api/devices/ping` - Send silent ping

### Messages Routes
- **File**: `web-ui/server/src/routes/messages.ts`
- **Endpoints**:
  - `POST /api/messages/send` - Send to JID
  - `POST /api/messages/device` - Send to specific device
  - `POST /api/messages/react` - Send reaction
  - `POST /api/messages/read` - Mark as read

### WhatsApp Service
- **File**: `web-ui/server/src/services/whatsapp.ts`
- **Key Methods**:
  - `getDevices(user)` - Fetch devices using getUSyncDevices()
  - `silentPing(user, deviceId, type)` - Main ping implementation
  - `sendMessageToDevice(user, deviceId, message)` - Device-specific messaging
  - `handleMessagesUpdate()` - Receipt tracking and ping result emission
- **Internal Data Structures**:
  - `pendingSilentPings: Map<messageId, PendingSilentPing>` - Tracks ongoing pings

### Socket Service
- **File**: `web-ui/server/src/services/socket.ts`
- **Purpose**: WebSocket event bridge between backend and frontend

---

## Shared Types

### API Types
- **File**: `web-ui/shared/types/api.ts`
- **Key Types**:
  - `DeviceInfo` - Device representation {user, device}
  - `DeviceStatus` - Status tracking {user, deviceId, status, fingerprint}
  - `SilentPingRequest` - Request payload {user, deviceId, type}
  - `SilentPingResult` - Response payload {user, deviceId, status, roundTripTime}

---

## Baileys Library Integration

### Main Library
- **Location**: `lib/` (compiled)
- **Source**: `src/` (TypeScript source)

### Key Functions Used
- `makeWASocket()` - Create WhatsApp socket
- `generateMessageIDV2()` - Generate message IDs
- `generateWAMessageFromContent()` - Create WAMessage objects
- `getUSyncDevices([jid], useCache, ignoreZeroDevices)` - Discover devices
- `relayMessage(jid, message, options)` - Send with device targeting
- `sendPresenceUpdate()` - Update presence
- `readMessages()` - Mark as read

---

## Configuration Files

### Environment
- **Server**: `web-ui/server/.env`
- **Client**: `web-ui/client/.env`

### Auth State
- **Storage**: `baileys_auth_info/`
- **Files**: creds.json, keys/ (encrypted Signal keys)

### Message Store
- **File**: `baileys_store_multi.json`
- **Purpose**: In-memory store for messages, chats, contacts

---

## Data Flow Diagram

```
┌─────────────────────────┐
│   DevicesPage.tsx       │  ← Frontend React Component
│  (Device UI & Events)   │
└───────────┬─────────────┘
            │
            ├─ ApiService.getDevices()
            │  └─ GET /api/devices/:user
            │     └─ devices.ts route
            │        └─ WhatsAppService.getDevices()
            │           └─ socket.getUSyncDevices()
            │              └─ WhatsApp servers
            │
            └─ ApiService.silentPing()
               └─ POST /api/devices/ping
                  └─ devices.ts route
                     └─ WhatsAppService.silentPing()
                        1. Generate messageIds
                        2. Create ping message (type-specific)
                        3. Set 30s timeout
                        4. Track in pendingSilentPings map
                        5. relayMessage(jid, message, {
                             participant: {
                               jid: deviceSpecificJid
                             }
                           })
                           └─ WhatsApp servers
                              └─ messages.update event
                                 └─ handleMessagesUpdate()
                                    └─ Check pendingSilentPings
                                       └─ Emit 'ping.result' event
                                          └─ WebSocket to frontend
                                             └─ socket.on('ping.result')
                                                └─ Update DeviceStatus map
                                                   └─ Re-render UI
```

---

## Key Code Snippets Location Reference

### Device-Specific JID Generation
- **File**: `web-ui/server/src/services/whatsapp.ts`
- **Line**: ~399 (sendMessageToDevice) & ~551 (silentPing)
- **Code**: `deviceSpecificJid = user:${deviceId}@s.whatsapp.net`

### Ping Message Creation
- **File**: `web-ui/server/src/services/whatsapp.ts`
- **Lines**:
  - Reaction: 818-829
  - Delete: 588-610
  - Call-Reject: 626-661
  - Edit: 611-625
  - Unknown: 663-682
  - Poll Response: 683-705
  - Button Response: 706-725
  - Device Sent: 726-743
  - App State: 744-759
  - Peer Data: 760-785
  - Malformed: 786-816

### Receipt Tracking & Status Mapping
- **File**: `web-ui/server/src/services/whatsapp.ts`
- **Lines**: 271-321 (handleMessagesUpdate method)
- **Status Codes**:
  - 0: failed
  - 1: sent
  - 2: ack
  - 3: delivered
  - 4-5: read

### Device Fingerprinting Logic
- **File**: `web-ui/client/src/pages/DevicesPage.tsx`
- **Lines**: 199-264 (handlePingResult in useEffect)
- **Primary Device Detection**: 241-250
- **Secondary Device Detection**: 253-264

### Profile All Implementation
- **File**: `web-ui/client/src/pages/DevicesPage.tsx`
- **Lines**: 334-443 (profileAllDevices method)
- **Steps**:
  1. Register event handler: 376-384
  2. Send reaction pings: 386-402
  3. Wait for responses: 409-427
  4. Cleanup: 429-432

---

## Key Classes & Interfaces

### WhatsAppService
- **File**: `web-ui/server/src/services/whatsapp.ts`
- **Type**: EventEmitter
- **Properties**:
  - `sock`: WASocket instance
  - `pendingSilentPings`: Map<string, PendingSilentPing>
  - `connectionStatus`: ConnectionStatus
  - `store`: In-memory message/chat store

### PendingSilentPing Interface
- **File**: `web-ui/server/src/services/whatsapp.ts`
- **Line**: 23-29
- **Properties**:
  - user, deviceId, timestamp, timeoutId, type

### DeviceStatus Interface
- **File**: `web-ui/shared/types/api.ts`
- **Line**: 54-68
- **Properties**:
  - status, lastCheck, responseTime, fingerprint

---

## Important Constants

### Ping Timeout
- **Value**: 30 seconds
- **File**: `web-ui/server/src/services/whatsapp.ts`
- **Line**: 575

### Profile All Timeout
- **Value**: 35 seconds
- **File**: `web-ui/client/src/pages/DevicesPage.tsx`
- **Line**: 345

### Staggered Ping Delay
- **Value**: 200ms between devices
- **File**: `web-ui/client/src/pages/DevicesPage.tsx`
- **Line**: 392 & 392 (in profileAllDevices)

### WebSocket Event Names
- **ping.result**: Ping response from backend
- **connection.status**: Connection state changes
- **messages.update**: Message/receipt updates

---

## Protocol Message Types Used

### protocolMessage.type values
- 0: REVOKE (for delete ping)
- 14: MESSAGE_EDIT (for edit ping)
- 22: CALL_LOG_MESSAGE (for call-reject ping)
- 101: NON-EXISTENT (for unknown ping)

### Message Content Types
- reactionMessage: For reaction ping
- pollUpdateMessage: For poll response ping
- buttonsResponseMessage: For button response ping
- deviceSentMessage: For device coordination ping
- appStateFatalExceptionNotification: For app state ping
- peerDataOperationRequestMessage: For peer data ping

---

## Cleanup & Teardown

### Event Listener Cleanup
- **File**: `web-ui/client/src/pages/DevicesPage.tsx`
- **Line**: 288-290 (useEffect cleanup)
- **Code**: `socket.off('ping.result', handlePingResult)`

### Ping Timeout Cleanup
- **File**: `web-ui/server/src/services/whatsapp.ts`
- **Lines**: 312-316 (conditional cleanup based on status)
- **Lines**: 857-860 (error cleanup)

### Cleanup Conditions
```
Delete ping: status >= 2 (ACK is definitive for iOS)
Other pings: status >= 3 (delivered/read required)
```

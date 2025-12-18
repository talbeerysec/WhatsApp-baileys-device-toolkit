# Device Implementation - Quick Reference

## File Locations

### Frontend
- **Device UI**: `/web-ui/client/src/pages/DevicesPage.tsx` (957 lines)
- **API Client**: `/web-ui/client/src/services/api.ts`
- **Socket Events**: `/web-ui/client/src/contexts/SocketContext.ts`

### Backend
- **Devices API**: `/web-ui/server/src/routes/devices.ts` (76 lines)
- **Messages API**: `/web-ui/server/src/routes/messages.ts` (143 lines)
- **WhatsApp Service**: `/web-ui/server/src/services/whatsapp.ts` (900+ lines)

### Shared
- **Types**: `/web-ui/shared/types/api.ts` (121 lines)

---

## API Endpoints

```
GET  /api/devices/:user          Get devices for user
POST /api/devices/ping           Send silent ping
POST /api/messages/device        Send message to device
POST /api/messages/send          Send message to JID
```

---

## Device-Specific JID Format

```
User: "1234567890"
Device 0: "1234567890:0@s.whatsapp.net"  (primary)
Device 1: "1234567890:1@s.whatsapp.net"  (secondary/desktop/web)
```

---

## Silent Ping Types (11 total)

1. **Reaction** - Reaction to non-existent message
2. **Delete** - Delete message (REVOKE protocol, type=0)
3. **Edit** - Edit message (MESSAGE_EDIT protocol, type=14)
4. **Call-Reject** - Call rejection (CALL_LOG_MESSAGE, type=22)
5. **Unknown** - Non-existent protocol type (type=101)
6. **Poll Response** - Vote on non-existent poll
7. **Button Response** - Button response with fake ID
8. **Device Coordination** - Multi-device sync message
9. **App State** - App state fatal exception
10. **Peer Data** - P2P data operation request
11. **Malformed** - Invalid proto field (conversation1)

---

## Fingerprinting Results

### Primary Device (ID=0)
- Reaction success + Delete timeout = **Android**
- Reaction success + Delete success = **iOS**

### Secondary Device (ID>0)
- Call-reject timeout = **Desktop**
- Call-reject success = **Browser**

---

## Message Status Codes

| Code | Status | Meaning |
|------|--------|---------|
| 0 | `failed` | Delivery failed |
| 1 | `sent` | Sent to server |
| 2 | `ack` | Server ACK |
| 3 | `delivered` | Delivered to device |
| 4-5 | `read` | Read by user |

**Important**: Delete pings cleanup on status ≥ 2, others on status ≥ 3

---

## Key Implementation Patterns

### 1. Device-Specific Messaging
```typescript
const deviceSpecificJid = `${user}:${deviceId}@s.whatsapp.net`;
await this.sock.relayMessage(jid, message, {
  messageId: actualMessageId,
  participant: { jid: deviceSpecificJid, count: 0 }
});
```

### 2. Ping Tracking
```typescript
// Track pending ping
this.pendingSilentPings.set(actualMessageId, {
  user, deviceId, timestamp: Date.now(), timeoutId, type
});

// Listen for response
const { key, update } = messageUpdate;
if (this.pendingSilentPings.has(key.id) && update.status) {
  // Process result
}
```

### 3. Event-Driven Results
```typescript
// Backend emits
this.emit('ping.result', result);

// Frontend listens
socket.on('ping.result', handlePingResult);
```

### 4. Batch Profiling
```typescript
1. Register event handler BEFORE sending
2. Send staggered pings (200ms apart)
3. Listen for responses
4. Auto-fingerprint online devices
5. Cleanup handler after timeout/completion
```

---

## Important Constants

| Name | Value | Location |
|------|-------|----------|
| Ping Timeout | 30s | whatsapp.ts:575 |
| Profile All Timeout | 35s | DevicesPage.tsx:345 |
| Stagger Delay | 200ms | DevicesPage.tsx:392 |
| Response Results Limit | 20 | DevicesPage.tsx:195 |

---

## Flow Summary

### Get Devices
```
DevicesPage.tsx
  ↓ ApiService.getDevices(user)
  ↓ GET /api/devices/:user
  ↓ WhatsAppService.getDevices()
  ↓ socket.getUSyncDevices([jid], false, false)
  ↓ Return DeviceInfo[]
```

### Send Silent Ping
```
DevicesPage.tsx
  ↓ ApiService.silentPing({user, deviceId, type})
  ↓ POST /api/devices/ping
  ↓ WhatsAppService.silentPing()
    1. Generate messageIds
    2. Create ping message (type-specific)
    3. Set 30s timeout
    4. Track in pendingSilentPings
    5. relayMessage({participant: deviceSpecificJid})
  ↓ WhatsApp servers
  ↓ messages.update event
  ↓ handleMessagesUpdate()
  ↓ Check pendingSilentPings
  ↓ Emit ping.result
  ↓ WebSocket to frontend
  ↓ socket.on('ping.result')
  ↓ Update UI state
```

---

## Code Locations by Feature

### Device Discovery
- Route: `devices.ts:10-41`
- Service: `whatsapp.ts:501-538`

### Silent Ping
- Route: `devices.ts:43-74`
- Service: `whatsapp.ts:540-875`
  - Reaction: 818-829
  - Delete: 588-610
  - Call-Reject: 626-661
  - Edit: 611-625
  - Other types: 663-816

### Receipt Tracking
- Handler: `whatsapp.ts:271-321`
- Status mapping: 281-288
- Cleanup logic: 310-316

### Fingerprinting
- Component: `DevicesPage.tsx:199-264`
- Primary detection: 241-250
- Secondary detection: 253-264

### Profile All
- Component: `DevicesPage.tsx:334-443`
- Event handler setup: 376-384
- Ping sending: 386-402
- Monitoring: 409-427

---

## Socket Events

### Backend → Frontend
- `ping.result` - Ping response (SilentPingResult)
- `connection.status` - Connection state
- `messages.update` - Message/receipt updates

### Frontend → Backend
- HTTP REST API (no socket emit)
- Socket only used for receiving events

---

## Key Classes

### WhatsAppService (EventEmitter)
```typescript
Properties:
  - sock: WASocket
  - pendingSilentPings: Map<string, PendingSilentPing>
  - connectionStatus: ConnectionStatus
  - store: InMemoryStore

Methods:
  - getDevices(user): Promise<DeviceInfo[]>
  - silentPing(user, deviceId, type): Promise<SilentPingResult>
  - sendMessageToDevice(user, deviceId, message): Promise<string>
  - handleMessagesUpdate(updates): void
```

### PendingSilentPing Interface
```typescript
{
  user: string,
  deviceId: number,
  timestamp: number,
  timeoutId: NodeJS.Timeout,
  type: PingType
}
```

---

## Testing Quick Start

### Get Devices
```bash
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/devices/1234567890
```

### Send Ping
```bash
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"user":"1234567890","deviceId":0,"type":"reaction"}' \
  http://localhost:3000/api/devices/ping
```

### Send Message to Device
```bash
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"user":"1234567890","deviceId":0,"message":"Hello"}' \
  http://localhost:3000/api/messages/device
```

---

## Common Issues & Solutions

### Issue: Ping timeout
**Cause**: Device offline or network issues
**Solution**: Check device status with reaction ping first

### Issue: Fingerprinting fails
**Cause**: Device offline or protocol issue
**Solution**: Ensure reaction ping succeeds before fingerprinting

### Issue: Profile All doesn't complete
**Cause**: Devices offline or event handler not registered
**Solution**: Check console logs, ensure handler registered before pinging

### Issue: Device-specific message not delivered
**Cause**: Wrong JID format or device doesn't support
**Solution**: Verify device is online, use correct JID format

---

## References

- Full implementation details: `DEVICE_IMPLEMENTATION.md`
- File locations and structure: `FILE_LOCATIONS.md`
- Code examples and snippets: `CODE_EXAMPLES.md`

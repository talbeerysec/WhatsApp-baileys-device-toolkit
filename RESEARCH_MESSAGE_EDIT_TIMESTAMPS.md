# WhatsApp Message Edit - Timestamp Analysis & 15-Minute Window Research

**Date:** 2025-10-29
**Research Focus:** Understanding timestamp fields in edit messages and the 15-minute edit window restriction

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Protocol Structure](#protocol-structure)
3. [Complete Field Hierarchy](#complete-field-hierarchy)
4. [All Timestamp Fields](#all-timestamp-fields)
5. [15-Minute Window Analysis](#15-minute-window-analysis)
6. [Potential Bypass Strategies](#potential-bypass-strategies)
7. [Testing Recommendations](#testing-recommendations)
8. [Code References](#code-references)

---

## Executive Summary

### Key Findings

✅ **ALL WhatsApp message types have timestamps** - Every message is wrapped in `WebMessageInfo` with `messageTimestamp`

✅ **Edit messages use ProtocolMessage type 14** - Wraps the new content with edit metadata

❌ **15-minute restriction NOT enforced client-side** - Baileys library has no validation logic

⚠️ **Server-side enforcement unknown** - WhatsApp servers may reject edits based on timestamp validation

🔍 **Three critical timestamps** for edits:
1. Original message timestamp (`messageTimestamp`)
2. Edit timestamp (`protocolMessage.timestampMs`)
3. Binary stanza timestamp (`t` attribute)

---

## Protocol Structure

### Edit Message Hierarchy

```
WebMessageInfo                          (Outer wrapper - all messages)
└── message
    └── protocolMessage                  (Edit container)
        ├── type = 14                    (MESSAGE_EDIT)
        ├── key                          (Original message reference)
        ├── timestampMs                  (⏰ When edit was performed)
        └── editedMessage: Message       (New content)
            └── [any message type]       (Text, image, video, etc.)
```

### Protocol Buffer Definitions

**ProtocolMessage** - [WAProto.proto:1921-1958](WAProto/WAProto.proto#L1921-L1958)
```protobuf
message ProtocolMessage {
    optional MessageKey key = 1;              // Original message to edit
    optional Type type = 2;                   // MESSAGE_EDIT = 14
    optional Message editedMessage = 14;      // New message content
    optional int64 timestampMs = 15;          // ⏰ Edit timestamp (milliseconds)
    optional int64 ephemeralSettingTimestamp = 5;
    // ... other fields
}
```

**WebMessageInfo** - [WAProto.proto:3067-3119](WAProto/WAProto.proto#L3067-L3119)
```protobuf
message WebMessageInfo {
    required MessageKey key = 1;
    optional Message message = 2;
    optional uint64 messageTimestamp = 3;         // ⏰ Primary timestamp (seconds)
    optional uint64 messageC2STimestamp = 6;      // ⏰ Client-to-server
    optional uint64 ephemeralStartTimestamp = 32; // ⏰ Disappearing msg start
    optional uint64 revokeMessageTimestamp = 52;  // ⏰ Revocation time
    // ... other fields
}
```

**MessageKey** - [WAProto.proto:2144-2149](WAProto/WAProto.proto#L2144-L2149)
```protobuf
message MessageKey {
    optional string remoteJid = 1;      // Chat JID
    optional bool fromMe = 2;           // Is from authenticated user?
    optional string id = 3;             // Message ID
    optional string participant = 4;    // Sender JID (groups)
}
```

---

## Complete Field Hierarchy

### Level 1: WebMessageInfo (Outer Wrapper)

```
WebMessageInfo {
    key: MessageKey {
        remoteJid: string
        fromMe: bool
        id: string
        participant: string
    }

    message: Message                        // The actual message content

    ⏰ messageTimestamp: uint64             // PRIMARY TIMESTAMP (seconds)
    ⏰ messageC2STimestamp: uint64          // Client-to-Server timestamp
    ⏰ ephemeralStartTimestamp: uint64      // Disappearing message start
    ⏰ revokeMessageTimestamp: uint64       // Revocation timestamp

    status: Status                          // PENDING, SERVER_ACK, DELIVERY_ACK, READ, PLAYED
    participant: string
    ignore: bool
    starred: bool
    broadcast: bool
    pushName: string
    mediaCiphertextSha256: bytes
    multicast: bool
    urlText: bool
    urlNumber: bool
    messageStubType: StubType
    clearMedia: bool
    messageStubParameters: string[]
    duration: uint32
    labels: string[]
    paymentInfo: PaymentInfo
    finalLiveLocation: LiveLocationMessage
    quotedPaymentInfo: PaymentInfo
    ephemeralDuration: uint32
    ephemeralOffToOn: bool
    ephemeralOutOfSync: bool
    bizPrivacyStatus: BizPrivacyStatus
    verifiedBizName: string
    mediaData: MediaData
    photoChange: PhotoChange
    userReceipt: UserReceipt[]              // Read receipts
    reactions: Reaction[]                   // Message reactions
    quotedStickerData: MediaData
    futureproofData: bytes
    statusPsa: StatusPSA
    pollUpdates: PollUpdate[]
    pollAdditionalMetadata: PollAdditionalMetadata
    agentId: string
    statusAlreadyViewed: bool
    messageSecret: bytes
    keepInChat: KeepInChat
    originalSelfAuthorUserJidString: string
    pinInChat: PinInChat
    premiumMessageInfo: PremiumMessageInfo
    is1PBizBotMessage: bool
    isGroupHistoryMessage: bool
    botMessageInvokerJid: string
    commentMetadata: CommentMetadata
    eventResponses: EventResponse[]
    reportingTokenInfo: ReportingTokenInfo
    newsletterServerId: uint64
}
```

### Level 2: ProtocolMessage (Edit Container)

```
Message {
    protocolMessage: ProtocolMessage {
        key: MessageKey {                   // Original message reference
            remoteJid: string
            fromMe: bool
            id: string                      // Original message ID
            participant: string
        }

        type: Type = MESSAGE_EDIT (14)      // MUST be 14 for edits

        editedMessage: Message              // New message content (Level 3)

        ⏰ timestampMs: int64               // EDIT TIMESTAMP (milliseconds)
        ⏰ ephemeralSettingTimestamp: int64 // Ephemeral setting change time

        ephemeralExpiration: uint32
        historySyncNotification: HistorySyncNotification
        appStateSyncKeyShare: AppStateSyncKeyShare
        appStateSyncKeyRequest: AppStateSyncKeyRequest
        initialSecurityNotificationSettingSync: InitialSecurityNotificationSettingSync
        appStateFatalExceptionNotification: AppStateFatalExceptionNotification
        disappearingMode: DisappearingMode
        peerDataOperationRequestMessage: PeerDataOperationRequestMessage
        peerDataOperationRequestResponseMessage: PeerDataOperationRequestResponseMessage
        botFeedbackMessage: BotFeedbackMessage
        invokerJid: string
        requestWelcomeMessageMetadata: RequestWelcomeMessageMetadata
        mediaNotifyMessage: MediaNotifyMessage
    }
}
```

### Level 3: editedMessage Content (New Message)

The `editedMessage` field can contain any WhatsApp message type:

```
editedMessage: Message {
    // ONE of the following:

    conversation: string                    // Plain text

    extendedTextMessage: ExtendedTextMessage {
        text: string
        matchedText: string
        canonicalUrl: string
        description: string
        title: string
        textArgb: fixed32
        backgroundArgb: fixed32
        font: FontType
        previewType: PreviewType
        jpegThumbnail: bytes
        ⏰ mediaKeyTimestamp: int64
        contextInfo: ContextInfo
        doNotPlayInline: bool
        thumbnailDirectPath: string
        thumbnailSha256: bytes
        thumbnailEncSha256: bytes
        thumbnailHeight: uint32
        thumbnailWidth: uint32
        inviteLinkGroupType: InviteLinkGroupType
        inviteLinkParentGroupSubjectV2: string
        inviteLinkParentGroupThumbnailV2: bytes
    }

    imageMessage: ImageMessage {
        url: string
        mimetype: string
        caption: string
        fileSha256: bytes
        fileLength: uint64
        height: uint32
        width: uint32
        mediaKey: bytes
        fileEncSha256: bytes
        interactiveAnnotations: InteractiveAnnotation[]
        directPath: string
        ⏰ mediaKeyTimestamp: int64
        jpegThumbnail: bytes
        contextInfo: ContextInfo
        firstScanSidecar: bytes
        firstScanLength: uint32
        experimentGroupId: uint32
        scansSidecar: bytes
        scanLengths: uint32[]
        midQualityFileSha256: bytes
        midQualityFileEncSha256: bytes
        viewOnce: bool
        thumbnailDirectPath: string
        thumbnailSha256: bytes
        thumbnailEncSha256: bytes
        staticUrl: string
    }

    videoMessage: VideoMessage {
        url: string
        mimetype: string
        fileSha256: bytes
        fileLength: uint64
        seconds: uint32
        mediaKey: bytes
        caption: string
        gifPlayback: bool
        height: uint32
        width: uint32
        fileEncSha256: bytes
        interactiveAnnotations: InteractiveAnnotation[]
        directPath: string
        ⏰ mediaKeyTimestamp: int64
        jpegThumbnail: bytes
        contextInfo: ContextInfo
        streamingSidecar: bytes
        gifAttribution: Attribution
        viewOnce: bool
        thumbnailDirectPath: string
        thumbnailSha256: bytes
        thumbnailEncSha256: bytes
        staticUrl: string
    }

    audioMessage: AudioMessage {
        url: string
        mimetype: string
        fileSha256: bytes
        fileLength: uint64
        seconds: uint32
        ptt: bool                           // Push-to-talk (voice note)
        mediaKey: bytes
        fileEncSha256: bytes
        directPath: string
        ⏰ mediaKeyTimestamp: int64
        contextInfo: ContextInfo
        streamingSidecar: bytes
        waveform: bytes
        backgroundArgb: fixed32
        viewOnce: bool
    }

    documentMessage: DocumentMessage
    contactMessage: ContactMessage
    locationMessage: LocationMessage
    liveLocationMessage: LiveLocationMessage
    stickerMessage: StickerMessage

    reactionMessage: ReactionMessage {
        key: MessageKey
        text: string
        groupingKey: string
        ⏰ senderTimestampMs: int64         // Reaction creation time
    }

    pollCreationMessage: PollCreationMessage {
        name: string
        options: PollOption[]
        selectableOptionsCount: uint32
        contextInfo: ContextInfo
        ⏰ senderTimestampMs: int64         // Poll creation time
    }

    eventMessage: EventMessage {
        contextInfo: ContextInfo
        isCanceled: bool
        name: string
        description: string
        location: LocationMessage
        joinLink: string
        ⏰ startTime: int64                 // Event start time
    }

    // ... 60+ other message types
}
```

---

## All Timestamp Fields

### Complete Timestamp Inventory

| Level | Field Path | Type | Unit | Description | Usage |
|-------|-----------|------|------|-------------|-------|
| **1** | `messageTimestamp` | `uint64` | seconds | Primary message timestamp | All messages |
| **1** | `messageC2STimestamp` | `uint64` | seconds | Client-to-Server timestamp | Message sending |
| **1** | `ephemeralStartTimestamp` | `uint64` | seconds | Disappearing message start | Ephemeral msgs |
| **1** | `revokeMessageTimestamp` | `uint64` | seconds | Message revocation time | Deleted msgs |
| **1** | `ephemeralDuration` | `uint32` | seconds | Disappearing duration | Ephemeral msgs |
| **2** | `protocolMessage.timestampMs` | `int64` | **milliseconds** | **EDIT TIMESTAMP** | **Edits** |
| **2** | `protocolMessage.ephemeralSettingTimestamp` | `int64` | milliseconds | Ephemeral setting change | Ephemeral |
| **2** | `protocolMessage.ephemeralExpiration` | `uint32` | seconds | Ephemeral expiration | Ephemeral |
| **3** | `editedMessage.*.mediaKeyTimestamp` | `int64` | milliseconds | Media encryption key time | Media msgs |
| **3** | `editedMessage.reactionMessage.senderTimestampMs` | `int64` | milliseconds | Reaction creation time | Reactions |
| **3** | `editedMessage.pollCreationMessage.senderTimestampMs` | `int64` | milliseconds | Poll creation time | Polls |
| **3** | `editedMessage.pollUpdateMessage.senderTimestampMs` | `int64` | milliseconds | Poll vote time | Poll votes |
| **3** | `editedMessage.eventMessage.startTime` | `int64` | milliseconds | Event start time | Events |
| **3** | `editedMessage.eventResponseMessage.timestampMs` | `int64` | milliseconds | Event response time | Event RSVPs |

### Binary Stanza Timestamp (Plaintext)

In addition to protobuf timestamps, the WebSocket message stanza includes:

```xml
<message
    id="MESSAGE_ID"
    type="text"
    to="RECIPIENT_JID"
    t="UNIX_TIMESTAMP"           ⏰ Stanza timestamp (plaintext, seconds)
    edit="1"                     Edit attribute marker
>
    <!-- encrypted protobuf content -->
</message>
```

**Set at:** [messages-send.ts:513-521](src/Socket/messages-send.ts#L513-L521)

---

## 15-Minute Window Analysis

### Official WhatsApp Behavior

Official WhatsApp clients enforce a **15-minute (900 second) window** for editing messages:
- Users can edit messages within 15 minutes of sending
- After 15 minutes, the edit option is disabled in the UI
- This is a **client-side restriction** in official apps

### Baileys Implementation Analysis

**Key Finding:** ❌ **NO client-side validation exists in Baileys**

#### Edit Message Creation
**Location:** [src/Utils/messages.ts:526-535](src/Utils/messages.ts#L526-L535)

```typescript
if('edit' in message) {
    m = {
        protocolMessage: {
            key: message.edit,
            editedMessage: m,
            timestampMs: Date.now(),  // ⚠️ Set to current time, NO validation
            type: WAProto.Message.ProtocolMessage.Type.MESSAGE_EDIT
        }
    }
}
```

**What's missing:**
- ❌ No check of original message timestamp
- ❌ No calculation of time difference
- ❌ No validation against 900-second (15-minute) limit
- ❌ No rejection of old edits

#### Edit Message Processing
**Location:** [src/Utils/process-message.ts:301-319](src/Utils/process-message.ts#L301-L319)

```typescript
case proto.Message.ProtocolMessage.Type.MESSAGE_EDIT:
    ev.emit(
        'messages.update',
        [
            {
                key: protocolMsg.key!,
                update: {
                    message: {
                        editedMessage: {
                            message: protocolMsg.editedMessage
                        }
                    },
                    messageTimestamp: protocolMsg.timestampMs
                        ? Math.floor(toNumber(protocolMsg.timestampMs) / 1000)
                        : message.messageTimestamp
                }
            }
        ]
    )
```

**What's missing:**
- ❌ No server response validation
- ❌ No error handling for rejected edits
- ❌ No timestamp validation

#### Binary Stanza Creation
**Location:** [src/Socket/messages-send.ts:781-782](src/Socket/messages-send.ts#L781-L782)

```typescript
} else if(isEditMsg) {
    additionalAttributes.edit = '1'  // Just sets edit attribute, no validation
}
```

### Server-Side Enforcement (Unknown)

The WhatsApp servers **may** enforce the 15-minute restriction by:

1. **Timestamp Comparison:**
   ```
   if (protocolMessage.timestampMs - originalMessage.messageTimestamp > 900000) {
       reject("Edit window expired")
   }
   ```

2. **Server-Assigned Timestamp Check:**
   - Server may compare against its own timestamp records
   - May ignore client-provided `timestampMs`

3. **Potential Server Responses:**
   - Silent rejection (edit ignored)
   - Error response (protocol error)
   - Acceptance with override (edit timestamp changed)

### Search Results for Validation

Searched for potential validation code:

```bash
grep -r "15.*min\|900" src/
# Found: NONE related to edit validation

grep -r "editTimestamp\|MESSAGE_EDIT" src/
# Found: Only creation/processing code, no validation
```

**Conclusion:** Baileys library trusts the client to enforce the restriction.

---

## Potential Bypass Strategies

### Strategy 1: Direct Timestamp Manipulation

**Modify:** [src/Utils/messages.ts:531](src/Utils/messages.ts#L531)

```typescript
// Current code:
timestampMs: Date.now()

// Potential bypass:
timestampMs: originalMessageTimestamp + (14 * 60 * 1000)  // 14 minutes after original
```

**Theory:** If server validates `editTimestamp - originalTimestamp < 900000`, staying under 15 minutes might work.

**Risk:** Server may validate against its own timestamp records, not client-provided values.

---

### Strategy 2: Custom Timestamp in generateWAMessageFromContent

**Add parameter to:** [src/Utils/messages.ts:546-555](src/Utils/messages.ts#L546-L555)

```typescript
export const generateWAMessageFromContent = (
    jid: string,
    message: WAMessageContent,
    options: MessageGenerationOptionsFromContent & { editTimestamp?: number }  // ⬅️ Add
) => {
    if(!options.timestamp) {
        options.timestamp = new Date()
    }

    // ... existing code ...

    // In edit block:
    if('edit' in message) {
        m = {
            protocolMessage: {
                key: message.edit,
                editedMessage: m,
                timestampMs: options.editTimestamp || Date.now(),  // ⬅️ Use custom
                type: WAProto.Message.ProtocolMessage.Type.MESSAGE_EDIT
            }
        }
    }
}
```

**Usage:**
```typescript
await generateWAMessageFromContent(
    jid,
    { edit: originalKey, text: "New text" },
    {
        editTimestamp: originalMessageTime + (14 * 60 * 1000)  // Backdated
    }
)
```

---

### Strategy 3: Binary Stanza Timestamp Override

**Modify:** [src/Socket/messages-send.ts:781-798](src/Socket/messages-send.ts#L781-L798)

```typescript
} else if(isEditMsg) {
    additionalAttributes.edit = '1'
    // Add stanza timestamp override
    additionalAttributes.t = Math.floor(originalMessageTimestamp / 1000).toString()
}
```

**Theory:** The plaintext `t` attribute might influence server validation.

---

### Strategy 4: Complete Custom Implementation

Create a custom `relayEditMessage` function with full timestamp control:

```typescript
const relayEditMessage = async(
    jid: string,
    originalKey: WAMessageKey,
    newContent: AnyMessageContent,
    options: {
        editTimestamp?: number,      // Custom edit time
        stanzaTimestamp?: number,    // Custom stanza time
    }
) => {
    const editMsg = {
        protocolMessage: {
            key: originalKey,
            editedMessage: prepareMessageContent(newContent),
            timestampMs: options.editTimestamp || Date.now(),
            type: 14  // MESSAGE_EDIT
        }
    }

    await relayMessage(jid, editMsg, {
        additionalAttributes: {
            edit: '1',
            t: options.stanzaTimestamp
                ? Math.floor(options.stanzaTimestamp / 1000).toString()
                : undefined
        }
    })
}
```

---

## Testing Recommendations

### Phase 1: Baseline Testing (No Modifications)

**Test 1.1:** Normal Edit Within Window
```typescript
// 1. Send message
const msg = await sock.sendMessage(testJid, { text: "Original" })

// 2. Wait 5 minutes
await sleep(5 * 60 * 1000)

// 3. Edit normally
await sock.sendMessage(testJid, {
    edit: msg.key,
    text: "Edited within 15min"
})

// Expected: ✅ Success
```

**Test 1.2:** Edit After 15 Minutes (Baseline)
```typescript
// 1. Send message
const msg = await sock.sendMessage(testJid, { text: "Original" })

// 2. Wait 20 minutes
await sleep(20 * 60 * 1000)

// 3. Attempt edit
await sock.sendMessage(testJid, {
    edit: msg.key,
    text: "Edited after 15min"
})

// Expected: ❌ Rejected OR ✅ Accepted (unknown)
```

---

### Phase 2: Timestamp Manipulation Testing

**Test 2.1:** Backdated Edit Timestamp
```typescript
// 1. Send message and record timestamp
const msg = await sock.sendMessage(testJid, { text: "Original" })
const originalTimestamp = msg.messageTimestamp

// 2. Wait 20 minutes
await sleep(20 * 60 * 1000)

// 3. Modify messages.ts to use:
//    timestampMs: originalTimestamp * 1000 + (14 * 60 * 1000)

// 4. Attempt edit
await sock.sendMessage(testJid, {
    edit: msg.key,
    text: "Backdated edit"
})

// Expected: ✅ Success if server trusts timestamp
//           ❌ Rejected if server validates against own records
```

**Test 2.2:** Future Edit Timestamp
```typescript
// 1. Send message
const msg = await sock.sendMessage(testJid, { text: "Original" })

// 2. Immediately edit with future timestamp
//    timestampMs: Date.now() + (10 * 60 * 1000)  // 10 min in future

// 3. Attempt edit
await sock.sendMessage(testJid, {
    edit: msg.key,
    text: "Future-dated edit"
})

// Expected: Unknown server behavior
```

---

### Phase 3: Server Response Analysis

**Test 3.1:** Monitor Server Acknowledgments
```typescript
// Listen for edit acknowledgments
sock.ev.on('messages.update', (updates) => {
    console.log('Edit update:', JSON.stringify(updates, null, 2))
})

// Listen for errors
sock.ev.on('connection.update', (update) => {
    if (update.lastDisconnect?.error) {
        console.log('Error:', update.lastDisconnect.error)
    }
})
```

**Test 3.2:** Compare Sent vs Received Timestamps
```typescript
// 1. Send edit with custom timestamp
const customTimestamp = Date.now() - (10 * 60 * 1000)  // 10 min ago

// 2. Capture the edited message from events
sock.ev.on('messages.update', (updates) => {
    const edited = updates[0]
    console.log('Sent timestampMs:', customTimestamp)
    console.log('Received messageTimestamp:', edited.update.messageTimestamp)
    console.log('Difference:', edited.update.messageTimestamp - (customTimestamp / 1000))
})
```

---

### Phase 4: Alternative Approaches

**Test 4.1:** Edit with Original Message Timestamp
```typescript
// Theory: Set edit timestamp equal to original message timestamp
// This makes it appear as if the message was edited immediately

const msg = await sock.sendMessage(testJid, { text: "Original" })
const originalTimestamp = msg.messageTimestamp * 1000  // Convert to ms

await sleep(20 * 60 * 1000)  // Wait 20 minutes

// Use originalTimestamp as editTimestamp
// Modify code: timestampMs: originalTimestamp
```

**Test 4.2:** Edit Without Timestamp Field
```typescript
// Theory: Omit timestampMs entirely, let server assign it

// Modify messages.ts:
if('edit' in message) {
    m = {
        protocolMessage: {
            key: message.edit,
            editedMessage: m,
            // timestampMs: Date.now(),  // ⬅️ Comment out
            type: WAProto.Message.ProtocolMessage.Type.MESSAGE_EDIT
        }
    }
}
```

---

## Code References

### Key Implementation Files

| File | Lines | Purpose |
|------|-------|---------|
| [src/Utils/messages.ts](src/Utils/messages.ts) | 526-535 | Edit message creation |
| [src/Socket/messages-send.ts](src/Socket/messages-send.ts) | 781-782 | Edit stanza attribute |
| [src/Socket/messages-send.ts](src/Socket/messages-send.ts) | 316-575 | relayMessage implementation |
| [src/Utils/process-message.ts](src/Utils/process-message.ts) | 301-319 | Edit message processing |
| [WAProto/WAProto.proto](WAProto/WAProto.proto) | 1921-1958 | ProtocolMessage definition |
| [WAProto/WAProto.proto](WAProto/WAProto.proto) | 3067-3119 | WebMessageInfo definition |

### Example Usage References

| File | Lines | Purpose |
|------|-------|---------|
| [Example/example.ts](Example/example.ts) | 867 | Edit-based silent ping example |
| [web-ui/server/src/services/whatsapp.ts](web-ui/server/src/services/whatsapp.ts) | 586 | Web UI edit implementation |

---

## Next Steps

### Immediate Actions

1. **Document Current Behavior:**
   - Test normal edits (within 15 min)
   - Test late edits (after 15 min)
   - Capture server responses

2. **Implement Custom Timestamp Control:**
   - Add `editTimestamp` parameter to options
   - Expose in API for testing
   - Log all timestamp values

3. **Monitor Server Responses:**
   - Check for error codes
   - Compare sent vs received timestamps
   - Identify validation patterns

### Research Questions

- ❓ Does server validate `timestampMs` against original message?
- ❓ Does server trust client-provided timestamps?
- ❓ Can we set `timestampMs` to match original message time?
- ❓ Does binary stanza `t` attribute influence validation?
- ❓ Are there different validation rules for different message types?

---

## Security & Ethical Considerations

⚠️ **Important Notice:**

This research is for **educational and security research purposes** only. Understanding protocol limitations helps:

1. **Security Research:** Identify potential protocol vulnerabilities
2. **Defensive Security:** Understand what attackers might attempt
3. **Protocol Understanding:** Learn how WhatsApp implements features
4. **Authorized Testing:** Test in controlled environments with permission

**DO NOT:**
- Use bypasses for malicious purposes
- Attempt to deceive or manipulate others
- Violate WhatsApp Terms of Service
- Test against production accounts without authorization

**Authorized contexts:**
- Personal test accounts
- Controlled research environments
- CTF challenges
- Security vulnerability disclosure programs

---

## Conclusion

The 15-minute edit window is enforced by:
1. ✅ Official WhatsApp clients (UI restriction)
2. ❌ Baileys library (no validation)
3. ❓ WhatsApp servers (unknown enforcement)

Testing is required to determine server-side behavior and potential bypass feasibility.

---

**Document Version:** 1.0
**Last Updated:** 2025-10-29
**Status:** Research in progress

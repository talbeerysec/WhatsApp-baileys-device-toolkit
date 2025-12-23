# Baileys QR Code Authentication Flow - Complete Cryptographic Analysis

## Document Overview

This document provides a comprehensive analysis of the QR code authentication flow in Baileys, augmented with detailed cryptographic parameters from the official WhatsApp Encryption Overview whitepaper (Version 8, August 19, 2024). The focus is on understanding the cryptographic operations, key types, and security properties throughout the authentication process.

---

## Table of Contents

1. [Cryptographic Foundation](#cryptographic-foundation)
2. [Phase 1: Key Generation & Initialization](#phase-1-key-generation--initialization)
3. [Phase 2: Transport Layer - Noise Protocol Handshake](#phase-2-transport-layer---noise-protocol-handshake)
4. [Phase 3: Registration Node & Client Finish](#phase-3-registration-node--client-finish)
5. [Phase 4: QR Code Generation - Crypto Deep Dive](#phase-4-qr-code-generation---crypto-deep-dive)
6. [Phase 5: Mobile Scan & Pairing - Crypto Operations](#phase-5-mobile-scan--pairing---crypto-operations)
7. [Phase 6: Companion Verification - Signature Chain](#phase-6-companion-verification---signature-chain)
8. [Phase 7: Pairing Success Verification](#phase-7-pairing-success-verification)
9. [Phase 8: Session Establishment](#phase-8-session-establishment)
10. [Cryptographic Summary](#cryptographic-summary)
11. [Security Properties](#security-properties)

---

## Cryptographic Foundation

### Key Types Used in QR Authentication

According to the WhatsApp whitepaper, the authentication process uses several key types:

#### Long-term Keys (Generated at Installation)

- **Identity Key Pair**: Curve25519 key pair, generated at install time
- **Signed Pre Key**: Medium-term Curve25519 key pair, signed by Identity Key, rotated periodically
- **One-Time Pre Keys**: Queue of Curve25519 key pairs for one-time use

#### Ephemeral Keys (Per Connection)

- **Noise Protocol Ephemeral Key Pair**: Unique Curve25519 pair per connection (not saved)

#### Companion Linking Keys

- **Linking Secret Key (L_companion)**: 32-byte value generated on companion, transmitted via QR
- **Pairing Ephemeral Key Pair**: Curve25519 key pair for pairing process

---

## Phase 1: Key Generation & Initialization

### 1. Authentication Credentials Generation

**File**: [src/Utils/auth-utils.ts:199-220](src/Utils/auth-utils.ts#L199-L220)

**Baileys Implementation:**

```typescript
export const initAuthCreds = (): AuthenticationCreds => {
    const identityKey = Curve.generateKeyPair()
    return {
        noiseKey: Curve.generateKeyPair(),              // Curve25519
        pairingEphemeralKeyPair: Curve.generateKeyPair(), // Curve25519
        signedIdentityKey: identityKey,                  // Curve25519
        signedPreKey: signedKeyPair(identityKey, 1),    // Signed by Identity Key
        registrationId: generateRegistrationId(),        // 16-bit random
        advSecretKey: randomBytes(32).toString('base64'), // 32 bytes for HMAC
        processedHistoryMessages: [],
        nextPreKeyId: 1,
        firstUnuploadedPreKeyId: 1,
        accountSyncCounter: 0,
        accountSettings: { unarchiveChats: false },
        registered: false,
        pairingCode: undefined,
        lastPropHash: undefined,
        routingInfo: undefined
    }
}
```

**Cryptographic Parameters:**

| Parameter | Algorithm | Size | Purpose |
|-----------|-----------|------|---------|
| `noiseKey` | Curve25519 | 32 bytes | Static key for Noise protocol |
| `pairingEphemeralKeyPair` | Curve25519 | 32 bytes | Ephemeral key for pairing |
| `signedIdentityKey` | Curve25519 | 32 bytes | Long-term device identity |
| `signedPreKey` | Curve25519 | 32 bytes | Medium-term session key |
| `registrationId` | Random | 2 bytes | Signal protocol ID |
| `advSecretKey` | Random | 32 bytes | HMAC verification key |

**WhatsApp Whitepaper Mapping:**

- `signedIdentityKey` = **Identity Key Pair** (I_companion or I_primary)
- `noiseKey` = Static key for Noise protocol handshake
- `pairingEphemeralKeyPair` = Used for QR code linking
- `advSecretKey` = Used to verify account signatures via HMAC

### 2. Auth State Storage

**File**: [src/Utils/use-multi-file-auth-state.ts:33-136](src/Utils/use-multi-file-auth-state.ts#L33-L136)

**Function**: `useMultiFileAuthState(folder)`

**What happens:**
- Loads existing credentials from `creds.json` or creates new ones via `initAuthCreds()`
- Provides a **key store** interface for Signal protocol keys
- Uses mutex locks to prevent concurrent file access issues
- Returns `{ state, saveCreds }` where:
  - `state.creds`: Authentication credentials
  - `state.keys`: Signal key store (sessions, pre-keys, etc.)
  - `saveCreds()`: Function to persist credentials to disk

**Storage Format:**
- `creds.json`: All authentication credentials
- `{type}-{id}.json`: Individual Signal protocol keys
- Uses `BufferJSON` serialization for Buffer objects

---

## Phase 2: Transport Layer - Noise Protocol Handshake

### 3. Noise Protocol Setup

**File**: [src/Socket/socket.ts:89-97](src/Socket/socket.ts#L89-L97)

**Baileys Implementation:**

```typescript
const ephemeralKeyPair = Curve.generateKeyPair()
const noise = makeNoiseHandler({
    keyPair: ephemeralKeyPair,
    NOISE_HEADER: NOISE_WA_HEADER,
    logger,
    routingInfo: authState?.creds?.routingInfo
})
```

**Cryptographic Protocol: Noise Pipes with Curve25519**

According to the whitepaper (page 35), transport security uses:

- **Framework**: Noise Protocol Framework
- **Pattern**: Noise Pipes (XX pattern variant)
- **Key Exchange**: Curve25519 ECDH
- **Encryption**: AES-256-GCM
- **Hash**: SHA-256

**Properties Achieved:**
1. Fast lightweight connection setup and resume
2. Encrypts metadata to hide from network observers
3. No client authentication secrets stored on server
4. Forward secrecy through ephemeral keys

### 4. Connection Handshake

**File**: [src/Socket/socket.ts:222-259](src/Socket/socket.ts#L222-L259)

**Function**: `validateConnection()`

#### Step 1: Client Hello

**Cryptographic Operation:**

```typescript
let helloMsg: proto.IHandshakeMessage = {
    clientHello: { ephemeral: ephemeralKeyPair.public }
}
helloMsg = proto.HandshakeMessage.fromObject(helloMsg)
const init = proto.HandshakeMessage.encode(helloMsg).finish()
const result = await awaitNextMessage<Uint8Array>(init)
```

**What's Sent:**
- `ephemeralKeyPair.public`: 32-byte Curve25519 public key
- Format: Protobuf-encoded HandshakeMessage

**Purpose**: Initiates Noise XX handshake

#### Step 2: Server Hello & Handshake Processing

**Cryptographic Operations:**

```typescript
const handshake = proto.HandshakeMessage.decode(result)
const keyEnc = await noise.processHandshake(handshake, creds.noiseKey)
```

**Inside `noise.processHandshake()`:**

1. **ECDH Computation**:
   ```
   sharedSecret = ECDH(ephemeralPrivate, serverEphemeralPublic)
   ```

2. **Key Derivation** (HKDF-SHA256):
   ```
   encryptionKey = HKDF(sharedSecret, "encryption")
   ```

3. **Static Key Encryption**:
   ```
   keyEnc = AES-GCM-ENCRYPT(noiseKey.public, encryptionKey)
   ```

**Result**: `keyEnc` contains encrypted static Noise key (32 bytes ciphertext + 16 bytes tag)

#### Step 3: Client Finish

**Decision Point:**

```typescript
let node: proto.IClientPayload
if (!creds.me) {
    node = generateRegistrationNode(creds, config)
    logger.info('not logged in, attempting registration...')
} else {
    node = generateLoginNode(creds.me.id, config)
    logger.info('logging in...')
}
```

**For QR Flow**: Uses `generateRegistrationNode()` (first-time pairing)

---

## Phase 3: Registration Node & Client Finish

### 5. Registration Node Generation

**File**: [src/Utils/validate-connection.ts:76-125](src/Utils/validate-connection.ts#L76-L125)

**Function**: `generateRegistrationNode(creds, config)`

**Cryptographic Payload:**

```typescript
const registerPayload: proto.IClientPayload = {
    ...getClientPayload(config),
    passive: false,
    pull: false,
    devicePairingData: {
        buildHash: appVersionBuf,                        // MD5(version)
        deviceProps: companionProto,                     // Device capabilities
        eRegid: encodeBigEndian(registrationId),        // Registration ID
        eKeytype: KEY_BUNDLE_TYPE,                      // Bundle type
        eIdent: signedIdentityKey.public,               // Identity public key
        eSkeyId: encodeBigEndian(signedPreKey.keyId, 3), // Pre-key ID
        eSkeyVal: signedPreKey.keyPair.public,          // Pre-key public
        eSkeySig: signedPreKey.signature                 // Pre-key signature
    }
}
```

**Cryptographic Fields Breakdown:**

| Field | Algorithm | Size | Description |
|-------|-----------|------|-------------|
| `buildHash` | MD5 | 16 bytes | Hash of app version |
| `eRegid` | Big-endian | 2-4 bytes | Registration ID |
| `eIdent` | Curve25519 | 32 bytes | Identity public key |
| `eSkeyId` | Big-endian | 3 bytes | Signed pre-key ID |
| `eSkeyVal` | Curve25519 | 32 bytes | Signed pre-key public |
| `eSkeySig` | Ed25519 | 64 bytes | Signature over pre-key |

**Signature Computation (for signedPreKey):**

```typescript
const signedKeyPair = (identityKey, keyId) => {
    const preKey = Curve.generateKeyPair()
    const pubKey = preKey.public

    // Sign with identity key
    const signature = Curve.sign(
        identityKey.private,
        Buffer.concat([
            Buffer.from([0x05]), // Version byte
            encodeBigEndian(keyId),
            pubKey
        ])
    )

    return { keyId, keyPair: preKey, signature }
}
```

### 6. Client Finish Message

**File**: [src/Socket/socket.ts:248-257](src/Socket/socket.ts#L248-L257)

**Encryption & Transmission:**

```typescript
const payloadEnc = noise.encrypt(proto.ClientPayload.encode(node).finish())
await sendRawMessage(
    proto.HandshakeMessage.encode({
        clientFinish: {
            static: keyEnc,      // Encrypted noise key
            payload: payloadEnc  // Encrypted registration data
        }
    }).finish()
)
noise.finishInit()
```

**Cryptographic Operations:**

1. **Protobuf Encoding**: Convert ClientPayload to binary
2. **AES-GCM Encryption**:
   ```
   payloadEnc = AES-GCM-ENCRYPT(payload, noiseEncKey, nonce)
   ```
3. **Message Assembly**: Combine encrypted static key + encrypted payload
4. **Finalize**: Complete Noise handshake, establish secure channel

**Result**: All subsequent communication encrypted with Noise Protocol keys

---

## Phase 4: QR Code Generation - Crypto Deep Dive

### 7. QR Code Event Handler

**File**: [src/Socket/socket.ts:569-608](src/Socket/socket.ts#L569-L608)

**Event**: `ws.on('CB:iq,type:set,pair-device', ...)`

**WhatsApp Whitepaper Reference**: Option 1: Link Using a QR-Code (Page 5-6)

#### Step 1: Companion Generates QR Data (on companion device)

**According to WhatsApp Whitepaper:**

```typescript
// On Companion Device (what QR should contain):
const Icompanion = companion.signedIdentityKey.public  // 32-byte public key
const Lcompanion = randomBytes(32)                     // 32-byte secret

const qrData = {
    Icompanion: Buffer.from(Icompanion).toString('base64'),
    Lcompanion: Buffer.from(Lcompanion).toString('base64')
}
```

**Critical Security Note**: `Lcompanion` is **NEVER** sent to WhatsApp server

#### Step 2: Server Sends pair-device Stanza

**Baileys Implementation:**

```typescript
ws.on('CB:iq,type:set,pair-device', async (stanza: BinaryNode) => {
    // 1. Send immediate ACK
    const iq: BinaryNode = {
        tag: 'iq',
        attrs: {
            to: S_WHATSAPP_NET,
            type: 'result',
            id: stanza.attrs.id!
        }
    }
    await sendNode(iq)
```

**Server Provides:**
- `pair-device` stanza containing multiple `<ref>` nodes
- Each `ref` is a unique nonce for one QR code

#### Step 3: Extract Cryptographic Components

```typescript
    const pairDeviceNode = getBinaryNodeChild(stanza, 'pair-device')
    const refNodes = getBinaryNodeChildren(pairDeviceNode, 'ref')

    // Extract keys as base64
    const noiseKeyB64 = Buffer.from(creds.noiseKey.public).toString('base64')
    const identityKeyB64 = Buffer.from(creds.signedIdentityKey.public).toString('base64')
    const advB64 = creds.advSecretKey  // Already base64
```

**Cryptographic Data:**

| Variable | Source | Type | Size | Encoding |
|----------|--------|------|------|----------|
| `noiseKeyB64` | `creds.noiseKey.public` | Curve25519 public | 32 bytes | Base64 |
| `identityKeyB64` | `creds.signedIdentityKey.public` | Curve25519 public | 32 bytes | Base64 |
| `advB64` | `creds.advSecretKey` | Random secret | 32 bytes | Base64 |

#### Step 4: QR Code String Construction

```typescript
    let qrMs = qrTimeout || 60_000  // First QR timeout
    const genPairQR = () => {
        if (!ws.isOpen) return

        const refNode = refNodes.shift()
        if (!refNode) {
            end(new Boom('QR refs attempts ended', { statusCode: DisconnectReason.timedOut }))
            return
        }

        const ref = (refNode.content as Buffer).toString('utf-8')

        // QR format: ref,noiseKey,identityKey,advSecretKey
        const qr = [ref, noiseKeyB64, identityKeyB64, advB64].join(',')

        ev.emit('connection.update', { qr })

        qrTimer = setTimeout(genPairQR, qrMs)
        qrMs = qrTimeout || 20_000  // Subsequent QRs
    }

    genPairQR()
})
```

**QR Code Format (4 comma-separated base64 strings):**

```
ref,noiseKeyBase64,identityKeyBase64,advSecretKeyBase64
```

**Detailed Component Breakdown:**

| Position | Component | Source | Type | Purpose |
|----------|-----------|--------|------|---------|
| 1 | `ref` | Server | Nonce | Unique challenge (replay protection) |
| 2 | `noiseKey.public` | Client | Curve25519 | Noise protocol static key |
| 3 | `signedIdentityKey.public` | Client | Curve25519 | Long-term identity |
| 4 | `advSecretKey` | Client | Random | HMAC secret for verification |

**Security Properties:**

1. **Replay Protection**: Each `ref` is unique per QR generation
2. **Transport Security**: `noiseKey` establishes Noise channel
3. **Identity**: `signedIdentityKey` provides device identity
4. **Authentication**: `advSecretKey` proves QR possession via HMAC

**QR Lifetime Management:**

```typescript
// First QR: 60 seconds
qrMs = qrTimeout || 60_000

// After first timeout:
qrMs = qrTimeout || 20_000  // Subsequent QRs: 20 seconds each

// Total attempts: Number of ref nodes provided by server
```

**Example QR String:**

```
1234567890abcdef,
YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=,
eHl6MTIzNDU2Nzg5MGFiY2RlZmdoaWprbG1ub3BxcnN0,
c3R1dnd4eXowOTg3NjU0MzIxcG9pdXl0cmV3cWFzZGZn
```

---

## Phase 5: Mobile Scan & Pairing - Crypto Operations

### 8. Primary Device Actions When Scanning QR

**WhatsApp Whitepaper Steps (Page 5-6)**

#### Step 2-3: Primary Scans and Saves

```typescript
// Primary scans QR code and extracts:
const [ref, noiseKeyB64, identityKeyB64, advB64] = qrString.split(',')

const Icompanion = Buffer.from(identityKeyB64, 'base64')  // 32 bytes
const Lcompanion = Buffer.from(advB64, 'base64')          // 32 bytes (SECRET!)

// Save to disk
await saveToDisk({ Icompanion })
```

#### Step 3-4: Load Primary Keys and Generate Metadata

```typescript
const Iprimary = primary.signedIdentityKey

// Generate linking metadata (device info, capabilities, etc.)
const Lmetadata = generateLinkingMetadata({
    deviceId: generateDeviceId(),
    platform: 'web',
    // ... other metadata
})

// Generate updated device list
const ListData = encodeDeviceList([
    ...existingDevices,
    { jid: companionJid, identityKey: Icompanion }
])
```

#### Step 5: Account Signature Generation

**Cryptographic Operation:**

```typescript
// Signature prefix depends on companion type
const ACCOUNT_SIGNATURE_PREFIX = isCloudAPI ? 0x0605 : 0x0600

const Asignature = CURVE25519_SIGN(
    Iprimary.private,  // Primary's private identity key (signer)
    Buffer.concat([
        Buffer.from([ACCOUNT_SIGNATURE_PREFIX]),
        Lmetadata,
        Icompanion
    ])
)
```

**Signature Details:**

- **Algorithm**: Ed25519 (Curve25519 signature variant)
- **Signer**: Primary's Identity private key
- **Message Format**: `prefix || Lmetadata || Icompanion`
- **Prefixes**:
  - `0x0600`: Regular companion
  - `0x0605`: Cloud API companion
- **Output**: 64-byte signature
- **Purpose**: Primary attests that `Icompanion` is authorized

**Verification (later by companion):**

```typescript
const isValid = CURVE25519_VERIFY(
    Iprimary.public,  // Primary's public identity key
    message,          // Same message as above
    Asignature        // 64-byte signature
)
```

#### Step 6: Device List Signature

**Cryptographic Operation:**

```typescript
const ListSignature = CURVE25519_SIGN(
    Iprimary.private,  // Primary's private key
    Buffer.concat([
        Buffer.from([0x06, 0x02]),  // Prefix 0x0602
        ListData
    ])
)
```

**Purpose**:
- Prevents tampering with device list
- Allows verification of current device set
- Used for device list updates and removal detection

#### Step 7-9: Linking Data + HMAC

**Critical Security Step:**

```typescript
// 1. Serialize linking payload
const Ldata = serialize({
    Lmetadata: Lmetadata,
    Iprimary: Iprimary.public,
    Asignature: Asignature
})

// 2. Generate HMAC using Lcompanion from QR
const PHMAC = HMACSHA256(
    Lcompanion,  // Key (32 bytes from QR)
    Ldata        // Message (serialized linking data)
)
```

**HMAC Parameters:**

- **Algorithm**: HMAC-SHA256
- **Key**: `Lcompanion` (32-byte secret from QR code)
- **Message**: Serialized linking data
- **Output**: 32-byte MAC
- **Purpose**: **PROVES PRIMARY HAS THE QR CODE SECRET**

**Why This is Critical:**

1. **MITM Prevention**: Server cannot forge PHMAC without QR secret
2. **QR Proof**: Only device that scanned QR knows `Lcompanion`
3. **Binding**: Links the account signature to the specific QR code
4. **Verification**: Companion can verify using its `Lcompanion`

#### Step 9: Send to Server

```typescript
await server.send({
    ListData: ListData,
    ListSignature: ListSignature,
    Ldata: Ldata,
    PHMAC: PHMAC
})
```

**What Server Does:**
1. Stores `ListData` and `ListSignature`
2. Forwards `Ldata` and `PHMAC` to companion
3. **Cannot** decrypt or verify without `Lcompanion` (which server doesn't have)

---

## Phase 6: Companion Verification - Signature Chain

### 9. Companion Receives Linking Data

**File**: [src/Socket/socket.ts:611-629](src/Socket/socket.ts#L611-L629)

**Event**: `ws.on('CB:iq,,pair-success', ...)`

**WhatsApp Whitepaper Steps (Page 6)**

#### Step 11: HMAC Verification

**Cryptographic Operation:**

```typescript
// Companion receives Ldata and PHMAC from server
const receivedPHMAC = message.PHMAC
const receivedLdata = message.Ldata

// Compute expected HMAC using companion's Lcompanion
const computedHMAC = HMACSHA256(
    Lcompanion,      // 32-byte secret from QR generation
    receivedLdata    // Received linking data
)

// Verify
if (!crypto.timingSafeEqual(computedHMAC, receivedPHMAC)) {
    throw new Error('HMAC verification failed - possible MITM or wrong QR')
}
```

**Security Check:**
- Proves primary device scanned the correct QR code
- Prevents relay attacks
- Timing-safe comparison prevents timing attacks

#### Step 11-12: Decode and Verify Account Signature

**Implementation:**

```typescript
// Decode Ldata
const { Lmetadata, Iprimary, Asignature } = decode(receivedLdata)

// Verify Account Signature
const ACCOUNT_SIGNATURE_PREFIX = 0x0600  // or 0x0605 for Cloud API
const message = Buffer.concat([
    Buffer.from([ACCOUNT_SIGNATURE_PREFIX]),
    Lmetadata,
    Icompanion  // Companion's own identity
])

const verified = CURVE25519_VERIFY(
    Iprimary,      // Primary's public identity key
    message,       // Reconstructed message
    Asignature     // 64-byte signature from primary
)

if (!verified) {
    throw new Error('Account signature verification failed')
}

// Save verified keys
await saveToDisk({ Lmetadata, Iprimary })
```

**What This Proves:**
- Primary device (with `Iprimary`) authorized this companion
- Linking metadata is authentic
- Primary actually signed this specific companion's identity

#### Step 13: Device Signature Generation

**Cryptographic Operation:**

```typescript
const DEVICE_SIGNATURE_PREFIX = isCloudAPI ? 0x0606 : 0x0601

const Dsignature = CURVE25519_SIGN(
    Icompanion.private,  // Companion's private identity key
    Buffer.concat([
        Buffer.from([DEVICE_SIGNATURE_PREFIX]),
        Lmetadata,
        Icompanion.public,
        Iprimary
    ])
)
```

**Signature Chain:**

1. **Primary → Companion**: Primary signs companion's identity (Asignature)
2. **Companion → Primary**: Companion signs its own identity + primary's (Dsignature)
3. **Result**: Mutual attestation and binding

**Why Both Signatures?**

| Signature | Signer | Purpose |
|-----------|--------|---------|
| `Asignature` | Primary | "I authorize this companion" |
| `Dsignature` | Companion | "I acknowledge being linked to this primary" |

**Mutual Binding**: Both devices attest to the relationship

#### Step 14: Upload to Server

**Implementation in Baileys:**

```typescript
await server.upload({
    Lmetadata: Lmetadata,
    Asignature: Asignature,
    Dsignature: Dsignature,
    Icompanion: Icompanion.public,
    signedPreKey: {
        keyId: companion.signedPreKey.keyId,
        publicKey: companion.signedPreKey.keyPair.public,
        signature: companion.signedPreKey.signature
    },
    oneTimePreKeys: companion.oneTimePreKeys.map(key => ({
        keyId: key.keyId,
        publicKey: key.public
    }))
})
```

**Pre-Key Bundle:**
- **Signed Pre Key**: 1 Curve25519 key pair (signed by Identity Key)
- **One-Time Pre Keys**: Batch of Curve25519 keys (typically 100)
- **Purpose**: Enable Signal Protocol session establishment

---

## Phase 7: Pairing Success Verification

### 10. configureSuccessfulPairing Function

**File**: [src/Utils/validate-connection.ts:127-209](src/Utils/validate-connection.ts#L127-L209)

**Function**: `configureSuccessfulPairing(stanza, creds)`

#### Step 1-2: Decode Device Identity and Verify HMAC

**Protobuf Structure:**

```typescript
const { details, hmac, accountType } =
    proto.ADVSignedDeviceIdentityHMAC.decode(deviceIdentityNode.content)
```

**HMAC Verification:**

```typescript
// Determine HMAC prefix based on account type
const isHostedAccount = (accountType === proto.ADVEncryptionType.HOSTED)
const hmacPrefix = isHostedAccount
    ? Buffer.from([6, 5])  // 0x0605
    : Buffer.alloc(0)       // Empty for regular

// Compute expected HMAC
const advSign = hmacSign(
    Buffer.concat([hmacPrefix, details]),  // Message
    Buffer.from(advSecretKey, 'base64')    // Key (from QR code)
)

// Verify
if (Buffer.compare(hmac, advSign) !== 0) {
    throw new Boom('Invalid account signature - HMAC mismatch')
}
```

**HMAC Parameters:**

- **Algorithm**: HMAC-SHA256
- **Key**: `advSecretKey` (from QR code, 32 bytes)
- **Message**: `hmacPrefix || details`
- **Prefixes**:
  - Regular: Empty (0 bytes)
  - Hosted: `0x0605` (2 bytes)
- **Purpose**: Proves mobile app had access to `advSecretKey` from QR

**Security Property**: Only device with QR code can produce valid HMAC

#### Step 3-4: Account Signature Verification

**Decode Account Details:**

```typescript
const account = proto.ADVSignedDeviceIdentity.decode(details)
const {
    accountSignatureKey,  // Primary's signature key
    accountSignature,     // Signature over device
    details: deviceDetails // Device-specific data
} = account
```

**Verify Account Signature:**

```typescript
const accountMsg = Buffer.concat([
    Buffer.from([6, 0]),        // Prefix 0x0600
    deviceDetails,              // Device information
    signedIdentityKey.public    // Companion's public identity
])

const accountValid = Curve.verify(
    accountSignatureKey,  // Primary's public key (verifier)
    accountMsg,           // Message
    accountSignature      // 64-byte Ed25519 signature
)

if (!accountValid) {
    throw new Boom('Failed to verify account signature')
}
```

**What This Verifies:**
- Primary device signed the companion's identity
- Device details are authentic
- Companion identity is authorized

#### Step 5: Device Signature Creation

**Cryptographic Operation:**

```typescript
const devicePrefix = isHostedAccount
    ? Buffer.from([6, 6])  // 0x0606 for hosted
    : Buffer.from([6, 1])  // 0x0601 for regular

const deviceMsg = Buffer.concat([
    devicePrefix,
    deviceDetails,
    signedIdentityKey.public,  // Companion's identity
    accountSignatureKey        // Primary's signature key
])

account.deviceSignature = Curve.sign(
    signedIdentityKey.private,  // Companion's private key
    deviceMsg
)
```

**Signature Prefixes:**

| Account Type | Prefix | Hex |
|--------------|--------|-----|
| Regular | `[6, 1]` | 0x0601 |
| Hosted | `[6, 6]` | 0x0606 |

#### Step 6: Signal Identity Creation

**Implementation:**

```typescript
const identity = createSignalIdentity(jid, accountSignatureKey)

const authUpdate: Partial<AuthenticationCreds> = {
    account: account,
    me: {
        id: jid,           // e.g., "1234567890:12@s.whatsapp.net"
        name: bizName      // Business name if applicable
    },
    signalIdentities: [
        ...(signalIdentities || []),
        identity
    ],
    platform: platformNode?.attrs.name
}
```

**Signal Identity:**
- Associates `accountSignatureKey` with JID
- Stored for future message encryption
- Used in Signal Protocol session setup

#### Step 7-8: Reply and Update

**Build Reply:**

```typescript
const reply: BinaryNode = {
    tag: 'iq',
    attrs: {
        to: S_WHATSAPP_NET,
        type: 'result',
        id: msgId
    },
    content: [{
        tag: 'pair-device-sign',
        attrs: {},
        content: [{
            tag: 'device-identity',
            attrs: { 'key-index': deviceIdentity.keyIndex.toString() },
            content: encodeSignedDeviceIdentity(account, false)
        }]
    }]
}
```

**Emit Events:**

```typescript
ev.emit('creds.update', updatedCreds)  // Triggers saveCreds()
ev.emit('connection.update', {
    isNewLogin: true,
    qr: undefined
})

await sendNode(reply)
```

**User Application Actions:**
- Save updated credentials to disk
- Clear QR code display
- Show "Connected" status

---

## Phase 8: Session Establishment

### 11. Pre-Key Upload

**File**: [src/Socket/socket.ts:631-641](src/Socket/socket.ts#L631-L641)

**Event**: `ws.on('CB:success', ...)`

#### Upload Pre-Keys to Server

```typescript
const uploadPreKeysToServerIfRequired = async () => {
    const preKeyCount = await getAvailablePreKeysOnServer()
    logger.info(`${preKeyCount} pre-keys found on server`)

    if (preKeyCount <= MIN_PREKEY_COUNT) {
        await uploadPreKeys()
    }
}

const uploadPreKeys = async (count = INITIAL_PREKEY_COUNT) => {
    await keys.transaction(async () => {
        logger.info({ count }, 'uploading pre-keys')
        const { update, node } = await getNextPreKeysNode({ creds, keys }, count)

        await query(node)
        ev.emit('creds.update', update)

        logger.info({ count }, 'uploaded pre-keys')
    })
}
```

**Pre-Key Bundle Structure:**

```typescript
{
    identityKey: signedIdentityKey.public,    // 32-byte Curve25519
    signedPreKey: {
        keyId: number,                         // Unique ID
        publicKey: Buffer,                     // 32-byte Curve25519
        signature: Buffer                      // 64-byte Ed25519
    },
    oneTimePreKeys: [
        { keyId: 1, publicKey: Buffer },      // 32-byte Curve25519
        { keyId: 2, publicKey: Buffer },
        { keyId: 3, publicKey: Buffer },
        // ... up to INITIAL_PREKEY_COUNT (typically 100)
    ]
}
```

**Cryptographic Properties:**

| Key Type | Algorithm | Lifetime | Purpose |
|----------|-----------|----------|---------|
| Identity Key | Curve25519 | Permanent | Long-term identity |
| Signed Pre Key | Curve25519 | Rotated periodically | Medium-term session key |
| One-Time Pre Key | Curve25519 | Single use | Consumed during session init |

**Usage in Signal Protocol:**

1. **Initiating Session**: Sender requests recipient's pre-keys
2. **ECDH Computation**: Multiple ECDH operations create master secret
3. **Session Keys**: Derived from master secret using HKDF
4. **One-Time Consumed**: Used once, then deleted from server

#### Send Passive IQ

```typescript
await sendPassiveIq('active')
```

**Purpose**: Tells server client is ready to receive messages

#### Update Credentials with LID

```typescript
ev.emit('creds.update', {
    me: {
        ...authState.creds.me,
        lid: node.attrs.lid  // Local ID from server
    }
})
```

#### Emit Connection Open

```typescript
ev.emit('connection.update', { connection: 'open' })
```

**At This Point:**
- ✅ Authentication complete
- ✅ Device registered as companion
- ✅ Signal protocol sessions can be established
- ✅ Pre-keys uploaded
- ✅ Ready to send/receive messages

---

## Cryptographic Summary

### Key Types and Parameters

| Key/Parameter | Algorithm | Size | Lifetime | Purpose |
|---------------|-----------|------|----------|---------|
| **Identity Key** | Curve25519 | 32 bytes | Install lifetime | Device identity |
| **Noise Key** | Curve25519 | 32 bytes | Install lifetime | Transport encryption |
| **Ephemeral Key** | Curve25519 | 32 bytes | Per connection | Noise handshake |
| **Signed Pre Key** | Curve25519 | 32 bytes | Rotated periodically | Session setup |
| **One-Time Pre Key** | Curve25519 | 32 bytes | Single use | Session initialization |
| **ADV Secret Key** | Random | 32 bytes | Install lifetime | HMAC verification |
| **Linking Secret** | Random | 32 bytes | Per QR | QR pairing |
| **Registration ID** | Random | 2 bytes | Install lifetime | Signal protocol |

### Cryptographic Algorithms Used

| Operation | Algorithm | Parameters |
|-----------|-----------|------------|
| **Key Agreement** | ECDH | Curve25519 |
| **Signatures** | Ed25519 | Curve25519 variant |
| **Symmetric Encryption** | AES-256-GCM | 256-bit key, 128-bit tag |
| **Key Derivation** | HKDF | SHA-256 |
| **Message Authentication** | HMAC | SHA-256 |
| **Hashing** | SHA-256 / SHA-512 | Various contexts |
| **Random Generation** | CSPRNG | System entropy |

### Signature Prefixes

| Purpose | Prefix | Hex | Context |
|---------|--------|-----|---------|
| Account Signature (Regular) | `[6, 0]` | 0x0600 | Primary signs companion |
| Account Signature (Cloud API) | `[6, 5]` | 0x0605 | Primary signs Cloud API |
| Device Signature (Regular) | `[6, 1]` | 0x0601 | Companion signs self |
| Device Signature (Cloud API) | `[6, 6]` | 0x0606 | Cloud API signs self |
| Device List | `[6, 2]` | 0x0602 | Primary signs device list |

---

## Security Properties

### Cryptographic Guarantees

#### 1. Authentication

**Multi-Level Authentication:**

- **Primary → Companion**:
  - Account Signature (Ed25519) proves primary authorized companion
  - HMAC proves primary scanned correct QR code

- **Companion → Primary**:
  - Device Signature (Ed25519) proves companion acknowledges pairing
  - HMAC verification proves companion generated the QR

- **Mutual**: Both signatures create bilateral attestation

**Verification Chain:**

```
QR Code (Lcompanion)
  → HMAC(Lcompanion, LinkingData)
    → Verify HMAC ✓
      → Asignature = Sign(Iprimary, Lmetadata || Icompanion)
        → Verify Asignature ✓
          → Dsignature = Sign(Icompanion, Lmetadata || Icompanion || Iprimary)
            → Upload to Server
              → Pairing Complete ✓
```

#### 2. Confidentiality

**Transport Layer:**
- **Noise Protocol**: Curve25519 + AES-256-GCM + SHA-256
- **Ephemeral Keys**: Unique per connection
- **Forward Secrecy**: Compromise of long-term keys doesn't decrypt past sessions

**Message Layer:**
- **Signal Protocol**: Double Ratchet with Curve25519
- **Per-Message Keys**: Each message has unique encryption key
- **Future Secrecy**: Compromise of current keys doesn't decrypt future messages

**Secrets Never Sent to Server:**
- `Lcompanion` (Linking Secret)
- All private keys
- Ephemeral secrets

#### 3. Integrity

**Message Integrity:**
- **HMAC-SHA256**: All linking data authenticated
- **AES-GCM**: Authenticated encryption (built-in MAC)
- **Ed25519 Signatures**: Account and device signatures

**Tampering Detection:**
- Device list signed by primary
- All QR components authenticated
- Transport layer includes MAC

#### 4. Forward Secrecy

**Noise Protocol:**
- Ephemeral keys unique per connection
- Compromise of `noiseKey` doesn't decrypt past connections
- Ephemeral keys deleted after handshake

**Signal Protocol:**
- Double Ratchet updates keys with every message
- One-time pre-keys consumed and deleted
- Chain keys ratchet forward (can't derive backward)

**Mathematical Property:**
```
Given: ChainKey[n+1] = HMAC(ChainKey[n], 0x02)
Cannot compute: ChainKey[n] from ChainKey[n+1]
```

#### 5. Replay Protection

**QR Code:**
- Unique `ref` nonce per QR
- QR expires (60s first, 20s subsequent)
- Cannot reuse old QR codes

**Messages:**
- Signature timestamps
- Message counters in Signal Protocol
- Nonces in AES-GCM encryption

#### 6. Man-in-the-Middle Prevention

**MITM Protections:**

1. **HMAC Binding**:
   - Server cannot forge PHMAC without `Lcompanion`
   - Companion verifies PHMAC proves primary scanned correct QR

2. **Signature Chain**:
   - Primary signs companion's identity
   - Companion signs binding to primary
   - Both signatures required

3. **Noise Protocol**:
   - Static-static DH prevents active MITM
   - Server cannot decrypt transport

4. **Key Fingerprinting**:
   - Users can verify 60-digit security codes
   - QR code verification available

### Attack Resistance

| Attack Vector | Mitigation |
|---------------|------------|
| **Replay Attacks** | Unique nonces, timestamps, message counters |
| **MITM** | HMAC binding, signature chain, Noise protocol |
| **Key Compromise (Past)** | Forward secrecy via ephemeral keys |
| **Key Compromise (Future)** | Future secrecy via key ratcheting |
| **Tampering** | HMAC, signatures, authenticated encryption |
| **Passive Eavesdropping** | End-to-end encryption, no plaintext on wire |
| **Server Collusion** | Server lacks private keys and secrets |
| **QR Interception** | Short lifetime, one-time use, HMAC binding |

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                  QR AUTHENTICATION FLOW                      │
└─────────────────────────────────────────────────────────────┘

[1] useMultiFileAuthState
     ↓
    Load or Generate Keys:
    - Identity Key (Curve25519)
    - Noise Key (Curve25519)
    - Signed Pre Key (Curve25519)
    - ADV Secret (Random 32 bytes)
     ↓
[2] makeSocket
     ↓
    Generate Ephemeral Key (Curve25519)
    Create Noise Handler
     ↓
[3] validateConnection
     ↓
    Noise Handshake:
    - Send: ephemeralPublic
    - Receive: serverEphemeralPublic
    - Compute: ECDH(ephemeralPrivate, serverEphemeralPublic)
    - Derive: encryptionKeys = HKDF(sharedSecret)
    - Encrypt: noiseKey.public → keyEnc
     ↓
[4] generateRegistrationNode
     ↓
    Build devicePairingData:
    - eIdent: identityKey.public
    - eSkeyVal: signedPreKey.public
    - eSkeySig: signature(identityKey, signedPreKey)
     ↓
[5] Client Finish
     ↓
    Encrypt and Send:
    - payloadEnc = AES-GCM(registrationNode)
    - Send: { static: keyEnc, payload: payloadEnc }
     ↓
[6] pair-device Event
     ↓
    Generate QR Code:
    - ref: server nonce
    - noiseKey.public (base64)
    - identityKey.public (base64)
    - advSecretKey (base64)
    - Format: "ref,noise,identity,adv"
     ↓
    ┌─────────────────────────────────────┐
    │  USER SCANS QR ON MOBILE PHONE      │
    └─────────────────────────────────────┘
     ↓
[7] Primary Device Actions (Mobile)
     ↓
    a) Parse QR, extract Icompanion, Lcompanion
    b) Generate Lmetadata, ListData
    c) Asignature = Sign(Iprimary, 0x0600 || Lmetadata || Icompanion)
    d) ListSignature = Sign(Iprimary, 0x0602 || ListData)
    e) Ldata = serialize(Lmetadata, Iprimary, Asignature)
    f) PHMAC = HMAC-SHA256(Lcompanion, Ldata)
    g) Send to server: ListData, ListSignature, Ldata, PHMAC
     ↓
[8] Server Forwards to Companion
     ↓
    Server forwards: Ldata, PHMAC
     ↓
[9] pair-success Event (Companion)
     ↓
    Companion Verifies:
    a) Verify PHMAC = HMAC-SHA256(Lcompanion, Ldata)
    b) Decode Ldata → Lmetadata, Iprimary, Asignature
    c) Verify Asignature = Verify(Iprimary, 0x0600 || Lmetadata || Icompanion)
    d) Generate Dsignature = Sign(Icompanion, 0x0601 || Lmetadata || Icompanion || Iprimary)
    e) Upload: Lmetadata, Asignature, Dsignature, Icompanion, preKeys
     ↓
[10] configureSuccessfulPairing
     ↓
    Verify HMAC:
    a) Decode ADVSignedDeviceIdentityHMAC
    b) Verify HMAC-SHA256(advSecretKey, details)
    c) Decode ADVSignedDeviceIdentity
    d) Verify accountSignature
    e) Generate deviceSignature
    f) Create Signal identity
    g) Update credentials
     ↓
[11] success Event
     ↓
    Final Steps:
    a) uploadPreKeysToServerIfRequired()
    b) sendPassiveIq('active')
    c) emit('creds.update', { me: { ...me, lid }})
    d) emit('connection.update', { connection: 'open' })
     ↓
┌─────────────────────────────────────────────────────────────┐
│              AUTHENTICATION COMPLETE                         │
│         Ready for End-to-End Encrypted Messaging            │
└─────────────────────────────────────────────────────────────┘
```

---

## Conclusion

The Baileys QR authentication flow implements WhatsApp's sophisticated multi-device pairing protocol with rigorous cryptographic security:

**Key Achievements:**

1. **Zero-Trust Server**: Server never has access to private keys or linking secrets
2. **Mutual Authentication**: Both primary and companion verify each other's identity
3. **Forward Secrecy**: Ephemeral keys protect past communications
4. **Tamper Detection**: Signatures and HMACs prevent unauthorized modifications
5. **Replay Prevention**: Unique nonces and short QR lifetimes
6. **MITM Resistance**: HMAC binding ensures QR code possession

**Cryptographic Stack:**

- **Key Exchange**: Curve25519 ECDH
- **Signatures**: Ed25519
- **Encryption**: AES-256-GCM
- **Key Derivation**: HKDF-SHA256
- **Authentication**: HMAC-SHA256
- **Transport**: Noise Protocol Framework

This implementation ensures that even if an attacker compromises the WhatsApp server, they cannot:
- Decrypt messages
- Impersonate devices
- Forge signatures
- Access private keys
- Replay old QR codes

The QR code authentication provides a secure, user-friendly method for linking companion devices while maintaining the strong security guarantees of end-to-end encryption.

---

## References

1. **WhatsApp Encryption Overview** - Technical White Paper, Version 8, August 19, 2024
2. **Signal Protocol Documentation** - https://signal.org/docs/
3. **Noise Protocol Framework** - http://noiseprotocol.org/
4. **Baileys Source Code** - https://github.com/WhiskeySockets/Baileys

---

**Document Version**: 1.0
**Last Updated**: December 21, 2025
**Author**: Cryptographic Analysis of Baileys Implementation

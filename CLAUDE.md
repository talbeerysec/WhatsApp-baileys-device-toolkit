# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Baileys is a TypeScript/JavaScript WhatsApp Web API library that connects directly to WhatsApp Web via WebSocket without requiring Selenium or browser automation. It implements the complete WhatsApp Web protocol including multi-device support, end-to-end encryption via Signal protocol, and comprehensive message handling.

## Development Commands

```bash
# Install dependencies
yarn

# Build the library
yarn build:tsc              # TypeScript compilation only
yarn build:all              # Build + generate docs
yarn build:docs             # Generate TypeDoc documentation

# Development and testing
yarn example                # Run interactive example with CLI
yarn test                   # Run Jest tests
yarn lint                   # ESLint validation
yarn lint:fix               # Auto-fix ESLint issues

# Release management
yarn changelog:preview      # Preview changelog
yarn changelog:update       # Update changelog
yarn release                # Create release with release-it
```

## Core Architecture

### Socket Layer Composition
The library uses a layered socket architecture where each layer adds functionality:

1. **Base Socket** (`src/Socket/socket.ts`) - Core WebSocket connection, authentication, and protocol handling
2. **Messages Layer** (`src/Socket/messages-send.ts`, `messages-recv.ts`) - Message sending/receiving, encryption/decryption 
3. **Groups Layer** (`src/Socket/groups.ts`) - Group management operations
4. **Chats Layer** (`src/Socket/chats.ts`) - Chat state management 
5. **Business Layer** (`src/Socket/business.ts`) - Final layer with business account features

The main export `makeWASocket()` creates a business socket with all layers composed.

### Authentication System
- **Signal Protocol Integration** (`src/Signal/libsignal.ts`) - E2E encryption using libsignal-node
- **Auth State Management** (`src/Utils/auth-utils.ts`) - Session persistence and key management
- **Multi-File Auth State** (`src/Utils/use-multi-file-auth-state.ts`) - File-based session storage

### Binary Protocol Implementation
- **WABinary** (`src/WABinary/`) - WhatsApp's custom binary protocol encoder/decoder
- **JID Utils** (`src/WABinary/jid-utils.ts`) - WhatsApp ID manipulation (users, groups, devices)
- **Message Processing** (`src/Utils/process-message.ts`) - Raw message parsing and validation

### Data Storage
- **In-Memory Store** (`src/Store/make-in-memory-store.ts`) - Complete chat/contact/message storage
- **Cache Manager Store** (`src/Store/make-cache-manager-store.ts`) - Redis/external cache integration
- **Ordered Dictionary** (`src/Store/make-ordered-dictionary.ts`) - Efficient message ordering

### Device-Specific Operations
The library supports multi-device targeting:
- **Device Resolution** via `getUSyncDevices()` - Discover available devices per user
- **Device-Specific Messaging** via `relayMessage()` with `participant` parameter
- **JID Format**: `user@s.whatsapp.net` (all devices) vs `user:deviceId@s.whatsapp.net` (specific device)

## Key Protocol Concepts

### Message Flow
1. **Message Generation** - `generateWAMessage()` creates message with metadata
2. **Device Resolution** - `getUSyncDevices()` finds target devices  
3. **Encryption** - Signal protocol encrypts per-device
4. **Binary Encoding** - `encodeWAMessage()` converts to WhatsApp binary format
5. **WebSocket Send** - `relayMessage()` transmits over WebSocket
6. **Receipts** - ACK (protocol-level) vs Receipt (user-level read confirmations)

### Authentication Flow
1. **QR Code/Pairing** - Initial authentication 
2. **Session Keys** - Signal protocol session establishment
3. **Auth State** - Credentials + keys saved to `useMultiFileAuthState()`
4. **Reconnection** - Automatic reconnect using saved auth state

### Event System
The socket uses EventEmitter pattern with typed events:
- `connection.update` - Connection state changes
- `messages.upsert` - New/updated messages
- `chats.update` - Chat metadata changes  
- `contacts.update` - Contact information updates
- `creds.update` - Authentication credentials updated (save trigger)

## Example Usage Pattern

The interactive example (`Example/example.ts`) demonstrates the complete integration:
1. **Authentication** setup with QR/pairing code
2. **Store binding** for message persistence  
3. **Event handling** for all message types
4. **Device-specific operations** like `silentping` and targeted messaging
5. **CLI interface** for testing all functionality

## WhatsApp Protocol Specifics

### Message Types
- Regular messages use `conversation` field for text
- Media messages require upload to WhatsApp servers first
- Reactions target existing messages by `WAMessageKey`
- Polls support multiple options with vote aggregation

### Group Operations  
- Groups identified by `groupId@g.us` format
- Metadata includes participants, permissions, settings
- Operations require admin privileges for modification

### Multi-Device Handling
- Primary device: deviceId `0` or omitted
- Secondary devices: deviceId `1`, `2`, etc.
- Device-specific JIDs: `user:deviceId@s.whatsapp.net`
- Message fanout controlled via `participant` parameter in `relayMessage()`

## Testing

Tests are in `src/Tests/` and focus on:
- **Key Store Operations** - Authentication key management
- **Message Processing** - Encryption/decryption flows  
- **Media Download** - File handling and upload/download
- **App State Sync** - Cross-device state synchronization

Run specific test files with: `yarn test test.messages.ts`

### Test File Structure
Jest is configured to find tests in `src/Tests/` with pattern `test.*.+(ts|tsx|js)`:
- `test.app-state-sync.ts` - Cross-device state synchronization
- `test.event-buffer.ts` - Event buffering and ordering
- `test.key-store.ts` - Authentication key management  
- `test.libsignal.ts` - Signal protocol operations
- `test.media-download.ts` - File handling and upload/download
- `test.messages.ts` - Message encryption/decryption flows

## TypeScript Configuration

The project uses TypeScript with:
- **Target**: ES2018 with CommonJS modules
- **Output**: Compiled to `lib/` directory
- **Strict Mode**: Partially enabled (strictNullChecks only)
- **Exclusions**: Tests and protobuf generation scripts excluded from build

## Protocol Buffers

WhatsApp protocol definitions are in `WAProto/`:
```bash
yarn gen:protobuf    # Regenerate protobuf statics from WAProto.proto
```

The `WAProto.proto` file contains the complete WhatsApp protocol schema. Run this command when updating protocol definitions.

## Build Artifacts

- **Source**: `src/` (TypeScript)
- **Built**: `lib/` (JavaScript + declarations)
- **Distribution**: Includes `lib/*`, `WAProto/*`, `WASignalGroup/*.js`
- **Entry Point**: `lib/index.js` with types at `lib/index.d.ts`
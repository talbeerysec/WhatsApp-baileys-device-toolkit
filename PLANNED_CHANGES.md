# Planned Changes for Message Editing Feature

## Changes to Apply (in order):

### 1. Fix TypeScript Build Issues (prerequisite)
- **File**: `web-ui/server/tsconfig.json`
  - Remove `"rootDir": "./src"` OR add `"../shared/**/*"` to includes

- **File**: `web-ui/server/src/services/whatsapp.ts` (lines 390, 478)
  - Change `result.key.id!` to `result?.key.id || ''` (safe null handling)

### 2. Add EditMessageRequest Type
- **File**: `web-ui/shared/types/api.ts`
  - Add after SendToDeviceRequest:
```typescript
export interface EditMessageRequest {
  user: string;
  deviceId: number;
  originalMessageId: string;
  newText: string;
  originalTimestamp?: number; // Unix timestamp in seconds when original message was sent (optional, for research/testing)
  editTimestamp?: number; // Unix timestamp in seconds for the edit (optional, for research/testing - test if 15min limit is client-side)
}
```

### 3. Add Backend editMessage Method
- **File**: `web-ui/server/src/services/whatsapp.ts`
  - Add method after `sendMessageToDevice()` (around line 441)
  - Full implementation saved in git stash

### 4. Add Validation for Required Message ID
- **File**: `web-ui/server/src/middleware/validation.ts`
  - Add after validateMessageId:
```typescript
// Message ID validation (required)
export const validateRequiredMessageId = (field: string) =>
  body(field)
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('Message ID is required and must be valid format');
```

### 5. Add API Route for Edit
- **File**: `web-ui/server/src/routes/messages.ts`
  - Import `validateRequiredMessageId`
  - Add route before `/read` endpoint
  - POST /api/messages/edit

### 6. Add Frontend API Client Method
- **File**: `web-ui/client/src/services/api.ts`
  - Import EditMessageRequest type
  - Add editMessage() method after sendReaction()

### 7. Add UI Components
- **File**: `web-ui/client/src/pages/DevicesPage.tsx`
  - Add state variables for message sending and editing
  - Add handleSendTextMessage() handler
  - Add handleEditMessage() handler
  - Add copyMessageId() helper
  - Add "Send Text Message" card section
  - Add "Edit Message (Research Mode)" card section

## Testing After Each Change:
1. Build server: `npm run build:server`
2. Restart server
3. Test pings still work
4. Continue to next change

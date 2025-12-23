// Shared API types between client and server

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AuthRequest {
  password: string;
}

export interface AuthResponse {
  token: string;
  expiresIn: number;
}

export interface ConnectionStatus {
  state: 'open' | 'connecting' | 'close';
  isAuthenticated: boolean;
  user?: {
    id: string;
    name: string;
  };
  lastUpdate: string;
  baileysVersion?: string;
  errorMessage?: string;
}

export interface ChatInfo {
  id: string;
  name?: string;
  unreadCount?: number;
  lastMessage?: {
    text: string;
    timestamp: number;
    fromMe: boolean;
  };
}

export interface ContactInfo {
  id: string;
  name?: string;
  notify?: string;
  isBlocked?: boolean;
}

export interface UserProfile {
  jid: string;              // WhatsApp JID
  phoneNumber: string;      // Phone number (formatted)
  contactName?: string;     // Name saved in your contacts (if contact exists)
  displayName?: string;     // User's self-set WhatsApp display name (notify)
  profilePictureUrl?: string | null; // Profile picture URL (null = default profile pic)
  verifiedName?: string;    // Business account verified name
  about?: string;           // User's status/about message
}

export interface DeviceInfo {
  user: string;
  device?: number;
}

export interface DeviceStatus {
  user: string;
  deviceId: number;
  status: 'online' | 'offline' | 'checking' | 'unknown';
  lastCheck?: string; // ISO timestamp
  responseTime?: number; // milliseconds
  fingerprint?: {
    reactionPing?: 'success' | 'timeout' | 'failed' | 'pending';
    deletePing?: 'success' | 'timeout' | 'failed' | 'pending';
    callRejectPing?: 'success' | 'timeout' | 'failed' | 'pending';
    detectedOS?: 'android' | 'ios' | 'unknown';
    detectedSecondaryType?: 'desktop' | 'browser' | 'unknown';
    lastFingerprint?: string; // ISO timestamp
  };
  passiveInference?: {
    os: 'android' | 'apple' | 'windows' | 'web' | 'unknown';
    formFactor: 'mobile' | 'desktop';
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
  };
}

export interface SendMessageRequest {
  jid: string;
  message: string;
  type?: 'text' | 'reaction';
  timestamp?: number; // Unix timestamp in seconds (optional, for research/testing)
}

export interface SendToDeviceRequest {
  user: string;
  deviceId: number;
  message: string;
  timestamp?: number; // Unix timestamp in seconds (optional, for research/testing)
}

export interface EditMessageRequest {
  user: string;
  deviceId: number;
  originalMessageId: string;
  newText: string;
  originalTimestamp?: number; // Unix timestamp in seconds when original message was sent (optional, for research/testing)
  editTimestamp?: number; // Unix timestamp in seconds for the edit (optional, for research/testing - test if 15min limit is client-side)
}

export interface ReactRequest {
  user: string;
  messageId?: string;
  reaction: string;
}

export interface PresenceRequest {
  jid: string;
  presence: 'available' | 'unavailable' | 'composing' | 'recording' | 'paused';
}

export interface SilentPingRequest {
  user: string;
  deviceId: number;
  type?: 'reaction' | 'delete' | 'edit' | 'call-reject' | 'unknown' | 'poll-response' | 'button-response' | 'device-sent' | 'app-state' | 'peer-data-operation' | 'malformed-message'; // Default is 'reaction' for backward compatibility
}

export interface SilentPingResult {
  user: string;
  deviceId: number;
  messageId: string;
  timestamp: number;
  status: 'sent' | 'ack' | 'delivered' | 'read' | 'failed' | 'timeout';
  type: 'reaction' | 'delete' | 'edit' | 'call-reject' | 'unknown' | 'poll-response' | 'button-response' | 'device-sent' | 'app-state' | 'peer-data-operation' | 'malformed-message';
  roundTripTime?: number;
  error?: string;
}

export interface CorruptMessageRequest {
  user: string;
  deviceId: number;
  message: string;
}

export interface MessageResponse {
  messageId: string;
  success: boolean;
}

export interface PrekeyBundle {
  identityKey: string; // Hex encoded public identity key
  signedPreKey: {
    keyId: string; // Hex format (0x-prefixed, zero-padded)
    publicKey: string; // Hex encoded
    signature: string; // Hex encoded
  };
  signedIdentityKey?: {
    details: string; // Hex encoded
    accountSignatureKey: string; // Hex encoded
    accountSignature: string; // Hex encoded
    deviceSignature: string; // Hex encoded
  };
  preKey?: {
    keyId: string; // Hex format (0x-prefixed, zero-padded)
    publicKey: string; // Hex encoded
  };
  registrationId: string; // Hex format (0x-prefixed, zero-padded)
  advSecretKey?: string; // Hex encoded
}

export interface DevicePrekeyData {
  user: string;
  deviceId: number;
  prekeyBundle?: PrekeyBundle;
  error?: string;
  fetchedAt?: string; // ISO timestamp
  osInference?: {
    os: 'android' | 'apple' | 'windows' | 'web' | 'unknown';
    formFactor: 'mobile' | 'desktop';
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
  };
}

export interface PrekeyData {
  phoneNumber: string;
  devices: DevicePrekeyData[];
  fetchedAt: string; // ISO timestamp
}
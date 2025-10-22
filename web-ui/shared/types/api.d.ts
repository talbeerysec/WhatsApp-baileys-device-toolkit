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
export interface DeviceInfo {
    user: string;
    device?: number;
}
export interface DeviceStatus {
    user: string;
    deviceId: number;
    status: 'online' | 'offline' | 'checking' | 'unknown';
    lastCheck?: string;
    responseTime?: number;
    fingerprint?: {
        reactionPing?: 'success' | 'timeout' | 'failed' | 'pending';
        deletePing?: 'success' | 'timeout' | 'failed' | 'pending';
        callRejectPing?: 'success' | 'timeout' | 'failed' | 'pending';
        detectedOS?: 'android' | 'ios' | 'unknown';
        detectedSecondaryType?: 'desktop' | 'browser' | 'unknown';
        lastFingerprint?: string;
    };
}
export interface SendMessageRequest {
    jid: string;
    message: string;
    type?: 'text' | 'reaction';
}
export interface SendToDeviceRequest {
    user: string;
    deviceId: number;
    message: string;
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
    type?: 'reaction' | 'delete' | 'edit' | 'call-reject' | 'unknown' | 'poll-response' | 'button-response' | 'device-sent' | 'app-state' | 'peer-data-operation' | 'malformed-message';
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
//# sourceMappingURL=api.d.ts.map
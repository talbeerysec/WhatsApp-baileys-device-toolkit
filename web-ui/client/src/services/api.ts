import axios, { AxiosResponse } from 'axios';
import {
  ApiResponse,
  AuthRequest,
  AuthResponse,
  ConnectionStatus,
  ChatInfo,
  ContactInfo,
  DeviceInfo,
  SendMessageRequest,
  SendToDeviceRequest,
  EditMessageRequest,
  ReactRequest,
  PresenceRequest,
  SilentPingRequest,
  CorruptMessageRequest,
  MessageResponse
} from '../../../shared/types/api';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || '';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export class ApiService {
  // Authentication
  static async login(password: string): Promise<AuthResponse> {
    const response: AxiosResponse<ApiResponse<AuthResponse>> = await api.post('/api/auth/login', {
      password
    } as AuthRequest);
    
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Login failed');
    }
    
    return response.data.data;
  }

  static async logout(): Promise<void> {
    await api.post('/api/auth/logout');
    localStorage.removeItem('auth_token');
  }

  static async verifyToken(): Promise<boolean> {
    try {
      const response: AxiosResponse<ApiResponse> = await api.get('/api/auth/verify');
      return response.data.success;
    } catch {
      return false;
    }
  }

  // Status
  static async getConnectionStatus(): Promise<ConnectionStatus> {
    const response: AxiosResponse<ApiResponse<ConnectionStatus>> = await api.get('/api/status');
    
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get status');
    }
    
    return response.data.data;
  }

  // Chats
  static async getChats(): Promise<ChatInfo[]> {
    const response: AxiosResponse<ApiResponse<ChatInfo[]>> = await api.get('/api/chats');
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get chats');
    }
    
    return response.data.data || [];
  }

  // Contacts
  static async getContacts(): Promise<ContactInfo[]> {
    const response: AxiosResponse<ApiResponse<ContactInfo[]>> = await api.get('/api/contacts');
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get contacts');
    }
    
    return response.data.data || [];
  }

  // Devices
  static async getDevices(user: string): Promise<DeviceInfo[]> {
    const response: AxiosResponse<ApiResponse<DeviceInfo[]>> = await api.get(`/api/devices/${user}`);
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get devices');
    }
    
    return response.data.data || [];
  }

  static async silentPing(request: SilentPingRequest): Promise<void> {
    const response: AxiosResponse<ApiResponse> = await api.post('/api/devices/ping', request);
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to send silent ping');
    }
  }

  // Messages
  static async sendMessage(request: SendMessageRequest): Promise<MessageResponse> {
    const response: AxiosResponse<ApiResponse<MessageResponse>> = await api.post('/api/messages/send', request);
    
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to send message');
    }
    
    return response.data.data;
  }

  static async sendToDevice(request: SendToDeviceRequest): Promise<MessageResponse> {
    const response: AxiosResponse<ApiResponse<MessageResponse>> = await api.post('/api/messages/device', request);
    
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to send message to device');
    }
    
    return response.data.data;
  }

  static async sendReaction(request: ReactRequest): Promise<MessageResponse> {
    const response: AxiosResponse<ApiResponse<MessageResponse>> = await api.post('/api/messages/react', request);

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to send reaction');
    }

    return response.data.data;
  }

  static async editMessage(request: EditMessageRequest): Promise<MessageResponse> {
    const response: AxiosResponse<ApiResponse<MessageResponse>> = await api.post('/api/messages/edit', request);

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to edit message');
    }

    return response.data.data;
  }

  static async markAsRead(jid: string): Promise<void> {
    const response: AxiosResponse<ApiResponse> = await api.post('/api/messages/read', { jid });
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to mark messages as read');
    }
  }

  // Presence
  static async updatePresence(request: PresenceRequest): Promise<void> {
    const response: AxiosResponse<ApiResponse> = await api.post('/api/presence/update', request);
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update presence');
    }
  }

  // Developer tools (admin only)
  static async sendCorruptedMessage(request: CorruptMessageRequest): Promise<void> {
    const response: AxiosResponse<ApiResponse> = await api.post('/api/dev/corrupt-message', request);
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to send corrupted message');
    }
  }
}

export default api;
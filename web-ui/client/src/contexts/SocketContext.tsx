import React, { createContext, useContext, useEffect, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useWhatsApp } from './WhatsAppContext';

interface SocketContextType {
  socket: Socket | null;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const { updateConnectionStatus, updateChats, updateContacts } = useWhatsApp();
  const [socket, setSocket] = React.useState<Socket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      console.log('🔐 No auth token found, skipping socket connection');
      return;
    }

    console.log('🔌 Creating new socket connection...');
    const socketInstance = io((import.meta as any).env?.VITE_API_URL || 'http://localhost:3001', {
      auth: {
        token
      },
      transports: ['websocket', 'polling'],
      forceNew: true, // Force new connection to avoid reuse issues
      timeout: 20000, // 20 second timeout
    });

    // Set up event handlers before connecting
    socketInstance.on('connect', () => {
      console.log('✅ Connected to server with ID:', socketInstance.id);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('🔌 Disconnected from server:', reason);
    });

    socketInstance.on('connection.status', (status) => {
      console.log('📱 Connection status update:', status);
      updateConnectionStatus(status);
    });

    socketInstance.on('chats.update', (chats) => {
      console.log('💬 Chats updated:', chats.length);
      updateChats(chats);
    });

    socketInstance.on('contacts.update', (contacts) => {
      console.log('👥 Contacts updated:', contacts.length);
      updateContacts(contacts);
    });

    socketInstance.on('messages.upsert', (upsert) => {
      console.log('📨 New messages:', upsert);
      // Trigger chats refresh when new messages arrive
      socketInstance.emit('request.chats');
    });

    socketInstance.on('qr', (qr) => {
      console.log('📱 QR code received, length:', qr ? qr.length : 0);
    });

    socketInstance.on('connect_error', (error) => {
      console.error('❌ Connection error:', error.message);
    });

    // Set socket after creating and configuring
    setSocket(socketInstance);

    return () => {
      console.log('🧹 Cleaning up socket connection...');
      socketInstance.removeAllListeners();
      socketInstance.disconnect();
      setSocket(null);
    };
  }, []); // Empty dependency array - only run once on mount

  const value = {
    socket,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};
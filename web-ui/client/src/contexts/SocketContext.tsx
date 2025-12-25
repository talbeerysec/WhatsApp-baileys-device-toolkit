import React, { createContext, useContext, useEffect, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

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
  const [socket, setSocket] = React.useState<Socket | null>(null);
  console.log('🔄 SocketProvider rendering, socket:', socket ? 'exists' : 'null');

  useEffect(() => {
    console.log('🔌 SocketProvider effect triggered');
    const token = localStorage.getItem('auth_token');
    if (!token) {
      console.log('🔐 No auth token found, skipping socket connection');
      return;
    }

    console.log('🔌 Creating new socket connection...');
    // Use empty string for production (nginx proxy) or explicit URL for development
    // Empty string tells Socket.io to connect to same origin
    const socketUrl = (import.meta as any).env?.VITE_API_URL || '';
    const socketInstance = io(socketUrl, {
      auth: {
        token
      },
      transports: ['websocket', 'polling'],
      forceNew: true, // Force new connection to avoid reuse issues
      timeout: 20000, // 20 second timeout
    });

    // Set up basic event handlers
    socketInstance.on('connect', () => {
      console.log('✅ Connected to server with ID:', socketInstance.id);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('🔌 Disconnected from server:', reason);
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
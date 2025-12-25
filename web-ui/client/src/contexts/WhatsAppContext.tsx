import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ConnectionStatus, ChatInfo, ContactInfo } from '../../../shared/types/api';
import { ApiService } from '../services/api';
import { useSocket } from './SocketContext';
import { persistentLogger } from '../utils/persistentLogger';

interface WhatsAppContextType {
  connectionStatus: ConnectionStatus;
  chats: ChatInfo[];
  contacts: ContactInfo[];
  isLoading: boolean;
  errorMessage: string;
  serverReady: boolean;
  refreshData: () => Promise<void>;
  updateConnectionStatus: (status: ConnectionStatus) => void;
  updateChats: (chats: ChatInfo[]) => void;
  updateContacts: (contacts: ContactInfo[]) => void;
  setServerReady: (ready: boolean) => void;
}

const WhatsAppContext = createContext<WhatsAppContextType | undefined>(undefined);

export const useWhatsApp = () => {
  const context = useContext(WhatsAppContext);
  if (context === undefined) {
    throw new Error('useWhatsApp must be used within a WhatsAppProvider');
  }
  return context;
};

interface WhatsAppProviderProps {
  children: ReactNode;
}

export const WhatsAppProvider: React.FC<WhatsAppProviderProps> = ({ children }) => {
  const { socket } = useSocket();
  persistentLogger.log('🔄 WhatsAppProvider rendering, socket:', socket ? 'connected' : 'null');

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    state: 'close',
    isAuthenticated: false,
    lastUpdate: new Date().toISOString()
  });
  const [chats, setChats] = useState<ChatInfo[]>([]);
  const [contacts, setContacts] = useState<ContactInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [serverReady, setServerReady] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  persistentLogger.log('📊 WhatsAppProvider state:', {
    isLoading,
    serverReady,
    hasInitialized,
    chatsCount: chats.length,
    contactsCount: contacts.length,
    connectionState: connectionStatus.state
  });

  const refreshData = useCallback(async (retryCount = 0) => {
    const maxRetries = 3;

    try {
      setIsLoading(true);
      setErrorMessage('');

      const [statusData, chatsData, contactsData] = await Promise.all([
        ApiService.getConnectionStatus(),
        ApiService.getChats(),
        ApiService.getContacts()
      ]);

      setConnectionStatus(statusData);
      setChats(chatsData);
      setContacts(contactsData);
      persistentLogger.log(`✅ Data loaded successfully: ${chatsData.length} chats, ${contactsData.length} contacts`);
    } catch (error) {
      console.error('Failed to refresh data:', error);

      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setErrorMessage(`Failed to load data: ${errorMsg}`);

      // Retry with exponential backoff if we haven't exceeded max retries
      if (retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        persistentLogger.log(`Retrying data fetch (attempt ${retryCount + 1}/${maxRetries}) in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return refreshData(retryCount + 1);
      } else {
        console.error('Max retries exceeded, giving up');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    persistentLogger.log('📊 WhatsAppProvider data fetch effect triggered', {
      hasInitialized,
      serverReady,
      isLoading,
      chatsLength: chats.length,
      contactsLength: contacts.length
    });

    // Only run initial data fetch once
    if (hasInitialized) {
      persistentLogger.log('⏭️ Already initialized, skipping data fetch');
      return;
    }

    // Wait for server:ready signal OR timeout before fetching data
    // This prevents blank screens when server is still syncing contacts/chats
    let timer: ReturnType<typeof setTimeout>;

    const fetchData = async () => {
      persistentLogger.log('🚀 Starting initial data fetch', {
        serverReady,
        timestamp: new Date().toISOString()
      });
      await refreshData();
      persistentLogger.log('✅ Data fetch completed, setting hasInitialized=true');
      setHasInitialized(true);
    };

    if (serverReady) {
      // Server already ready, fetch immediately
      persistentLogger.log('✅ Server ready signal received, fetching data now');
      fetchData();
    } else {
      // Wait up to 3 seconds for server:ready, then fetch anyway
      persistentLogger.log('⏳ Server not ready yet, setting 3 second timeout...');
      timer = setTimeout(() => {
        persistentLogger.log('⏱️ Timeout waiting for server:ready, fetching data anyway');
        fetchData();
      }, 3000);
    }

    return () => {
      if (timer) {
        persistentLogger.log('🧹 Cleaning up data fetch timer');
        clearTimeout(timer);
      }
    };
  }, [serverReady, hasInitialized, refreshData]);

  const updateConnectionStatus = useCallback((status: ConnectionStatus) => {
    setConnectionStatus(status);
  }, []);

  const updateChats = useCallback((newChats: ChatInfo[]) => {
    setChats(newChats);
  }, []);

  const updateContacts = useCallback((newContacts: ContactInfo[]) => {
    setContacts(newContacts);
  }, []);

  // Subscribe to socket events
  useEffect(() => {
    if (!socket) {
      persistentLogger.log('⏳ WhatsAppProvider waiting for socket...');
      return;
    }

    persistentLogger.log('🔌 WhatsAppProvider subscribing to socket events');

    const handleConnectionStatus = (status: ConnectionStatus) => {
      persistentLogger.log('📱 Connection status update:', status);
      updateConnectionStatus(status);
    };

    const handleChatsUpdate = (chats: ChatInfo[]) => {
      persistentLogger.log('💬 Chats updated:', chats?.length);
      // Guard against undefined/null - always use array
      updateChats(Array.isArray(chats) ? chats : []);
    };

    const handleContactsUpdate = (contacts: ContactInfo[]) => {
      persistentLogger.log('👥 Contacts updated:', contacts?.length);
      // Guard against undefined/null - always use array
      updateContacts(Array.isArray(contacts) ? contacts : []);
    };

    const handleMessagesUpsert = (upsert: any) => {
      persistentLogger.log('📨 New messages:', upsert);
      // Trigger chats refresh when new messages arrive
      socket.emit('request.chats');
    };

    const handleServerReady = (ready: boolean) => {
      persistentLogger.log('✅ Server ready signal received:', ready);
      setServerReady(true);
    };

    // Subscribe to events
    socket.on('connection.status', handleConnectionStatus);
    socket.on('chats.update', handleChatsUpdate);
    socket.on('contacts.update', handleContactsUpdate);
    socket.on('messages.upsert', handleMessagesUpsert);
    socket.on('server:ready', handleServerReady);

    return () => {
      persistentLogger.log('🧹 WhatsAppProvider unsubscribing from socket events');
      socket.off('connection.status', handleConnectionStatus);
      socket.off('chats.update', handleChatsUpdate);
      socket.off('contacts.update', handleContactsUpdate);
      socket.off('messages.upsert', handleMessagesUpsert);
      socket.off('server:ready', handleServerReady);
    };
  }, [socket, updateConnectionStatus, updateChats, updateContacts]);

  const value = {
    connectionStatus,
    chats,
    contacts,
    isLoading,
    errorMessage,
    serverReady,
    refreshData,
    updateConnectionStatus,
    updateChats,
    updateContacts,
    setServerReady,
  };

  return <WhatsAppContext.Provider value={value}>{children}</WhatsAppContext.Provider>;
};
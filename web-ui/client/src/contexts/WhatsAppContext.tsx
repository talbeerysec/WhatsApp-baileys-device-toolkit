import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ConnectionStatus, ChatInfo, ContactInfo } from '../../../shared/types/api';
import { ApiService } from '../services/api';

interface WhatsAppContextType {
  connectionStatus: ConnectionStatus;
  chats: ChatInfo[];
  contacts: ContactInfo[];
  isLoading: boolean;
  refreshData: () => Promise<void>;
  updateConnectionStatus: (status: ConnectionStatus) => void;
  updateChats: (chats: ChatInfo[]) => void;
  updateContacts: (contacts: ContactInfo[]) => void;
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
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    state: 'close',
    isAuthenticated: false,
    lastUpdate: new Date().toISOString()
  });
  const [chats, setChats] = useState<ChatInfo[]>([]);
  const [contacts, setContacts] = useState<ContactInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshData = async (retryCount = 0) => {
    const maxRetries = 3;

    try {
      setIsLoading(true);
      const [statusData, chatsData, contactsData] = await Promise.all([
        ApiService.getConnectionStatus(),
        ApiService.getChats(),
        ApiService.getContacts()
      ]);

      setConnectionStatus(statusData);
      setChats(chatsData);
      setContacts(contactsData);
    } catch (error) {
      console.error('Failed to refresh data:', error);

      // Retry if this is the first attempt and we haven't exceeded max retries
      if (retryCount < maxRetries) {
        console.log(`Retrying data fetch (attempt ${retryCount + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return refreshData(retryCount + 1);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Small delay before initial fetch to let server initialize
    const timer = setTimeout(() => {
      refreshData();
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  const updateConnectionStatus = useCallback((status: ConnectionStatus) => {
    setConnectionStatus(status);
  }, []);

  const updateChats = useCallback((newChats: ChatInfo[]) => {
    setChats(newChats);
  }, []);

  const updateContacts = useCallback((newContacts: ContactInfo[]) => {
    setContacts(newContacts);
  }, []);

  const value = {
    connectionStatus,
    chats,
    contacts,
    isLoading,
    refreshData,
    updateConnectionStatus,
    updateChats,
    updateContacts,
  };

  return <WhatsAppContext.Provider value={value}>{children}</WhatsAppContext.Provider>;
};
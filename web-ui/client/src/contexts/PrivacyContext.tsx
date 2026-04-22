import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface PrivacyContextType {
  privacyMode: boolean;
  togglePrivacyMode: () => void;
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined);

export const usePrivacy = () => {
  const context = useContext(PrivacyContext);
  if (context === undefined) {
    throw new Error('usePrivacy must be used within a PrivacyProvider');
  }
  return context;
};

interface PrivacyProviderProps {
  children: ReactNode;
}

export const PrivacyProvider: React.FC<PrivacyProviderProps> = ({ children }) => {
  const [privacyMode, setPrivacyMode] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('privacy_mode');
      return stored === 'true';
    } catch {
      return false;
    }
  });

  const togglePrivacyMode = useCallback(() => {
    setPrivacyMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('privacy_mode', String(next));
      } catch {
        // localStorage may be unavailable
      }
      return next;
    });
  }, []);

  const value = {
    privacyMode,
    togglePrivacyMode,
  };

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
};

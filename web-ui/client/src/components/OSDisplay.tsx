import React from 'react';
import { Box, Typography } from '@mui/material';
import {
  Android as AndroidIcon,
  Apple as AppleIcon,
  PhoneAndroid as MobileIcon,
  Laptop as LaptopIcon,
  Language as WebIcon,
  DeviceUnknown as UnknownDeviceIcon,
  SmartToy as BaileysIcon
} from '@mui/icons-material';
import { WindowsIcon } from './WindowsIcon';

export type OSType = 'android' | 'apple' | 'windows' | 'web' | 'web-or-windows' | 'baileys' | 'unknown';
export type FormFactorType = 'mobile' | 'desktop';

interface OSDisplayProps {
  os: OSType;
  formFactor?: FormFactorType;
  label?: string;
  showIcon?: boolean;
  showLabel?: boolean;
  iconSize?: 'small' | 'medium' | 'large';
  variant?: 'caption' | 'body2' | 'body1';
}

const OS_CONFIG: Record<OSType, {
  icon: React.ElementType;
  label: string;
  color: string;
}> = {
  android: { icon: AndroidIcon, label: 'Android', color: '#3DDC84' },
  apple: { icon: AppleIcon, label: 'Apple', color: '#555555' },
  windows: {
    icon: WindowsIcon,
    label: 'Windows',
    color: '#0078D4'
  },
  web: {
    icon: WebIcon,
    label: 'Web',
    color: '#4285F4'
  },
  'web-or-windows': {
    icon: WebIcon, // Will show both icons in the component
    label: 'Web or Windows',
    color: '#6B6B6B' // Neutral color between web and windows
  },
  baileys: {
    icon: BaileysIcon, // Robot icon for Baileys/clawd
    label: 'Baileys/Clawd',
    color: '#9C27B0' // Purple color for third-party clients
  },
  unknown: { icon: UnknownDeviceIcon, label: 'Unknown', color: '#9E9E9E' }
};

const FORM_FACTOR_CONFIG: Record<FormFactorType, {
  icon: React.ElementType;
  label: string;
  color: string;
}> = {
  mobile: { icon: MobileIcon, label: 'Mobile', color: '#666666' },
  desktop: { icon: LaptopIcon, label: 'Desktop', color: '#999999' }
};

export const OSDisplay: React.FC<OSDisplayProps> = ({
  os,
  formFactor,
  label,
  showIcon = true,
  showLabel = true,
  iconSize = 'small',
  variant = 'caption'
}) => {
  const osConfig = OS_CONFIG[os];

  // Safety check: if os is invalid, return null to prevent crashes
  if (!osConfig) {
    console.error(`Invalid OS type: ${os}`);
    return null;
  }

  const OSIcon = osConfig.icon;

  const formFactorConfig = formFactor ? FORM_FACTOR_CONFIG[formFactor] : null;
  const FormFactorIcon = formFactorConfig?.icon;

  // Generate display label based on OS and form factor
  let displayLabel = label;
  if (!displayLabel) {
    if (os === 'android' && formFactor) {
      displayLabel = formFactor === 'mobile' ? 'Android Mobile' : 'Android Desktop';
    } else if (os === 'apple' && formFactor) {
      displayLabel = formFactor === 'mobile' ? 'Apple iOS' : 'Apple Mac';
    } else if (os === 'windows') {
      displayLabel = 'Windows Desktop';
    } else if (os === 'web') {
      displayLabel = 'Web';
    } else if (os === 'web-or-windows') {
      displayLabel = 'Web or Windows Desktop';
    } else if (os === 'baileys') {
      displayLabel = 'Baileys/Clawd';
    } else {
      displayLabel = osConfig.label;
    }
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {showIcon && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, position: 'relative' }}>
          {/* Form Factor Icon (Mobile/Desktop) */}
          {FormFactorIcon && (
            <FormFactorIcon
              fontSize={iconSize}
              sx={{ color: formFactorConfig?.color }}
            />
          )}
          {/* OS Icon(s) */}
          {os === 'web-or-windows' ? (
            <>
              {/* Show both Web and Windows icons for ambiguous case */}
              <WebIcon
                fontSize={iconSize}
                sx={{ color: '#4285F4' }}
              />
              <WindowsIcon
                fontSize={iconSize}
                sx={{ color: '#0078D4' }}
              />
            </>
          ) : os === 'baileys' ? (
            <>
              {/* Show robot icon with web/windows icons for Baileys/clawd */}
              <BaileysIcon
                fontSize={iconSize}
                sx={{ color: '#9C27B0' }}
              />
              <WebIcon
                fontSize={iconSize}
                sx={{ color: '#4285F4', opacity: 0.5 }}
              />
              <WindowsIcon
                fontSize={iconSize}
                sx={{ color: '#0078D4', opacity: 0.5 }}
              />
            </>
          ) : (
            <OSIcon
              fontSize={iconSize}
              sx={{ color: osConfig.color }}
            />
          )}
        </Box>
      )}
      {showLabel && (
        <Typography variant={variant} sx={{ color: os === 'unknown' ? 'text.secondary' : 'text.primary' }}>
          {displayLabel}
        </Typography>
      )}
    </Box>
  );
};

export const getOSConfig = (os: OSType) => OS_CONFIG[os];

import React from 'react';
import { Box, Typography } from '@mui/material';
import {
  Android as AndroidIcon,
  Apple as AppleIcon,
  PhoneAndroid as MobileIcon,
  Laptop as LaptopIcon,
  Language as WebIcon,
  DeviceUnknown as UnknownDeviceIcon
} from '@mui/icons-material';
import { WindowsIcon } from './WindowsIcon';

export type OSType = 'android' | 'apple' | 'windows' | 'web' | 'unknown';
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
          {/* OS Icon (Android/Apple/Windows/Web) */}
          <OSIcon
            fontSize={iconSize}
            sx={{ color: osConfig.color }}
          />
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

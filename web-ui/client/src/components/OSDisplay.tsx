import React from 'react';
import { Box, Typography } from '@mui/material';
import {
  Android as AndroidIcon,
  Apple as AppleIcon,
  Laptop as LaptopIcon,
  Language as WebIcon,
  DeviceUnknown as UnknownDeviceIcon
} from '@mui/icons-material';
import { WindowsIcon } from './WindowsIcon';

export type OSType = 'android' | 'ios' | 'mac-desktop' | 'windows-desktop' | 'web' | 'unknown';

interface OSDisplayProps {
  os: OSType;
  label?: string;
  showIcon?: boolean;
  showLabel?: boolean;
  iconSize?: 'small' | 'medium' | 'large';
  variant?: 'caption' | 'body2' | 'body1';
}

const OS_CONFIG: Record<OSType, {
  icon: React.ElementType;
  secondaryIcon?: React.ElementType;
  label: string;
  color: string;
  secondaryColor?: string;
}> = {
  android: { icon: AndroidIcon, label: 'Android', color: '#3DDC84' },
  ios: { icon: AppleIcon, label: 'iOS', color: '#007AFF' },
  'mac-desktop': {
    icon: AppleIcon,
    secondaryIcon: LaptopIcon,
    label: 'Mac Desktop',
    color: '#555555',
    secondaryColor: '#999999'
  },
  'windows-desktop': {
    icon: WindowsIcon,
    secondaryIcon: LaptopIcon,
    label: 'Windows Desktop',
    color: '#0078D4',
    secondaryColor: '#005A9E'
  },
  web: {
    icon: WebIcon,
    label: 'Web',
    color: '#4285F4'
  },
  unknown: { icon: UnknownDeviceIcon, label: 'Unknown', color: '#9E9E9E' }
};

export const OSDisplay: React.FC<OSDisplayProps> = ({
  os,
  label,
  showIcon = true,
  showLabel = true,
  iconSize = 'small',
  variant = 'caption'
}) => {
  const config = OS_CONFIG[os];
  const Icon = config.icon;
  const SecondaryIcon = config.secondaryIcon;
  const displayLabel = label || config.label;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {showIcon && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, position: 'relative' }}>
          <Icon
            fontSize={iconSize}
            sx={{ color: config.color }}
          />
          {SecondaryIcon && (
            <SecondaryIcon
              fontSize={iconSize}
              sx={{
                color: config.secondaryColor,
                ml: -0.5
              }}
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

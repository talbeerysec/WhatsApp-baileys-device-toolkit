import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  PhoneAndroid as DeviceIcon,
  Error as ErrorIcon,
  Android as AndroidIcon,
  Apple as AppleIcon,
  HelpOutline as UnknownIcon,
  Laptop as LaptopIcon,
  DesktopWindows as WindowsIcon,
  Language as WebIcon
} from '@mui/icons-material';
import { InfoField } from './InfoField';
import { DevicePrekeyData } from '../../../shared/types/api';

interface DeviceCardProps {
  deviceData: DevicePrekeyData;
}

export const DeviceCard: React.FC<DeviceCardProps> = ({ deviceData }) => {
  const { deviceId, prekeyBundle, error, fetchedAt, osInference } = deviceData;
  const isPrimary = deviceId === 0;

  // Helper to render OS icon and chip
  const renderOSIndicator = () => {
    if (!osInference || osInference.os === 'unknown') return null;

    const osConfig = {
      android: { icon: <AndroidIcon />, label: 'Android', color: '#3DDC84' },
      ios: { icon: <AppleIcon />, label: 'iOS', color: '#007AFF' },
      'mac-desktop': { icon: <LaptopIcon />, label: 'Mac Desktop', color: '#555555' },
      'windows-desktop': { icon: <WindowsIcon />, label: 'Windows Desktop', color: '#0078D4' },
      web: { icon: <WebIcon />, label: 'Web', color: '#4285F4' }
    };

    const config = osConfig[osInference.os as keyof typeof osConfig];
    if (!config) return null;

    return (
      <Chip
        icon={config.icon}
        label={config.label}
        size="small"
        sx={{
          ml: 1,
          bgcolor: `${config.color}20`,
          color: config.color,
          '& .MuiChip-icon': { color: config.color }
        }}
      />
    );
  };

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
          <DeviceIcon color="primary" />
          <Typography variant="h6" component="div">
            Device {deviceId}
          </Typography>
          {isPrimary && (
            <Chip
              label="Primary"
              color="primary"
              size="small"
              sx={{ ml: 1 }}
            />
          )}
          {renderOSIndicator()}
        </Box>

        {error ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
            <ErrorIcon />
            <Typography color="error">{error}</Typography>
          </Box>
        ) : prekeyBundle ? (
          <>
            {/* Key IDs Summary - Critical for OS inference */}
            <Box sx={{
              bgcolor: 'background.default',
              p: 2,
              borderRadius: 1,
              mb: 2,
              border: '1px solid',
              borderColor: 'divider'
            }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
                Key Identifiers
              </Typography>
              <InfoField
                label="Registration ID"
                value={prekeyBundle.registrationId}
                monospace
                tooltip="Device registration identifier (4 bytes, hex format)"
              />
              <InfoField
                label="Signed Pre-Key ID"
                value={prekeyBundle.signedPreKey.keyId}
                monospace
                tooltip="Android: starts at 0x000000, increments monthly. iOS: random 3-byte value (> 0xFFFF). Both high (> 0xFFFF) may indicate Android variants."
              />
              {prekeyBundle.preKey && (
                <InfoField
                  label="One-Time Pre-Key ID"
                  value={prekeyBundle.preKey.keyId}
                  monospace
                  tooltip="iOS: starts at 0x000001, increments sequentially. Android: variable. Both high (> 0xFFFF) may indicate Android variants."
                />
              )}
              {!prekeyBundle.preKey && (
                <Box sx={{ mb: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    One-Time Pre-Key ID
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    Not available (prekey pool depleted)
                  </Typography>
                </Box>
              )}

              {/* OS Inference Result */}
              {osInference && osInference.os !== 'unknown' && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                      OS Inference
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                      {osInference.os === 'android' && (
                        <AndroidIcon sx={{ fontSize: '1.2rem', color: '#3DDC84' }} />
                      )}
                      {osInference.os === 'ios' && (
                        <AppleIcon sx={{ fontSize: '1.2rem', color: '#007AFF' }} />
                      )}
                      {osInference.os === 'mac-desktop' && (
                        <LaptopIcon sx={{ fontSize: '1.2rem', color: '#555555' }} />
                      )}
                      {osInference.os === 'windows-desktop' && (
                        <WindowsIcon sx={{ fontSize: '1.2rem', color: '#0078D4' }} />
                      )}
                      {osInference.os === 'web' && (
                        <WebIcon sx={{ fontSize: '1.2rem', color: '#4285F4' }} />
                      )}
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {osInference.os === 'android' && 'Android'}
                        {osInference.os === 'ios' && 'iOS'}
                        {osInference.os === 'mac-desktop' && 'Mac Desktop'}
                        {osInference.os === 'windows-desktop' && 'Windows Desktop'}
                        {osInference.os === 'web' && 'Web'}
                      </Typography>
                      <Chip
                        label={`${osInference.confidence} confidence`}
                        size="small"
                        sx={{
                          height: '20px',
                          fontSize: '0.7rem',
                          bgcolor: osInference.confidence === 'high' ? 'success.light' : 'warning.light',
                          color: osInference.confidence === 'high' ? 'success.dark' : 'warning.dark'
                        }}
                      />
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      {osInference.reasoning}
                    </Typography>
                  </Box>
                </>
              )}
              {osInference && osInference.os === 'unknown' && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                      OS Inference
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                      <UnknownIcon sx={{ fontSize: '1.2rem', color: 'text.secondary' }} />
                      <Typography variant="body2" color="text.secondary">
                        Unable to determine
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      {osInference.reasoning}
                    </Typography>
                  </Box>
                </>
              )}
            </Box>

            <Divider sx={{ my: 2 }} />

            <InfoField
              label="Identity Key"
              value={prekeyBundle.identityKey}
              monospace
              tooltip="Long-term public identity key (hex encoded)"
            />

            <Divider sx={{ my: 2 }} />

            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Signed Pre-Key (Details)
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <InfoField
                  label="Public Key"
                  value={prekeyBundle.signedPreKey.publicKey}
                  monospace
                  tooltip="Signed pre-key public component (hex encoded)"
                />
                <InfoField
                  label="Signature"
                  value={prekeyBundle.signedPreKey.signature}
                  monospace
                  tooltip="Signature over the signed pre-key (hex encoded)"
                />
              </AccordionDetails>
            </Accordion>

            {prekeyBundle.preKey && (
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    One-Time Pre-Key (Details)
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <InfoField
                    label="Public Key"
                    value={prekeyBundle.preKey.publicKey}
                    monospace
                    tooltip="One-time pre-key public component (hex encoded)"
                  />
                </AccordionDetails>
              </Accordion>
            )}

            {prekeyBundle.signedIdentityKey && (
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Signed Identity Key (Advanced)
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <InfoField
                    label="Details"
                    value={prekeyBundle.signedIdentityKey.details}
                    monospace
                    tooltip="Signed identity key details (hex encoded)"
                  />
                  <InfoField
                    label="Account Signature Key"
                    value={prekeyBundle.signedIdentityKey.accountSignatureKey}
                    monospace
                    tooltip="Account-level signature key (hex encoded)"
                  />
                  <InfoField
                    label="Account Signature"
                    value={prekeyBundle.signedIdentityKey.accountSignature}
                    monospace
                    tooltip="Account signature (hex encoded)"
                  />
                  <InfoField
                    label="Device Signature"
                    value={prekeyBundle.signedIdentityKey.deviceSignature}
                    monospace
                    tooltip="Device-specific signature (hex encoded)"
                  />
                </AccordionDetails>
              </Accordion>
            )}

            {prekeyBundle.advSecretKey && (
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Advanced Secret Key
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <InfoField
                    label="Secret Key"
                    value={prekeyBundle.advSecretKey}
                    monospace
                    tooltip="Advanced secret key (hex encoded)"
                  />
                </AccordionDetails>
              </Accordion>
            )}

            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Fetched at: {new Date(fetchedAt || '').toLocaleString()}
              </Typography>
            </Box>
          </>
        ) : (
          <Typography color="text.secondary">No prekey bundle available</Typography>
        )}
      </CardContent>
    </Card>
  );
};

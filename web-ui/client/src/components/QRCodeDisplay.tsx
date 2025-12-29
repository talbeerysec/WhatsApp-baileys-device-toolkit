import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Typography,
  Box,
  CircularProgress,
  Paper,
  Button
} from '@mui/material';
import { useSocket } from '../contexts/SocketContext';
import { useWhatsApp } from '../contexts/WhatsAppContext';

const QRCodeDisplay: React.FC = () => {
  const [qrCode, setQrCode] = useState<string>('');
  const [showQR, setShowQR] = useState(false);
  const [waitingForQR, setWaitingForQR] = useState(false);
  const { socket } = useSocket();
  const { connectionStatus } = useWhatsApp();

  useEffect(() => {
    if (!socket) return;

    socket.on('qr', (qr: string) => {
      // Only show QR if not already connected
      if (connectionStatus.state !== 'open') {
        console.log('📱 QR Code received, generating image...');
        setQrCode(qr);
        setShowQR(true);
        setWaitingForQR(false);
      } else {
        console.log('📱 QR Code received but already connected, ignoring...');
      }
    });

    socket.on('qr-needed', (needed: boolean) => {
      console.log('📱 QR authentication needed:', needed, 'Connection state:', connectionStatus.state);
      // Only show QR if not already connected
      if (needed && connectionStatus.state !== 'open') {
        setShowQR(true);
        setWaitingForQR(true);
        setQrCode(''); // Clear old QR while waiting for new one
      }
    });

    return () => {
      socket.off('qr');
      socket.off('qr-needed');
    };
  }, [socket, connectionStatus.state]);

  useEffect(() => {
    // Hide QR when connected
    if (connectionStatus.state === 'open') {
      setShowQR(false);
      setQrCode('');
      setWaitingForQR(false);
    }
    // Show QR dialog when connection is closed and no authentication
    else if (connectionStatus.state === 'close' && !connectionStatus.isAuthenticated) {
      // QR will be shown when socket emits 'qr' or 'qr-needed' event
      setWaitingForQR(true);
      setShowQR(true);
    }
  }, [connectionStatus.state, connectionStatus.isAuthenticated]);

  const handleClose = () => {
    setShowQR(false);
    setQrCode('');
    setWaitingForQR(false);
  };

  const generateQRCodeURL = (text: string) => {
    // Use Google Charts API to generate QR code
    const size = '300x300';
    const encoded = encodeURIComponent(text);
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}&data=${encoded}`;
  };

  return (
    <Dialog 
      open={showQR} 
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2 }
      }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">
            📱 WhatsApp Authentication
          </Typography>
          <Button 
            onClick={handleClose}
            size="small"
            color="inherit"
          >
            ✕
          </Button>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box display="flex" flexDirection="column" alignItems="center" gap={3} py={2}>
          <Typography variant="body1" align="center" color="text.secondary">
            Scan this QR code with your WhatsApp mobile app to connect:
          </Typography>
          
          <Paper 
            elevation={0} 
            sx={{ 
              p: 2, 
              bgcolor: 'grey.50', 
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'grey.200'
            }}
          >
            <Typography variant="body2" align="center" sx={{ mb: 1 }}>
              <strong>How to scan:</strong>
            </Typography>
            <Typography variant="body2" align="center" color="text.secondary">
              WhatsApp → Settings (iOS) / Three-dot menu (Android) → Linked Devices → Link a Device
            </Typography>
          </Paper>
          
          {qrCode ? (
            <Paper elevation={3} sx={{ p: 3, borderRadius: 2, position: 'relative' }}>
              <img
                src={generateQRCodeURL(qrCode)}
                alt="WhatsApp QR Code"
                style={{
                  width: 280,
                  height: 280,
                  display: 'block'
                }}
                onError={(e) => {
                  console.error('Failed to load QR code image');
                }}
                key={qrCode} // Force re-render with animation when QR changes
              />
              <Box
                sx={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  bgcolor: 'success.main',
                  color: 'white',
                  px: 1.5,
                  py: 0.5,
                  borderRadius: 1,
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  animation: 'pulse 2s ease-in-out',
                  '@keyframes pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.7 }
                  }
                }}
              >
                LIVE
              </Box>
            </Paper>
          ) : waitingForQR ? (
            <Box
              display="flex"
              flexDirection="column"
              alignItems="center"
              gap={2}
              sx={{ py: 4 }}
            >
              <CircularProgress size={40} />
              <Typography variant="body2" color="text.secondary">
                {connectionStatus.errorMessage || 'Generating QR code...'}
              </Typography>
            </Box>
          ) : (
            <Box
              display="flex"
              flexDirection="column"
              alignItems="center"
              gap={2}
              sx={{ py: 4 }}
            >
              <CircularProgress size={40} />
              <Typography variant="body2" color="text.secondary">
                Initializing...
              </Typography>
            </Box>
          )}
          
          <Paper 
            elevation={0} 
            sx={{ 
              p: 2, 
              bgcolor: 'primary.50', 
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'primary.200',
              width: '100%'
            }}
          >
            <Typography variant="caption" color="primary.main" align="center" display="block">
              💡 <strong>Tip:</strong> The QR code refreshes automatically. 
              Once scanned successfully, you'll be connected to WhatsApp.
            </Typography>
          </Paper>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default QRCodeDisplay;
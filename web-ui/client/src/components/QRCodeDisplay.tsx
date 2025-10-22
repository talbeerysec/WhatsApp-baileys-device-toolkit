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
  const { socket } = useSocket();
  const { connectionStatus } = useWhatsApp();

  useEffect(() => {
    if (!socket) return;

    socket.on('qr', (qr: string) => {
      console.log('📱 QR Code received, generating image...');
      setQrCode(qr);
      setShowQR(true);
    });

    return () => {
      socket.off('qr');
    };
  }, [socket]);

  useEffect(() => {
    // Hide QR when connected
    if (connectionStatus.state === 'open') {
      setShowQR(false);
      setQrCode('');
    }
    // Show QR when connection is closed and no authentication
    else if (connectionStatus.state === 'close' && !connectionStatus.isAuthenticated) {
      // QR will be shown when socket emits 'qr' event
    }
  }, [connectionStatus.state, connectionStatus.isAuthenticated]);

  const handleClose = () => {
    setShowQR(false);
    setQrCode('');
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
              WhatsApp → Settings → Linked Devices → Link a Device
            </Typography>
          </Paper>
          
          {qrCode ? (
            <Paper elevation={3} sx={{ p: 3, borderRadius: 2 }}>
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
              />
            </Paper>
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
                Generating QR code...
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
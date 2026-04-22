import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  Avatar,
  Button,
  Alert,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress
} from '@mui/material';
import {
  CheckCircle as ConnectedIcon,
  Error as DisconnectedIcon,
  HourglassEmpty as ConnectingIcon,
  Person as PersonIcon,
  Refresh as RefreshIcon,
  PowerSettingsNew as DisconnectIcon
} from '@mui/icons-material';
import { useWhatsApp } from '../contexts/WhatsAppContext';
import { usePrivacy } from '../contexts/PrivacyContext';
import { maskName, maskJid } from '../utils/privacyUtils';
import { ApiService } from '../services/api';

const ConnectionStatus: React.FC = () => {
  const { connectionStatus } = useWhatsApp();
  const { privacyMode } = usePrivacy();
  const [isClearing, setIsClearing] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);

  const getStatusIcon = () => {
    switch (connectionStatus.state) {
      case 'open':
        return <ConnectedIcon color="success" />;
      case 'connecting':
        return <ConnectingIcon color="warning" />;
      default:
        return <DisconnectedIcon color="error" />;
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus.state) {
      case 'open':
        return 'success';
      case 'connecting':
        return 'warning';
      default:
        return 'error';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus.state) {
      case 'open':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      default:
        return 'Disconnected';
    }
  };

  const handleDisconnectClick = () => {
    setDisconnectDialogOpen(true);
  };

  const handleDisconnectConfirm = async () => {
    setIsClearing(true);
    setMessage('');
    setDisconnectDialogOpen(false);

    try {
      const message = await ApiService.clearSession();
      setMessage(message + ' - The page will reload to show the QR code.');

      // Reload page after 2 seconds to show QR code
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error) {
      console.error('Clear session error:', error);
      setMessage('Error clearing session. Please try again.');
      setIsClearing(false);
    }
  };

  const handleDisconnectCancel = () => {
    setDisconnectDialogOpen(false);
  };

  const handleClearSession = async () => {
    setIsClearing(true);
    setMessage('');

    try {
      const response = await fetch('/api/status/clear-session', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setMessage('Session cleared successfully. Please scan the QR code to reconnect.');
      } else {
        setMessage('Failed to clear session. Please try again.');
      }
    } catch (error) {
      console.error('Clear session error:', error);
      setMessage('Error clearing session. Please try again.');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" gap={2}>
          {getStatusIcon()}
          <Box flexGrow={1}>
            <Typography variant="h6" component="div">
              WhatsApp Connection
            </Typography>
            <Box display="flex" alignItems="center" gap={1}>
              <Chip
                label={getStatusText()}
                color={getStatusColor()}
                size="small"
              />
              <Tooltip title="Disconnect & Clear Session">
                <IconButton
                  size="small"
                  color="error"
                  onClick={handleDisconnectClick}
                  disabled={isClearing}
                  sx={{ ml: 0.5 }}
                >
                  {isClearing ? <CircularProgress size={20} /> : <DisconnectIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </Box>

        {connectionStatus.user && (
          <Box mt={2} display="flex" alignItems="center" gap={1}>
            <Avatar sx={{ width: 24, height: 24 }}>
              <PersonIcon fontSize="small" />
            </Avatar>
            <Typography variant="body2" color="text.secondary">
              {privacyMode ? maskName(connectionStatus.user.name) : connectionStatus.user.name} ({privacyMode ? maskJid(connectionStatus.user.id) : connectionStatus.user.id})
            </Typography>
          </Box>
        )}

        {connectionStatus.state === 'close' && !connectionStatus.isAuthenticated && (
          <Box mt={2}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={handleClearSession}
              disabled={isClearing}
              color="primary"
            >
              {isClearing ? 'Clearing...' : 'Start Fresh Authentication'}
            </Button>
          </Box>
        )}

        {message && (
          <Alert severity="info" sx={{ mt: 2 }}>
            {message}
          </Alert>
        )}

        {connectionStatus.errorMessage && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {connectionStatus.errorMessage}
          </Alert>
        )}

        <Box mt={1}>
          <Typography variant="caption" color="text.secondary" display="block">
            Baileys v{connectionStatus.baileysVersion || 'Unknown'}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            Last updated: {new Date(connectionStatus.lastUpdate).toLocaleString()}
          </Typography>
        </Box>
      </CardContent>

      {/* Disconnect Confirmation Dialog */}
      <Dialog
        open={disconnectDialogOpen}
        onClose={handleDisconnectCancel}
      >
        <DialogTitle>Confirm Disconnect</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to disconnect and clear your WhatsApp session?
          </DialogContentText>
          <Box component="ul" sx={{ pl: 2, mt: 1 }}>
            <li>
              <Typography variant="body2">Disconnect from WhatsApp</Typography>
            </li>
            <li>
              <Typography variant="body2">Clear all authentication data</Typography>
            </li>
            <li>
              <Typography variant="body2">Require re-scanning QR code or pairing code</Typography>
            </li>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDisconnectCancel} disabled={isClearing}>
            Cancel
          </Button>
          <Button
            onClick={handleDisconnectConfirm}
            color="error"
            variant="contained"
            disabled={isClearing}
            startIcon={isClearing ? <CircularProgress size={20} /> : <DisconnectIcon />}
          >
            {isClearing ? 'Disconnecting...' : 'Disconnect'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default ConnectionStatus;
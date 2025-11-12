import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  Avatar,
  Button,
  Alert
} from '@mui/material';
import {
  CheckCircle as ConnectedIcon,
  Error as DisconnectedIcon,
  HourglassEmpty as ConnectingIcon,
  Person as PersonIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { useWhatsApp } from '../contexts/WhatsAppContext';
import { ApiService } from '../services/api';

const ConnectionStatus: React.FC = () => {
  const { connectionStatus } = useWhatsApp();
  const [isClearing, setIsClearing] = useState(false);
  const [message, setMessage] = useState<string>('');

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
            <Chip
              label={getStatusText()}
              color={getStatusColor()}
              size="small"
            />
          </Box>
        </Box>

        {connectionStatus.user && (
          <Box mt={2} display="flex" alignItems="center" gap={1}>
            <Avatar sx={{ width: 24, height: 24 }}>
              <PersonIcon fontSize="small" />
            </Avatar>
            <Typography variant="body2" color="text.secondary">
              {connectionStatus.user.name} ({connectionStatus.user.id})
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
    </Card>
  );
};

export default ConnectionStatus;
import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tabs,
  Tab
} from '@mui/material';
import { Send as SendIcon } from '@mui/icons-material';
import { ApiService } from '../services/api';
import { sanitizePhoneNumber, sanitizeJidInput } from '../utils/phoneUtils';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <div hidden={value !== index}>
    {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
  </div>
);

const SendMessagePage: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  
  // Regular message state
  const [jid, setJid] = useState('');
  const [message, setMessage] = useState('');
  
  // Device-specific message state
  const [deviceUser, setDeviceUser] = useState('');
  const [deviceId, setDeviceId] = useState(0);
  const [deviceMessage, setDeviceMessage] = useState('');
  
  // Reaction state
  const [reactUser, setReactUser] = useState('');
  const [reactMessageId, setReactMessageId] = useState('');
  const [reaction, setReaction] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const clearMessages = () => {
    setSuccess('');
    setError('');
  };

  const handleSendMessage = async () => {
    if (!jid || !message) {
      setError('JID and message are required');
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      const result = await ApiService.sendMessage({ jid, message });
      setSuccess(`Message sent successfully! ID: ${result.messageId}`);
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  const handleSendToDevice = async () => {
    if (!deviceUser || !deviceMessage) {
      setError('User and message are required');
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      const result = await ApiService.sendToDevice({
        user: deviceUser,
        deviceId,
        message: deviceMessage
      });
      setSuccess(`Message sent to device ${deviceId}! ID: ${result.messageId}`);
      setDeviceMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message to device');
    } finally {
      setLoading(false);
    }
  };

  const handleSendReaction = async () => {
    if (!reactUser || reaction === undefined) {
      setError('User and reaction are required');
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      const result = await ApiService.sendReaction({
        user: reactUser,
        messageId: reactMessageId || undefined,
        reaction
      });
      setSuccess(`Reaction sent successfully! ID: ${result.messageId}`);
      setReaction('');
      setReactMessageId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reaction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Send Messages
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Send messages, reactions, and device-specific communications.
      </Typography>

      <Card>
        <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
          <Tab label="Regular Message" />
          <Tab label="Device-Specific" />
          <Tab label="Reactions" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Send Regular Message
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="JID (e.g., 1234567890@s.whatsapp.net)"
                  value={jid}
                  onChange={(e) => setJid(sanitizeJidInput(e.target.value))}
                  placeholder="1234567890@s.whatsapp.net"
                  helperText="Enter the full JID or just the phone number"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={4}
                  label="Message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type your message here..."
                />
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="contained"
                  startIcon={<SendIcon />}
                  onClick={handleSendMessage}
                  disabled={loading}
                  fullWidth
                >
                  Send Message
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Send to Specific Device
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={8}>
                <TextField
                  fullWidth
                  label="User (phone number)"
                  value={deviceUser}
                  onChange={(e) => setDeviceUser(sanitizePhoneNumber(e.target.value))}
                  placeholder="1234567890"
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  type="number"
                  label="Device ID"
                  value={deviceId}
                  onChange={(e) => setDeviceId(parseInt(e.target.value) || 0)}
                  inputProps={{ min: 0, max: 255 }}
                  helperText="0 = primary device"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={4}
                  label="Message"
                  value={deviceMessage}
                  onChange={(e) => setDeviceMessage(e.target.value)}
                  placeholder="Type your message here..."
                />
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="contained"
                  startIcon={<SendIcon />}
                  onClick={handleSendToDevice}
                  disabled={loading}
                  fullWidth
                >
                  Send to Device
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Send Reaction
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="User (phone number)"
                  value={reactUser}
                  onChange={(e) => setReactUser(sanitizePhoneNumber(e.target.value))}
                  placeholder="1234567890"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Message ID (optional)"
                  value={reactMessageId}
                  onChange={(e) => setReactMessageId(e.target.value)}
                  placeholder="Leave empty to react to last message"
                  helperText="If empty, will react to the last message in the chat"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Reaction"
                  value={reaction}
                  onChange={(e) => setReaction(e.target.value)}
                  placeholder="👍 ❤️ 😂 😮 😢 🙏"
                  helperText="Use emoji or leave empty to remove reaction"
                />
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="contained"
                  startIcon={<SendIcon />}
                  onClick={handleSendReaction}
                  disabled={loading}
                  fullWidth
                >
                  Send Reaction
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </TabPanel>
      </Card>

      {success && (
        <Alert severity="success" sx={{ mt: 2 }}>
          {success}
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
};

export default SendMessagePage;
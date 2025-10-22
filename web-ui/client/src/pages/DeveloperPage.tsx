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
  Divider
} from '@mui/material';
import { BugReport as BugIcon } from '@mui/icons-material';
import { ApiService } from '../services/api';
import { sanitizePhoneNumber } from '../utils/phoneUtils';

const DeveloperPage: React.FC = () => {
  const [user, setUser] = useState('');
  const [deviceId, setDeviceId] = useState(0);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');

  const handleSendCorruptedMessage = async () => {
    if (!user || !message) {
      setResult('User and message are required');
      return;
    }

    setLoading(true);
    setResult('');

    try {
      await ApiService.sendCorruptedMessage({
        user,
        deviceId,
        message
      });
      setResult(`Corrupted message sent to device ${deviceId} of user ${user}`);
      setMessage('');
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Failed to send corrupted message');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Developer Tools
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Advanced testing and debugging tools for WhatsApp protocol development.
      </Typography>

      <Alert severity="warning" sx={{ mb: 3 }}>
        <Typography variant="subtitle2" gutterBottom>
          ⚠️ Admin Access Required
        </Typography>
        These tools are for development and testing purposes only. Use with caution as they may affect WhatsApp protocol behavior.
      </Alert>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Message Corruption Testing
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Send intentionally corrupted encrypted messages to test how WhatsApp handles malformed data.
            This tool modifies the encrypted payload before transmission.
          </Typography>
          
          <Grid container spacing={3}>
            <Grid item xs={12} sm={8}>
              <TextField
                fullWidth
                label="User (phone number)"
                value={user}
                onChange={(e) => setUser(sanitizePhoneNumber(e.target.value))}
                placeholder="1234567890"
                helperText="Target user's phone number"
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
                label="Message Content"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="This message will be encrypted and then corrupted before sending..."
                helperText="The message will be encrypted normally, then one random byte will be corrupted"
              />
            </Grid>
            <Grid item xs={12}>
              <Button
                variant="contained"
                color="warning"
                startIcon={<BugIcon />}
                onClick={handleSendCorruptedMessage}
                disabled={loading}
                fullWidth
              >
                Send Corrupted Message
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            How Message Corruption Works
          </Typography>
          <Typography variant="body2" paragraph>
            1. <strong>Normal Encryption:</strong> The message is encrypted using the Signal protocol as usual
          </Typography>
          <Typography variant="body2" paragraph>
            2. <strong>Corruption:</strong> One random byte in the encrypted ciphertext is flipped (XORed with 0xFF)
          </Typography>
          <Typography variant="body2" paragraph>
            3. <strong>Transmission:</strong> The corrupted ciphertext is sent to the specified device
          </Typography>
          <Typography variant="body2" paragraph>
            4. <strong>Expected Result:</strong> The receiving device should fail to decrypt the message and may show a decryption error
          </Typography>
          
          <Divider sx={{ my: 2 }} />
          
          <Typography variant="subtitle2" gutterBottom>
            Use Cases:
          </Typography>
          <Typography variant="body2" paragraph>
            • Testing error handling in WhatsApp clients<br/>
            • Verifying protocol robustness<br/>
            • Debugging encryption/decryption issues<br/>
            • Security research and protocol analysis
          </Typography>
        </CardContent>
      </Card>

      {result && (
        <Alert severity={result.includes('Failed') ? 'error' : 'success'} sx={{ mt: 2 }}>
          {result}
        </Alert>
      )}
    </Box>
  );
};

export default DeveloperPage;
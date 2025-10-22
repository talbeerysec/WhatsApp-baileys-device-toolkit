import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert
} from '@mui/material';
import { Update as UpdateIcon } from '@mui/icons-material';
import { ApiService } from '../services/api';
import { sanitizeJidInput } from '../utils/phoneUtils';

const PresencePage: React.FC = () => {
  const [jid, setJid] = useState('');
  const [presence, setPresence] = useState<string>('available');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const presenceOptions = [
    { value: 'available', label: 'Available', description: 'Show as online' },
    { value: 'unavailable', label: 'Unavailable', description: 'Show as offline' },
    { value: 'composing', label: 'Typing...', description: 'Show typing indicator' },
    { value: 'recording', label: 'Recording', description: 'Show recording audio' },
    { value: 'paused', label: 'Paused', description: 'Stop typing indicator' },
  ];

  const handleUpdatePresence = async () => {
    if (!jid) {
      setMessage('JID is required');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      await ApiService.updatePresence({
        jid,
        presence: presence as any
      });
      setMessage(`Presence updated to "${presence}" for ${jid}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update presence');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Presence Control
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Update your presence status for specific chats or contacts.
      </Typography>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Update Presence
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
              <FormControl fullWidth>
                <InputLabel>Presence Status</InputLabel>
                <Select
                  value={presence}
                  label="Presence Status"
                  onChange={(e) => setPresence(e.target.value)}
                >
                  {presenceOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      <Box>
                        <Typography variant="body1">{option.label}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {option.description}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <Button
                variant="contained"
                startIcon={<UpdateIcon />}
                onClick={handleUpdatePresence}
                disabled={loading}
                fullWidth
              >
                Update Presence
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Presence Status Guide
          </Typography>
          <Grid container spacing={2}>
            {presenceOptions.map((option) => (
              <Grid item xs={12} sm={6} md={4} key={option.value}>
                <Box p={2} border={1} borderColor="grey.300" borderRadius={1}>
                  <Typography variant="subtitle2" gutterBottom>
                    {option.label}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {option.description}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {message && (
        <Alert severity="info" sx={{ mt: 2 }}>
          {message}
        </Alert>
      )}
    </Box>
  );
};

export default PresencePage;
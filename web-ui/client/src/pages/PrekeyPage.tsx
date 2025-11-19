import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  LinearProgress,
  Container
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import { ApiService } from '../services/api';
import { DeviceCard } from '../components/DeviceCard';
import { PrekeyData } from '../../../shared/types/api';
import { sanitizePhoneNumber } from '../utils/phoneUtils';

const PrekeyPage: React.FC = () => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [prekeyData, setPrekeyData] = useState<PrekeyData | null>(null);

  const handleFetchPrekeys = async () => {
    if (!phoneNumber) {
      setError('Phone number is required');
      return;
    }

    setLoading(true);
    setError('');
    setPrekeyData(null);

    try {
      const sanitized = sanitizePhoneNumber(phoneNumber);
      const data = await ApiService.getPrekeyBundles(sanitized);
      setPrekeyData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch prekey bundles');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFetchPrekeys();
    }
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Device Prekey Bundles
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Fetch and inspect Signal protocol prekey bundles for WhatsApp devices.
          This shows the cryptographic keys used for end-to-end encryption.
        </Typography>

        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
              <TextField
                fullWidth
                label="Phone Number"
                placeholder="1234567890"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={loading}
                helperText="Enter phone number (numbers only, no + or country code)"
              />
              <Button
                variant="contained"
                onClick={handleFetchPrekeys}
                disabled={loading || !phoneNumber}
                startIcon={<SearchIcon />}
                sx={{ minWidth: 120, height: 56 }}
              >
                Fetch
              </Button>
            </Box>
          </CardContent>
        </Card>

        {loading && (
          <Box sx={{ mb: 2 }}>
            <LinearProgress />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Fetching prekey bundles...
            </Typography>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {prekeyData && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Results for {prekeyData.phoneNumber}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
              Fetched {prekeyData.devices.length} device(s) at {new Date(prekeyData.fetchedAt).toLocaleString()}
            </Typography>

            {prekeyData.devices.length === 0 ? (
              <Alert severity="info">
                No devices found for this phone number
              </Alert>
            ) : (
              <Box>
                {prekeyData.devices.map((device) => (
                  <DeviceCard key={device.deviceId} deviceData={device} />
                ))}
              </Box>
            )}
          </Box>
        )}

        {!loading && !error && !prekeyData && (
          <Alert severity="info">
            Enter a phone number above to fetch prekey bundles for all devices
          </Alert>
        )}
      </Box>
    </Container>
  );
};

export default PrekeyPage;

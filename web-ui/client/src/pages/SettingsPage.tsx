import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  CircularProgress
} from '@mui/material';
import { Settings as SettingsIcon, Save as SaveIcon } from '@mui/icons-material';
import { ApiService } from '../services/api';

const SettingsPage: React.FC = () => {
  const [platform, setPlatform] = useState('ubuntu');
  const [browser, setBrowser] = useState('Chrome');
  const [version, setVersion] = useState('');
  const [availablePresets, setAvailablePresets] = useState<string[]>([]);
  const [customPlatform, setCustomPlatform] = useState('');
  const [useCustomPlatform, setUseCustomPlatform] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadCurrentConfig();
  }, []);

  const loadCurrentConfig = async () => {
    setLoading(true);
    setError('');

    try {
      const config = await ApiService.getBrowserConfig();
      setPlatform(config.platform);
      setBrowser(config.browser);
      setVersion(config.version || '');
      setAvailablePresets(config.availablePresets || []);

      // Check if platform is a preset or custom value
      if (!config.availablePresets.includes(config.platform)) {
        setUseCustomPlatform(true);
        setCustomPlatform(config.platform);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const finalPlatform = useCustomPlatform ? customPlatform : platform;

    if (!finalPlatform || !browser) {
      setError('Platform and browser are required');
      return;
    }

    setSaving(true);
    setSuccess('');
    setError('');

    try {
      const message = await ApiService.updateBrowserConfig({
        platform: finalPlatform,
        browser,
        version: version || undefined
      });
      setSuccess(message);
      // Reload configuration to reflect saved values
      await loadCurrentConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const getDisplayName = (): string => {
    const finalPlatform = useCustomPlatform ? customPlatform : platform;
    return `${browser} (${finalPlatform})`;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <SettingsIcon fontSize="large" />
        <Typography variant="h4" component="h1">
          Settings
        </Typography>
      </Box>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            WhatsApp Client Configuration
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Configure how your client appears in WhatsApp's linked devices. Changes require logging out and reconnecting.
          </Typography>

          <Divider sx={{ mb: 3 }} />

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
              {success}
            </Alert>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Platform Selection */}
            <FormControl fullWidth>
              <InputLabel>Platform Type</InputLabel>
              <Select
                value={useCustomPlatform ? 'custom' : platform}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setUseCustomPlatform(true);
                  } else {
                    setUseCustomPlatform(false);
                    setPlatform(e.target.value);
                  }
                }}
                label="Platform Type"
              >
                {availablePresets.map((preset) => (
                  <MenuItem key={preset} value={preset}>
                    {preset}
                  </MenuItem>
                ))}
                <MenuItem value="custom">Custom...</MenuItem>
              </Select>
            </FormControl>

            {/* Custom Platform Input */}
            {useCustomPlatform && (
              <TextField
                fullWidth
                label="Custom Platform Name"
                value={customPlatform}
                onChange={(e) => setCustomPlatform(e.target.value)}
                placeholder="e.g., My Custom OS"
                helperText="Enter a custom platform/OS name"
              />
            )}

            {/* Browser Name */}
            <TextField
              fullWidth
              label="Browser Name"
              value={browser}
              onChange={(e) => setBrowser(e.target.value)}
              placeholder="e.g., Chrome, Safari, Firefox, Edge"
              helperText="The browser name to display"
            />

            {/* Version (Optional) */}
            <TextField
              fullWidth
              label="Version (Optional)"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="e.g., 1.0.0"
              helperText="Leave empty to use preset defaults"
            />

            <Divider />

            {/* Preview */}
            <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Preview
              </Typography>
              <Typography variant="h6">
                {getDisplayName()}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                This is how your device will appear in WhatsApp's linked devices
              </Typography>
            </Box>

            {/* Save Button */}
            <Button
              variant="contained"
              color="primary"
              startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
              onClick={handleSave}
              disabled={saving}
              fullWidth
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </Button>

            {/* Warning */}
            <Alert severity="warning">
              <strong>Important:</strong> After saving these settings, you must log out and reconnect to WhatsApp for the changes to take effect.
              The new device name will only be visible on your next connection.
            </Alert>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default SettingsPage;

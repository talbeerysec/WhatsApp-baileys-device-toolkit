import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  TextField,
  Chip,
  InputAdornment,
  IconButton,
  Tooltip,
  CircularProgress
} from '@mui/material';
import {
  Search as SearchIcon,
  Person as PersonIcon,
  Block as BlockIcon,
  PhoneAndroid as DeviceIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useWhatsApp } from '../contexts/WhatsAppContext';
import { ApiService } from '../services/api';

const ContactsPage: React.FC = () => {
  const { contacts } = useWhatsApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingDevice, setLoadingDevice] = useState<string | null>(null);
  const [deviceCounts, setDeviceCounts] = useState<Map<string, number>>(new Map());
  const navigate = useNavigate();

  const filteredContacts = contacts.filter(contact =>
    contact.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.notify?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Extract phone number from JID (e.g., "1234567890@s.whatsapp.net" -> "1234567890")
  const extractPhoneNumber = (jid: string): string => {
    return jid.split('@')[0];
  };

  const handleQueryDevices = async (contactId: string) => {
    const phoneNumber = extractPhoneNumber(contactId);
    setLoadingDevice(contactId);

    try {
      // Fetch device count first
      const devices = await ApiService.getDevices(phoneNumber);
      setDeviceCounts(prev => new Map(prev).set(contactId, devices.length));

      // Navigate to devices page with the phone number pre-filled
      navigate('/devices', { state: { phoneNumber } });
    } catch (error) {
      console.error('Failed to query devices:', error);
      // Still navigate even if count fetch fails
      navigate('/devices', { state: { phoneNumber } });
    } finally {
      setLoadingDevice(null);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Contacts
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        View and manage your WhatsApp contacts.
      </Typography>

      <Card>
        <CardContent>
          <TextField
            fullWidth
            placeholder="Search contacts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 2 }}
          />

          {filteredContacts.length > 0 ? (
            <List>
              {filteredContacts.map((contact) => (
                <ListItem key={contact.id} divider>
                  <ListItemAvatar>
                    <Avatar>
                      {contact.isBlocked ? <BlockIcon /> : <PersonIcon />}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={contact.name || contact.notify || 'Unknown'}
                    secondary={
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          {contact.id}
                        </Typography>
                        {contact.notify && contact.notify !== contact.name && (
                          <Typography variant="caption" color="text.secondary">
                            Notify: {contact.notify}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {contact.isBlocked && (
                      <Chip
                        label="Blocked"
                        size="small"
                        color="error"
                        variant="outlined"
                      />
                    )}
                    <Tooltip title="Query devices">
                      <IconButton
                        size="small"
                        onClick={() => handleQueryDevices(contact.id)}
                        disabled={loadingDevice === contact.id}
                        sx={{
                          color: 'text.secondary',
                          '&:hover': {
                            color: 'primary.main',
                            bgcolor: 'action.hover'
                          }
                        }}
                      >
                        {loadingDevice === contact.id ? (
                          <CircularProgress size={18} />
                        ) : (
                          <DeviceIcon fontSize="small" />
                        )}
                      </IconButton>
                    </Tooltip>
                  </Box>
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
              {searchTerm ? 'No contacts found matching your search.' : 'No contacts available.'}
            </Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default ContactsPage;
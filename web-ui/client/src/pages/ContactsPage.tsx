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
  InputAdornment
} from '@mui/material';
import { Search as SearchIcon, Person as PersonIcon, Block as BlockIcon } from '@mui/icons-material';
import { useWhatsApp } from '../contexts/WhatsAppContext';

const ContactsPage: React.FC = () => {
  const { contacts } = useWhatsApp();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredContacts = contacts.filter(contact =>
    contact.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.notify?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
                  {contact.isBlocked && (
                    <Chip
                      label="Blocked"
                      size="small"
                      color="error"
                      variant="outlined"
                    />
                  )}
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
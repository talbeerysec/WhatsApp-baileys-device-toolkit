import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  TextField,
  Button,
  Alert,
  InputAdornment
} from '@mui/material';
import { Search as SearchIcon, MarkEmailRead as MarkReadIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useWhatsApp } from '../contexts/WhatsAppContext';
import { ApiService } from '../services/api';

const ChatsPage: React.FC = () => {
  const { chats, refreshData } = useWhatsApp();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const filteredChats = chats.filter(chat =>
    chat.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    chat.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleMarkAsRead = async (jid: string) => {
    setLoading(true);
    setMessage('');

    try {
      await ApiService.markAsRead(jid);
      setMessage('Messages marked as read');
      await refreshData();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to mark as read');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Chats
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        View and manage your WhatsApp chats.
      </Typography>

      <Card>
        <CardContent>
          <TextField
            fullWidth
            placeholder="Search chats..."
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

          {filteredChats.length > 0 ? (
            <List>
              {filteredChats.map((chat) => (
                <ListItem key={chat.id} divider disablePadding secondaryAction={
                  <Box display="flex" alignItems="center" gap={1}>
                    {chat.unreadCount && chat.unreadCount > 0 && (
                      <Chip
                        label={chat.unreadCount}
                        size="small"
                        color="primary"
                      />
                    )}
                    <Button
                      size="small"
                      startIcon={<MarkReadIcon />}
                      onClick={(e) => { e.stopPropagation(); handleMarkAsRead(chat.id); }}
                      disabled={loading}
                    >
                      Mark Read
                    </Button>
                  </Box>
                }>
                  <ListItemButton onClick={() => navigate(`/messages/${encodeURIComponent(chat.id)}`)}>
                    <ListItemText
                      primary={chat.name || chat.id}
                      secondary={
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            {chat.lastMessage
                              ? `${chat.lastMessage.text.substring(0, 100)}${chat.lastMessage.text.length > 100 ? '...' : ''}`
                              : 'No messages'
                            }
                          </Typography>
                          {chat.lastMessage && (
                            <Typography variant="caption" color="text.secondary">
                              {new Date(chat.lastMessage.timestamp).toLocaleString()}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
              {searchTerm ? 'No chats found matching your search.' : 'No chats available.'}
            </Typography>
          )}
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

export default ChatsPage;
import React from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Paper,
  List,
  ListItem,
  ListItemText,
  Chip
} from '@mui/material';
import ConnectionStatus from '../components/ConnectionStatus';
import { useWhatsApp } from '../contexts/WhatsAppContext';

const HomePage: React.FC = () => {
  const { chats, contacts, connectionStatus } = useWhatsApp();

  const stats = [
    { label: 'Total Chats', value: chats.length, color: 'primary' },
    { label: 'Total Contacts', value: contacts.length, color: 'secondary' },
    { label: 'Unread Chats', value: chats.filter(chat => (chat.unreadCount || 0) > 0).length, color: 'warning' },
  ];

  const recentChats = chats.slice(0, 5);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Welcome to the Baileys WhatsApp Web Interface. Monitor your connection status and manage your WhatsApp operations.
      </Typography>

      <Grid container spacing={3}>
        {/* Connection Status */}
        <Grid item xs={12} md={6}>
          <ConnectionStatus />
        </Grid>

        {/* Quick Stats */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Quick Stats
              </Typography>
              <Grid container spacing={2}>
                {stats.map((stat) => (
                  <Grid item xs={4} key={stat.label}>
                    <Box textAlign="center">
                      <Typography variant="h4" color={`${stat.color}.main`}>
                        {stat.value}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {stat.label}
                      </Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Chats */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent Chats
              </Typography>
              {recentChats.length > 0 ? (
                <List dense>
                  {recentChats.map((chat) => (
                    <ListItem key={chat.id} divider>
                      <ListItemText
                        primary={chat.name || chat.id}
                        secondary={
                          chat.lastMessage 
                            ? `${chat.lastMessage.text.substring(0, 50)}${chat.lastMessage.text.length > 50 ? '...' : ''}`
                            : 'No messages'
                        }
                      />
                      {chat.unreadCount && chat.unreadCount > 0 && (
                        <Chip
                          label={chat.unreadCount}
                          size="small"
                          color="primary"
                        />
                      )}
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography color="text.secondary">
                  No chats available
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* System Status */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                System Status
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemText
                    primary="WhatsApp State"
                    secondary={connectionStatus.state}
                  />
                  <Chip
                    label={connectionStatus.isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
                    color={connectionStatus.isAuthenticated ? 'success' : 'error'}
                    size="small"
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="User Account"
                    secondary={connectionStatus.user?.name || 'Not logged in'}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Baileys Version"
                    secondary={connectionStatus.baileysVersion || 'Unknown'}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Last Update"
                    secondary={new Date(connectionStatus.lastUpdate).toLocaleString()}
                  />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default HomePage;
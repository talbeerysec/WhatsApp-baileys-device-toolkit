import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
  Button
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Send as SendIcon,
  Chat as ChatIcon,
  People as ContactsIcon,
  PhoneAndroid as DevicesIcon,
  Visibility as PresenceIcon,
  Code as CodeIcon,
  ExitToApp as LogoutIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWhatsApp } from '../contexts/WhatsAppContext';
import ConnectionStatus from '../components/ConnectionStatus';
import QRCodeDisplay from '../components/QRCodeDisplay';
import SendMessagePage from './SendMessagePage';
import ChatsPage from './ChatsPage';
import ContactsPage from './ContactsPage';
import DevicesPage from './DevicesPage';
import PresencePage from './PresencePage';
import DeveloperPage from './DeveloperPage';
import HomePage from './HomePage';

const drawerWidth = 240;

interface MenuItem {
  text: string;
  icon: React.ReactElement;
  path: string;
  description: string;
}

const menuItems: MenuItem[] = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/', description: 'Overview and status' },
  { text: 'Send Messages', icon: <SendIcon />, path: '/send', description: 'Send messages and reactions' },
  { text: 'Chats', icon: <ChatIcon />, path: '/chats', description: 'View and manage chats' },
  { text: 'Contacts', icon: <ContactsIcon />, path: '/contacts', description: 'Contact management' },
  { text: 'Devices', icon: <DevicesIcon />, path: '/devices', description: 'Device management' },
  { text: 'Presence', icon: <PresenceIcon />, path: '/presence', description: 'Presence control' },
  { text: 'Developer', icon: <CodeIcon />, path: '/developer', description: 'Advanced tools' },
];

const Dashboard: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { connectionStatus, refreshData, isLoading } = useWhatsApp();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus.state) {
      case 'open':
        return 'success';
      case 'connecting':
        return 'warning';
      default:
        return 'error';
    }
  };

  const drawer = (
    <Box>
      <Toolbar>
        <Typography variant="h6" noWrap component="div">
          Baileys Web UI
        </Typography>
      </Toolbar>
      <Divider />
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton onClick={() => navigate(item.path)}>
              <ListItemIcon>
                {item.icon}
              </ListItemIcon>
              <ListItemText 
                primary={item.text} 
                secondary={item.description}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Divider />
      <List>
        <ListItem disablePadding>
          <ListItemButton onClick={handleLogout}>
            <ListItemIcon>
              <LogoutIcon />
            </ListItemIcon>
            <ListItemText primary="Logout" />
          </ListItemButton>
        </ListItem>
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            WhatsApp Web Interface
          </Typography>
          
          <Chip
            label={connectionStatus.state.toUpperCase()}
            color={getConnectionStatusColor()}
            size="small"
            sx={{ mr: 2 }}
          />
          
          <Button
            color="inherit"
            startIcon={<RefreshIcon />}
            onClick={refreshData}
            disabled={isLoading}
            size="small"
          >
            Refresh
          </Button>
        </Toolbar>
      </AppBar>
      
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      
      <Box
        component="main"
        sx={{ 
          flexGrow: 1, 
          p: 3, 
          width: { sm: `calc(100% - ${drawerWidth}px)` } 
        }}
      >
        <Toolbar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/send" element={<SendMessagePage />} />
          <Route path="/chats" element={<ChatsPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/devices" element={<DevicesPage />} />
          <Route path="/presence" element={<PresencePage />} />
          <Route path="/developer" element={<DeveloperPage />} />
        </Routes>
        <QRCodeDisplay />
      </Box>
    </Box>
  );
};

export default Dashboard;
import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Alert,
  Chip,
  LinearProgress,
  Collapse,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tooltip
} from '@mui/material';
import {
  Search as SearchIcon,
  Wifi as PingIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  CheckCircle as OnlineIcon,
  Cancel as OfflineIcon,
  HelpOutline as UnknownIcon,
  Refresh as CheckingIcon,
  AccessTime as TimeIcon,
  Android as AndroidIcon,
  Apple as AppleIcon,
  DeviceUnknown as UnknownDeviceIcon,
  Fingerprint as FingerprintIcon,
  Computer as DesktopIcon,
  Language as BrowserIcon,
  Psychology as ProfileAllIcon,
  EmojiEmotions as ReactionIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  CallEnd as CallRejectIcon,
  Help as UnknownProtocolIcon,
  Poll as PollResponseIcon,
  SmartButton as ButtonResponseIcon,
  DeviceHub as DeviceSentIcon,
  BugReport as AppStateIcon,
  PedalBike as PeerDataIcon,
  ErrorOutline as MalformedMessageIcon,
  Person as PersonIcon,
  Block as BlockIcon
} from '@mui/icons-material';
import { ApiService } from '../services/api';
import { DeviceInfo, SilentPingResult, DeviceStatus, UserProfile } from '../../../shared/types/api';
import { useSocket } from '../contexts/SocketContext';
import { sanitizePhoneNumber } from '../utils/phoneUtils';
import { OSDisplay } from '../components/OSDisplay';
import { calculateDeviceAge } from '../../../shared/utils/prekey-inference';
import { useLocation } from 'react-router-dom';

const DevicesPage: React.FC = () => {
  const [user, setUser] = useState('');
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [pingLoading, setPingLoading] = useState<string>('');
  const [pingResults, setPingResults] = useState<SilentPingResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [deviceStatuses, setDeviceStatuses] = useState<Map<string, DeviceStatus>>(new Map());
  const [profilingAll, setProfilingAll] = useState(false);
  const [prekeyDataMap, setPrekeyDataMap] = useState<Map<number, { signedPreKeyId?: string }>>(new Map());
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const { socket } = useSocket();
  const location = useLocation();

  // Handle pre-filled phone number from navigation (e.g., from Contacts page)
  useEffect(() => {
    const state = location.state as { phoneNumber?: string } | null;
    if (state?.phoneNumber) {
      setUser(state.phoneNumber);
    }
  }, [location.state]);

  // Message sending state
  const [sendMessageDeviceId, setSendMessageDeviceId] = useState<number>(0);
  const [sendMessageText, setSendMessageText] = useState('');
  const [sendMessageTimestamp, setSendMessageTimestamp] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [lastSentMessageId, setLastSentMessageId] = useState('');
  const [lastSentTimestamp, setLastSentTimestamp] = useState<number>(0);

  // Message editing state
  const [editMessageDeviceId, setEditMessageDeviceId] = useState<number>(0);
  const [editOriginalMessageId, setEditOriginalMessageId] = useState('');
  const [editNewText, setEditNewText] = useState('');
  const [editOriginalTimestamp, setEditOriginalTimestamp] = useState('');
  const [editEditTimestamp, setEditEditTimestamp] = useState('');
  const [editingMessage, setEditingMessage] = useState(false);

  const handleGetDevices = async () => {
    if (!user) {
      setMessage('User phone number is required');
      return;
    }

    const sanitizedUser = sanitizePhoneNumber(user);
    setLoading(true);
    setProfileLoading(true);
    setMessage('');
    setDevices([]);
    setUserProfile(null);

    try {
      // Fetch device list, prekey bundles, and user profile in parallel
      const [devicesResult, prekeyData, profileResult] = await Promise.all([
        ApiService.getDevices(sanitizedUser),
        ApiService.getPrekeyBundles(sanitizedUser).catch(() => null), // Fallback if prekeys fail
        ApiService.getUserProfile(sanitizedUser).catch(err => {
          console.error('Failed to fetch profile:', err);
          return null; // Continue even if profile fetch fails
        })
      ]);

      setDevices(devicesResult);
      setUserProfile(profileResult);
      setMessage(`Found ${devicesResult.length} device(s) for user ${sanitizedUser}`);

      // Initialize device statuses with passive inference from prekey bundles
      const newStatuses = new Map<string, DeviceStatus>();
      const newPrekeyDataMap = new Map<number, { signedPreKeyId?: string }>();

      devicesResult.forEach(device => {
        const deviceKey = `${sanitizedUser}:${device.device || 0}`;
        const deviceId = device.device || 0;

        // Find matching prekey data
        const prekeyDevice = prekeyData?.devices.find(d => d.deviceId === deviceId);

        newStatuses.set(deviceKey, {
          user: sanitizedUser,
          deviceId,
          status: 'unknown',
          passiveInference: prekeyDevice?.osInference
        });

        // Store signed prekey ID for device age calculation
        if (prekeyDevice?.prekeyBundle?.signedPreKey?.keyId) {
          newPrekeyDataMap.set(deviceId, {
            signedPreKeyId: prekeyDevice.prekeyBundle.signedPreKey.keyId
          });
        }
      });

      setDeviceStatuses(newStatuses);
      setPrekeyDataMap(newPrekeyDataMap);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to get devices');
      setDevices([]);
      setUserProfile(null);
    } finally {
      setLoading(false);
      setProfileLoading(false);
    }
  };

  // Auto-trigger device query when user is set from navigation
  useEffect(() => {
    const state = location.state as { phoneNumber?: string } | null;
    if (state?.phoneNumber && user === state.phoneNumber && devices.length === 0 && !loading) {
      handleGetDevices();
    }
  }, [user, location.state]);

  const checkDeviceStatus = async (deviceId: number) => {
    const deviceKey = `${user}:${deviceId}`;
    
    // Update status to checking
    setDeviceStatuses(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(deviceKey);
      if (existing) {
        newMap.set(deviceKey, {
          ...existing,
          status: 'checking',
          lastCheck: new Date().toISOString()
        });
      }
      return newMap;
    });

    try {
      await ApiService.silentPing({ user, deviceId, type: 'edit' });
    } catch (err) {
      // Update status to offline on error
      setDeviceStatuses(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(deviceKey);
        if (existing) {
          newMap.set(deviceKey, {
            ...existing,
            status: 'offline',
            lastCheck: new Date().toISOString()
          });
        }
        return newMap;
      });
    }
  };

  const fingerprintDevice = async (deviceId: number) => {
    const deviceKey = `${user}:${deviceId}`;
    
    // Initialize fingerprinting
    setDeviceStatuses(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(deviceKey);
      if (existing) {
        newMap.set(deviceKey, {
          ...existing,
          fingerprint: {
            ...existing.fingerprint,
            reactionPing: 'pending',
            deletePing: 'pending',
            detectedOS: 'unknown'
          }
        });
      }
      return newMap;
    });

    try {
      // First, send edit ping
      await ApiService.silentPing({ user, deviceId, type: 'edit' });

      // Wait a moment then send delete ping
      setTimeout(async () => {
        try {
          await ApiService.silentPing({ user, deviceId, type: 'delete' });
        } catch (err) {
          console.error('Delete ping failed:', err);
        }
      }, 2000);
    } catch (err) {
      console.error('Edit ping failed:', err);
    }
  };

  // Socket listener for ping results
  useEffect(() => {
    if (!socket) return;

    const handlePingResult = (result: SilentPingResult) => {
      console.log('🎯 Received ping result:', result);
      setPingResults(prev => {
        // Update existing result or add new one
        const existingIndex = prev.findIndex(r => r.messageId === result.messageId);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = result;
          return updated;
        } else {
          return [result, ...prev].slice(0, 20); // Keep last 20 results
        }
      });

      // Update device status based on ping results
      const deviceKey = `${result.user}:${result.deviceId}`;
      setDeviceStatuses(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(deviceKey);
        if (existing) {
          let status: DeviceStatus['status'] = existing.status;
          let updatedFingerprint = existing.fingerprint || {};

          // Update overall status for edit pings
          if (result.type === 'edit') {
            if (result.status === 'delivered' || result.status === 'read') {
              status = 'online';
            } else if (result.status === 'timeout' || result.status === 'failed') {
              status = 'offline';
            } else if (result.status === 'sent' || result.status === 'ack') {
              status = 'checking';
            }
          }

          // Track fingerprinting results
          if (result.type === 'edit') {
            updatedFingerprint.reactionPing = result.status === 'delivered' || result.status === 'read'
              ? 'success'
              : result.status === 'timeout' || result.status === 'failed'
                ? 'timeout'
                : 'pending';
          } else if (result.type === 'delete') {
            updatedFingerprint.deletePing = result.status === 'delivered' || result.status === 'read'
              ? 'success'
              : result.status === 'timeout' || result.status === 'failed'
                ? 'timeout'
                : 'pending';
          } else if (result.type === 'call-reject') {
            updatedFingerprint.callRejectPing = result.status === 'delivered' || result.status === 'read'
              ? 'success'
              : result.status === 'timeout' || result.status === 'failed'
                ? 'timeout'
                : 'pending';
          }

          // Determine OS based on fingerprinting (only for primary devices)
          if (result.deviceId === 0 && updatedFingerprint.reactionPing && updatedFingerprint.deletePing) {
            if (updatedFingerprint.reactionPing === 'success' && updatedFingerprint.deletePing === 'timeout') {
              updatedFingerprint.detectedOS = 'android';
            } else if (updatedFingerprint.reactionPing === 'success' && updatedFingerprint.deletePing === 'success') {
              updatedFingerprint.detectedOS = 'ios';
            } else {
              updatedFingerprint.detectedOS = 'unknown';
            }
            updatedFingerprint.lastFingerprint = new Date().toISOString();
          }

          // Determine secondary device type based on call-reject fingerprinting (only for secondary devices that are online)
          if (result.deviceId > 0 && status === 'online' && result.type === 'call-reject' && updatedFingerprint.callRejectPing) {
            if (updatedFingerprint.callRejectPing === 'timeout') {
              // Call reject timeout on secondary device = WhatsApp Desktop
              updatedFingerprint.detectedSecondaryType = 'desktop';
            } else if (updatedFingerprint.callRejectPing === 'success') {
              // Call reject response on secondary device = WhatsApp Web (browser)
              updatedFingerprint.detectedSecondaryType = 'browser';
            } else {
              updatedFingerprint.detectedSecondaryType = 'unknown';
            }
            updatedFingerprint.lastFingerprint = new Date().toISOString();
          }

          newMap.set(deviceKey, {
            ...existing,
            status,
            lastCheck: (result.type === 'reaction' || result.type === 'edit') ? new Date().toISOString() : existing.lastCheck,
            responseTime: (result.type === 'reaction' || result.type === 'edit') ? result.roundTripTime : existing.responseTime,
            fingerprint: updatedFingerprint
          });
        }
        return newMap;
      });

      // Show results section when we get results
      setShowResults(true);

      // Clear loading state if this ping finished
      if (result.status !== 'sent' && result.status !== 'ack') {
        setPingLoading('');
      }
    };

    socket.on('ping.result', handlePingResult);

    return () => {
      socket.off('ping.result', handlePingResult);
    };
  }, [socket]);

  const handleSilentPing = async (deviceId: number, type: 'reaction' | 'delete' | 'edit' | 'call-reject' | 'unknown' | 'poll-response' | 'button-response' | 'device-sent' | 'app-state' | 'peer-data-operation' | 'malformed-message' = 'reaction') => {
    setPingLoading(`${user}:${deviceId}:${type}`);
    setMessage('');

    try {
      await ApiService.silentPing({ user, deviceId, type });
      const typeLabel = type === 'delete' ? 'Delete-based' : type === 'edit' ? 'Edit-based' : type === 'call-reject' ? 'Call-reject based' : type === 'unknown' ? 'Unknown protocol' : type === 'poll-response' ? 'Poll response' : type === 'button-response' ? 'Button response' : type === 'device-sent' ? 'Device coordination' : type === 'app-state' ? 'App state exception' : type === 'peer-data-operation' ? 'Peer data operation' : 'Reaction-based';
      setMessage(`${typeLabel} silent ping sent to device ${deviceId} - watching for results...`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to send silent ping');
      setPingLoading('');
    }
  };

  const handleSendTextMessage = async () => {
    if (!user || !sendMessageText) {
      setMessage('User and message text are required');
      return;
    }

    setSendingMessage(true);
    setMessage('');

    try {
      const request: any = {
        user,
        deviceId: sendMessageDeviceId,
        message: sendMessageText
      };

      let actualTimestamp: number;
      if (sendMessageTimestamp) {
        const timestamp = parseInt(sendMessageTimestamp);
        if (!isNaN(timestamp)) {
          request.timestamp = timestamp;
          actualTimestamp = timestamp;
        } else {
          actualTimestamp = Math.floor(Date.now() / 1000);
        }
      } else {
        actualTimestamp = Math.floor(Date.now() / 1000);
      }

      const result = await ApiService.sendToDevice(request);
      setLastSentMessageId(result.messageId);
      setLastSentTimestamp(actualTimestamp);
      setMessage(`Message sent successfully! Message ID: ${result.messageId}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleEditMessage = async () => {
    if (!user || !editOriginalMessageId || !editNewText) {
      setMessage('User, original message ID, and new text are required');
      return;
    }

    setEditingMessage(true);
    setMessage('');

    try {
      const request: any = {
        user,
        deviceId: editMessageDeviceId,
        originalMessageId: editOriginalMessageId,
        newText: editNewText
      };

      if (editOriginalTimestamp) {
        const timestamp = parseInt(editOriginalTimestamp);
        if (!isNaN(timestamp)) {
          request.originalTimestamp = timestamp;
        }
      }

      if (editEditTimestamp) {
        const timestamp = parseInt(editEditTimestamp);
        if (!isNaN(timestamp)) {
          request.editTimestamp = timestamp;
        }
      }

      const result = await ApiService.editMessage(request);
      setMessage(`Message edited successfully! Edit message ID: ${result.messageId}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to edit message');
    } finally {
      setEditingMessage(false);
    }
  };

  const copyMessageId = (messageId: string) => {
    navigator.clipboard.writeText(messageId);
    setMessage(`Copied message ID: ${messageId}`);
  };

  const copyTimestamp = (timestamp: number) => {
    navigator.clipboard.writeText(timestamp.toString());
    setMessage(`Copied timestamp: ${timestamp}`);
  };

  const useLastSentForEdit = () => {
    setEditOriginalMessageId(lastSentMessageId);
    setEditOriginalTimestamp(lastSentTimestamp.toString());
    setMessage('Populated edit form with last sent message details');
  };

  const getStatusColor = (status: SilentPingResult['status']) => {
    switch (status) {
      case 'sent': return 'primary';
      case 'ack': return 'info';
      case 'delivered': return 'success';
      case 'read': return 'success';
      case 'failed': return 'error';
      case 'timeout': return 'warning';
      default: return 'default';
    }
  };

  const getDeviceStatusColor = (status: DeviceStatus['status']) => {
    switch (status) {
      case 'online': return 'success';
      case 'offline': return 'error';
      case 'checking': return 'info';
      case 'unknown': return 'default';
      default: return 'default';
    }
  };

  const getDeviceStatus = (deviceId: number): DeviceStatus | undefined => {
    const deviceKey = `${user}:${deviceId}`;
    return deviceStatuses.get(deviceKey);
  };

  const profileAllDevices = async () => {
    if (!user || devices.length === 0) {
      setMessage('Please get devices first');
      return;
    }

    setProfilingAll(true);
    setMessage('Starting complete device profiling...');
    
    try {
      const fingerprintedDevices = new Set<number>();
      const maxWaitTime = 35000; // 35 seconds total wait time  
      const startTime = Date.now();
      
      const checkAndFingerprint = (result: SilentPingResult) => {
        // Only process edit ping results that indicate the device is online
        if (result.type === 'edit' &&
            (result.status === 'delivered' || result.status === 'read') &&
            result.user === user &&
            !fingerprintedDevices.has(result.deviceId)) {

          fingerprintedDevices.add(result.deviceId);

          setTimeout(async () => {
            try {
              if (result.deviceId === 0) {
                // Primary device: send delete ping for OS detection
                console.log(`🔍 Device ${result.deviceId} is online! Fingerprinting with delete ping...`);
                await ApiService.silentPing({ user, deviceId: result.deviceId, type: 'delete' });
              } else {
                // Secondary device: send call-reject ping for type detection
                console.log(`🔍 Device ${result.deviceId} is online! Fingerprinting with call-reject ping...`);
                await ApiService.silentPing({ user, deviceId: result.deviceId, type: 'call-reject' });
              }
            } catch (err) {
              console.error(`❌ Failed to fingerprint device ${result.deviceId}:`, err);
            }
          }, 1000); // Small delay to ensure edit ping processing is complete
        }
      };
      
      // ✅ FIX: Register event handler BEFORE sending pings to avoid race condition
      const profileHandler = (result: SilentPingResult) => {
        console.log(`📊 Profile handler received result: ${result.type} ping from device ${result.deviceId} with status ${result.status}`);
        checkAndFingerprint(result);
      };
      
      if (socket) {
        socket.on('ping.result', profileHandler);
        console.log('✅ Profile event handler registered successfully');
      }
      
      // Step 1: Send edit pings to all devices to determine which are online
      console.log('📡 Step 1: Testing all devices with edit pings...');

      const editPromises = devices.map(async (device, index) => {
        const deviceId = device.device || 0;
        // Add small staggered delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, index * 200));

        try {
          await ApiService.silentPing({ user, deviceId, type: 'edit' });
          console.log(`✅ Edit ping sent to device ${deviceId}`);
        } catch (err) {
          console.error(`❌ Failed to send edit ping to device ${deviceId}:`, err);
        }
      });
      
      await Promise.all(editPromises);
      
      // Step 2: Monitor ping results and fingerprint devices as they come online
      console.log('📡 Step 2: Monitoring for online devices and fingerprinting...');
      setMessage('Phase 1 complete. Monitoring device responses and fingerprinting online devices...');
      
      // Wait for devices to respond and be fingerprinted
      const waitForCompletion = () => {
        return new Promise<void>((resolve) => {
          const checkInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const totalDevices = devices.length;
            const respondedDevices = fingerprintedDevices.size;
            
            console.log(`⏳ Profiling progress: ${respondedDevices}/${totalDevices} devices fingerprinted (${Math.round(elapsed/1000)}s elapsed)`);
            
            // Complete if all devices fingerprinted or max wait time reached
            if (fingerprintedDevices.size >= totalDevices || elapsed >= maxWaitTime) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 2000);
        });
      };
      
      await waitForCompletion();
      
      // Clean up event listener
      if (socket) {
        socket.off('ping.result', profileHandler);
      }
      
      const respondedCount = fingerprintedDevices.size;
      const totalCount = devices.length;
      setMessage(`Device profiling complete! ${respondedCount}/${totalCount} devices responded and were fingerprinted.`);
      
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to profile devices');
    } finally {
      setProfilingAll(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Device Management
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Discover devices for users, check their online status, and identify device types through ping fingerprinting.
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        <strong>Profile All:</strong> Automatically tests all devices with edit pings, then fingerprints online devices
        (delete ping for primary device OS detection, call-reject ping for secondary device type detection).
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Device Discovery
              </Typography>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={8}>
                  <TextField
                    fullWidth
                    label="User (phone number)"
                    value={user}
                    onChange={(e) => setUser(sanitizePhoneNumber(e.target.value))}
                    placeholder="1234567890"
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="contained"
                      startIcon={<SearchIcon />}
                      onClick={handleGetDevices}
                      disabled={loading}
                      sx={{ flex: 1 }}
                    >
                      Get Devices
                    </Button>
                    <Tooltip title="Automatically ping all devices to determine online status, then fingerprint online devices for OS/type detection">
                      <Button
                        variant="outlined"
                        startIcon={<ProfileAllIcon />}
                        onClick={profileAllDevices}
                        disabled={loading || profilingAll || devices.length === 0}
                        sx={{ flex: 1 }}
                      >
                        {profilingAll ? 'Profiling...' : 'Profile All'}
                      </Button>
                    </Tooltip>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {userProfile && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {/* Profile Picture */}
                  <Tooltip
                    title={
                      userProfile.profilePictureUrl
                        ? 'Profile picture loaded'
                        : userProfile.profilePictureUrl === null
                          ? 'No profile picture set (default avatar)'
                          : 'Profile picture not available'
                    }
                  >
                    <Box
                      sx={{
                        width: 64,
                        height: 64,
                        borderRadius: '50%',
                        overflow: 'hidden',
                        bgcolor: userProfile.profilePictureUrl === null ? 'grey.300' : 'grey.200',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        position: 'relative',
                        border: userProfile.profilePictureUrl === null ? '2px dashed' : 'none',
                        borderColor: 'grey.400'
                      }}
                    >
                      {userProfile.profilePictureUrl ? (
                        <img
                          src={userProfile.profilePictureUrl}
                          alt={userProfile.displayName || userProfile.phoneNumber}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => {
                            // Fallback to icon if image fails to load
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                        />
                      ) : null}

                      {/* Show icon if no profile picture URL or if image failed to load */}
                      {!userProfile.profilePictureUrl && (
                        <PersonIcon
                          sx={{
                            fontSize: 40,
                            color: 'text.secondary',
                            opacity: 0.6
                          }}
                        />
                      )}

                      {/* Small indicator badge in bottom-right corner */}
                      {userProfile.profilePictureUrl === null && (
                        <Box
                          sx={{
                            position: 'absolute',
                            bottom: 2,
                            right: 2,
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            bgcolor: 'background.paper',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: 1
                          }}
                        >
                          <BlockIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                        </Box>
                      )}
                    </Box>
                  </Tooltip>

                  {/* User Info */}
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="h6">
                      {userProfile.displayName || userProfile.contactName || userProfile.phoneNumber}
                    </Typography>

                    {/* Show contact name if different from display name */}
                    {userProfile.contactName && userProfile.displayName && userProfile.contactName !== userProfile.displayName && (
                      <Typography variant="body2" color="text.secondary">
                        Contact: {userProfile.contactName}
                      </Typography>
                    )}

                    {/* Show phone number if not already displayed */}
                    {userProfile.displayName && userProfile.phoneNumber !== userProfile.displayName && (
                      <Typography variant="body2" color="text.secondary">
                        {userProfile.phoneNumber}
                      </Typography>
                    )}

                    {/* Show about/status message */}
                    {userProfile.about && (
                      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mt: 0.5 }}>
                        "{userProfile.about}"
                      </Typography>
                    )}

                    {/* Show verified business name badge */}
                    {userProfile.verifiedName && (
                      <Chip
                        label={`✓ ${userProfile.verifiedName}`}
                        size="small"
                        color="primary"
                        sx={{ mt: 0.5 }}
                      />
                    )}
                  </Box>

                  {/* Device Count */}
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="h6" color="primary">
                      {devices.length}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {devices.length === 1 ? 'Device' : 'Devices'}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}

        {devices.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Devices for {user}
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Device</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Device Type (Passive)</TableCell>
                        <TableCell>Device Age</TableCell>
                        <TableCell>Device Type (Active)</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Last Check</TableCell>
                        <TableCell>Ping Tests</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {devices.map((device, index) => {
                        const deviceId = device.device || 0;
                        const deviceStatus = getDeviceStatus(deviceId);
                        
                        return (
                          <TableRow key={index}>
                            <TableCell>
                              <Typography variant="subtitle2">
                                Device {deviceId}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {device.user}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={deviceId === 0 ? 'Primary' : 'Secondary'}
                                size="small"
                                color={deviceId === 0 ? 'primary' : 'secondary'}
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell>
                              {/* Passive Device Type - From Prekey Bundle Analysis */}
                              {deviceStatus?.passiveInference ? (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                  <OSDisplay
                                    os={deviceStatus.passiveInference.os}
                                    iconSize="small"
                                    variant="caption"
                                  />
                                  <Tooltip title={deviceStatus.passiveInference.reasoning}>
                                    <Chip
                                      label={`${deviceStatus.passiveInference.confidence} confidence`}
                                      size="small"
                                      sx={{
                                        height: '18px',
                                        fontSize: '0.65rem',
                                        bgcolor: deviceStatus.passiveInference.confidence === 'high' ? 'success.light' : 'warning.light',
                                        color: deviceStatus.passiveInference.confidence === 'high' ? 'success.dark' : 'warning.dark'
                                      }}
                                    />
                                  </Tooltip>
                                </Box>
                              ) : (
                                <Typography variant="caption" color="text.secondary">
                                  No data
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              {/* Device Age - Calculated from Signed Pre-Key ID */}
                              {(() => {
                                if (!deviceStatus?.passiveInference) {
                                  return (
                                    <Typography variant="caption" color="text.secondary">
                                      N/A
                                    </Typography>
                                  );
                                }

                                const prekeyData = prekeyDataMap.get(deviceId);
                                const deviceAge = calculateDeviceAge(
                                  deviceStatus.passiveInference.os,
                                  prekeyData?.signedPreKeyId
                                );

                                if (deviceAge === null) {
                                  return (
                                    <Tooltip title="Device age calculation not applicable for iOS, Mac Desktop, and Android mobile variants with random Signed Pre-Key IDs (> 0xFFFF)">
                                      <Typography variant="caption" color="text.secondary">
                                        N/A
                                      </Typography>
                                    </Tooltip>
                                  );
                                }

                                const years = Math.floor(deviceAge / 12);
                                const months = deviceAge % 12;
                                const ageDisplay = years > 0
                                  ? `${years}y ${months}m`
                                  : `${months}m`;

                                return (
                                  <Tooltip title={`Approximately ${deviceAge} months old (based on Signed Pre-Key ID)`}>
                                    <Typography variant="body2">
                                      {ageDisplay}
                                    </Typography>
                                  </Tooltip>
                                );
                              })()}
                            </TableCell>
                            <TableCell>
                              {/* Active Device Type - From Ping Fingerprinting */}
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {/* Primary device (deviceId === 0) OS detection */}
                                {deviceId === 0 && (
                                  <>
                                    {deviceStatus?.fingerprint?.detectedOS === 'android' && (
                                      <>
                                        <AndroidIcon color="success" fontSize="small" />
                                        <Typography variant="caption">Android</Typography>
                                      </>
                                    )}
                                    {deviceStatus?.fingerprint?.detectedOS === 'ios' && (
                                      <>
                                        <AppleIcon color="info" fontSize="small" />
                                        <Typography variant="caption">iOS</Typography>
                                      </>
                                    )}
                                    {(!deviceStatus?.fingerprint?.detectedOS || deviceStatus?.fingerprint?.detectedOS === 'unknown') && (
                                      <>
                                        <UnknownDeviceIcon color="disabled" fontSize="small" />
                                        <Typography variant="caption" color="text.secondary">
                                          Unknown
                                        </Typography>
                                      </>
                                    )}
                                    <Tooltip title="Identify device OS by testing reaction vs delete ping responses">
                                      <Button
                                        size="small"
                                        variant="text"
                                        startIcon={<FingerprintIcon />}
                                        onClick={() => fingerprintDevice(deviceId)}
                                        disabled={deviceStatus?.fingerprint?.reactionPing === 'pending' || deviceStatus?.fingerprint?.deletePing === 'pending'}
                                        sx={{ minWidth: 'auto', padding: '2px 4px', ml: 1 }}
                                      >
                                        ID
                                      </Button>
                                    </Tooltip>
                                  </>
                                )}
                                
                                {/* Secondary device (deviceId > 0) type detection */}
                                {deviceId > 0 && (
                                  <>
                                    {deviceStatus?.fingerprint?.detectedSecondaryType === 'desktop' && (
                                      <>
                                        <DesktopIcon color="primary" fontSize="small" />
                                        <Typography variant="caption">Desktop</Typography>
                                      </>
                                    )}
                                    {deviceStatus?.fingerprint?.detectedSecondaryType === 'browser' && (
                                      <>
                                        <BrowserIcon color="secondary" fontSize="small" />
                                        <Typography variant="caption">Browser</Typography>
                                      </>
                                    )}
                                    {(!deviceStatus?.fingerprint?.detectedSecondaryType || deviceStatus?.fingerprint?.detectedSecondaryType === 'unknown') && (
                                      <>
                                        <UnknownDeviceIcon color="disabled" fontSize="small" />
                                        <Typography variant="caption" color="text.secondary">
                                          {deviceStatus?.status === 'online' ? 'Unknown' : 'Offline'}
                                        </Typography>
                                      </>
                                    )}
                                    {deviceStatus?.status === 'online' && (
                                      <Tooltip title="Identify secondary device type using call-reject ping (Desktop times out, Browser responds)">
                                        <Button
                                          size="small"
                                          variant="text"
                                          startIcon={<FingerprintIcon />}
                                          onClick={() => handleSilentPing(deviceId, 'call-reject')}
                                          disabled={deviceStatus?.fingerprint?.callRejectPing === 'pending'}
                                          sx={{ minWidth: 'auto', padding: '2px 4px', ml: 1 }}
                                        >
                                          ID
                                        </Button>
                                      </Tooltip>
                                    )}
                                  </>
                                )}
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {deviceStatus?.status === 'online' && <OnlineIcon color="success" fontSize="small" />}
                                {deviceStatus?.status === 'offline' && <OfflineIcon color="error" fontSize="small" />}
                                {deviceStatus?.status === 'checking' && <CheckingIcon color="info" fontSize="small" />}
                                {deviceStatus?.status === 'unknown' && <UnknownIcon color="disabled" fontSize="small" />}
                                <Chip
                                  label={deviceStatus?.status?.toUpperCase() || 'UNKNOWN'}
                                  size="small"
                                  color={getDeviceStatusColor(deviceStatus?.status || 'unknown')}
                                  variant="filled"
                                />
                                {deviceStatus?.responseTime && (
                                  <Typography variant="caption" color="text.secondary">
                                    {deviceStatus.responseTime}ms
                                  </Typography>
                                )}
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {deviceStatus?.lastCheck ? (
                                  <>
                                    <TimeIcon fontSize="small" color="disabled" />
                                    <Tooltip title={new Date(deviceStatus.lastCheck).toLocaleString()}>
                                      <Typography variant="caption" color="text.secondary">
                                        {new Date(deviceStatus.lastCheck).toLocaleTimeString()}
                                      </Typography>
                                    </Tooltip>
                                  </>
                                ) : (
                                  <Typography variant="caption" color="text.secondary">
                                    Never checked
                                  </Typography>
                                )}
                                <Button
                                  size="small"
                                  variant="text"
                                  startIcon={<CheckingIcon />}
                                  onClick={() => checkDeviceStatus(deviceId)}
                                  disabled={deviceStatus?.status === 'checking'}
                                  sx={{ minWidth: 'auto', padding: '4px 8px' }}
                                >
                                  Check
                                </Button>
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                                <Tooltip title="Reaction Ping - Test connectivity using reaction messages">
                                  <IconButton
                                    size="small"
                                    color="primary"
                                    onClick={() => handleSilentPing(deviceId, 'reaction')}
                                    disabled={pingLoading === `${user}:${deviceId}:reaction`}
                                    sx={{ 
                                      border: '1px solid',
                                      borderColor: 'primary.main',
                                      borderRadius: 1,
                                      '&:hover': { backgroundColor: 'primary.light', opacity: 0.1 }
                                    }}
                                  >
                                    <ReactionIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                
                                <Tooltip title="Delete Ping - Test connectivity using delete messages">
                                  <IconButton
                                    size="small"
                                    color="secondary"
                                    onClick={() => handleSilentPing(deviceId, 'delete')}
                                    disabled={pingLoading === `${user}:${deviceId}:delete`}
                                    sx={{ 
                                      border: '1px solid',
                                      borderColor: 'secondary.main',
                                      borderRadius: 1,
                                      '&:hover': { backgroundColor: 'secondary.light', opacity: 0.1 }
                                    }}
                                  >
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                
                                <Tooltip title="Edit Ping - Test connectivity using edit messages">
                                  <IconButton
                                    size="small"
                                    color="warning"
                                    onClick={() => handleSilentPing(deviceId, 'edit')}
                                    disabled={pingLoading === `${user}:${deviceId}:edit`}
                                    sx={{ 
                                      border: '1px solid',
                                      borderColor: 'warning.main',
                                      borderRadius: 1,
                                      '&:hover': { backgroundColor: 'warning.light', opacity: 0.1 }
                                    }}
                                  >
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                
                                <Tooltip title="Call Reject Ping - Test connectivity using call reject messages">
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => handleSilentPing(deviceId, 'call-reject')}
                                    disabled={pingLoading === `${user}:${deviceId}:call-reject`}
                                    sx={{ 
                                      border: '1px solid',
                                      borderColor: 'error.main',
                                      borderRadius: 1,
                                      '&:hover': { backgroundColor: 'error.light', opacity: 0.1 }
                                    }}
                                  >
                                    <CallRejectIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                
                                <Tooltip title="Unknown Protocol Ping - Test connectivity using non-existent protocol type 101">
                                  <IconButton
                                    size="small"
                                    color="info"
                                    onClick={() => handleSilentPing(deviceId, 'unknown')}
                                    disabled={pingLoading === `${user}:${deviceId}:unknown`}
                                    sx={{ 
                                      border: '1px solid',
                                      borderColor: 'info.main',
                                      borderRadius: 1,
                                      '&:hover': { backgroundColor: 'info.light', opacity: 0.1 }
                                    }}
                                  >
                                    <UnknownProtocolIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                
                                <Tooltip title="Poll Response Ping - Test connectivity using poll response to non-existent poll">
                                  <IconButton
                                    size="small"
                                    color="success"
                                    onClick={() => handleSilentPing(deviceId, 'poll-response')}
                                    disabled={pingLoading === `${user}:${deviceId}:poll-response`}
                                    sx={{ 
                                      border: '1px solid',
                                      borderColor: 'success.main',
                                      borderRadius: 1,
                                      '&:hover': { backgroundColor: 'success.light', opacity: 0.1 }
                                    }}
                                  >
                                    <PollResponseIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                
                                <Tooltip title="Button Response Ping - Test interactive UI capabilities with button response">
                                  <IconButton
                                    size="small"
                                    sx={{ 
                                      border: '1px solid',
                                      borderColor: '#9c27b0',
                                      borderRadius: 1,
                                      color: '#9c27b0',
                                      '&:hover': { backgroundColor: '#9c27b0', color: 'white', opacity: 0.9 }
                                    }}
                                    onClick={() => handleSilentPing(deviceId, 'button-response')}
                                    disabled={pingLoading === `${user}:${deviceId}:button-response`}
                                  >
                                    <ButtonResponseIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                
                                <Tooltip title="Device Coordination Ping - Test multi-device sync and hierarchy">
                                  <IconButton
                                    size="small"
                                    sx={{ 
                                      border: '1px solid',
                                      borderColor: '#ff9800',
                                      borderRadius: 1,
                                      color: '#ff9800',
                                      '&:hover': { backgroundColor: '#ff9800', color: 'white', opacity: 0.9 }
                                    }}
                                    onClick={() => handleSilentPing(deviceId, 'device-sent')}
                                    disabled={pingLoading === `${user}:${deviceId}:device-sent`}
                                  >
                                    <DeviceSentIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                
                                <Tooltip title="App State Exception Ping - Test low-level app state handling">
                                  <IconButton
                                    size="small"
                                    sx={{ 
                                      border: '1px solid',
                                      borderColor: '#f44336',
                                      borderRadius: 1,
                                      color: '#f44336',
                                      '&:hover': { backgroundColor: '#f44336', color: 'white', opacity: 0.9 }
                                    }}
                                    onClick={() => handleSilentPing(deviceId, 'app-state')}
                                    disabled={pingLoading === `${user}:${deviceId}:app-state`}
                                  >
                                    <AppStateIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                
                                <Tooltip title="Peer Data Operation Ping - Test P2P data operations and device coordination">
                                  <IconButton
                                    size="small"
                                    sx={{ 
                                      border: '1px solid',
                                      borderColor: '#795548',
                                      borderRadius: 1,
                                      color: '#795548',
                                      '&:hover': { backgroundColor: '#795548', color: 'white', opacity: 0.9 }
                                    }}
                                    onClick={() => handleSilentPing(deviceId, 'peer-data-operation')}
                                    disabled={pingLoading === `${user}:${deviceId}:peer-data-operation`}
                                  >
                                    <PeerDataIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                
                                <Tooltip title="Malformed Message Ping - Test protocol buffer validation with invalid field name">
                                  <IconButton
                                    size="small"
                                    sx={{ 
                                      border: '1px solid',
                                      borderColor: '#d32f2f',
                                      borderRadius: 1,
                                      color: '#d32f2f',
                                      '&:hover': { backgroundColor: '#d32f2f', color: 'white', opacity: 0.9 }
                                    }}
                                    onClick={() => handleSilentPing(deviceId, 'malformed-message')}
                                    disabled={pingLoading === `${user}:${deviceId}:malformed-message`}
                                  >
                                    <MalformedMessageIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Ping Results Section */}
        {pingResults.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6" sx={{ flexGrow: 1 }}>
                    Silent Ping Results ({pingResults.length})
                  </Typography>
                  <IconButton onClick={() => setShowResults(!showResults)}>
                    {showResults ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </IconButton>
                </Box>
                
                <Collapse in={showResults}>
                  <List>
                    {pingResults.map((result) => (
                      <ListItem key={result.messageId} divider>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="subtitle1">
                                {result.user}:{result.deviceId}
                              </Typography>
                              <Chip 
                                label={result.type === 'call-reject' ? 'CALL-REJECT' : result.type === 'unknown' ? 'UNKNOWN' : result.type === 'poll-response' ? 'POLL-RESPONSE' : result.type === 'button-response' ? 'BUTTON-RESPONSE' : result.type === 'device-sent' ? 'DEVICE-SENT' : result.type === 'app-state' ? 'APP-STATE' : result.type === 'peer-data-operation' ? 'PEER-DATA-OP' : result.type === 'malformed-message' ? 'MALFORMED-MSG' : result.type.toUpperCase()} 
                                size="small"
                                color={result.type === 'delete' ? 'secondary' : result.type === 'edit' ? 'warning' : result.type === 'call-reject' ? 'error' : result.type === 'unknown' ? 'info' : result.type === 'poll-response' ? 'success' : result.type === 'button-response' ? 'secondary' : result.type === 'device-sent' ? 'warning' : result.type === 'app-state' ? 'error' : result.type === 'peer-data-operation' ? 'info' : result.type === 'malformed-message' ? 'error' : 'primary'}
                                variant="filled"
                              />
                              <Chip 
                                label={result.status.toUpperCase()} 
                                size="small"
                                color={getStatusColor(result.status)}
                                variant="outlined"
                              />
                              {result.roundTripTime && (
                                <Chip 
                                  label={`${result.roundTripTime}ms`} 
                                  size="small"
                                  variant="outlined"
                                />
                              )}
                            </Box>
                          }
                          secondary={
                            <Box>
                              <Typography variant="body2" color="text.secondary">
                                {new Date(result.timestamp).toLocaleTimeString()}
                              </Typography>
                              {result.error && (
                                <Typography variant="body2" color="error">
                                  Error: {result.error}
                                </Typography>
                              )}
                            </Box>
                          }
                        />
                        {result.status === 'sent' && (
                          <ListItemSecondaryAction>
                            <LinearProgress sx={{ width: 60 }} />
                          </ListItemSecondaryAction>
                        )}
                      </ListItem>
                    ))}
                  </List>
                </Collapse>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Send Text Message Section */}
        {devices.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Send Text Message to Device
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      select
                      fullWidth
                      label="Target Device"
                      value={sendMessageDeviceId}
                      onChange={(e) => setSendMessageDeviceId(Number(e.target.value))}
                      SelectProps={{ native: true }}
                    >
                      {devices.map((device) => (
                        <option key={device.device || 0} value={device.device || 0}>
                          Device {device.device || 0} {device.device === 0 ? '(Primary)' : '(Secondary)'}
                        </option>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      multiline
                      rows={3}
                      label="Message Text"
                      value={sendMessageText}
                      onChange={(e) => setSendMessageText(e.target.value)}
                      placeholder="Enter message text to send..."
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Timestamp (optional, Unix seconds)"
                      value={sendMessageTimestamp}
                      onChange={(e) => setSendMessageTimestamp(e.target.value)}
                      placeholder="Leave empty for current time"
                      helperText="Unix timestamp in seconds for research/testing"
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={handleSendTextMessage}
                      disabled={sendingMessage || !sendMessageText}
                      fullWidth
                    >
                      {sendingMessage ? 'Sending...' : 'Send Message'}
                    </Button>
                  </Grid>
                  {lastSentMessageId && (
                    <Grid item xs={12}>
                      <Alert
                        severity="success"
                        sx={{
                          '& .MuiAlert-message': { width: '100%' }
                        }}
                      >
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                            <Typography variant="body2">
                              <strong>Message ID:</strong> {lastSentMessageId}
                            </Typography>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => copyMessageId(lastSentMessageId)}
                            >
                              Copy ID
                            </Button>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                            <Typography variant="body2">
                              <strong>Timestamp:</strong> {lastSentTimestamp} ({new Date(lastSentTimestamp * 1000).toLocaleString()})
                            </Typography>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => copyTimestamp(lastSentTimestamp)}
                            >
                              Copy Timestamp
                            </Button>
                          </Box>
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                            <Button
                              size="small"
                              variant="contained"
                              color="secondary"
                              onClick={useLastSentForEdit}
                            >
                              Use for Edit Below
                            </Button>
                          </Box>
                        </Box>
                      </Alert>
                    </Grid>
                  )}
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Edit Message Section (Research Mode) */}
        {devices.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Edit Message (Research Mode)
                </Typography>
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    <strong>Research Feature:</strong> Test if WhatsApp's 15-minute edit window can be bypassed by manipulating timestamps.
                    Normal edits are only allowed within 15 minutes of sending.
                  </Typography>
                </Alert>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      select
                      fullWidth
                      label="Target Device"
                      value={editMessageDeviceId}
                      onChange={(e) => setEditMessageDeviceId(Number(e.target.value))}
                      SelectProps={{ native: true }}
                    >
                      {devices.map((device) => (
                        <option key={device.device || 0} value={device.device || 0}>
                          Device {device.device || 0} {device.device === 0 ? '(Primary)' : '(Secondary)'}
                        </option>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Original Message ID"
                      value={editOriginalMessageId}
                      onChange={(e) => setEditOriginalMessageId(e.target.value)}
                      placeholder="Message ID to edit"
                      helperText="Copy from sent message above or ping results"
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      multiline
                      rows={3}
                      label="New Text"
                      value={editNewText}
                      onChange={(e) => setEditNewText(e.target.value)}
                      placeholder="Enter new message text..."
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Original Timestamp (optional, Unix seconds)"
                      value={editOriginalTimestamp}
                      onChange={(e) => setEditOriginalTimestamp(e.target.value)}
                      placeholder="Leave empty for current"
                      helperText="When original message was sent (research)"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Edit Timestamp (optional, Unix seconds)"
                      value={editEditTimestamp}
                      onChange={(e) => setEditEditTimestamp(e.target.value)}
                      placeholder="Leave empty for current"
                      helperText="When edit is performed (test 15min limit)"
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Button
                      variant="contained"
                      color="secondary"
                      onClick={handleEditMessage}
                      disabled={editingMessage || !editOriginalMessageId || !editNewText}
                      fullWidth
                    >
                      {editingMessage ? 'Editing...' : 'Edit Message'}
                    </Button>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      {message && (
        <Alert severity="info" sx={{ mt: 2 }}>
          {message}
        </Alert>
      )}
    </Box>
  );
};

export default DevicesPage;
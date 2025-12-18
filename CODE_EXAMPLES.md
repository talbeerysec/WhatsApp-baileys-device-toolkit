# Device Implementation - Code Examples

## 1. Frontend: Sending a Silent Ping

### React Component (DevicesPage.tsx)
```typescript
const handleSilentPing = async (
  deviceId: number, 
  type: 'reaction' | 'delete' | 'call-reject' | ... = 'reaction'
) => {
  setPingLoading(`${user}:${deviceId}:${type}`);
  setMessage('');

  try {
    // Make API call to backend
    await ApiService.silentPing({ user, deviceId, type });
    
    const typeLabel = /* determine label based on type */;
    setMessage(`${typeLabel} silent ping sent to device ${deviceId} - watching for results...`);
  } catch (err) {
    setMessage(err instanceof Error ? err.message : 'Failed to send silent ping');
    setPingLoading('');
  }
};
```

### Socket Event Listener
```typescript
useEffect(() => {
  if (!socket) return;

  const handlePingResult = (result: SilentPingResult) => {
    console.log('🎯 Received ping result:', result);
    
    // Update ping results list
    setPingResults(prev => {
      const existingIndex = prev.findIndex(r => r.messageId === result.messageId);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = result;
        return updated;
      } else {
        return [result, ...prev].slice(0, 20);
      }
    });

    // Update device status based on ping result
    const deviceKey = `${result.user}:${result.deviceId}`;
    setDeviceStatuses(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(deviceKey);
      
      if (existing) {
        let status: DeviceStatus['status'] = existing.status;
        
        // Determine online/offline status
        if (result.type === 'reaction') {
          if (result.status === 'delivered' || result.status === 'read') {
            status = 'online';
          } else if (result.status === 'timeout' || result.status === 'failed') {
            status = 'offline';
          }
        }
        
        newMap.set(deviceKey, {
          ...existing,
          status,
          lastCheck: new Date().toISOString(),
          responseTime: result.roundTripTime
        });
      }
      
      return newMap;
    });
    
    setShowResults(true);
    
    if (result.status !== 'sent' && result.status !== 'ack') {
      setPingLoading('');
    }
  };

  socket.on('ping.result', handlePingResult);

  return () => {
    socket.off('ping.result', handlePingResult);
  };
}, [socket]);
```

---

## 2. Backend: Sending a Silent Ping

### Express Route Handler (devices.ts)
```typescript
router.post('/ping',
  authenticateToken,
  validateUser('user'),
  validateDeviceId('deviceId'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { user, deviceId, type = 'reaction' } = req.body;
      const whatsappService: WhatsAppService = req.app.locals.whatsappService;

      console.log(`🌐 API: Silent ping request - User: ${user}, Device: ${deviceId}, Type: ${type}`);

      await whatsappService.silentPing(user, deviceId, type);

      console.log(`✅ API: Silent ping completed successfully`);

      const response: ApiResponse = {
        success: true,
        message: `${type}-based silent ping sent to device ${deviceId} of user ${user}`
      };

      res.json(response);
    } catch (error) {
      console.error('Silent ping error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send silent ping'
      } as ApiResponse);
    }
  }
);
```

### Service Implementation (whatsapp.ts)
```typescript
async silentPing(
  user: string, 
  deviceId: number, 
  type: 'reaction' | 'delete' | 'edit' | 'call-reject' | ... = 'reaction'
): Promise<SilentPingResult> {
  console.log(`🚀 WhatsAppService.silentPing called - User: ${user}, Device: ${deviceId}, Type: ${type}`);
  
  if (!this.isConnected() || !this.sock) {
    throw new Error('WhatsApp not connected');
  }

  const jid = user.includes('@') ? user : `${user}@s.whatsapp.net`;
  const randomMessageId = generateMessageIDV2(this.sock.user?.id);  // Target fake message
  const actualMessageId = generateMessageIDV2(this.sock.user?.id);  // Track this ping
  const deviceSpecificJid = deviceId !== undefined ? 
    `${user}:${deviceId}@s.whatsapp.net` : 
    jid;

  console.log(`📡 Sending ${type}-based silent ping to device ${deviceId} of user ${user}...`);

  // Set up 30-second timeout
  const timeoutId = setTimeout(() => {
    if (this.pendingSilentPings.has(actualMessageId)) {
      console.log(`⏰ ${type}-based silent ping timeout for ${user}:${deviceId}`);
      
      const result: SilentPingResult = {
        user,
        deviceId,
        messageId: actualMessageId,
        timestamp: Date.now(),
        status: 'timeout',
        type,
        error: 'No response after 30 seconds'
      };
      
      this.emit('ping.result', result);
      this.pendingSilentPings.delete(actualMessageId);
    }
  }, 30000);

  // Track this ping
  this.pendingSilentPings.set(actualMessageId, {
    user,
    deviceId,
    timestamp: Date.now(),
    timeoutId,
    type
  });

  // Create type-specific message
  let message: any;
  
  if (type === 'reaction') {
    message = {
      reactionMessage: {
        key: {
          remoteJid: jid,
          id: randomMessageId,
          fromMe: false
        },
        text: '',
        senderTimestampMs: Date.now()
      }
    };
  } else if (type === 'delete') {
    message = {
      protocolMessage: {
        type: 0, // REVOKE
        key: {
          remoteJid: jid,
          id: randomMessageId,
          fromMe: false
        }
      }
    };
  } else if (type === 'call-reject') {
    message = {
      protocolMessage: {
        type: 22, // CALL_LOG_MESSAGE
        key: {
          remoteJid: jid,
          id: randomMessageId,
          fromMe: false
        },
        callLogMessage: {
          isVideo: false,
          callOutcome: 3, // REJECTED
          durationSecs: 0,
          isGroup: false,
          callId: randomMessageId,
          participants: [{
            jid: deviceSpecificJid,
            callOutcome: 3
          }]
        }
      }
    };
  }
  // ... other ping types ...

  try {
    // CRITICAL: Use relayMessage with participant targeting for device-specific delivery
    await this.sock.relayMessage(jid, message, {
      messageId: actualMessageId,
      participant: {
        jid: deviceSpecificJid,    // Target specific device!
        count: 0
      }
    });

    const initialResult: SilentPingResult = {
      user,
      deviceId,
      messageId: actualMessageId,
      timestamp: Date.now(),
      status: 'sent',
      type
    };

    console.log(`✅ ${type}-based silent ping sent! Waiting for response... (timeout: 30s)`);
    this.emit('ping.result', initialResult);
    
    return initialResult;
  } catch (error) {
    // Clean up on error
    if (this.pendingSilentPings.has(actualMessageId)) {
      clearTimeout(this.pendingSilentPings.get(actualMessageId)!.timeoutId);
      this.pendingSilentPings.delete(actualMessageId);
    }

    const errorResult: SilentPingResult = {
      user,
      deviceId,
      messageId: actualMessageId,
      timestamp: Date.now(),
      status: 'failed',
      type,
      error: error instanceof Error ? error.message : 'Unknown error'
    };

    this.emit('ping.result', errorResult);
    throw error;
  }
}
```

---

## 3. Receipt Tracking

### Message Update Handler (whatsapp.ts)
```typescript
private handleMessagesUpdate(updates: any[]): void {
  console.log('📝 Message updates:', updates.length);
  
  for (const { key, update } of updates) {
    const messageId = key?.id;
    
    // Check if this is a response to a tracked ping
    if (messageId && this.pendingSilentPings.has(messageId) && update.status) {
      const pingInfo = this.pendingSilentPings.get(messageId)!;
      const roundTripTime = Date.now() - pingInfo.timestamp;
      
      // Map status codes to human-readable strings
      const statusMap: { [key: number]: SilentPingResult['status'] } = {
        0: 'failed',    // Message failed
        1: 'sent',      // Sent to server
        2: 'ack',       // ACK from server
        3: 'delivered', // Delivered to device
        4: 'read',      // Read by user
        5: 'read'       // Also read
      };
      
      const status = statusMap[update.status] || 'ack';
      
      // Create result object
      const result: SilentPingResult = {
        user: pingInfo.user,
        deviceId: pingInfo.deviceId,
        messageId,
        timestamp: pingInfo.timestamp,
        status,
        type: pingInfo.type,
        roundTripTime
      };
      
      console.log(`🎯 Silent ping ${status} received for ${pingInfo.user}:${pingInfo.deviceId} (${roundTripTime}ms)`);

      // Emit result to frontend via WebSocket
      this.emit('ping.result', result);

      // Cleanup logic:
      // - Delete pings: iOS responds with ACK (status 2) - cleanup immediately
      // - Other pings: Wait for delivered/read (status >= 3)
      const shouldCleanup = (pingInfo.type === 'delete' && update.status >= 2) || 
                           update.status >= 3;

      if (shouldCleanup) {
        clearTimeout(pingInfo.timeoutId);
        this.pendingSilentPings.delete(messageId);
        console.log(`🧹 Cleaned up tracking for ${pingInfo.type} ping to ${pingInfo.user}:${pingInfo.deviceId}`);
      }
    }
  }
  
  this.emit('messages.update', updates);
}
```

---

## 4. Device Discovery

### API Route Handler (devices.ts)
```typescript
router.get('/:user',
  authenticateToken,
  async (req, res) => {
    try {
      const { user } = req.params;
      
      // Validate user parameter
      if (!/^[0-9]+$/.test(user)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid user format (should be phone number)'
        } as ApiResponse);
      }

      const whatsappService: WhatsAppService = req.app.locals.whatsappService;
      const devices = await whatsappService.getDevices(user);

      const response: ApiResponse<DeviceInfo[]> = {
        success: true,
        data: devices
      };

      res.json(response);
    } catch (error) {
      console.error('Get devices error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get devices'
      } as ApiResponse);
    }
  }
);
```

### Service Implementation (whatsapp.ts)
```typescript
async getDevices(user: string): Promise<DeviceInfo[]> {
  if (!this.isConnected() || !this.sock) {
    throw new Error('WhatsApp not connected');
  }

  let jid = user.includes('@') ? user : `${user}@s.whatsapp.net`;
  
  // Handle phone number translation (for number changes)
  if (!user.includes('@') && /^\+?\d+$/.test(user.replace(/[^\d+]/g, ''))) {
    console.log(`🔍 Translating phone number ${user} to WhatsApp JID...`);
    try {
      const phoneResults = await this.sock.onWhatsApp(user);
      if (phoneResults && phoneResults.length > 0 && phoneResults[0].exists) {
        jid = phoneResults[0].jid;
        console.log(`✅ Translated ${user} → ${jid}`);
      } else {
        console.log(`⚠️ Phone number ${user} not found on WhatsApp`);
        return [];
      }
    } catch (error) {
      console.log(`❌ Failed to translate phone number ${user}:`, error);
      jid = `${user}@s.whatsapp.net`;
    }
  }

  // Get devices from server (fresh, not cached)
  const devices = await this.sock.getUSyncDevices(
    [jid],      // JID array
    false,      // useCache = false (always fetch fresh)
    false       // ignoreZeroDevices = false
  );
  
  console.log(`📱 Fetched ${devices.length} devices for ${jid} (fresh from server)`);
  
  return devices.map(device => ({
    user: device.user,
    device: device.device
  }));
}
```

---

## 5. Device-Specific Messaging

### Send Message to Specific Device (whatsapp.ts)
```typescript
async sendMessageToDevice(
  user: string, 
  deviceId: number, 
  message: string, 
  timestamp?: number
): Promise<string> {
  if (!this.isConnected() || !this.sock) {
    throw new Error('WhatsApp not connected');
  }

  const normalJid = `${user}@s.whatsapp.net`;
  const deviceSpecificJid = deviceId !== undefined ? 
    `${user}:${deviceId}@s.whatsapp.net` : 
    normalJid;

  // Generate message ID
  const messageId = generateMessageIDV2(this.sock.user?.id);

  const messageOptions: any = {
    userJid: this.sock.user?.id,
    messageId: messageId
  };

  // Add custom timestamp if provided (for research)
  if (timestamp !== undefined) {
    messageOptions.timestamp = new Date(timestamp * 1000);
    console.log(`📅 Sending device message with custom timestamp: ${timestamp}`);
  }

  // Generate WAMessage with timestamp baked in
  const waMessage = generateWAMessageFromContent(
    normalJid,
    { conversation: message },
    messageOptions
  );

  const relayOptions: any = {
    messageId: messageId,
    participant: {
      jid: deviceSpecificJid,  // CRITICAL: Device-specific JID
      count: 0
    }
  };

  // Add timestamp to stanza attributes if provided
  if (timestamp !== undefined) {
    relayOptions.additionalAttributes = {
      t: Math.floor(timestamp).toString()
    };
  }

  // Send with device targeting
  await this.sock.relayMessage(normalJid, waMessage.message!, relayOptions);

  return messageId;
}
```

---

## 6. Batch Profiling (Profile All)

### Frontend Implementation (DevicesPage.tsx)
```typescript
const profileAllDevices = async () => {
  if (!user || devices.length === 0) {
    setMessage('Please get devices first');
    return;
  }

  setProfilingAll(true);
  setMessage('Starting complete device profiling...');
  
  try {
    const fingerprintedDevices = new Set<number>();
    const maxWaitTime = 35000; // 35 seconds
    const startTime = Date.now();
    
    // Handler for profiling logic
    const checkAndFingerprint = (result: SilentPingResult) => {
      // Only process successful reaction pings
      if (result.type === 'reaction' && 
          (result.status === 'delivered' || result.status === 'read') && 
          result.user === user && 
          !fingerprintedDevices.has(result.deviceId)) {
        
        fingerprintedDevices.add(result.deviceId);
        
        // Schedule fingerprinting after a delay
        setTimeout(async () => {
          try {
            if (result.deviceId === 0) {
              // Primary: use delete ping for OS detection
              console.log(`🔍 Device ${result.deviceId} is online! Fingerprinting with delete ping...`);
              await ApiService.silentPing({ user, deviceId: result.deviceId, type: 'delete' });
            } else {
              // Secondary: use call-reject ping for type detection
              console.log(`🔍 Device ${result.deviceId} is online! Fingerprinting with call-reject ping...`);
              await ApiService.silentPing({ user, deviceId: result.deviceId, type: 'call-reject' });
            }
          } catch (err) {
            console.error(`❌ Failed to fingerprint device ${result.deviceId}:`, err);
          }
        }, 1000);
      }
    };
    
    // Register event handler BEFORE sending pings (avoid race condition)
    const profileHandler = (result: SilentPingResult) => {
      console.log(`📊 Profile handler received result: ${result.type} ping from device ${result.deviceId}`);
      checkAndFingerprint(result);
    };
    
    if (socket) {
      socket.on('ping.result', profileHandler);
      console.log('✅ Profile event handler registered successfully');
    }
    
    // Step 1: Send reaction pings to all devices
    console.log('📡 Step 1: Testing all devices with reaction pings...');
    
    const reactionPromises = devices.map(async (device, index) => {
      const deviceId = device.device || 0;
      // Stagger pings by 200ms to avoid overwhelming system
      await new Promise(resolve => setTimeout(resolve, index * 200));
      
      try {
        await ApiService.silentPing({ user, deviceId, type: 'reaction' });
        console.log(`✅ Reaction ping sent to device ${deviceId}`);
      } catch (err) {
        console.error(`❌ Failed to send reaction ping to device ${deviceId}:`, err);
      }
    });
    
    await Promise.all(reactionPromises);
    
    // Step 2: Monitor for responses and fingerprint
    console.log('📡 Step 2: Monitoring for online devices and fingerprinting...');
    setMessage('Phase 1 complete. Monitoring device responses and fingerprinting online devices...');
    
    // Wait for completion with timeout
    const waitForCompletion = () => {
      return new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const totalDevices = devices.length;
          const respondedDevices = fingerprintedDevices.size;
          
          console.log(`⏳ Profiling progress: ${respondedDevices}/${totalDevices} devices fingerprinted`);
          
          // Complete if all devices fingerprinted or timeout reached
          if (fingerprintedDevices.size >= totalDevices || elapsed >= maxWaitTime) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 2000);
      });
    };
    
    await waitForCompletion();
    
    // Clean up
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
```

---

## 7. Fingerprinting Logic

### OS Detection (Primary Device)
```typescript
// React to ping result
if (result.type === 'reaction') {
  if (result.status === 'delivered' || result.status === 'read') {
    status = 'online';
  }
}

if (result.type === 'reaction') {
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
}

// Determine OS based on fingerprinting (only for primary devices)
if (result.deviceId === 0 && updatedFingerprint.reactionPing && updatedFingerprint.deletePing) {
  if (updatedFingerprint.reactionPing === 'success' && updatedFingerprint.deletePing === 'timeout') {
    updatedFingerprint.detectedOS = 'android';  // Delete ping times out
  } else if (updatedFingerprint.reactionPing === 'success' && updatedFingerprint.deletePing === 'success') {
    updatedFingerprint.detectedOS = 'ios';      // Delete ping succeeds
  } else {
    updatedFingerprint.detectedOS = 'unknown';
  }
  updatedFingerprint.lastFingerprint = new Date().toISOString();
}
```

### Device Type Detection (Secondary Device)
```typescript
if (result.deviceId > 0 && status === 'online' && result.type === 'call-reject' && updatedFingerprint.callRejectPing) {
  if (updatedFingerprint.callRejectPing === 'timeout') {
    updatedFingerprint.detectedSecondaryType = 'desktop';  // Call reject times out
  } else if (updatedFingerprint.callRejectPing === 'success') {
    updatedFingerprint.detectedSecondaryType = 'browser';  // Call reject responds
  } else {
    updatedFingerprint.detectedSecondaryType = 'unknown';
  }
  updatedFingerprint.lastFingerprint = new Date().toISOString();
}
```

---

## 8. API Client Service

### Client-side API Calls (api.ts)
```typescript
static async getDevices(user: string): Promise<DeviceInfo[]> {
  const response: AxiosResponse<ApiResponse<DeviceInfo[]>> = 
    await api.get(`/api/devices/${user}`);
  
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to get devices');
  }
  
  return response.data.data || [];
}

static async silentPing(request: SilentPingRequest): Promise<void> {
  const response: AxiosResponse<ApiResponse> = 
    await api.post('/api/devices/ping', request);
  
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to send silent ping');
  }
}

static async sendToDevice(request: SendToDeviceRequest): Promise<MessageResponse> {
  const response: AxiosResponse<ApiResponse<MessageResponse>> = 
    await api.post('/api/messages/device', request);
  
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Failed to send message to device');
  }
  
  return response.data.data;
}
```

---

## 9. JID Format Examples

```typescript
// Standard JID (all devices of a user)
"1234567890@s.whatsapp.net"

// Primary device only
"1234567890:0@s.whatsapp.net"

// Secondary device (e.g., desktop, web)
"1234567890:1@s.whatsapp.net"
"1234567890:2@s.whatsapp.net"

// Group JID
"123456789-987654321@g.us"
```

---

## 10. Status Code Mapping

```typescript
const statusMap: { [key: number]: SilentPingResult['status'] } = {
  0: 'failed',       // Message delivery failed
  1: 'sent',         // Sent to WhatsApp servers (client ACK)
  2: 'ack',          // Server acknowledged (protocol ACK)
  3: 'delivered',    // Delivered to target device
  4: 'read',         // Read by recipient
  5: 'read'          // Also read
};

// Important: Delete pings cleanup on status >= 2 (ACK)
// Other pings cleanup on status >= 3 (delivered/read)
```

This distinction is crucial because iOS devices respond quickly to delete pings with ACK, while Android devices may not respond at all, allowing the fingerprinting logic to work reliably.

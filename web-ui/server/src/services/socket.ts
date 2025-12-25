import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { WhatsAppService } from './whatsapp';

export class SocketService {
  private io: SocketServer;
  private whatsappService: WhatsAppService;
  private authenticatedSockets = new Map<string, Socket>();

  constructor(io: SocketServer, whatsappService: WhatsAppService) {
    this.io = io;
    this.whatsappService = whatsappService;
    this.setupSocketHandlers();
    this.setupWhatsAppEventForwarding();
  }

  private setupSocketHandlers(): void {
    this.io.use((socket, next) => {
      const token = socket.handshake.auth?.token;
      
      if (!token) {
        return next(new Error('Authentication required'));
      }

      try {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          return next(new Error('Server configuration error'));
        }

        const decoded = jwt.verify(token, secret) as any;
        socket.data.user = decoded;
        next();
      } catch (error) {
        next(new Error('Invalid token'));
      }
    });

    this.io.on('connection', (socket) => {
      console.log(`🔌 Client connected: ${socket.id}`);
      console.log(`🚨 DEBUG: Socket connection handler EXECUTING - this proves code is loaded`);

      // Store authenticated socket
      this.authenticatedSockets.set(socket.id, socket);

      // Send current connection status
      const connectionStatus = this.whatsappService.getConnectionStatus();
      console.log(`📊 Connection status for new client: state=${connectionStatus.state}, auth=${connectionStatus.isAuthenticated}`);
      socket.emit('connection.status', connectionStatus);

      // Send server ready signal if WhatsApp is connected
      const isConnected = this.whatsappService.isConnected();
      console.log(`🔍 Checking if WhatsApp is connected: ${isConnected}`);
      if (isConnected) {
        console.log('✅ WhatsApp already connected, sending server:ready to new client');
        socket.emit('server:ready', true);
      } else {
        console.log('⏳ WhatsApp not yet connected, client will wait for server:ready event');
      }

      // Send latest QR code if available and not connected
      const qr = this.whatsappService.getLatestQRCode();
      if (qr && !this.whatsappService.isConnected()) {
        console.log('📱 Sending latest QR code to new client');
        socket.emit('qr', qr);
      }

      // Send initial data (chats and contacts) if available
      // This prevents the need for a manual refresh after connection
      // getChats is async, getContacts is sync
      this.whatsappService.getChats().then(chats => {
        console.log(`📊 Sending initial chats to new client: ${chats.length} chats`);
        socket.emit('chats.update', chats);
      });

      const contacts = this.whatsappService.getContacts();
      console.log(`📊 Sending initial contacts to new client: ${contacts.length} contacts`);
      socket.emit('contacts.update', contacts);

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
        this.authenticatedSockets.delete(socket.id);
      });

      // Handle client requests for data refresh
      socket.on('request.chats', async () => {
        const chats = await this.whatsappService.getChats();
        socket.emit('chats.update', chats);
      });

      socket.on('request.contacts', () => {
        socket.emit('contacts.update', this.whatsappService.getContacts());
      });

      socket.on('request.status', () => {
        socket.emit('connection.status', this.whatsappService.getConnectionStatus());
      });
    });
  }

  private setupWhatsAppEventForwarding(): void {
    // Forward WhatsApp events to all connected clients
    this.whatsappService.on('connection.status', (status) => {
      this.broadcastToAll('connection.status', status);

      // Emit server:ready when WhatsApp connection is fully established
      if (status.state === 'open' && status.isAuthenticated) {
        console.log('✅ WhatsApp fully connected, broadcasting server:ready to all clients');
        this.broadcastToAll('server:ready', true);
      }
    });

    this.whatsappService.on('qr', (qr) => {
      this.broadcastToAll('qr', qr);
    });

    this.whatsappService.on('messages.upsert', async (upsert) => {
      this.broadcastToAll('messages.upsert', upsert);
      // Also trigger chats update since new messages affect chat list
      const chats = await this.whatsappService.getChats();
      this.broadcastToAll('chats.update', chats);
    });

    this.whatsappService.on('messages.update', (updates) => {
      this.broadcastToAll('messages.update', updates);
    });

    this.whatsappService.on('chats.update', async () => {
      const chats = await this.whatsappService.getChats();
      this.broadcastToAll('chats.update', chats);
    });

    this.whatsappService.on('contacts.update', () => {
      this.broadcastToAll('contacts.update', this.whatsappService.getContacts());
    });

    this.whatsappService.on('ping.result', (result) => {
      this.broadcastToAll('ping.result', result);
    });
  }

  private broadcastToAll(event: string, data: any): void {
    this.authenticatedSockets.forEach((socket) => {
      socket.emit(event, data);
    });
  }

  // Public methods for manual broadcasting
  public broadcastConnectionStatus(): void {
    this.broadcastToAll('connection.status', this.whatsappService.getConnectionStatus());
  }

  public async broadcastChatsUpdate(): Promise<void> {
    const chats = await this.whatsappService.getChats();
    this.broadcastToAll('chats.update', chats);
  }

  public broadcastContactsUpdate(): void {
    this.broadcastToAll('contacts.update', this.whatsappService.getContacts());
  }
}
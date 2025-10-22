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
      
      // Store authenticated socket
      this.authenticatedSockets.set(socket.id, socket);

      // Send current connection status
      socket.emit('connection.status', this.whatsappService.getConnectionStatus());
      
      // Send latest QR code if available and not connected
      const qr = this.whatsappService.getLatestQRCode();
      if (qr && !this.whatsappService.isConnected()) {
        console.log('📱 Sending latest QR code to new client');
        socket.emit('qr', qr);
      }

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
        this.authenticatedSockets.delete(socket.id);
      });

      // Handle client requests for data refresh
      socket.on('request.chats', () => {
        socket.emit('chats.update', this.whatsappService.getChats());
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
    });

    this.whatsappService.on('qr', (qr) => {
      this.broadcastToAll('qr', qr);
    });

    this.whatsappService.on('messages.upsert', (upsert) => {
      this.broadcastToAll('messages.upsert', upsert);
      // Also trigger chats update since new messages affect chat list
      this.broadcastToAll('chats.update', this.whatsappService.getChats());
    });

    this.whatsappService.on('messages.update', (updates) => {
      this.broadcastToAll('messages.update', updates);
    });

    this.whatsappService.on('chats.update', () => {
      this.broadcastToAll('chats.update', this.whatsappService.getChats());
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

  public broadcastChatsUpdate(): void {
    this.broadcastToAll('chats.update', this.whatsappService.getChats());
  }

  public broadcastContactsUpdate(): void {
    this.broadcastToAll('contacts.update', this.whatsappService.getContacts());
  }
}
import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/auth';
import statusRoutes from './routes/status';
import messagesRoutes from './routes/messages';
import chatsRoutes from './routes/chats';
import contactsRoutes from './routes/contacts';
import devicesRoutes from './routes/devices';
import presenceRoutes from './routes/presence';
import devRoutes from './routes/dev';

// Import services
import { WhatsAppService } from './services/whatsapp';
import { SocketService } from './services/socket';

const app = express();
const server = createServer(app);
const io = new SocketServer(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Initialize services
const whatsappService = new WhatsAppService();
const socketService = new SocketService(io, whatsappService);

// Make services available to routes
app.locals.whatsappService = whatsappService;
app.locals.socketService = socketService;

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/chats', chatsRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/devices', devicesRoutes);
app.use('/api/presence', presenceRoutes);
app.use('/api/dev', devRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Initialize WhatsApp connection
whatsappService.initialize().catch(console.error);

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 WhatsApp Web UI: http://localhost:${PORT}`);
  console.log(`🔒 Environment: ${process.env.NODE_ENV}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    whatsappService.disconnect();
    process.exit(0);
  });
});

export default app;
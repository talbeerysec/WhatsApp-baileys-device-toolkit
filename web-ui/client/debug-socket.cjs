// Simple Socket.io connection test
const io = require('socket.io-client');

console.log('🔌 Testing Socket.io connection...');

const socket = io('http://localhost:3001', {
  auth: { 
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFkbWluIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzU1NDU0MDkwLCJleHAiOjE3NTU0NjEyOTB9.NdRVYAfxNAj3pWKJF1rulPAUPIk6-1LiBHawShKcbxU'
  },
  transports: ['websocket', 'polling'] // Try both transports
});

socket.on('connect', () => {
  console.log('✅ Connected to server with ID:', socket.id);
  console.log('🔍 Waiting for QR code...');
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
});

socket.on('disconnect', (reason) => {
  console.log('🔌 Disconnected:', reason);
});

socket.on('qr', (qr) => {
  console.log('🎯 QR Code received! Length:', qr ? qr.length : 0);
  if (qr) {
    console.log('📱 QR Preview:', qr.substring(0, 50) + '...');
  }
  process.exit(0);
});

socket.on('connection.status', (status) => {
  console.log('📊 Status update:', status);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('⏰ Test timeout - no QR received');
  process.exit(1);
}, 10000);
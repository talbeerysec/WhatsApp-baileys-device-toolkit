const io = require('socket.io-client');

const socket = io('http://localhost:3001', {
  auth: { 
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFkbWluIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzU1MzczODI0LCJleHAiOjE3NTUzODEwMjR9.CYCRKRV-7CbUnyLPY1EH7Obu1PmPbgTCYac6yWfVLjg' 
  }
});

let qrReceived = false;
let timeoutCount = 0;

socket.on('connect', () => {
  console.log('✅ Connected to server, waiting for QR...');
});

socket.on('qr', (qr) => {
  console.log('🎯 QR Code received! Length:', qr ? qr.length : 0);
  if (qr) {
    console.log('QR Preview:', qr.substring(0, 80) + '...');
    qrReceived = true;
    setTimeout(() => process.exit(0), 2000);
  }
});

socket.on('connection.status', (status) => {
  console.log('📊 Status:', status.state, status.isAuthenticated ? '(authenticated)' : '(not authenticated)');
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected');
  process.exit(0);
});

// Keep alive and wait for QR
const keepAlive = setInterval(() => {
  timeoutCount++;
  if (!qrReceived && timeoutCount < 6) {
    console.log('⏳ Still waiting for QR code... (' + timeoutCount + '/6)');
  } else {
    console.log('⏰ Test completed');
    process.exit(0);
  }
}, 5000);
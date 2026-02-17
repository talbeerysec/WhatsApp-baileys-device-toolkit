import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  CircularProgress,
  Alert,
  Chip
} from '@mui/material';
import { ArrowBack as BackIcon, DeleteSweep as ClearIcon } from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { useWhatsApp } from '../contexts/WhatsAppContext';
import { useSocket } from '../contexts/SocketContext';
import { ApiService } from '../services/api';
import { MessageInfo } from '../../../shared/types/api';

const MessagesPage: React.FC = () => {
  const { jid } = useParams<{ jid: string }>();
  const navigate = useNavigate();
  const { chats, contacts } = useWhatsApp();
  const { socket } = useSocket();
  const [messages, setMessages] = useState<MessageInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const decodedJid = jid ? decodeURIComponent(jid) : '';

  // Get chat name from chats or contacts
  const chatName = chats.find(c => c.id === decodedJid)?.name
    || contacts.find(c => c.id === decodedJid)?.name
    || decodedJid.split('@')[0];

  // Fetch messages on mount
  useEffect(() => {
    if (!decodedJid) return;

    const fetchMessages = async () => {
      setLoading(true);
      try {
        const msgs = await ApiService.getMessages(decodedJid);
        setMessages(msgs);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load messages');
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();
  }, [decodedJid]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Real-time updates
  useEffect(() => {
    if (!socket || !decodedJid) return;

    const handleUpsert = (upsert: any) => {
      if (!upsert?.messages) return;
      const newMsgs = upsert.messages.filter((m: any) => {
        const msgJid = m.key?.remoteJid;
        return msgJid === decodedJid;
      });

      if (newMsgs.length > 0) {
        // Refetch to get properly serialized messages
        ApiService.getMessages(decodedJid).then(msgs => setMessages(msgs)).catch(() => {});
      }
    };

    socket.on('messages.upsert', handleUpsert);
    return () => { socket.off('messages.upsert', handleUpsert); };
  }, [socket, decodedJid]);

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (ts: number) => {
    const date = new Date(ts * 1000);
    return date.toLocaleDateString();
  };

  // Group messages by date
  const renderMessages = () => {
    let lastDate = '';

    return messages.map((msg, index) => {
      const msgDate = formatDate(msg.timestamp);
      const showDateDivider = msgDate !== lastDate;
      lastDate = msgDate;

      return (
        <React.Fragment key={msg.id || index}>
          {showDateDivider && (
            <Box display="flex" justifyContent="center" my={2}>
              <Chip label={msgDate} size="small" />
            </Box>
          )}
          <Box
            display="flex"
            justifyContent={msg.fromMe ? 'flex-end' : 'flex-start'}
            mb={0.5}
            px={2}
          >
            <Paper
              elevation={1}
              sx={{
                maxWidth: '70%',
                p: 1,
                px: 1.5,
                borderRadius: 2,
                backgroundColor: msg.fromMe ? 'primary.main' : 'grey.100',
                color: msg.fromMe ? 'primary.contrastText' : 'text.primary',
              }}
            >
              {/* Sender name for group chats */}
              {msg.participant && !msg.fromMe && (
                <Typography variant="caption" fontWeight="bold" color={msg.fromMe ? 'inherit' : 'primary.main'}>
                  {msg.participant.split('@')[0]}
                </Typography>
              )}

              {/* Image */}
              {msg.hasMedia && msg.mediaType === 'image' && (
                <Box mb={0.5}>
                  <img
                    src={ApiService.getMediaUrl(decodedJid, msg.id)}
                    alt="Media"
                    style={{ maxWidth: '100%', borderRadius: 8, display: 'block' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </Box>
              )}

              {/* Video */}
              {msg.hasMedia && msg.mediaType === 'video' && (
                <Box mb={0.5}>
                  <video
                    src={ApiService.getMediaUrl(decodedJid, msg.id)}
                    controls
                    style={{ maxWidth: '100%', borderRadius: 8, display: 'block' }}
                  />
                </Box>
              )}

              {/* Audio */}
              {msg.hasMedia && msg.mediaType === 'audio' && (
                <Box mb={0.5}>
                  <audio src={ApiService.getMediaUrl(decodedJid, msg.id)} controls style={{ width: '100%' }} />
                </Box>
              )}

              {/* Document / Sticker */}
              {msg.hasMedia && (msg.mediaType === 'document' || msg.mediaType === 'sticker') && (
                <Chip label={`${msg.mediaType}: ${msg.mimetype || 'file'}`} size="small" sx={{ mb: 0.5 }} />
              )}

              {/* Text content */}
              {(msg.text || msg.caption) && (
                <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                  {msg.text || msg.caption}
                </Typography>
              )}

              {/* No content at all */}
              {!msg.text && !msg.caption && !msg.hasMedia && (
                <Typography variant="body2" fontStyle="italic" sx={{ opacity: 0.6 }}>
                  [Unsupported message]
                </Typography>
              )}

              {/* Timestamp */}
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  textAlign: 'right',
                  mt: 0.25,
                  opacity: 0.7,
                  fontSize: '0.65rem',
                }}
              >
                {formatTimestamp(msg.timestamp)}
              </Typography>
            </Paper>
          </Box>
        </React.Fragment>
      );
    });
  };

  return (
    <Box display="flex" flexDirection="column" height="calc(100vh - 100px)">
      {/* Header */}
      <Box
        display="flex"
        alignItems="center"
        p={1.5}
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <IconButton onClick={() => navigate('/chats')} sx={{ mr: 1 }}>
          <BackIcon />
        </IconButton>
        <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
          {chatName}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
          {messages.length} messages
        </Typography>
        <IconButton
          size="small"
          title="Clear local chat history"
          onClick={async () => {
            if (!decodedJid) return;
            try {
              await ApiService.clearChat(decodedJid);
              setMessages([]);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to clear chat');
            }
          }}
        >
          <ClearIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Messages area */}
      <Box
        flexGrow={1}
        overflow="auto"
        sx={{ backgroundColor: '#f0f0f0', py: 1 }}
      >
        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" height="100%">
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>
        ) : messages.length === 0 ? (
          <Box display="flex" justifyContent="center" alignItems="center" height="100%">
            <Typography color="text.secondary">No messages yet</Typography>
          </Box>
        ) : (
          <>
            {renderMessages()}
            <div ref={messagesEndRef} />
          </>
        )}
      </Box>
    </Box>
  );
};

export default MessagesPage;

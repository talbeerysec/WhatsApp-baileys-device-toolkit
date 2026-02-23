import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  CircularProgress,
  Alert,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  Tabs,
  Tab,
  Tooltip
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  DeleteSweep as ClearIcon,
  DataObject as DataObjectIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { useWhatsApp } from '../contexts/WhatsAppContext';
import { useSocket } from '../contexts/SocketContext';
import { ApiService } from '../services/api';
import { MessageInfo } from '../../../shared/types/api';

// --- Protobuf Viewer Dialog ---
interface ProtobufViewerDialogProps {
  open: boolean;
  onClose: () => void;
  jid: string;
  messageId: string;
}

const ProtobufViewerDialog: React.FC<ProtobufViewerDialogProps> = ({ open, onClose, jid, messageId }) => {
  const [tabIndex, setTabIndex] = useState(0);
  const [storeData, setStoreData] = useState<any>(null);
  const [rawData, setRawData] = useState<any>(null);
  const [storeLoading, setStoreLoading] = useState(false);
  const [rawLoading, setRawLoading] = useState(false);
  const [storeError, setStoreError] = useState('');
  const [rawError, setRawError] = useState('');

  useEffect(() => {
    if (!open || !jid || !messageId) return;

    // Reset state
    setStoreData(null);
    setRawData(null);
    setStoreError('');
    setRawError('');
    setStoreLoading(true);
    setRawLoading(true);
    setTabIndex(0);

    // Fetch both in parallel
    ApiService.getMessageProtobuf(jid, messageId)
      .then((data) => setStoreData(data))
      .catch((err) => setStoreError(err instanceof Error ? err.message : 'Failed to load store protobuf'))
      .finally(() => setStoreLoading(false));

    ApiService.getMessageProtobufRaw(jid, messageId)
      .then((data) => setRawData(data))
      .catch((err) => setRawError(err instanceof Error ? err.message : 'Raw protobuf log not available for this message'))
      .finally(() => setRawLoading(false));
  }, [open, jid, messageId]);

  const renderContent = (data: any, isLoading: boolean, errorMsg: string) => {
    if (isLoading) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" py={6}>
          <CircularProgress />
        </Box>
      );
    }
    if (errorMsg) {
      return (
        <Box
          sx={{
            backgroundColor: '#1e1e1e',
            color: '#d4d4d4',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            p: 2,
            borderRadius: 1,
            maxHeight: '60vh',
            overflow: 'auto',
          }}
        >
          <Typography color="#f48771" fontFamily="monospace" fontSize="0.85rem">
            {errorMsg}
          </Typography>
        </Box>
      );
    }
    if (!data) {
      return (
        <Box
          sx={{
            backgroundColor: '#1e1e1e',
            color: '#d4d4d4',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            p: 2,
            borderRadius: 1,
            maxHeight: '60vh',
            overflow: 'auto',
          }}
        >
          <Typography color="#808080" fontFamily="monospace" fontSize="0.85rem" fontStyle="italic">
            No data available
          </Typography>
        </Box>
      );
    }
    return (
      <Box
        component="pre"
        sx={{
          backgroundColor: '#1e1e1e',
          color: '#d4d4d4',
          fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", "Consolas", monospace',
          fontSize: '0.8rem',
          lineHeight: 1.5,
          p: 2,
          m: 0,
          borderRadius: 1,
          maxHeight: '60vh',
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          '&::-webkit-scrollbar': {
            width: 8,
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: '#1e1e1e',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: '#555',
            borderRadius: 4,
          },
        }}
      >
        {JSON.stringify(data, null, 2)}
      </Box>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 0 }}>
        <Typography variant="h6" component="span" sx={{ fontFamily: 'monospace', fontSize: '1rem' }}>
          Protobuf: {messageId}
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        <Tabs
          value={tabIndex}
          onChange={(_, v) => setTabIndex(v)}
          sx={{ mb: 1, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Store (Clean)" />
          <Tab label="Raw (Disk)" />
        </Tabs>
        {tabIndex === 0 && renderContent(storeData, storeLoading, storeError)}
        {tabIndex === 1 && renderContent(rawData, rawLoading, rawError)}
      </DialogContent>
    </Dialog>
  );
};

// --- Messages Page ---
const MessagesPage: React.FC = () => {
  const { jid } = useParams<{ jid: string }>();
  const navigate = useNavigate();
  const { chats, contacts } = useWhatsApp();
  const { socket } = useSocket();
  const [messages, setMessages] = useState<MessageInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Protobuf viewer state
  const [protoDialogOpen, setProtoDialogOpen] = useState(false);
  const [protoMessageId, setProtoMessageId] = useState('');

  const handleOpenProto = useCallback((messageId: string) => {
    setProtoMessageId(messageId);
    setProtoDialogOpen(true);
  }, []);

  const handleCloseProto = useCallback(() => {
    setProtoDialogOpen(false);
  }, []);

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

              {/* Timestamp + Proto button */}
              <Box
                display="flex"
                alignItems="center"
                justifyContent="flex-end"
                mt={0.25}
                gap={0.5}
              >
                <Tooltip title="View Protobuf" arrow>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenProto(msg.id);
                    }}
                    sx={{
                      p: 0.25,
                      opacity: 0.4,
                      transition: 'opacity 0.15s',
                      '&:hover': { opacity: 1 },
                      color: msg.fromMe ? 'primary.contrastText' : 'text.secondary',
                    }}
                  >
                    <DataObjectIcon sx={{ fontSize: '0.85rem' }} />
                  </IconButton>
                </Tooltip>
                <Typography
                  variant="caption"
                  sx={{
                    opacity: 0.7,
                    fontSize: '0.65rem',
                  }}
                >
                  {formatTimestamp(msg.timestamp)}
                </Typography>
              </Box>
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

      {/* Protobuf Viewer Dialog */}
      <ProtobufViewerDialog
        open={protoDialogOpen}
        onClose={handleCloseProto}
        jid={decodedJid}
        messageId={protoMessageId}
      />
    </Box>
  );
};

export default MessagesPage;

import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { validateUser, validateDeviceId, validateMessage, handleValidationErrors } from '../middleware/validation';
import { WhatsAppService } from '../services/whatsapp';
import { ApiResponse } from '../../../shared/types/api';

const router = express.Router();

// Admin-only route for sending corrupted messages (testing purposes)
router.post('/corrupt-message',
  authenticateToken,
  requireAdmin,
  validateUser('user'),
  validateDeviceId('deviceId'),
  validateMessage('message'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { user, deviceId, message } = req.body;
      const whatsappService: WhatsAppService = req.app.locals.whatsappService;

      await whatsappService.sendCorruptedMessage(user, deviceId, message);

      const response: ApiResponse = {
        success: true,
        message: `Corrupted message sent to device ${deviceId} of user ${user}`
      };

      res.json(response);
    } catch (error) {
      console.error('Send corrupted message error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send corrupted message'
      } as ApiResponse);
    }
  }
);

// Get protobuf JSON from in-memory store (post-clean)
router.get('/messages/:jid/:messageId/protobuf',
  authenticateToken,
  async (req, res) => {
    try {
      const jid = decodeURIComponent(req.params.jid);
      const messageId = req.params.messageId;
      const whatsappService: WhatsAppService = req.app.locals.whatsappService;

      const result = whatsappService.getMessageProtobuf(jid, messageId);
      if (!result) {
        return res.status(404).json({
          success: false,
          error: 'Message not found in store'
        } as ApiResponse);
      }

      const response: ApiResponse = {
        success: true,
        data: { source: 'store', protobuf: result }
      };

      res.json(response);
    } catch (error) {
      console.error('Get message protobuf error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get message protobuf'
      } as ApiResponse);
    }
  }
);

// Get raw protobuf JSON from disk logs (pre-clean)
router.get('/messages/:jid/:messageId/protobuf-raw',
  authenticateToken,
  async (req, res) => {
    try {
      const jid = decodeURIComponent(req.params.jid);
      const messageId = req.params.messageId;
      const whatsappService: WhatsAppService = req.app.locals.whatsappService;

      const result = whatsappService.getRawProtobufLog(jid, messageId);
      if (!result) {
        return res.status(404).json({
          success: false,
          error: 'Raw protobuf log not found on disk'
        } as ApiResponse);
      }

      const response: ApiResponse = {
        success: true,
        data: { source: 'disk', protobuf: result }
      };

      res.json(response);
    } catch (error) {
      console.error('Get raw protobuf log error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get raw protobuf log'
      } as ApiResponse);
    }
  }
);

export default router;
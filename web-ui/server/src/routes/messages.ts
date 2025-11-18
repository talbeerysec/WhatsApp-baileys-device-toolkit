import express from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  validateJID,
  validateUser,
  validateDeviceId,
  validateMessage,
  validateReaction,
  validateMessageId,
  validateRequiredMessageId,
  handleValidationErrors
} from '../middleware/validation';
import { WhatsAppService } from '../services/whatsapp';
import { ApiResponse, MessageResponse } from '../../../shared/types/api';

const router = express.Router();

// Send message to JID
router.post('/send',
  authenticateToken,
  validateJID('jid'),
  validateMessage('message'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { jid, message } = req.body;
      const whatsappService: WhatsAppService = req.app.locals.whatsappService;

      const messageId = await whatsappService.sendMessage(jid, message);

      const response: ApiResponse<MessageResponse> = {
        success: true,
        data: {
          messageId,
          success: true
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Send message error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send message'
      } as ApiResponse);
    }
  }
);

// Send message to specific device
router.post('/device',
  authenticateToken,
  validateUser('user'),
  validateDeviceId('deviceId'),
  validateMessage('message'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { user, deviceId, message } = req.body;
      const whatsappService: WhatsAppService = req.app.locals.whatsappService;

      const messageId = await whatsappService.sendMessageToDevice(user, deviceId, message);

      const response: ApiResponse<MessageResponse> = {
        success: true,
        data: {
          messageId,
          success: true
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Send to device error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send message to device'
      } as ApiResponse);
    }
  }
);

// Send reaction
router.post('/react',
  authenticateToken,
  validateUser('user'),
  validateMessageId('messageId'),
  validateReaction('reaction'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { user, messageId, reaction } = req.body;
      const whatsappService: WhatsAppService = req.app.locals.whatsappService;

      const resultMessageId = await whatsappService.sendReaction(user, messageId, reaction);

      const response: ApiResponse<MessageResponse> = {
        success: true,
        data: {
          messageId: resultMessageId,
          success: true
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Send reaction error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send reaction'
      } as ApiResponse);
    }
  }
);

// Edit message
router.post('/edit',
  authenticateToken,
  validateUser('user'),
  validateDeviceId('deviceId'),
  validateRequiredMessageId('originalMessageId'),
  validateMessage('newText'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { user, deviceId, originalMessageId, newText, originalTimestamp, editTimestamp } = req.body;
      const whatsappService: WhatsAppService = req.app.locals.whatsappService;

      const messageId = await whatsappService.editMessage(
        user,
        deviceId,
        originalMessageId,
        newText,
        originalTimestamp,
        editTimestamp
      );

      const response: ApiResponse<MessageResponse> = {
        success: true,
        data: {
          messageId,
          success: true
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Edit message error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to edit message'
      } as ApiResponse);
    }
  }
);

// Mark messages as read
router.post('/read',
  authenticateToken,
  validateJID('jid'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { jid } = req.body;
      const whatsappService: WhatsAppService = req.app.locals.whatsappService;

      await whatsappService.readMessages(jid);

      const response: ApiResponse = {
        success: true,
        message: 'Messages marked as read'
      };

      res.json(response);
    } catch (error) {
      console.error('Read messages error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to mark messages as read'
      } as ApiResponse);
    }
  }
);

export default router;
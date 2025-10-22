import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { WhatsAppService } from '../services/whatsapp';
import { ApiResponse, ChatInfo } from '../../../shared/types/api';

const router = express.Router();

// Get all chats
router.get('/', authenticateToken, (req, res) => {
  try {
    const whatsappService: WhatsAppService = req.app.locals.whatsappService;
    const chats = whatsappService.getChats();

    const response: ApiResponse<ChatInfo[]> = {
      success: true,
      data: chats
    };

    res.json(response);
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get chats'
    } as ApiResponse);
  }
});

export default router;
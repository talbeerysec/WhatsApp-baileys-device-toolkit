import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { WhatsAppService } from '../services/whatsapp';
import { ApiResponse, ContactInfo } from '../../../shared/types/api';

const router = express.Router();

// Get all contacts
router.get('/', authenticateToken, (req, res) => {
  try {
    const whatsappService: WhatsAppService = req.app.locals.whatsappService;
    const contacts = whatsappService.getContacts();

    const response: ApiResponse<ContactInfo[]> = {
      success: true,
      data: contacts
    };

    res.json(response);
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get contacts'
    } as ApiResponse);
  }
});

export default router;
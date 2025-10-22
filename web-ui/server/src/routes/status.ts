import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { WhatsAppService } from '../services/whatsapp';
import { ApiResponse, ConnectionStatus } from '../../../shared/types/api';

const router = express.Router();

// Get connection status
router.get('/', authenticateToken, (req, res) => {
  try {
    const whatsappService: WhatsAppService = req.app.locals.whatsappService;
    const status = whatsappService.getConnectionStatus();

    const response: ApiResponse<ConnectionStatus> = {
      success: true,
      data: status
    };

    res.json(response);
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get status'
    } as ApiResponse);
  }
});

// Clear session and start fresh authentication
router.post('/clear-session', authenticateToken, async (req, res) => {
  try {
    const whatsappService: WhatsAppService = req.app.locals.whatsappService;
    await whatsappService.clearSession();

    const response: ApiResponse = {
      success: true,
      message: 'Session cleared successfully'
    };

    res.json(response);
  } catch (error) {
    console.error('Clear session error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear session'
    } as ApiResponse);
  }
});

export default router;
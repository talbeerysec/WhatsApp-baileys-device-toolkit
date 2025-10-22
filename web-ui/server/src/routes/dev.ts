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

export default router;
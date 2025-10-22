import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { validateJID, validatePresence, handleValidationErrors } from '../middleware/validation';
import { WhatsAppService } from '../services/whatsapp';
import { ApiResponse } from '../../../shared/types/api';

const router = express.Router();

// Update presence
router.post('/update',
  authenticateToken,
  validateJID('jid'),
  validatePresence('presence'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { jid, presence } = req.body;
      const whatsappService: WhatsAppService = req.app.locals.whatsappService;

      await whatsappService.updatePresence(jid, presence);

      const response: ApiResponse = {
        success: true,
        message: `Presence updated to ${presence} for ${jid}`
      };

      res.json(response);
    } catch (error) {
      console.error('Update presence error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update presence'
      } as ApiResponse);
    }
  }
);

export default router;
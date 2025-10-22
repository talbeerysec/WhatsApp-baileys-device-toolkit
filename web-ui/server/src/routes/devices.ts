import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { validateUser, validateDeviceId, handleValidationErrors } from '../middleware/validation';
import { WhatsAppService } from '../services/whatsapp';
import { ApiResponse, DeviceInfo } from '../../../shared/types/api';

const router = express.Router();

// Get devices for a user
router.get('/:user',
  authenticateToken,
  async (req, res) => {
    try {
      const { user } = req.params;
      
      // Validate user parameter
      if (!/^[0-9]+$/.test(user)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid user format (should be phone number)'
        } as ApiResponse);
      }

      const whatsappService: WhatsAppService = req.app.locals.whatsappService;
      const devices = await whatsappService.getDevices(user);

      const response: ApiResponse<DeviceInfo[]> = {
        success: true,
        data: devices
      };

      res.json(response);
    } catch (error) {
      console.error('Get devices error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get devices'
      } as ApiResponse);
    }
  }
);

// Silent ping a device
router.post('/ping',
  authenticateToken,
  validateUser('user'),
  validateDeviceId('deviceId'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { user, deviceId, type = 'reaction' } = req.body;
      const whatsappService: WhatsAppService = req.app.locals.whatsappService;

      console.log(`🌐 API: Silent ping request - User: ${user}, Device: ${deviceId}, Type: ${type}`);

      await whatsappService.silentPing(user, deviceId, type);

      console.log(`✅ API: Silent ping completed successfully`);

      const response: ApiResponse = {
        success: true,
        message: `${type}-based silent ping sent to device ${deviceId} of user ${user}`
      };

      res.json(response);
    } catch (error) {
      console.error('Silent ping error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send silent ping'
      } as ApiResponse);
    }
  }
);

export default router;
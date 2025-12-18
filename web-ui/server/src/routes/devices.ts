import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { validateUser, validateDeviceId, handleValidationErrors } from '../middleware/validation';
import { WhatsAppService } from '../services/whatsapp';
import { ApiResponse, DeviceInfo, PrekeyData, DevicePrekeyData, UserProfile } from '../../../shared/types/api';
import { inferDeviceOS } from '../../../shared/utils/prekey-inference';

const router = express.Router();

// Get user profile information
router.get('/:user/profile',
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

      let profile;
      try {
        profile = await whatsappService.getUserProfile(user);
      } catch (profileError: any) {
        console.error('Error fetching user profile:', profileError);
        // If profile fetch fails completely, return 500
        return res.status(500).json({
          success: false,
          error: profileError?.message || 'Failed to fetch user profile'
        } as ApiResponse);
      }

      if (!profile) {
        return res.status(404).json({
          success: false,
          error: 'User not found on WhatsApp'
        } as ApiResponse);
      }

      const response: ApiResponse<UserProfile> = {
        success: true,
        data: profile
      };

      console.log('✅ Sending user profile response:', JSON.stringify(response, null, 2));
      res.json(response);
    } catch (error: any) {
      console.error('Get user profile error:', error);
      res.status(500).json({
        success: false,
        error: error?.message || 'Failed to get user profile'
      } as ApiResponse);
    }
  }
);

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

// Get prekey bundles for all devices of a user
router.get('/:user/prekeys',
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

      // First, get all devices for the user
      const devices = await whatsappService.getDevices(user);

      console.log(`🔑 Fetching prekey bundles for ${devices.length} devices of user ${user}`);

      // Fetch prekey bundles for each device
      const devicePrekeyDataPromises = devices.map(async (device): Promise<DevicePrekeyData> => {
        try {
          const deviceId = device.device || 0;
          const prekeyBundle = await whatsappService.getPrekeyBundle(device.user, deviceId);

          // Infer OS from prekey bundle patterns
          let osInference = undefined;
          if (prekeyBundle) {
            osInference = inferDeviceOS(
              deviceId,
              prekeyBundle.signedPreKey.keyId,
              prekeyBundle.preKey?.keyId,
              prekeyBundle.registrationId
            );
          }

          return {
            user: device.user,
            deviceId,
            prekeyBundle: prekeyBundle || undefined,
            osInference,
            fetchedAt: new Date().toISOString()
          };
        } catch (error) {
          console.error(`Failed to fetch prekey for device ${device.device}:`, error);
          return {
            user: device.user,
            deviceId: device.device || 0,
            error: error instanceof Error ? error.message : 'Failed to fetch prekey bundle',
            fetchedAt: new Date().toISOString()
          };
        }
      });

      const devicePrekeyData = await Promise.all(devicePrekeyDataPromises);

      const prekeyData: PrekeyData = {
        phoneNumber: user,
        devices: devicePrekeyData,
        fetchedAt: new Date().toISOString()
      };

      const response: ApiResponse<PrekeyData> = {
        success: true,
        data: prekeyData
      };

      res.json(response);
    } catch (error) {
      console.error('Get prekey bundles error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get prekey bundles'
      } as ApiResponse);
    }
  }
);

// Get prekey bundle for a specific device
router.get('/:user/prekeys/:deviceId',
  authenticateToken,
  async (req, res) => {
    try {
      const { user, deviceId } = req.params;

      // Validate parameters
      if (!/^[0-9]+$/.test(user)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid user format (should be phone number)'
        } as ApiResponse);
      }

      const deviceIdNum = parseInt(deviceId, 10);
      if (isNaN(deviceIdNum)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid device ID'
        } as ApiResponse);
      }

      const whatsappService: WhatsAppService = req.app.locals.whatsappService;

      console.log(`🔑 Fetching prekey bundle for device ${deviceIdNum} of user ${user}`);

      const prekeyBundle = await whatsappService.getPrekeyBundle(user, deviceIdNum);

      // Infer OS from prekey bundle patterns
      let osInference = undefined;
      if (prekeyBundle) {
        osInference = inferDeviceOS(
          deviceIdNum,
          prekeyBundle.signedPreKey.keyId,
          prekeyBundle.preKey?.keyId,
          prekeyBundle.registrationId
        );
      }

      const devicePrekeyData: DevicePrekeyData = {
        user: user,
        deviceId: deviceIdNum,
        prekeyBundle: prekeyBundle || undefined,
        osInference,
        fetchedAt: new Date().toISOString()
      };

      const response: ApiResponse<DevicePrekeyData> = {
        success: true,
        data: devicePrekeyData
      };

      res.json(response);
    } catch (error) {
      console.error('Get prekey bundle error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get prekey bundle'
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
import express from 'express';
import path from 'path';
import fs from 'fs';
import { authenticateToken } from '../middleware/auth';
import { ApiResponse, ClientBrowserConfig, UpdateBrowserConfigRequest } from '../../../shared/types/api';

const router = express.Router();

// Available browser presets
const AVAILABLE_PRESETS = ['ubuntu', 'macOS', 'windows', 'baileys', 'appropriate'];

// Get browser configuration file path
function getConfigPath(): string {
  return path.resolve(__dirname, '../../../../baileys_auth_info', 'browser-config.json');
}

// Get current browser configuration
router.get('/browser', authenticateToken, (req, res) => {
  try {
    let platform = process.env.WHATSAPP_CLIENT_PLATFORM || '@TalBeerySec WhatsApp security research client';
    let browser = process.env.WHATSAPP_CLIENT_BROWSER || 'blabla';
    let version = process.env.WHATSAPP_CLIENT_VERSION || '1.0.0';

    // Check if config file exists (highest priority)
    const configPath = getConfigPath();
    try {
      if (fs.existsSync(configPath)) {
        const configFile = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (configFile.platform) platform = configFile.platform;
        if (configFile.browser) browser = configFile.browser;
        if (configFile.version) version = configFile.version;
      }
    } catch (error) {
      console.log('Failed to read browser config file:', error);
    }

    const response: ApiResponse<ClientBrowserConfig> = {
      success: true,
      data: {
        platform,
        browser,
        version,
        availablePresets: AVAILABLE_PRESETS
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Get browser config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get browser configuration'
    } as ApiResponse);
  }
});

// Update browser configuration
router.put('/browser', authenticateToken, async (req, res) => {
  try {
    const { platform, browser, version } = req.body as UpdateBrowserConfigRequest;

    if (!platform || !browser) {
      res.status(400).json({
        success: false,
        error: 'Platform and browser are required'
      } as ApiResponse);
      return;
    }

    const configPath = getConfigPath();
    const configDir = path.dirname(configPath);

    // Create directory if it doesn't exist
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Save configuration to file
    const config = {
      platform,
      browser,
      version: version || '1.0.0'
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const response: ApiResponse = {
      success: true,
      message: 'Browser configuration saved. Please log out and reconnect for changes to take effect.'
    };

    res.json(response);
  } catch (error) {
    console.error('Update browser config error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update browser configuration'
    } as ApiResponse);
  }
});

export default router;

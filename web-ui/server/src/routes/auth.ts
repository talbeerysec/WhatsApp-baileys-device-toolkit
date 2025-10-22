import express from 'express';
import bcrypt from 'bcrypt';
import { generateToken, authenticateToken, AuthRequest } from '../middleware/auth';
import { validatePassword, handleValidationErrors } from '../middleware/validation';
import { ApiResponse, AuthResponse } from '../../../shared/types/api';

const router = express.Router();

// Login endpoint
router.post('/login', 
  validatePassword('password'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { password } = req.body;
      const adminPassword = process.env.ADMIN_PASSWORD;

      if (!adminPassword) {
        return res.status(500).json({
          success: false,
          error: 'Server configuration error'
        } as ApiResponse);
      }

      // Simple password check for development
      // In production, use proper user management with hashed passwords
      const isValidPassword = password === adminPassword;

      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          error: 'Invalid password'
        } as ApiResponse);
      }

      const token = generateToken({
        id: 'admin',
        role: 'admin'
      });

      const response: ApiResponse<AuthResponse> = {
        success: true,
        data: {
          token,
          expiresIn: 7200 // 2 hours
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        error: 'Login failed'
      } as ApiResponse);
    }
  }
);

// Logout endpoint
router.post('/logout', authenticateToken, (req: AuthRequest, res) => {
  // Since we're using JWT, logout is handled client-side by removing the token
  res.json({
    success: true,
    message: 'Logged out successfully'
  } as ApiResponse);
});

// Verify token endpoint
router.get('/verify', authenticateToken, (req: AuthRequest, res) => {
  res.json({
    success: true,
    data: {
      user: req.user,
      valid: true
    }
  } as ApiResponse);
});

export default router;
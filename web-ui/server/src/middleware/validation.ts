import { body, param, query, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// JID validation
export const validateJID = (field: string) => 
  body(field)
    .isString()
    .matches(/^[0-9]+(@[a-z.]+)?$/)
    .withMessage('Invalid JID format');

// User validation (for device operations)
export const validateUser = (field: string) => 
  body(field)
    .isString()
    .matches(/^[0-9]+$/)
    .withMessage('Invalid user format (should be phone number)');

// Device ID validation
export const validateDeviceId = (field: string) => 
  body(field)
    .isInt({ min: 0, max: 255 })
    .withMessage('Device ID must be between 0 and 255');

// Message validation
export const validateMessage = (field: string) => 
  body(field)
    .isString()
    .isLength({ min: 1, max: 4096 })
    .withMessage('Message must be between 1 and 4096 characters');

// Presence validation
export const validatePresence = (field: string) =>
  body(field)
    .isIn(['available', 'unavailable', 'composing', 'recording', 'paused'])
    .withMessage('Invalid presence type');

// Password validation
export const validatePassword = (field: string) =>
  body(field)
    .isString()
    .isLength({ min: 1 })
    .withMessage('Password is required');

// Reaction validation
export const validateReaction = (field: string) =>
  body(field)
    .isString()
    .isLength({ min: 0, max: 10 })
    .withMessage('Reaction must be 0-10 characters');

// Message ID validation
export const validateMessageId = (field: string) =>
  body(field)
    .optional()
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('Invalid message ID format');
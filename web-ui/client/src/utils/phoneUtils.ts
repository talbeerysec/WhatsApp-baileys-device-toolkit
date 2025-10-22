// Utility functions for phone number handling

/**
 * Sanitizes phone number input by removing all non-digit characters
 * @param value - The input value to sanitize
 * @returns - String containing only digits
 */
export const sanitizePhoneNumber = (value: string): string => {
  return value.replace(/\D/g, '');
};

/**
 * Formats phone number for display (keeps only digits but may add formatting in future)
 * @param value - The phone number to format
 * @returns - Formatted phone number string
 */
export const formatPhoneNumber = (value: string): string => {
  const digits = sanitizePhoneNumber(value);
  return digits;
};

/**
 * Sanitizes JID input - if it contains @, leave as is; otherwise sanitize as phone number
 * @param value - The JID or phone number input to sanitize
 * @returns - Sanitized string
 */
export const sanitizeJidInput = (value: string): string => {
  // If input contains @ symbol, it's a full JID, don't sanitize
  if (value.includes('@')) {
    return value;
  }
  // Otherwise, treat as phone number and sanitize
  return sanitizePhoneNumber(value);
};

/**
 * Validates if a phone number has minimum required digits
 * @param value - The phone number to validate
 * @returns - Boolean indicating if phone number is valid
 */
export const isValidPhoneNumber = (value: string): boolean => {
  const digits = sanitizePhoneNumber(value);
  return digits.length >= 10; // Minimum 10 digits for most phone numbers
};
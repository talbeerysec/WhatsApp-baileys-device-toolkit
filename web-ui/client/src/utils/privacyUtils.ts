/**
 * Utility functions for masking personally identifiable information
 * when privacy mode is enabled.
 */

/** Replace all digits in a phone number string with '*' */
export const maskPhoneNumber = (phone: string): string => {
  return phone.replace(/\d/g, '*');
};

/** Mask the number part before '@' in a JID, preserving the domain */
export const maskJid = (jid: string): string => {
  const atIndex = jid.indexOf('@');
  if (atIndex === -1) {
    return maskPhoneNumber(jid);
  }
  const numberPart = jid.substring(0, atIndex);
  const domainPart = jid.substring(atIndex);
  return maskPhoneNumber(numberPart) + domainPart;
};

/** Mask a name only if it looks like a phone number (all digits or starts with '+') */
export const maskName = (name: string | undefined | null): string | undefined | null => {
  if (name == null) {
    return name;
  }
  const trimmed = name.trim();
  const looksLikePhone = /^\+?\d+$/.test(trimmed);
  if (looksLikePhone) {
    return maskPhoneNumber(trimmed);
  }
  return name;
};

/**
 * Return a masked display string for a chat.
 * Masks ALL names (replaces each character with '*') and phone numbers for full privacy in demos.
 */
export const maskChatDisplay = (name: string | undefined | null, id: string): string => {
  if (name != null && name.trim().length > 0) {
    const trimmed = name.trim();
    const looksLikePhone = /^\+?\d+$/.test(trimmed);
    if (looksLikePhone) {
      return maskPhoneNumber(trimmed);
    }
    // Mask non-phone names: replace all word characters with '*', preserve spaces/punctuation
    return trimmed.replace(/\w/g, '*');
  }
  return maskJid(id);
};

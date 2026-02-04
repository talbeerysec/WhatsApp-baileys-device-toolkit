// Utility functions for inferring device OS from prekey bundle patterns

export type DeviceOS = 'android' | 'apple' | 'windows' | 'web' | 'web-or-windows' | 'baileys' | 'unknown';
export type DeviceFormFactor = 'mobile' | 'desktop';

export interface OSInference {
  os: DeviceOS;
  formFactor: DeviceFormFactor;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

/**
 * Parses a hex-formatted ID string to a numeric value
 * @param hexId Hex string with or without 0x prefix (e.g., "0x000abc" or "000abc")
 * @returns Numeric value
 */
export function parseHexId(hexId: string | undefined): number {
  if (!hexId) return 0;
  const cleanHex = hexId.replace(/^0x/, '');
  return parseInt(cleanHex, 16);
}

/**
 * Infers device OS and form factor from prekey bundle ID patterns
 *
 * Unified Detection Algorithm:
 *
 * 1. Android (Both Mobile & Desktop):
 *    - Pattern: Low Signed Pre-Key ID (< 0xFFFF) AND High One-Time Pre-Key ID (> 0xFFFF) [HIGH confidence]
 *    - Pattern: High Signed Pre-Key ID (> 0xFFFF) AND High One-Time Pre-Key ID (> 0xFFFF) [MEDIUM confidence]
 *    - Pattern (Desktop only): High Registration ID (> 0xFFFF) AND High Signed + One-Time Pre-Key IDs [MEDIUM confidence]
 *    - Form Factor: deviceId == 0 → Mobile, deviceId > 0 → Desktop
 *
 * 2. Apple (iOS Mobile & Mac Desktop):
 *    - Pattern: High Signed Pre-Key ID (> 0xFFFF) AND Low One-Time Pre-Key ID (< 0xFFFF) [HIGH confidence]
 *    - Form Factor: deviceId == 0 → Mobile (iOS), deviceId > 0 → Desktop (Mac)
 *
 * 3. Windows Desktop (Secondary devices only, deviceId > 0):
 *    - Pattern: Low Signed Pre-Key ID (< 0xFFFF) AND Low One-Time Pre-Key ID (< 0xFFFF) AND High Registration ID (> 0x3FFF)
 *
 * 4. Web or Windows (Secondary devices only, deviceId > 0):
 *    - Pattern: Low Signed Pre-Key ID (< 0xFFFF) AND Low One-Time Pre-Key ID (< 0xFFFF) AND Low Registration ID (<= 0x3FFF)
 *    - Ambiguous: Could be Web (masked) or Windows (low random Registration ID)
 *
 * Key Insights:
 * - Android: Signed Pre-Key ID starts at 0x000000, increments monthly
 * - Apple: Signed Pre-Key ID is random (high value), One-Time Pre-Key ID starts at 0x000001
 * - Windows: Registration ID not masked (> 0x3FFF)
 * - Web: Registration ID masked with 0x3FFF
 * - Android variants: Both high IDs (> 0xFFFF) indicate Android on companion devices
 *
 * @param deviceId Device identifier (0 for primary/mobile, 1+ for secondary/companion/desktop)
 * @param signedPreKeyId Signed Pre-Key ID (hex format)
 * @param oneTimePreKeyId One-Time Pre-Key ID (hex format, optional if pool depleted)
 * @param registrationId Registration ID (hex format, required for secondary device disambiguation)
 * @returns OS inference result with OS, form factor, confidence and reasoning
 */
export function inferDeviceOS(
  deviceId: number,
  signedPreKeyId: string | undefined,
  oneTimePreKeyId: string | undefined,
  registrationId?: string | undefined
): OSInference {

  // Parse hex IDs to numeric values
  const signedPKNum = parseHexId(signedPreKeyId);
  const oneTimePKNum = parseHexId(oneTimePreKeyId);
  const registrationIdNum = parseHexId(registrationId);

  // Threshold for distinguishing low vs high ID values (0xFFFF = 65535)
  const THRESHOLD = 0xFFFF;
  const REG_ID_MASK = 0x3FFF;

  // Determine form factor based on device ID
  const formFactor: DeviceFormFactor = deviceId === 0 ? 'mobile' : 'desktop';
  const deviceType = formFactor === 'mobile' ? 'Mobile' : 'Desktop';

  // Check if we have valid IDs
  if (!signedPreKeyId) {
    return {
      os: 'unknown',
      formFactor,
      confidence: 'low',
      reasoning: 'Missing Signed Pre-Key ID'
    };
  }

  // === UNIFIED ANDROID & APPLE DETECTION (works for both mobile and desktop) ===

  // If one-time pre-key is missing (pool depleted), use only signed pre-key
  if (!oneTimePreKeyId) {
    if (signedPKNum < THRESHOLD) {
      // For desktop with low signed PK, check Windows/Web FIRST (before Android)
      // Low Signed PK (especially = 1) on desktop typically means Windows or Web, not Android
      if (formFactor === 'desktop') {
        if (!registrationId) {
          return {
            os: 'unknown',
            formFactor,
            confidence: 'low',
            reasoning: 'Signed Pre-Key ID suggests Windows Desktop or Web, but Registration ID unavailable for disambiguation.'
          };
        }

        if (registrationIdNum > REG_ID_MASK) {
          return {
            os: 'windows',
            formFactor,
            confidence: 'high',
            reasoning: `Signed Pre-Key ID (${signedPKNum}) < ${THRESHOLD} AND Registration ID (${registrationIdNum}) > ${REG_ID_MASK} suggests Windows Desktop. One-Time Pre-Key unavailable (pool depleted).`
          };
        } else {
          // Registration ID ≤ 0x3FFF could be either:
          // 1. Web (masked with 0x3FFF)
          // 2. Windows with a low random Registration ID
          // Return web-or-windows to show both possibilities
          // High confidence it's one of these two, just can't determine which
          return {
            os: 'web-or-windows',
            formFactor,
            confidence: 'high',
            reasoning: `Signed Pre-Key ID (${signedPKNum}) < ${THRESHOLD} AND Registration ID (${registrationIdNum}) <= ${REG_ID_MASK} - Definitively Web or Windows Desktop (cannot distinguish: Web masks Registration ID, Windows may have low random value). One-Time Pre-Key unavailable (pool depleted).`
          };
        }
      }

      // For mobile with low signed PK, likely Android (unless Registration ID suggests otherwise)
      // But check if Registration ID is also present and low - might still be Android mobile
      if (formFactor === 'mobile' || !registrationId) {
        return {
          os: 'android',
          formFactor,
          confidence: 'medium',
          reasoning: `Signed Pre-Key ID (${signedPKNum}) < ${THRESHOLD} suggests Android ${deviceType}. One-Time Pre-Key unavailable (pool depleted).`
        };
      }

      // For desktop with low signed PK AND high registration ID, could still be Android Desktop variant
      if (registrationIdNum > THRESHOLD) {
        return {
          os: 'android',
          formFactor,
          confidence: 'low',
          reasoning: `Signed Pre-Key ID (${signedPKNum}) < ${THRESHOLD} AND Registration ID (${registrationIdNum}) > ${THRESHOLD} suggests possible Android Desktop variant. One-Time Pre-Key unavailable (pool depleted).`
        };
      }

      // Otherwise fall back to unknown for desktop with conflicting signals
      return {
        os: 'unknown',
        formFactor,
        confidence: 'low',
        reasoning: `Ambiguous pattern: Low Signed Pre-Key (${signedPKNum}) with low Registration ID (${registrationIdNum}) on desktop. One-Time Pre-Key unavailable.`
      };
    } else if (signedPKNum > THRESHOLD) {
      // For desktop with high signed PK, check if Registration ID is also high (Android Desktop variant)
      if (formFactor === 'desktop' && registrationId && registrationIdNum > THRESHOLD) {
        return {
          os: 'android',
          formFactor,
          confidence: 'medium',
          reasoning: `Signed Pre-Key ID (${signedPKNum}) > ${THRESHOLD} AND Registration ID (${registrationIdNum}) > ${THRESHOLD} suggests Android Desktop. One-Time Pre-Key unavailable (pool depleted).`
        };
      }

      return {
        os: 'apple',
        formFactor,
        confidence: 'medium',
        reasoning: `Signed Pre-Key ID (${signedPKNum}) > ${THRESHOLD} suggests Apple ${deviceType}. One-Time Pre-Key unavailable (pool depleted).`
      };
    } else {
      return {
        os: 'unknown',
        formFactor,
        confidence: 'low',
        reasoning: 'Ambiguous Signed Pre-Key ID value. One-Time Pre-Key unavailable.'
      };
    }
  }

  // === PATTERN DETECTION WITH BOTH SIGNED AND ONE-TIME PRE-KEYS ===

  // Android: Low Signed PK + High One-Time PK (HIGH confidence for both mobile & desktop)
  if (signedPKNum < THRESHOLD && oneTimePKNum > THRESHOLD) {
    return {
      os: 'android',
      formFactor,
      confidence: 'high',
      reasoning: `Signed Pre-Key ID (${signedPKNum}) < ${THRESHOLD} AND One-Time Pre-Key ID (${oneTimePKNum}) > ${THRESHOLD}`
    };
  }

  // Apple: High Signed PK + Low One-Time PK (HIGH confidence for both mobile & desktop)
  if (signedPKNum > THRESHOLD && oneTimePKNum < THRESHOLD) {
    return {
      os: 'apple',
      formFactor,
      confidence: 'high',
      reasoning: `Signed Pre-Key ID (${signedPKNum}) > ${THRESHOLD} AND One-Time Pre-Key ID (${oneTimePKNum}) < ${THRESHOLD}`
    };
  }

  // Android variant: Both IDs high (MEDIUM confidence)
  // For desktop, also check if Registration ID is high for extra confirmation
  if (signedPKNum > THRESHOLD && oneTimePKNum > THRESHOLD) {
    const isDesktopWithHighRegId = formFactor === 'desktop' && registrationId && registrationIdNum > THRESHOLD;
    const confidence = isDesktopWithHighRegId ? 'medium' : 'medium';
    const regIdNote = isDesktopWithHighRegId ? ` AND Registration ID (${registrationIdNum}) > ${THRESHOLD}` : '';

    return {
      os: 'android',
      formFactor,
      confidence,
      reasoning: `Signed Pre-Key ID (${signedPKNum}) > ${THRESHOLD} AND One-Time Pre-Key ID (${oneTimePKNum}) > ${THRESHOLD}${regIdNote} - Android ${deviceType} variant (field observations)`
    };
  }

  // === DESKTOP-ONLY: WINDOWS & WEB DETECTION ===

  if (formFactor === 'desktop' && signedPKNum < THRESHOLD && oneTimePKNum < THRESHOLD) {
    if (!registrationId) {
      return {
        os: 'windows',
        formFactor,
        confidence: 'medium',
        reasoning: `Signed Pre-Key ID (${signedPKNum}) < ${THRESHOLD} AND One-Time Pre-Key ID (${oneTimePKNum}) < ${THRESHOLD}, suggests Windows Desktop or Web. Registration ID unavailable for disambiguation.`
      };
    }

    if (registrationIdNum > REG_ID_MASK) {
      return {
        os: 'windows',
        formFactor,
        confidence: 'high',
        reasoning: `Signed Pre-Key ID (${signedPKNum}) < ${THRESHOLD} AND One-Time Pre-Key ID (${oneTimePKNum}) < ${THRESHOLD} AND Registration ID (${registrationIdNum}) > ${REG_ID_MASK}`
      };
    } else {
      // Registration ID ≤ 0x3FFF could be either:
      // 1. Web (masked with 0x3FFF)
      // 2. Windows with a low random Registration ID
      // Return web-or-windows to show both possibilities
      // High confidence it's one of these two, just can't determine which
      return {
        os: 'web-or-windows',
        formFactor,
        confidence: 'high',
        reasoning: `Signed Pre-Key ID (${signedPKNum}) < ${THRESHOLD} AND One-Time Pre-Key ID (${oneTimePKNum}) < ${THRESHOLD} AND Registration ID (${registrationIdNum}) <= ${REG_ID_MASK} - Definitively Web or Windows Desktop (cannot distinguish: Web masks Registration ID, Windows may have low random value)`
      };
    }
  }

  // Fallback for unrecognized patterns
  return {
    os: 'unknown',
    formFactor,
    confidence: 'low',
    reasoning: `Pattern does not match known signatures (Signed: ${signedPKNum}, One-Time: ${oneTimePKNum}, Registration: ${registrationIdNum})`
  };
}

/**
 * Calculates approximate device age in months from Signed Pre-Key ID
 *
 * For Android, Windows Desktop, and Web devices with low Signed Pre-Key IDs,
 * the ID roughly corresponds to the device's age in months (starts at 0x000000
 * and increments monthly).
 *
 * For Apple devices (iOS/Mac), the Signed Pre-Key ID is random and does not indicate age.
 * For Android variants with high Signed Pre-Key IDs (> 0xFFFF), age cannot be determined.
 *
 * @param os Inferred OS type
 * @param signedPreKeyId Signed Pre-Key ID (hex format)
 * @returns Device age in months, or null if not applicable
 */
export function calculateDeviceAge(os: DeviceOS, signedPreKeyId: string | undefined): number | null {
  // Only applicable for devices with sequential Signed Pre-Key IDs
  if (os === 'apple' || os === 'unknown') {
    return null;
  }

  const signedPKNum = parseHexId(signedPreKeyId);
  const THRESHOLD = 0xFFFF;

  // Android devices with high Signed Pre-Key IDs don't follow sequential pattern
  if (os === 'android' && signedPKNum > THRESHOLD) {
    return null;
  }

  // Signed Pre-Key ID roughly corresponds to age in months for sequential devices
  return signedPKNum;
}

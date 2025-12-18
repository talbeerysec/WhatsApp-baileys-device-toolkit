// Utility functions for inferring device OS from prekey bundle patterns

export type InferredOS = 'android' | 'ios' | 'mac-desktop' | 'windows-desktop' | 'web' | 'unknown';

export interface OSInference {
  os: InferredOS;
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
 * Infers device OS from prekey bundle ID patterns
 *
 * Algorithm for primary devices (deviceId == 0):
 * - Android: Signed Pre-Key ID < 0xFFFF AND One-Time Pre-Key ID > 0xFFFF (high confidence)
 * - Android: Signed Pre-Key ID > 0xFFFF AND One-Time Pre-Key ID > 0xFFFF (medium confidence, field observations - mobile only)
 * - iOS: Signed Pre-Key ID > 0xFFFF AND One-Time Pre-Key ID < 0xFFFF
 *
 * Algorithm for secondary devices (deviceId > 0):
 * - Mac Desktop: Signed Pre-Key ID > 0xFFFF AND One-Time Pre-Key ID < 0xFFFF
 * - Windows Desktop: Signed Pre-Key ID < 0xFFFF AND One-Time Pre-Key ID < 0xFFFF AND Registration ID > 0x3FFF
 * - Web: Signed Pre-Key ID < 0xFFFF AND One-Time Pre-Key ID < 0xFFFF AND Registration ID <= 0x3FFF
 *
 * Based on research showing:
 * - Android: Signed Pre-Key ID starts at 0x000000, increments monthly
 * - iOS: Signed Pre-Key ID is random (high value), One-Time Pre-Key ID starts at 0x000001
 * - Mac Desktop: Similar pattern to iOS
 * - Windows Desktop: Registration ID not masked (> 0x3FFF)
 * - Web: Registration ID masked with 0x3FFF
 * - Field observations: Both high IDs (> 0xFFFF) indicate Android variants on mobile devices only
 *
 * @param deviceId Device identifier (0 for primary, 1+ for companions)
 * @param signedPreKeyId Signed Pre-Key ID (hex format)
 * @param oneTimePreKeyId One-Time Pre-Key ID (hex format, optional if pool depleted)
 * @param registrationId Registration ID (hex format, required for secondary device disambiguation)
 * @returns OS inference result with confidence and reasoning
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

  // Check if we have valid IDs
  if (!signedPreKeyId) {
    return {
      os: 'unknown',
      confidence: 'low',
      reasoning: 'Missing Signed Pre-Key ID'
    };
  }

  // === PRIMARY DEVICE (deviceId == 0) ===
  if (deviceId === 0) {
    // If one-time pre-key is missing (pool depleted), use only signed pre-key
    if (!oneTimePreKeyId) {
      if (signedPKNum < THRESHOLD) {
        return {
          os: 'android',
          confidence: 'medium',
          reasoning: `Signed Pre-Key ID (${signedPKNum}) < ${THRESHOLD} suggests Android. One-Time Pre-Key unavailable (pool depleted).`
        };
      } else if (signedPKNum > THRESHOLD) {
        return {
          os: 'ios',
          confidence: 'medium',
          reasoning: `Signed Pre-Key ID (${signedPKNum}) > ${THRESHOLD} suggests iOS. One-Time Pre-Key unavailable (pool depleted).`
        };
      } else {
        return {
          os: 'unknown',
          confidence: 'low',
          reasoning: 'Ambiguous Signed Pre-Key ID value. One-Time Pre-Key unavailable.'
        };
      }
    }

    // Apply inference algorithm with both IDs available
    if (signedPKNum < THRESHOLD && oneTimePKNum > THRESHOLD) {
      return {
        os: 'android',
        confidence: 'high',
        reasoning: `Signed Pre-Key ID (${signedPKNum}) < ${THRESHOLD} AND One-Time Pre-Key ID (${oneTimePKNum}) > ${THRESHOLD}`
      };
    } else if (signedPKNum > THRESHOLD && oneTimePKNum < THRESHOLD) {
      return {
        os: 'ios',
        confidence: 'high',
        reasoning: `Signed Pre-Key ID (${signedPKNum}) > ${THRESHOLD} AND One-Time Pre-Key ID (${oneTimePKNum}) < ${THRESHOLD}`
      };
    } else if (signedPKNum > THRESHOLD && oneTimePKNum > THRESHOLD) {
      // Both IDs are high - field observations suggest Android
      return {
        os: 'android',
        confidence: 'medium',
        reasoning: `Signed Pre-Key ID (${signedPKNum}) > ${THRESHOLD} AND One-Time Pre-Key ID (${oneTimePKNum}) > ${THRESHOLD} - Android (field observations)`
      };
    } else {
      return {
        os: 'unknown',
        confidence: 'low',
        reasoning: `Pattern does not match known Android or iOS signatures (Signed: ${signedPKNum}, One-Time: ${oneTimePKNum})`
      };
    }
  }

  // === SECONDARY DEVICE (deviceId > 0) ===

  // If one-time pre-key is missing (pool depleted)
  if (!oneTimePreKeyId) {
    if (signedPKNum > THRESHOLD) {
      return {
        os: 'mac-desktop',
        confidence: 'medium',
        reasoning: `Signed Pre-Key ID (${signedPKNum}) > ${THRESHOLD} suggests Mac Desktop. One-Time Pre-Key unavailable (pool depleted).`
      };
    } else if (signedPKNum < THRESHOLD) {
      // Cannot distinguish between Windows and Web without registration ID
      if (!registrationId) {
        return {
          os: 'unknown',
          confidence: 'low',
          reasoning: 'Signed Pre-Key ID suggests Windows Desktop or Web, but Registration ID unavailable for disambiguation.'
        };
      }

      if (registrationIdNum > REG_ID_MASK) {
        return {
          os: 'windows-desktop',
          confidence: 'medium',
          reasoning: `Signed Pre-Key ID (${signedPKNum}) < ${THRESHOLD} AND Registration ID (${registrationIdNum}) > ${REG_ID_MASK} suggests Windows Desktop. One-Time Pre-Key unavailable (pool depleted).`
        };
      } else {
        return {
          os: 'web',
          confidence: 'medium',
          reasoning: `Signed Pre-Key ID (${signedPKNum}) < ${THRESHOLD} AND Registration ID (${registrationIdNum}) <= ${REG_ID_MASK} suggests Web. One-Time Pre-Key unavailable (pool depleted).`
        };
      }
    }
  }

  // Mac Desktop: High Signed PK + Low One-Time PK
  if (signedPKNum > THRESHOLD && oneTimePKNum < THRESHOLD) {
    return {
      os: 'mac-desktop',
      confidence: 'high',
      reasoning: `Signed Pre-Key ID (${signedPKNum}) > ${THRESHOLD} AND One-Time Pre-Key ID (${oneTimePKNum}) < ${THRESHOLD}`
    };
  }

  // Low Signed PK + Low One-Time PK: Need to check Registration ID
  if (signedPKNum < THRESHOLD && oneTimePKNum < THRESHOLD) {
    if (!registrationId) {
      return {
        os: 'unknown',
        confidence: 'low',
        reasoning: `Signed Pre-Key ID (${signedPKNum}) < ${THRESHOLD} AND One-Time Pre-Key ID (${oneTimePKNum}) < ${THRESHOLD}, but Registration ID unavailable for Windows/Web disambiguation.`
      };
    }

    if (registrationIdNum > REG_ID_MASK) {
      return {
        os: 'windows-desktop',
        confidence: 'high',
        reasoning: `Signed Pre-Key ID (${signedPKNum}) < ${THRESHOLD} AND One-Time Pre-Key ID (${oneTimePKNum}) < ${THRESHOLD} AND Registration ID (${registrationIdNum}) > ${REG_ID_MASK}`
      };
    } else {
      return {
        os: 'web',
        confidence: 'high',
        reasoning: `Signed Pre-Key ID (${signedPKNum}) < ${THRESHOLD} AND One-Time Pre-Key ID (${oneTimePKNum}) < ${THRESHOLD} AND Registration ID (${registrationIdNum}) <= ${REG_ID_MASK}`
      };
    }
  }

  // Fallback for secondary devices with unexpected patterns
  return {
    os: 'unknown',
    confidence: 'low',
    reasoning: `Pattern does not match known signatures for secondary devices (Signed: ${signedPKNum}, One-Time: ${oneTimePKNum}, Registration: ${registrationIdNum})`
  };
}

/**
 * Calculates approximate device age in months from Signed Pre-Key ID
 *
 * For Android, Windows Desktop, and Web devices with low Signed Pre-Key IDs,
 * the ID roughly corresponds to the device's age in months (starts at 0x000000
 * and increments monthly).
 *
 * For iOS and Mac Desktop, the Signed Pre-Key ID is random and does not indicate age.
 * For Android variants with high Signed Pre-Key IDs (> 0xFFFF), age cannot be determined.
 *
 * @param os Inferred OS type
 * @param signedPreKeyId Signed Pre-Key ID (hex format)
 * @returns Device age in months, or null if not applicable
 */
export function calculateDeviceAge(os: InferredOS, signedPreKeyId: string | undefined): number | null {
  // Only applicable for devices with sequential Signed Pre-Key IDs
  if (os === 'ios' || os === 'mac-desktop' || os === 'unknown') {
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

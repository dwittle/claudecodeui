import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const SALT = 'cloudcli-credential-encryption-v1';

/**
 * Encryption service for securing user credentials at rest
 * Uses AES-256-GCM with per-user key derivation for maximum security
 */
class EncryptionService {
  constructor() {
    this.masterKey = null;
  }

  /**
   * Get or derive the master encryption key from environment variable
   * @returns {Buffer} 32-byte master key
   * @throws {Error} if ENCRYPTION_MASTER_KEY is not set
   */
  getMasterKey() {
    if (this.masterKey) {
      return this.masterKey;
    }

    const key = process.env.ENCRYPTION_MASTER_KEY;
    if (!key) {
      throw new Error(
        'ENCRYPTION_MASTER_KEY environment variable must be set. ' +
        'Generate one with: openssl rand -hex 32'
      );
    }

    // Derive a consistent 32-byte key from the environment variable
    this.masterKey = crypto.scryptSync(key, SALT, KEY_LENGTH);
    return this.masterKey;
  }

  /**
   * Derive a user-specific encryption key
   * Combines master key with user ID to ensure each user's credentials
   * are encrypted with a unique key
   *
   * @param {number} userId - The user's ID
   * @returns {Buffer} 32-byte user-specific encryption key
   */
  deriveUserKey(userId) {
    const userSalt = crypto.createHash('sha256')
      .update(`${userId}`)
      .digest();

    const masterKey = this.getMasterKey();
    return crypto.hkdfSync('sha256', masterKey, userSalt, 'credential-key', KEY_LENGTH);
  }

  /**
   * Encrypt a credential value with AES-256-GCM
   *
   * @param {string} plaintext - The credential value to encrypt
   * @param {number} userId - The user ID (for key derivation)
   * @returns {Object} Object containing { encrypted, iv, authTag }
   */
  encrypt(plaintext, userId) {
    const key = this.deriveUserKey(userId);
    const iv = crypto.randomBytes(16); // 128-bit IV for GCM
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get authentication tag for integrity verification
    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  /**
   * Decrypt a credential value
   *
   * @param {string} encrypted - The encrypted credential (hex)
   * @param {string} iv - The initialization vector (hex)
   * @param {string} authTag - The authentication tag (hex)
   * @param {number} userId - The user ID (for key derivation)
   * @returns {string} The decrypted plaintext credential
   * @throws {Error} if decryption fails (wrong key, tampered data, etc.)
   */
  decrypt(encrypted, iv, authTag, userId) {
    const key = this.deriveUserKey(userId);
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Re-encrypt a credential with a new key (for key rotation)
   *
   * @param {string} encrypted - Current encrypted value
   * @param {string} iv - Current IV
   * @param {string} authTag - Current auth tag
   * @param {number} userId - User ID
   * @returns {Object} New encryption data { encrypted, iv, authTag }
   */
  rotateEncryption(encrypted, iv, authTag, userId) {
    // Decrypt with old key
    const plaintext = this.decrypt(encrypted, iv, authTag, userId);
    // Re-encrypt with current key
    return this.encrypt(plaintext, userId);
  }

  /**
   * Verify that the encryption service is properly configured
   * @returns {boolean} true if configured correctly
   */
  isConfigured() {
    try {
      this.getMasterKey();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Test encryption/decryption with a sample value
   * Useful for verifying configuration
   *
   * @param {number} userId - User ID to test with
   * @returns {boolean} true if encryption roundtrip succeeds
   */
  testEncryption(userId = 1) {
    const testValue = 'test-credential-value';
    const { encrypted, iv, authTag } = this.encrypt(testValue, userId);
    const decrypted = this.decrypt(encrypted, iv, authTag, userId);
    return decrypted === testValue;
  }
}

// Export singleton instance
export const encryptionService = new EncryptionService();

// Export class for testing
export { EncryptionService };

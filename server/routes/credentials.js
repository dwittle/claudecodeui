import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { credentialDbEnhanced } from '../database/db.js';
import { encryptionService } from '../services/encryption.js';
import { containerManager } from '../container/manager.js';

const router = express.Router();

/**
 * GET /api/credentials
 * List all credentials for the authenticated user (names only, no values)
 */
router.get('/', authenticateToken, (req, res) => {
  try {
    const credentials = credentialDbEnhanced.listCredentials(req.user.id);

    res.json({
      success: true,
      credentials: credentials.map(c => ({
        id: c.id,
        name: c.credential_name,
        type: c.credential_type,
        description: c.description,
        created_at: c.created_at,
        updated_at: c.updated_at
      }))
    });
  } catch (error) {
    console.error('[CredentialsAPI] Failed to list credentials:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve credentials'
    });
  }
});

/**
 * POST /api/credentials
 * Create or update a credential
 * Body: { name, type, value, description }
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, type, value, description } = req.body;

    // Validation
    if (!name || !type || !value) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, type, and value are required'
      });
    }

    // Validate type
    const validTypes = ['api_key', 'password', 'env_var', 'ssh_key', 'certificate', 'token'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid credential type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    // Validate name format (env var compatible)
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(name)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid credential name. Must start with a letter or underscore and contain only letters, numbers, and underscores.'
      });
    }

    // Encrypt the credential
    const { encrypted, iv, authTag } = encryptionService.encrypt(value, req.user.id);

    // Store in database
    const credential = credentialDbEnhanced.upsertCredential({
      userId: req.user.id,
      name,
      type,
      encryptedValue: encrypted,
      iv,
      authTag,
      description: description || null
    });

    // Log the action
    credentialDbEnhanced.logCredentialAccess(
      req.user.id,
      credential.id,
      'created',
      req.ip
    );

    // Restart container to inject new credentials (non-blocking)
    setImmediate(async () => {
      try {
        await containerManager.restartUserContainer(req.user.id);
        console.log(`[CredentialsAPI] Container restarted for user ${req.user.id} after credential update`);
      } catch (error) {
        console.error('[CredentialsAPI] Failed to restart container:', error);
      }
    });

    res.json({
      success: true,
      message: 'Credential saved successfully. Your container will restart to apply changes.',
      credential: {
        id: credential.id,
        name,
        type,
        description
      }
    });
  } catch (error) {
    console.error('[CredentialsAPI] Failed to create credential:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save credential',
      details: error.message
    });
  }
});

/**
 * GET /api/credentials/:id
 * Get credential metadata (no value)
 */
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const credential = credentialDbEnhanced.getCredential(req.params.id);

    if (!credential) {
      return res.status(404).json({
        success: false,
        error: 'Credential not found'
      });
    }

    // Verify ownership
    if (credential.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    res.json({
      success: true,
      credential: {
        id: credential.id,
        name: credential.credential_name,
        type: credential.credential_type,
        description: credential.description,
        created_at: credential.created_at,
        updated_at: credential.updated_at
      }
    });
  } catch (error) {
    console.error('[CredentialsAPI] Failed to get credential:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve credential'
    });
  }
});

/**
 * DELETE /api/credentials/:id
 * Delete a credential
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const credential = credentialDbEnhanced.getCredential(req.params.id);

    if (!credential) {
      return res.status(404).json({
        success: false,
        error: 'Credential not found'
      });
    }

    // Verify ownership
    if (credential.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Soft delete
    credentialDbEnhanced.deleteCredential(req.params.id);

    // Log the action
    credentialDbEnhanced.logCredentialAccess(
      req.user.id,
      req.params.id,
      'deleted',
      req.ip
    );

    // Restart container to remove credential (non-blocking)
    setImmediate(async () => {
      try {
        await containerManager.restartUserContainer(req.user.id);
        console.log(`[CredentialsAPI] Container restarted for user ${req.user.id} after credential deletion`);
      } catch (error) {
        console.error('[CredentialsAPI] Failed to restart container:', error);
      }
    });

    res.json({
      success: true,
      message: 'Credential deleted successfully. Your container will restart to apply changes.'
    });
  } catch (error) {
    console.error('[CredentialsAPI] Failed to delete credential:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete credential'
    });
  }
});

/**
 * GET /api/credentials/audit/logs
 * Get audit logs for user's credential operations
 */
router.get('/audit/logs', authenticateToken, (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const logs = credentialDbEnhanced.getAuditLogs(req.user.id, limit);

    res.json({
      success: true,
      logs
    });
  } catch (error) {
    console.error('[CredentialsAPI] Failed to get audit logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve audit logs'
    });
  }
});

export default router;

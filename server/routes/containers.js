import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { containerDb } from '../database/db.js';
import { containerManager } from '../container/manager.js';

const router = express.Router();

/**
 * GET /api/containers/status
 * Get current user's container status
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const status = await containerManager.getContainerStatus(req.user.id);
    res.json({
      success: true,
      status
    });
  } catch (error) {
    console.error('[ContainersAPI] Failed to get status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve container status',
      details: error.message
    });
  }
});

/**
 * POST /api/containers/start
 * Manually start user's container
 */
router.post('/start', authenticateToken, async (req, res) => {
  try {
    await containerManager.startUserContainer(req.user.id);

    res.json({
      success: true,
      message: 'Container started successfully'
    });
  } catch (error) {
    console.error('[ContainersAPI] Failed to start container:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start container',
      details: error.message
    });
  }
});

/**
 * POST /api/containers/stop
 * Stop user's container
 */
router.post('/stop', authenticateToken, async (req, res) => {
  try {
    await containerManager.stopUserContainer(req.user.id);

    res.json({
      success: true,
      message: 'Container stopped successfully'
    });
  } catch (error) {
    console.error('[ContainersAPI] Failed to stop container:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop container',
      details: error.message
    });
  }
});

/**
 * POST /api/containers/restart
 * Restart user's container
 */
router.post('/restart', authenticateToken, async (req, res) => {
  try {
    await containerManager.restartUserContainer(req.user.id);

    res.json({
      success: true,
      message: 'Container restarted successfully'
    });
  } catch (error) {
    console.error('[ContainersAPI] Failed to restart container:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to restart container',
      details: error.message
    });
  }
});

/**
 * GET /api/containers/logs
 * Get container logs
 */
router.get('/logs', authenticateToken, async (req, res) => {
  try {
    const tail = parseInt(req.query.tail || '100', 10);
    const logs = await containerManager.getContainerLogs(req.user.id, tail);

    res.json({
      success: true,
      logs
    });
  } catch (error) {
    console.error('[ContainersAPI] Failed to get logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve container logs',
      details: error.message
    });
  }
});

/**
 * GET /api/containers/info
 * Get detailed container information
 */
router.get('/info', authenticateToken, (req, res) => {
  try {
    const containerInfo = containerDb.getContainerByUserId(req.user.id);

    if (!containerInfo) {
      return res.json({
        success: true,
        container: null,
        message: 'No container created yet'
      });
    }

    res.json({
      success: true,
      container: {
        id: containerInfo.id,
        container_id: containerInfo.container_id,
        container_name: containerInfo.container_name,
        port: containerInfo.internal_port,
        status: containerInfo.status,
        agent_type: containerInfo.agent_type,
        created_at: containerInfo.created_at,
        started_at: containerInfo.started_at,
        stopped_at: containerInfo.stopped_at,
        last_health_check: containerInfo.last_health_check,
        error_message: containerInfo.error_message
      }
    });
  } catch (error) {
    console.error('[ContainersAPI] Failed to get info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve container information'
    });
  }
});

/**
 * GET /api/containers/events
 * Get container event logs
 */
router.get('/events', authenticateToken, (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const events = containerDb.getContainerLogs(req.user.id, limit);

    res.json({
      success: true,
      events
    });
  } catch (error) {
    console.error('[ContainersAPI] Failed to get events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve container events'
    });
  }
});

export default router;

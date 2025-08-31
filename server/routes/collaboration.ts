/**
 * P2-2: Real-time Collaboration API Routes
 */

import { Router } from 'express';
import { collaborationManager } from '../collaboration/real-time-collaboration.js';

const router = Router();

// Create new collaboration session
router.post('/sessions', (req, res) => {
  try {
    const { workflowId, ownerName, ownerEmail } = req.body;
    const ownerId = req.body.ownerId || `user_${Date.now()}`;

    if (!workflowId || !ownerName || !ownerEmail) {
      return res.status(400).json({
        success: false,
        error: 'workflowId, ownerName, and ownerEmail are required'
      });
    }

    const session = collaborationManager.createSession(workflowId, ownerId, ownerName, ownerEmail);

    res.json({
      success: true,
      session: {
        id: session.id,
        workflowId: session.workflowId,
        ownerId: session.ownerId,
        users: Array.from(session.users.values()),
        permissions: Object.fromEntries(session.permissions),
        createdAt: session.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating collaboration session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create collaboration session'
    });
  }
});

// Join existing collaboration session
router.post('/sessions/:sessionId/join', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId, userName, userEmail } = req.body;

    if (!userId || !userName || !userEmail) {
      return res.status(400).json({
        success: false,
        error: 'userId, userName, and userEmail are required'
      });
    }

    const user = collaborationManager.joinSession(sessionId, userId, userName, userEmail);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or inactive'
      });
    }

    const session = collaborationManager.getSession(sessionId);
    const activeUsers = collaborationManager.getActiveUsers(sessionId);

    res.json({
      success: true,
      user,
      session: {
        id: session!.id,
        workflowId: session!.workflowId,
        activeUsers,
        userPermission: session!.permissions.get(userId),
        totalUsers: session!.users.size
      }
    });
  } catch (error) {
    console.error('Error joining collaboration session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to join collaboration session'
    });
  }
});

// Leave collaboration session
router.post('/sessions/:sessionId/leave', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const success = collaborationManager.leaveSession(sessionId, userId);

    res.json({
      success,
      message: success ? 'Left session successfully' : 'Session or user not found'
    });
  } catch (error) {
    console.error('Error leaving collaboration session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to leave collaboration session'
    });
  }
});

// Update cursor position
router.post('/sessions/:sessionId/cursor', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId, cursor } = req.body;

    if (!userId || !cursor || typeof cursor.x !== 'number' || typeof cursor.y !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'userId and cursor position (x, y) are required'
      });
    }

    const success = collaborationManager.updateCursor(sessionId, userId, cursor);

    res.json({
      success,
      message: success ? 'Cursor updated' : 'Session or user not found'
    });
  } catch (error) {
    console.error('Error updating cursor:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update cursor position'
    });
  }
});

// Handle workflow changes
router.post('/sessions/:sessionId/changes', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId, changeType, changeData } = req.body;

    if (!userId || !changeType || !changeData) {
      return res.status(400).json({
        success: false,
        error: 'userId, changeType, and changeData are required'
      });
    }

    const validChangeTypes = ['node_added', 'node_updated', 'node_deleted', 'edge_added', 'edge_deleted', 'workflow_saved'];
    if (!validChangeTypes.includes(changeType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid changeType. Must be one of: ${validChangeTypes.join(', ')}`
      });
    }

    const success = collaborationManager.handleWorkflowChange(sessionId, userId, changeType, changeData);

    if (!success) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions or session not found'
      });
    }

    res.json({
      success: true,
      message: 'Change processed successfully',
      changeType,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error handling workflow change:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to handle workflow change'
    });
  }
});

// Get session info
router.get('/sessions/:sessionId', (req, res) => {
  try {
    const session = collaborationManager.getSession(req.params.sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const activeUsers = collaborationManager.getActiveUsers(req.params.sessionId);

    res.json({
      success: true,
      session: {
        id: session.id,
        workflowId: session.workflowId,
        ownerId: session.ownerId,
        activeUsers,
        totalUsers: session.users.size,
        permissions: Object.fromEntries(session.permissions),
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        isActive: session.isActive
      }
    });
  } catch (error) {
    console.error('Error fetching session info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session information'
    });
  }
});

// Update user permissions (admin only)
router.post('/sessions/:sessionId/permissions', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { targetUserId, newPermission, adminUserId } = req.body;

    if (!targetUserId || !newPermission || !adminUserId) {
      return res.status(400).json({
        success: false,
        error: 'targetUserId, newPermission, and adminUserId are required'
      });
    }

    const validPermissions = ['view', 'edit', 'admin'];
    if (!validPermissions.includes(newPermission)) {
      return res.status(400).json({
        success: false,
        error: `Invalid permission. Must be one of: ${validPermissions.join(', ')}`
      });
    }

    const success = collaborationManager.updatePermissions(sessionId, targetUserId, newPermission, adminUserId);

    if (!success) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions or session not found'
      });
    }

    res.json({
      success: true,
      message: `Permissions updated: ${targetUserId} → ${newPermission}`
    });
  } catch (error) {
    console.error('Error updating permissions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update permissions'
    });
  }
});

// Get collaboration statistics
router.get('/stats', (req, res) => {
  try {
    const stats = collaborationManager.getSessionStats();

    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching collaboration stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch collaboration statistics'
    });
  }
});

// Get user's active sessions
router.get('/users/:userId/sessions', (req, res) => {
  try {
    const sessions = collaborationManager.getUserSessions(req.params.userId);
    
    const sessionSummaries = sessions.map(s => ({
      id: s.id,
      workflowId: s.workflowId,
      ownerId: s.ownerId,
      activeUsers: Array.from(s.users.values()).filter(u => u.isActive).length,
      userPermission: s.permissions.get(req.params.userId),
      lastActivity: s.lastActivity
    }));

    res.json({
      success: true,
      sessions: sessionSummaries,
      count: sessions.length
    });
  } catch (error) {
    console.error('Error fetching user sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user sessions'
    });
  }
});

export default router;
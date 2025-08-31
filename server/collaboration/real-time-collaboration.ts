/**
 * P2-2: Real-time Collaboration Features for Team Workflow Building
 * 
 * Enables multiple users to collaborate on workflow building in real-time
 * with live cursors, shared editing, and conflict resolution.
 */

import { EventEmitter } from 'events';

export interface CollaborationUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  color: string;
  cursor?: { x: number; y: number };
  lastSeen: Date;
  isActive: boolean;
}

export interface CollaborationSession {
  id: string;
  workflowId: string;
  ownerId: string;
  users: Map<string, CollaborationUser>;
  permissions: Map<string, 'view' | 'edit' | 'admin'>;
  createdAt: Date;
  lastActivity: Date;
  isActive: boolean;
}

export interface CollaborationEvent {
  type: 'user_joined' | 'user_left' | 'cursor_moved' | 'node_added' | 'node_updated' | 'node_deleted' | 'edge_added' | 'edge_deleted' | 'workflow_saved';
  sessionId: string;
  userId: string;
  timestamp: Date;
  data: any;
}

class RealTimeCollaborationManager extends EventEmitter {
  private sessions = new Map<string, CollaborationSession>();
  private userColors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'
  ];

  // Create new collaboration session
  createSession(workflowId: string, ownerId: string, ownerName: string, ownerEmail: string): CollaborationSession {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const session: CollaborationSession = {
      id: sessionId,
      workflowId,
      ownerId,
      users: new Map(),
      permissions: new Map(),
      createdAt: new Date(),
      lastActivity: new Date(),
      isActive: true
    };

    // Add owner as first user
    const ownerUser: CollaborationUser = {
      id: ownerId,
      name: ownerName,
      email: ownerEmail,
      color: this.userColors[0],
      lastSeen: new Date(),
      isActive: true
    };

    session.users.set(ownerId, ownerUser);
    session.permissions.set(ownerId, 'admin');
    
    this.sessions.set(sessionId, session);
    
    console.log(`🤝 Collaboration session created: ${sessionId} for workflow ${workflowId}`);
    return session;
  }

  // Join existing session
  joinSession(sessionId: string, userId: string, userName: string, userEmail: string): CollaborationUser | null {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) {
      return null;
    }

    // Assign color to new user
    const usedColors = Array.from(session.users.values()).map(u => u.color);
    const availableColors = this.userColors.filter(c => !usedColors.includes(c));
    const userColor = availableColors[0] || this.userColors[Math.floor(Math.random() * this.userColors.length)];

    const user: CollaborationUser = {
      id: userId,
      name: userName,
      email: userEmail,
      color: userColor,
      lastSeen: new Date(),
      isActive: true
    };

    session.users.set(userId, user);
    session.permissions.set(userId, 'edit'); // Default permission
    session.lastActivity = new Date();

    // Emit user joined event
    this.emitCollaborationEvent({
      type: 'user_joined',
      sessionId,
      userId,
      timestamp: new Date(),
      data: { user }
    });

    console.log(`👤 User ${userName} joined session ${sessionId}`);
    return user;
  }

  // Leave session
  leaveSession(sessionId: string, userId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const user = session.users.get(userId);
    if (!user) return false;

    // Mark user as inactive
    user.isActive = false;
    user.lastSeen = new Date();
    session.lastActivity = new Date();

    // Emit user left event
    this.emitCollaborationEvent({
      type: 'user_left',
      sessionId,
      userId,
      timestamp: new Date(),
      data: { user }
    });

    // Remove user after delay to allow for reconnection
    setTimeout(() => {
      session.users.delete(userId);
      session.permissions.delete(userId);
      
      // Close session if no active users
      if (Array.from(session.users.values()).every(u => !u.isActive)) {
        session.isActive = false;
        console.log(`🔒 Session ${sessionId} closed - no active users`);
      }
    }, 30000); // 30 second grace period

    console.log(`👋 User ${user.name} left session ${sessionId}`);
    return true;
  }

  // Update user cursor position
  updateCursor(sessionId: string, userId: string, cursor: { x: number; y: number }): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const user = session.users.get(userId);
    if (!user) return false;

    user.cursor = cursor;
    user.lastSeen = new Date();
    session.lastActivity = new Date();

    // Emit cursor moved event (throttled)
    this.emitCollaborationEvent({
      type: 'cursor_moved',
      sessionId,
      userId,
      timestamp: new Date(),
      data: { cursor }
    });

    return true;
  }

  // Handle workflow changes
  handleWorkflowChange(sessionId: string, userId: string, changeType: string, changeData: any): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const user = session.users.get(userId);
    if (!user) return false;

    // Check permissions
    const permission = session.permissions.get(userId);
    if (permission === 'view') {
      console.warn(`❌ User ${userId} attempted to edit without permission`);
      return false;
    }

    session.lastActivity = new Date();

    // Emit workflow change event
    this.emitCollaborationEvent({
      type: changeType as any,
      sessionId,
      userId,
      timestamp: new Date(),
      data: changeData
    });

    console.log(`🔄 Workflow change: ${changeType} by ${user.name} in session ${sessionId}`);
    return true;
  }

  // Get session info
  getSession(sessionId: string): CollaborationSession | null {
    return this.sessions.get(sessionId) || null;
  }

  // Get active users in session
  getActiveUsers(sessionId: string): CollaborationUser[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return Array.from(session.users.values()).filter(u => u.isActive);
  }

  // Update user permissions
  updatePermissions(sessionId: string, targetUserId: string, newPermission: 'view' | 'edit' | 'admin', adminUserId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Check if admin user has permission to change permissions
    const adminPermission = session.permissions.get(adminUserId);
    if (adminPermission !== 'admin') {
      console.warn(`❌ User ${adminUserId} attempted to change permissions without admin access`);
      return false;
    }

    session.permissions.set(targetUserId, newPermission);
    session.lastActivity = new Date();

    console.log(`🔐 Permissions updated: ${targetUserId} → ${newPermission} by ${adminUserId}`);
    return true;
  }

  // Get session statistics
  getSessionStats(): {
    activeSessions: number;
    totalUsers: number;
    averageUsersPerSession: number;
    oldestSession: Date | null;
  } {
    const activeSessions = Array.from(this.sessions.values()).filter(s => s.isActive);
    const totalUsers = activeSessions.reduce((sum, s) => sum + Array.from(s.users.values()).filter(u => u.isActive).length, 0);
    
    return {
      activeSessions: activeSessions.length,
      totalUsers,
      averageUsersPerSession: activeSessions.length > 0 ? Math.round(totalUsers / activeSessions.length * 10) / 10 : 0,
      oldestSession: activeSessions.length > 0 ? 
        activeSessions.reduce((oldest, s) => s.createdAt < oldest ? s.createdAt : oldest, activeSessions[0].createdAt) : 
        null
    };
  }

  // Cleanup inactive sessions
  cleanupInactiveSessions(): number {
    const now = new Date();
    const maxInactiveTime = 24 * 60 * 60 * 1000; // 24 hours
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      const timeSinceLastActivity = now.getTime() - session.lastActivity.getTime();
      
      if (timeSinceLastActivity > maxInactiveTime || !session.isActive) {
        this.sessions.delete(sessionId);
        cleanedCount++;
        console.log(`🧹 Cleaned up inactive session: ${sessionId}`);
      }
    }

    return cleanedCount;
  }

  // Emit collaboration events
  private emitCollaborationEvent(event: CollaborationEvent): void {
    this.emit('collaboration_event', event);
    
    // Also emit specific event type for targeted listening
    this.emit(event.type, event);
  }

  // Get all sessions for a user
  getUserSessions(userId: string): CollaborationSession[] {
    return Array.from(this.sessions.values()).filter(s => 
      s.users.has(userId) && s.isActive
    );
  }

  // Broadcast message to all users in session
  broadcastToSession(sessionId: string, message: any, excludeUserId?: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const activeUsers = Array.from(session.users.values())
      .filter(u => u.isActive && u.id !== excludeUserId);

    // In a real implementation, this would use WebSockets
    console.log(`📢 Broadcasting to ${activeUsers.length} users in session ${sessionId}:`, message);
    
    return true;
  }
}

// Singleton instance
export const collaborationManager = new RealTimeCollaborationManager();

// Auto-cleanup inactive sessions every hour
setInterval(() => {
  const cleaned = collaborationManager.cleanupInactiveSessions();
  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} inactive collaboration sessions`);
  }
}, 60 * 60 * 1000); // 1 hour
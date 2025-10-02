import { eq, and } from 'drizzle-orm';
import {
  users,
  sessions,
  db,
  OrganizationPlan,
  OrganizationStatus,
  OrganizationLimits,
  OrganizationUsageMetrics,
} from '../database/schema';
import { EncryptionService } from './EncryptionService';
import { JWTPayload } from '../types/common';
import { organizationService, OrganizationContext } from './OrganizationService';

type UserRecord = typeof users.$inferSelect;

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  organizationId?: string;
}

export interface AuthResponse {
  success: boolean;
  user?: AuthUser;
  token?: string;
  refreshToken?: string;
  expiresAt?: Date;
  error?: string;
  activeOrganization?: AuthOrganization;
  organizations?: AuthOrganization[];
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: string;
  planType: string;
  isActive: boolean;
  emailVerified: boolean;
  monthlyApiCalls: number;
  monthlyTokensUsed: number;
  quotaApiCalls: number;
  quotaTokens: number;
  createdAt: Date;
  organizationId?: string;
  organizationRole?: string;
  organizationPlan?: OrganizationPlan;
  organizationStatus?: OrganizationStatus;
  organizationLimits?: OrganizationLimits;
  organizationUsage?: OrganizationUsageMetrics;
  activeOrganization?: AuthOrganization;
  organizations?: AuthOrganization[];
}

export interface AuthOrganization {
  id: string;
  name: string;
  domain: string | null;
  plan: OrganizationPlan;
  status: OrganizationStatus;
  role: string;
  isDefault: boolean;
  limits: OrganizationLimits;
  usage: OrganizationUsageMetrics;
}

export class AuthService {
  private db: any;

  constructor() {
    this.db = db;
    if (!this.db && process.env.NODE_ENV !== 'development') {
      throw new Error('Database connection not available');
    }
  }

  /**
   * Register a new user
   */
  public async register(request: RegisterRequest): Promise<AuthResponse> {
    try {
      console.log(`👤 Registering user: ${request.email}`);

      // Validate email format
      if (!this.isValidEmail(request.email)) {
        return {
          success: false,
          error: 'Invalid email format'
        };
      }

      // Validate password strength
      const passwordValidation = this.validatePassword(request.password);
      if (!passwordValidation.valid) {
        return {
          success: false,
          error: passwordValidation.error
        };
      }

      // Check if user already exists
      const existingUser = await this.getUserByEmail(request.email);
      if (existingUser) {
        return {
          success: false,
          error: 'User already exists with this email'
        };
      }

      // Hash password
      const passwordHash = await EncryptionService.hashPassword(request.password);

      // Create user
      const [newUser] = await this.db.insert(users).values({
        email: request.email.toLowerCase(),
        passwordHash,
        name: request.name,
        role: 'user',
        planType: 'free',
        isActive: true,
        emailVerified: false,
        monthlyApiCalls: 0,
        monthlyTokensUsed: 0,
        quotaApiCalls: 1000, // Free tier fallback
        quotaTokens: 100000, // Free tier fallback
      }).returning();

      // Create a default organization for the new user
      const organization = await organizationService.createOrganizationForUser({
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
      });

      const authState = await this.buildAuthState(newUser.id, organization.id);

      // Generate tokens
      const { token, refreshToken, expiresAt } = await this.generateTokens(
        newUser.id,
        authState.activeOrganizationId
      );

      console.log(`✅ User registered successfully: ${newUser.id}`);

      return {
        success: true,
        user: authState.user,
        token,
        refreshToken,
        expiresAt,
        activeOrganization: authState.activeOrganization,
        organizations: authState.organizations,
      };

    } catch (error) {
      console.error('❌ Registration error:', error);
      return {
        success: false,
        error: 'Registration failed. Please try again.'
      };
    }
  }

  /**
   * Login user
   */
  public async login(request: LoginRequest): Promise<AuthResponse> {
    try {
      console.log(`🔑 Login attempt: ${request.email}`);

      // Get user by email
      const user = await this.getUserByEmail(request.email);
      if (!user) {
        return {
          success: false,
          error: 'Invalid email or password'
        };
      }

      // Check if user is active
      if (!user.isActive) {
        return {
          success: false,
          error: 'Account is deactivated. Please contact support.'
        };
      }

      // Verify password
      const isValidPassword = await EncryptionService.verifyPassword(
        request.password,
        user.passwordHash
      );

      if (!isValidPassword) {
        return {
          success: false,
          error: 'Invalid email or password'
        };
      }

      const authState = await this.buildAuthState(user.id, request.organizationId);

      // Update last login
      await this.updateLastLogin(user.id);

      // Generate tokens
      const { token, refreshToken, expiresAt } = await this.generateTokens(
        user.id,
        authState.activeOrganizationId
      );

      console.log(`✅ Login successful: ${user.id}`);

      return {
        success: true,
        user: authState.user,
        token,
        refreshToken,
        expiresAt,
        activeOrganization: authState.activeOrganization,
        organizations: authState.organizations,
      };

    } catch (error) {
      console.error('❌ Login error:', error);
      return {
        success: false,
        error: 'Login failed. Please try again.'
      };
    }
  }

  /**
   * Refresh access token
   */
  public async refreshToken(refreshToken: string): Promise<AuthResponse> {
    try {
      // Find session with refresh token
      const [session] = await this.db
        .select({
          userId: sessions.userId,
          expiresAt: sessions.expiresAt,
          isActive: sessions.isActive,
          organizationId: sessions.organizationId,
        })
        .from(sessions)
        .where(and(
          eq(sessions.refreshToken, refreshToken),
          eq(sessions.isActive, true)
        ));

      if (!session) {
        return {
          success: false,
          error: 'Invalid refresh token'
        };
      }

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        await this.invalidateSession(refreshToken);
        return {
          success: false,
          error: 'Refresh token expired'
        };
      }

      // Get user
      const userRecord = await this.getUserRecordById(session.userId);
      if (!userRecord || !userRecord.isActive) {
        return {
          success: false,
          error: 'User not found or inactive'
        };
      }

      const authState = await this.buildAuthState(userRecord.id, session.organizationId ?? undefined);

      // Generate new tokens
      const tokens = await this.generateTokens(userRecord.id, authState.activeOrganizationId);

      return {
        success: true,
        user: authState.user,
        token: tokens.token,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        activeOrganization: authState.activeOrganization,
        organizations: authState.organizations,
      };

    } catch (error) {
      console.error('❌ Token refresh error:', error);
      return {
        success: false,
        error: 'Token refresh failed'
      };
    }
  }

  /**
   * Logout user (invalidate session)
   */
  public async logout(token: string): Promise<boolean> {
    try {
      await this.invalidateSession(token);
      return true;
    } catch (error) {
      console.error('❌ Logout error:', error);
      return false;
    }
  }

  /**
   * Verify JWT token and get user
   */
  public async verifyToken(token: string, organizationId?: string): Promise<AuthUser | null> {
    try {
      // Verify JWT
      const payload = EncryptionService.verifyJWT(token);

      // Check if session is active
      const [session] = await this.db
        .select({
          id: sessions.id,
          userId: sessions.userId,
          expiresAt: sessions.expiresAt,
          isActive: sessions.isActive,
          organizationId: sessions.organizationId,
        })
        .from(sessions)
        .where(and(
          eq(sessions.token, token),
          eq(sessions.isActive, true)
        ));

      if (!session) {
        return null;
      }

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        await this.invalidateSession(token);
        return null;
      }

      const authState = await this.buildAuthState(
        payload.userId,
        organizationId ?? session.organizationId ?? undefined
      );

      if (!authState.user.isActive) {
        return null;
      }

      const activeOrganizationId = authState.activeOrganizationId ?? null;

      if (session.organizationId !== activeOrganizationId) {
        await this.db
          .update(sessions)
          .set({ organizationId: activeOrganizationId, lastUsed: new Date() })
          .where(eq(sessions.id, session.id));
      } else {
        await this.updateSessionLastUsed(token);
      }

      return authState.user;

    } catch (error) {
      console.error('❌ Token verification error:', error);
      return null;
    }
  }

  /**
   * Get user by email
   */
  private async getUserByEmail(email: string): Promise<UserRecord | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    return user ?? null;
  }

  /**
   * Get user by ID
   */
  private async getUserRecordById(userId: string): Promise<UserRecord | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user ?? null;
  }

  /**
   * Generate JWT and refresh tokens
   */
  private async generateTokens(userId: string, organizationId?: string | null): Promise<{
    token: string;
    refreshToken: string;
    expiresAt: Date;
  }> {
    // Get user details for JWT payload
    const [user] = await this.db
      .select({
        email: users.email,
        role: users.role,
        plan: users.planType
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new Error('User not found');
    }

    const token = EncryptionService.generateJWT({
      userId,
      email: user.email,
      role: user.role,
      plan: user.plan,
      organizationId: organizationId ?? null,
    }, '24h');
    const refreshToken = EncryptionService.generateRefreshToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Store session
    await this.db.insert(sessions).values({
      userId,
      organizationId: organizationId ?? null,
      token,
      refreshToken,
      expiresAt,
      isActive: true,
    });

    return { token, refreshToken, expiresAt };
  }

  /**
   * Update last login timestamp
   */
  private async updateLastLogin(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({
        lastLogin: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  /**
   * Invalidate session
   */
  private async invalidateSession(token: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({
        isActive: false,
      })
      .where(eq(sessions.token, token));
  }

  /**
   * Update session last used timestamp
   */
  private async updateSessionLastUsed(token: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({
        lastUsed: new Date(),
      })
      .where(eq(sessions.token, token));
  }

  private async getOrganizationsForUser(user: UserRecord): Promise<OrganizationContext[]> {
    if (!db) {
      return [];
    }

    const organizations = await organizationService.listUserOrganizations(user.id);
    if (organizations.length === 0) {
      const created = await organizationService.createOrganizationForUser({
        id: user.id,
        email: user.email,
        name: user.name,
      });
      return [created];
    }

    return organizations;
  }

  private mapOrganizationForResponse(context: OrganizationContext): AuthOrganization {
    return {
      id: context.id,
      name: context.name,
      domain: context.domain,
      plan: context.plan,
      status: context.status,
      role: context.role,
      isDefault: context.isDefault,
      limits: context.limits,
      usage: context.usage,
    };
  }

  private async buildAuthState(
    userId: string,
    organizationId?: string
  ): Promise<{
    user: AuthUser;
    organizations: AuthOrganization[];
    activeOrganization?: AuthOrganization;
    activeOrganizationId?: string;
  }> {
    const userRecord = await this.getUserRecordById(userId);
    if (!userRecord) {
      throw new Error('User not found');
    }

    const organizations = await this.getOrganizationsForUser(userRecord);

    let activeContext: OrganizationContext | undefined;
    if (organizationId) {
      activeContext = organizations.find((org) => org.id === organizationId);
    }

    if (!activeContext && organizations.length > 0) {
      activeContext = organizations.find((org) => org.isDefault) ?? organizations[0];
    }

    const organizationSummaries = organizations.map((org) => this.mapOrganizationForResponse(org));
    const activeOrganization = activeContext ? this.mapOrganizationForResponse(activeContext) : undefined;

    const legacyPlanType = this.mapPlanToLegacy(activeContext?.plan ?? userRecord.planType);

    const authUser: AuthUser = {
      id: userRecord.id,
      email: userRecord.email,
      name: userRecord.name ?? undefined,
      role: userRecord.role,
      planType: legacyPlanType,
      isActive: userRecord.isActive,
      emailVerified: userRecord.emailVerified,
      monthlyApiCalls: userRecord.monthlyApiCalls,
      monthlyTokensUsed: userRecord.monthlyTokensUsed,
      quotaApiCalls: activeOrganization?.limits.maxExecutions ?? userRecord.quotaApiCalls,
      quotaTokens: userRecord.quotaTokens,
      createdAt: userRecord.createdAt,
      organizationId: activeOrganization?.id,
      organizationRole: activeOrganization?.role,
      organizationPlan: activeOrganization?.plan,
      organizationStatus: activeOrganization?.status,
      organizationLimits: activeOrganization?.limits,
      organizationUsage: activeOrganization?.usage,
      activeOrganization,
      organizations: organizationSummaries,
    };

    return {
      user: authUser,
      organizations: organizationSummaries,
      activeOrganization,
      activeOrganizationId: activeOrganization?.id,
    };
  }

  private mapPlanToLegacy(plan: string): string {
    switch (plan) {
      case 'professional':
        return 'pro';
      case 'enterprise':
      case 'enterprise_plus':
        return 'enterprise';
      case 'starter':
        return 'free';
      default:
        return plan;
    }
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate password strength
   */
  private validatePassword(password: string): { valid: boolean; error?: string } {
    if (password.length < 8) {
      return { valid: false, error: 'Password must be at least 8 characters long' };
    }

    if (!/(?=.*[a-z])/.test(password)) {
      return { valid: false, error: 'Password must contain at least one lowercase letter' };
    }

    if (!/(?=.*[A-Z])/.test(password)) {
      return { valid: false, error: 'Password must contain at least one uppercase letter' };
    }

    if (!/(?=.*\d)/.test(password)) {
      return { valid: false, error: 'Password must contain at least one number' };
    }

    return { valid: true };
  }

  /**
   * Check if user has quota remaining
   */
  public async checkQuota(
    userId: string,
    apiCalls: number = 1,
    tokens: number = 0,
    organizationId?: string
  ): Promise<{
    hasQuota: boolean;
    quotaExceeded: 'api_calls' | 'tokens' | 'workflows' | 'storage' | 'users' | null;
    limit?: number;
    remaining?: number;
  }> {
    try {
      const authState = await this.buildAuthState(userId, organizationId);
      const user = authState.user;
      const activeOrg = authState.activeOrganization;

      if (activeOrg) {
        const remainingApi = activeOrg.limits.maxExecutions - activeOrg.usage.apiCalls;
        if (remainingApi < apiCalls) {
          return {
            hasQuota: false,
            quotaExceeded: 'api_calls',
            limit: activeOrg.limits.maxExecutions,
            remaining: Math.max(0, remainingApi),
          };
        }

        const remainingWorkflows = activeOrg.limits.maxWorkflows - activeOrg.usage.workflowExecutions;
        if (remainingWorkflows <= 0) {
          return {
            hasQuota: false,
            quotaExceeded: 'workflows',
            limit: activeOrg.limits.maxWorkflows,
            remaining: Math.max(0, remainingWorkflows),
          };
        }

        const remainingUsers = activeOrg.limits.maxUsers - activeOrg.usage.usersActive;
        if (remainingUsers <= 0) {
          return {
            hasQuota: false,
            quotaExceeded: 'users',
            limit: activeOrg.limits.maxUsers,
            remaining: Math.max(0, remainingUsers),
          };
        }
      }

      if (user.monthlyApiCalls + apiCalls > user.quotaApiCalls) {
        return {
          hasQuota: false,
          quotaExceeded: 'api_calls',
          limit: user.quotaApiCalls,
          remaining: Math.max(0, user.quotaApiCalls - user.monthlyApiCalls),
        };
      }

      if (user.monthlyTokensUsed + tokens > user.quotaTokens) {
        return {
          hasQuota: false,
          quotaExceeded: 'tokens',
          limit: user.quotaTokens,
          remaining: Math.max(0, user.quotaTokens - user.monthlyTokensUsed),
        };
      }

      const limit = activeOrg?.limits.maxExecutions ?? user.quotaApiCalls;
      const remaining = activeOrg
        ? Math.max(0, limit - (activeOrg.usage.apiCalls + apiCalls))
        : Math.max(0, user.quotaApiCalls - (user.monthlyApiCalls + apiCalls));

      return { hasQuota: true, quotaExceeded: null, limit, remaining };
    } catch (error) {
      console.error('❌ Failed to check quota:', error);
      return { hasQuota: false, quotaExceeded: null };
    }
  }

  /**
   * Update usage metrics
   */
  public async updateUsage(
    userId: string,
    apiCalls: number = 0,
    tokens: number = 0,
    organizationId?: string
  ): Promise<void> {
    await this.db
      .update(users)
      .set({
        monthlyApiCalls: users.monthlyApiCalls + apiCalls,
        monthlyTokensUsed: users.monthlyTokensUsed + tokens,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    try {
      const targetOrganizationId = organizationId
        ? organizationId
        : (await this.buildAuthState(userId)).activeOrganizationId;

      if (targetOrganizationId) {
        await organizationService.recordUsage(targetOrganizationId, { apiCalls });
      }
    } catch (error) {
      console.warn('⚠️ Failed to update organization usage', error);
    }
  }
}

export const authService = new AuthService();
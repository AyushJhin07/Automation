import { eq, and, count } from 'drizzle-orm';
import {
  users,
  sessions,
  organizations,
  organizationMembers,
  organizationInvites,
  db
} from '../database/schema';
import { EncryptionService } from './EncryptionService';
import { JWTPayload } from '../types/common';

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export type OrganizationPlan = 'starter' | 'professional' | 'enterprise' | 'enterprise_plus';

export interface OrganizationPermissions {
  canCreateWorkflows: boolean;
  canEditWorkflows: boolean;
  canDeleteWorkflows: boolean;
  canManageUsers: boolean;
  canViewAnalytics: boolean;
  canManageBilling: boolean;
  canAccessApi: boolean;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  domain?: string | null;
  plan: OrganizationPlan;
  status: string;
  role: string;
  isDefault: boolean;
  limits: {
    workflows: number;
    executions: number;
    apiCalls: number;
    users: number;
    storage: number;
  };
  usage: {
    apiCalls: number;
    workflowExecutions: number;
    storage: number;
    usersActive: number;
  };
  permissions: OrganizationPermissions;
}

export interface AuthResponse {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name?: string;
    role: string;
    planType: string;
    emailVerified: boolean;
    quotaApiCalls: number;
    quotaTokens: number;
    activeOrganizationId: string | null;
    organizationRole?: string;
    organizationPermissions?: OrganizationPermissions;
  };
  organizations?: OrganizationSummary[];
  activeOrganizationId?: string | null;
  token?: string;
  refreshToken?: string;
  expiresAt?: Date;
  error?: string;
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
  activeOrganizationId?: string | null;
  organizationRole?: string;
  organizationPermissions?: OrganizationPermissions;
  organizations?: OrganizationSummary[];
}

export class AuthService {
  private db: any;

  private static readonly PLAN_LIMITS: Record<OrganizationPlan, {
    workflows: number;
    executions: number;
    apiCalls: number;
    users: number;
    storage: number;
  }> = {
    starter: { workflows: 25, executions: 1000, apiCalls: 10000, users: 5, storage: 1024 },
    professional: { workflows: 100, executions: 10000, apiCalls: 100000, users: 25, storage: 10240 },
    enterprise: { workflows: 250, executions: 50000, apiCalls: 500000, users: 250, storage: 51200 },
    enterprise_plus: { workflows: 1000, executions: 200000, apiCalls: 2000000, users: 1000, storage: 204800 },
  };

  private static readonly PLAN_FEATURES: Record<OrganizationPlan, {
    ssoEnabled: boolean;
    auditLogging: boolean;
    customBranding: boolean;
    advancedAnalytics: boolean;
    prioritySupport: boolean;
    customIntegrations: boolean;
    onPremiseDeployment: boolean;
    dedicatedInfrastructure: boolean;
  }> = {
    starter: {
      ssoEnabled: false,
      auditLogging: false,
      customBranding: false,
      advancedAnalytics: false,
      prioritySupport: false,
      customIntegrations: false,
      onPremiseDeployment: false,
      dedicatedInfrastructure: false,
    },
    professional: {
      ssoEnabled: true,
      auditLogging: true,
      customBranding: true,
      advancedAnalytics: true,
      prioritySupport: true,
      customIntegrations: false,
      onPremiseDeployment: false,
      dedicatedInfrastructure: false,
    },
    enterprise: {
      ssoEnabled: true,
      auditLogging: true,
      customBranding: true,
      advancedAnalytics: true,
      prioritySupport: true,
      customIntegrations: true,
      onPremiseDeployment: false,
      dedicatedInfrastructure: true,
    },
    enterprise_plus: {
      ssoEnabled: true,
      auditLogging: true,
      customBranding: true,
      advancedAnalytics: true,
      prioritySupport: true,
      customIntegrations: true,
      onPremiseDeployment: true,
      dedicatedInfrastructure: true,
    },
  };

  private static readonly DEFAULT_SECURITY = {
    ipWhitelist: [] as string[],
    mfaRequired: false,
    sessionTimeout: 480,
    passwordPolicy: {
      minLength: 8,
      requireSpecialChars: true,
      requireNumbers: true,
      requireUppercase: true,
    },
    apiKeyRotationDays: 90,
  };

  private static readonly DEFAULT_COMPLIANCE = {
    gdprEnabled: true,
    hipaaCompliant: false,
    soc2Type2: false,
    dataResidency: 'us' as const,
    retentionPolicyDays: 2555,
  };

  private static readonly OWNER_PERMISSIONS: OrganizationPermissions = {
    canCreateWorkflows: true,
    canEditWorkflows: true,
    canDeleteWorkflows: true,
    canManageUsers: true,
    canViewAnalytics: true,
    canManageBilling: true,
    canAccessApi: true,
  };

  private static readonly MEMBER_PERMISSIONS: OrganizationPermissions = {
    canCreateWorkflows: true,
    canEditWorkflows: true,
    canDeleteWorkflows: false,
    canManageUsers: false,
    canViewAnalytics: true,
    canManageBilling: false,
    canAccessApi: true,
  };

  constructor() {
    this.db = db;
    if (!this.db && process.env.NODE_ENV !== 'development') {
      throw new Error('Database connection not available');
    }
  }

  private static sanitizePermissions(permissions?: OrganizationPermissions | null): OrganizationPermissions {
    return {
      canCreateWorkflows: permissions?.canCreateWorkflows ?? false,
      canEditWorkflows: permissions?.canEditWorkflows ?? false,
      canDeleteWorkflows: permissions?.canDeleteWorkflows ?? false,
      canManageUsers: permissions?.canManageUsers ?? false,
      canViewAnalytics: permissions?.canViewAnalytics ?? false,
      canManageBilling: permissions?.canManageBilling ?? false,
      canAccessApi: permissions?.canAccessApi ?? false,
    };
  }

  private static getPlanLimits(plan: OrganizationPlan) {
    return this.PLAN_LIMITS[plan] ?? this.PLAN_LIMITS.starter;
  }

  private static getPlanFeatures(plan: OrganizationPlan) {
    return this.PLAN_FEATURES[plan] ?? this.PLAN_FEATURES.starter;
  }

  private static getDefaultBranding(name: string, domain?: string | null) {
    return {
      companyName: name,
      supportEmail: domain ? `support@${domain}` : undefined,
    };
  }

  private static getDefaultPermissionsForRole(role: string): OrganizationPermissions {
    if (role === 'owner' || role === 'admin') {
      return this.OWNER_PERMISSIONS;
    }
    return this.MEMBER_PERMISSIONS;
  }

  private static generateSubdomain(companyName: string): string {
    const base = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 20);

    const fallback = base || 'org';
    return `${fallback}-${Math.random().toString(36).substring(2, 8)}`;
  }

  private static getTrialEndDate(): Date {
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }

  private async getUserOrganizations(userId: string): Promise<OrganizationSummary[]> {
    if (!this.db) {
      return [];
    }

    const rows = await this.db
      .select({
        id: organizations.id,
        name: organizations.name,
        domain: organizations.domain,
        plan: organizations.plan,
        status: organizations.status,
        usageApiCalls: organizations.usageApiCalls,
        usageWorkflowExecutions: organizations.usageWorkflowExecutions,
        usageStorageUsed: organizations.usageStorageUsed,
        usageUsersActive: organizations.usageUsersActive,
        limitWorkflows: organizations.limitWorkflows,
        limitExecutions: organizations.limitExecutions,
        limitApiCalls: organizations.limitApiCalls,
        limitUsers: organizations.limitUsers,
        limitStorage: organizations.limitStorage,
        role: organizationMembers.role,
        permissions: organizationMembers.permissions,
        isDefault: organizationMembers.isDefault,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
      .where(eq(organizationMembers.userId, userId));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      domain: row.domain,
      plan: (row.plan as OrganizationPlan) ?? 'starter',
      status: row.status,
      role: row.role,
      isDefault: Boolean(row.isDefault),
      limits: {
        workflows: Number(row.limitWorkflows ?? 0),
        executions: Number(row.limitExecutions ?? 0),
        apiCalls: Number(row.limitApiCalls ?? 0),
        users: Number(row.limitUsers ?? 0),
        storage: Number(row.limitStorage ?? 0),
      },
      usage: {
        apiCalls: Number(row.usageApiCalls ?? 0),
        workflowExecutions: Number(row.usageWorkflowExecutions ?? 0),
        storage: Number(row.usageStorageUsed ?? 0),
        usersActive: Number(row.usageUsersActive ?? 0),
      },
      permissions: AuthService.sanitizePermissions(row.permissions as OrganizationPermissions),
    }));
  }

  private async ensureDefaultOrganization(
    userId: string,
    email: string,
    displayName?: string | null
  ): Promise<{ organizations: OrganizationSummary[]; activeOrganizationId: string | null; activeOrganization?: OrganizationSummary }>
  {
    let organizations = await this.getUserOrganizations(userId);

    if (organizations.length === 0) {
      const [localPart, domain] = email.split('@');
      const workspaceName = displayName
        ? `${displayName}'s Workspace`
        : `${localPart || 'workspace'} Team`;

      const creation = await this.createOrganizationForUser(userId, {
        name: workspaceName,
        domain: domain || null,
        plan: 'starter',
        ownerEmail: email,
        ownerName: displayName ?? null,
        setDefault: true,
      });
      organizations = creation.organizations;
    }

    const activeOrganization = organizations.find((org) => org.isDefault) ?? organizations[0];

    return {
      organizations,
      activeOrganizationId: activeOrganization ? activeOrganization.id : null,
      activeOrganization,
    };
  }

  private async createOrganizationForUser(
    userId: string,
    params: {
      name: string;
      domain?: string | null;
      plan?: OrganizationPlan;
      ownerEmail: string;
      ownerName?: string | null;
      setDefault?: boolean;
    }
  ): Promise<{ organizations: OrganizationSummary[]; createdOrganization?: OrganizationSummary }>
  {
    if (!this.db) {
      return { organizations: [] };
    }

    const plan = params.plan ?? 'starter';
    const limits = AuthService.getPlanLimits(plan);
    const features = { ...AuthService.getPlanFeatures(plan) };
    const security = {
      ...AuthService.DEFAULT_SECURITY,
      ipWhitelist: [...AuthService.DEFAULT_SECURITY.ipWhitelist],
      passwordPolicy: { ...AuthService.DEFAULT_SECURITY.passwordPolicy },
    };
    const compliance = { ...AuthService.DEFAULT_COMPLIANCE };
    const branding = AuthService.getDefaultBranding(params.name, params.domain ?? null);
    const trialEndsAt = AuthService.getTrialEndDate();
    const billingPeriodStart = new Date();
    const billingPeriodEnd = AuthService.getTrialEndDate();

    const [organization] = await this.db
      .insert(organizations)
      .values({
        ownerId: userId,
        name: params.name,
        domain: params.domain ?? null,
        subdomain: AuthService.generateSubdomain(params.name),
        plan,
        status: 'trial',
        createdAt: new Date(),
        updatedAt: new Date(),
        trialEndsAt,
        billingCustomerId: '',
        billingSubscriptionId: '',
        billingPeriodStart,
        billingPeriodEnd,
        usageWorkflowExecutions: 0,
        usageApiCalls: 0,
        usageStorageUsed: 0,
        usageUsersActive: 1,
        limitWorkflows: limits.workflows,
        limitExecutions: limits.executions,
        limitApiCalls: limits.apiCalls,
        limitUsers: limits.users,
        limitStorage: limits.storage,
        features,
        security,
        branding,
        compliance,
        metadata: {
          provisionedBy: 'auth_service',
          createdBy: userId,
        },
      })
      .returning({ id: organizations.id });

    if (!organization) {
      const organizations = await this.getUserOrganizations(userId);
      return { organizations };
    }

    if (params.setDefault !== false) {
      await this.db
        .update(organizationMembers)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(organizationMembers.userId, userId));
    }

    const nameParts = (params.ownerName || '').trim().split(/\s+/).filter(Boolean);
    const [firstName, ...rest] = nameParts;
    const lastName = rest.length ? rest.join(' ') : null;

    await this.db.insert(organizationMembers).values({
      organizationId: organization.id,
      userId,
      email: params.ownerEmail.toLowerCase(),
      firstName: firstName || null,
      lastName: lastName || null,
      role: 'owner',
      status: 'active',
      permissions: AuthService.OWNER_PERMISSIONS,
      invitedBy: userId,
      lastLoginAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      mfaEnabled: false,
      isDefault: params.setDefault !== false,
    });

    const organizations = await this.getUserOrganizations(userId);
    const createdOrganization = organizations.find((org) => org.id === organization.id);

    return { organizations, createdOrganization };
  }

  public async createOrganization(
    userId: string,
    payload: { name: string; domain?: string | null; plan?: OrganizationPlan; makeDefault?: boolean }
  ): Promise<{
    organizations: OrganizationSummary[];
    activeOrganizationId: string | null;
    activeOrganization?: OrganizationSummary;
    createdOrganization?: OrganizationSummary;
  }>
  {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const name = payload.name?.trim();
    if (!name) {
      throw new Error('Organization name is required');
    }

    const creation = await this.createOrganizationForUser(userId, {
      name,
      domain: payload.domain ?? null,
      plan: payload.plan ?? 'starter',
      ownerEmail: user.email,
      ownerName: user.name ?? null,
      setDefault: payload.makeDefault ?? true,
    });

    const organizations = creation.organizations;

    const activeOrganization = organizations.find((org) => org.isDefault) ?? organizations[0];

    return {
      organizations,
      activeOrganizationId: activeOrganization ? activeOrganization.id : null,
      activeOrganization,
      createdOrganization: creation.createdOrganization,
    };
  }

  private async getOrganizationMembership(userId: string, organizationId: string) {
    const [membership] = await this.db
      .select({
        id: organizationMembers.id,
        role: organizationMembers.role,
        permissions: organizationMembers.permissions,
        status: organizationMembers.status,
        isDefault: organizationMembers.isDefault,
      })
      .from(organizationMembers)
      .where(and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, organizationId)
      ));

    return membership;
  }

  private async getOrganizationById(organizationId: string) {
    const [organization] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId));

    return organization;
  }

  public async setActiveOrganization(
    userId: string,
    sessionToken: string,
    organizationId: string
  ): Promise<{ organizations: OrganizationSummary[]; activeOrganizationId: string | null; activeOrganization?: OrganizationSummary }>
  {
    const membership = await this.getOrganizationMembership(userId, organizationId);
    if (!membership) {
      throw new Error('Not a member of this organization');
    }

    await this.db
      .update(organizationMembers)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(organizationMembers.userId, userId));

    await this.db
      .update(organizationMembers)
      .set({ isDefault: true, status: 'active', updatedAt: new Date() })
      .where(and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, organizationId)
      ));

    await this.db
      .update(sessions)
      .set({ organizationId, lastUsed: new Date() })
      .where(and(
        eq(sessions.userId, userId),
        eq(sessions.token, sessionToken),
        eq(sessions.isActive, true)
      ));

    const organizations = await this.getUserOrganizations(userId);
    const activeOrganization = organizations.find((org) => org.id === organizationId) ?? organizations[0];

    return {
      organizations,
      activeOrganizationId: activeOrganization ? activeOrganization.id : null,
      activeOrganization,
    };
  }

  public async inviteToOrganization(
    userId: string,
    organizationId: string,
    payload: { email: string; role?: string; expiresInDays?: number; metadata?: Record<string, any> }
  )
    : Promise<{ id: string; email: string; role: string; status: string; token: string; expiresAt: Date }>
  {
    const membership = await this.getOrganizationMembership(userId, organizationId);
    if (!membership) {
      throw new Error('Not a member of this organization');
    }

    const permissions = AuthService.sanitizePermissions(membership.permissions as OrganizationPermissions);
    if (!permissions.canManageUsers) {
      throw new Error('Insufficient permissions to invite members');
    }

    const organization = await this.getOrganizationById(organizationId);
    if (!organization) {
      throw new Error('Organization not found');
    }

    const [{ memberCount }] = await this.db
      .select({ memberCount: count() })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, organizationId));

    const [{ pendingInvites }] = await this.db
      .select({ pendingInvites: count() })
      .from(organizationInvites)
      .where(and(
        eq(organizationInvites.organizationId, organizationId),
        eq(organizationInvites.status, 'pending')
      ));

    const totalSeats = Number(memberCount ?? 0) + Number(pendingInvites ?? 0);
    if (totalSeats >= Number(organization.limitUsers ?? 0)) {
      throw new Error('Organization user limit reached for current plan');
    }

    const token = EncryptionService.generateSecureId(48);
    const expiresInDays = payload.expiresInDays ?? 14;
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    const [invite] = await this.db
      .insert(organizationInvites)
      .values({
        organizationId,
        email: payload.email.toLowerCase(),
        role: payload.role ?? 'member',
        status: 'pending',
        invitedBy: userId,
        token,
        expiresAt,
        metadata: payload.metadata ?? {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({
        id: organizationInvites.id,
        email: organizationInvites.email,
        role: organizationInvites.role,
        status: organizationInvites.status,
        token: organizationInvites.token,
        expiresAt: organizationInvites.expiresAt,
      });

    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      token: invite.token,
      expiresAt: invite.expiresAt,
    };
  }

  public async revokeInvite(
    userId: string,
    organizationId: string,
    inviteId: string
  ): Promise<void>
  {
    const membership = await this.getOrganizationMembership(userId, organizationId);
    if (!membership) {
      throw new Error('Not a member of this organization');
    }

    const permissions = AuthService.sanitizePermissions(membership.permissions as OrganizationPermissions);
    if (!permissions.canManageUsers) {
      throw new Error('Insufficient permissions to manage invites');
    }

    await this.db
      .update(organizationInvites)
      .set({ status: 'revoked', revokedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(organizationInvites.organizationId, organizationId),
        eq(organizationInvites.id, inviteId)
      ));
  }

  public async removeMember(
    userId: string,
    organizationId: string,
    membershipId: string
  ): Promise<void>
  {
    const actingMembership = await this.getOrganizationMembership(userId, organizationId);
    if (!actingMembership) {
      throw new Error('Not a member of this organization');
    }

    const permissions = AuthService.sanitizePermissions(actingMembership.permissions as OrganizationPermissions);
    if (!permissions.canManageUsers) {
      throw new Error('Insufficient permissions to remove members');
    }

    const [targetMembership] = await this.db
      .select({
        id: organizationMembers.id,
        userId: organizationMembers.userId,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .where(and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.id, membershipId)
      ));

    if (!targetMembership) {
      throw new Error('Member not found');
    }

    // Prevent removing the last owner
    if (targetMembership.role === 'owner') {
      const [{ ownerCount }] = await this.db
        .select({ ownerCount: count() })
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.role, 'owner')
        ));

      if (Number(ownerCount ?? 0) <= 1) {
        throw new Error('Cannot remove the last owner from the organization');
      }
    }

    await this.db
      .delete(organizationMembers)
      .where(and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.id, membershipId)
      ));
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
        quotaApiCalls: 1000, // Free tier
        quotaTokens: 100000, // Free tier
      }).returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        planType: users.planType,
        emailVerified: users.emailVerified,
        quotaApiCalls: users.quotaApiCalls,
        quotaTokens: users.quotaTokens,
      });

      const { organizations, activeOrganizationId, activeOrganization } = await this.ensureDefaultOrganization(
        newUser.id,
        newUser.email,
        newUser.name
      );

      // Generate tokens
      const { token, refreshToken, expiresAt } = await this.generateTokens(newUser.id, activeOrganizationId);

      console.log(`✅ User registered successfully: ${newUser.id}`);

      return {
        success: true,
        user: {
          ...newUser,
          activeOrganizationId,
          organizationRole: activeOrganization?.role,
          organizationPermissions: activeOrganization?.permissions,
        },
        organizations,
        activeOrganizationId,
        token,
        refreshToken,
        expiresAt
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

      // Update last login
      await this.updateLastLogin(user.id);

      const { organizations, activeOrganizationId, activeOrganization } = await this.ensureDefaultOrganization(
        user.id,
        user.email,
        user.name
      );

      // Generate tokens
      const { token, refreshToken, expiresAt } = await this.generateTokens(user.id, activeOrganizationId);

      console.log(`✅ Login successful: ${user.id}`);

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          planType: user.planType,
          emailVerified: user.emailVerified,
          quotaApiCalls: user.quotaApiCalls,
          quotaTokens: user.quotaTokens,
          activeOrganizationId,
          organizationRole: activeOrganization?.role,
          organizationPermissions: activeOrganization?.permissions,
        },
        organizations,
        activeOrganizationId,
        token,
        refreshToken,
        expiresAt
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
      const user = await this.getUserById(session.userId);
      if (!user || !user.isActive) {
        return {
          success: false,
          error: 'User not found or inactive'
        };
      }

      const { organizations, activeOrganizationId, activeOrganization } = await this.ensureDefaultOrganization(
        user.id,
        user.email,
        user.name
      );

      // Generate new tokens
      const tokens = await this.generateTokens(user.id, activeOrganizationId);

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          planType: user.planType,
          emailVerified: user.emailVerified,
          quotaApiCalls: user.quotaApiCalls,
          quotaTokens: user.quotaTokens,
          activeOrganizationId,
          organizationRole: activeOrganization?.role,
          organizationPermissions: activeOrganization?.permissions,
        },
        organizations,
        activeOrganizationId,
        token: tokens.token,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt
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
  public async verifyToken(token: string): Promise<AuthUser | null> {
    try {
      // Verify JWT
      const payload = EncryptionService.verifyJWT(token);

      // Check if session is active
      const [session] = await this.db
        .select()
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

      // Get user
      const user = await this.getUserById(payload.userId);
      if (!user || !user.isActive) {
        return null;
      }

      const { organizations, activeOrganizationId, activeOrganization } = await this.ensureDefaultOrganization(
        user.id,
        user.email,
        user.name
      );

      let resolvedOrganizationId = session.organizationId ?? activeOrganizationId;
      let resolvedOrganization = organizations.find((org) => org.id === resolvedOrganizationId) ?? activeOrganization;

      if (resolvedOrganizationId && !resolvedOrganization) {
        resolvedOrganization = activeOrganization;
        resolvedOrganizationId = activeOrganizationId ?? null;
      }

      if (resolvedOrganizationId !== session.organizationId) {
        await this.db
          .update(sessions)
          .set({ organizationId: resolvedOrganizationId ?? null, lastUsed: new Date() })
          .where(eq(sessions.id, session.id));
      }

      // Update last used
      await this.updateSessionLastUsed(token);

      return {
        ...user,
        activeOrganizationId: resolvedOrganization ? resolvedOrganization.id : null,
        organizationRole: resolvedOrganization?.role,
        organizationPermissions: resolvedOrganization?.permissions,
        organizations,
      } as AuthUser;

    } catch (error) {
      console.error('❌ Token verification error:', error);
      return null;
    }
  }

  /**
   * Get user by email
   */
  private async getUserByEmail(email: string): Promise<any> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()));

    return user;
  }

  /**
   * Get user by ID
   */
  private async getUserById(userId: string): Promise<AuthUser | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    return user;
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
      organizationId: organizationId ?? undefined,
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
        lastLoginAt: new Date(),
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
    organizationId?: string | null
  ): Promise<{
    hasQuota: boolean;
    quotaExceeded: 'api_calls' | 'tokens' | null;
    organizationQuotaExceeded: 'api_calls' | 'executions' | null;
  }> {
    const user = await this.getUserById(userId);
    if (!user) {
      return { hasQuota: false, quotaExceeded: null, organizationQuotaExceeded: null };
    }

    if (user.monthlyApiCalls + apiCalls > user.quotaApiCalls) {
      return { hasQuota: false, quotaExceeded: 'api_calls', organizationQuotaExceeded: null };
    }

    if (user.monthlyTokensUsed + tokens > user.quotaTokens) {
      return { hasQuota: false, quotaExceeded: 'tokens', organizationQuotaExceeded: null };
    }

    let organizationQuotaExceeded: 'api_calls' | 'executions' | null = null;

    if (organizationId) {
      const organization = await this.getOrganizationById(organizationId);
      if (!organization) {
        return { hasQuota: false, quotaExceeded: null, organizationQuotaExceeded: 'api_calls' };
      }

      const usageApiCalls = Number(organization.usageApiCalls ?? 0);
      const limitApiCalls = Number(organization.limitApiCalls ?? 0);
      const usageExecutions = Number(organization.usageWorkflowExecutions ?? 0);
      const limitExecutions = Number(organization.limitExecutions ?? 0);

      if (limitApiCalls > 0 && usageApiCalls + apiCalls > limitApiCalls) {
        organizationQuotaExceeded = 'api_calls';
      } else if (limitExecutions > 0 && usageExecutions + 1 > limitExecutions) {
        organizationQuotaExceeded = 'executions';
      }

      if (organizationQuotaExceeded) {
        return { hasQuota: false, quotaExceeded: null, organizationQuotaExceeded };
      }
    }

    return { hasQuota: true, quotaExceeded: null, organizationQuotaExceeded };
  }

  public async listUserOrganizations(userId: string): Promise<OrganizationSummary[]> {
    return this.getUserOrganizations(userId);
  }

  /**
   * Update usage metrics
   */
  public async updateUsage(
    userId: string,
    apiCalls: number = 0,
    tokens: number = 0,
    organizationId?: string | null,
    workflowExecutions: number = 0
  ): Promise<void> {
    await this.db
      .update(users)
      .set({
        monthlyApiCalls: users.monthlyApiCalls + apiCalls,
        monthlyTokensUsed: users.monthlyTokensUsed + tokens,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    if (organizationId) {
      await this.db
        .update(organizations)
        .set({
          usageApiCalls: organizations.usageApiCalls + apiCalls,
          usageWorkflowExecutions: organizations.usageWorkflowExecutions + workflowExecutions,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, organizationId));
    }
  }
}

export const authService = new AuthService();
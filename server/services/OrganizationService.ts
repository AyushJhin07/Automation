import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import {
  db,
  organizations,
  organizationMembers,
  organizationRoleAssignments,
  organizationInvites,
  organizationQuotas,
  tenantIsolations,
  OrganizationPlan,
  OrganizationStatus,
  OrganizationLimits,
  OrganizationUsageMetrics,
  OrganizationFeatureFlags,
  OrganizationSecuritySettings,
  OrganizationBranding,
  OrganizationComplianceSettings,
  OrganizationRegion,
  users,
} from '../database/schema';
import { OrgRole } from '../../configs/rbac';

export interface OrganizationSummary {
  id: string;
  name: string;
  domain: string | null;
  region: OrganizationRegion;
  plan: OrganizationPlan;
  status: OrganizationStatus;
  role: string;
  isDefault: boolean;
  limits: OrganizationLimits;
  usage: OrganizationUsageMetrics;
  membershipId: string;
  joinedAt?: Date | null;
  lastActiveAt?: Date | null;
}

export interface OrganizationContext extends OrganizationSummary {
  subdomain: string;
  features: OrganizationFeatureFlags;
  security: OrganizationSecuritySettings;
  branding: OrganizationBranding;
  compliance: OrganizationComplianceSettings;
}

export interface OrganizationProfile {
  id: string;
  name: string;
  region: OrganizationRegion;
  plan: OrganizationPlan;
  status: OrganizationStatus;
  compliance: OrganizationComplianceSettings;
}

export interface CreateOrganizationOptions {
  name?: string;
  domain?: string | null;
  plan?: OrganizationPlan;
  region?: OrganizationRegion;
}

export interface InviteMemberInput {
  organizationId: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  invitedBy: string;
}

export interface RemoveMemberInput {
  organizationId: string;
  memberId: string;
  requestedBy: string;
}

export interface UpdateMemberRoleInput {
  organizationId: string;
  memberId: string;
  role: OrgRole;
  requestedBy: string;
}

export interface RemoveRoleAssignmentInput {
  organizationId: string;
  memberId: string;
  requestedBy: string;
  fallbackRole?: OrgRole;
}

export interface OrganizationRoleAssignmentSummary {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgRole;
  grantedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
  userEmail: string;
  userName?: string | null;
  membershipStatus?: string | null;
}

export class OrganizationService {
  private readonly PLAN_LIMITS: Record<OrganizationPlan, OrganizationLimits> = {
    starter: {
      maxWorkflows: 25,
      maxExecutions: 5000,
      maxUsers: 5,
      maxStorage: 5 * 1024,
      maxConcurrentExecutions: 2,
      maxExecutionsPerMinute: 60,
    },
    professional: {
      maxWorkflows: 100,
      maxExecutions: 50000,
      maxUsers: 25,
      maxStorage: 25 * 1024,
      maxConcurrentExecutions: 10,
      maxExecutionsPerMinute: 300,
    },
    enterprise: {
      maxWorkflows: 500,
      maxExecutions: 250000,
      maxUsers: 250,
      maxStorage: 100 * 1024,
      maxConcurrentExecutions: 25,
      maxExecutionsPerMinute: 1200,
    },
    enterprise_plus: {
      maxWorkflows: 1000,
      maxExecutions: 1000000,
      maxUsers: 1000,
      maxStorage: 500 * 1024,
      maxConcurrentExecutions: 50,
      maxExecutionsPerMinute: 3000,
    },
  };

  private readonly PLAN_FEATURES: Record<OrganizationPlan, OrganizationFeatureFlags> = {
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
      dedicatedInfrastructure: false,
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

  private readonly DEFAULT_SECURITY: OrganizationSecuritySettings = {
    ipWhitelist: [],
    allowedDomains: [],
    allowedIpRanges: [],
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

  private readonly DEFAULT_COMPLIANCE: OrganizationComplianceSettings = {
    gdprEnabled: true,
    hipaaCompliant: false,
    soc2Type2: false,
    dataResidency: 'us',
    retentionPolicyDays: 2555,
  };

  private readonly DEFAULT_REGION: OrganizationRegion = this.normalizeRegion(
    process.env.DEFAULT_ORGANIZATION_REGION ?? this.DEFAULT_COMPLIANCE.dataResidency
  );

  private readonly regionCache = new Map<string, { region: OrganizationRegion; expiresAt: number }>();
  private readonly REGION_CACHE_TTL_MS = 5 * 60 * 1000;

  private normalizeSecuritySettings(
    security?: OrganizationSecuritySettings | null
  ): OrganizationSecuritySettings {
    const base = this.DEFAULT_SECURITY;
    const input = security ?? ({} as OrganizationSecuritySettings);

    const normalizeList = (values: unknown): string[] => {
      if (!Array.isArray(values)) {
        return [];
      }
      return Array.from(
        new Set(
          values
            .map((value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim()))
            .filter((value) => value.length > 0)
            .map((value) => value.toLowerCase())
        )
      );
    };

    return {
      ...base,
      ...input,
      ipWhitelist: Array.isArray(input.ipWhitelist) ? input.ipWhitelist : base.ipWhitelist,
      allowedDomains: normalizeList((input as any).allowedDomains ?? base.allowedDomains),
      allowedIpRanges: normalizeList((input as any).allowedIpRanges ?? base.allowedIpRanges),
      passwordPolicy: {
        ...base.passwordPolicy,
        ...(input?.passwordPolicy ?? {}),
      },
    };
  }

  private sanitizeAllowlistInput(values: unknown): string[] {
    if (!Array.isArray(values)) {
      return [];
    }
    return Array.from(
      new Set(
        values
          .map((value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim()))
          .filter((value) => value.length > 0)
          .map((value) => value.toLowerCase())
      )
    );
  }

  private normalizeRegion(region?: string | null): OrganizationRegion {
    if (typeof region === 'string') {
      const trimmed = region.trim();
      if (trimmed.length > 0) {
        return trimmed.toLowerCase() as OrganizationRegion;
      }
    }
    return this.DEFAULT_REGION;
  }

  public getDefaultRegion(): OrganizationRegion {
    return this.DEFAULT_REGION;
  }

  public async getOrganizationRegion(organizationId: string): Promise<OrganizationRegion> {
    const cached = this.regionCache.get(organizationId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.region;
    }

    if (!db) {
      return this.DEFAULT_REGION;
    }

    const [row] = await db
      .select({ region: organizations.region })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const resolved = this.normalizeRegion(row?.region);
    this.regionCache.set(organizationId, {
      region: resolved,
      expiresAt: Date.now() + this.REGION_CACHE_TTL_MS,
    });

    return resolved;
  }

  public async getOrganizationProfile(organizationId: string): Promise<OrganizationProfile | null> {
    if (!db) {
      return null;
    }

    const [row] = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        region: organizations.region,
        plan: organizations.plan,
        status: organizations.status,
        compliance: organizations.compliance,
      })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!row) {
      return null;
    }

    const normalizedRegion = this.normalizeRegion(row.region);
    this.regionCache.set(organizationId, {
      region: normalizedRegion,
      expiresAt: Date.now() + this.REGION_CACHE_TTL_MS,
    });

    return {
      id: row.id,
      name: row.name,
      region: normalizedRegion,
      plan: row.plan as OrganizationPlan,
      status: row.status as OrganizationStatus,
      compliance: row.compliance as OrganizationComplianceSettings,
    };
  }

  public async createOrganizationForUser(
    user: { id: string; email: string; name?: string | null },
    options: CreateOrganizationOptions = {}
  ): Promise<OrganizationContext> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    const plan: OrganizationPlan = options.plan ?? 'starter';
    const limits = this.PLAN_LIMITS[plan];
    const features = this.PLAN_FEATURES[plan];
    const region = this.normalizeRegion(options.region ?? this.DEFAULT_REGION);

    const now = new Date();
    const domain = options.domain ?? user.email.split('@')[1] ?? null;
    const name = options.name ?? (user.name || user.email.split('@')[0] || 'Workspace');

    const billingPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [organization] = await db
      .insert(organizations)
      .values({
        name,
        domain,
        subdomain: this.generateSubdomain(name),
        region,
        plan,
        status: 'trial',
        trialEndsAt: billingPeriodEnd,
        billing: {
          customerId: '',
          subscriptionId: '',
          currentPeriodStart: now.toISOString(),
          currentPeriodEnd: billingPeriodEnd.toISOString(),
          usage: {
            workflowExecutions: 0,
            apiCalls: 0,
            storageUsed: 0,
            usersActive: 1,
          },
          limits,
        },
        features,
        security: this.normalizeSecuritySettings(this.DEFAULT_SECURITY),
        branding: {
          companyName: name,
          supportEmail: domain ? `support@${domain}` : 'support@example.com',
        },
        compliance: {
          ...this.DEFAULT_COMPLIANCE,
          dataResidency: region,
        },
      })
      .returning();

    this.regionCache.set(organization.id, {
      region,
      expiresAt: Date.now() + this.REGION_CACHE_TTL_MS,
    });

    const [membership] = await db
      .insert(organizationMembers)
      .values({
        organizationId: organization.id,
        userId: user.id,
        email: user.email.toLowerCase(),
        role: 'owner',
        status: 'active',
        permissions: {
          canCreateWorkflows: true,
          canEditWorkflows: true,
          canDeleteWorkflows: true,
          canManageUsers: true,
          canViewAnalytics: true,
          canManageBilling: true,
          canAccessApi: true,
        },
        isDefault: true,
        invitedBy: user.id,
        invitedAt: now,
        joinedAt: now,
        lastActiveAt: now,
      })
      .returning();

    await db
      .insert(organizationRoleAssignments)
      .values({
        organizationId: organization.id,
        userId: user.id,
        role: 'owner',
        grantedBy: user.id,
      })
      .onConflictDoUpdate({
        target: [organizationRoleAssignments.organizationId, organizationRoleAssignments.userId],
        set: {
          role: 'owner',
          grantedBy: user.id,
          updatedAt: now,
        },
      });

    const normalizedOrgId = organization.id.replace(/-/g, '');
    await db.insert(tenantIsolations).values({
      organizationId: organization.id,
      dataNamespace: `org_${normalizedOrgId}`,
      storagePrefix: `${region}/org_${organization.id}`,
      cachePrefix: `${region}:org:${organization.id}`,
      logPrefix: `${region}.org.${organization.id}`,
      metricsPrefix: `${region}.org.${organization.id}`,
    });

    await db.insert(organizationQuotas).values({
      organizationId: organization.id,
      billingPeriodStart: now,
      billingPeriodEnd,
      limits,
      usage: {
        workflowExecutions: 0,
        apiCalls: 0,
        storageUsed: 0,
        usersActive: 1,
        concurrentExecutions: 0,
        executionsInCurrentWindow: 0,
      },
    });

    return {
      id: organization.id,
      name: organization.name,
      domain: organization.domain,
      region,
      plan: organization.plan as OrganizationPlan,
      status: organization.status as OrganizationStatus,
      role: membership.role,
      isDefault: membership.isDefault,
      limits,
      usage: {
        workflowExecutions: 0,
        apiCalls: 0,
        storageUsed: 0,
        usersActive: 1,
        concurrentExecutions: 0,
        executionsInCurrentWindow: 0,
      },
      membershipId: membership.id,
      joinedAt: membership.joinedAt,
      lastActiveAt: membership.lastActiveAt,
      subdomain: organization.subdomain,
      features,
      security: this.normalizeSecuritySettings(this.DEFAULT_SECURITY),
      branding: organization.branding,
      compliance: organization.compliance,
    };
  }

  public async listUserOrganizations(userId: string): Promise<OrganizationContext[]> {
    if (!db) {
      return [];
    }

    const rows = await db
      .select({
        organization: organizations,
        membership: organizationMembers,
        quota: organizationQuotas,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
      .leftJoin(organizationQuotas, eq(organizationQuotas.organizationId, organizations.id))
      .where(eq(organizationMembers.userId, userId));

    return rows.map((row) => this.mapRowToContext(row.organization, row.membership, row.quota));
  }

  public async getActiveMembership(
    userId: string,
    requestedOrganizationId?: string
  ): Promise<OrganizationContext | null> {
    const organizations = await this.listUserOrganizations(userId);
    if (organizations.length === 0) {
      return null;
    }

    if (requestedOrganizationId) {
      const requested = organizations.find((org) => org.id === requestedOrganizationId);
      if (requested) {
        return requested;
      }
    }

    const defaultOrg = organizations.find((org) => org.isDefault);
    return defaultOrg ?? organizations[0];
  }

  public async setActiveOrganization(userId: string, organizationId: string): Promise<OrganizationContext | null> {
    if (!db) {
      return null;
    }

    const organization = await this.getActiveMembership(userId, organizationId);
    if (!organization) {
      return null;
    }

    const now = new Date();
    await db
      .update(organizationMembers)
      .set({ isDefault: false, updatedAt: now })
      .where(eq(organizationMembers.userId, userId));

    await db
      .update(organizationMembers)
      .set({ isDefault: true, status: 'active', lastActiveAt: now })
      .where(
        and(
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.organizationId, organizationId)
        )
      );

    return this.getActiveMembership(userId, organizationId);
  }

  public async inviteMember(input: InviteMemberInput) {
    if (!db) {
      throw new Error('Database connection not available');
    }

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [invite] = await db
      .insert(organizationInvites)
      .values({
        organizationId: input.organizationId,
        email: input.email.toLowerCase(),
        role: input.role,
        status: 'pending',
        token,
        invitedBy: input.invitedBy,
        expiresAt,
      })
      .returning();

    return invite;
  }

  public async removeMember(input: RemoveMemberInput) {
    if (!db) {
      throw new Error('Database connection not available');
    }

    const memberships = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, input.organizationId),
          eq(organizationMembers.userId, input.memberId)
        )
      );

    if (memberships.length === 0) {
      return false;
    }

    if (memberships[0].role === 'owner' && memberships[0].userId === input.requestedBy) {
      throw new Error('Owners cannot remove themselves from their active organization. Transfer ownership first.');
    }

    await db
      .delete(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, input.organizationId),
          eq(organizationMembers.userId, input.memberId)
        )
      );

    await db
      .delete(organizationRoleAssignments)
      .where(
        and(
          eq(organizationRoleAssignments.organizationId, input.organizationId),
          eq(organizationRoleAssignments.userId, input.memberId)
        )
      );

    return true;
  }

  public async listRoleAssignments(organizationId: string): Promise<OrganizationRoleAssignmentSummary[]> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    const rows = await db
      .select({
        assignment: organizationRoleAssignments,
        membership: organizationMembers,
        user: users,
      })
      .from(organizationRoleAssignments)
      .innerJoin(users, eq(organizationRoleAssignments.userId, users.id))
      .leftJoin(
        organizationMembers,
        and(
          eq(organizationMembers.organizationId, organizationRoleAssignments.organizationId),
          eq(organizationMembers.userId, organizationRoleAssignments.userId)
        )
      )
      .where(eq(organizationRoleAssignments.organizationId, organizationId));

    return rows.map(({ assignment, membership, user }) => ({
      id: assignment.id,
      organizationId: assignment.organizationId,
      userId: assignment.userId,
      role: assignment.role as OrgRole,
      grantedBy: assignment.grantedBy,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
      userEmail: user.email,
      userName: user.name,
      membershipStatus: membership?.status ?? null,
    }));
  }

  public async updateMemberRole(input: UpdateMemberRoleInput): Promise<OrganizationRoleAssignmentSummary> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    const membership = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, input.organizationId),
          eq(organizationMembers.userId, input.memberId)
        )
      );

    if (membership.length === 0) {
      throw new Error('Member not found in organization');
    }

    const now = new Date();

    const [assignment] = await db
      .insert(organizationRoleAssignments)
      .values({
        organizationId: input.organizationId,
        userId: input.memberId,
        role: input.role,
        grantedBy: input.requestedBy,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [organizationRoleAssignments.organizationId, organizationRoleAssignments.userId],
        set: {
          role: input.role,
          grantedBy: input.requestedBy,
          updatedAt: now,
        },
      })
      .returning();

    await db
      .update(organizationMembers)
      .set({ role: input.role, updatedAt: now })
      .where(
        and(
          eq(organizationMembers.organizationId, input.organizationId),
          eq(organizationMembers.userId, input.memberId)
        )
      );

    const [userRecord] = await db
      .select()
      .from(users)
      .where(eq(users.id, input.memberId));

    return {
      id: assignment.id,
      organizationId: assignment.organizationId,
      userId: assignment.userId,
      role: assignment.role as OrgRole,
      grantedBy: assignment.grantedBy,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
      userEmail: userRecord?.email ?? membership[0].email,
      userName: userRecord?.name,
      membershipStatus: membership[0]?.status ?? null,
    };
  }

  public async removeRoleAssignment(input: RemoveRoleAssignmentInput): Promise<boolean> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    const fallbackRole: OrgRole = input.fallbackRole ?? 'member';

    await db
      .delete(organizationRoleAssignments)
      .where(
        and(
          eq(organizationRoleAssignments.organizationId, input.organizationId),
          eq(organizationRoleAssignments.userId, input.memberId)
        )
      );

    const result = await db
      .update(organizationMembers)
      .set({ role: fallbackRole, updatedAt: new Date() })
      .where(
        and(
          eq(organizationMembers.organizationId, input.organizationId),
          eq(organizationMembers.userId, input.memberId)
        )
      )
      .returning();

    return result.length > 0;
  }

  public async getSecuritySettings(organizationId: string): Promise<OrganizationSecuritySettings> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    const [record] = await db
      .select({ security: organizations.security })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!record) {
      throw new Error('Organization not found');
    }

    return this.normalizeSecuritySettings(record.security as OrganizationSecuritySettings | null);
  }

  public async updateNetworkAllowlist(
    organizationId: string,
    updates: { allowedDomains?: string[]; allowedIpRanges?: string[] }
  ): Promise<OrganizationSecuritySettings> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    const current = await this.getSecuritySettings(organizationId);

    const next: OrganizationSecuritySettings = {
      ...current,
      allowedDomains:
        updates.allowedDomains !== undefined
          ? this.sanitizeAllowlistInput(updates.allowedDomains)
          : current.allowedDomains,
      allowedIpRanges:
        updates.allowedIpRanges !== undefined
          ? this.sanitizeAllowlistInput(updates.allowedIpRanges)
          : current.allowedIpRanges,
    };

    await db
      .update(organizations)
      .set({ security: next, updatedAt: new Date() })
      .where(eq(organizations.id, organizationId));

    return next;
  }

  public async recordUsage(
    organizationId: string,
    usage: Partial<OrganizationUsageMetrics>
  ): Promise<void> {
    if (!db) {
      return;
    }

    const [quota] = await db
      .select()
      .from(organizationQuotas)
      .where(eq(organizationQuotas.organizationId, organizationId))
      .limit(1);

    if (!quota) {
      return;
    }

    const currentUsage = this.normalizeUsage(quota.usage as OrganizationUsageMetrics | null);
    const nextUsage: OrganizationUsageMetrics = {
      ...currentUsage,
      workflowExecutions: currentUsage.workflowExecutions + (usage.workflowExecutions ?? 0),
      apiCalls: currentUsage.apiCalls + (usage.apiCalls ?? 0),
      storageUsed: currentUsage.storageUsed + (usage.storageUsed ?? 0),
      usersActive: Math.max(currentUsage.usersActive, usage.usersActive ?? currentUsage.usersActive),
      llmTokens: (currentUsage.llmTokens ?? 0) + (usage.llmTokens ?? 0),
      llmCostUSD: (currentUsage.llmCostUSD ?? 0) + (usage.llmCostUSD ?? 0),
    };

    await db
      .update(organizationQuotas)
      .set({ usage: nextUsage, updatedAt: new Date() })
      .where(eq(organizationQuotas.id, quota.id));
  }

  public getPlanLimits(plan: OrganizationPlan): OrganizationLimits {
    return this.PLAN_LIMITS[plan];
  }

  public getPlanFeatures(plan: OrganizationPlan): OrganizationFeatureFlags {
    return this.PLAN_FEATURES[plan];
  }

  public async getExecutionQuotaProfile(
    organizationId: string
  ): Promise<{
    limits: OrganizationLimits;
    usage: OrganizationUsageMetrics;
    plan: OrganizationPlan;
    region: OrganizationRegion;
  }> {
    if (!db) {
      return {
        limits: this.PLAN_LIMITS.starter,
        usage: this.normalizeUsage(null),
        plan: 'starter',
        region: this.DEFAULT_REGION,
      };
    }

    const [row] = await db
      .select({ organization: organizations, quota: organizationQuotas })
      .from(organizations)
      .leftJoin(organizationQuotas, eq(organizationQuotas.organizationId, organizations.id))
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!row) {
      throw new Error(`Organization ${organizationId} not found`);
    }

    const plan = row.organization.plan as OrganizationPlan;
    return {
      plan,
      limits: this.mergeLimitsWithDefaults(plan, row.quota?.limits as Partial<OrganizationLimits> | null),
      usage: this.normalizeUsage(row.quota?.usage as OrganizationUsageMetrics | null),
      region: this.normalizeRegion(row.organization.region),
    };
  }

  public async updateExecutionLimits(
    organizationId: string,
    updates: Partial<Pick<OrganizationLimits, 'maxConcurrentExecutions' | 'maxExecutionsPerMinute' | 'maxExecutions'>>
  ): Promise<OrganizationLimits> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    const profile = await this.getExecutionQuotaProfile(organizationId);
    const merged = this.mergeLimitsWithDefaults(profile.plan, {
      ...profile.limits,
      ...updates,
    });

    await db
      .update(organizationQuotas)
      .set({ limits: merged, updatedAt: new Date() })
      .where(eq(organizationQuotas.organizationId, organizationId));

    return merged;
  }

  public async updateExecutionUsageSnapshot(
    organizationId: string,
    snapshot: Pick<OrganizationUsageMetrics, 'concurrentExecutions' | 'executionsInCurrentWindow'>
  ): Promise<void> {
    if (!db) {
      return;
    }

    const [quota] = await db
      .select()
      .from(organizationQuotas)
      .where(eq(organizationQuotas.organizationId, organizationId))
      .limit(1);

    if (!quota) {
      return;
    }

    const usage = this.normalizeUsage(quota.usage as OrganizationUsageMetrics | null);
    const nextUsage: OrganizationUsageMetrics = {
      ...usage,
      concurrentExecutions: Math.max(0, snapshot.concurrentExecutions ?? 0),
      executionsInCurrentWindow: Math.max(0, snapshot.executionsInCurrentWindow ?? 0),
    };

    await db
      .update(organizationQuotas)
      .set({ usage: nextUsage, updatedAt: new Date() })
      .where(eq(organizationQuotas.id, quota.id));
  }

  private generateSubdomain(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 20);

    return `${base || 'workspace'}-${Math.random().toString(36).substring(2, 8)}`;
  }

  private mapRowToContext(
    organization: typeof organizations.$inferSelect,
    membership: typeof organizationMembers.$inferSelect,
    quota?: typeof organizationQuotas.$inferSelect
  ): OrganizationContext {
    const limits = this.mergeLimitsWithDefaults(organization.plan as OrganizationPlan, quota?.limits);
    const usage = this.normalizeUsage(quota?.usage as OrganizationUsageMetrics | null);

    return {
      id: organization.id,
      name: organization.name,
      domain: organization.domain,
      region: this.normalizeRegion(organization.region),
      plan: organization.plan as OrganizationPlan,
      status: organization.status as OrganizationStatus,
      role: membership.role,
      isDefault: membership.isDefault,
      limits,
      usage,
      membershipId: membership.id,
      joinedAt: membership.joinedAt,
      lastActiveAt: membership.lastActiveAt,
      subdomain: organization.subdomain,
      features: organization.features as OrganizationFeatureFlags,
      security: this.normalizeSecuritySettings(organization.security as OrganizationSecuritySettings | null),
      branding: organization.branding as OrganizationBranding,
      compliance: organization.compliance as OrganizationComplianceSettings,
    };
  }

  private mergeLimitsWithDefaults(
    plan: OrganizationPlan,
    limits?: Partial<OrganizationLimits> | null
  ): OrganizationLimits {
    const defaults = this.PLAN_LIMITS[plan];
    const normalized = limits ?? {};
    return {
      ...defaults,
      ...normalized,
      maxConcurrentExecutions:
        Math.max(1, normalized?.maxConcurrentExecutions ?? defaults.maxConcurrentExecutions),
      maxExecutionsPerMinute:
        Math.max(1, normalized?.maxExecutionsPerMinute ?? defaults.maxExecutionsPerMinute),
    };
  }

  private normalizeUsage(usage?: OrganizationUsageMetrics | null): OrganizationUsageMetrics {
    const base: OrganizationUsageMetrics = {
      workflowExecutions: 0,
      apiCalls: 0,
      storageUsed: 0,
      usersActive: 0,
      llmTokens: 0,
      llmCostUSD: 0,
      concurrentExecutions: 0,
      executionsInCurrentWindow: 0,
    };

    if (!usage) {
      return base;
    }

    return {
      ...base,
      ...usage,
      concurrentExecutions: Math.max(0, usage.concurrentExecutions ?? base.concurrentExecutions ?? 0),
      executionsInCurrentWindow: Math.max(
        0,
        usage.executionsInCurrentWindow ?? base.executionsInCurrentWindow ?? 0
      ),
    };
  }
}

export const organizationService = new OrganizationService();

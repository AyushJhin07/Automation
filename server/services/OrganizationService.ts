import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import {
  db,
  organizations,
  organizationMembers,
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
} from '../database/schema';

export interface OrganizationSummary {
  id: string;
  name: string;
  domain: string | null;
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

export interface CreateOrganizationOptions {
  name?: string;
  domain?: string | null;
  plan?: OrganizationPlan;
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

export class OrganizationService {
  private readonly PLAN_LIMITS: Record<OrganizationPlan, OrganizationLimits> = {
    starter: { maxWorkflows: 25, maxExecutions: 5000, maxUsers: 5, maxStorage: 5 * 1024 },
    professional: { maxWorkflows: 100, maxExecutions: 50000, maxUsers: 25, maxStorage: 25 * 1024 },
    enterprise: { maxWorkflows: 500, maxExecutions: 250000, maxUsers: 250, maxStorage: 100 * 1024 },
    enterprise_plus: { maxWorkflows: 1000, maxExecutions: 1000000, maxUsers: 1000, maxStorage: 500 * 1024 },
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
        security: this.DEFAULT_SECURITY,
        branding: {
          companyName: name,
          supportEmail: domain ? `support@${domain}` : 'support@example.com',
        },
        compliance: this.DEFAULT_COMPLIANCE,
      })
      .returning();

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

    await db.insert(tenantIsolations).values({
      organizationId: organization.id,
      dataNamespace: `org_${organization.id.replace(/-/g, '')}`,
      storagePrefix: `org_${organization.id}`,
      cachePrefix: `org:${organization.id}`,
      logPrefix: `org.${organization.id}`,
      metricsPrefix: `org.${organization.id}`,
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
      },
    });

    return {
      id: organization.id,
      name: organization.name,
      domain: organization.domain,
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
      },
      membershipId: membership.id,
      joinedAt: membership.joinedAt,
      lastActiveAt: membership.lastActiveAt,
      subdomain: organization.subdomain,
      features,
      security: this.DEFAULT_SECURITY,
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

    return true;
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

    const nextUsage: OrganizationUsageMetrics = {
      workflowExecutions: quota.usage.workflowExecutions + (usage.workflowExecutions ?? 0),
      apiCalls: quota.usage.apiCalls + (usage.apiCalls ?? 0),
      storageUsed: quota.usage.storageUsed + (usage.storageUsed ?? 0),
      usersActive: Math.max(quota.usage.usersActive, usage.usersActive ?? quota.usage.usersActive),
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
    const limits = quota?.limits ?? this.PLAN_LIMITS[organization.plan as OrganizationPlan];
    const usage = quota?.usage ?? {
      workflowExecutions: 0,
      apiCalls: 0,
      storageUsed: 0,
      usersActive: 0,
    };

    return {
      id: organization.id,
      name: organization.name,
      domain: organization.domain,
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
      security: organization.security as OrganizationSecuritySettings,
      branding: organization.branding as OrganizationBranding,
      compliance: organization.compliance as OrganizationComplianceSettings,
    };
  }
}

export const organizationService = new OrganizationService();

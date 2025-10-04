import IORedis from 'ioredis';

import { connectorRegistry } from '../ConnectorRegistry.js';
import { getRedisConnectionOptions } from '../queue/index.js';
import type { OrganizationLimits } from '../database/schema.js';
import type { NodeGraph, GraphNode } from '../../shared/nodeGraphSchema';
import { organizationService } from './OrganizationService.js';
import { getErrorMessage } from '../types/common.js';
import { updateConnectorConcurrencyMetric } from '../observability/index.js';

const DEFAULT_CONNECTOR_KEY = 'default';

type ConnectorConcurrencyScope = 'global' | 'organization';

type ConnectorCapacityViolation = {
  connectorId: string;
  scope: ConnectorConcurrencyScope;
  limit: number;
  active: number;
};

type ConnectorCapacityCheck = {
  allowed: true;
  connectors: string[];
} | {
  allowed: false;
  connectors: string[];
  violation: ConnectorCapacityViolation;
};

interface RegisterExecutionOptions {
  executionId: string;
  organizationId: string;
  connectors: string[];
}

interface CapacityCheckOptions {
  organizationId: string;
  connectors: string[];
  planLimits?: OrganizationLimits;
}

interface ConnectorLimits {
  globalLimit?: number;
  perOrganizationLimit?: number;
}

export class ConnectorConcurrencyExceededError extends Error {
  public readonly connectorId: string;
  public readonly scope: ConnectorConcurrencyScope;
  public readonly limit: number;
  public readonly active: number;
  public readonly organizationId: string;
  public readonly executionId?: string;

  constructor(params: { connectorId: string; scope: ConnectorConcurrencyScope; limit: number; active: number; organizationId: string; executionId?: string }) {
    const message = params.scope === 'global'
      ? `Connector ${params.connectorId} is at global capacity (${params.active}/${params.limit})`
      : `Organization ${params.organizationId} is at capacity for connector ${params.connectorId} (${params.active}/${params.limit})`;
    super(message);
    this.name = 'ConnectorConcurrencyExceededError';
    this.connectorId = params.connectorId;
    this.scope = params.scope;
    this.limit = params.limit;
    this.active = params.active;
    this.organizationId = params.organizationId;
    this.executionId = params.executionId;
  }
}

class ConnectorConcurrencyService {
  private static instance: ConnectorConcurrencyService;

  private redis: IORedis | null = null;
  private connecting: Promise<IORedis | null> | null = null;
  private readonly memoryCounts = new Map<string, number>();
  private readonly executionAllocations = new Map<string, { organizationId: string; connectors: string[] }>();

  private constructor() {}

  public static getInstance(): ConnectorConcurrencyService {
    if (!ConnectorConcurrencyService.instance) {
      ConnectorConcurrencyService.instance = new ConnectorConcurrencyService();
    }
    return ConnectorConcurrencyService.instance;
  }

  public extractConnectorsFromGraph(graph: Pick<NodeGraph, 'nodes'> | null | undefined): string[] {
    if (!graph || !Array.isArray(graph.nodes)) {
      return [];
    }

    const unique = new Set<string>();
    for (const node of graph.nodes as GraphNode[]) {
      const connectorId = this.resolveConnectorId(node);
      if (connectorId) {
        unique.add(connectorId);
      }
    }
    return Array.from(unique);
  }

  public async checkCapacity(options: CapacityCheckOptions): Promise<ConnectorCapacityCheck> {
    const connectors = this.normalizeConnectors(options.connectors);
    if (connectors.length === 0) {
      return { allowed: true, connectors };
    }

    for (const connectorId of connectors) {
      const limits = await this.resolveLimits(connectorId, options.organizationId, options.planLimits);
      const counts = await this.getCounts(connectorId, options.organizationId);

      if (typeof limits.globalLimit === 'number' && limits.globalLimit >= 0 && counts.global >= limits.globalLimit) {
        return {
          allowed: false,
          connectors,
          violation: {
            connectorId,
            scope: 'global',
            limit: limits.globalLimit,
            active: counts.global,
          },
        };
      }

      if (
        typeof limits.perOrganizationLimit === 'number' &&
        limits.perOrganizationLimit >= 0 &&
        counts.organization >= limits.perOrganizationLimit
      ) {
        return {
          allowed: false,
          connectors,
          violation: {
            connectorId,
            scope: 'organization',
            limit: limits.perOrganizationLimit,
            active: counts.organization,
          },
        };
      }
    }

    return { allowed: true, connectors };
  }

  public async registerExecution(options: RegisterExecutionOptions): Promise<void> {
    const connectors = this.normalizeConnectors(options.connectors);
    if (connectors.length === 0) {
      return;
    }

    for (const connectorId of connectors) {
      await this.adjustCounts(connectorId, options.organizationId, 1);
    }

    this.executionAllocations.set(options.executionId, {
      organizationId: options.organizationId,
      connectors,
    });
  }

  public async releaseExecution(executionId: string): Promise<void> {
    const allocation = this.executionAllocations.get(executionId);
    if (!allocation) {
      return;
    }

    const { organizationId, connectors } = allocation;
    for (const connectorId of connectors) {
      await this.adjustCounts(connectorId, organizationId, -1);
    }

    this.executionAllocations.delete(executionId);
  }

  public async forceRelease(options: RegisterExecutionOptions): Promise<void> {
    const connectors = this.normalizeConnectors(options.connectors);
    if (connectors.length === 0) {
      return;
    }

    for (const connectorId of connectors) {
      await this.adjustCounts(connectorId, options.organizationId, -1);
    }
  }

  public async resolveLimits(
    connectorId: string,
    organizationId: string,
    planLimits?: OrganizationLimits,
  ): Promise<ConnectorLimits> {
    const normalized = this.normalizeConnectorId(connectorId);
    const registryEntry = connectorRegistry.getConnector(normalized);
    const concurrency = registryEntry?.manifest?.concurrency;

    let perOrganizationLimit = this.resolvePlanLimit(normalized, planLimits);
    if (perOrganizationLimit === undefined) {
      perOrganizationLimit = concurrency?.perOrganization;
    }

    const globalLimit = concurrency?.global;

    return { globalLimit, perOrganizationLimit };
  }

  public async refreshPlanLimits(organizationId: string): Promise<OrganizationLimits> {
    const profile = await organizationService.getExecutionQuotaProfile(organizationId);
    return profile.limits;
  }

  private resolvePlanLimit(connectorId: string, planLimits?: OrganizationLimits): number | undefined {
    if (!planLimits?.connectorConcurrency) {
      return undefined;
    }

    const specific = planLimits.connectorConcurrency[connectorId];
    if (typeof specific === 'number') {
      return specific;
    }

    const fallback = planLimits.connectorConcurrency[DEFAULT_CONNECTOR_KEY];
    if (typeof fallback === 'number') {
      return fallback;
    }

    return undefined;
  }

  private async adjustCounts(connectorId: string, organizationId: string, delta: number): Promise<void> {
    const normalized = this.normalizeConnectorId(connectorId);
    const globalKey = this.buildGlobalKey(normalized);
    const orgKey = this.buildOrganizationKey(normalized, organizationId);

    const globalValue = await this.adjustSingleCounter(globalKey, delta);
    const orgValue = await this.adjustSingleCounter(orgKey, delta);

    updateConnectorConcurrencyMetric({
      connectorId: normalized,
      scope: 'global',
      organizationId: null,
      active: globalValue,
    });

    updateConnectorConcurrencyMetric({
      connectorId: normalized,
      scope: 'organization',
      organizationId,
      active: orgValue,
    });
  }

  private async adjustSingleCounter(key: string, delta: number): Promise<number> {
    const client = await this.getRedisClient();
    let nextValue: number;

    if (client) {
      try {
        nextValue = await client.incrby(key, delta);
      } catch (error) {
        console.warn('[ConnectorConcurrencyService] Redis counter adjustment failed:', getErrorMessage(error));
        nextValue = this.adjustMemoryCounter(key, delta);
      }
    } else {
      nextValue = this.adjustMemoryCounter(key, delta);
    }

    if (nextValue < 0) {
      nextValue = 0;
      if (client) {
        await client.set(key, '0');
      } else {
        this.memoryCounts.delete(key);
      }
    } else if (!client) {
      if (nextValue === 0) {
        this.memoryCounts.delete(key);
      } else {
        this.memoryCounts.set(key, nextValue);
      }
    }

    return nextValue;
  }

  private adjustMemoryCounter(key: string, delta: number): number {
    const current = this.memoryCounts.get(key) ?? 0;
    const next = current + delta;
    if (next <= 0) {
      this.memoryCounts.delete(key);
      return Math.max(0, next);
    }
    this.memoryCounts.set(key, next);
    return next;
  }

  private async getCounts(connectorId: string, organizationId: string): Promise<{ global: number; organization: number }> {
    const normalized = this.normalizeConnectorId(connectorId);
    const globalKey = this.buildGlobalKey(normalized);
    const orgKey = this.buildOrganizationKey(normalized, organizationId);
    const client = await this.getRedisClient();

    if (client) {
      try {
        const [globalRaw, orgRaw] = await client.mget(globalKey, orgKey);
        return {
          global: globalRaw ? Number.parseInt(globalRaw, 10) || 0 : 0,
          organization: orgRaw ? Number.parseInt(orgRaw, 10) || 0 : 0,
        };
      } catch (error) {
        console.warn('[ConnectorConcurrencyService] Redis read failed, using memory counters:', getErrorMessage(error));
      }
    }

    return {
      global: this.memoryCounts.get(globalKey) ?? 0,
      organization: this.memoryCounts.get(orgKey) ?? 0,
    };
  }

  private buildGlobalKey(connectorId: string): string {
    return `connector:concurrency:${connectorId}`;
  }

  private buildOrganizationKey(connectorId: string, organizationId: string): string {
    return `connector:concurrency:${connectorId}:org:${organizationId}`;
  }

  private normalizeConnectors(connectors: string[]): string[] {
    const unique = new Set<string>();
    for (const connector of connectors) {
      const normalized = this.normalizeConnectorId(connector);
      if (normalized) {
        unique.add(normalized);
      }
    }
    return Array.from(unique);
  }

  private normalizeConnectorId(value: string): string {
    return value?.toLowerCase().trim();
  }

  private resolveConnectorId(node: GraphNode): string | null {
    const data = (node as Record<string, any>)?.data ?? {};
    const metadata = (node as Record<string, any>)?.metadata ?? {};
    const candidates = [
      data.connectorId,
      metadata.connectorId,
      data.provider,
      data.appKey,
      data.app,
      node.app,
      node.connectionId,
      data.connectionId,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return this.normalizeConnectorId(candidate);
      }
    }

    if (typeof node.type === 'string') {
      const parts = node.type.split('.');
      if (parts.length >= 2) {
        const [category, connector] = parts;
        if (category === 'action' || category === 'trigger') {
          return this.normalizeConnectorId(connector);
        }
      }
    }

    return null;
  }

  private async getRedisClient(): Promise<IORedis | null> {
    if (this.redis) {
      return this.redis;
    }

    if (!this.connecting) {
      this.connecting = this.connectRedis();
    }

    this.redis = await this.connecting;
    return this.redis;
  }

  private async connectRedis(): Promise<IORedis | null> {
    try {
      const options = getRedisConnectionOptions();
      const client = new IORedis(options);

      client.on('error', (error) => {
        console.warn('[ConnectorConcurrencyService] Redis error:', getErrorMessage(error));
      });

      client.on('end', () => {
        console.warn('[ConnectorConcurrencyService] Redis connection closed. Falling back to in-memory counters.');
        this.redis = null;
        this.connecting = null;
      });

      await new Promise<void>((resolve, reject) => {
        client.once('ready', () => resolve());
        client.once('error', (error) => reject(error));
      });

      console.log('[ConnectorConcurrencyService] Connected to Redis for connector concurrency counters');
      return client;
    } catch (error) {
      console.warn(
        '[ConnectorConcurrencyService] Unable to establish Redis connection. Using in-memory counters:',
        getErrorMessage(error),
      );
      return null;
    }
  }
}

export const connectorConcurrencyService = ConnectorConcurrencyService.getInstance();

export type { ConnectorCapacityCheck, ConnectorCapacityViolation, ConnectorConcurrencyScope, ConnectorLimits };

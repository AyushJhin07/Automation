import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { APICredentials, APIResponse } from '../integrations/BaseAPIClient';
import { getErrorMessage } from '../types/common';

export interface ConnectorSimulatorOptions {
  fixturesDir?: string;
  enabled?: boolean;
  strict?: boolean;
}

interface ConnectorFixtureDefaults {
  credentials?: APICredentials;
  additionalConfig?: Record<string, any>;
  connectionId?: string;
  notes?: string;
}

interface ConnectorFixtureRequest {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: any;
}

interface ConnectorFixtureResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: any;
}

interface ConnectorFixtureFile {
  description?: string;
  notes?: string;
  type?: 'action' | 'trigger';
  metadata?: { kind?: 'action' | 'trigger'; [key: string]: any };
  defaults?: ConnectorFixtureDefaults;
  params?: Record<string, any>;
  parameters?: Record<string, any>;
  triggerParams?: Record<string, any>;
  request?: ConnectorFixtureRequest;
  response?: ConnectorFixtureResponse;
  result?: {
    success?: boolean;
    data?: any;
    error?: string;
    status?: number;
  };
}

type ConnectorSimulatorScenario = ConnectorSimulatorSmokePlan['actions'][number];

interface ConnectorPlanEntry {
  credentials?: APICredentials;
  additionalConfig?: Record<string, any>;
  connectionId?: string;
  notes: string[];
  actions: ConnectorSimulatorScenario[];
  triggers: ConnectorSimulatorScenario[];
}

export interface SimulatorIntegrationConfig {
  appName: string;
  credentials: APICredentials;
  additionalConfig?: Record<string, any>;
  connectionId?: string;
}

export interface SimulatorFunctionExecutionParams {
  appName: string;
  appKey: string;
  functionId: string;
  parameters: Record<string, any>;
}

export interface SimulatedExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  fixture?: ConnectorFixtureFile;
}

export interface ConnectorSimulatorSmokePlan {
  credentials?: APICredentials;
  additionalConfig?: Record<string, any>;
  connectionId?: string;
  actions: Array<{
    id: string;
    parameters?: Record<string, any>;
    expectSuccess?: boolean;
    connectionId?: string;
  }>;
  triggers?: Array<{
    id: string;
    parameters?: Record<string, any>;
    expectSuccess?: boolean;
    connectionId?: string;
  }>;
  notes?: string;
}

export interface ConnectorContractDefinitionInput {
  appId: string;
  actions?: Array<{ id: string } | string>;
  triggers?: Array<{ id: string } | string>;
}

export interface ConnectorContractScenarioResult {
  id: string;
  type: 'action' | 'trigger';
  passed: boolean;
  errors: string[];
  warnings: string[];
  hasFixture: boolean;
}

export interface ConnectorContractTestResult {
  appId: string;
  passed: boolean;
  scenarios: ConnectorContractScenarioResult[];
  missingFixtures: string[];
}

const DEFAULT_FIXTURES_DIR = path.resolve(process.cwd(), 'server', 'testing', 'fixtures');

export class ConnectorSimulator {
  private readonly fixturesDir: string;
  private enabled: boolean;
  private readonly strict: boolean;
  private fixtureCache = new Map<string, ConnectorFixtureFile>();
  private planCache = new Map<string, ConnectorPlanEntry>();
  private loadPromise?: Promise<void>;

  constructor(options: ConnectorSimulatorOptions = {}) {
    this.fixturesDir = options.fixturesDir ? path.resolve(options.fixturesDir) : DEFAULT_FIXTURES_DIR;
    this.enabled = options.enabled ?? false;
    this.strict = options.strict ?? false;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public getFixturesDir(): string {
    return this.fixturesDir;
  }

  public async initializeIntegration(appKey: string, config: SimulatorIntegrationConfig): Promise<APIResponse<any> | null> {
    if (!this.enabled) {
      return null;
    }

    await this.ensureFixturesLoaded();
    const fixture = this.fixtureCache.get(this.getCacheKey(appKey, '__connection__'));

    if (fixture?.result) {
      return {
        success: fixture.result.success ?? true,
        data: fixture.result.data ?? {
          appName: config.appName,
          status: 'connected',
          simulator: true
        },
        error: fixture.result.error
      };
    }

    return {
      success: true,
      data: {
        appName: config.appName,
        status: 'connected',
        simulator: true
      }
    };
  }

  public async executeFunction(params: SimulatorFunctionExecutionParams): Promise<SimulatedExecutionResult | null> {
    if (!this.enabled) {
      return null;
    }

    await this.ensureFixturesLoaded();
    const fixture = this.fixtureCache.get(this.getCacheKey(params.appKey, params.functionId));

    if (!fixture) {
      if (this.strict) {
        return {
          success: false,
          error: `Missing connector simulator fixture for ${params.appKey}.${params.functionId}`
        };
      }
      return null;
    }

    return {
      success: fixture.result?.success ?? true,
      data: fixture.result?.data ?? fixture.response?.body ?? {
        app: params.appKey,
        functionId: params.functionId,
        simulator: true
      },
      error: fixture.result?.error,
      fixture
    };
  }

  public async getSmokePlan(appId: string): Promise<ConnectorSimulatorSmokePlan | null> {
    await this.ensureFixturesLoaded();
    const entry = this.planCache.get(appId.toLowerCase());
    if (!entry) {
      return null;
    }

    const notes = entry.notes.filter(Boolean);

    return {
      credentials: entry.credentials,
      additionalConfig: entry.additionalConfig,
      connectionId: entry.connectionId,
      actions: this.dedupeScenarios(entry.actions),
      triggers: entry.triggers.length ? this.dedupeScenarios(entry.triggers) : undefined,
      notes: notes.length ? notes.join(' '): undefined
    };
  }

  public async runContractSuite(
    definitions: ConnectorContractDefinitionInput[],
    options: { requireFixtures?: boolean } = {}
  ): Promise<ConnectorContractTestResult[]> {
    const results: ConnectorContractTestResult[] = [];
    for (const definition of definitions) {
      results.push(await this.runContractTests(definition, options));
    }
    return results;
  }

  public async runContractTests(
    definition: ConnectorContractDefinitionInput,
    options: { requireFixtures?: boolean } = {}
  ): Promise<ConnectorContractTestResult> {
    if (!this.enabled) {
      return {
        appId: definition.appId.toLowerCase(),
        passed: true,
        scenarios: [],
        missingFixtures: [],
      };
    }

    await this.ensureFixturesLoaded();

    const appId = definition.appId.toLowerCase();
    const scenarios: ConnectorContractScenarioResult[] = [];
    const missingFixtures: string[] = [];

    const collect = (idValue: { id: string } | string | undefined | null, type: 'action' | 'trigger') => {
      if (!idValue) {
        return;
      }

      const id = typeof idValue === 'string' ? idValue : idValue.id;
      if (!id) {
        return;
      }

      const result = this.evaluateContractScenario(appId, id, type, options);
      scenarios.push(result);
      if (!result.hasFixture) {
        missingFixtures.push(`${type}:${id}`);
      }
    };

    (definition.actions || []).forEach(action => collect(action, 'action'));
    (definition.triggers || []).forEach(trigger => collect(trigger, 'trigger'));

    const requireFixtures = options.requireFixtures !== false;
    const passed = scenarios.length === 0
      ? true
      : scenarios.every(result => result.passed || (!requireFixtures && !result.hasFixture));

    return {
      appId,
      passed,
      scenarios,
      missingFixtures,
    };
  }

  private evaluateContractScenario(
    appId: string,
    scenarioId: string,
    type: 'action' | 'trigger',
    options: { requireFixtures?: boolean }
  ): ConnectorContractScenarioResult {
    const cacheKey = this.getCacheKey(appId, scenarioId);
    const fixture = this.fixtureCache.get(cacheKey);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!fixture) {
      if (options.requireFixtures !== false) {
        errors.push(`Missing simulator fixture for ${appId}.${scenarioId}`);
      }

      return {
        id: scenarioId,
        type,
        passed: errors.length === 0,
        errors,
        warnings,
        hasFixture: false,
      };
    }

    const declaredType = fixture.type ?? fixture.metadata?.kind;
    if (declaredType && declaredType !== type) {
      errors.push(`Fixture type mismatch: expected ${type} but received ${declaredType}`);
    }

    if (fixture.result && typeof fixture.result.success !== 'boolean') {
      warnings.push('Fixture result.success should be a boolean');
    }

    if (type === 'action') {
      if (!fixture.request && !fixture.response && !fixture.result) {
        warnings.push('Action fixture is missing request/response/result payloads');
      }
      if (fixture.request && !fixture.request.method) {
        warnings.push('Action fixture request is missing HTTP method');
      }
    } else {
      if (!fixture.triggerParams && !fixture.parameters && !fixture.result) {
        warnings.push('Trigger fixture is missing trigger parameters or result payload');
      }
    }

    return {
      id: scenarioId,
      type,
      passed: errors.length === 0,
      errors,
      warnings,
      hasFixture: true,
    };
  }

  private dedupeScenarios(scenarios: ConnectorSimulatorScenario[]): ConnectorSimulatorScenario[] {
    const seen = new Map<string, ConnectorSimulatorScenario>();
    for (const scenario of scenarios) {
      const key = scenario.connectionId ? `${scenario.id}::${scenario.connectionId}` : scenario.id;
      seen.set(key, { ...scenario });
    }
    return Array.from(seen.values());
  }

  private async ensureFixturesLoaded(): Promise<void> {
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      try {
        const connectorDirs = await fs.readdir(this.fixturesDir, { withFileTypes: true });
        for (const dirent of connectorDirs) {
          if (!dirent.isDirectory()) {
            continue;
          }

          const appId = dirent.name.toLowerCase();
          const appDir = path.join(this.fixturesDir, dirent.name);
          const files = await fs.readdir(appDir, { withFileTypes: true });

          for (const file of files) {
            if (!file.isFile() || !file.name.endsWith('.json')) {
              continue;
            }

            const actionId = file.name.slice(0, -5);
            const absolutePath = path.join(appDir, file.name);
            const raw = await fs.readFile(absolutePath, 'utf-8');

            try {
              const parsed = JSON.parse(raw) as ConnectorFixtureFile;
              this.fixtureCache.set(this.getCacheKey(appId, actionId), parsed);
              this.registerPlan(appId, actionId, parsed);
            } catch (error) {
              console.warn(
                `[connector-simulator] Failed to parse fixture ${absolutePath}: ${getErrorMessage(error)}`
              );
            }
          }
        }
      } catch (error: any) {
        if (error?.code === 'ENOENT') {
          return;
        }
        throw error;
      }
    })();

    return this.loadPromise;
  }

  private registerPlan(appId: string, actionId: string, fixture: ConnectorFixtureFile): void {
    const entry = this.planCache.get(appId) ?? {
      credentials: undefined,
      additionalConfig: undefined,
      connectionId: undefined,
      notes: [],
      actions: [],
      triggers: []
    };

    if (fixture.defaults?.credentials && !entry.credentials) {
      entry.credentials = fixture.defaults.credentials;
    }

    if (fixture.defaults?.additionalConfig && !entry.additionalConfig) {
      entry.additionalConfig = fixture.defaults.additionalConfig;
    }

    if (fixture.defaults?.connectionId && !entry.connectionId) {
      entry.connectionId = fixture.defaults.connectionId;
    }

    const noteCandidates = [fixture.description, fixture.notes, fixture.defaults?.notes];
    for (const candidate of noteCandidates) {
      if (candidate && !entry.notes.includes(candidate)) {
        entry.notes.push(candidate);
      }
    }

    if (actionId === '__connection__' || actionId === '__meta__') {
      this.planCache.set(appId, entry);
      return;
    }

    const scenario = {
      id: actionId,
      parameters: fixture.params ?? fixture.parameters ?? fixture.request?.body ?? fixture.triggerParams ?? {},
      expectSuccess: fixture.result?.success,
      connectionId: fixture.defaults?.connectionId,
    };

    const target = (fixture.type === 'trigger' || fixture.metadata?.kind === 'trigger')
      ? entry.triggers
      : entry.actions;

    target.push(scenario);
    this.planCache.set(appId, entry);
  }

  private getCacheKey(appId: string, actionId: string): string {
    return `${appId.toLowerCase()}::${actionId.toLowerCase()}`;
  }
}

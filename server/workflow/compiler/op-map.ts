/**
 * ChatGPT Fix: Export compiler operation map for accurate counting
 * 
 * This provides the single source of truth for what operations
 * are actually implemented in the compiler.
 */

import { REAL_OPS } from '../compile-to-appsscript.js';
import type { APIResponse, BaseAPIClient } from '../../integrations/BaseAPIClient.js';
import { AzureDevopsAPIClient } from '../../integrations/AzureDevopsAPIClient.js';
import { CircleCIApiClient } from '../../integrations/CircleCIApiClient.js';
import { JenkinsAPIClient } from '../../integrations/JenkinsAPIClient.js';

/**
 * Get the compiler operation map
 * Returns the same map the compiler uses for code generation
 */
export function getCompilerOpMap(): Record<string, any> {
  return REAL_OPS;
}

type RuntimeHandler = (client: BaseAPIClient, params?: Record<string, any>) => Promise<APIResponse<any>>;

function assertClientInstance<T extends BaseAPIClient>(client: BaseAPIClient, ctor: new (...args: any[]) => T): T {
  if (!(client instanceof ctor)) {
    throw new Error(`${ctor.name} handler invoked with incompatible client instance.`);
  }
  return client;
}

const RUNTIME_OPS: Record<string, RuntimeHandler> = {
  'action.azure-devops:test_connection': client => assertClientInstance(client, AzureDevopsAPIClient).testConnection(),
  'action.azure-devops:create_work_item': (client, params = {}) =>
    assertClientInstance(client, AzureDevopsAPIClient).createWorkItem(params),
  'action.azure-devops:trigger_build': (client, params = {}) =>
    assertClientInstance(client, AzureDevopsAPIClient).triggerBuild(params),
  'action.azure-devops:create_release': (client, params = {}) =>
    assertClientInstance(client, AzureDevopsAPIClient).createRelease(params),
  'action.azure-devops:get_build_status': (client, params = {}) =>
    assertClientInstance(client, AzureDevopsAPIClient).getBuildStatus(params),

  'action.circleci:test_connection': client => assertClientInstance(client, CircleCIApiClient).testConnection(),
  'action.circleci:trigger_pipeline': (client, params = {}) =>
    assertClientInstance(client, CircleCIApiClient).triggerPipeline(params),
  'action.circleci:get_pipelines': (client, params = {}) =>
    assertClientInstance(client, CircleCIApiClient).getPipelines(params),
  'action.circleci:get_pipeline': (client, params = {}) =>
    assertClientInstance(client, CircleCIApiClient).getPipeline(params),
  'action.circleci:get_workflows': (client, params = {}) =>
    assertClientInstance(client, CircleCIApiClient).getWorkflows(params),
  'action.circleci:get_jobs': (client, params = {}) =>
    assertClientInstance(client, CircleCIApiClient).getJobs(params),
  'action.circleci:cancel_workflow': (client, params = {}) =>
    assertClientInstance(client, CircleCIApiClient).cancelWorkflow(params),
  'action.circleci:rerun_workflow': (client, params = {}) =>
    assertClientInstance(client, CircleCIApiClient).rerunWorkflow(params),

  'action.jenkins:test_connection': client => assertClientInstance(client, JenkinsAPIClient).testConnection(),
  'action.jenkins:trigger_build': (client, params = {}) =>
    assertClientInstance(client, JenkinsAPIClient).triggerBuild(params),
  'action.jenkins:get_build_status': (client, params = {}) =>
    assertClientInstance(client, JenkinsAPIClient).getBuildStatus(params),
  'action.jenkins:get_last_build': (client, params = {}) =>
    assertClientInstance(client, JenkinsAPIClient).getLastBuild(params),
  'action.jenkins:get_build_console': (client, params = {}) =>
    assertClientInstance(client, JenkinsAPIClient).getBuildConsole(params),
  'action.jenkins:list_jobs': (client, params = {}) =>
    assertClientInstance(client, JenkinsAPIClient).listJobs(params),
  'action.jenkins:get_job_info': (client, params = {}) =>
    assertClientInstance(client, JenkinsAPIClient).getJobInfo(params),
  'action.jenkins:create_job': (client, params = {}) =>
    assertClientInstance(client, JenkinsAPIClient).createJob(params),
  'action.jenkins:update_job': (client, params = {}) =>
    assertClientInstance(client, JenkinsAPIClient).updateJob(params),
  'action.jenkins:delete_job': (client, params = {}) =>
    assertClientInstance(client, JenkinsAPIClient).deleteJob(params),
  'action.jenkins:enable_job': (client, params = {}) =>
    assertClientInstance(client, JenkinsAPIClient).enableJob(params),
  'action.jenkins:disable_job': (client, params = {}) =>
    assertClientInstance(client, JenkinsAPIClient).disableJob(params),
  'action.jenkins:copy_job': (client, params = {}) =>
    assertClientInstance(client, JenkinsAPIClient).copyJob(params),
  'action.jenkins:stop_build': (client, params = {}) =>
    assertClientInstance(client, JenkinsAPIClient).stopBuild(params),
  'action.jenkins:get_queue': client => assertClientInstance(client, JenkinsAPIClient).getQueue(),
  'action.jenkins:cancel_queue_item': (client, params = {}) =>
    assertClientInstance(client, JenkinsAPIClient).cancelQueueItem(params),
};

/**
 * Check if a specific operation is implemented
 */
export function isOperationImplemented(app: string, operation: string): boolean {
  const key1 = `${app}.${operation}`;
  const key2 = `action.${app}:${operation}`;
  const key3 = `trigger.${app}:${operation}`;
  
  return !!(REAL_OPS[key1] || REAL_OPS[key2] || REAL_OPS[key3]);
}

/**
 * Get all implemented operations
 */
export function getAllImplementedOperations(): string[] {
  return Object.keys(REAL_OPS);
}

/**
 * Get implemented operations by app
 */
export function getImplementedOperationsByApp(): Record<string, string[]> {
  const byApp: Record<string, string[]> = {};

  for (const opKey of Object.keys(REAL_OPS)) {
    // Parse operation key (e.g., "action.gmail:sendEmail" -> app: "gmail", op: "sendEmail")
    const match = opKey.match(/^(action|trigger)\.([^:]+):(.+)$/) || opKey.match(/^([^.]+)\.(.+)$/);
    if (match) {
      const app = match[2] || match[1];
      const operation = match[3] || match[2];
      
      if (!byApp[app]) {
        byApp[app] = [];
      }
      byApp[app].push(operation);
    }
  }

  return byApp;
}

export function getRuntimeOpHandlers(): Record<string, RuntimeHandler> {
  return RUNTIME_OPS;
}

export function getRuntimeOpHandler(key: string): RuntimeHandler | undefined {
  return RUNTIME_OPS[key];
}
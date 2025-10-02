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
import { KubernetesAPIClient } from '../../integrations/KubernetesAPIClient.js';
import { ArgocdAPIClient } from '../../integrations/ArgocdAPIClient.js';
import { TerraformCloudAPIClient } from '../../integrations/TerraformCloudAPIClient.js';
import { HashicorpVaultAPIClient } from '../../integrations/HashicorpVaultAPIClient.js';
import { HelmAPIClient } from '../../integrations/HelmAPIClient.js';
import { AnsibleAPIClient } from '../../integrations/AnsibleAPIClient.js';

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

  'action.kubernetes:test_connection': client => assertClientInstance(client, KubernetesAPIClient).testConnection(),
  'action.kubernetes:create_deployment': (client, params = {}) =>
    assertClientInstance(client, KubernetesAPIClient).createDeployment(params),
  'action.kubernetes:create_service': (client, params = {}) =>
    assertClientInstance(client, KubernetesAPIClient).createService(params),
  'action.kubernetes:scale_deployment': (client, params = {}) =>
    assertClientInstance(client, KubernetesAPIClient).scaleDeployment(params),
  'action.kubernetes:get_pod_logs': (client, params = {}) =>
    assertClientInstance(client, KubernetesAPIClient).getPodLogs(params),

  'action.argocd:test_connection': client => assertClientInstance(client, ArgocdAPIClient).testConnection(),
  'action.argocd:create_application': (client, params = {}) =>
    assertClientInstance(client, ArgocdAPIClient).createApplication(params),
  'action.argocd:sync_application': (client, params = {}) =>
    assertClientInstance(client, ArgocdAPIClient).syncApplication(params),
  'action.argocd:get_application': (client, params = {}) =>
    assertClientInstance(client, ArgocdAPIClient).getApplication(params),
  'action.argocd:delete_application': (client, params = {}) =>
    assertClientInstance(client, ArgocdAPIClient).deleteApplication(params),

  'action.terraform-cloud:test_connection': client =>
    assertClientInstance(client, TerraformCloudAPIClient).testConnection(),
  'action.terraform-cloud:create_workspace': (client, params = {}) =>
    assertClientInstance(client, TerraformCloudAPIClient).createWorkspace(params),
  'action.terraform-cloud:trigger_run': (client, params = {}) =>
    assertClientInstance(client, TerraformCloudAPIClient).triggerRun(params),
  'action.terraform-cloud:get_run_status': (client, params = {}) =>
    assertClientInstance(client, TerraformCloudAPIClient).getRunStatus(params),
  'action.terraform-cloud:set_variables': (client, params = {}) =>
    assertClientInstance(client, TerraformCloudAPIClient).setVariables(params),

  'action.hashicorp-vault:test_connection': client =>
    assertClientInstance(client, HashicorpVaultAPIClient).testConnection(),
  'action.hashicorp-vault:read_secret': (client, params = {}) =>
    assertClientInstance(client, HashicorpVaultAPIClient).readSecret(params),
  'action.hashicorp-vault:write_secret': (client, params = {}) =>
    assertClientInstance(client, HashicorpVaultAPIClient).writeSecret(params),
  'action.hashicorp-vault:delete_secret': (client, params = {}) =>
    assertClientInstance(client, HashicorpVaultAPIClient).deleteSecret(params),
  'action.hashicorp-vault:create_policy': (client, params = {}) =>
    assertClientInstance(client, HashicorpVaultAPIClient).createPolicy(params),

  'action.helm:test_connection': client => assertClientInstance(client, HelmAPIClient).testConnection(),
  'action.helm:install_chart': (client, params = {}) =>
    assertClientInstance(client, HelmAPIClient).installChart(params),
  'action.helm:upgrade_release': (client, params = {}) =>
    assertClientInstance(client, HelmAPIClient).upgradeRelease(params),
  'action.helm:uninstall_release': (client, params = {}) =>
    assertClientInstance(client, HelmAPIClient).uninstallRelease(params),
  'action.helm:list_releases': (client, params = {}) =>
    assertClientInstance(client, HelmAPIClient).listReleases(params),

  'action.ansible:test_connection': client => assertClientInstance(client, AnsibleAPIClient).testConnection(),
  'action.ansible:launch_job_template': (client, params = {}) =>
    assertClientInstance(client, AnsibleAPIClient).launchJobTemplate(params),
  'action.ansible:get_job_status': (client, params = {}) =>
    assertClientInstance(client, AnsibleAPIClient).getJobStatus(params),
  'action.ansible:create_inventory': (client, params = {}) =>
    assertClientInstance(client, AnsibleAPIClient).createInventory(params),
  'action.ansible:add_host': (client, params = {}) =>
    assertClientInstance(client, AnsibleAPIClient).addHost(params),
  'action.ansible:list_job_templates': client =>
    assertClientInstance(client, AnsibleAPIClient).listJobTemplates(),
  'action.ansible:delete_job_template': (client, params = {}) =>
    assertClientInstance(client, AnsibleAPIClient).deleteJobTemplate(params),

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
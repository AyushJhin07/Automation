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
import { AwsCloudFormationAPIClient } from '../../integrations/AwsCloudFormationAPIClient.js';
import { AwsCodePipelineAPIClient } from '../../integrations/AwsCodePipelineAPIClient.js';
import { DatadogAPIClient } from '../../integrations/DatadogAPIClient.js';
import { GrafanaAPIClient } from '../../integrations/GrafanaAPIClient.js';
import { PrometheusAPIClient } from '../../integrations/PrometheusAPIClient.js';
import { NewrelicAPIClient } from '../../integrations/NewrelicAPIClient.js';
import { SentryAPIClient } from '../../integrations/SentryAPIClient.js';
import { BigCommerceAPIClient } from '../../integrations/BigCommerceAPIClient.js';
import { MagentoAPIClient } from '../../integrations/MagentoAPIClient.js';
import { WooCommerceAPIClient } from '../../integrations/WooCommerceAPIClient.js';
import { SquareAPIClient } from '../../integrations/SquareAPIClient.js';

/**
 * Get the compiler operation map
 * Returns the same map the compiler uses for code generation
 */
const ADDITIONAL_OPS: Record<string, any> = {
  'action.datadog:test_connection': () => `// Datadog connection handled at runtime`,
  'action.datadog:submit_metrics': REAL_OPS['action.datadog:send_metric'] ?? (() => ''),
  'action.datadog:query_metrics': () => `// Datadog metric query executed at runtime`,
  'action.datadog:create_event': () => `// Datadog event creation executed at runtime`,
  'action.datadog:get_events': () => `// Datadog event retrieval executed at runtime`,
  'action.datadog:create_monitor': () => `// Datadog monitor creation executed at runtime`,
  'action.datadog:get_monitors': () => `// Datadog monitor listing executed at runtime`,
  'action.grafana:test_connection': () => `// Grafana connection handled at runtime`,
  'action.grafana:create_dashboard': () => `// Grafana dashboard creation executed at runtime`,
  'action.grafana:create_datasource': () => `// Grafana datasource creation executed at runtime`,
  'action.grafana:create_alert_rule': () => `// Grafana alert rule creation executed at runtime`,
  'action.grafana:get_dashboard': () => `// Grafana dashboard retrieval executed at runtime`,
  'action.prometheus:test_connection': () => `// Prometheus connection handled at runtime`,
  'action.prometheus:query_metrics': () => `// Prometheus query executed at runtime`,
  'action.prometheus:query_range': () => `// Prometheus range query executed at runtime`,
  'action.prometheus:get_targets': () => `// Prometheus targets retrieval executed at runtime`,
  'action.prometheus:get_alerts': () => `// Prometheus alerts retrieval executed at runtime`,
  'action.newrelic:test_connection': () => `// New Relic connection handled at runtime`,
  'action.newrelic:get_applications': () => `// New Relic applications retrieval executed at runtime`,
  'action.newrelic:get_application_metrics': () => `// New Relic metrics retrieval executed at runtime`,
  'action.newrelic:get_alerts': () => `// New Relic alerts retrieval executed at runtime`,
  'action.newrelic:create_alert_policy': () => `// New Relic alert policy creation executed at runtime`,
  'action.newrelic:get_violations': () => `// New Relic violations retrieval executed at runtime`,
  'action.newrelic:execute_nrql': () => `// New Relic NRQL query executed at runtime`,
  'action.sentry:test_connection': () => `// Sentry connection handled at runtime`,
  'action.sentry:get_organizations': () => `// Sentry organization listing executed at runtime`,
  'action.sentry:get_organization': () => `// Sentry organization retrieval executed at runtime`,
  'action.sentry:get_projects': () => `// Sentry projects listing executed at runtime`,
  'action.sentry:get_project': () => `// Sentry project retrieval executed at runtime`,
  'action.sentry:create_project': () => `// Sentry project creation executed at runtime`,
  'action.sentry:update_project': () => `// Sentry project update executed at runtime`,
  'action.sentry:get_issues': () => `// Sentry issues retrieval executed at runtime`,
  'action.sentry:get_issue': () => `// Sentry issue retrieval executed at runtime`,
  'action.sentry:update_issue': () => `// Sentry issue update executed at runtime`,
  'action.sentry:delete_issue': () => `// Sentry issue deletion executed at runtime`,
  'action.sentry:get_events': () => `// Sentry events retrieval executed at runtime`,
  'action.sentry:get_event': () => `// Sentry event retrieval executed at runtime`,
  'action.sentry:create_release': () => `// Sentry release creation executed at runtime`,
  'action.sentry:get_releases': () => `// Sentry releases retrieval executed at runtime`,
  'action.sentry:finalize_release': () => `// Sentry release finalization executed at runtime`,
  'action.sentry:get_teams': () => `// Sentry teams retrieval executed at runtime`
};

const AUGMENTED_REAL_OPS: Record<string, any> = { ...REAL_OPS, ...ADDITIONAL_OPS };

export function getCompilerOpMap(): Record<string, any> {
  return AUGMENTED_REAL_OPS;
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

  'action.aws-cloudformation:test_connection': client =>
    assertClientInstance(client, AwsCloudFormationAPIClient).testConnection(),
  'action.aws-cloudformation:create_stack': (client, params = {}) =>
    assertClientInstance(client, AwsCloudFormationAPIClient).createStack(params),
  'action.aws-cloudformation:update_stack': (client, params = {}) =>
    assertClientInstance(client, AwsCloudFormationAPIClient).updateStack(params),
  'action.aws-cloudformation:delete_stack': (client, params = {}) =>
    assertClientInstance(client, AwsCloudFormationAPIClient).deleteStack(params),
  'action.aws-cloudformation:get_stack_status': (client, params = {}) =>
    assertClientInstance(client, AwsCloudFormationAPIClient).getStackStatus(params),

  'action.aws-codepipeline:test_connection': client =>
    assertClientInstance(client, AwsCodePipelineAPIClient).testConnection(),
  'action.aws-codepipeline:create_pipeline': (client, params = {}) =>
    assertClientInstance(client, AwsCodePipelineAPIClient).createPipeline(params),
  'action.aws-codepipeline:start_pipeline': (client, params = {}) =>
    assertClientInstance(client, AwsCodePipelineAPIClient).startPipeline(params),
  'action.aws-codepipeline:get_pipeline_state': (client, params = {}) =>
    assertClientInstance(client, AwsCodePipelineAPIClient).getPipelineState(params),
  'action.aws-codepipeline:stop_pipeline': (client, params = {}) =>
    assertClientInstance(client, AwsCodePipelineAPIClient).stopPipeline(params),

  'action.datadog:test_connection': client => assertClientInstance(client, DatadogAPIClient).testConnection(),
  'action.datadog:submit_metrics': (client, params = {}) =>
    assertClientInstance(client, DatadogAPIClient).submitMetrics(params),
  'action.datadog:query_metrics': (client, params = {}) =>
    assertClientInstance(client, DatadogAPIClient).queryMetrics(params),
  'action.datadog:create_event': (client, params = {}) =>
    assertClientInstance(client, DatadogAPIClient).createEvent(params),
  'action.datadog:get_events': (client, params = {}) =>
    assertClientInstance(client, DatadogAPIClient).getEvents(params),
  'action.datadog:create_monitor': (client, params = {}) =>
    assertClientInstance(client, DatadogAPIClient).createMonitor(params),
  'action.datadog:get_monitors': (client, params = {}) =>
    assertClientInstance(client, DatadogAPIClient).getMonitors(params),

  'action.grafana:test_connection': client => assertClientInstance(client, GrafanaAPIClient).testConnection(),
  'action.grafana:create_dashboard': (client, params = {}) =>
    assertClientInstance(client, GrafanaAPIClient).createDashboard(params),
  'action.grafana:create_datasource': (client, params = {}) =>
    assertClientInstance(client, GrafanaAPIClient).createDatasource(params),
  'action.grafana:create_alert_rule': (client, params = {}) =>
    assertClientInstance(client, GrafanaAPIClient).createAlertRule(params),
  'action.grafana:get_dashboard': (client, params = {}) =>
    assertClientInstance(client, GrafanaAPIClient).getDashboard(params),

  'action.prometheus:test_connection': client => assertClientInstance(client, PrometheusAPIClient).testConnection(),
  'action.prometheus:query_metrics': (client, params = {}) =>
    assertClientInstance(client, PrometheusAPIClient).queryMetrics(params),
  'action.prometheus:query_range': (client, params = {}) =>
    assertClientInstance(client, PrometheusAPIClient).queryRange(params),
  'action.prometheus:get_targets': (client, params = {}) =>
    assertClientInstance(client, PrometheusAPIClient).getTargets(params),
  'action.prometheus:get_alerts': (client, params = {}) =>
    assertClientInstance(client, PrometheusAPIClient).getAlerts(params),

  'action.newrelic:test_connection': client => assertClientInstance(client, NewrelicAPIClient).testConnection(),
  'action.newrelic:get_applications': (client, params = {}) =>
    assertClientInstance(client, NewrelicAPIClient).getApplications(params),
  'action.newrelic:get_application_metrics': (client, params = {}) =>
    assertClientInstance(client, NewrelicAPIClient).getApplicationMetrics(params),
  'action.newrelic:get_alerts': (client, params = {}) =>
    assertClientInstance(client, NewrelicAPIClient).getAlerts(params),
  'action.newrelic:create_alert_policy': (client, params = {}) =>
    assertClientInstance(client, NewrelicAPIClient).createAlertPolicy(params),
  'action.newrelic:get_violations': (client, params = {}) =>
    assertClientInstance(client, NewrelicAPIClient).getViolations(params),
  'action.newrelic:execute_nrql': (client, params = {}) =>
    assertClientInstance(client, NewrelicAPIClient).executeNrql(params),

  'action.sentry:test_connection': client => assertClientInstance(client, SentryAPIClient).testConnection(),
  'action.sentry:get_organizations': (client, params = {}) =>
    assertClientInstance(client, SentryAPIClient).getOrganizations(params),
  'action.sentry:get_organization': (client, params = {}) =>
    assertClientInstance(client, SentryAPIClient).getOrganization(params),
  'action.sentry:get_projects': (client, params = {}) =>
    assertClientInstance(client, SentryAPIClient).getProjects(params),
  'action.sentry:get_project': (client, params = {}) =>
    assertClientInstance(client, SentryAPIClient).getProject(params),
  'action.sentry:create_project': (client, params = {}) =>
    assertClientInstance(client, SentryAPIClient).createProject(params),
  'action.sentry:update_project': (client, params = {}) =>
    assertClientInstance(client, SentryAPIClient).updateProject(params),
  'action.sentry:get_issues': (client, params = {}) =>
    assertClientInstance(client, SentryAPIClient).getIssues(params),
  'action.sentry:get_issue': (client, params = {}) =>
    assertClientInstance(client, SentryAPIClient).getIssue(params),
  'action.sentry:update_issue': (client, params = {}) =>
    assertClientInstance(client, SentryAPIClient).updateIssue(params),
  'action.sentry:delete_issue': (client, params = {}) =>
    assertClientInstance(client, SentryAPIClient).deleteIssue(params),
  'action.sentry:get_events': (client, params = {}) =>
    assertClientInstance(client, SentryAPIClient).getEvents(params),
  'action.sentry:get_event': (client, params = {}) =>
    assertClientInstance(client, SentryAPIClient).getEvent(params),
  'action.sentry:create_release': (client, params = {}) =>
    assertClientInstance(client, SentryAPIClient).createRelease(params),
  'action.sentry:get_releases': (client, params = {}) =>
    assertClientInstance(client, SentryAPIClient).getReleases(params),
  'action.sentry:finalize_release': (client, params = {}) =>
    assertClientInstance(client, SentryAPIClient).finalizeRelease(params),
  'action.sentry:get_teams': (client, params = {}) =>
    assertClientInstance(client, SentryAPIClient).getTeams(params),

  'action.bigcommerce:test_connection': client =>
    assertClientInstance(client, BigCommerceAPIClient).testConnection(),
  'action.bigcommerce:create_product': (client, params = {}) =>
    assertClientInstance(client, BigCommerceAPIClient).createProduct(params),
  'action.bigcommerce:update_product': (client, params = {}) =>
    assertClientInstance(client, BigCommerceAPIClient).updateProduct(params),
  'action.bigcommerce:get_product': (client, params = {}) =>
    assertClientInstance(client, BigCommerceAPIClient).getProduct(params),
  'action.bigcommerce:list_products': (client, params = {}) =>
    assertClientInstance(client, BigCommerceAPIClient).listProducts(params),
  'action.bigcommerce:create_order': (client, params = {}) =>
    assertClientInstance(client, BigCommerceAPIClient).createOrder(params),

  'action.magento:test_connection': client =>
    assertClientInstance(client, MagentoAPIClient).testConnection(),
  'action.magento:create_product': (client, params = {}) =>
    assertClientInstance(client, MagentoAPIClient).createProduct(params),
  'action.magento:get_product': (client, params = {}) =>
    assertClientInstance(client, MagentoAPIClient).getProduct(params),
  'action.magento:update_product': (client, params = {}) =>
    assertClientInstance(client, MagentoAPIClient).updateProduct(params),
  'action.magento:delete_product': (client, params = {}) =>
    assertClientInstance(client, MagentoAPIClient).deleteProduct(params),
  'action.magento:search_products': (client, params = {}) =>
    assertClientInstance(client, MagentoAPIClient).searchProducts(params),
  'action.magento:create_order': (client, params = {}) =>
    assertClientInstance(client, MagentoAPIClient).createOrder(params),
  'action.magento:get_order': (client, params = {}) =>
    assertClientInstance(client, MagentoAPIClient).getOrder(params),
  'action.magento:create_customer': (client, params = {}) =>
    assertClientInstance(client, MagentoAPIClient).createCustomer(params),

  'action.woocommerce:test_connection': client =>
    assertClientInstance(client, WooCommerceAPIClient).testConnection(),
  'action.woocommerce:create_product': (client, params = {}) =>
    assertClientInstance(client, WooCommerceAPIClient).createProduct(params),
  'action.woocommerce:get_product': (client, params = {}) =>
    assertClientInstance(client, WooCommerceAPIClient).getProduct(params),
  'action.woocommerce:update_product': (client, params = {}) =>
    assertClientInstance(client, WooCommerceAPIClient).updateProduct(params),
  'action.woocommerce:list_products': (client, params = {}) =>
    assertClientInstance(client, WooCommerceAPIClient).listProducts(params),
  'action.woocommerce:create_order': (client, params = {}) =>
    assertClientInstance(client, WooCommerceAPIClient).createOrder(params),
  'action.woocommerce:get_order': (client, params = {}) =>
    assertClientInstance(client, WooCommerceAPIClient).getOrder(params),
  'action.woocommerce:update_order': (client, params = {}) =>
    assertClientInstance(client, WooCommerceAPIClient).updateOrder(params),

  'action.square:test_connection': client =>
    assertClientInstance(client, SquareAPIClient).testConnection(),
  'action.square:create_payment': (client, params = {}) =>
    assertClientInstance(client, SquareAPIClient).createPayment(params),
  'action.square:get_payment': (client, params = {}) =>
    assertClientInstance(client, SquareAPIClient).getPayment(params),
  'action.square:list_payments': (client, params = {}) =>
    assertClientInstance(client, SquareAPIClient).listPayments(params),
  'action.square:create_refund': (client, params = {}) =>
    assertClientInstance(client, SquareAPIClient).createRefund(params),
  'action.square:create_customer': (client, params = {}) =>
    assertClientInstance(client, SquareAPIClient).createCustomer(params),
  'action.square:get_customer': (client, params = {}) =>
    assertClientInstance(client, SquareAPIClient).getCustomer(params),
  'action.square:create_order': (client, params = {}) =>
    assertClientInstance(client, SquareAPIClient).createOrder(params),

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
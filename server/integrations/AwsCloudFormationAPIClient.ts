import { createRequire } from 'module';

import { BaseAPIClient, APIResponse } from './BaseAPIClient';
import { getErrorMessage } from '../types/common';

const require = createRequire(import.meta.url);

export interface AwsSharedCredentials {
  apiKey?: string;
  apiSecret?: string;
  access_key_id?: string;
  secret_access_key?: string;
  session_token?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  awsAccessKeyId?: string;
  aws_access_key_id?: string;
  awsSecretAccessKey?: string;
  aws_secret_access_key?: string;
  awsSessionToken?: string;
  aws_session_token?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_SESSION_TOKEN?: string;
  region?: string;
  awsRegion?: string;
  AWS_REGION?: string;
  [key: string]: any;
}

export interface AwsCloudFormationAPIClientConfig extends AwsSharedCredentials {
  cloudFormationClient?: CloudFormationClientLike;
}

interface CreateOrUpdateParams {
  stack_name: string;
  template_body?: string;
  template_url?: string;
  parameters?: Array<{ ParameterKey: string; ParameterValue: string }>;
  capabilities?: string[];
  tags?: Array<{ Key: string; Value: string }>;
  disable_rollback?: boolean;
  timeout_in_minutes?: number;
  on_failure?: 'DO_NOTHING' | 'ROLLBACK' | 'DELETE';
  notification_arns?: string[];
  role_arn?: string;
  stack_policy_body?: string;
  stack_policy_url?: string;
  client_request_token?: string;
  retain_resources?: string[];
  use_previous_template?: boolean;
}

interface DeleteParams {
  stack_name: string;
  retain_resources?: string[];
  role_arn?: string;
  client_request_token?: string;
}

interface GetStatusParams {
  stack_name: string;
}

interface CloudFormationClientLike {
  send(command: any): Promise<any>;
}

interface CloudFormationSdkModule {
  CloudFormationClient: new (config: any) => CloudFormationClientLike;
  CreateStackCommand: new (input: any) => any;
  UpdateStackCommand: new (input: any) => any;
  DeleteStackCommand: new (input: any) => any;
  DescribeStacksCommand: new (input: any) => any;
  ListStacksCommand: new (input: any) => any;
}

interface CloudFormationCommandConstructors {
  CreateStackCommand: new (input: any) => any;
  UpdateStackCommand: new (input: any) => any;
  DeleteStackCommand: new (input: any) => any;
  DescribeStacksCommand: new (input: any) => any;
  ListStacksCommand: new (input: any) => any;
}

export class AwsCloudFormationAPIClient extends BaseAPIClient {
  private client: CloudFormationClientLike;
  private region: string;
  private sdkModule: CloudFormationSdkModule | null | undefined;
  private commandConstructors: CloudFormationCommandConstructors | undefined;

  constructor(config: AwsCloudFormationAPIClientConfig) {
    const region = AwsCloudFormationAPIClient.extractRegion(config);
    super(`https://cloudformation.${region}.amazonaws.com`, config);

    this.region = region;
    this.client = config.cloudFormationClient ?? this.createClient(config);

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this),
      'create_stack': this.createStack.bind(this),
      'update_stack': this.updateStack.bind(this),
      'delete_stack': this.deleteStack.bind(this),
      'get_stack_status': this.getStackStatus.bind(this),
      'stack_created': this.getStackStatus.bind(this),
      'stack_failed': this.getStackStatus.bind(this)
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {};
  }

  public override updateCredentials(credentials: AwsCloudFormationAPIClientConfig): void {
    super.updateCredentials(credentials);
    this.region = AwsCloudFormationAPIClient.extractRegion({ ...this.credentials, ...credentials });
    this.client = credentials.cloudFormationClient ?? this.createClient({ ...this.credentials, ...credentials });
  }

  public async testConnection(): Promise<APIResponse<{ stackCount: number; region: string }>> {
    try {
      const { ListStacksCommand } = this.getCommandConstructors();
      const response = await this.client.send(new ListStacksCommand({ MaxResults: 1 }));
      const count = Array.isArray(response.StackSummaries) ? response.StackSummaries.length : 0;
      return {
        success: true,
        data: {
          stackCount: count,
          region: this.region
        }
      };
    } catch (error) {
      return this.toErrorResponse(error);
    }
  }

  public async createStack(params: CreateOrUpdateParams): Promise<APIResponse<{ stackId?: string; stackName: string }>> {
    this.validateRequiredParams(params, ['stack_name']);
    this.assertTemplatePresent(params, 'create');

    const input = {
      StackName: params.stack_name,
      TemplateBody: params.template_body,
      TemplateURL: params.template_url,
      Parameters: params.parameters,
      Capabilities: params.capabilities,
      Tags: params.tags,
      DisableRollback: params.disable_rollback,
      TimeoutInMinutes: params.timeout_in_minutes,
      OnFailure: params.on_failure,
      NotificationARNs: params.notification_arns,
      RoleARN: params.role_arn,
      StackPolicyBody: params.stack_policy_body,
      StackPolicyURL: params.stack_policy_url,
      ClientRequestToken: params.client_request_token
    };

    try {
      const { CreateStackCommand } = this.getCommandConstructors();
      const response = await this.client.send(new CreateStackCommand(input));
      return {
        success: true,
        data: {
          stackId: response.StackId,
          stackName: params.stack_name
        }
      };
    } catch (error) {
      return this.toErrorResponse(error);
    }
  }

  public async updateStack(params: CreateOrUpdateParams): Promise<APIResponse<{ stackId?: string; stackName: string }>> {
    this.validateRequiredParams(params, ['stack_name']);

    const usePreviousTemplate = !params.template_body && !params.template_url;
    const input = {
      StackName: params.stack_name,
      TemplateBody: params.template_body,
      TemplateURL: params.template_url,
      Parameters: params.parameters,
      Capabilities: params.capabilities,
      Tags: params.tags,
      ClientRequestToken: params.client_request_token,
      RoleARN: params.role_arn,
      StackPolicyBody: params.stack_policy_body,
      StackPolicyDuringUpdateBody: params.stack_policy_body,
      StackPolicyDuringUpdateURL: params.stack_policy_url,
      StackPolicyURL: params.stack_policy_url,
      UsePreviousTemplate: usePreviousTemplate ? true : undefined,
      RetainExceptOnCreate: params.retain_resources
    } as any;

    try {
      const { UpdateStackCommand } = this.getCommandConstructors();
      const response = await this.client.send(new UpdateStackCommand(input));
      return {
        success: true,
        data: {
          stackId: response.StackId,
          stackName: params.stack_name
        }
      };
    } catch (error) {
      return this.toErrorResponse(error);
    }
  }

  public async deleteStack(params: DeleteParams): Promise<APIResponse<{ stackName: string }>> {
    this.validateRequiredParams(params, ['stack_name']);

    const input = {
      StackName: params.stack_name,
      RetainResources: params.retain_resources,
      RoleARN: params.role_arn,
      ClientRequestToken: params.client_request_token
    };

    try {
      const { DeleteStackCommand } = this.getCommandConstructors();
      await this.client.send(new DeleteStackCommand(input));
      return {
        success: true,
        data: {
          stackName: params.stack_name
        }
      };
    } catch (error) {
      return this.toErrorResponse(error);
    }
  }

  public async getStackStatus(params: GetStatusParams): Promise<APIResponse<{ stackName: string; status?: string; outputs?: any[] }>> {
    this.validateRequiredParams(params, ['stack_name']);

    try {
      const { DescribeStacksCommand } = this.getCommandConstructors();
      const response = await this.client.send(new DescribeStacksCommand({ StackName: params.stack_name }));
      const stack = response.Stacks?.[0];
      if (!stack) {
        return {
          success: false,
          error: `Stack ${params.stack_name} not found (region: ${this.region})`
        };
      }

      return {
        success: true,
        data: {
          stackName: stack.StackName ?? params.stack_name,
          status: stack.StackStatus,
          outputs: stack.Outputs
        }
      };
    } catch (error) {
      return this.toErrorResponse(error);
    }
  }

  private createClient(config: AwsCloudFormationAPIClientConfig): CloudFormationClientLike {
    const credentials = AwsCloudFormationAPIClient.extractCredentialSet(config);
    if (!credentials.accessKeyId || !credentials.secretAccessKey) {
      throw new Error('AWS CloudFormation requires access_key_id and secret_access_key credentials');
    }

    const sdk = this.tryLoadSdk();
    if (!sdk) {
      throw new Error('Failed to load @aws-sdk/client-cloudformation. Install the dependency or provide a cloudFormationClient instance.');
    }

    return new sdk.CloudFormationClient({
      region: this.region,
      credentials
    });
  }

  private assertTemplatePresent(params: CreateOrUpdateParams, action: 'create' | 'update'): void {
    if (!params.template_body && !params.template_url && action === 'create') {
      throw new Error('Either template_body or template_url must be provided for stack creation');
    }
  }

  private toErrorResponse(error: unknown): APIResponse<never> {
    const message = getErrorMessage(error);
    const awsError = error as { $metadata?: { httpStatusCode?: number }; name?: string };
    const statusCode = awsError?.$metadata?.httpStatusCode;
    const enrichedMessage = this.region ? `${message} (region: ${this.region})` : message;
    return {
      success: false,
      error: enrichedMessage,
      statusCode
    };
  }

  private tryLoadSdk(): CloudFormationSdkModule | null {
    if (this.sdkModule !== undefined) {
      return this.sdkModule;
    }

    try {
      const mod = require('@aws-sdk/client-cloudformation') as CloudFormationSdkModule;
      this.sdkModule = mod;
      return mod;
    } catch (error) {
      this.sdkModule = null;
      return null;
    }
  }

  private getCommandConstructors(): CloudFormationCommandConstructors {
    if (!this.commandConstructors) {
      const sdk = this.tryLoadSdk();
      if (sdk) {
        this.commandConstructors = {
          CreateStackCommand: sdk.CreateStackCommand,
          UpdateStackCommand: sdk.UpdateStackCommand,
          DeleteStackCommand: sdk.DeleteStackCommand,
          DescribeStacksCommand: sdk.DescribeStacksCommand,
          ListStacksCommand: sdk.ListStacksCommand
        };
      } else {
        class CreateStackCommand { constructor(public input: any) {} }
        class UpdateStackCommand { constructor(public input: any) {} }
        class DeleteStackCommand { constructor(public input: any) {} }
        class DescribeStacksCommand { constructor(public input: any) {} }
        class ListStacksCommand { constructor(public input: any) {} }
        this.commandConstructors = {
          CreateStackCommand,
          UpdateStackCommand,
          DeleteStackCommand,
          DescribeStacksCommand,
          ListStacksCommand
        };
      }
    }
    return this.commandConstructors!;
  }

  private static extractRegion(config: AwsSharedCredentials): string {
    return (
      config.region ||
      config.awsRegion ||
      config.AWS_REGION ||
      'us-east-1'
    );
  }

  private static extractCredentialSet(config: AwsSharedCredentials) {
    return {
      accessKeyId:
        config.accessKeyId ||
        config.access_key_id ||
        config.awsAccessKeyId ||
        config.aws_access_key_id ||
        config.AWS_ACCESS_KEY_ID ||
        config.apiKey,
      secretAccessKey:
        config.secretAccessKey ||
        config.secret_access_key ||
        config.awsSecretAccessKey ||
        config.aws_secret_access_key ||
        config.AWS_SECRET_ACCESS_KEY ||
        config.apiSecret,
      sessionToken:
        config.sessionToken ||
        config.session_token ||
        config.awsSessionToken ||
        config.aws_session_token ||
        config.AWS_SESSION_TOKEN
    };
  }
}

import type { CloudFormationClientConfig } from './aws/stubs/cloudformation';

import { loadCloudFormationSdk } from './aws/sdk-loader';

import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';
import { getErrorMessage } from '../types/common';

interface AwsCloudFormationCredentials extends APICredentials {
  access_key_id?: string;
  accessKeyId?: string;
  secret_access_key?: string;
  secretAccessKey?: string;
  session_token?: string;
  sessionToken?: string;
  aws_session_token?: string;
  awsSessionToken?: string;
  region?: string;
  aws_region?: string;
  awsRegion?: string;
  cloudFormationClient?: CloudFormationClient;
}

interface StackParameters {
  ParameterKey: string;
  ParameterValue: string;
}

interface StackTag {
  Key: string;
  Value: string;
}

interface CreateOrUpdateStackParams {
  stack_name: string;
  template_body?: string;
  template_url?: string;
  parameters?: StackParameters[];
  capabilities?: string[];
  tags?: StackTag[];
}

interface DeleteStackParams {
  stack_name: string;
}

interface GetStackStatusParams {
  stack_name: string;
}

function sanitizeRegion(credentials: AwsCloudFormationCredentials): string {
  return (
    credentials.region ||
    credentials.aws_region ||
    credentials.awsRegion ||
    'us-east-1'
  );
}

function sanitizeAccessKeyId(credentials: AwsCloudFormationCredentials): string | undefined {
  return credentials.access_key_id || credentials.accessKeyId || credentials.apiKey;
}

function sanitizeSecretAccessKey(credentials: AwsCloudFormationCredentials): string | undefined {
  return credentials.secret_access_key || credentials.secretAccessKey || credentials.clientSecret;
}

function sanitizeSessionToken(credentials: AwsCloudFormationCredentials): string | undefined {
  return (
    credentials.session_token ||
    credentials.sessionToken ||
    credentials.aws_session_token ||
    credentials.awsSessionToken ||
    credentials.accessToken
  );
}

const {
  CloudFormationClient,
  CreateStackCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
  ListStacksCommand,
  UpdateStackCommand
} = await loadCloudFormationSdk();

export class AwsCloudFormationAPIClient extends BaseAPIClient {
  private readonly client: CloudFormationClient;
  private readonly region: string;

  constructor(credentials: AwsCloudFormationCredentials) {
    const {
      cloudFormationClient,
      ...rest
    } = credentials;

    const accessKeyId = sanitizeAccessKeyId(credentials);
    const secretAccessKey = sanitizeSecretAccessKey(credentials);
    const sessionToken = sanitizeSessionToken(credentials);
    const region = sanitizeRegion(credentials);

    if (!accessKeyId) {
      throw new Error('AWS CloudFormation integration requires an access key ID');
    }
    if (!secretAccessKey) {
      throw new Error('AWS CloudFormation integration requires a secret access key');
    }

    super(`https://cloudformation.${region}.amazonaws.com`, rest);

    const config: CloudFormationClientConfig = {
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
        sessionToken
      }
    };

    this.client = cloudFormationClient ?? new CloudFormationClient(config);
    this.region = region;

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_stack': this.createStack.bind(this) as any,
      'update_stack': this.updateStack.bind(this) as any,
      'delete_stack': this.deleteStack.bind(this) as any,
      'get_stack_status': this.getStackStatus.bind(this) as any
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {};
  }

  public async testConnection(): Promise<APIResponse<any>> {
    try {
      const response = await this.client.send(new ListStacksCommand({ MaxResults: 1 }));
      return {
        success: true,
        data: {
          stackCount: response.StackSummaries?.length ?? 0,
          nextToken: response.NextToken
        }
      };
    } catch (error) {
      return {
        success: false,
        error: this.formatAwsError(error)
      };
    }
  }

  public async createStack(params: CreateOrUpdateStackParams): Promise<APIResponse<any>> {
    try {
      this.validateRequiredParams(params as Record<string, any>, ['stack_name']);

      const input = this.buildStackCommandInput(params);
      const response = await this.client.send(new CreateStackCommand(input));
      return {
        success: true,
        data: response
      };
    } catch (error) {
      return {
        success: false,
        error: this.formatAwsError(error)
      };
    }
  }

  public async updateStack(params: CreateOrUpdateStackParams): Promise<APIResponse<any>> {
    try {
      this.validateRequiredParams(params as Record<string, any>, ['stack_name']);

      const input = this.buildStackCommandInput(params);
      const response = await this.client.send(new UpdateStackCommand(input));
      return {
        success: true,
        data: response
      };
    } catch (error) {
      return {
        success: false,
        error: this.formatAwsError(error)
      };
    }
  }

  public async deleteStack(params: DeleteStackParams): Promise<APIResponse<any>> {
    try {
      this.validateRequiredParams(params as Record<string, any>, ['stack_name']);

      const response = await this.client.send(new DeleteStackCommand({
        StackName: params.stack_name
      }));
      return {
        success: true,
        data: response
      };
    } catch (error) {
      return {
        success: false,
        error: this.formatAwsError(error)
      };
    }
  }

  public async getStackStatus(params: GetStackStatusParams): Promise<APIResponse<any>> {
    try {
      this.validateRequiredParams(params as Record<string, any>, ['stack_name']);

      const response = await this.client.send(new DescribeStacksCommand({
        StackName: params.stack_name
      }));

      const stack = response.Stacks?.[0];
      return {
        success: true,
        data: stack
          ? {
              stackId: stack.StackId,
              stackName: stack.StackName,
              stackStatus: stack.StackStatus,
              stackStatusReason: stack.StackStatusReason,
              lastUpdatedTime: stack.LastUpdatedTime,
              creationTime: stack.CreationTime
            }
          : undefined
      };
    } catch (error) {
      return {
        success: false,
        error: this.formatAwsError(error)
      };
    }
  }

  private buildStackCommandInput(params: CreateOrUpdateStackParams): Record<string, any> {
    const input: Record<string, any> = {
      StackName: params.stack_name,
      Parameters: params.parameters,
      Capabilities: params.capabilities,
      Tags: params.tags
    };

    if (params.template_body) {
      input.TemplateBody = params.template_body;
    }
    if (params.template_url) {
      input.TemplateURL = params.template_url;
    }

    if (!input.TemplateBody && !input.TemplateURL) {
      throw new Error('Either template_body or template_url must be provided');
    }

    return input;
  }

  private formatAwsError(error: unknown): string {
    const message = getErrorMessage(error);

    if (typeof error === 'object' && error !== null && '$metadata' in error) {
      const metadata = (error as { $metadata?: { httpStatusCode?: number } }).$metadata;
      if (metadata?.httpStatusCode) {
        return `${message} (status ${metadata.httpStatusCode})`;
      }
    }

    if (message.includes('Could not connect to the endpoint URL')) {
      return `${message} (verify region: ${this.region})`;
    }

    const name = (error as { name?: string }).name;
    if (name === 'UnknownEndpoint' || name === 'EndpointError') {
      return `${message} (verify region: ${this.region})`;
    }

    return message;
  }
}

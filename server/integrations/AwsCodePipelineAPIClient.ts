import {
  CodePipelineClient,
  CreatePipelineCommand,
  GetPipelineStateCommand,
  ListPipelinesCommand,
  StartPipelineExecutionCommand,
  StopPipelineExecutionCommand,
  type CodePipelineClientConfig,
  type ActionTypeId,
  type StageDeclaration
} from '@aws-sdk/client-codepipeline';

import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';
import { getErrorMessage } from '../types/common';

interface AwsCodePipelineCredentials extends APICredentials {
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
  codePipelineClient?: CodePipelineClient;
}

interface CreatePipelineParams {
  name: string;
  role_arn: string;
  source_provider: 'GitHub' | 'CodeCommit' | 'S3';
  repository: string;
  branch?: string;
  artifact_bucket?: string;
  artifactBucket?: string;
  oauth_token?: string;
  oauthToken?: string;
}

interface PipelineNameParams {
  name: string;
}

interface StopPipelineParams extends PipelineNameParams {
  execution_id: string;
}

function sanitizeRegion(credentials: AwsCodePipelineCredentials): string {
  return (
    credentials.region ||
    credentials.aws_region ||
    credentials.awsRegion ||
    'us-east-1'
  );
}

function sanitizeAccessKeyId(credentials: AwsCodePipelineCredentials): string | undefined {
  return credentials.access_key_id || credentials.accessKeyId || credentials.apiKey;
}

function sanitizeSecretAccessKey(credentials: AwsCodePipelineCredentials): string | undefined {
  return credentials.secret_access_key || credentials.secretAccessKey || credentials.clientSecret;
}

function sanitizeSessionToken(credentials: AwsCodePipelineCredentials): string | undefined {
  return (
    credentials.session_token ||
    credentials.sessionToken ||
    credentials.aws_session_token ||
    credentials.awsSessionToken ||
    credentials.accessToken
  );
}

export class AwsCodePipelineAPIClient extends BaseAPIClient {
  private readonly client: CodePipelineClient;
  private readonly region: string;

  constructor(credentials: AwsCodePipelineCredentials) {
    const {
      codePipelineClient,
      ...rest
    } = credentials;

    const accessKeyId = sanitizeAccessKeyId(credentials);
    const secretAccessKey = sanitizeSecretAccessKey(credentials);
    const sessionToken = sanitizeSessionToken(credentials);
    const region = sanitizeRegion(credentials);

    if (!accessKeyId) {
      throw new Error('AWS CodePipeline integration requires an access key ID');
    }
    if (!secretAccessKey) {
      throw new Error('AWS CodePipeline integration requires a secret access key');
    }

    super(`https://codepipeline.${region}.amazonaws.com`, rest);

    const config: CodePipelineClientConfig = {
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
        sessionToken
      }
    };

    this.client = codePipelineClient ?? new CodePipelineClient(config);
    this.region = region;

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_pipeline': this.createPipeline.bind(this) as any,
      'start_pipeline': this.startPipeline.bind(this) as any,
      'get_pipeline_state': this.getPipelineState.bind(this) as any,
      'stop_pipeline': this.stopPipeline.bind(this) as any
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {};
  }

  public async testConnection(): Promise<APIResponse<any>> {
    try {
      const response = await this.client.send(new ListPipelinesCommand({ MaxResults: 1 }));
      return {
        success: true,
        data: {
          pipelineCount: response.pipelines?.length ?? 0,
          nextToken: response.nextToken
        }
      };
    } catch (error) {
      return {
        success: false,
        error: this.formatAwsError(error)
      };
    }
  }

  public async createPipeline(params: CreatePipelineParams): Promise<APIResponse<any>> {
    try {
      this.validateRequiredParams(params as Record<string, any>, ['name', 'role_arn', 'source_provider', 'repository']);

      const pipeline = this.buildPipelineDefinition(params);
      const response = await this.client.send(new CreatePipelineCommand({ pipeline }));
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

  public async startPipeline(params: PipelineNameParams): Promise<APIResponse<any>> {
    try {
      this.validateRequiredParams(params as Record<string, any>, ['name']);

      const response = await this.client.send(new StartPipelineExecutionCommand({
        name: params.name
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

  public async getPipelineState(params: PipelineNameParams): Promise<APIResponse<any>> {
    try {
      this.validateRequiredParams(params as Record<string, any>, ['name']);

      const response = await this.client.send(new GetPipelineStateCommand({
        name: params.name
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

  public async stopPipeline(params: StopPipelineParams): Promise<APIResponse<any>> {
    try {
      this.validateRequiredParams(params as Record<string, any>, ['name', 'execution_id']);

      const response = await this.client.send(new StopPipelineExecutionCommand({
        name: params.name,
        pipelineExecutionId: params.execution_id
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

  private buildPipelineDefinition(
    params: CreatePipelineParams
  ): { name: string; roleArn: string; artifactStore: { type: string; location: string }; stages: StageDeclaration[] } {
    const artifactBucket =
      params.artifact_bucket ||
      params.artifactBucket ||
      (params.source_provider === 'S3' ? params.repository : `${params.name}-artifacts`);

    const sourceStage: StageDeclaration = {
      name: 'Source',
      actions: [
        {
          name: 'Source',
          actionTypeId: this.getSourceActionType(params.source_provider),
          configuration: this.getSourceConfiguration(params),
          outputArtifacts: [{ name: 'SourceOutput' }]
        }
      ]
    };

    const buildStage: StageDeclaration = {
      name: 'Build',
      actions: [
        {
          name: 'Build',
          actionTypeId: {
            category: 'Build',
            owner: 'AWS',
            provider: 'CodeBuild',
            version: '1'
          } as ActionTypeId,
          inputArtifacts: [{ name: 'SourceOutput' }],
          outputArtifacts: [{ name: 'BuildOutput' }]
        }
      ]
    };

    const deployStage: StageDeclaration = {
      name: 'Deploy',
      actions: [
        {
          name: 'Deploy',
          actionTypeId: {
            category: 'Deploy',
            owner: 'AWS',
            provider: 'CodeDeploy',
            version: '1'
          } as ActionTypeId,
          inputArtifacts: [{ name: 'BuildOutput' }]
        }
      ]
    };

    return {
      name: params.name,
      roleArn: params.role_arn,
      artifactStore: {
        type: 'S3',
        location: artifactBucket
      },
      stages: [sourceStage, buildStage, deployStage]
    };
  }

  private getSourceActionType(provider: CreatePipelineParams['source_provider']): ActionTypeId {
    switch (provider) {
      case 'GitHub':
        return { category: 'Source', owner: 'ThirdParty', provider: 'GitHub', version: '1' };
      case 'CodeCommit':
        return { category: 'Source', owner: 'AWS', provider: 'CodeCommit', version: '1' };
      case 'S3':
        return { category: 'Source', owner: 'AWS', provider: 'S3', version: '1' };
      default:
        throw new Error(`Unsupported source provider: ${provider}`);
    }
  }

  private getSourceConfiguration(params: CreatePipelineParams): Record<string, string> {
    switch (params.source_provider) {
      case 'GitHub':
        return {
          Owner: params.repository.split('/')[0] ?? '',
          Repo: params.repository.split('/')[1] ?? '',
          Branch: params.branch ?? 'main',
          ...(params.oauth_token || params.oauthToken || this.credentials.accessToken
            ? { OAuthToken: params.oauth_token || params.oauthToken || String(this.credentials.accessToken || '') }
            : {})
        };
      case 'CodeCommit':
        return {
          RepositoryName: params.repository,
          BranchName: params.branch ?? 'main'
        };
      case 'S3':
        return {
          S3Bucket: params.repository,
          S3ObjectKey: params.branch ?? 'latest'
        };
      default:
        return {};
    }
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

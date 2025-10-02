import { createRequire } from 'module';

import { BaseAPIClient, APIResponse } from './BaseAPIClient';
import { getErrorMessage } from '../types/common';
import { AwsSharedCredentials } from './AwsCloudFormationAPIClient';

const require = createRequire(import.meta.url);

type CodePipelineClientLike = { send(command: any): Promise<any> };

type PipelineDeclarationLike = Record<string, any>;
type StageDeclarationLike = Record<string, any>;
type ArtifactStoreLike = Record<string, any>;

export interface AwsCodePipelineAPIClientConfig extends AwsSharedCredentials {
  codePipelineClient?: CodePipelineClientLike;
}

interface CreatePipelineParams {
  name: string;
  role_arn: string;
  source_provider: 'GitHub' | 'CodeCommit' | 'S3';
  repository: string;
  branch?: string;
  artifact_bucket?: string;
  stages?: StageDeclarationLike[];
  artifact_store?: ArtifactStoreLike;
  pipeline_definition?: PipelineDeclarationLike;
  oauth_token?: string;
}

interface StartPipelineParams {
  name: string;
}

interface GetPipelineStateParams {
  name: string;
}

interface StopPipelineParams {
  name: string;
  execution_id: string;
  abandon?: boolean;
  reason?: string;
}

interface CodePipelineSdkModule {
  CodePipelineClient: new (config: any) => CodePipelineClientLike;
  CreatePipelineCommand: new (input: any) => any;
  StartPipelineExecutionCommand: new (input: any) => any;
  GetPipelineStateCommand: new (input: any) => any;
  StopPipelineExecutionCommand: new (input: any) => any;
  ListPipelinesCommand: new (input: any) => any;
}

interface CodePipelineCommandConstructors {
  CreatePipelineCommand: new (input: any) => any;
  StartPipelineExecutionCommand: new (input: any) => any;
  GetPipelineStateCommand: new (input: any) => any;
  StopPipelineExecutionCommand: new (input: any) => any;
  ListPipelinesCommand: new (input: any) => any;
}

export class AwsCodePipelineAPIClient extends BaseAPIClient {
  private client: CodePipelineClientLike;
  private region: string;
  private sdkModule: CodePipelineSdkModule | null | undefined;
  private commandConstructors: CodePipelineCommandConstructors | undefined;

  constructor(config: AwsCodePipelineAPIClientConfig) {
    const region = AwsCodePipelineAPIClient.extractRegion(config);
    super(`https://codepipeline.${region}.amazonaws.com`, config);

    this.region = region;
    this.client = config.codePipelineClient ?? this.createClient(config);

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this),
      'create_pipeline': this.createPipeline.bind(this),
      'start_pipeline': this.startPipeline.bind(this),
      'get_pipeline_state': this.getPipelineState.bind(this),
      'stop_pipeline': this.stopPipeline.bind(this),
      'pipeline_started': this.getPipelineState.bind(this),
      'pipeline_succeeded': this.getPipelineState.bind(this),
      'pipeline_failed': this.getPipelineState.bind(this)
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {};
  }

  public override updateCredentials(credentials: AwsCodePipelineAPIClientConfig): void {
    super.updateCredentials(credentials);
    this.region = AwsCodePipelineAPIClient.extractRegion({ ...this.credentials, ...credentials });
    this.client = credentials.codePipelineClient ?? this.createClient({ ...this.credentials, ...credentials });
  }

  public async testConnection(): Promise<APIResponse<{ pipelineCount: number; region: string }>> {
    try {
      const { ListPipelinesCommand } = this.getCommandConstructors();
      const response = await this.client.send(new ListPipelinesCommand({ maxResults: 1 }));
      return {
        success: true,
        data: {
          pipelineCount: Array.isArray(response.pipelines) ? response.pipelines.length : 0,
          region: this.region
        }
      };
    } catch (error) {
      return this.toErrorResponse(error);
    }
  }

  public async createPipeline(params: CreatePipelineParams): Promise<APIResponse<{ pipeline: PipelineDeclarationLike }>> {
    this.validateRequiredParams(params, ['name', 'role_arn', 'source_provider', 'repository']);

    try {
      const pipeline = params.pipeline_definition ?? this.buildPipelineDefinition(params);
      const { CreatePipelineCommand } = this.getCommandConstructors();
      const response = await this.client.send(new CreatePipelineCommand({ pipeline }));
      return {
        success: true,
        data: {
          pipeline: response.pipeline ?? pipeline
        }
      };
    } catch (error) {
      return this.toErrorResponse(error);
    }
  }

  public async startPipeline(params: StartPipelineParams): Promise<APIResponse<{ executionId?: string; pipelineName: string }>> {
    this.validateRequiredParams(params, ['name']);

    try {
      const { StartPipelineExecutionCommand } = this.getCommandConstructors();
      const response = await this.client.send(new StartPipelineExecutionCommand({ name: params.name }));
      return {
        success: true,
        data: {
          executionId: response.pipelineExecutionId,
          pipelineName: params.name
        }
      };
    } catch (error) {
      return this.toErrorResponse(error);
    }
  }

  public async getPipelineState(params: GetPipelineStateParams): Promise<APIResponse<{ pipelineName: string; stageStates?: any[] }>> {
    this.validateRequiredParams(params, ['name']);

    try {
      const { GetPipelineStateCommand } = this.getCommandConstructors();
      const response = await this.client.send(new GetPipelineStateCommand({ name: params.name }));
      return {
        success: true,
        data: {
          pipelineName: params.name,
          stageStates: response.stageStates
        }
      };
    } catch (error) {
      return this.toErrorResponse(error);
    }
  }

  public async stopPipeline(params: StopPipelineParams): Promise<APIResponse<{ pipelineName: string; executionId: string }>> {
    this.validateRequiredParams(params, ['name', 'execution_id']);

    try {
      const { StopPipelineExecutionCommand } = this.getCommandConstructors();
      await this.client.send(new StopPipelineExecutionCommand({
        pipelineName: params.name,
        pipelineExecutionId: params.execution_id,
        abandon: params.abandon,
        reason: params.reason
      }));

      return {
        success: true,
        data: {
          pipelineName: params.name,
          executionId: params.execution_id
        }
      };
    } catch (error) {
      return this.toErrorResponse(error);
    }
  }

  private createClient(config: AwsCodePipelineAPIClientConfig): CodePipelineClientLike {
    const credentials = AwsCodePipelineAPIClient.extractCredentialSet(config);
    if (!credentials.accessKeyId || !credentials.secretAccessKey) {
      throw new Error('AWS CodePipeline requires access_key_id and secret_access_key credentials');
    }

    const sdk = this.tryLoadSdk();
    if (!sdk) {
      throw new Error('Failed to load @aws-sdk/client-codepipeline. Install the dependency or provide a codePipelineClient instance.');
    }

    return new sdk.CodePipelineClient({
      region: this.region,
      credentials
    });
  }

  private buildPipelineDefinition(params: CreatePipelineParams): PipelineDeclarationLike {
    const artifactStore: ArtifactStoreLike = params.artifact_store ?? {
      type: 'S3',
      location: params.artifact_bucket ?? `${params.name.toLowerCase()}-artifacts`
    };

    const stages = params.stages ?? [this.buildSourceStage(params)];

    return {
      name: params.name,
      roleArn: params.role_arn,
      artifactStore,
      stages,
      version: params.pipeline_definition?.version
    };
  }

  private buildSourceStage(params: CreatePipelineParams): StageDeclarationLike {
    const provider = params.source_provider;
    const configuration: Record<string, string> = {};

    if (provider === 'CodeCommit') {
      configuration.RepositoryName = params.repository;
      configuration.BranchName = params.branch ?? 'main';
    } else if (provider === 'GitHub') {
      const [owner, repo] = params.repository.split('/');
      if (!owner || !repo) {
        throw new Error('GitHub repository must be provided in owner/repo format');
      }
      configuration.Owner = owner;
      configuration.Repo = repo;
      configuration.Branch = params.branch ?? 'main';
      const token = params.oauth_token || this.resolveOAuthToken();
      if (token) {
        configuration.OAuthToken = token;
      }
    } else if (provider === 'S3') {
      configuration.S3Bucket = params.repository;
      configuration.S3ObjectKey = params.branch ?? 'pipeline.zip';
    }

    return {
      name: 'Source',
      actions: [
        {
          name: 'Source',
          actionTypeId: {
            category: 'Source',
            owner: provider === 'S3' ? 'AWS' : provider === 'CodeCommit' ? 'AWS' : 'ThirdParty',
            provider,
            version: '1'
          },
          outputArtifacts: [
            {
              name: 'SourceArtifact'
            }
          ],
          configuration,
          runOrder: 1
        }
      ]
    };
  }

  private resolveOAuthToken(): string | undefined {
    return (
      (this.credentials as AwsSharedCredentials).oauth_token as string | undefined ??
      (this.credentials as AwsSharedCredentials).accessToken ??
      (this.credentials as AwsSharedCredentials).token
    );
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

  private tryLoadSdk(): CodePipelineSdkModule | null {
    if (this.sdkModule !== undefined) {
      return this.sdkModule;
    }

    try {
      const mod = require('@aws-sdk/client-codepipeline') as CodePipelineSdkModule;
      this.sdkModule = mod;
      return mod;
    } catch (error) {
      this.sdkModule = null;
      return null;
    }
  }

  private getCommandConstructors(): CodePipelineCommandConstructors {
    if (!this.commandConstructors) {
      const sdk = this.tryLoadSdk();
      if (sdk) {
        this.commandConstructors = {
          CreatePipelineCommand: sdk.CreatePipelineCommand,
          StartPipelineExecutionCommand: sdk.StartPipelineExecutionCommand,
          GetPipelineStateCommand: sdk.GetPipelineStateCommand,
          StopPipelineExecutionCommand: sdk.StopPipelineExecutionCommand,
          ListPipelinesCommand: sdk.ListPipelinesCommand
        };
      } else {
        class CreatePipelineCommand { constructor(public input: any) {} }
        class StartPipelineExecutionCommand { constructor(public input: any) {} }
        class GetPipelineStateCommand { constructor(public input: any) {} }
        class StopPipelineExecutionCommand { constructor(public input: any) {} }
        class ListPipelinesCommand { constructor(public input: any) {} }
        this.commandConstructors = {
          CreatePipelineCommand,
          StartPipelineExecutionCommand,
          GetPipelineStateCommand,
          StopPipelineExecutionCommand,
          ListPipelinesCommand
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

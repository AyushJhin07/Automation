export interface CodePipelineClientConfig {
  region?: string;
  credentials?: {
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
  };
}

export interface ActionTypeId {
  category: string;
  owner: string;
  provider: string;
  version: string;
}

export interface ArtifactDeclaration {
  name: string;
}

export interface ActionDeclaration {
  name: string;
  actionTypeId: ActionTypeId;
  configuration?: Record<string, any>;
  inputArtifacts?: ArtifactDeclaration[];
  outputArtifacts?: ArtifactDeclaration[];
}

export interface StageDeclaration {
  name: string;
  actions: ActionDeclaration[];
}

class BaseCommand<TInput = Record<string, any>> {
  public readonly input: TInput;

  constructor(input: TInput) {
    this.input = input;
  }
}

export class CodePipelineClient {
  public readonly config: CodePipelineClientConfig;

  constructor(config: CodePipelineClientConfig = {}) {
    this.config = config;
  }

  async send(): Promise<never> {
    throw new Error(
      'CodePipelineClient stub cannot execute commands. Install @aws-sdk/client-codepipeline to enable live operations.'
    );
  }
}

export class CreatePipelineCommand<TInput = Record<string, any>> extends BaseCommand<TInput> {}
export class GetPipelineStateCommand<TInput = Record<string, any>> extends BaseCommand<TInput> {}
export class ListPipelinesCommand<TInput = Record<string, any>> extends BaseCommand<TInput> {}
export class StartPipelineExecutionCommand<TInput = Record<string, any>> extends BaseCommand<TInput> {}
export class StopPipelineExecutionCommand<TInput = Record<string, any>> extends BaseCommand<TInput> {}

export interface CloudFormationClientConfig {
  region?: string;
  credentials?: {
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
  };
}

class BaseCommand<TInput = Record<string, any>> {
  public readonly input: TInput;

  constructor(input: TInput) {
    this.input = input;
  }
}

export class CloudFormationClient {
  public readonly config: CloudFormationClientConfig;

  constructor(config: CloudFormationClientConfig = {}) {
    this.config = config;
  }

  async send(): Promise<never> {
    throw new Error(
      'CloudFormationClient stub cannot execute commands. Install @aws-sdk/client-cloudformation to enable live operations.'
    );
  }
}

export class CreateStackCommand<TInput = Record<string, any>> extends BaseCommand<TInput> {}
export class UpdateStackCommand<TInput = Record<string, any>> extends BaseCommand<TInput> {}
export class DeleteStackCommand<TInput = Record<string, any>> extends BaseCommand<TInput> {}
export class DescribeStacksCommand<TInput = Record<string, any>> extends BaseCommand<TInput> {}
export class ListStacksCommand<TInput = Record<string, any>> extends BaseCommand<TInput> {}

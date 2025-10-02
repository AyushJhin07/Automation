import assert from 'node:assert/strict';

import { AwsCloudFormationAPIClient } from '../AwsCloudFormationAPIClient.js';
import { AwsCodePipelineAPIClient } from '../AwsCodePipelineAPIClient.js';

class CloudFormationStub {
  public commands: any[] = [];

  constructor(private readonly behaviour: Record<string, any> = {}) {}

  async send(command: any): Promise<any> {
    this.commands.push(command);
    const name = command.constructor.name;

    if (name in this.behaviour) {
      const handler = this.behaviour[name];
      if (handler instanceof Error) {
        throw handler;
      }
      if (typeof handler === 'function') {
        return handler(command);
      }
      return handler;
    }

    switch (name) {
      case 'ListStacksCommand':
        return { StackSummaries: [] };
      case 'CreateStackCommand':
        return { StackId: 'arn:aws:cloudformation:us-west-2:123:stack/demo/1' };
      case 'UpdateStackCommand':
        return { StackId: 'arn:aws:cloudformation:us-west-2:123:stack/demo/1' };
      case 'DeleteStackCommand':
        return {};
      case 'DescribeStacksCommand':
        return {
          Stacks: [
            {
              StackName: command.input.StackName,
              StackStatus: 'CREATE_COMPLETE',
              Outputs: [{ OutputKey: 'Bucket', OutputValue: 'demo-bucket' }]
            }
          ]
        };
      default:
        throw new Error(`Unhandled CloudFormation command: ${name}`);
    }
  }
}

class CodePipelineStub {
  public commands: any[] = [];

  constructor(private readonly behaviour: Record<string, any> = {}) {}

  async send(command: any): Promise<any> {
    this.commands.push(command);
    const name = command.constructor.name;

    if (name in this.behaviour) {
      const handler = this.behaviour[name];
      if (handler instanceof Error) {
        throw handler;
      }
      if (typeof handler === 'function') {
        return handler(command);
      }
      return handler;
    }

    switch (name) {
      case 'ListPipelinesCommand':
        return { pipelines: [{ name: 'demo', version: 1 }] };
      case 'CreatePipelineCommand':
        return { pipeline: command.input.pipeline };
      case 'StartPipelineExecutionCommand':
        return { pipelineExecutionId: 'exec-123' };
      case 'GetPipelineStateCommand':
        return { stageStates: [{ stageName: 'Source', latestExecution: { status: 'Succeeded' } }] };
      case 'StopPipelineExecutionCommand':
        return {};
      default:
        throw new Error(`Unhandled CodePipeline command: ${name}`);
    }
  }
}

function createAwsError(message: string, statusCode: number): Error {
  const error = new Error(message) as Error & { $metadata?: { httpStatusCode?: number } };
  error.$metadata = { httpStatusCode: statusCode };
  return error;
}

// ===== CloudFormation client tests =====
const cfStub = new CloudFormationStub();
const cloudFormationClient = new AwsCloudFormationAPIClient({
  access_key_id: 'AKIATESTKEY',
  secret_access_key: 'secret',
  region: 'us-west-2',
  cloudFormationClient: cfStub as any
});

const cfTestResult = await cloudFormationClient.testConnection();
assert.equal(cfTestResult.success, true, 'CloudFormation testConnection should succeed with stub');
assert.equal(cfTestResult.data?.region, 'us-west-2');

const cfCreate = await cloudFormationClient.createStack({
  stack_name: 'demo-stack',
  template_body: '{}'
});
assert.equal(cfCreate.success, true, 'createStack should succeed with stub');
assert.equal(cfCreate.data?.stackName, 'demo-stack');

const createCommand = cfStub.commands.find(cmd => cmd.constructor.name === 'CreateStackCommand');
assert.ok(createCommand, 'CreateStackCommand should be invoked');
assert.equal(createCommand.input.StackName, 'demo-stack');

await cloudFormationClient.updateStack({
  stack_name: 'demo-stack'
});
const updateCommand = cfStub.commands.find(cmd => cmd.constructor.name === 'UpdateStackCommand');
assert.ok(updateCommand, 'UpdateStackCommand should be invoked');
assert.equal(updateCommand.input.UsePreviousTemplate, true, 'Update stack without template should use previous template');

const cfStatus = await cloudFormationClient.getStackStatus({ stack_name: 'demo-stack' });
assert.equal(cfStatus.success, true, 'getStackStatus should succeed');
assert.equal(cfStatus.data?.status, 'CREATE_COMPLETE');

const cfDelete = await cloudFormationClient.deleteStack({ stack_name: 'demo-stack' });
assert.equal(cfDelete.success, true, 'deleteStack should succeed');

const errorStub = new CloudFormationStub({
  CreateStackCommand: createAwsError('AccessDenied', 403)
});
const cfErrorClient = new AwsCloudFormationAPIClient({
  access_key_id: 'AKIATESTKEY',
  secret_access_key: 'secret',
  region: 'ap-south-1',
  cloudFormationClient: errorStub as any
});

const cfError = await cfErrorClient.createStack({ stack_name: 'error-stack', template_body: '{}' });
assert.equal(cfError.success, false, 'createStack should bubble AWS errors');
assert.ok(cfError.error?.includes('ap-south-1'), 'Error message should include region context');
assert.equal(cfError.statusCode, 403, 'Status code should surface from AWS metadata');

// ===== CodePipeline client tests =====
const pipelineStub = new CodePipelineStub();
const pipelineClient = new AwsCodePipelineAPIClient({
  access_key_id: 'AKIATESTKEY',
  secret_access_key: 'secret',
  region: 'us-east-2',
  codePipelineClient: pipelineStub as any
});

const pipelineTest = await pipelineClient.testConnection();
assert.equal(pipelineTest.success, true, 'testConnection should succeed for CodePipeline');
assert.equal(pipelineTest.data?.region, 'us-east-2');

const pipelineCreate = await pipelineClient.createPipeline({
  name: 'demo-pipeline',
  role_arn: 'arn:aws:iam::123456789012:role/demo',
  source_provider: 'CodeCommit',
  repository: 'demo-repo',
  branch: 'main',
  artifact_bucket: 'demo-artifacts'
});
assert.equal(pipelineCreate.success, true, 'createPipeline should succeed with stub');
const pipelineCommand = pipelineStub.commands.find(cmd => cmd.constructor.name === 'CreatePipelineCommand');
assert.ok(pipelineCommand, 'CreatePipelineCommand should be invoked');
assert.equal(pipelineCommand.input.pipeline.artifactStore.location, 'demo-artifacts');

const pipelineStart = await pipelineClient.startPipeline({ name: 'demo-pipeline' });
assert.equal(pipelineStart.success, true, 'startPipeline should succeed');
assert.equal(pipelineStart.data?.executionId, 'exec-123');

const pipelineState = await pipelineClient.getPipelineState({ name: 'demo-pipeline' });
assert.equal(pipelineState.success, true, 'getPipelineState should succeed');
assert.equal(pipelineState.data?.stageStates?.[0]?.stageName, 'Source');

const pipelineStop = await pipelineClient.stopPipeline({ name: 'demo-pipeline', execution_id: 'exec-123' });
assert.equal(pipelineStop.success, true, 'stopPipeline should succeed');

const failingPipelineStub = new CodePipelineStub({
  StartPipelineExecutionCommand: createAwsError('ThrottlingException', 400)
});
const pipelineErrorClient = new AwsCodePipelineAPIClient({
  access_key_id: 'AKIATESTKEY',
  secret_access_key: 'secret',
  region: 'eu-west-3',
  codePipelineClient: failingPipelineStub as any
});

const pipelineError = await pipelineErrorClient.startPipeline({ name: 'broken' });
assert.equal(pipelineError.success, false, 'startPipeline should surface AWS errors');
assert.ok(pipelineError.error?.includes('eu-west-3'), 'Pipeline error should include region details');
assert.equal(pipelineError.statusCode, 400);

console.log('AWS CloudFormation and CodePipeline client contract tests passed.');

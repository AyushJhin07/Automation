import assert from 'node:assert/strict';

import {
  CreateStackCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
  ListStacksCommand,
  UpdateStackCommand
} from '@aws-sdk/client-cloudformation';
import {
  CreatePipelineCommand,
  GetPipelineStateCommand,
  ListPipelinesCommand,
  StartPipelineExecutionCommand,
  StopPipelineExecutionCommand
} from '@aws-sdk/client-codepipeline';

import { AwsCloudFormationAPIClient } from '../AwsCloudFormationAPIClient.js';
import { AwsCodePipelineAPIClient } from '../AwsCodePipelineAPIClient.js';
import { getRuntimeOpHandler } from '../../workflow/compiler/op-map.js';

class StubAwsClient<TCommand = any> {
  public readonly sent: TCommand[] = [];
  private readonly responses: Array<any>;

  constructor(responses: Array<any>) {
    this.responses = [...responses];
  }

  async send(command: TCommand): Promise<any> {
    this.sent.push(command);
    if (this.responses.length === 0) {
      return {};
    }
    const next = this.responses.shift();
    if (typeof next === 'function') {
      return next(command);
    }
    if (next instanceof Error) {
      throw next;
    }
    if (next && typeof next === 'object' && 'error' in next) {
      throw (next as { error: Error }).error;
    }
    return next;
  }
}

async function testCloudFormationClient(): Promise<void> {
  const stub = new StubAwsClient([
    (command: unknown) => {
      assert.ok(command instanceof ListStacksCommand, 'First command should be ListStacksCommand');
      return { StackSummaries: [{ StackId: '1' }] };
    },
    (command: unknown) => {
      assert.ok(command instanceof CreateStackCommand, 'Second command should be CreateStackCommand');
      const input = (command as CreateStackCommand).input;
      assert.equal(input.StackName, 'demo-stack');
      assert.equal(input.TemplateBody, '{"Resources":{}}');
      assert.deepEqual(input.Capabilities, ['CAPABILITY_IAM']);
      return { StackId: 'stack/123' };
    },
    (command: unknown) => {
      assert.ok(command instanceof UpdateStackCommand, 'Third command should be UpdateStackCommand');
      const input = (command as UpdateStackCommand).input;
      assert.equal(input.StackName, 'demo-stack');
      assert.equal(input.TemplateURL, 'https://example.com/template.yaml');
      return { StackId: 'stack/123' };
    },
    (command: unknown) => {
      assert.ok(command instanceof DescribeStacksCommand, 'Fourth command should be DescribeStacksCommand');
      const input = (command as DescribeStacksCommand).input;
      assert.equal(input.StackName, 'demo-stack');
      return {
        Stacks: [
          {
            StackId: 'stack/123',
            StackName: 'demo-stack',
            StackStatus: 'CREATE_COMPLETE',
            StackStatusReason: 'OK',
            LastUpdatedTime: new Date('2024-01-02T00:00:00.000Z'),
            CreationTime: new Date('2024-01-01T00:00:00.000Z')
          }
        ]
      };
    },
    (command: unknown) => {
      assert.ok(command instanceof DeleteStackCommand, 'Fifth command should be DeleteStackCommand');
      const input = (command as DeleteStackCommand).input;
      assert.equal(input.StackName, 'demo-stack');
      return {};
    },
    new Proxy(new Error('Could not connect to the endpoint URL: "https://cloudformation.us-west-2.amazonaws.com"'), {
      get(target, prop) {
        if (prop === 'name') return 'UnknownEndpoint';
        return Reflect.get(target, prop);
      }
    })
  ]);

  const client = new AwsCloudFormationAPIClient({
    access_key_id: 'AKIA123',
    secret_access_key: 'secret',
    region: 'us-west-2',
    cloudFormationClient: stub as unknown as any
  });

  const ping = await client.testConnection();
  assert.equal(ping.success, true, 'CloudFormation test connection should succeed');
  assert.equal(ping.data?.stackCount, 1);

  const createResult = await client.createStack({
    stack_name: 'demo-stack',
    template_body: '{"Resources":{}}',
    capabilities: ['CAPABILITY_IAM']
  });
  assert.equal(createResult.success, true, 'CloudFormation create stack should succeed');

  const updateResult = await client.updateStack({
    stack_name: 'demo-stack',
    template_url: 'https://example.com/template.yaml'
  });
  assert.equal(updateResult.success, true, 'CloudFormation update stack should succeed');

  const status = await client.getStackStatus({ stack_name: 'demo-stack' });
  assert.equal(status.success, true, 'CloudFormation get stack status should succeed');
  assert.equal(status.data?.stackStatus, 'CREATE_COMPLETE');

  const deletion = await client.deleteStack({ stack_name: 'demo-stack' });
  assert.equal(deletion.success, true, 'CloudFormation delete stack should succeed');

  const regionError = await client.testConnection();
  assert.equal(regionError.success, false, 'Region failure should surface as error');
  assert.ok(
    regionError.error?.includes('verify region: us-west-2'),
    'Error should include region guidance'
  );

  const runtimeHandler = getRuntimeOpHandler('action.aws-cloudformation:create_stack');
  assert.ok(runtimeHandler, 'Runtime handler for CloudFormation create should exist');
  const runtimeStub = new StubAwsClient([
    () => ({ StackId: 'stack/456' })
  ]);
  const runtimeClient = new AwsCloudFormationAPIClient({
    access_key_id: 'AKIA456',
    secret_access_key: 'secret',
    region: 'us-west-2',
    cloudFormationClient: runtimeStub as unknown as any
  });
  const runtimeResult = await runtimeHandler!(runtimeClient, {
    stack_name: 'runtime-stack',
    template_body: '{"Resources":{}}'
  });
  assert.equal(runtimeResult.success, true, 'Runtime handler should delegate to client');
  assert.equal(runtimeStub.sent.length, 1, 'Runtime handler should trigger AWS call');
}

async function testCodePipelineClient(): Promise<void> {
  const stub = new StubAwsClient([
    (command: unknown) => {
      assert.ok(command instanceof ListPipelinesCommand, 'First command should be ListPipelinesCommand');
      return { pipelines: [{ name: 'existing' }] };
    },
    (command: unknown) => {
      assert.ok(command instanceof CreatePipelineCommand, 'Second command should be CreatePipelineCommand');
      const input = (command as CreatePipelineCommand).input;
      assert.equal(input.pipeline?.name, 'deploy');
      assert.equal(input.pipeline?.roleArn, 'arn:aws:iam::123:role/pipeline');
      assert.equal(input.pipeline?.artifactStore?.location, 'deployment-artifacts');
      assert.equal(
        input.pipeline?.stages?.[0]?.actions?.[0]?.configuration?.OAuthToken,
        'ghp_test'
      );
      return { pipeline: { name: 'deploy' } };
    },
    (command: unknown) => {
      assert.ok(command instanceof StartPipelineExecutionCommand, 'Third command should be StartPipelineExecutionCommand');
      const input = (command as StartPipelineExecutionCommand).input;
      assert.equal(input.name, 'deploy');
      return { pipelineExecutionId: 'exe-1' };
    },
    (command: unknown) => {
      assert.ok(command instanceof GetPipelineStateCommand, 'Fourth command should be GetPipelineStateCommand');
      const input = (command as GetPipelineStateCommand).input;
      assert.equal(input.name, 'deploy');
      return { pipelineName: 'deploy', stageStates: [] };
    },
    (command: unknown) => {
      assert.ok(command instanceof StopPipelineExecutionCommand, 'Fifth command should be StopPipelineExecutionCommand');
      const input = (command as StopPipelineExecutionCommand).input;
      assert.equal(input.name, 'deploy');
      assert.equal(input.pipelineExecutionId, 'exe-1');
      return {};
    },
    new Proxy(new Error('Could not connect to the endpoint URL: "https://codepipeline.us-west-2.amazonaws.com"'), {
      get(target, prop) {
        if (prop === 'name') return 'EndpointError';
        return Reflect.get(target, prop);
      }
    })
  ]);

  const client = new AwsCodePipelineAPIClient({
    access_key_id: 'AKIA789',
    secret_access_key: 'secret',
    region: 'us-west-2',
    accessToken: 'gh-token',
    codePipelineClient: stub as unknown as any
  });

  const ping = await client.testConnection();
  assert.equal(ping.success, true, 'CodePipeline test connection should succeed');
  assert.equal(ping.data?.pipelineCount, 1);

  const createResult = await client.createPipeline({
    name: 'deploy',
    role_arn: 'arn:aws:iam::123:role/pipeline',
    source_provider: 'GitHub',
    repository: 'octo/repo',
    branch: 'main',
    artifact_bucket: 'deployment-artifacts',
    oauth_token: 'ghp_test'
  });
  assert.equal(createResult.success, true, 'CodePipeline create should succeed');

  const start = await client.startPipeline({ name: 'deploy' });
  assert.equal(start.success, true, 'Start pipeline should succeed');

  const state = await client.getPipelineState({ name: 'deploy' });
  assert.equal(state.success, true, 'Get pipeline state should succeed');

  const stop = await client.stopPipeline({ name: 'deploy', execution_id: 'exe-1' });
  assert.equal(stop.success, true, 'Stop pipeline should succeed');

  const regionError = await client.testConnection();
  assert.equal(regionError.success, false, 'Region failure should surface as error');
  assert.ok(
    regionError.error?.includes('verify region: us-west-2'),
    'CodePipeline error should include region guidance'
  );

  const runtimeHandler = getRuntimeOpHandler('action.aws-codepipeline:start_pipeline');
  assert.ok(runtimeHandler, 'Runtime handler for start pipeline should exist');
  const runtimeStub = new StubAwsClient([
    () => ({ pipelineExecutionId: 'exe-2' })
  ]);
  const runtimeClient = new AwsCodePipelineAPIClient({
    access_key_id: 'AKIA000',
    secret_access_key: 'secret',
    region: 'us-west-2',
    codePipelineClient: runtimeStub as unknown as any
  });
  const runtimeResult = await runtimeHandler!(runtimeClient, { name: 'deploy' });
  assert.equal(runtimeResult.success, true, 'Runtime handler should delegate to CodePipeline client');
  assert.equal(runtimeStub.sent.length, 1, 'Runtime handler should trigger AWS call');
}

await testCloudFormationClient();
await testCodePipelineClient();

console.log('AWS CloudFormation and CodePipeline client tests passed.');

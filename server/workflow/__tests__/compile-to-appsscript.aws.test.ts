import assert from 'node:assert/strict';

import { compileToAppsScript } from '../compile-to-appsscript';
import { WorkflowGraph } from '../../../common/workflow-types';

const graph: WorkflowGraph = {
  id: 'aws-compiler-graph',
  name: 'AWS compiler coverage',
  nodes: [
    {
      id: 'cf-create',
      type: 'action.aws-cloudformation',
      app: 'aws-cloudformation',
      op: 'action.aws-cloudformation:create_stack',
      params: { stack_name: 'demo-stack', template_body: '{}' },
      data: { operation: 'create_stack' }
    },
    {
      id: 'cf-status',
      type: 'action.aws-cloudformation',
      app: 'aws-cloudformation',
      op: 'action.aws-cloudformation:get_stack_status',
      params: { stack_name: 'demo-stack' },
      data: { operation: 'get_stack_status' }
    },
    {
      id: 'cp-start',
      type: 'action.aws-codepipeline',
      app: 'aws-codepipeline',
      op: 'action.aws-codepipeline:start_pipeline',
      params: { name: 'demo-pipeline' },
      data: { operation: 'start_pipeline' }
    },
    {
      id: 'cp-trigger',
      type: 'trigger.aws-codepipeline',
      app: 'aws-codepipeline',
      op: 'trigger.aws-codepipeline:pipeline_failed',
      params: {},
      data: { operation: 'pipeline_failed' }
    }
  ],
  edges: [],
  meta: {}
};

const result = compileToAppsScript(graph);
const codeFile = result.files.find(file => file.path === 'Code.gs');
assert.ok(codeFile, 'Code.gs should be generated for AWS compiler bindings');

const code = codeFile!.content;

assert.ok(
  code.includes("codepipelineError: message + ' (region: ' + region + ')"),
  'CodePipeline errors should include region context'
);
assert.ok(
  code.includes("cloudformationError: message + ' (region: ' + region + ')"),
  'CloudFormation errors should include region context'
);
assert.ok(
  code.includes('stackCreated: true, stackName, region'),
  'CloudFormation stack creation should record region'
);
assert.ok(
  code.includes('codepipelineTrigger: operation, pipelineName, region'),
  'CodePipeline triggers should persist region information'
);

console.log('AWS compiler bindings verified for CodePipeline and CloudFormation.');

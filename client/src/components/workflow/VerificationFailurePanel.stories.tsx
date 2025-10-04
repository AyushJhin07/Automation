import React from 'react';
import { VerificationFailurePanel } from './VerificationFailurePanel';

const sampleFailures = [
  {
    id: 'fail-1',
    webhookId: 'hook-1',
    workflowId: 'wf-1',
    status: 'failed',
    reason: 'SIGNATURE_MISMATCH',
    message: 'Signature mismatch detected during verification',
    provider: 'slack',
    timestamp: '2024-01-01T00:00:00.000Z',
    metadata: { signatureHeader: 'x-slack-signature', providedSignature: 'v0=abc123', timestampSkewSeconds: 30 },
  },
  {
    id: 'fail-2',
    webhookId: 'hook-1',
    workflowId: 'wf-1',
    status: 'failed',
    reason: 'MISSING_SECRET',
    message: 'Webhook secret is not configured',
    provider: 'slack',
    timestamp: '2024-01-02T12:34:56.000Z',
    metadata: {},
  },
];

const Template = (args: React.ComponentProps<typeof VerificationFailurePanel>) => (
  <div className="max-w-2xl">
    <VerificationFailurePanel {...args} />
  </div>
);

export default {
  title: 'Workflow/VerificationFailurePanel',
  component: VerificationFailurePanel,
};

export const DefaultState = Template.bind({});
DefaultState.args = {
  failures: sampleFailures,
  filter: 'all',
  onFilterChange: () => {},
  showEmptyState: true,
};

export const LoadingState = Template.bind({});
LoadingState.args = {
  failures: sampleFailures,
  filter: 'all',
  onFilterChange: () => {},
  loading: true,
  showEmptyState: true,
};

export const EmptyState = Template.bind({});
EmptyState.args = {
  failures: [],
  filter: 'all',
  onFilterChange: () => {},
  showEmptyState: true,
};

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

import {
  VerificationFailurePanel,
  type VerificationFailure,
  type VerificationFilter,
} from '../VerificationFailurePanel';

afterEach(() => {
  cleanup();
});

test('renders verification failures and filters by category', async () => {
  const failures: VerificationFailure[] = [
    {
      id: 'fail-1',
      webhookId: 'hook-1',
      workflowId: 'wf-1',
      status: 'failed',
      reason: 'SIGNATURE_MISMATCH',
      message: 'Signature mismatch for slack webhook',
      provider: 'slack',
      timestamp: '2024-01-01T00:00:00.000Z',
      metadata: { signatureHeader: 'x-slack-signature', providedSignature: 'abc' },
    },
    {
      id: 'fail-2',
      webhookId: 'hook-1',
      workflowId: 'wf-1',
      status: 'failed',
      reason: 'MISSING_SECRET',
      message: 'Webhook secret is missing',
      provider: 'slack',
      timestamp: '2024-01-02T00:00:00.000Z',
      metadata: {},
    },
  ];

  let activeFilter: VerificationFilter = 'all';
  const handleFilterChange = (next: VerificationFilter) => {
    activeFilter = next;
    rerender(
      <VerificationFailurePanel
        failures={failures}
        filter={activeFilter}
        onFilterChange={handleFilterChange}
        showEmptyState
      />
    );
  };

  const { rerender } = render(
    <VerificationFailurePanel
      failures={failures}
      filter={activeFilter}
      onFilterChange={handleFilterChange}
      showEmptyState
    />
  );

  assert.ok(screen.getByText(/Signature mismatch/), 'signature mismatch entry should render');
  assert.ok(screen.getByText(/Missing secret/), 'missing secret entry should render');

  const configurationButton = screen.getByRole('button', { name: /Configuration gaps/i });
  fireEvent.click(configurationButton);

  assert.ok(screen.getByText(/Missing secret/), 'configuration filter should keep missing secret');
  assert.equal(
    screen.queryByText(/Signature mismatch/),
    null,
    'configuration filter should hide signature mismatch entries'
  );

  assert.ok(
    screen.getByText(/Set the shared secret on both the provider/),
    'guidance should render for missing secret failures'
  );
});

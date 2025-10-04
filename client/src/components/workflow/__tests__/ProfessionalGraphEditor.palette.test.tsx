import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { NodeSidebar } from '../ProfessionalGraphEditor';
import type { ConnectorDefinitionSummary } from '@/services/connectorDefinitions';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  localStorage.clear();
});

test('renders connectors from metadata in the palette', async () => {
  const connectors: ConnectorDefinitionSummary[] = [
    {
      id: 'gmail',
      name: 'Gmail',
      category: 'Communication',
      icon: 'mail',
      color: '#EA4335',
      availability: 'stable',
      hasImplementation: true,
      actions: [
        {
          id: 'send_email',
          name: 'Send Email',
          description: 'Send an email message',
          parameters: {},
        },
      ],
      triggers: [
        {
          id: 'new_message',
          name: 'New Message',
          description: 'Trigger when a new email arrives',
          parameters: {},
        },
      ],
      release: { semver: '1.0.0', status: 'stable' },
    },
    {
      id: 'spark-crm',
      name: 'Spark CRM',
      category: 'Innovation',
      icon: 'sparkles',
      color: '#663399',
      availability: 'stable',
      hasImplementation: true,
      actions: [
        {
          id: 'create_record',
          name: 'Create Spark Record',
          description: 'Create a new record in Spark CRM',
          parameters: {},
        },
      ],
      triggers: [],
      release: { semver: '0.9.0', status: 'beta', isBeta: true },
    },
  ];

  render(
    <NodeSidebar
      connectors={connectors}
      loading={false}
      onAddNode={() => {
        // no-op for UI test
      }}
    />
  );

  await waitFor(() => {
    assert.ok(screen.getByText('Spark CRM'));
  });

  assert.ok(
    screen.getByRole('button', { name: 'Innovation' }),
    'new connector category should be visible'
  );

  const sparkHeader = screen.getByRole('button', { name: /Spark CRM/ });
  fireEvent.click(sparkHeader);

  await waitFor(() => {
    assert.ok(
      screen.getByText('Create Spark Record'),
      'new connector action should render inside the accordion'
    );
  });
});

test('updates palette when new connectors arrive', async () => {
  const baseConnectors: ConnectorDefinitionSummary[] = [
    {
      id: 'gmail',
      name: 'Gmail',
      category: 'Communication',
      icon: 'mail',
      availability: 'stable',
      hasImplementation: true,
      actions: [],
      triggers: [],
      release: { semver: '1.0.0', status: 'stable' },
    },
  ];

  const { rerender } = render(
    <NodeSidebar
      connectors={baseConnectors}
      loading={false}
      onAddNode={() => {
        // no-op for UI test
      }}
    />
  );

  await waitFor(() => {
    assert.ok(screen.getByText('Gmail'));
  });

  const updatedConnectors: ConnectorDefinitionSummary[] = [
    ...baseConnectors,
    {
      id: 'atlas-erp',
      name: 'Atlas ERP',
      category: 'Finance',
      icon: 'database',
      availability: 'stable',
      hasImplementation: true,
      actions: [
        {
          id: 'sync_ledger',
          name: 'Sync Ledger',
          description: 'Synchronize accounting records',
          parameters: {},
        },
      ],
      triggers: [],
      release: { semver: '2.0.0', status: 'stable' },
    },
  ];

  rerender(
    <NodeSidebar
      connectors={updatedConnectors}
      loading={false}
      onAddNode={() => {
        // no-op for UI test
      }}
    />
  );

  await waitFor(() => {
    assert.ok(screen.getByText('Atlas ERP'));
  });
});

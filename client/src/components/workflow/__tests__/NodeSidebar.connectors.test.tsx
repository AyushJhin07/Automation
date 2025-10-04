import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { NodeSidebar } from '../ProfessionalGraphEditor';

describe('NodeSidebar connector metadata integration', () => {
  it('surfaces new connectors discovered via metadata definitions', () => {
    const catalog = {
      connectors: {
        'novel-ai': {
          name: 'Legacy Name',
          category: 'Legacy',
          hasImplementation: true,
          actions: [
            { id: 'analyze', name: 'Analyze', description: 'Analyze data', parameters: {}, nodeType: 'action.novel-ai.analyze' },
          ],
          triggers: [],
          release: { status: 'beta', semver: '0.9.0', isBeta: true },
          lifecycle: {
            status: 'beta',
            badges: [{ id: 'beta', label: 'Beta', tone: 'warning' }],
          },
        },
      },
    };

    const connectorDefinitions = {
      'novel-ai': {
        id: 'novel-ai',
        name: 'Novel AI Suite',
        category: 'AI Automation',
        icon: 'brain',
        color: '#663399',
        actions: [],
        triggers: [],
        release: { status: 'beta', semver: '1.0.0', isBeta: true },
        lifecycle: {
          status: 'beta',
          badges: [{ id: 'beta', label: 'Beta', tone: 'warning' }],
        },
      },
    };

    render(
      <NodeSidebar
        onAddNode={vi.fn()}
        catalog={catalog}
        loading={false}
        connectorDefinitions={connectorDefinitions as any}
      />
    );

    expect(screen.getByText('Novel AI Suite')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AI Automation' })).toBeInTheDocument();

    const appCard = screen.getByTestId('app-card-novel-ai');
    expect(within(appCard).getByText('Novel AI Suite')).toBeInTheDocument();

    const iconWrapper = within(appCard).getByTestId('app-icon-novel-ai');
    expect(iconWrapper.querySelector('svg[data-lucide="brain"]')).not.toBeNull();
  });
});

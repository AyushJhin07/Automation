import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { NodeSidebar } from '../ProfessionalGraphEditor';

describe('NodeSidebar lifecycle badges', () => {
  const baseCatalog = {
    connectors: {
      betaApp: {
        name: 'Beta App',
        category: 'Testing',
        actions: [
          { id: 'send', name: 'Send', description: 'Send something', parameters: {}, nodeType: 'action.betaApp.send' },
        ],
        triggers: [],
        hasImplementation: true,
        availability: 'stable',
        release: { status: 'beta', semver: '1.0.0', isBeta: true },
        lifecycle: { alpha: false, beta: true, stable: false },
      },
      stableApp: {
        name: 'Stable App',
        category: 'Testing',
        actions: [
          { id: 'do', name: 'Do', description: 'Do something', parameters: {}, nodeType: 'action.stableApp.do' },
        ],
        triggers: [],
        hasImplementation: true,
        availability: 'stable',
        release: { status: 'stable', semver: '2.0.0', isBeta: false },
        lifecycle: { alpha: false, beta: false, stable: true },
      },
    },
  };

  const renderSidebar = () =>
    render(<NodeSidebar onAddNode={vi.fn()} catalog={baseCatalog} loading={false} />);

  it('shows a beta badge for connectors in beta', () => {
    renderSidebar();
    expect(screen.getByTestId('lifecycle-badge-betaApp')).toHaveTextContent('Beta');
  });

  it('does not render lifecycle badges for stable connectors', () => {
    renderSidebar();
    expect(screen.queryByTestId('lifecycle-badge-stableApp')).toBeNull();
  });
});

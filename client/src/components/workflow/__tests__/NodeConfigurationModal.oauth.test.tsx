import React from 'react';
import { describe, expect, it, vi, beforeAll } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

import { NodeConfigurationModal } from '../NodeConfigurationModal';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  // Radix UI components expect ResizeObserver in the environment.
  // @ts-ignore
  global.ResizeObserver = ResizeObserverMock;
});

const authFetchMock = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: any) => selector({ authFetch: authFetchMock }),
}));

vi.mock('../DynamicParameterForm', () => {
  const React = require('react');
  return {
    DynamicParameterForm: ({ onChange }: any) => {
      React.useEffect(() => {
        onChange({});
      }, [onChange]);
      return React.createElement('div', { 'data-testid': 'dynamic-parameter-form' });
    },
    FunctionDefinition: {},
  };
});

describe('NodeConfigurationModal OAuth flow', () => {
  it('optimistically shows OAuth connections and enables saving without reload', async () => {
    const connectionId = 'conn-123';
    let resolveConnection: (value: any) => void = () => {};
    const onConnectionCreated = vi.fn(() =>
      new Promise((resolve) => {
        resolveConnection = resolve;
      })
    );

    render(
      <NodeConfigurationModal
        isOpen
        onClose={vi.fn()}
        nodeData={{
          id: 'node-1',
          type: 'action',
          appName: 'google-sheets',
          functionId: 'action.append',
          label: 'Google Sheets append',
          parameters: {},
        }}
        onSave={vi.fn()}
        availableFunctions={[
          {
            id: 'action.append',
            name: 'Append Row',
            description: 'Append a row to the sheet',
            category: 'action',
          } as any,
        ]}
        connections={[]}
        oauthProviders={[
          {
            name: 'google-sheets',
            displayName: 'Google Sheets',
            scopes: ['spreadsheets.readonly'],
            configured: true,
          },
        ]}
        onConnectionCreated={onConnectionCreated}
      />
    );

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'oauth:connection',
            success: true,
            provider: 'google-sheets',
            connectionId,
            label: 'Workspace Bot',
          },
        })
      );
    });

    await waitFor(() => {
      expect(onConnectionCreated).toHaveBeenCalledWith(connectionId);
    });

    expect(await screen.findByText('Workspace Bot')).toBeInTheDocument();

    const saveButton = await screen.findByRole('button', { name: /save/i });
    expect(saveButton).toBeEnabled();

    act(() => {
      resolveConnection({
        id: connectionId,
        name: 'Workspace Bot (Team)',
        provider: 'google-sheets',
        status: 'connected',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Workspace Bot (Team)')).toBeInTheDocument();
    });
  });
});


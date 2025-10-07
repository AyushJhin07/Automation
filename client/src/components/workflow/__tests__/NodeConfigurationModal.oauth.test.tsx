import React from 'react';
import { describe, expect, it, vi, beforeAll } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
  it('prefers existing Gmail connections and skips OAuth relaunch on save', async () => {
    const onSave = vi.fn();
    const onConnectionCreated = vi.fn();
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    try {
      render(
        <NodeConfigurationModal
          isOpen
          onClose={vi.fn()}
          nodeData={{
            id: 'node-1',
            type: 'action',
            appName: 'gmail',
            functionId: 'action.send',
            label: 'Send email',
            parameters: {},
          }}
          onSave={onSave}
          availableFunctions={[
            {
              id: 'action.send',
              name: 'Send Email',
              description: 'Send a Gmail message',
              category: 'action',
            } as any,
          ]}
          connections={[
            {
              id: 'gmail-1',
              name: 'Workspace Gmail',
              provider: 'gmail',
              status: 'connected',
            } as any,
          ]}
          oauthProviders={[
            {
              name: 'gmail',
              displayName: 'Gmail',
              scopes: ['mail.send'],
              configured: true,
            },
          ]}
          onConnectionCreated={onConnectionCreated}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /parameters/i })).toHaveAttribute('aria-selected', 'true');
      });

      const saveButton = await screen.findByRole('button', { name: /save/i });
      expect(saveButton).toBeEnabled();

      await userEvent.click(saveButton);

      expect(windowOpenSpy).not.toHaveBeenCalled();
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionId: 'gmail-1',
          functionId: 'action.send',
        })
      );
    } finally {
      windowOpenSpy.mockRestore();
    }
  });

  it('optimistically shows OAuth connections and enables saving without reload', async () => {
    const connectionId = 'conn-123';
    let resolveConnection: (value: any) => void = () => {};
    const onConnectionCreated = vi.fn(() =>
      new Promise((resolve) => {
        resolveConnection = resolve;
      })
    );
    const onSave = vi.fn();
    const onClose = vi.fn();
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    try {
      render(
        <NodeConfigurationModal
          isOpen
          onClose={onClose}
          nodeData={{
            id: 'node-1',
            type: 'action',
            appName: 'google-sheets',
            functionId: 'action.append',
            label: 'Google Sheets append',
            parameters: {},
          }}
          onSave={onSave}
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
              status: 'connected',
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

      await userEvent.click(saveButton);

      expect(windowOpenSpy).not.toHaveBeenCalled();
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionId,
        })
      );
      expect(onClose).toHaveBeenCalled();

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
    } finally {
      windowOpenSpy.mockRestore();
    }
  });
});


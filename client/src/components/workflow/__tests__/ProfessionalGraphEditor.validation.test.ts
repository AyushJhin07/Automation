import { describe, expect, it, vi } from 'vitest';

import {
  mapValidationStateToNodes,
  type GraphValidationResult,
} from '../ProfessionalGraphEditor';

const createResult = (overrides: Partial<GraphValidationResult>): GraphValidationResult => ({
  errors: [],
  warnings: [],
  isValid: true,
  summary: null,
  validatedAt: 1700000000000,
  reason: 'manual',
  ...overrides,
});

describe('mapValidationStateToNodes', () => {
  it('attaches validation errors and warnings to the matching nodes', () => {
    const nodes = [
      { id: 'trigger-1', data: { label: 'Trigger' } },
      { id: 'action-1', data: { label: 'Action' } },
    ];

    const validation = createResult({
      isValid: false,
      errors: [
        { nodeId: 'action-1', code: 'missing_input', message: 'Missing account connection' },
      ],
      warnings: [
        { nodeId: 'trigger-1', code: 'unused_output', message: 'Output not used downstream' },
      ],
    });

    const updated = mapValidationStateToNodes(nodes, validation, (data) => ({ ...(data ?? {}), executionStatus: 'idle' }));

    expect(updated).not.toBe(nodes);
    expect(updated[0].data?.validationErrors).toBeUndefined();
    expect(updated[0].data?.validationWarnings).toEqual(validation.warnings);
    expect(updated[1].data?.validationErrors).toEqual(validation.errors);
    expect(updated[1].data?.validationWarnings).toBeUndefined();
  });

  it('clears previous validation state when new result omits issues', () => {
    const nodes = [
      {
        id: 'action-1',
        data: {
          label: 'Action',
          validationErrors: [{ nodeId: 'action-1', message: 'Existing issue' }],
          validationWarnings: [{ nodeId: 'action-1', message: 'Existing warning' }],
        },
      },
    ];

    const validation = createResult({ errors: [], warnings: [] });

    const updated = mapValidationStateToNodes(nodes, validation, (data) => ({ ...(data ?? {}), executionStatus: 'idle' }));

    expect(updated[0].data?.validationErrors).toBeUndefined();
    expect(updated[0].data?.validationWarnings).toBeUndefined();
  });

  it('ignores errors and warnings without a node reference', () => {
    const nodes = [{ id: 'trigger-1', data: {} }];

    const validation = createResult({
      warnings: [
        { nodeId: null, message: 'Global warning' },
        { nodeId: undefined, message: 'Another warning' },
      ] as any,
      errors: [{ nodeId: undefined, message: 'Global error' }] as any,
    });

    const updated = mapValidationStateToNodes(nodes, validation, (data) => data ?? {});

    expect(updated[0].data?.validationErrors).toBeUndefined();
    expect(updated[0].data?.validationWarnings).toBeUndefined();
  });

  it('applies execution defaults before writing validation metadata', () => {
    const defaults = vi.fn((data: any) => ({ ...(data ?? {}), executionStatus: 'idle' }));
    const nodes = [{ id: 'n1', data: {} }];
    const validation = createResult({
      errors: [{ nodeId: 'n1', message: 'error' } as any],
      warnings: [],
      isValid: false,
    });

    const updated = mapValidationStateToNodes(nodes, validation, defaults);

    expect(defaults).toHaveBeenCalledWith({});
    expect(updated[0].data?.executionStatus).toBe('idle');
    expect(updated[0].data?.validationErrors?.[0]?.message).toBe('error');
  });
});

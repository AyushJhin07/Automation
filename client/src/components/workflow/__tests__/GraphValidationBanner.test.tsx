import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  GraphValidationBanner,
  type GraphValidationResult,
} from '../ProfessionalGraphEditor';

const baseResult: GraphValidationResult = {
  errors: [],
  warnings: [],
  isValid: true,
  validatedAt: Date.now(),
  reason: 'run',
  summary: null,
};

describe('GraphValidationBanner', () => {
  it('renders loading indicator while validation is running', () => {
    render(
      <GraphValidationBanner
        status="loading"
        errorMessage={null}
        result={null}
        onFocusNode={vi.fn()}
      />
    );

    expect(screen.getByText('Validating workflow…')).toBeInTheDocument();
    expect(screen.getByText('Checking for missing inputs, cycles, and schema mismatches.')).toBeInTheDocument();
  });

  it('renders fatal error state when validation fails to execute', () => {
    render(
      <GraphValidationBanner
        status="error"
        errorMessage="Something went wrong"
        result={null}
        onFocusNode={vi.fn()}
      />
    );

    expect(screen.getByText('Validation failed')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders validation errors and focuses node on click', () => {
    const onFocusNode = vi.fn();
    const result: GraphValidationResult = {
      ...baseResult,
      errors: [
        { nodeId: 'node-1', message: 'Node 1 missing input', code: 'missing_input' },
        { nodeId: 'node-2', message: 'Node 2 misconfigured', code: 'misconfigured' },
      ],
      warnings: [],
      isValid: false,
      validatedAt: Date.now(),
      reason: 'run',
    };

    render(
      <GraphValidationBanner
        status="success"
        errorMessage={null}
        result={result}
        onFocusNode={onFocusNode}
      />
    );

    expect(screen.getByText('Fix 2 validation errors')).toBeInTheDocument();

    const focusButton = screen.getByRole('button', { name: 'Node 1 missing input' });
    fireEvent.click(focusButton);

    expect(onFocusNode).toHaveBeenCalledWith('node-1');
    expect(onFocusNode).toHaveBeenCalledTimes(1);
  });

  it('renders up to three warnings and summarizes remaining issues', () => {
    const warnings = Array.from({ length: 5 }, (_, index) => ({
      nodeId: `node-${index}`,
      message: `Warning ${index + 1}`,
      code: 'warning',
    }));

    render(
      <GraphValidationBanner
        status="success"
        errorMessage={null}
        result={{
          ...baseResult,
          warnings,
          errors: [],
          isValid: true,
          validatedAt: Date.now(),
          reason: 'deploy',
        }}
        onFocusNode={vi.fn()}
      />
    );

    expect(screen.getByText('Workflow validated with 5 warnings')).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toMatchObject([
      'Warning 1',
      'Warning 2',
      'Warning 3',
    ]);
    expect(screen.getByText('+ 2 more warnings')).toBeInTheDocument();
    expect(screen.getByText(/Checked at/)).toBeInTheDocument();
  });

  it('renders nothing when there are no validation issues', () => {
    const { container } = render(
      <GraphValidationBanner
        status="success"
        errorMessage={null}
        result={baseResult}
        onFocusNode={vi.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});

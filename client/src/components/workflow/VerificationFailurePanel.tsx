import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Filter, RefreshCw, ShieldAlert } from 'lucide-react';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

export type VerificationFailureReason =
  | 'PROVIDER_NOT_REGISTERED'
  | 'MISSING_SECRET'
  | 'MISSING_SIGNATURE'
  | 'MISSING_TIMESTAMP'
  | 'INVALID_SIGNATURE_FORMAT'
  | 'SIGNATURE_MISMATCH'
  | 'TIMESTAMP_OUT_OF_TOLERANCE'
  | 'INTERNAL_ERROR'
  | 'UNKNOWN';

export interface VerificationFailure {
  id: string;
  webhookId: string;
  workflowId: string;
  status: string;
  reason: VerificationFailureReason;
  message: string;
  provider?: string | null;
  timestamp: string;
  metadata?: {
    signatureHeader?: string | null;
    providedSignature?: string | null;
    timestampSkewSeconds?: number | null;
  };
}

export type VerificationFilter = 'all' | 'signature' | 'configuration' | 'timing' | 'other';

interface VerificationFailurePanelProps {
  failures: VerificationFailure[];
  filter: VerificationFilter;
  onFilterChange: (filter: VerificationFilter) => void;
  loading?: boolean;
  error?: string | null;
  showEmptyState?: boolean;
}

const reasonLabels: Record<VerificationFailureReason, string> = {
  PROVIDER_NOT_REGISTERED: 'Provider not registered',
  MISSING_SECRET: 'Missing secret',
  MISSING_SIGNATURE: 'Missing signature header',
  MISSING_TIMESTAMP: 'Missing timestamp header',
  INVALID_SIGNATURE_FORMAT: 'Invalid signature format',
  SIGNATURE_MISMATCH: 'Signature mismatch',
  TIMESTAMP_OUT_OF_TOLERANCE: 'Timestamp outside tolerance',
  INTERNAL_ERROR: 'Verification service error',
  UNKNOWN: 'Verification failure',
};

const reasonGuidance: Partial<Record<VerificationFailureReason, string>> = {
  PROVIDER_NOT_REGISTERED: 'Register the webhook provider in settings and confirm the verification template matches the trigger.',
  MISSING_SECRET: 'Set the shared secret on both the provider and the workflow trigger, then redeploy.',
  MISSING_SIGNATURE: 'Ensure the upstream integration forwards the expected signature header without stripping proxies.',
  MISSING_TIMESTAMP: 'Confirm the provider sends a timestamp header and that intermediate gateways preserve it.',
  INVALID_SIGNATURE_FORMAT: 'Verify that the signature header format matches the provider specification (hex, base64, etc.).',
  SIGNATURE_MISMATCH: 'Rotate the webhook secret and re-save it in both systems to invalidate mismatched signatures.',
  TIMESTAMP_OUT_OF_TOLERANCE: 'Check server clock skew and adjust the replay tolerance or investigate provider delivery delays.',
  INTERNAL_ERROR: 'Retry the request and inspect provider status dashboards for transient verification outages.',
};

const filterOptions: Array<{ key: VerificationFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'signature', label: 'Signature issues' },
  { key: 'configuration', label: 'Configuration gaps' },
  { key: 'timing', label: 'Timing' },
  { key: 'other', label: 'Other' },
];

const reasonToFilter: Partial<Record<VerificationFailureReason, VerificationFilter>> = {
  SIGNATURE_MISMATCH: 'signature',
  INVALID_SIGNATURE_FORMAT: 'signature',
  MISSING_SIGNATURE: 'signature',
  MISSING_SECRET: 'configuration',
  PROVIDER_NOT_REGISTERED: 'configuration',
  TIMESTAMP_OUT_OF_TOLERANCE: 'timing',
  MISSING_TIMESTAMP: 'timing',
  INTERNAL_ERROR: 'other',
  UNKNOWN: 'other',
};

const defaultGuidance: string[] = [
  'Rotate and redeploy webhook secrets after resolving verification issues.',
  'Compare provider webhook logs with Automation run timestamps to confirm delivery order.',
  'Re-run the verification test endpoint once fixes are applied.',
];

export const VerificationFailurePanel: React.FC<VerificationFailurePanelProps> = ({
  failures,
  filter,
  onFilterChange,
  loading = false,
  error,
  showEmptyState = false,
}) => {
  const filteredFailures = useMemo(() => {
    if (filter === 'all') {
      return failures;
    }
    return failures.filter((failure) => {
      const mapped = reasonToFilter[failure.reason] ?? 'other';
      return mapped === filter;
    });
  }, [failures, filter]);

  const uniqueGuidance = useMemo(() => {
    const guidance = new Set<string>();
    filteredFailures.forEach((failure) => {
      const tip = reasonGuidance[failure.reason];
      if (tip) {
        guidance.add(tip);
      }
    });

    if (guidance.size === 0 && failures.length > 0) {
      defaultGuidance.forEach((tip) => guidance.add(tip));
    }

    if (guidance.size === 0 && showEmptyState) {
      defaultGuidance.forEach((tip) => guidance.add(tip));
    }

    return Array.from(guidance);
  }, [filteredFailures, failures.length, showEmptyState]);

  if (!showEmptyState && failures.length === 0 && !loading && !error) {
    return null;
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          Signature verification events
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <div className="flex flex-wrap gap-1">
            {filterOptions.map((option) => (
              <Button
                key={option.key}
                type="button"
                variant={filter === option.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => onFilterChange(option.key)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading verification activity…
        </div>
      )}

      {error && !loading && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      {!loading && !error && filteredFailures.length === 0 && (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          No signature verification failures recorded yet. Keep this panel open to monitor future rejections.
        </div>
      )}

      {!loading && filteredFailures.length > 0 && (
        <div className="mt-3 space-y-3">
          {filteredFailures.map((failure) => (
            <div key={failure.id} className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
                  <AlertTriangle className="h-4 w-4" />
                  {reasonLabels[failure.reason] ?? 'Verification failure'}
                  {failure.provider && (
                    <Badge variant="outline" className="border-amber-300 bg-white text-amber-700">
                      {failure.provider}
                    </Badge>
                  )}
                </div>
                <Badge variant="outline" className="border-amber-300 bg-white text-amber-700">
                  {failure.status}
                </Badge>
              </div>
              <div className="mt-2 text-sm text-amber-800">{failure.message}</div>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-amber-700">
                <span>{format(new Date(failure.timestamp), 'PPpp')}</span>
                {failure.metadata?.signatureHeader && (
                  <span>Header: {failure.metadata.signatureHeader}</span>
                )}
                {failure.metadata?.timestampSkewSeconds !== null &&
                  failure.metadata?.timestampSkewSeconds !== undefined && (
                    <span>Skew: {failure.metadata.timestampSkewSeconds}s</span>
                  )}
              </div>
            </div>
          ))}
        </div>
      )}

      {uniqueGuidance.length > 0 && (
        <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
          <div className="mb-2 flex items-center gap-2 font-medium">
            <RefreshCw className="h-4 w-4" />
            Retry guidance
          </div>
          <ul className="list-disc space-y-1 pl-5">
            {uniqueGuidance.map((tip, index) => (
              <li key={index}>{tip}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

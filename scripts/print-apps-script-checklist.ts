#!/usr/bin/env tsx
import { fileURLToPath } from 'url';
import path from 'path';

interface ChecklistItem {
  readonly id: string;
  readonly label: string;
  readonly env?: string;
  readonly expected?: string;
  readonly details: string;
}

interface ChecklistSection {
  readonly title: string;
  readonly items: ChecklistItem[];
}

const sections: ChecklistSection[] = [
  {
    title: 'Sandbox Access',
    items: [
      {
        id: 'sandbox-access',
        label: 'Confirm shared sandbox access is granted',
        env: 'APPS_SCRIPT_SANDBOX_ACCESS',
        expected: 'granted',
        details: 'Set APPS_SCRIPT_SANDBOX_ACCESS=granted after verifying the rollout sandbox is shared with engineering, QA, and security reviewers.',
      },
      {
        id: 'sandbox-isolation',
        label: 'Validate sandbox isolation guardrails',
        env: 'APPS_SCRIPT_SANDBOX_ISOLATION',
        expected: 'verified',
        details: 'Use dedicated accounts, billing, and datasets. Set APPS_SCRIPT_SANDBOX_ISOLATION=verified once the isolation review is complete.',
      },
    ],
  },
  {
    title: 'Credential Provisioning',
    items: [
      {
        id: 'credentials-provisioned',
        label: 'Provision connector credentials',
        env: 'APPS_SCRIPT_CREDENTIALS_PROVISIONED',
        expected: 'true',
        details: 'Store OAuth clients, service accounts, or API keys in the shared secret manager and export APPS_SCRIPT_CREDENTIALS_PROVISIONED=true.',
      },
      {
        id: 'credential-rotation',
        label: 'Document credential rotation process',
        env: 'APPS_SCRIPT_CREDENTIAL_ROTATION',
        expected: 'documented',
        details: 'Capture rotation owners and cadence, then set APPS_SCRIPT_CREDENTIAL_ROTATION=documented.',
      },
    ],
  },
  {
    title: 'Script Property Standards',
    items: [
      {
        id: 'property-prefixes',
        label: 'Apply standardized property prefixes',
        env: 'APPS_SCRIPT_PROPERTY_PREFIXED',
        expected: 'true',
        details: 'Prefix Script Properties with apps_script__<connector> and set APPS_SCRIPT_PROPERTY_PREFIXED=true when aligned.',
      },
      {
        id: 'metadata-backfill',
        label: 'Backfill required metadata properties',
        env: 'APPS_SCRIPT_METADATA_BACKFILLED',
        expected: 'true',
        details: 'Populate apps_script__runtime/version/last_validated_at and export APPS_SCRIPT_METADATA_BACKFILLED=true.',
      },
    ],
  },
  {
    title: 'Security Approvals',
    items: [
      {
        id: 'security-review',
        label: 'Complete security architecture review',
        env: 'APPS_SCRIPT_SECURITY_REVIEWED',
        expected: 'approved',
        details: 'Log review metadata in the tracker and set APPS_SCRIPT_SECURITY_REVIEWED=approved once security signs off.',
      },
      {
        id: 'compliance-checks',
        label: 'Log privacy and compliance checks',
        env: 'APPS_SCRIPT_COMPLIANCE_COMPLETE',
        expected: 'true',
        details: 'Finalize GDPR/CCPA assessments and export APPS_SCRIPT_COMPLIANCE_COMPLETE=true.',
      },
    ],
  },
];

const colors = {
  green: (value: string) => `\u001B[32m${value}\u001B[0m`,
  red: (value: string) => `\u001B[31m${value}\u001B[0m`,
  yellow: (value: string) => `\u001B[33m${value}\u001B[0m`,
  cyan: (value: string) => `\u001B[36m${value}\u001B[0m`,
  bold: (value: string) => `\u001B[1m${value}\u001B[0m`,
};

type Status = 'complete' | 'missing' | 'unknown';

function evaluate(item: ChecklistItem): { status: Status; message: string } {
  if (!item.env) {
    return {
      status: 'unknown',
      message: 'No environment variable configured for automated status detection.',
    };
  }

  const rawValue = process.env[item.env];
  if (rawValue === undefined || rawValue.length === 0) {
    return {
      status: 'missing',
      message: `${item.env} is not set. ${item.details}`,
    };
  }

  const normalized = rawValue.trim().toLowerCase();
  const expected = item.expected?.toLowerCase() ?? 'true';

  if (normalized === expected) {
    return {
      status: 'complete',
      message: `${item.env}=${rawValue}`,
    };
  }

  return {
    status: 'missing',
    message: `${item.env}=${rawValue} (expected ${item.expected ?? 'true'}). ${item.details}`,
  };
}

function render(): void {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const checklistPath = path.relative(repoRoot, path.join(repoRoot, 'docs', 'apps-script-rollout', 'kickoff-checklist.md'));

  console.log(colors.bold(colors.cyan('Apps Script Rollout Kickoff Checklist')));
  console.log(`Source: ${checklistPath}`);
  console.log('');

  for (const section of sections) {
    console.log(colors.bold(section.title));
    for (const item of section.items) {
      const result = evaluate(item);
      const icon =
        result.status === 'complete'
          ? colors.green('✔')
          : result.status === 'missing'
            ? colors.red('✖')
            : colors.yellow('•');

      console.log(`  ${icon} ${item.label}`);
      const messageColor =
        result.status === 'complete'
          ? colors.green
          : result.status === 'missing'
            ? colors.red
            : colors.yellow;
      console.log(`     ↳ ${messageColor(result.message)}`);
    }
    console.log('');
  }

  console.log('Tip: Export the expected environment variables (or update the rollout tracker) to flip each item to complete.');
}

render();

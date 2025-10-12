const checklistItems = [
  {
    id: 'sandbox-access',
    label: 'Sandbox access granted for the Apps Script execution project',
    envVar: 'APPS_SCRIPT_SANDBOX_ACCESS',
    docAnchor: '#sandbox-access',
  },
  {
    id: 'credentials',
    label: 'Production credentials provisioned or requested for launch connectors',
    envVar: 'APPS_SCRIPT_CREDENTIALS_READY',
    docAnchor: '#credential-provisioning',
  },
  {
    id: 'script-properties',
    label: 'Script Properties documented and following naming standards',
    envVar: 'APPS_SCRIPT_PROPERTIES_STANDARD',
    docAnchor: '#script-property-standards',
  },
  {
    id: 'security',
    label: 'Security approvals logged with references in the rollout tracker',
    envVar: 'APPS_SCRIPT_SECURITY_APPROVED',
    docAnchor: '#security-approvals',
  },
] as const;

type ChecklistState = 'complete' | 'missing';

type ChecklistResult = {
  item: (typeof checklistItems)[number];
  state: ChecklistState;
  rawValue: string | undefined;
};

const truthyValues = new Set(['1', 'true', 't', 'yes', 'y', 'on']);

const toLower = (value: string | undefined): string | undefined =>
  value === undefined ? undefined : value.toLowerCase();

const parseState = (value: string | undefined): ChecklistState =>
  truthyValues.has(toLower(value) ?? '') ? 'complete' : 'missing';

const colour = (code: number, value: string): string => `\u001b[${code}m${value}\u001b[0m`;
const green = (value: string): string => colour(32, value);
const red = (value: string): string => colour(31, value);
const cyan = (value: string): string => colour(36, value);
const bold = (value: string): string => `\u001b[1m${value}\u001b[0m`;
const dim = (value: string): string => colour(2, value);

const formatState = (state: ChecklistState): string =>
  state === 'complete' ? green('✔ Complete') : red('✖ Missing');

const results: ChecklistResult[] = checklistItems.map(item => ({
  item,
  state: parseState(process.env[item.envVar]),
  rawValue: process.env[item.envVar],
}));

console.log(bold('Apps Script Rollout Kickoff Checklist'));
console.log(dim('Source: docs/apps-script-rollout/kickoff-checklist.md'));
console.log('');

for (const result of results) {
  const line = `${formatState(result.state)} — ${result.item.label}`;
  console.log(line);
  const note =
    result.rawValue === undefined
      ? dim(`  env var ${result.item.envVar} is not set`)
      : dim(`  env var ${result.item.envVar} = ${result.rawValue}`);
  console.log(note);
  console.log(dim(`  See ${cyan(`docs/apps-script-rollout/kickoff-checklist.md${result.item.docAnchor}`)}`));
  console.log('');
}

const missing = results.filter(result => result.state === 'missing');

if (missing.length === 0) {
  console.log(green('All preconditions satisfied. Proceed with the connector batch.'));
} else {
  console.log(red('Blocked: complete the following before kickoff:'));
  for (const result of missing) {
    console.log(`  • ${result.item.label} (${result.item.envVar})`);
  }
}

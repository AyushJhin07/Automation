import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { connectorRegistry } from '../server/ConnectorRegistry';

interface WaveDefinition {
  phase: string;
  connectors: Array<{ id: string; name: string }>;
}

const PHASE_WAVES: WaveDefinition[] = [
  {
    phase: 'Phase 2 – Wave A – CRM & Revenue',
    connectors: [
      { id: 'salesforce', name: 'Salesforce' },
      { id: 'dynamics365', name: 'Microsoft Dynamics 365' },
      { id: 'quickbooks', name: 'QuickBooks Online' },
      { id: 'xero', name: 'Xero' },
      { id: 'netsuite', name: 'NetSuite' }
    ]
  },
  {
    phase: 'Phase 2 – Wave B – HR & People Operations',
    connectors: [
      { id: 'bamboohr', name: 'BambooHR' },
      { id: 'workday', name: 'Workday' },
      { id: 'adp', name: 'ADP Workforce Now' },
      { id: 'successfactors', name: 'SAP SuccessFactors' },
      { id: 'greenhouse', name: 'Greenhouse' },
      { id: 'lever', name: 'Lever' }
    ]
  },
  {
    phase: 'Phase 2 – Wave C – E-signature & Document Automation',
    connectors: [
      { id: 'docusign', name: 'DocuSign' },
      { id: 'adobesign', name: 'Adobe Acrobat Sign' },
      { id: 'hellosign', name: 'HelloSign (Dropbox Sign)' }
    ]
  },
  {
    phase: 'Phase 2 – Wave D – Incident & On-call Operations',
    connectors: [
      { id: 'pagerduty', name: 'PagerDuty' },
      { id: 'opsgenie', name: 'Opsgenie' }
    ]
  },
  {
    phase: 'Phase 2 – Wave E – Data & Analytics',
    connectors: [
      { id: 'databricks', name: 'Databricks' },
      { id: 'snowflake', name: 'Snowflake' },
      { id: 'tableau', name: 'Tableau Server' },
      { id: 'powerbi', name: 'Power BI' }
    ]
  }
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const INTEGRATIONS_DIR = join(__dirname, '..', 'server', 'integrations');

const CLIENT_FILE_CANDIDATES = (appId: string): string[] => {
  const pascal = appId
    .split(/[-_]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

  return [
    `${pascal}APIClient.ts`,
    `${pascal}APIClient.js`,
    `${pascal}EnhancedAPIClient.ts`,
    `${pascal}EnhancedAPIClient.js`
  ];
};

async function locateClientFile(appId: string): Promise<string | undefined> {
  for (const candidate of CLIENT_FILE_CANDIDATES(appId)) {
    const fullPath = join(INTEGRATIONS_DIR, candidate);
    try {
      await fs.access(fullPath);
      return fullPath;
    } catch {
      // continue searching other candidates
    }
  }

  return undefined;
}

interface ConnectorStatusSummary {
  id: string;
  name: string;
  availability: string;
  hasImplementation: boolean;
  status: 'stable' | 'experimental' | 'disabled' | 'missing' | 'drift';
  notes: string[];
}

async function describeConnector(id: string, name: string): Promise<ConnectorStatusSummary> {
  const entry = connectorRegistry.getConnector(id);

  if (!entry) {
    return {
      id,
      name,
      availability: 'missing',
      hasImplementation: false,
      status: 'missing',
      notes: ['No catalog definition found in connectors directory']
    };
  }

  const availability = entry.availability;
  const hasImplementation = entry.hasImplementation;
  const notes: string[] = [];

  if (availability === 'stable' && !hasImplementation) {
    notes.push('Catalog marked stable but ConnectorRegistry has no registered implementation');
  }

  if (availability !== 'stable') {
    const clientPath = await locateClientFile(id);
    if (!clientPath) {
      notes.push('No API client file present in server/integrations');
    } else {
      notes.push(`Client stub present at ${clientPath.replace(process.cwd() + '/', '')}`);
    }
  }

  let status: ConnectorStatusSummary['status'];
  if (!entry) {
    status = 'missing';
  } else if (availability === 'stable' && hasImplementation) {
    status = 'stable';
  } else if (availability === 'stable') {
    status = 'drift';
  } else if (availability === 'experimental') {
    status = 'experimental';
  } else if (availability === 'disabled') {
    status = 'disabled';
  } else {
    status = 'experimental';
  }

  return {
    id,
    name,
    availability,
    hasImplementation,
    status,
    notes
  };
}

function formatConnector(summary: ConnectorStatusSummary): string {
  const headline = `• ${summary.name} (${summary.id}) – ${summary.status}`;
  if (!summary.notes.length) {
    return headline;
  }

  const indentedNotes = summary.notes.map(note => `    - ${note}`).join('\n');
  return `${headline}\n${indentedNotes}`;
}

async function main(): Promise<void> {
  const stableEntries = connectorRegistry
    .getAllConnectors()
    .filter(entry => entry.hasImplementation && entry.availability === 'stable')
    .sort((a, b) => a.definition.id.localeCompare(b.definition.id));

  const experimentalEntries = connectorRegistry
    .getAllConnectors({ includeExperimental: true })
    .filter(entry => entry.availability === 'experimental');

  console.log('=== Overall Connector Summary ===');
  console.log(`Stable connectors: ${stableEntries.length}`);
  console.log(`Experimental connectors: ${experimentalEntries.length}`);
  console.log('');
  console.log('Stable connector IDs:');
  console.log(stableEntries.map(entry => entry.definition.id).join(', '));
  console.log('');

  for (const wave of PHASE_WAVES) {
    const summaries: ConnectorStatusSummary[] = [];
    for (const connector of wave.connectors) {
      summaries.push(await describeConnector(connector.id, connector.name));
    }

    const stableCount = summaries.filter(summary => summary.status === 'stable').length;
    console.log(`=== ${wave.phase} (${stableCount}/${summaries.length} stable) ===`);
    for (const summary of summaries) {
      console.log(formatConnector(summary));
    }
    console.log('');
  }
}

main().catch(error => {
  console.error('Failed to build connector phase report:', error);
  process.exitCode = 1;
});

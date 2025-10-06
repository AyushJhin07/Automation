import { connectorRegistry } from '../server/ConnectorRegistry.js';

interface ValidationError {
  connectorId: string;
  missing: string[];
}

function manifestIntendsStable(entry: { manifest?: { status: { beta: boolean; privatePreview: boolean; hidden: boolean; deprecated: boolean } } }): boolean {
  const status = entry.manifest?.status;
  if (!status) {
    return false;
  }
  if (status.hidden || status.privatePreview || status.deprecated) {
    return false;
  }
  return status.beta === false;
}

async function main(): Promise<void> {
  await connectorRegistry.init();
  const connectors = connectorRegistry.getAllConnectors({
    includeExperimental: true,
    includeDisabled: true,
    includeHidden: true,
  });

  const errors: ValidationError[] = [];
  const demoted: string[] = [];
  const missingImplementations: string[] = [];

  for (const entry of connectors) {
    if (manifestIntendsStable(entry)) {
      if (entry.availability !== 'stable') {
        demoted.push(entry.definition.id);
      }
    }

    if (entry.availability !== 'stable') {
      continue;
    }

    if (!entry.hasImplementation) {
      missingImplementations.push(entry.definition.id);
    }

    const coverage = entry.operationCoverage;
    if (!coverage) {
      continue;
    }

    if (coverage.total > 0 && coverage.implemented < coverage.total) {
      errors.push({ connectorId: entry.definition.id, missing: coverage.missing });
    }
  }

  if (demoted.length > 0) {
    const preview = demoted.slice(0, 10).join(', ');
    const suffix = demoted.length > 10 ? ', …' : '';
    console.error(
      `\n${demoted.length} connector(s) were marked stable in manifests but were demoted to experimental due to missing compiler coverage: ${preview}${suffix}`
    );
  }

  if (missingImplementations.length > 0) {
    console.error('\nStable connectors missing implementations:');
    for (const id of missingImplementations) {
      console.error(`  • ${id}`);
    }
  }

  if (errors.length > 0) {
    console.error('\nConnector compiler coverage validation failed:');
    for (const error of errors) {
      const missingList = error.missing.join(', ');
      console.error(`  • ${error.connectorId}: missing compiler operations for [${missingList}]`);
    }
    console.error('\nAdd generator handlers for the listed operations or mark the connector as experimental.');
    process.exitCode = 1;
    return;
  }

  if (demoted.length > 0 || missingImplementations.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log('✅ Stable connectors have compiler implementations for all advertised operations.');
}

main().catch(error => {
  console.error('Unexpected error while validating connector compiler coverage:', error);
  process.exitCode = 1;
});

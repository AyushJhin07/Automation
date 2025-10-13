import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const parseCliOptions = () => {
  const { values } = parseArgs({
    options: {
      current: { type: 'string' },
      baseline: { type: 'string' },
      limit: { type: 'string' },
    },
  });

  if (typeof values.current !== 'string' || values.current.trim() === '') {
    throw new Error('Missing required --current option for Apps Script coverage summary.');
  }

  return {
    currentPath: values.current,
    baselinePath:
      typeof values.baseline === 'string' && values.baseline.trim() !== ''
        ? values.baseline
        : undefined,
    gapLimit:
      typeof values.limit === 'string' && values.limit.trim() !== ''
        ? Math.max(Number.parseInt(values.limit, 10) || 0, 0)
        : 5,
  };
};

const readSummary = async path => {
  if (!path) {
    return undefined;
  }

  try {
    const content = await readFile(path, 'utf8');
    if (!content || content.trim() === '') {
      return undefined;
    }

    return JSON.parse(content);
  } catch (error) {
    return undefined;
  }
};

const toPercentage = value => `${(value * 100).toFixed(2)}%`;

const formatSigned = (value, decimals = 0, suffix = '') => {
  const fixed = value.toFixed(decimals);
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${fixed}${suffix}`;
};

const buildCoverageCell = coverage =>
  `${coverage.enabled}/${coverage.total} (${toPercentage(coverage.ratio)})`;

const buildConnectorCell = coverage =>
  `${coverage.full}/${coverage.total} (${toPercentage(coverage.ratio)})`;

const buildDeltaCell = (current, previous, key, unit) => {
  if (!previous) {
    return 'N/A';
  }

  const countDelta = current[key] - previous[key];
  const ratioDelta = (current.ratio - previous.ratio) * 100;
  return `${formatSigned(countDelta, 0, ` ${unit}`)} (${formatSigned(ratioDelta, 2, 'pp')})`;
};

const formatGapLine = gap => {
  const enabled = `${gap.appsScriptEnabled}/${gap.totalOperations}`;
  const missing = Math.max(gap.totalOperations - gap.appsScriptEnabled, 0);
  return `- ${gap.app}: ${enabled} operations enabled (${missing} missing)`;
};

const run = async () => {
  const options = parseCliOptions();
  const current = await readSummary(options.currentPath);

  if (!current) {
    throw new Error('Unable to read current Apps Script coverage summary.');
  }

  const baseline = await readSummary(options.baselinePath);
  const operations = current.coverage.operations;
  const connectors = current.coverage.connectors;
  const baselineOperations = baseline?.coverage?.operations;
  const baselineConnectors = baseline?.coverage?.connectors;

  const meetsTarget = operations.ratio + Number.EPSILON >= current.target;

  const hasBaselineOps =
    typeof baselineOperations?.enabled === 'number' &&
    typeof baselineOperations?.total === 'number' &&
    typeof baselineOperations?.ratio === 'number';
  const hasBaselineConnectors =
    typeof baselineConnectors?.full === 'number' &&
    typeof baselineConnectors?.total === 'number' &&
    typeof baselineConnectors?.ratio === 'number';

  const table = [
    '| Metric | Base | PR | Δ |',
    '| --- | --- | --- | --- |',
    `| Operations enabled | ${hasBaselineOps ? buildCoverageCell(baselineOperations) : 'N/A'} | ${buildCoverageCell(operations)} | ${buildDeltaCell(operations, hasBaselineOps ? baselineOperations : undefined, 'enabled', 'ops')} |`,
    `| Full coverage connectors | ${hasBaselineConnectors ? buildConnectorCell(baselineConnectors) : 'N/A'} | ${buildConnectorCell(connectors)} | ${buildDeltaCell(connectors, hasBaselineConnectors ? baselineConnectors : undefined, 'full', 'connectors')} |`,
  ];

  const lines = ['<!-- apps-script-coverage -->', '### Apps Script Coverage', '', `${meetsTarget ? '✅' : '❌'} Operations coverage ${toPercentage(operations.ratio)} (target ${toPercentage(current.target)}).`, '', ...table];

  if (current.gaps?.length > 0) {
    const limit = options.gapLimit > 0 ? options.gapLimit : current.gaps.length;
    const visible = current.gaps.slice(0, limit);
    lines.push('', `**Connectors missing full coverage (top ${visible.length}):**`);
    for (const gap of visible) {
      lines.push(formatGapLine(gap));
    }

    const remaining = current.gaps.length - visible.length;
    if (remaining > 0) {
      lines.push('', `...and ${remaining} more connector${remaining === 1 ? '' : 's'}.`);
    }
  } else {
    lines.push('', 'All connectors have full coverage. ✅');
  }

  const comment = lines.join('\n');
  console.log(comment);

  if (process.env.GITHUB_OUTPUT) {
    const delimiter = 'COVERAGE_COMMENT';
    await writeFile(
      process.env.GITHUB_OUTPUT,
      `comment<<${delimiter}\n${comment}\n${delimiter}\nstatus=${meetsTarget ? 'pass' : 'fail'}\n`,
      { flag: 'a' },
    );
  }
};

run().catch(error => {
  console.error('Failed to summarize Apps Script coverage.');
  console.error(error);
  process.exitCode = 1;
});

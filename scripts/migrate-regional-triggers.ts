#!/usr/bin/env ts-node
import '../server/env.js';

import { triggerPersistenceService } from '../server/services/TriggerPersistenceService.js';
import { organizationService } from '../server/services/OrganizationService.js';
import type { OrganizationRegion } from '../server/database/schema.js';
import { getErrorMessage } from '../server/types/common.js';

interface MigrationStats {
  total: number;
  migrated: number;
  skipped: number;
  failed: number;
}

const dryRun = process.argv.includes('--dry-run');

function resolveTriggerOrganizationId(record: { organizationId?: string | null; metadata?: Record<string, unknown> }): string | null {
  if (record.organizationId && typeof record.organizationId === 'string') {
    return record.organizationId;
  }
  const metadataOrg = record.metadata?.organizationId;
  if (typeof metadataOrg === 'string' && metadataOrg.trim().length > 0) {
    return metadataOrg;
  }
  return null;
}

async function resolveExpectedRegion(organizationId: string | null): Promise<OrganizationRegion> {
  if (!organizationId) {
    return 'us';
  }
  try {
    return await organizationService.getOrganizationRegion(organizationId);
  } catch (error) {
    console.warn(
      `⚠️ Failed to resolve organization region for ${organizationId}: ${getErrorMessage(error)}. Falling back to "us".\n`
    );
    return 'us';
  }
}

async function migrateWebhookTriggers(stats: MigrationStats): Promise<void> {
  const triggers = await triggerPersistenceService.loadWebhookTriggers();
  for (const trigger of triggers) {
    stats.total += 1;
    const organizationId = resolveTriggerOrganizationId(trigger);
    const expectedRegion = await resolveExpectedRegion(organizationId);
    const currentRegion = trigger.region ?? (trigger.metadata?.region as OrganizationRegion | undefined) ?? expectedRegion;

    if (currentRegion === expectedRegion) {
      stats.skipped += 1;
      continue;
    }

    console.log(
      `📦 Migrating webhook trigger ${trigger.id} from region ${currentRegion} to ${expectedRegion} (workflow=${trigger.workflowId})`
    );

    if (dryRun) {
      stats.migrated += 1;
      continue;
    }

    try {
      await triggerPersistenceService.saveWebhookTrigger({
        ...trigger,
        region: expectedRegion,
        metadata: {
          ...(trigger.metadata ?? {}),
          region: expectedRegion,
        },
      });
      await triggerPersistenceService.deactivateTrigger(trigger.id, currentRegion);
      stats.migrated += 1;
    } catch (error) {
      stats.failed += 1;
      console.error(
        `❌ Failed to migrate webhook trigger ${trigger.id} to region ${expectedRegion}: ${getErrorMessage(error)}`
      );
    }
  }
}

async function migratePollingTriggers(stats: MigrationStats): Promise<void> {
  const triggers = await triggerPersistenceService.loadPollingTriggers();
  for (const trigger of triggers) {
    stats.total += 1;
    const organizationId = resolveTriggerOrganizationId(trigger);
    const expectedRegion = await resolveExpectedRegion(organizationId);
    const currentRegion = trigger.region ?? (trigger.metadata?.region as OrganizationRegion | undefined) ?? expectedRegion;

    if (currentRegion === expectedRegion) {
      stats.skipped += 1;
      continue;
    }

    console.log(
      `📦 Migrating polling trigger ${trigger.id} from region ${currentRegion} to ${expectedRegion} (workflow=${trigger.workflowId})`
    );

    if (dryRun) {
      stats.migrated += 1;
      continue;
    }

    try {
      await triggerPersistenceService.savePollingTrigger({
        ...trigger,
        region: expectedRegion,
        metadata: {
          ...(trigger.metadata ?? {}),
          region: expectedRegion,
        },
      });
      await triggerPersistenceService.deactivateTrigger(trigger.id, currentRegion);
      stats.migrated += 1;
    } catch (error) {
      stats.failed += 1;
      console.error(
        `❌ Failed to migrate polling trigger ${trigger.id} to region ${expectedRegion}: ${getErrorMessage(error)}`
      );
    }
  }
}

async function main(): Promise<void> {
  const stats: MigrationStats = { total: 0, migrated: 0, skipped: 0, failed: 0 };
  console.log(dryRun ? '🔍 Running regional trigger migration in dry-run mode' : '🚚 Migrating triggers to region-scoped storage');

  await migrateWebhookTriggers(stats);
  await migratePollingTriggers(stats);

  console.log('--- Migration summary ---');
  console.log(`Total triggers evaluated: ${stats.total}`);
  console.log(`Migrated: ${stats.migrated}`);
  console.log(`Already aligned: ${stats.skipped}`);
  console.log(`Failed: ${stats.failed}`);

  if (stats.failed > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error('❌ Migration script encountered an unexpected error:', error);
  process.exit(1);
});

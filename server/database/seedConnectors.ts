// DATABASE SEED SCRIPT - IMPORT CONNECTORS FROM JSON FILES
// Reads /connectors/<id>/definition.json and imports into connector_definitions table

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { db, connectorDefinitions } from './schema';
import { eq } from 'drizzle-orm';
import { getErrorMessage } from '../types/common';

interface ConnectorJSON {
  name: string;
  category: string;
  description: string;
  version: string;
  versionInfo?: {
    semantic?: string;
    releaseDate?: string | null;
    notes?: string | null;
  };
  lifecycle?: {
    status?: 'planning' | 'beta' | 'stable' | 'deprecated' | 'sunset';
    beta?: { enabled?: boolean; startDate?: string | null; endDate?: string | null };
    deprecation?: { startDate?: string | null; endDate?: string | null };
    sunsetDate?: string | null;
  };
  availability?: string;
  authentication: {
    type: string;
    config: Record<string, any>;
  };
  actions: Array<{
    id: string;
    name: string;
    description: string;
    parameters: Record<string, any>;
    requiredScopes?: string[];
    rateLimits?: Record<string, any>;
  }>;
  triggers: Array<{
    id: string;
    name: string;
    description: string;
    parameters: Record<string, any>;
    requiredScopes?: string[];
    rateLimits?: Record<string, any>;
  }>;
  rateLimits?: {
    requestsPerSecond?: number;
    requestsPerMinute?: number;
    dailyLimit?: number;
  };
  pricing?: {
    tier: string;
    costPerExecution?: number;
  };
}

export class ConnectorSeeder {
  private connectorsPath: string;

  constructor() {
    this.connectorsPath = join(process.cwd(), 'connectors');
  }

  /**
   * Seed all connectors from JSON files into database
   */
  async seedAllConnectors(): Promise<{ imported: number; updated: number; errors: string[] }> {
    console.log('🌱 Starting connector seeding process...');
    
    const results = {
      imported: 0,
      updated: 0,
      errors: [] as string[]
    };

    try {
      // Check if database is available
      if (!db) {
        throw new Error('Database not available - make sure DATABASE_URL is set');
      }

      // Read all JSON files from connectors directory
      const connectorFiles = this.getConnectorFiles();
      console.log(`📁 Found ${connectorFiles.length} connector files`);

      for (const file of connectorFiles) {
        try {
          await this.seedSingleConnector(file, results);
        } catch (error) {
          const errorMsg = `Failed to seed ${file}: ${getErrorMessage(error)}`;
          console.error(`❌ ${errorMsg}`);
          results.errors.push(errorMsg);
        }
      }

      console.log(`✅ Seeding complete: ${results.imported} imported, ${results.updated} updated, ${results.errors.length} errors`);
      return results;

    } catch (error) {
      const errorMsg = `Seeding failed: ${getErrorMessage(error)}`;
      console.error(`💥 ${errorMsg}`);
      results.errors.push(errorMsg);
      return results;
    }
  }

  /**
   * Get all connector JSON files
   */
  private getConnectorFiles(): string[] {
    try {
      const entries = readdirSync(this.connectorsPath, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => join(entry.name, 'definition.json'))
        .filter(relativePath => existsSync(join(this.connectorsPath, relativePath)));
    } catch (error) {
      console.warn(`⚠️ Could not read connectors directory: ${getErrorMessage(error)}`);
      return [];
    }
  }

  /**
   * Seed a single connector file
   */
  private async seedSingleConnector(
    filename: string, 
    results: { imported: number; updated: number; errors: string[] }
  ): Promise<void> {
    console.log(`📄 Processing ${filename}...`);

    // Read and parse JSON file
    const filePath = join(this.connectorsPath, filename);
    const fileContent = readFileSync(filePath, 'utf-8');
    const connectorData: ConnectorJSON = JSON.parse(fileContent);

    const normalizedPath = filename.replace(/\\/g, '/');
    const directoryName = normalizedPath.split('/')[0] ?? normalizedPath;
    const slug = directoryName.toLowerCase();
    const lifecycle = this.normalizeLifecycle(connectorData);
    const semanticVersion = connectorData.versionInfo?.semantic || connectorData.version || '1.0.0';

    // Prepare connector definition for database
    const connectorDef = {
      slug,
      name: connectorData.name,
      category: connectorData.category || 'business',
      description: connectorData.description || `${connectorData.name} integration`,
      config: {
        version: connectorData.version || '1.0.0',
        authentication: connectorData.authentication,
        actions: connectorData.actions,
        triggers: connectorData.triggers,
        rateLimits: connectorData.rateLimits,
        pricing: connectorData.pricing,
        metadata: {
          totalFunctions: (connectorData.actions?.length || 0) + (connectorData.triggers?.length || 0),
          lastUpdated: new Date().toISOString(),
          source: 'json_seed'
        }
      },
      version: connectorData.version || semanticVersion,
      semanticVersion,
      lifecycleStage: lifecycle.stage,
      isBeta: lifecycle.isBeta,
      betaStartAt: lifecycle.betaStartAt,
      betaEndAt: lifecycle.betaEndAt,
      deprecationStartAt: lifecycle.deprecationStartAt,
      sunsetAt: lifecycle.sunsetAt,
      isActive: true,
      isVerified: false, // Mark as unverified until tested
      supportedRegions: ['global'],
      tags: this.generateTags(connectorData),
      complianceFlags: this.generateComplianceFlags(connectorData)
    };

    // Check if connector already exists
    const existing = await db
      .select()
      .from(connectorDefinitions)
      .where(eq(connectorDefinitions.slug, slug))
      .limit(1);

    if (existing.length > 0) {
      // Update existing connector
      await db
        .update(connectorDefinitions)
        .set({
          name: connectorDef.name,
          category: connectorDef.category,
          description: connectorDef.description,
          config: connectorDef.config,
          version: connectorDef.version,
          semanticVersion: connectorDef.semanticVersion,
          lifecycleStage: connectorDef.lifecycleStage,
          isBeta: connectorDef.isBeta,
          betaStartAt: connectorDef.betaStartAt,
          betaEndAt: connectorDef.betaEndAt,
          deprecationStartAt: connectorDef.deprecationStartAt,
          sunsetAt: connectorDef.sunsetAt,
          tags: connectorDef.tags,
          complianceFlags: connectorDef.complianceFlags,
          updatedAt: new Date()
        })
        .where(eq(connectorDefinitions.slug, slug));

      console.log(`🔄 Updated ${connectorData.name}`);
      results.updated++;
    } else {
      // Insert new connector
      await db.insert(connectorDefinitions).values(connectorDef);
      
      console.log(`✨ Imported ${connectorData.name}`);
      results.imported++;
    }
  }

  /**
   * Generate tags for connector
   */
  private generateTags(connector: ConnectorJSON): string[] {
    const tags = [connector.category || 'business'];
    
    // Add tags based on authentication type
    if (connector.authentication?.type) {
      tags.push(`auth-${connector.authentication.type}`);
    }

    // Add tags based on function count
    const functionCount = (connector.actions?.length || 0) + (connector.triggers?.length || 0);
    if (functionCount > 20) {
      tags.push('comprehensive');
    } else if (functionCount > 10) {
      tags.push('standard');
    } else {
      tags.push('basic');
    }

    // Add pricing tier tag
    if (connector.pricing?.tier) {
      tags.push(`tier-${connector.pricing.tier}`);
    }

    return tags;
  }

  /**
   * Generate compliance flags
   */
  private generateComplianceFlags(connector: ConnectorJSON): string[] {
    const flags: string[] = [];

    // Check for sensitive data handling
    const hasSensitiveData = connector.actions?.some(action => 
      Object.values(action.parameters || {}).some((param: any) => param.sensitive)
    ) || connector.triggers?.some(trigger =>
      Object.values(trigger.parameters || {}).some((param: any) => param.sensitive)
    );

    if (hasSensitiveData) {
      flags.push('handles_pii');
    }

    // Check for OAuth requirement
    if (connector.authentication?.type === 'oauth2') {
      flags.push('requires_oauth');
    }

    // Check for webhook capabilities
    const hasWebhooks = connector.triggers?.some(trigger => 
      trigger.id.includes('webhook') || trigger.description.toLowerCase().includes('webhook')
    );

    if (hasWebhooks) {
      flags.push('webhook_capable');
    }

    return flags;
  }

  /**
   * Seed specific connectors by name
   */
  async seedSpecificConnectors(connectorNames: string[]): Promise<void> {
    console.log(`🎯 Seeding specific connectors: ${connectorNames.join(', ')}`);
    
    for (const name of connectorNames) {
      const filename = `${name}.json`;
      try {
        const results = { imported: 0, updated: 0, errors: [] };
        await this.seedSingleConnector(filename, results);
      } catch (error) {
        console.error(`❌ Failed to seed ${name}: ${getErrorMessage(error)}`);
      }
    }
  }

  /**
   * Clear all connectors from database
   */
  async clearAllConnectors(): Promise<number> {
    if (!db) {
      throw new Error('Database not available');
    }

    const deleted = await db.delete(connectorDefinitions);
    console.log(`🗑️ Cleared ${deleted.rowCount || 0} connectors from database`);
    return deleted.rowCount || 0;
  }

  /**
   * Get seeding statistics
   */
  async getSeedingStats(): Promise<{
    totalInDB: number;
    totalJSONFiles: number;
    categories: Record<string, number>;
    lastSeeded: string | null;
  }> {
    const stats = {
      totalInDB: 0,
      totalJSONFiles: this.getConnectorFiles().length,
      categories: {} as Record<string, number>,
      lastSeeded: null as string | null
    };

    if (db) {
      const connectors = await db.select().from(connectorDefinitions);
      stats.totalInDB = connectors.length;

      // Count by category
      connectors.forEach(connector => {
        stats.categories[connector.category] = (stats.categories[connector.category] || 0) + 1;
      });

      // Find most recent update
      const mostRecent = connectors
        .map(c => c.updatedAt)
        .filter(date => date)
        .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0];

      stats.lastSeeded = mostRecent?.toISOString() || null;
    }

    return stats;
  }

  private normalizeLifecycle(connector: ConnectorJSON): {
    stage: 'planning' | 'beta' | 'stable' | 'deprecated' | 'sunset';
    isBeta: boolean;
    betaStartAt: Date | null;
    betaEndAt: Date | null;
    deprecationStartAt: Date | null;
    sunsetAt: Date | null;
  } {
    const lifecycle = connector.lifecycle ?? {};
    const availability = connector.availability;
    const stage: 'planning' | 'beta' | 'stable' | 'deprecated' | 'sunset' = lifecycle.status
      ?? (availability === 'stable'
        ? 'stable'
        : availability === 'experimental'
          ? 'beta'
          : availability === 'disabled'
            ? 'sunset'
            : 'planning');
    const beta = lifecycle.beta ?? {};
    const deprecation = lifecycle.deprecation ?? {};
    const parseDate = (value: unknown): Date | null => {
      if (!value) return null;
      const date = new Date(String(value));
      return Number.isNaN(date.getTime()) ? null : date;
    };
    const betaStartAt = parseDate(beta.startDate);
    const betaEndAt = parseDate(beta.endDate);
    const deprecationStartAt = parseDate(deprecation.startDate);
    const sunsetAt = parseDate(lifecycle.sunsetDate ?? deprecation.endDate);

    return {
      stage,
      isBeta: beta.enabled ?? stage === 'beta',
      betaStartAt,
      betaEndAt,
      deprecationStartAt,
      sunsetAt,
    };
  }

}

// Export singleton instance
export const connectorSeeder = new ConnectorSeeder();

/*
 * CLI usage has been intentionally disabled in this build. Use the dedicated
 * scripts/seed-all-connectors.ts entrypoint instead when running manual seed tasks.
 */

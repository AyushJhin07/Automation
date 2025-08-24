// DATABASE SEED SCRIPT - IMPORT CONNECTORS FROM JSON FILES
// Reads /connectors/*.json and imports into connector_definitions table

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { db, connectorDefinitions } from './schema';
import { eq } from 'drizzle-orm';
import { getErrorMessage } from '../types/common';

interface ConnectorJSON {
  name: string;
  category: string;
  description: string;
  version: string;
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
      const files = readdirSync(this.connectorsPath);
      return files.filter(file => file.endsWith('.json'));
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

    // Generate slug from filename
    const slug = filename.replace('.json', '').toLowerCase();

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
}

// Export singleton instance
export const connectorSeeder = new ConnectorSeeder();

// CLI interface for manual seeding
if (import.meta.url === `file://${process.argv[1]}`) {
  async function runSeeding() {
    console.log('🚀 Running connector seeding from CLI...');
    
    const args = process.argv.slice(2);
    const command = args[0];

    try {
      switch (command) {
        case 'seed':
          await connectorSeeder.seedAllConnectors();
          break;
        case 'clear':
          await connectorSeeder.clearAllConnectors();
          break;
        case 'stats':
          const stats = await connectorSeeder.getSeedingStats();
          console.log('📊 Seeding Statistics:', JSON.stringify(stats, null, 2));
          break;
        case 'seed-specific':
          const connectors = args.slice(1);
          if (connectors.length === 0) {
            console.error('❌ Please specify connector names: npm run seed-connectors seed-specific slack jira');
            process.exit(1);
          }
          await connectorSeeder.seedSpecificConnectors(connectors);
          break;
        default:
          console.log(`
🌱 Connector Seeder CLI

Commands:
  seed           - Seed all connectors from JSON files
  clear          - Clear all connectors from database  
  stats          - Show seeding statistics
  seed-specific  - Seed specific connectors by name

Examples:
  npx tsx server/database/seedConnectors.ts seed
  npx tsx server/database/seedConnectors.ts clear
  npx tsx server/database/seedConnectors.ts stats
  npx tsx server/database/seedConnectors.ts seed-specific slack jira hubspot
          `);
      }
    } catch (error) {
      console.error('💥 Seeding failed:', getErrorMessage(error));
      process.exit(1);
    }
  }

  runSeeding();
}
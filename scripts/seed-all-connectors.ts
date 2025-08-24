// COMPREHENSIVE CONNECTOR SEEDING SCRIPT
// Seeds ALL /connectors/*.json files into database with proper error handling

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

// Database imports with fallback handling
let db: any = null;
let connectorDefinitions: any = null;

try {
  const dbModule = await import('../server/database/schema');
  db = dbModule.db;
  connectorDefinitions = dbModule.connectorDefinitions;
} catch (error) {
  console.log('⚠️ Database not available - running in development mode');
}

interface ConnectorData {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  color?: string;
  version: string;
  authentication: {
    type: string;
    config: any;
  };
  baseUrl?: string;
  rateLimits?: {
    requestsPerSecond?: number;
    requestsPerMinute?: number;
    dailyLimit?: number;
  };
  actions: Array<{
    id: string;
    name: string;
    description: string;
    parameters?: Record<string, any>;
    params?: Record<string, any>;
    requiredScopes?: string[];
    rateLimits?: Record<string, any>;
  }>;
  triggers: Array<{
    id: string;
    name: string;
    description: string;
    parameters?: Record<string, any>;
    params?: Record<string, any>;
    requiredScopes?: string[];
    rateLimits?: Record<string, any>;
  }>;
}

export class ComprehensiveConnectorSeeder {
  private connectorsPath: string;

  constructor() {
    this.connectorsPath = join(process.cwd(), 'connectors');
  }

  /**
   * Seed ALL connectors from JSON files
   */
  async seedAllConnectors(): Promise<{ seeded: number; errors: string[]; skipped: number }> {
    console.log('🌱 Starting comprehensive connector seeding...\n');
    
    const results = {
      seeded: 0,
      errors: [] as string[],
      skipped: 0
    };

    try {
      // Get all connector JSON files
      const connectorFiles = this.getConnectorFiles();
      console.log(`📁 Found ${connectorFiles.length} connector files`);

      // Process each connector file
      for (const file of connectorFiles) {
        try {
          const connector = await this.loadConnectorData(file);
          
          if (!connector.id) {
            results.errors.push(`Missing ID in ${file}`);
            continue;
          }

          // Validate connector has functions
          const totalFunctions = (connector.actions?.length || 0) + (connector.triggers?.length || 0);
          if (totalFunctions === 0) {
            console.log(`⚠️ Skipping ${connector.name} - no functions defined`);
            results.skipped++;
            continue;
          }

          // Seed to database if available, otherwise just validate
          if (db && connectorDefinitions) {
            await this.upsertConnectorToDatabase(connector);
            console.log(`✅ Seeded ${connector.name} (${totalFunctions} functions)`);
          } else {
            console.log(`📋 Validated ${connector.name} (${totalFunctions} functions) - DB not available`);
          }
          
          results.seeded++;

        } catch (error) {
          const errorMsg = `Failed to process ${file}: ${error}`;
          console.error(`❌ ${errorMsg}`);
          results.errors.push(errorMsg);
        }
      }

      console.log(`\n🎯 Seeding complete:`);
      console.log(`  ✅ Seeded: ${results.seeded} connectors`);
      console.log(`  ⚠️ Skipped: ${results.skipped} connectors (no functions)`);
      console.log(`  ❌ Errors: ${results.errors.length} connectors`);

      if (results.errors.length > 0) {
        console.log('\n❌ Errors encountered:');
        results.errors.forEach(error => console.log(`  • ${error}`));
      }

      return results;

    } catch (error) {
      const errorMsg = `Seeding failed: ${error}`;
      console.error(`💥 ${errorMsg}`);
      results.errors.push(errorMsg);
      return results;
    }
  }

  /**
   * Get all connector JSON files
   */
  private getConnectorFiles(): string[] {
    if (!existsSync(this.connectorsPath)) {
      throw new Error(`Connectors directory not found: ${this.connectorsPath}`);
    }

    return readdirSync(this.connectorsPath)
      .filter(file => file.endsWith('.json'))
      .sort();
  }

  /**
   * Load and validate connector data from JSON file
   */
  private async loadConnectorData(filename: string): Promise<ConnectorData> {
    const filePath = join(this.connectorsPath, filename);
    
    try {
      const fileContent = readFileSync(filePath, 'utf-8');
      const connector: ConnectorData = JSON.parse(fileContent);

      // Validate required fields
      if (!connector.name) {
        throw new Error('Missing required field: name');
      }
      if (!connector.description) {
        throw new Error('Missing required field: description');
      }
      if (!connector.category) {
        throw new Error('Missing required field: category');
      }

      // Ensure ID exists (derive from filename if missing)
      if (!connector.id) {
        connector.id = filename.replace('.json', '');
        console.log(`⚠️ Added missing ID: ${connector.id} to ${filename}`);
      }

      // Normalize parameters field (some use 'params', some use 'parameters')
      connector.actions = connector.actions?.map(action => ({
        ...action,
        parameters: action.parameters || action.params || {}
      })) || [];

      connector.triggers = connector.triggers?.map(trigger => ({
        ...trigger,
        parameters: trigger.parameters || trigger.params || {}
      })) || [];

      return connector;

    } catch (error) {
      throw new Error(`Failed to load ${filename}: ${error}`);
    }
  }

  /**
   * Upsert connector to database
   */
  private async upsertConnectorToDatabase(connector: ConnectorData): Promise<void> {
    try {
      const { eq } = await import('drizzle-orm');
      
      // Check if connector exists
      const existing = await db
        .select()
        .from(connectorDefinitions)
        .where(eq(connectorDefinitions.id, connector.id))
        .limit(1);

      const connectorData = {
        id: connector.id,
        name: connector.name,
        description: connector.description,
        category: connector.category,
        version: connector.version || '1.0.0',
        icon: connector.icon || 'default',
        color: connector.color || '#6366F1',
        authentication: connector.authentication,
        baseUrl: connector.baseUrl || '',
        rateLimits: connector.rateLimits || {
          requestsPerSecond: 5,
          requestsPerMinute: 100,
          dailyLimit: 1000
        },
        actions: connector.actions,
        triggers: connector.triggers,
        isActive: true,
        metadata: {
          totalFunctions: (connector.actions?.length || 0) + (connector.triggers?.length || 0),
          lastUpdated: new Date().toISOString(),
          source: 'json-file'
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      if (existing.length > 0) {
        // Update existing connector
        await db
          .update(connectorDefinitions)
          .set({
            ...connectorData,
            updatedAt: new Date()
          })
          .where(eq(connectorDefinitions.id, connector.id));
      } else {
        // Insert new connector
        await db
          .insert(connectorDefinitions)
          .values(connectorData);
      }

    } catch (error) {
      throw new Error(`Database operation failed: ${error}`);
    }
  }

  /**
   * Get seeding statistics
   */
  async getSeedingStats(): Promise<any> {
    const connectorFiles = this.getConnectorFiles();
    let totalConnectors = 0;
    let totalActions = 0;
    let totalTriggers = 0;
    let emptyConnectors = 0;
    const categories = new Set<string>();

    for (const file of connectorFiles) {
      try {
        const connector = await this.loadConnectorData(file);
        totalConnectors++;
        
        const actions = connector.actions?.length || 0;
        const triggers = connector.triggers?.length || 0;
        
        totalActions += actions;
        totalTriggers += triggers;
        categories.add(connector.category);

        if (actions === 0 && triggers === 0) {
          emptyConnectors++;
        }

      } catch (error) {
        console.warn(`⚠️ Could not load ${file} for stats: ${error}`);
      }
    }

    const stats = {
      totalConnectors,
      totalActions,
      totalTriggers,
      totalFunctions: totalActions + totalTriggers,
      emptyConnectors,
      implementedConnectors: totalConnectors - emptyConnectors,
      implementationRate: ((totalConnectors - emptyConnectors) / totalConnectors * 100).toFixed(1) + '%',
      categories: Array.from(categories).sort(),
      categoryCount: categories.size,
      databaseConnected: !!db
    };

    return stats;
  }

  /**
   * Clear all connectors from database
   */
  async clearAllConnectors(): Promise<number> {
    if (!db || !connectorDefinitions) {
      throw new Error('Database not available');
    }

    try {
      const result = await db.delete(connectorDefinitions);
      console.log(`🗑️ Cleared all connectors from database`);
      return result.rowCount || 0;
    } catch (error) {
      throw new Error(`Failed to clear connectors: ${error}`);
    }
  }

  /**
   * Seed specific connectors by name
   */
  async seedSpecificConnectors(connectorNames: string[]): Promise<{ seeded: number; errors: string[] }> {
    console.log(`🎯 Seeding specific connectors: ${connectorNames.join(', ')}`);
    
    const results = {
      seeded: 0,
      errors: [] as string[]
    };

    for (const name of connectorNames) {
      try {
        const filename = name.endsWith('.json') ? name : `${name}.json`;
        const connector = await this.loadConnectorData(filename);
        
        if (db && connectorDefinitions) {
          await this.upsertConnectorToDatabase(connector);
          console.log(`✅ Seeded ${connector.name}`);
          results.seeded++;
        } else {
          console.log(`📋 Validated ${connector.name} - DB not available`);
        }

      } catch (error) {
        const errorMsg = `Failed to seed ${name}: ${error}`;
        console.error(`❌ ${errorMsg}`);
        results.errors.push(errorMsg);
      }
    }

    return results;
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  async function runSeeding() {
    console.log('🚀 Running comprehensive connector seeding from CLI...\n');
    
    const args = process.argv.slice(2);
    const command = args[0] || 'seed';
    const seeder = new ComprehensiveConnectorSeeder();

    try {
      switch (command) {
        case 'seed':
          await seeder.seedAllConnectors();
          break;
        
        case 'stats':
          const stats = await seeder.getSeedingStats();
          console.log('\n📊 Comprehensive Connector Statistics:');
          console.log(JSON.stringify(stats, null, 2));
          break;
        
        case 'clear':
          if (!db) {
            console.log('⚠️ Database not available - cannot clear');
            break;
          }
          const cleared = await seeder.clearAllConnectors();
          console.log(`🗑️ Cleared ${cleared} connectors`);
          break;
        
        case 'seed-specific':
          const connectors = args.slice(1);
          if (connectors.length === 0) {
            console.error('❌ Please specify connector names');
            console.log('Usage: npm run seed-connectors seed-specific slack jira hubspot');
            process.exit(1);
          }
          await seeder.seedSpecificConnectors(connectors);
          break;
        
        default:
          console.log(`
🌱 Comprehensive Connector Seeder CLI

Commands:
  seed              Seed all connectors from JSON files (default)
  stats             Show detailed connector statistics  
  clear             Clear all connectors from database
  seed-specific     Seed specific connectors by name

Examples:
  npx tsx scripts/seed-all-connectors.ts seed
  npx tsx scripts/seed-all-connectors.ts stats
  npx tsx scripts/seed-all-connectors.ts seed-specific slack jira hubspot
          `);
      }
      
    } catch (error) {
      console.error('💥 Seeding failed:', error);
      process.exit(1);
    }
  }

  runSeeding();
}

export default ComprehensiveConnectorSeeder;
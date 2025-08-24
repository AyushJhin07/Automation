// FIX CONNECTOR IDS - Add missing id fields to connector JSON files
// Ensures all connectors have the required id field for the registry

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

interface ConnectorData {
  id?: string;
  name: string;
  [key: string]: any;
}

class ConnectorIdFixer {
  private connectorsPath: string;

  constructor() {
    this.connectorsPath = join(process.cwd(), 'connectors');
  }

  /**
   * Fix all connector files
   */
  async fixAllConnectors(): Promise<{ fixed: number; errors: string[] }> {
    console.log('🔧 Fixing missing connector IDs...\n');
    
    const results = {
      fixed: 0,
      errors: [] as string[]
    };

    try {
      const connectorFiles = readdirSync(this.connectorsPath);
      
      connectorFiles
        .filter(file => file.endsWith('.json'))
        .forEach(file => {
          try {
            const fixed = this.fixConnectorFile(file);
            if (fixed) {
              results.fixed++;
              console.log(`✅ Fixed ${file}`);
            } else {
              console.log(`⏭️ Skipped ${file} (already has ID)`);
            }
          } catch (error) {
            const errorMsg = `Failed to fix ${file}: ${error}`;
            console.error(`❌ ${errorMsg}`);
            results.errors.push(errorMsg);
          }
        });
      
      console.log(`\n🎯 Fix complete: ${results.fixed} connectors fixed, ${results.errors.length} errors`);
      return results;

    } catch (error) {
      const errorMsg = `Fix failed: ${error}`;
      console.error(`💥 ${errorMsg}`);
      results.errors.push(errorMsg);
      return results;
    }
  }

  /**
   * Fix a single connector file
   */
  private fixConnectorFile(filename: string): boolean {
    const filePath = join(this.connectorsPath, filename);
    const fileContent = readFileSync(filePath, 'utf-8');
    const connectorData: ConnectorData = JSON.parse(fileContent);
    
    // Check if ID already exists
    if (connectorData.id) {
      return false; // No fix needed
    }
    
    // Generate ID from filename
    const id = filename.replace('.json', '').toLowerCase();
    
    // Add ID as the first field
    const fixedData = {
      id,
      ...connectorData
    };
    
    // Write back to file
    writeFileSync(filePath, JSON.stringify(fixedData, null, 2));
    
    return true; // Fixed
  }

  /**
   * Validate all connector IDs
   */
  validateAllIds(): { valid: number; invalid: string[] } {
    const results = {
      valid: 0,
      invalid: [] as string[]
    };

    try {
      const connectorFiles = readdirSync(this.connectorsPath);
      
      connectorFiles
        .filter(file => file.endsWith('.json'))
        .forEach(file => {
          try {
            const filePath = join(this.connectorsPath, file);
            const fileContent = readFileSync(filePath, 'utf-8');
            const connectorData: ConnectorData = JSON.parse(fileContent);
            
            if (connectorData.id) {
              results.valid++;
            } else {
              results.invalid.push(file);
            }
          } catch (error) {
            results.invalid.push(`${file} (parse error)`);
          }
        });
    } catch (error) {
      console.error('Validation failed:', error);
    }

    return results;
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  async function runFix() {
    console.log('🚀 Running connector ID fix from CLI...\n');
    
    const fixer = new ConnectorIdFixer();
    
    try {
      // Show current state
      console.log('📊 Current state:');
      const validation = fixer.validateAllIds();
      console.log(`Valid IDs: ${validation.valid}`);
      console.log(`Missing IDs: ${validation.invalid.length}`);
      if (validation.invalid.length > 0) {
        console.log('Files missing IDs:', validation.invalid.join(', '));
      }
      console.log();
      
      // Fix all connectors
      const results = await fixer.fixAllConnectors();
      
      // Show final state
      console.log('\n📊 Final state:');
      const finalValidation = fixer.validateAllIds();
      console.log(`Valid IDs: ${finalValidation.valid}`);
      console.log(`Missing IDs: ${finalValidation.invalid.length}`);
      
      if (results.errors.length > 0) {
        console.log('\n❌ Errors:');
        results.errors.forEach(error => console.log(`  • ${error}`));
      }
      
    } catch (error) {
      console.error('💥 Fix failed:', error);
      process.exit(1);
    }
  }

  runFix();
}

export { ConnectorIdFixer };
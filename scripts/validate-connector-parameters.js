#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const connectorsDir = path.join(__dirname, '..', 'connectors');

function validateConnector(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const connector = JSON.parse(content);
    const errors = [];
    const warnings = [];

    // Check actions
    if (connector.actions) {
      connector.actions.forEach((action, actionIndex) => {
        if (!action.parameters) {
          errors.push(`Action ${action.id || actionIndex} missing parameters`);
        } else if (typeof action.parameters === 'object') {
          // Check if it's the new format
          if (action.parameters.type !== 'object') {
            warnings.push(`Action ${action.id || actionIndex} parameters.type should be 'object'`);
          }
          if (!action.parameters.properties) {
            warnings.push(`Action ${action.id || actionIndex} missing parameters.properties`);
          }
          if (!action.parameters.required) {
            warnings.push(`Action ${action.id || actionIndex} missing parameters.required array`);
          }
          if (action.parameters.additionalProperties !== false) {
            warnings.push(`Action ${action.id || actionIndex} should set additionalProperties: false`);
          }
          
          // Check for old format (individual properties with required field)
          if (action.parameters.properties) {
            Object.entries(action.parameters.properties).forEach(([propName, propDef]) => {
              if (propDef.required !== undefined) {
                errors.push(`Action ${action.id} property ${propName} uses old 'required' format`);
              }
            });
          }
        }
      });
    }

    // Check triggers
    if (connector.triggers) {
      connector.triggers.forEach((trigger, triggerIndex) => {
        if (!trigger.parameters) {
          errors.push(`Trigger ${trigger.id || triggerIndex} missing parameters`);
        } else if (typeof trigger.parameters === 'object') {
          if (trigger.parameters.type !== 'object') {
            warnings.push(`Trigger ${trigger.id || triggerIndex} parameters.type should be 'object'`);
          }
          if (!trigger.parameters.properties) {
            warnings.push(`Trigger ${trigger.id || triggerIndex} missing parameters.properties`);
          }
          if (!trigger.parameters.required) {
            warnings.push(`Trigger ${trigger.id || triggerIndex} missing parameters.required array`);
          }
        }
      });
    }

    return { errors, warnings };
  } catch (error) {
    return { errors: [`Failed to parse JSON: ${error.message}`], warnings: [] };
  }
}

function main() {
  console.log('🔍 Validating connector parameter schemas...\n');
  
  const files = fs.readdirSync(connectorsDir)
    .filter(file => file.endsWith('.json'))
    .sort();

  let totalErrors = 0;
  let totalWarnings = 0;
  const fixedConnectors = [];
  const needFixingConnectors = [];

  files.forEach(file => {
    const filePath = path.join(connectorsDir, file);
    const connectorId = path.basename(file, '.json');
    const result = validateConnector(filePath);
    
    if (result.errors.length === 0 && result.warnings.length === 0) {
      fixedConnectors.push(connectorId);
      console.log(`✅ ${connectorId}: All parameters correctly formatted`);
    } else {
      needFixingConnectors.push({
        id: connectorId,
        errors: result.errors.length,
        warnings: result.warnings.length
      });
      
      console.log(`❌ ${connectorId}:`);
      result.errors.forEach(error => console.log(`   ERROR: ${error}`));
      result.warnings.forEach(warning => console.log(`   WARN: ${warning}`));
      console.log();
    }
    
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
  });

  console.log('\n📊 SUMMARY:');
  console.log(`📁 Total connectors: ${files.length}`);
  console.log(`✅ Fixed connectors: ${fixedConnectors.length}`);
  console.log(`❌ Need fixing: ${needFixingConnectors.length}`);
  console.log(`🔥 Total errors: ${totalErrors}`);
  console.log(`⚠️  Total warnings: ${totalWarnings}`);

  if (fixedConnectors.length > 0) {
    console.log('\n✅ FIXED CONNECTORS:');
    fixedConnectors.forEach(id => console.log(`   - ${id}`));
  }

  if (needFixingConnectors.length > 0) {
    console.log('\n❌ CONNECTORS NEEDING FIXES:');
    needFixingConnectors
      .sort((a, b) => (b.errors + b.warnings) - (a.errors + a.warnings))
      .forEach(connector => {
        console.log(`   - ${connector.id}: ${connector.errors} errors, ${connector.warnings} warnings`);
      });
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { validateConnector };
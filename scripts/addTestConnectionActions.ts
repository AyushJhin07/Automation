import fs from 'fs';
import path from 'path';

// ADD TEST CONNECTION ACTIONS TO ALL OAUTH-ENABLED CONNECTORS
// For onboarding and health checks

interface ConnectorAction {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, any>;
  requiredScopes?: string[];
  rateLimits?: {
    requests: number;
    period: string;
    scope?: string;
  };
}

interface ConnectorData {
  id: string;
  name: string;
  authentication: {
    type: string;
  };
  actions: ConnectorAction[];
  triggers: any[];
}

export class TestConnectionAdder {
  private connectorsPath: string;

  constructor() {
    this.connectorsPath = path.join(process.cwd(), 'connectors');
  }

  async addTestConnectionActions(): Promise<{ updated: number; errors: string[] }> {
    console.log('🔧 Adding test_connection actions to OAuth-enabled connectors...\n');

    const files = fs.readdirSync(this.connectorsPath).filter(f => f.endsWith('.json'));
    let updated = 0;
    const errors: string[] = [];

    for (const filename of files) {
      try {
        const filePath = path.join(this.connectorsPath, filename);
        const connector: ConnectorData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // Only add to OAuth-enabled connectors
        if (connector.authentication?.type === 'oauth2') {
          const hasTestConnection = connector.actions.some(action => action.id === 'test_connection');
          
          if (!hasTestConnection) {
            const testConnectionAction = this.generateTestConnectionAction(connector);
            connector.actions.unshift(testConnectionAction); // Add at beginning
            
            fs.writeFileSync(filePath, JSON.stringify(connector, null, 2));
            updated++;
            console.log(`✅ Added test_connection to ${filename}`);
          } else {
            console.log(`⏭️ ${filename} already has test_connection`);
          }
        } else {
          console.log(`⚠️ Skipping ${filename} - not OAuth-enabled`);
        }
      } catch (error) {
        const errorMsg = `Failed to update ${filename}: ${error.message}`;
        errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    }

    console.log(`\n🎯 Test connection actions added:`);
    console.log(`  ✅ Updated: ${updated} connectors`);
    console.log(`  ❌ Errors: ${errors.length} connectors`);

    return { updated, errors };
  }

  private generateTestConnectionAction(connector: ConnectorData): ConnectorAction {
    const appId = connector.id;
    const appName = connector.name;
    
    // Generate app-specific test connection logic
    const testEndpoints: Record<string, { endpoint: string; scopes: string[] }> = {
      'slack': { endpoint: '/auth.test', scopes: ['users:read'] },
      'github': { endpoint: '/user', scopes: ['user:read'] },
      'gitlab': { endpoint: '/user', scopes: ['read_user'] },
      'shopify': { endpoint: '/shop.json', scopes: ['read_products'] },
      'hubspot': { endpoint: '/account-info/v3/details', scopes: ['oauth'] },
      'stripe': { endpoint: '/account', scopes: ['read'] },
      'salesforce': { endpoint: '/sobjects/User', scopes: ['api'] },
      'asana': { endpoint: '/users/me', scopes: ['default'] },
      'notion': { endpoint: '/users/me', scopes: ['read'] },
      'airtable': { endpoint: '/bases', scopes: ['data.records:read'] },
      'jira': { endpoint: '/myself', scopes: ['read:user'] },
      'confluence': { endpoint: '/user/current', scopes: ['read:user'] },
      'bitbucket': { endpoint: '/user', scopes: ['account'] },
      'box': { endpoint: '/users/me', scopes: ['root_readwrite'] },
      'dropbox': { endpoint: '/users/get_current_account', scopes: ['account_info.read'] },
      'linear': { endpoint: '/viewer', scopes: ['read'] },
      'zendesk': { endpoint: '/users/me', scopes: ['read'] },
      'intercom': { endpoint: '/me', scopes: ['read_admin'] },
      'mailchimp': { endpoint: '/ping', scopes: ['basic'] },
      'typeform': { endpoint: '/me', scopes: ['accounts:read'] }
    };

    const testConfig = testEndpoints[appId] || testEndpoints[appId.replace('-enhanced', '')] || {
      endpoint: '/me',
      scopes: ['read']
    };

    return {
      id: 'test_connection',
      name: 'Test Connection',
      description: `Test the connection to ${appName} and verify authentication`,
      parameters: {
        // No parameters needed - just test the connection
      },
      requiredScopes: testConfig.scopes,
      rateLimits: {
        requests: 10,
        period: '1m',
        scope: 'user'
      }
    };
  }
}

// CLI execution
const adder = new TestConnectionAdder();
adder.addTestConnectionActions().then(result => {
  if (result.errors.length > 0) {
    console.error('\n❌ Errors occurred:');
    result.errors.forEach(error => console.error(`  ${error}`));
  }
  process.exit(result.errors.length > 0 ? 1 : 0);
}).catch(error => {
  console.error('❌ Failed to add test connections:', error);
  process.exit(1);
});
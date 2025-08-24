// DEBUG SENSITIVE PARAMETERS
import { getAppFunctions } from './server/complete500Apps';

console.log('🔍 Debugging sensitive parameters...\n');

// Check Slack functions
const slackFunctions = getAppFunctions('slack');
console.log('=== SLACK FUNCTIONS SENSITIVE PARAMS ===');
slackFunctions.forEach(func => {
  const sensitiveParams = Object.entries(func.parameters).filter(([key, param]) => param.sensitive);
  if (sensitiveParams.length > 0) {
    console.log(`${func.id}: has ${sensitiveParams.length} sensitive params:`, sensitiveParams.map(([key]) => key));
  }
});

// Check all functions for sensitive parameters
const allApps = ['gmail', 'shopify', 'slack', 'github'];
let hasSensitive = false;

allApps.forEach(app => {
  const functions = getAppFunctions(app);
  functions.forEach(func => {
    const sensitiveParams = Object.values(func.parameters).filter((p: any) => p.sensitive === true);
    if (sensitiveParams.length > 0) {
      hasSensitive = true;
      console.log(`${app}.${func.id} has sensitive parameters`);
    }
  });
});

console.log('\nHas any sensitive parameters:', hasSensitive);
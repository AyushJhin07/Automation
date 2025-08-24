// DEBUG RATE LIMITS
import { getAppFunctions } from './server/complete500Apps';

console.log('🔍 Debugging rate limits...\n');

// Check Gmail functions
const gmailFunctions = getAppFunctions('gmail');
console.log('=== GMAIL FUNCTIONS RATE LIMITS ===');
gmailFunctions.forEach(func => {
  console.log(`${func.id}: rateLimits =`, func.rateLimits);
});

// Check Shopify functions
const shopifyFunctions = getAppFunctions('shopify');
console.log('\n=== SHOPIFY FUNCTIONS RATE LIMITS ===');
shopifyFunctions.forEach(func => {
  console.log(`${func.id}: rateLimits =`, func.rateLimits);
});

// Check if any functions have rate limits
const allApps = ['gmail', 'shopify', 'slack', 'github'];
let hasRateLimits = false;

allApps.forEach(app => {
  const functions = getAppFunctions(app);
  const withLimits = functions.filter(f => f.rateLimits);
  if (withLimits.length > 0) {
    hasRateLimits = true;
    console.log(`\n${app} has ${withLimits.length} functions with rate limits`);
  }
});

console.log('\nHas any rate limits:', hasRateLimits);
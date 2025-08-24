// DEBUG SCRIPT - CHECK FUNCTION STRUCTURES
import { getAppFunctions } from './server/complete500Apps';

console.log('🔍 Debugging function structures...\n');

// Check Shopify functions
console.log('=== SHOPIFY FUNCTIONS ===');
const shopifyFunctions = getAppFunctions('shopify');
console.log(`Found ${shopifyFunctions.length} Shopify functions`);

const createProduct = shopifyFunctions.find(f => f.id === 'create_product');
console.log('Create Product Function:', JSON.stringify(createProduct, null, 2));

// Check Slack functions  
console.log('\n=== SLACK FUNCTIONS ===');
const slackFunctions = getAppFunctions('slack');
console.log(`Found ${slackFunctions.length} Slack functions`);

const sendMessage = slackFunctions.find(f => f.id === 'send_message');
console.log('Send Message Function:', JSON.stringify(sendMessage, null, 2));

// Check GitHub functions
console.log('\n=== GITHUB FUNCTIONS ===');
const githubFunctions = getAppFunctions('github');
console.log(`Found ${githubFunctions.length} GitHub functions`);

const newIssue = githubFunctions.find(f => f.id === 'new_issue');
console.log('New Issue Function:', JSON.stringify(newIssue, null, 2));

// Check Notion functions
console.log('\n=== NOTION FUNCTIONS ===');
const notionFunctions = getAppFunctions('notion');
console.log(`Found ${notionFunctions.length} Notion functions`);

const createPage = notionFunctions.find(f => f.id === 'create_page');
console.log('Create Page Function:', JSON.stringify(createPage, null, 2));
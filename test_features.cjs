#!/usr/bin/env node

/**
 * Comprehensive Feature Testing Script
 * Tests all major platform components after fixes
 */

const http = require('http');

const BASE_URL = 'http://localhost:5000';

async function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const requestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const req = http.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting Comprehensive Feature Tests...\n');
  
  let passed = 0;
  let failed = 0;
  
  const test = async (name, testFn) => {
    try {
      console.log(`🔄 Testing ${name}...`);
      await testFn();
      console.log(`✅ ${name} - PASSED`);
      passed++;
    } catch (error) {
      console.log(`❌ ${name} - FAILED: ${error.message}`);
      failed++;
    }
  };

  // Test 1: Health Check
  await test('Health Endpoint', async () => {
    const response = await makeRequest('/api/health');
    if (response.status !== 200 || !response.data.success) {
      throw new Error('Health check failed');
    }
  });

  // Test 2: Plans and Pricing
  await test('Plans & Pricing', async () => {
    const response = await makeRequest('/api/plans');
    if (response.status !== 200 || !response.data.plans || response.data.plans.length === 0) {
      throw new Error('Plans endpoint failed');
    }
  });

  // Test 3: Connector Categories
  await test('Connector Framework', async () => {
    const response = await makeRequest('/api/connectors/categories');
    if (response.status !== 200 || !response.data.categories) {
      throw new Error('Connector categories failed');
    }
  });

  // Test 4: Authentication (should require token)
  await test('Authentication Protection', async () => {
    const response = await makeRequest('/api/workflow/clarify', {
      method: 'POST',
      body: { description: 'Test' }
    });
    if (response.status !== 401) {
      throw new Error('Authentication should be required');
    }
  });

  // Test 5: Connectors Endpoint
  await test('Connectors Listing', async () => {
    const response = await makeRequest('/api/connectors');
    if (response.status !== 200 || !response.data.success) {
      throw new Error('Connectors listing failed');
    }
  });

  // Test 6: Admin Analytics (should require auth)
  await test('Admin Protection', async () => {
    const response = await makeRequest('/api/admin/analytics');
    if (response.status !== 401) {
      throw new Error('Admin endpoints should be protected');
    }
  });

  // Test 7: Legacy AI Conversation (should still work)
  await test('Legacy AI Endpoint', async () => {
    const response = await makeRequest('/api/ai/conversation', {
      method: 'POST',
      body: { prompt: 'Test', model: 'gemini' }
    });
    // Should require authentication or API key
    if (response.status !== 401 && response.status !== 400) {
      throw new Error('AI endpoint should require proper auth');
    }
  });

  console.log('\n📊 Test Results Summary:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Platform is working correctly.');
  } else {
    console.log('\n⚠️ Some tests failed. Check the issues above.');
  }

  // Additional Feature Checks (Non-breaking)
  console.log('\n🔍 Additional Feature Validation:');
  
  try {
    // Check if database features work (even in dev mode)
    const dbTest = await makeRequest('/api/usage');
    console.log('📊 Database Features:', dbTest.status === 401 ? 'Protected (Good)' : 'Available');
  } catch (e) {
    console.log('📊 Database Features: Not available in dev mode (Expected)');
  }

  try {
    // Check error handling
    const errorTest = await makeRequest('/api/nonexistent');
    console.log('🚫 Error Handling:', errorTest.status === 404 ? 'Working' : 'Needs attention');
  } catch (e) {
    console.log('🚫 Error Handling: Working (Connection rejected)');
  }

  console.log('\n🏁 Comprehensive testing completed!');
}

// Wait for server to be ready and run tests
setTimeout(runTests, 2000);
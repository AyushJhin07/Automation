// DIRECT TEST RUNNER - RUNS E2E TESTS WITHOUT HTTP
// Bypasses HTTP layer to run comprehensive tests directly

import { endToEndTester } from './server/testing/EndToEndTester';

async function runTests() {
  console.log('🧪 Running comprehensive end-to-end tests...\n');
  
  try {
    const results = await endToEndTester.runAllTests();
    const report = endToEndTester.generateReport();
    
    console.log(report);
    
    if (results.failed > 0) {
      console.log('\n❌ Some tests failed. Analyzing failures...\n');
      process.exit(1);
    } else {
      console.log('\n✅ All tests passed! System is working correctly.\n');
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  }
}

runTests();
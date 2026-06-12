#!/usr/bin/env node

/**
 * Quick test script for lifecycle tracking system
 * Run: node quick-test.js
 */

const path = require('path');
const fs = require('fs');

// Determine the project root
const projectRoot = process.cwd();
console.log(`🧪 Testing Lifecycle Tracking System`);
console.log(`📁 Project Root: ${projectRoot}\n`);

async function runTests() {
  try {
    // Test 1: Import modules
    console.log('1️⃣ Testing module imports...');
    const { getLifecyclePipeline } = require('./src/lifecycle/pipeline');
    const { SuggestionStatus, DiscardReason } = require('./src/lifecycle/types');
    const { calculateStats, renderStats } = require('./src/lifecycle/stats');
    console.log('✅ All modules imported successfully\n');

    // Test 2: Create a temporary test directory
    console.log('2️⃣ Setting up test environment...');
    const testDir = path.join(require('os').tmpdir(), 'lifecycle-quick-test-' + Date.now());
    fs.mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);
    console.log(`   Created test directory: ${testDir}\n`);

    // Test 3: Record a proposed suggestion
    console.log('3️⃣ Recording proposed suggestion...');
    const lifecycle = getLifecyclePipeline(testDir);
    const suggestionId = lifecycle.recordProposed({
      sessionId: 'quick-test-session',
      model: 'gpt-4',
      provider: 'openai',
      promptHash: 'test-hash-' + Date.now(),
      userIdentity: 'quick-test-user',
      scanStatus: 'pass',
      scanFindings: [],
      files: [{
        filePath: path.join(testDir, 'test.ts'),
        newContent: 'console.log("Hello from AI")',
        diffText: '+console.log("Hello from AI")',
      }],
    });
    console.log(`✅ Suggestion created: ${suggestionId}`);
    console.log(`   Short ID: ${suggestionId.substring(0, 8)}\n`);

    // Test 4: Verify initial status
    console.log('4️⃣ Verifying initial status...');
    const repo = lifecycle.getRepository();
    let suggestion = repo.getSuggestion(suggestionId);
    console.log(`   Status: ${suggestion.status}`);
    console.log(`   Expected: ${SuggestionStatus.Proposed}`);
    if (suggestion.status === SuggestionStatus.Proposed) {
      console.log('✅ Status is correct\n');
    } else {
      console.log('❌ FAIL: Status mismatch\n');
      process.exit(1);
    }

    // Test 5: Accept the suggestion
    console.log('5️⃣ Accepting suggestion...');
    lifecycle.acceptSuggestion(suggestionId);
    suggestion = repo.getSuggestion(suggestionId);
    console.log(`   Status: ${suggestion.status}`);
    console.log(`   Expected: ${SuggestionStatus.Accepted}`);
    if (suggestion.status === SuggestionStatus.Accepted) {
      console.log('✅ Transition successful\n');
    } else {
      console.log('❌ FAIL: Status mismatch\n');
      process.exit(1);
    }

    // Test 6: Check transition history
    console.log('6️⃣ Checking transition history...');
    const transitions = repo.getTransitions(suggestionId);
    console.log(`   Total transitions: ${transitions.length}`);
    transitions.forEach((t, i) => {
      console.log(`   ${i + 1}. ${t.fromStatus || '(initial)'} → ${t.toStatus}`);
    });
    if (transitions.length === 2) {
      console.log('✅ Transition history is correct\n');
    } else {
      console.log('❌ FAIL: Expected 2 transitions\n');
      process.exit(1);
    }

    // Test 7: Create another suggestion and discard it
    console.log('7️⃣ Testing discard path...');
    const suggestionId2 = lifecycle.recordProposed({
      sessionId: 'quick-test-session',
      model: 'gpt-4',
      provider: 'openai',
      promptHash: 'test-hash-2-' + Date.now(),
      scanStatus: 'fail',
      scanFindings: [{
        reason: 'Test security issue',
        scanner: 'test-scanner',
        severity: 'critical',
      }],
      files: [{
        filePath: path.join(testDir, 'test2.ts'),
        newContent: 'eval("dangerous")',
        diffText: '+eval("dangerous")',
      }],
    });
    lifecycle.discardForUserRejection(suggestionId2);
    const suggestion2 = repo.getSuggestion(suggestionId2);
    console.log(`   Status: ${suggestion2.status}`);
    console.log(`   Reason: ${suggestion2.discardReason}`);
    if (suggestion2.status === SuggestionStatus.Discarded && suggestion2.discardReason === DiscardReason.UserRejection) {
      console.log('✅ Discard path working\n');
    } else {
      console.log('❌ FAIL: Discard path broken\n');
      process.exit(1);
    }

    // Test 8: Test illegal transition
    console.log('8️⃣ Testing illegal transition protection...');
    try {
      lifecycle.acceptSuggestion(suggestionId2); // Should throw - discarded can't go to accepted
      console.log('❌ FAIL: Should have thrown error\n');
      process.exit(1);
    } catch (error) {
      console.log(`✅ Illegal transition blocked: ${error.message}\n`);
    }

    // Test 9: Calculate stats
    console.log('9️⃣ Testing stats calculation...');
    const stats = calculateStats(7, undefined, testDir);
    console.log(`   Total Proposed: ${stats.totalProposed}`);
    console.log(`   Total Accepted: ${stats.totalAccepted}`);
    console.log(`   Total Discarded: ${stats.totalDiscarded}`);
    console.log(`   Acceptance Rate: ${stats.acceptanceRate.toFixed(1)}%`);
    if (stats.totalProposed === 2 && stats.totalAccepted === 1 && stats.totalDiscarded === 1) {
      console.log('✅ Stats are correct\n');
    } else {
      console.log('❌ FAIL: Stats are incorrect\n');
      process.exit(1);
    }

    // Test 10: Verify database file exists
    console.log('🔟 Verifying database file...');
    const dbPath = path.join(testDir, '.firm-harness', 'lifecycle.db');
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      console.log(`   Database exists: ${dbPath}`);
      console.log(`   Size: ${stats.size} bytes`);
      console.log('✅ Database file verified\n');
    } else {
      console.log('❌ FAIL: Database file not found\n');
      process.exit(1);
    }

    // All tests passed!
    console.log('═'.repeat(60));
    console.log('🎉 ALL TESTS PASSED!');
    console.log('═'.repeat(60));
    console.log('');
    console.log('✅ Module imports work');
    console.log('✅ Can create proposed suggestions');
    console.log('✅ Can accept suggestions');
    console.log('✅ Can discard suggestions');
    console.log('✅ Illegal transitions are blocked');
    console.log('✅ Transition history is tracked');
    console.log('✅ Stats calculation works');
    console.log('✅ Database is created properly');
    console.log('');
    console.log(`📊 Test database: ${dbPath}`);
    console.log(`🗑️  Clean up: Remove ${testDir} when done`);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Test with real OpenCode session');
    console.log('  2. Install git hooks: node -e "require(\'./src/lifecycle/git-hooks\').installGitHooks()"');
    console.log('  3. Test shipped detection by committing code');
    console.log('');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();

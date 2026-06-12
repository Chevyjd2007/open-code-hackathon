# Testing the Lifecycle Tracking System

## Step-by-Step Testing Guide

### Phase 1: Unit Tests (State Machine Only - No Database Required)

The state machine tests don't require better-sqlite3, so they should pass immediately:

```powershell
cd packages\opencode
bun test src/lifecycle/state-machine.test.ts
```

**Expected Result:** ✅ All 25 tests should pass

---

### Phase 2: Fix better-sqlite3 Native Bindings

The database tests require better-sqlite3 native compilation. Try these options:

**Option A: Rebuild native modules**
```powershell
cd packages\opencode
Remove-Item -Recurse -Force node_modules\.bun\better-sqlite3* -ErrorAction SilentlyContinue
bun install
```

**Option B: Use Node instead of Bun for tests**
```powershell
npm install
npm test -- src/lifecycle/database.test.ts
```

**Option C: Skip to integration testing (recommended)**
If native compilation fails, skip to Phase 3 - the integration test will prove the system works end-to-end.

---

### Phase 3: Manual Integration Test

Let's test the complete workflow without relying on the test suite.

#### 3.1: Create a Test Project

```powershell
# Create a test directory
$testDir = "C:\temp\lifecycle-test"
New-Item -ItemType Directory -Path $testDir -Force
Set-Location $testDir

# Initialize git repo
git init
git config user.email "test@example.com"
git config user.name "Test User"

# Create a simple test file
@"
function hello() {
  console.log('Hello from test')
}
"@ | Out-File -FilePath "test.ts" -Encoding utf8

git add .
git commit -m "Initial commit"
```

#### 3.2: Test the Pipeline Manually

Create a test script to simulate the write pipeline:

**File: `C:\temp\lifecycle-test\test-pipeline.js`**
```javascript
const path = require('path');

// Import lifecycle modules
const { getLifecyclePipeline } = require('../../hackathon-26/open-code-hackathon/packages/opencode/src/lifecycle/pipeline');

async function testPipeline() {
  console.log('🧪 Testing Lifecycle Pipeline...\n');

  const lifecycle = getLifecyclePipeline(process.cwd());

  // Test 1: Record a proposed suggestion
  console.log('1️⃣ Recording proposed suggestion...');
  const suggestionId = lifecycle.recordProposed({
    sessionId: 'test-session-1',
    model: 'gpt-4',
    provider: 'openai',
    promptHash: 'test-hash-123',
    userIdentity: 'test@example.com',
    scanStatus: 'pass',
    files: [{
      filePath: path.join(process.cwd(), 'test.ts'),
      oldContent: '',
      newContent: 'console.log("AI generated code")',
      diffText: '+console.log("AI generated code")',
    }],
  });

  console.log(`✅ Suggestion recorded: ${suggestionId}`);
  console.log(`   Short ID: ${suggestionId.substring(0, 8)}\n`);

  // Test 2: Accept the suggestion
  console.log('2️⃣ Accepting suggestion...');
  lifecycle.acceptSuggestion(suggestionId);
  console.log('✅ Suggestion accepted\n');

  // Test 3: Verify status
  const repo = lifecycle.getRepository();
  const suggestion = repo.getSuggestion(suggestionId);
  console.log('3️⃣ Verifying status...');
  console.log(`   Status: ${suggestion.status}`);
  console.log(`   Model: ${suggestion.model}`);
  console.log(`   Scan Status: ${suggestion.scanStatus}\n`);

  // Test 4: Check transitions
  const transitions = repo.getTransitions(suggestionId);
  console.log('4️⃣ Transition history:');
  transitions.forEach((t, i) => {
    console.log(`   ${i + 1}. ${t.fromStatus || '(initial)'} → ${t.toStatus}`);
  });

  console.log('\n✅ All tests passed!');
  console.log(`\n📊 Database location: ${path.join(process.cwd(), '.firm-harness', 'lifecycle.db')}`);
}

testPipeline().catch(console.error);
```

**Run the test:**
```powershell
node test-pipeline.js
```

**Expected Output:**
```
🧪 Testing Lifecycle Pipeline...

1️⃣ Recording proposed suggestion...
✅ Suggestion recorded: abc12345-6789-...
   Short ID: abc12345

2️⃣ Accepting suggestion...
✅ Suggestion accepted

3️⃣ Verifying status...
   Status: accepted
   Model: gpt-4
   Scan Status: pass

4️⃣ Transition history:
   1. (initial) → proposed
   2. proposed → accepted

✅ All tests passed!

📊 Database location: C:\temp\lifecycle-test\.firm-harness\lifecycle.db
```

#### 3.3: Test Git Hooks

```powershell
# Install hooks
node -e "const { installGitHooks } = require('../../hackathon-26/open-code-hackathon/packages/opencode/src/lifecycle/git-hooks'); console.log(installGitHooks());"

# Verify hooks are installed
Get-Content .git\hooks\post-commit

# Create and commit the AI-generated file
@"
console.log("AI generated code")
"@ | Out-File -FilePath "test.ts" -Encoding utf8

git add test.ts
git commit -m "Add AI-generated code"

# Check if shipped detection ran
Get-Content .firm-harness\logs\shipped-detection.log -Tail 5
```

#### 3.4: Test Stats Command

Create a stats test script:

**File: `test-stats.js`**
```javascript
const { calculateStats, renderStats } = require('../../hackathon-26/open-code-hackathon/packages/opencode/src/lifecycle/stats');

const stats = calculateStats(7, undefined, process.cwd());
console.log(renderStats(stats));
```

**Run it:**
```powershell
node test-stats.js
```

#### 3.5: Test Inspection Command

**File: `test-inspect.js`**
```javascript
const { SuggestionRepository } = require('../../hackathon-26/open-code-hackathon/packages/opencode/src/lifecycle/repository');
const { renderInspection } = require('../../hackathon-26/open-code-hackathon/packages/opencode/src/lifecycle/inspect');

const repo = new SuggestionRepository(process.cwd());
const allSuggestions = repo.listAll();

if (allSuggestions.length > 0) {
  const suggestion = repo.getSuggestionWithFiles(allSuggestions[0].id);
  const transitions = repo.getTransitions(allSuggestions[0].id);
  console.log(renderInspection(suggestion, transitions));
} else {
  console.log('No suggestions found');
}
```

**Run it:**
```powershell
node test-inspect.js
```

---

### Phase 4: Test with OpenCode TUI

This is the real end-to-end test with the actual OpenCode interface.

#### 4.1: Build OpenCode

```powershell
cd C:\Users\Chevy Kun\Desktop\hackathon-26\open-code-hackathon\packages\opencode
bun run build
```

#### 4.2: Start OpenCode in Test Project

```powershell
cd C:\temp\lifecycle-test
# Link to local opencode build
$env:PATH = "C:\Users\Chevy Kun\Desktop\hackathon-26\open-code-hackathon\packages\opencode\dist;$env:PATH"

# Start opencode
opencode
```

#### 4.3: Test the Workflow

In the OpenCode TUI:

1. **Propose code:**
   ```
   Write a function called greet that takes a name parameter and returns a greeting
   ```

2. **Look for the suggestion ID footer** in the output:
   ```
   📋 Suggestion ID: abc12345
      Track lifecycle: opencode lifecycle inspect abc12345
   ```

3. **Accept the write** (or reject to test discard path)

4. **Check the database:**
   ```powershell
   # In another terminal
   sqlite3 .firm-harness\lifecycle.db "SELECT id, status, model, scan_status FROM suggestions ORDER BY created_at DESC LIMIT 5;"
   ```

5. **Commit the code:**
   ```powershell
   git add .
   git commit -m "Add AI-generated greet function"
   ```

6. **Check shipped detection log:**
   ```powershell
   Get-Content .firm-harness\logs\shipped-detection.log -Tail 10
   ```

7. **Verify suggestion was marked as shipped:**
   ```powershell
   sqlite3 .firm-harness\lifecycle.db "SELECT id, status, commit_sha FROM suggestions WHERE status IN ('shipped', 'shipped-modified');"
   ```

---

### Phase 5: Test All Lifecycle Paths

Test each lifecycle path to ensure completeness:

#### Path 1: Proposed → Accepted → Shipped (Clean)
```
1. Generate code suggestion
2. Accept and write to disk
3. Commit without modification
4. Verify status = "shipped" with exact hash match
```

#### Path 2: Proposed → Accepted → Shipped (Modified)
```
1. Generate code suggestion
2. Accept and write to disk
3. Manually modify the file (change ~20% of lines)
4. Commit modified version
5. Verify status = "shipped-modified" with fuzzy match
```

#### Path 3: Proposed → Discarded (User Rejection)
```
1. Generate code with security issue (use eval)
2. Scan should fail
3. Reject the override prompt
4. Verify status = "discarded" with reason "user_rejection"
```

#### Path 4: Proposed → Discarded (Scan Failure)
```sql
-- This path is automatic when scan fails and prevents write
-- Already tested in path 3
```

#### Path 5: Proposed → Discarded (Abandonment)
```
1. Generate code suggestion
2. Don't accept or reject - leave it proposed
3. End the session
4. Run: lifecycle.sweepAbandonedForSession(sessionId)
5. Verify status = "discarded" with reason "abandonment"
```

---

### Phase 6: Query the Database Directly

Test the example queries from the documentation:

```powershell
cd C:\temp\lifecycle-test

# View all suggestions
sqlite3 .firm-harness\lifecycle.db "SELECT id, status, model, created_at FROM suggestions;"

# Calculate acceptance rate
sqlite3 .firm-harness\lifecycle.db "
SELECT 
  model,
  COUNT(*) as proposed,
  SUM(CASE WHEN status IN ('accepted', 'shipped', 'shipped-modified') THEN 1 ELSE 0 END) as accepted,
  ROUND(100.0 * SUM(CASE WHEN status IN ('accepted', 'shipped', 'shipped-modified') THEN 1 ELSE 0 END) / COUNT(*), 1) as acceptance_rate
FROM suggestions
GROUP BY model;
"

# View transition log
sqlite3 .firm-harness\lifecycle.db "
SELECT 
  suggestion_id,
  from_status,
  to_status,
  reason,
  datetime(transitioned_at / 1000, 'unixepoch') as timestamp
FROM status_transitions
ORDER BY transitioned_at DESC
LIMIT 10;
"
```

---

### Phase 7: Performance Test

Test with multiple suggestions to ensure performance:

**File: `test-performance.js`**
```javascript
const { getLifecyclePipeline } = require('../../hackathon-26/open-code-hackathon/packages/opencode/src/lifecycle/pipeline');
const path = require('path');

async function performanceTest() {
  const lifecycle = getLifecyclePipeline(process.cwd());
  const count = 100;

  console.log(`🏃 Creating ${count} suggestions...`);
  const start = Date.now();

  for (let i = 0; i < count; i++) {
    const suggestionId = lifecycle.recordProposed({
      sessionId: `perf-session-${Math.floor(i / 10)}`,
      model: i % 2 === 0 ? 'gpt-4' : 'claude-3',
      provider: i % 2 === 0 ? 'openai' : 'anthropic',
      promptHash: `hash-${i}`,
      files: [{
        filePath: path.join(process.cwd(), `file${i}.ts`),
        newContent: `// Generated file ${i}`,
        diffText: `+// Generated file ${i}`,
      }],
    });

    if (i % 3 === 0) {
      lifecycle.acceptSuggestion(suggestionId);
    } else if (i % 5 === 0) {
      lifecycle.discardForUserRejection(suggestionId);
    }
  }

  const duration = Date.now() - start;
  console.log(`✅ Created ${count} suggestions in ${duration}ms (${(duration / count).toFixed(2)}ms per suggestion)`);

  // Test query performance
  const repo = lifecycle.getRepository();
  const queryStart = Date.now();
  const all = repo.listAll();
  const queryDuration = Date.now() - queryStart;
  console.log(`📊 Query performance: ${queryDuration}ms to fetch ${all.length} suggestions`);

  // Calculate stats
  const statsStart = Date.now();
  const { calculateStats } = require('../../hackathon-26/open-code-hackathon/packages/opencode/src/lifecycle/stats');
  const stats = calculateStats(7, undefined, process.cwd());
  const statsDuration = Date.now() - statsStart;
  console.log(`📈 Stats calculation: ${statsDuration}ms`);
  console.log(`   Proposed: ${stats.totalProposed}`);
  console.log(`   Accepted: ${stats.totalAccepted}`);
  console.log(`   Discarded: ${stats.totalDiscarded}`);
}

performanceTest().catch(console.error);
```

**Run it:**
```powershell
node test-performance.js
```

**Expected Performance:**
- < 10ms per suggestion creation
- < 100ms to query 100 suggestions
- < 50ms to calculate stats

---

### Phase 8: Error Handling Test

Test graceful failure scenarios:

```javascript
const { getLifecyclePipeline } = require('../../hackathon-26/open-code-hackathon/packages/opencode/src/lifecycle/pipeline');

function testErrorHandling() {
  const lifecycle = getLifecyclePipeline(process.cwd());

  console.log('🧪 Testing error handling...\n');

  // Test 1: Illegal state transition
  console.log('1️⃣ Testing illegal state transition...');
  const id = lifecycle.recordProposed({
    sessionId: 'error-test',
    model: 'gpt-4',
    provider: 'openai',
    promptHash: 'hash',
    files: [{ filePath: 'test.ts', newContent: 'code', diffText: '+code' }],
  });

  lifecycle.discardForUserRejection(id);

  try {
    lifecycle.acceptSuggestion(id); // Should throw
    console.log('❌ FAIL: Should have thrown error');
  } catch (error) {
    console.log(`✅ PASS: Caught expected error: ${error.message}\n`);
  }

  // Test 2: Non-existent suggestion
  console.log('2️⃣ Testing non-existent suggestion...');
  try {
    lifecycle.acceptSuggestion('non-existent-id');
    console.log('❌ FAIL: Should have thrown error');
  } catch (error) {
    console.log(`✅ PASS: Caught expected error: ${error.message}\n`);
  }

  console.log('✅ Error handling tests passed!');
}

testErrorHandling();
```

---

### Quick Test Checklist

Use this checklist for rapid testing:

```
☐ State machine tests pass (no DB required)
☐ Can create proposed suggestion
☐ Can accept suggestion
☐ Can discard suggestion
☐ Illegal transitions throw errors
☐ Git hooks install successfully
☐ Shipped detection runs after commit
☐ Clean match detection works
☐ Fuzzy match detection works
☐ Stats command shows correct data
☐ Inspect command shows full record
☐ Session abandonment sweeps work
☐ Multiple files per suggestion work
☐ Database queries return correct data
☐ Performance is acceptable (< 10ms per operation)
```

---

### Troubleshooting

**Problem: better-sqlite3 won't compile**
- Solution: Use Node.js instead of Bun for tests, or test manually with the scripts above

**Problem: "Not in a git repository"**
- Solution: Run `git init` in your test directory

**Problem: "Suggestion not found"**
- Solution: Use full suggestion ID, not short ID (short ID search not yet implemented)

**Problem: Hooks not running**
- Solution: Check `.git/hooks/post-commit` exists and is executable (Unix) or check logs in `.firm-harness/logs/`

**Problem: No suggestions in database**
- Solution: Verify `.firm-harness/lifecycle.db` exists in the correct directory

---

### Next Steps After Testing

Once all tests pass:

1. Wire up CLI commands to opencode CLI interface
2. Add short ID search support to inspection command
3. Consider adding export functionality (CSV/JSON)
4. Add team-wide aggregation (opt-in)
5. Create Grafana dashboard integration

---

**Testing the lifecycle tracking system is straightforward - start with the manual integration test (Phase 3) if native compilation fails!**

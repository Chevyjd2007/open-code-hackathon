## Lifecycle Tracking Testing Guide

### View All Suggestions
```powershell
Get-Content .firm-harness\lifecycle.json | ConvertFrom-Json | Select-Object -ExpandProperty suggestions | Format-Table id, status, model, sessionId -AutoSize
```

### View Transitions
```powershell
$data = Get-Content .firm-harness\lifecycle.json | ConvertFrom-Json
$data.transitions | Format-Table suggestionId, fromStatus, toStatus, reason
```

### Test Discarding (Manual)
```powershell
# Run this to mark a suggestion as discarded:
node -e "
const { SuggestionRepository, DiscardReason } = require('./src/lifecycle/repository-json');
const repo = new SuggestionRepository('.');
const all = repo.listAll();
const proposed = all.find(s => s.status === 'proposed');
if (proposed) {
  repo.markDiscarded(proposed.id, 'user_rejection');
  console.log('Marked', proposed.id.substring(0,8), 'as discarded');
} else {
  console.log('No proposed suggestions found');
}
"
```

### Test Shipped Detection
```powershell
# 1. Init git if needed
git init
git config user.email "test@test.com"
git config user.name "Test"

# 2. Commit a file that was created
git add packages/opencode/src/hello.ts
git commit -m "Test commit"

# 3. Get commit SHA
$sha = git rev-parse HEAD

# 4. Mark as shipped
node -e "
const { SuggestionRepository } = require('./src/lifecycle/repository-json');
const repo = new SuggestionRepository('.');
const all = repo.listAll();
const accepted = all.find(s => s.status === 'accepted');
if (accepted) {
  repo.markShipped(accepted.id, '$sha');
  console.log('Marked', accepted.id.substring(0,8), 'as shipped');
} else {
  console.log('No accepted suggestions found');
}
"

# 5. Verify
Get-Content .firm-harness\lifecycle.json | ConvertFrom-Json | Select-Object -ExpandProperty suggestions | Where-Object status -eq 'shipped'
```

### Full Stats
```powershell
$data = Get-Content .firm-harness\lifecycle.json | ConvertFrom-Json
$stats = $data.suggestions | Group-Object status | Select-Object Name, Count
Write-Host "`nLifecycle Stats:"
$stats | Format-Table -AutoSize
```

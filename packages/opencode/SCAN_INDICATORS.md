# Pre-Write Scan Pipeline - TUI Indicators Guide

## 🔍 Visual Scan Indicators

The Pre-Write Scan Pipeline now shows real-time indicators in the TUI as scans execute. Here's what you'll see:

### Scan Execution Flow (Console Output)

```
🔍 [SCAN] Running pre-write security scans...
🔍 [SCAN] Checking for: secrets, licenses, vulnerabilities
  → [SCAN] Running secret scanner...
  → [SCAN] Running license scanner...
  → [SCAN] Running vulnerability scanner...
    • [SECRET] Scanning for hardcoded secrets...
    • [LICENSE] Checking licenses and dependencies...
    • [VULN] Scanning for vulnerabilities...
    • [SECRET] Found 3 potential secret(s)
    • [LICENSE] Found 1 license/dependency issue(s)
    • [VULN] Found 1 vulnerability/vulnerabilities
  ✓ [SCAN] Scans complete: 5 total findings
✓ [SCAN] Security scan completed in 15ms
```

### Scan Result Messages

#### ✅ PASS - No Issues
```
✅ [SCAN] PASSED - No security issues detected
```

#### ⚠️ WARN - Potential Issues
```
⚠️  [SCAN] Status: WARN - Found 3 issue(s)
📋 [SCAN] Findings:
  [secret] config.ts:8 - Hardcoded secret-like string next to KEY/TOKEN (default-dev-key)
  [license] config.ts:6 - Unapproved library: unknown-pkg (not in approved list)
⚠️  [SCAN] WARNING - Potential security issues detected
```

Then the TUI permission dialog appears with:
```
⚠ Security Scan Warning
⚠️  Security scan found warnings:

  [secret] config.ts:8 - Hardcoded secret-like string next to KEY/TOKEN (default-dev-key)
  [license] config.ts:6 - Unapproved library: unknown-pkg (not in approved list)

Review the warnings above carefully.
Override only if you understand and accept the risks.

[Allow once]  [Allow always]  [Reject]
```

#### 🛑 FAIL - Critical Issues
```
⚠️  [SCAN] Status: FAIL - Found 2 issue(s)
📋 [SCAN] Findings:
  [vuln] db.ts:10 - Dangerous API usage: eval
  [secret] config.ts:5 - Private key block
🛑 [SCAN] BLOCKED - Critical security issues detected
```

TUI shows:
```
🛑 Security Scan Failed
❌ SECURITY SCAN FAILED - Write operation blocked

  [vuln] db.ts:10 - Dangerous API usage: eval
  [secret] config.ts:5 - Private key block

This write contains critical security issues and cannot proceed.
Please fix the issues before attempting to write.

[Allow once]  [Reject]
```

### Override Messages

When user overrides:
```
✓ [SCAN] User overrode warnings - continuing with write
```

Or for blocked scans:
```
✓ [SCAN] User overrode blocked scan - continuing with write
```

## 📍 Where to See the Indicators

### Console Output (stdout)
All `console.log` messages appear in real-time as the scan progresses:
- In the OpenCode TUI terminal output
- In any log files or redirected output
- Visible during `bun dev` development mode

### TUI Permission Dialog
The formatted scan results appear in the footer permission view:
- Shows colored indicators (🛑 for fail, ⚠ for warn)
- Displays full finding details with line numbers
- Shows the actual diff with syntax highlighting
- Provides action buttons for user decision

### Log Files
All scan events are logged to `~/.opencode/logs/prewrite-scan.jsonl`:
```json
{
  "timestamp": "2026-06-11T21:30:00.000Z",
  "filepath": "C:\\...\\config.ts",
  "scanResult": {
    "status": "warn",
    "findings": [...]
  },
  "action": "overridden"
}
```

## 🧪 Test Prompts

Try these prompts to see different scan indicators:

### Prompt 1: Hardcoded Secret (WARN)
```
"Write a database connection file with credentials"
```

**Expected indicators:**
- 🔍 Scan starts
- ⚠️ Warning status
- Shows hardcoded password
- Requires override

### Prompt 2: Eval Usage (FAIL)
```
"Create a dynamic code executor that uses eval to run user input"
```

**Expected indicators:**
- 🔍 Scan starts
- 🛑 Blocked status
- Shows dangerous eval usage
- Cannot proceed without explicit override

### Prompt 3: GPL License (FAIL)
```
"Add a GPL-3.0 license header to a new utility file"
```

**Expected indicators:**
- 🔍 Scan starts
- 🛑 Blocked status
- Shows restrictive license detected
- Requires review

### Prompt 4: Clean Code (PASS)
```
"Create a simple math utility function for addition"
```

**Expected indicators:**
- 🔍 Scan starts
- ✅ Passed
- No TUI dialog
- Write proceeds automatically

## 📊 Timing Information

Each scan shows duration:
```
✓ [SCAN] Security scan completed in 15ms
```

This helps you understand:
- How long the scan took
- Performance impact (typically <50ms)
- That scans run in parallel (fast!)

## 🎯 Key Indicators Summary

| Indicator | Meaning | User Action Required |
|-----------|---------|---------------------|
| 🔍 | Scan starting | None - informational |
| → | Scanner launching | None - informational |
| • | Scanner executing | None - informational |
| ✓ | Scanner completed | None - informational |
| ✅ | Passed | None - auto-proceed |
| ⚠️ | Warning | Review + Override |
| 🛑 | Blocked | Fix or Override |
| 📋 | Findings list | Review details |

## 🔄 Flow Timeline

```
Write Tool Called
      ↓
🔍 Scan starts (console message)
      ↓
→ → → Three scanners launch in parallel
      ↓
• • • Each scanner reports progress
      ↓
✓ Scan completes with timing
      ↓
⚠️/🛑/✅ Status message (only if not pass)
      ↓
📋 Findings displayed (if any)
      ↓
[TUI Permission Dialog] (if warn/fail)
      ↓
✓ Override confirmed (if user proceeds)
      ↓
File written + Logged
```

## 💡 Next Prompt Examples

Try this to see the full indicator flow:

**"Create an authentication helper that stores JWT tokens with a hardcoded fallback secret"**

You'll see:
1. 🔍 Scan start message
2. → All three scanners launching
3. • Scanner progress messages
4. ✓ Completion with timing
5. ⚠️ Warning status
6. 📋 Finding details (hardcoded secret)
7. TUI permission dialog
8. Your decision to override or reject

All events are timestamped and logged for audit!

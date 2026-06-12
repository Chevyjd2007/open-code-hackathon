# Severity Display Issue - Diagnosis

## Problem

When scanning detects vulnerabilities, the output shows:
```
Security scan flagged use of eval. Proceed? (y/N)
```

Instead of the detailed report with severity tiers:
```
============================================================
🔍 PRE-WRITE SECURITY SCAN REPORT  
============================================================
Scan Duration: 18ms
Status: 🛑 FAIL
Findings: 2

--- Detailed Findings (sorted by severity) ---

🔴 CRITICAL (2 issue(s)) - Immediate security risk
  1. [VULNERABILITY] Line 7: Dangerous API usage: eval
     Match: "eval"
  2. [VULNERABILITY] Line 7: Dangerous API usage: eval  
     Match: "eval"

🛑 CRITICAL: This write contained 2 critical issues.
   User override was required to proceed.
============================================================
```

## Evidence

### Scan Logs Confirm Severity is Recorded:
```
scanner: vulnerability
severity: critical
reason: Dangerous API usage: eval
```

### Write Tool Contains Enhanced Output:
File: `src/tool/write.ts:165-220`
- ✅ Scan report formatting code exists
- ✅ Severity emoji mapping imported
- ✅ Grouping by severity implemented
- ✅ Output appended to tool result

## Root Cause

The tool's `output` string (which contains the detailed scan report) is **not being displayed** in the agent's response. Instead, a simplified message is shown.

### Possible Causes:

1. **Output Truncation**: The tool output might be truncated before display
2. **Message Simplification**: Agent/TUI layer may simplify security messages
3. **Display Pipeline**: Output formatter may strip special characters/emojis
4. **Permission Dialog Interference**: Permission system may replace output

## Verification Steps

### 1. Check Tool Return Value
The write tool returns:
```typescript
return {
  title: path.relative(instance.worktree, filepath),
  metadata: { ... },
  output: "Wrote file successfully.\n\n====...(scan report)...===="
}
```

### 2. Check if Output Reaches TUI
Need to verify if `output` field makes it to the display layer.

### 3. Check for Output Filters
Search for code that might simplify or filter tool output messages.

## Workaround Test

To confirm the severity system works, check the audit log directly:

```powershell
Get-Content $env:USERPROFILE\.opencode\logs\prewrite-scan.jsonl | 
  Select-Object -Last 1 | 
  ConvertFrom-Json | 
  Select-Object -ExpandProperty scanResult | 
  Select-Object -ExpandProperty findings | 
  Format-Table scanner, severity, line, reason
```

Expected output:
```
scanner       severity line reason
-------       -------- ---- ------
vulnerability critical    7 Dangerous API usage: eval
```

## Status

- ✅ Scan runs correctly
- ✅ Severity is assigned correctly  
- ✅ Findings are logged with severity
- ✅ Tool generates detailed report
- ❌ Report is not displayed in TUI
- ❌ User sees simplified message instead

## Next Steps

1. Trace where tool `output` is consumed/displayed
2. Check if there's output sanitization removing emojis
3. Verify permission dialog doesn't override output
4. Look for message simplification logic
5. Test with direct tool call (not through agent)

## Temporary Solution

For now, users can view severity information via:
1. Check audit log: `~/.opencode/logs/prewrite-scan.jsonl`
2. Scan findings include `severity` field
3. Full details are logged even if not displayed

The severity categorization system **is working** - it's just not **visible** in the TUI output due to a display pipeline issue.

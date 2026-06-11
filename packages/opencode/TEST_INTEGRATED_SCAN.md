# Quick Test - Integrated Scan Output

Test the integrated scan output by running this prompt:

```
"Create a simple authentication checker that validates user input using eval"
```

## Expected TUI Output:

```
# Wrote src/auth-checker.ts
function checkAuth(input: string) {
  return eval(input);
}

Wrote file successfully.

============================================================
🔍 PRE-WRITE SECURITY SCAN REPORT
============================================================
Scan Duration: XX ms
Status: 🛑 FAIL
Findings: 1

--- Detailed Findings ---

[VULNERABILITY] 1 issue(s):
  1. Line 2: Dangerous API usage: eval
     Match: "eval"

⚠️  CRITICAL: This write contained security issues that were blocked.
   User override was required to proceed.
============================================================
```

## What You Should See:

1. ✅ File content displayed
2. ✅ "Wrote file successfully" message
3. ✅ Clean formatted security report (within TUI)
4. ✅ Scanner type grouping
5. ✅ Line numbers and reasons
6. ✅ Status indicator (🛑 for FAIL)
7. ✅ Critical warning message

## What You Should NOT See:

- ❌ No console.log "bleeding" outside TUI
- ❌ No raw log lines cluttering output
- ❌ No stdout interference

## To Verify:

The scan report will appear **directly in the agent's response**, cleanly formatted and contained within the TUI boundaries.

All audit details are still logged to:
```
~/.opencode/logs/prewrite-scan.jsonl
```

But the visible output is now **clean and integrated**!

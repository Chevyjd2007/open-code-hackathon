# Display Pipeline Issue - RESOLVED

## Root Cause Found

The write tool's output (including the detailed scan report with severity emojis) was not being displayed because:

**Location:** `src/cli/cmd/run/tool.ts:1049-1060`

```typescript
write: {
  view: {
    output: false,  // ← Output not shown during progress
    final: true,
    snap: "code",
  },
  run: runWrite,
  snap: snapWrite,
  scroll: {
    start: scrollWriteStart,
    // ← Missing 'final' formatter! 
  },
},
```

### The Problem:

1. The write tool had **no `final` scroll formatter**
2. When tools complete, `toolEntryBody()` calls `toolScroll("final", ctx)`
3. `toolScroll` looks for `rule(ctx.name)?.scroll?.final`
4. If missing, it falls back to showing `ctx.raw` (which is empty for final phase)
5. Result: The tool's `output` field (containing our scan report) was never displayed

### The Solution:

Added a `scrollWriteFinal` function that returns the tool's output:

```typescript
function scrollWriteFinal(p: ToolProps<typeof WriteTool>): string {
  return text(p.frame.state.output) || ""
}
```

And registered it in the write tool rule:

```typescript
scroll: {
  start: scrollWriteStart,
  final: scrollWriteFinal,  // ← Added this!
},
```

## Expected Result

Now when the write tool completes, the TUI will display:

```
Wrote file successfully.

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

🛑 CRITICAL: This write contained 2 critical issues.
   User override was required to proceed.
============================================================
```

## Files Modified:

- ✅ `src/cli/cmd/run/tool.ts` - Added `scrollWriteFinal` function
- ✅ `src/cli/cmd/run/tool.ts` - Updated write tool rule with `final` formatter

## Status: FIXED

The scan report with severity emojis and color-coding will now be visible in the TUI after every write operation that triggers the scanner.

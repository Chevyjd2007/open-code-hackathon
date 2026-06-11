# CRITICAL SECURITY BUG - Scan Override Auto-Granting

## 🚨 Issue Discovered

**File was written despite security scan FAIL status without explicit user confirmation.**

### Evidence:

```
User prompt: "Create authentication checker with eval"
Expected: File blocked until user explicitly confirms override
Actual: File created immediately WITHOUT user intervention
```

### Audit Log Shows:

```json
{
  "timestamp": "2026-06-11T22:13:53.160Z",
  "action": "blocked"  // Scan blocked the write
}
{
  "timestamp": "2026-06-11T22:13:53.161Z",  // 1ms later!
  "action": "overridden",  // Auto-overridden
  "overrideReason": "User manually overrode blocked scan"  // LIE - user did nothing
}
```

---

## 🔍 Root Cause Analysis

### Problem 1: Permission Auto-Grant
The `scan_override` permission has no explicit rule, so it defaults to "ask" action. However, **in certain modes (build mode, agent mode), permissions are being auto-granted** without user interaction.

**Location:** `src/permission/index.ts:78-95`

The `evaluate()` function returns `action: "ask"` for unknown permissions, but downstream handlers may auto-approve these.

### Problem 2: Unconditional Override Logging
After `ctx.ask()` returns, the code **assumes permission was granted** and logs "overridden" unconditionally.

**Location:** `src/tool/write.ts:96-105` and `src/tool/write.ts:121-130`

```typescript
yield* ctx.ask({ permission: "scan_override", ... })

// This executes even if permission was denied!
logScanResult({
  action: "overridden",  // WRONG - may have been rejected
  overrideReason: "User manually overrode blocked scan"
})
```

### Problem 3: No Rejection Handling
If the user rejects the permission, the Effect should fail. But currently:
- The failure isn't caught
- The write proceeds anyway
- No error is shown to the user

---

## ✅ Required Fixes

### Fix 1: Make scan_override Never Auto-Grant

Add explicit rule to prevent auto-granting of scan overrides.

**Option A: Permission Rule Configuration**
```typescript
// In permission ruleset
{
  permission: "scan_override",
  pattern: "*",
  action: "ask",  // MUST ask, never auto-allow
  requireExplicitConfirmation: true  // New flag
}
```

**Option B: Special Permission Handling**
```typescript
// In Permission.ask()
if (request.permission === "scan_override") {
  // Force interactive dialog, never auto-grant
  needsAsk = true
  // Bypass any auto-grant logic
}
```

### Fix 2: Check Permission Reply

Modify write.ts to **only log override if permission was actually granted**:

```typescript
try {
  yield* ctx.ask({ permission: "scan_override", ... })
  
  // Only reached if permission granted
  logScanResult({
    action: "overridden",
    overrideReason: "User manually overrode blocked scan"
  })
} catch (error) {
  // Permission denied or error
  if (error instanceof PermissionV1.RejectedError) {
    logScanResult({
      action: "rejected",
      overrideReason: "User rejected scan override"
    })
    // Stop execution - don't write file
    throw error
  }
}
```

### Fix 3: Prevent Write on Rejection

Ensure the Effect chain stops if permission is rejected:

```typescript
if (scanResult.status === "fail") {
  logScanResult({ action: "blocked", ... })
  
  yield* ctx.ask({ permission: "scan_override", ... }).pipe(
    Effect.tapError(() => Effect.sync(() => {
      logScanResult({ action: "rejected", ... })
    })),
    Effect.orDie  // Fail the entire write operation
  )
  
  logScanResult({ action: "overridden", ... })
}

// File write only happens if we reach here
yield* fs.writeWithDirs(filepath, ...)
```

---

## 🛡️ Security Implications

This bug allows **bypassing security scans completely** in certain execution modes:

- ❌ `eval()` usage auto-approved
- ❌ SQL injection patterns auto-approved  
- ❌ Hardcoded secrets auto-approved
- ❌ Dangerous APIs auto-approved

**All audit logs show "user manually overrode" when user did nothing!**

---

## 🔧 Immediate Mitigation

Until fixed, scan overrides are **not enforceable** in:
- Build mode
- Agent execution mode
- Any mode with auto-grant permissions

**Recommendation:** Do not rely on scan blocking in production until this is fixed.

---

## 📋 Testing the Fix

1. Create file with `eval()`
2. Verify scan shows FAIL status
3. **Verify TUI permission dialog appears**
4. **Verify file is NOT created until user clicks "Allow once"**
5. If user clicks "Reject", verify file is NOT created
6. Check audit log shows correct action (blocked → overridden OR blocked → rejected)

---

## 🎯 Expected Behavior After Fix

### Scenario 1: User Approves Override
```
1. Scan detects eval() → FAIL
2. Log: action="blocked"
3. TUI dialog appears
4. User clicks "Allow once"
5. Log: action="overridden"
6. File written
7. Success message with scan report
```

### Scenario 2: User Rejects Override
```
1. Scan detects eval() → FAIL
2. Log: action="blocked"
3. TUI dialog appears
4. User clicks "Reject"
5. Log: action="rejected"
6. File NOT written
7. Error: "Write cancelled by user - security scan blocked"
```

### Scenario 3: Agent Mode with Auto-Grant
```
1. Scan detects eval() → FAIL
2. Log: action="blocked"
3. Permission check: scan_override requires manual confirmation
4. Auto-grant DENIED (special handling)
5. Execution pauses waiting for user
6. User must manually approve via TUI
```

---

## 📊 Priority

**CRITICAL** - This is a security bypass vulnerability.

Without this fix, the Pre-Write Scan Pipeline provides **false security** - it logs violations but doesn't enforce them.

---

## 🔗 Related Files

- `src/tool/write.ts:71-130` - Override logging
- `src/permission/index.ts:78-95` - Permission evaluation
- `src/permission/evaluate.ts` - Rule matching
- `src/cli/cmd/run/permission.shared.ts:119` - scan_override UI

---

## ✅ Verification

After implementing fixes, verify:

1. [ ] scan_override cannot be auto-granted
2. [ ] Permission rejection stops execution
3. [ ] File is NOT created when rejected
4. [ ] Audit logs accurately reflect user action
5. [ ] TUI dialog always appears for scan_override
6. [ ] Build mode respects scan blocks
7. [ ] Agent mode respects scan blocks

---

**Status: BUG CONFIRMED - REQUIRES IMMEDIATE FIX**

The scan pipeline is logging correctly but **not enforcing security policies**.

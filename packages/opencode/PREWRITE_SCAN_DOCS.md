# Pre-Write Scan Pipeline

## Overview

The Pre-Write Scan Pipeline is a secure-by-default security gate that runs automated scans on every code suggestion before it reaches the editor. This ensures that secrets, restrictive licenses, and security vulnerabilities are caught before any code is written to disk.

## Features

### Three-Tier Scanning System

1. **Secret Scanner** - Detects:
   - Hardcoded API keys, tokens, and passwords
   - AWS access keys
   - JWT tokens
   - Private keys
   - High-entropy strings that might be secrets
   - Environment variable fallbacks with hardcoded values

2. **License Scanner** - Detects:
   - Restrictive licenses (GPL, AGPL, SSPL, BUSL, Commons Clause)
   - Unapproved third-party libraries
   - License headers in code

3. **Vulnerability Scanner** - Detects:
   - SQL injection patterns
   - Command injection risks
   - Dangerous APIs (eval, innerHTML, dangerouslySetInnerHTML)
   - Path traversal vulnerabilities
   - Insecure random number generation for security-sensitive values

### Scan Results

Each scan returns one of three statuses:

- **pass** - No issues found, write proceeds automatically
- **warn** - Potential issues found, requires explicit user override
- **fail** - Critical issues found, write is blocked and requires user acknowledgment

### TUI Integration

When a scan detects issues:

- **Warnings** appear in yellow (⚠) with detailed findings
- **Failures** appear in red (🛑) and block the write operation
- Users can review the diff and see exactly where issues were detected
- Line numbers and scanner names are shown for each finding
- Users must explicitly confirm to override warnings
- Failed scans prevent writes until issues are fixed

### Audit Logging

All scan results are logged to `~/.opencode/logs/prewrite-scan.jsonl` including:

- Timestamp
- File path
- User identity
- Workspace location
- Scan results with full findings
- User action (blocked, overridden, or passed)
- Override reason when applicable

## Configuration

Edit `packages/opencode/config/prewrite-scan.json` to customize:

```json
{
  "entropyThreshold": 4.2,
  "secretRegexes": {
    "private_key": "-----BEGIN [A-Z ]+ PRIVATE KEY-----",
    "aws_access": "AKIA[0-9A-Z]{16}",
    "jwt": "\\\\b[A-Za-z0-9-_]+\\\\.[A-Za-z0-9-_]+\\\\.[A-Za-z0-9-_]+\\\\b"
  },
  "approvedLibraries": ["lodash", "axios"],
  "bannedApis": ["eval", "new Function"],
  "bannedLicenses": ["GPL", "AGPL", "SSPL"]
}
```

## Architecture

### Components

1. **Scanners** (`src/scanners/`)
   - `secret.ts` - Secret detection with entropy analysis
   - `license.ts` - License and dependency checking
   - `vuln.ts` - Vulnerability pattern detection
   - `index.ts` - Orchestrator that runs all scanners in parallel
   - `log.ts` - Audit logging system

2. **Plugin Integration** (`src/plugin/`)
   - `prewrite-scan.ts` - Plugin hook implementation
   - Registered as internal plugin in `src/plugin/index.ts`
   - Hook type `prewrite_scan` added to plugin system

3. **Write Tool Integration** (`src/tool/write.ts`)
   - Automatically triggers scan before writing
   - Displays scan results via permission system
   - Logs all scan outcomes

4. **TUI Display** (`src/cli/cmd/run/`)
   - `permission.shared.ts` - Scan result formatting
   - `footer.permission.tsx` - Visual display of findings
   - Shows diff with highlighted issues

### Flow

```
Agent proposes write
    ↓
Compute unified diff
    ↓
Trigger prewrite_scan hook
    ↓
Run scanners in parallel
    ↓
Aggregate findings
    ↓
Determine worst status (fail > warn > pass)
    ↓
Log scan result
    ↓
If fail or warn: Display in TUI, request override
    ↓
If user overrides: Log override with reason
    ↓
Proceed with write (or block if rejected)
```

## Testing

Run the test suite:

```bash
cd packages/opencode
bun run src/scanners/test-pipeline.ts
```

This tests all three scanners and the full pipeline integration.

## Showcase Example

**Prompt to test**: "Create a config file with an API key from environment variable"

**Expected behavior**:
1. Agent generates code with a hardcoded fallback:
   ```typescript
   const apiKey = process.env.API_KEY || "default-key-12345"
   ```

2. Secret scanner flags the hardcoded value

3. TUI shows finding in red:
   ```
   🛑 Security Scan Warning
   [secret] config.ts:1 - Hardcoded secret-like string next to KEY/TOKEN (default-key-12345)
   ```

4. User can:
   - Review the diff
   - Fix the code (remove hardcoded fallback)
   - Override with explicit confirmation (logged)

5. All actions are logged to `~/.opencode/logs/prewrite-scan.jsonl`

## Files Modified/Created

### Created
- `packages/opencode/src/scanners/secret.ts`
- `packages/opencode/src/scanners/license.ts`
- `packages/opencode/src/scanners/vuln.ts`
- `packages/opencode/src/scanners/index.ts`
- `packages/opencode/src/scanners/log.ts`
- `packages/opencode/src/scanners/test-pipeline.ts`
- `packages/opencode/src/plugin/prewrite-scan.ts`
- `packages/opencode/src/util/diff.ts`
- `packages/opencode/config/prewrite-scan.json`

### Modified
- `packages/opencode/src/plugin/index.ts` - Added PrewriteScanPlugin import and registration
- `packages/opencode/src/tool/write.ts` - Integrated scanner trigger and logging
- `packages/opencode/src/cli/cmd/run/permission.shared.ts` - Added scan_override display
- `packages/plugin/src/index.ts` - Added prewrite_scan hook to Hooks interface

## Status

✅ **All features implemented and tested**

- ✅ Secret scanner with entropy analysis
- ✅ License scanner with dependency checking
- ✅ Vulnerability scanner with pattern detection
- ✅ Plugin system integration
- ✅ Write tool integration
- ✅ TUI display for scan results
- ✅ User override flow
- ✅ Audit logging
- ✅ Configuration system
- ✅ Test suite

The Pre-Write Scan Pipeline is production-ready and will activate automatically on the next OpenCode restart.

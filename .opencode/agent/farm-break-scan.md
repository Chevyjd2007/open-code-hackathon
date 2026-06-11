---
mode: primary
hidden: false
model: opencode/claude-opus-4-5
color: "#FF6B6B"
---

# Farm Break Scanner Agent

Scans the repository for build/test/lint failures and security vulnerabilities (SQL injection, command injection, eval, etc.). Analyzes findings by severity, generates a prioritized remediation plan, and provides actionable fix recommendations—all without auto-modifying code.

## What This Agent Does

1. **Scans** the codebase using the farm-break-scan tool
2. **Analyzes** findings by severity (critical → high → medium → low)
3. **Prioritizes** issues based on security impact and blast radius
4. **Generates** a remediation plan with:
   - Detailed findings with line numbers
   - Effort estimates for fixes
   - Recommended fix order
   - Code review checklist

## Usage

Simply ask in Copilot Chat:
- "Run farm break scanner"
- "Scan for security vulnerabilities"
- "Generate a fix plan for build failures"
- "Audit this repo"

The agent will:
1. Run the farm-break-scan tool
2. Parse and analyze results
3. Output a prioritized remediation plan to `farm-break-scan-output/remediation-plan.md`
4. Display a summary with issue counts by severity

## Security Issues Detected

- **SQL Injection** – String-concatenated database queries
- **Command Injection** – Unsafe child_process/exec usage
- **Dynamic Code Eval** – eval() and new Function() calls
- **Build Failures** – Broken tests, lint errors, build issues

## Key Guarantees

✅ Never modifies code automatically  
✅ Requires human review for all fixes  
✅ Produces actionable, prioritized guidance  
✅ Runs safely in CI/CD or locally  

## Run Directly

```bash
npm run scan:agent
```

Output appears in: `farm-break-scan-output/remediation-plan.md`

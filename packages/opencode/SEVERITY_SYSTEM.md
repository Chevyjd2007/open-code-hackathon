# Severity-Based Categorization System

## Overview

The Pre-Write Scan Pipeline now categorizes all security findings with four severity levels, each with color-coded emoji indicators for instant visual recognition.

---

## 🎨 Severity Levels

### 🔴 CRITICAL
**Description:** Immediate security risk - Must be fixed  
**Examples:**
- `eval()` usage
- SQL injection vulnerabilities
- Command injection patterns
- Private key exposure

**Action:** Automatically triggers `FAIL` status

---

### 🟠 HIGH
**Description:** Significant security concern - Should be fixed  
**Examples:**
- Hardcoded API keys/secrets
- AWS access keys
- Path traversal vulnerabilities
- Restrictive license usage (GPL, AGPL)

**Action:** May trigger `FAIL` or `WARN` status depending on scanner

---

### 🟡 MEDIUM
**Description:** Potential security issue - Review recommended  
**Examples:**
- High-entropy tokens (possible secrets)
- Insecure random number generation
- Unapproved libraries
- Weak cryptographic practices

**Action:** Triggers `WARN` status

---

### 🟢 LOW
**Description:** Minor concern or best practice violation  
**Examples:**
- JWT-like patterns (false positives)
- Code style issues
- Minor license concerns

**Action:** Triggers `WARN` status

---

## 📊 Scan Report Format

### Example Output (with eval):

```
Wrote file successfully.

============================================================
🔍 PRE-WRITE SECURITY SCAN REPORT
============================================================
Scan Duration: 18ms
Status: 🛑 FAIL
Findings: 4

--- Detailed Findings (sorted by severity) ---

🔴 CRITICAL (1 issue(s)) - Immediate security risk
  1. [VULNERABILITY] Line 9: Dangerous API usage: eval
     Match: "eval"

🟠 HIGH (1 issue(s)) - Significant security concern
  1. [LICENSE] Line 1: Unapproved library: readline (not in approved list)
     Match: "readline"

🟡 MEDIUM (0 issue(s)) - Potential security issue

🟢 LOW (2 issue(s)) - Minor concern or best practice
  1. [SECRET] Line 7: Possible JWT token
     Match: "this.rl.question"
  2. [SECRET] Line 11: Possible JWT token
     Match: "this.rl.close"

🛑 CRITICAL: This write contained 1 critical and 1 high severity issues.
   User override was required to proceed.
============================================================
```

---

## 🎯 TUI Permission Dialog (Enhanced)

When scan finds issues, the permission dialog now shows:

```
┌──────────────────────────────────────────────────────────┐
│ 🛑 Security Scan Failed                                  │
│                                                           │
│ ❌ SECURITY SCAN FAILED - Write operation blocked        │
│                                                           │
│ 🔴 CRITICAL (1 issue(s)):                                │
│   • [vulnerability] Line 9: Dangerous API usage: eval    │
│     Match: "eval"                                        │
│                                                           │
│ 🟠 HIGH (1 issue(s)):                                    │
│   • [license] Line 1: Unapproved library: readline      │
│     Match: "readline"                                    │
│                                                           │
│ 🟢 LOW (2 issue(s)):                                     │
│   • [secret] Line 7: Possible JWT token                 │
│   • [secret] Line 11: Possible JWT token                │
│                                                           │
│ 🛑 This write contains critical security issues and      │
│    cannot proceed. Please fix the issues before          │
│    attempting to write.                                  │
│                                                           │
│ [Diff View]                                              │
│ +  console.log(eval(code));  ← 🔴 CRITICAL               │
│                                                           │
│ [Allow once]  [Reject]                                   │
└──────────────────────────────────────────────────────────┘
```

---

## 🔍 Scanner Severity Assignment

### Vulnerability Scanner

| Pattern | Severity | Reason |
|---------|----------|--------|
| `eval()`, `new Function()` | 🔴 CRITICAL | Code execution vulnerability |
| SQL injection | 🔴 CRITICAL | Database compromise |
| Command injection | 🔴 CRITICAL | System compromise |
| Path traversal | 🟠 HIGH | File system access |
| Insecure random | 🟡 MEDIUM | Weak security tokens |

### Secret Scanner

| Pattern | Severity | Reason |
|---------|----------|--------|
| Private keys | 🔴 CRITICAL | Full credential exposure |
| AWS access keys | 🟠 HIGH | Cloud resource access |
| Hardcoded secrets | 🟠 HIGH | Production credential leak |
| High entropy tokens | 🟡 MEDIUM | Possible secret detection |
| JWT-like patterns | 🟢 LOW | Often false positives |

### License Scanner

| Pattern | Severity | Reason |
|---------|----------|--------|
| GPL/AGPL/SSPL | 🟠 HIGH | Restrictive copyleft |
| Unapproved libraries | 🟡 MEDIUM | Unknown licensing |

---

## 📈 Fail/Warn/Pass Logic

### FAIL Status Triggers:
- **Any CRITICAL severity finding**
- Example: `eval()`, SQL injection, private keys

### WARN Status Triggers:
- **HIGH severity** (no CRITICAL)
- **MEDIUM severity** (no CRITICAL/HIGH in some scanners)
- Example: Hardcoded API keys, unapproved libraries

### PASS Status:
- **No findings** or
- **Only LOW severity** (scanner-dependent)

---

## 🎨 Visual Legend

```
🔴 CRITICAL → Red      → Block immediately
🟠 HIGH     → Orange   → Strong warning
🟡 MEDIUM   → Yellow   → Caution advised
🟢 LOW      → Green    → Informational
```

---

## 🔧 Configuration

Edit `config/prewrite-scan.json` to customize severity mappings:

```json
{
  "secretRegexes": {
    "custom_pattern": {
      "regex": "SECRET_[A-Z]+",
      "severity": "high",
      "reason": "Custom secret pattern"
    }
  }
}
```

---

## 🎯 Benefits

✅ **Instant Priority Recognition** - Emojis show risk at a glance  
✅ **Sorted by Severity** - Critical issues appear first  
✅ **Color-Coded** - Visual hierarchy (red > orange > yellow > green)  
✅ **Actionable** - Clear what needs immediate attention  
✅ **Consistent** - Same colors across TUI and reports  
✅ **Scannable** - Easy to skim for critical issues  

---

## 📊 Severity Distribution Example

After scanning 100 files:
- 🔴 CRITICAL: 2 findings (2%) → **Must fix**
- 🟠 HIGH: 15 findings (15%) → **Should fix**
- 🟡 MEDIUM: 45 findings (45%) → **Review**
- 🟢 LOW: 38 findings (38%) → **Optional**

**Focus:** Fix the 2 critical and 15 high severity issues first!

---

## 🧪 Test the Enhancement

Try this prompt:

```
"Create a user validator that:
1. Uses eval to check permissions
2. Has a hardcoded admin password
3. Uses Math.random() for session tokens
4. Imports an unapproved library"
```

**Expected Output:**
```
🔴 CRITICAL (1 issue) - eval usage
🟠 HIGH (1 issue) - hardcoded password  
🟡 MEDIUM (2 issues) - insecure random + unapproved library
```

All findings sorted by severity, with color-coded emojis!

---

## ✅ Enhancements Complete

- ✅ Four severity levels (Critical, High, Medium, Low)
- ✅ Color-coded emoji indicators
- ✅ Automatic severity sorting (worst first)
- ✅ Enhanced TUI permission dialog
- ✅ Detailed scan reports with severity grouping
- ✅ Audit log includes severity for all findings

**The scan pipeline now provides clear, actionable, severity-based security feedback!** 🎨🔒

import type { ScanResult, ScanFinding, SeverityLevel } from "./index"
import fs from "fs"
import path from "path"

function loadConfig() {
  try {
    const cfgPath = path.join(process.cwd(), "packages", "opencode", "config", "prewrite-scan.json")
    if (fs.existsSync(cfgPath)) return JSON.parse(fs.readFileSync(cfgPath, "utf8"))
  } catch {
    // ignore
  }
  return null
}

const defaultBannedApis = ["eval", "new Function", "innerHTML", "dangerouslySetInnerHTML", "setTimeout(string"]

// Detects common vulnerability patterns
export async function scan(diff: string, _ctx: any): Promise<ScanResult> {
  const cfg = loadConfig()
  const bannedApis = cfg?.bannedApis ?? defaultBannedApis
  const findings: ScanFinding[] = []

  if (!diff) return { status: "pass", findings: [] }

  const lines = diff.split(/\r?\n/)
  let currentPath: string | undefined

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith("+++ b/")) {
      currentPath = line.slice(6).trim()
      continue
    }

    // Only check added lines
    if (!line.startsWith("+")) continue

    // Check for banned APIs - CRITICAL severity
    for (const api of bannedApis) {
      if (line.includes(api)) {
        findings.push({
          path: currentPath,
          line: i + 1,
          reason: `Dangerous API usage: ${api}`,
          match: api,
          scanner: "vulnerability",
          severity: "critical" as SeverityLevel,
        })
      }
    }

    // Check for SQL injection patterns - CRITICAL severity
    const sqlPatterns = [
      /\$\{[^}]*\}.*(?:SELECT|INSERT|UPDATE|DELETE|DROP)/i,
      /`.*\$\{.*\}.*`.*(?:SELECT|INSERT|UPDATE|DELETE|DROP)/i,
      /['"].*\+.*(?:SELECT|INSERT|UPDATE|DELETE|DROP)/i,
    ]

    for (const pattern of sqlPatterns) {
      if (pattern.test(line)) {
        findings.push({
          path: currentPath,
          line: i + 1,
          reason: "Potential SQL injection vulnerability (string concatenation in query)",
          match: line.trim().substring(0, 50),
          scanner: "vulnerability",
          severity: "critical" as SeverityLevel,
        })
        break
      }
    }

    // Check for command injection patterns - CRITICAL severity
    if (/exec\(|spawn\(|execSync\(|spawnSync\(/.test(line) && /\$\{|`.*\$\{|\+/.test(line)) {
      findings.push({
        path: currentPath,
        line: i + 1,
        reason: "Potential command injection (dynamic command execution)",
        match: line.trim().substring(0, 50),
        scanner: "vulnerability",
        severity: "critical" as SeverityLevel,
      })
    }

    // Check for path traversal - HIGH severity
    if (/(readFile|writeFile|readFileSync|writeFileSync)\(.*\.\.\//i.test(line)) {
      findings.push({
        path: currentPath,
        line: i + 1,
        reason: "Potential path traversal vulnerability",
        match: line.trim().substring(0, 50),
        scanner: "vulnerability",
        severity: "high" as SeverityLevel,
      })
    }

    // Check for insecure random - MEDIUM severity
    if (/Math\.random\(\)/.test(line) && /(token|secret|key|password|session)/i.test(line)) {
      findings.push({
        path: currentPath,
        line: i + 1,
        reason: "Insecure random number generator for security-sensitive value",
        match: "Math.random()",
        scanner: "vulnerability",
        severity: "medium" as SeverityLevel,
      })
    }
  }

  // Fail if CRITICAL severity found
  const hasCritical = findings.some((f) => f.severity === "critical")
  if (hasCritical) return { status: "fail", findings }
  if (findings.length) return { status: "warn", findings }
  return { status: "pass", findings: [] }
}

export default scan

import type { ScanResult, ScanFinding } from "./index"
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

  console.log("    • [VULN] Scanning for vulnerabilities...")
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

    // Check for banned APIs
    for (const api of bannedApis) {
      if (line.includes(api)) {
        findings.push({
          path: currentPath,
          line: i + 1,
          reason: `Dangerous API usage: ${api}`,
          match: api,
          scanner: "vulnerability",
        })
      }
    }

    // Check for SQL injection patterns
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
        })
        break
      }
    }

    // Check for command injection patterns
    if (/exec\(|spawn\(|execSync\(|spawnSync\(/.test(line) && /\$\{|`.*\$\{|\+/.test(line)) {
      findings.push({
        path: currentPath,
        line: i + 1,
        reason: "Potential command injection (dynamic command execution)",
        match: line.trim().substring(0, 50),
        scanner: "vulnerability",
      })
    }

    // Check for path traversal
    if (/(readFile|writeFile|readFileSync|writeFileSync)\(.*\.\.\//i.test(line)) {
      findings.push({
        path: currentPath,
        line: i + 1,
        reason: "Potential path traversal vulnerability",
        match: line.trim().substring(0, 50),
        scanner: "vulnerability",
      })
    }

    // Check for insecure random
    if (/Math\.random\(\)/.test(line) && /(token|secret|key|password|session)/i.test(line)) {
      findings.push({
        path: currentPath,
        line: i + 1,
        reason: "Insecure random number generator for security-sensitive value",
        match: "Math.random()",
        scanner: "vulnerability",
      })
    }
  }

  // Fail if SQL injection, command injection, or banned APIs are found
  const hasHighSeverity = findings.some(
    (f) =>
      f.reason.includes("injection") ||
      f.reason.includes("Dangerous API") ||
      f.reason.includes("path traversal"),
  )
  console.log(`    • [VULN] Found ${findings.length} vulnerability/vulnerabilities`)
  if (hasHighSeverity) return { status: "fail", findings }
  if (findings.length) return { status: "warn", findings }
  return { status: "pass", findings: [] }
}

export default scan

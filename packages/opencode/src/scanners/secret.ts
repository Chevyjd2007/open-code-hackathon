import type { ScanResult, ScanFinding, SeverityLevel } from "./index"
import fs from "fs"
import path from "path"

function shannonEntropy(s: string) {
  const map = new Map<string, number>()
  for (const ch of s) map.set(ch, (map.get(ch) ?? 0) + 1)
  let h = 0
  const len = s.length
  for (const v of map.values()) {
    const p = v / len
    h -= p * Math.log2(p)
  }
  return h
}

function loadConfig() {
  try {
    const cfgPath = path.join(process.cwd(), "packages", "opencode", "config", "prewrite-scan.json")
    if (fs.existsSync(cfgPath)) return JSON.parse(fs.readFileSync(cfgPath, "utf8"))
  } catch {
    // ignore
  }
  return null
}

const defaultRules = [
  { name: "private_key", regex: /-----BEGIN [A-Z ]+ PRIVATE KEY-----/, severity: "critical", reason: "Private key block" },
  { name: "aws_access", regex: /AKIA[0-9A-Z]{16}/, severity: "high", reason: "AWS access key id" },
  { name: "jwt", regex: /\b[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\b/, severity: "low", reason: "Possible JWT token" },
  { name: "assignment_key", regex: /(?:api[_-]?key|secret|token)\s*[:=]\s*['"]([A-Za-z0-9-_+\/=]{6,})['"]/i, severity: "high", reason: "Credential assigned in code" },
]

export async function scan(diff: string, _ctx: any): Promise<ScanResult> {
  const cfg = loadConfig()
  const rules = cfg?.secretRegexes ? Object.entries(cfg.secretRegexes).map(([k, v]: any) => ({ name: k, regex: new RegExp(v), severity: "high", reason: k })) : defaultRules
  const entropyThreshold = cfg?.entropyThreshold ?? 4.2
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

    // Check explicit rules
    for (const rule of rules) {
      const m = line.match(rule.regex)
      if (m) {
        findings.push({
          path: currentPath,
          line: i + 1,
          reason: rule.reason,
          match: m[0],
          scanner: "secret",
          severity: rule.severity as SeverityLevel,
        })
      }
    }

    // Heuristic: hardcoded fallback next to env access or variable named KEY/TOKEN - HIGH severity
    if (/\b(API|KEY|TOKEN|SECRET)\b/i.test(line)) {
      const lit = line.match(/['"]([^'"]{6,})['"]/)
      if (lit) {
        findings.push({
          path: currentPath,
          line: i + 1,
          reason: "Hardcoded secret-like string next to KEY/TOKEN",
          match: lit[1],
          scanner: "secret",
          severity: "high" as SeverityLevel,
        })
      }
    }

    // Entropy check for base64-like tokens - MEDIUM severity
    const tokens = Array.from(line.matchAll(/[A-Za-z0-9+/=]{20,}/g)).map((m) => m[0])
    for (const tok of tokens) {
      const ent = shannonEntropy(tok)
      if (ent >= entropyThreshold) {
        findings.push({
          path: currentPath,
          line: i + 1,
          reason: `High entropy token (entropy=${ent.toFixed(2)})`,
          match: tok,
          scanner: "secret",
          severity: "medium" as SeverityLevel,
        })
      }
    }
  }

  // Fail if CRITICAL severity found (private keys)
  const hasCritical = findings.some((f) => f.severity === "critical")
  if (hasCritical) return { status: "fail", findings }
  if (findings.length) return { status: "warn", findings }
  return { status: "pass", findings: [] }
}

export default scan

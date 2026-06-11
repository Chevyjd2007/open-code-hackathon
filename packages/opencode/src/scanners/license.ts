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

const defaultBannedLicenses = ["GPL", "AGPL", "SSPL", "BUSL", "Commons Clause"]
const defaultApprovedLibraries = ["lodash", "axios", "date-fns", "zod"]

// Detects restrictive licenses in headers and package imports
export async function scan(diff: string, _ctx: any): Promise<ScanResult> {
  const cfg = loadConfig()
  const bannedLicenses = cfg?.bannedLicenses ?? defaultBannedLicenses
  const approvedLibraries = cfg?.approvedLibraries ?? defaultApprovedLibraries
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

    // Check for license headers in added lines
    if (line.startsWith("+")) {
      for (const license of bannedLicenses) {
        if (line.toLowerCase().includes(license.toLowerCase())) {
          findings.push({
            path: currentPath,
            line: i + 1,
            reason: `Restrictive license detected: ${license}`,
            match: license,
            scanner: "license",
          })
        }
      }

      // Check for package imports
      const importMatch = line.match(/(?:import|require|from)\s+['"]([@\w\-/]+)['"]/)
      if (importMatch) {
        const pkg = importMatch[1].split("/")[0] // Get base package name
        if (!approvedLibraries.includes(pkg) && pkg !== "." && pkg !== ".." && !pkg.startsWith("@opencode")) {
          findings.push({
            path: currentPath,
            line: i + 1,
            reason: `Unapproved library: ${pkg} (not in approved list)`,
            match: pkg,
            scanner: "license",
          })
        }
      }
    }
  }

  // Fail if any restrictive license is found, warn on unapproved libraries
  const hasRestrictiveLicense = findings.some((f) => f.reason.includes("Restrictive license"))
  if (hasRestrictiveLicense) return { status: "fail", findings }
  if (findings.length) return { status: "warn", findings }
  return { status: "pass", findings: [] }
}

export default scan

import { scan as secretScan } from "./secret"
import { scan as licenseScan } from "./license"
import { scan as vulnScan } from "./vuln"

export type SeverityLevel = "critical" | "high" | "medium" | "low"

export type ScanFinding = {
  path?: string
  line?: number
  reason: string
  match?: string
  scanner: string
  severity: SeverityLevel
}

export type ScanResult = {
  status: "pass" | "warn" | "fail"
  findings: ScanFinding[]
}

// Severity level ordering for sorting (highest to lowest)
const severityOrder: Record<SeverityLevel, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

// Emoji and description for each severity level
export const severityDisplay: Record<SeverityLevel, { emoji: string; label: string; description: string }> = {
  critical: { emoji: "🔴", label: "CRITICAL", description: "Immediate security risk" },
  high: { emoji: "🟠", label: "HIGH", description: "Significant security concern" },
  medium: { emoji: "🟡", label: "MEDIUM", description: "Potential security issue" },
  low: { emoji: "🟢", label: "LOW", description: "Minor concern or best practice" },
}

export async function runScanners(diff: string, ctx: { user?: any; workspace?: string }): Promise<ScanResult> {
  const results = await Promise.all([secretScan(diff, ctx), licenseScan(diff, ctx), vulnScan(diff, ctx)])
  const findings = results.flatMap((r) => r.findings)
  
  // Sort findings by severity (critical first, low last)
  findings.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity])
  
  const worst = results.reduce((acc, r) => {
    if (r.status === "fail") return "fail"
    if (r.status === "warn" && acc !== "fail") return "warn"
    return acc
  }, "pass" as "pass" | "warn" | "fail")
  return { status: worst, findings }
}

export default runScanners

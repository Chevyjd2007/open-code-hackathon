import { scan as secretScan } from "./secret"
import { scan as licenseScan } from "./license"
import { scan as vulnScan } from "./vuln"

export type ScanFinding = {
  path?: string
  line?: number
  reason: string
  match?: string
  scanner: string
}

export type ScanResult = {
  status: "pass" | "warn" | "fail"
  findings: ScanFinding[]
}

export async function runScanners(diff: string, ctx: { user?: any; workspace?: string }): Promise<ScanResult> {
  console.log("  → [SCAN] Running secret scanner...")
  console.log("  → [SCAN] Running license scanner...")
  console.log("  → [SCAN] Running vulnerability scanner...")
  
  const results = await Promise.all([secretScan(diff, ctx), licenseScan(diff, ctx), vulnScan(diff, ctx)])
  
  const findings = results.flatMap((r) => r.findings)
  console.log(`  ✓ [SCAN] Scans complete: ${findings.length} total findings`)
  
  const worst = results.reduce((acc, r) => {
    if (r.status === "fail") return "fail"
    if (r.status === "warn" && acc !== "fail") return "warn"
    return acc
  }, "pass" as "pass" | "warn" | "fail")
  return { status: worst, findings }
}

export default runScanners

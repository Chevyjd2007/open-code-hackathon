#!/usr/bin/env node
/**
 * Farm Break Scanner Agent
 * 
 * Autonomous agent that:
 * 1. Runs the farm-break-scan skill
 * 2. Analyzes findings by severity
 * 3. Generates prioritized remediation plan
 */

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

interface Finding {
  type: string
  file: string
  line: number
  code: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  reason: string
}

interface AnalysisResult {
  totalFindings: number
  criticalCount: number
  groupedByFile: Record<string, Finding[]>
  groupedBySeverity: Record<string, Finding[]>
  remediationPlan: string[]
}

// Severity mapping
const severityMap: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
  'SQL injection': 'critical',
  'child_process': 'critical',
  'exec': 'critical',
  'eval': 'high',
  'new Function': 'high',
  'string_concatenation_queries': 'high',
}

async function runScan() {
  console.log('📋 Phase 1: Running farm-break-scan...')
  try {
    execSync('node scripts/farm-break-scan.js', { stdio: 'inherit' })
  } catch (e) {
    console.warn('⚠️  Scan completed with warnings (see above)')
  }
}

function parseResults(): Finding[] {
  const reportPath = 'farm-break-scan-output/report.json'
  
  if (!fs.existsSync(reportPath)) {
    console.log('No findings from scan.')
    return []
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  const findings: Finding[] = []

  // Parse the report structure
  if (report.insecurePatterns) {
    report.insecurePatterns.forEach((entry: any) => {
      findings.push({
        type: entry.pattern,
        file: entry.file,
        line: entry.line,
        code: entry.code,
        severity: severityMap[entry.pattern] || 'medium',
        reason: entry.why || 'Potential security issue',
      })
    })
  }

  return findings
}

function analyzeFindings(findings: Finding[]): AnalysisResult {
  console.log('🔍 Phase 2: Analyzing findings...')

  const groupedByFile: Record<string, Finding[]> = {}
  const groupedBySeverity: Record<string, Finding[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  }

  findings.forEach((f) => {
    // Group by file
    if (!groupedByFile[f.file]) groupedByFile[f.file] = []
    groupedByFile[f.file].push(f)

    // Group by severity
    groupedBySeverity[f.severity].push(f)
  })

  return {
    totalFindings: findings.length,
    criticalCount: groupedBySeverity.critical.length,
    groupedByFile,
    groupedBySeverity,
    remediationPlan: generatePlan(groupedBySeverity),
  }
}

function generatePlan(grouped: Record<string, Finding[]>): string[] {
  const plan: string[] = []

  plan.push('## Remediation Plan\n')
  plan.push('### Priority 1: CRITICAL (Fix Immediately)')

  if (grouped.critical.length > 0) {
    plan.push(
      `${grouped.critical.length} critical security issue(s) found:\n` +
        grouped.critical
          .map(
            (f) =>
              `  - **${f.type}** in ${f.file}:${f.line}\n    ${f.reason}`
          )
          .join('\n')
    )
  } else {
    plan.push('✅ No critical issues found')
  }

  plan.push('\n### Priority 2: HIGH (Fix This Sprint)')
  if (grouped.high.length > 0) {
    plan.push(
      `${grouped.high.length} high-severity issue(s):\n` +
        grouped.high
          .map(
            (f) =>
              `  - **${f.type}** in ${f.file}:${f.line}\n    ${f.reason}`
          )
          .join('\n')
    )
  } else {
    plan.push('✅ No high-severity issues found')
  }

  plan.push('\n### Priority 3: MEDIUM & LOW (Backlog)')
  const mediumLow = [...grouped.medium, ...grouped.low]
  if (mediumLow.length > 0) {
    plan.push(`${mediumLow.length} lower-priority issue(s)`)
  } else {
    plan.push('✅ No medium or low priority issues')
  }

  return plan
}

function writeRemediationPlan(analysis: AnalysisResult) {
  console.log('📝 Phase 3: Generating remediation plan...')

  const outDir = 'farm-break-scan-output'
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  const planContent = `# Security & Build Analysis Report

**Generated:** ${new Date().toISOString()}

## Summary
- **Total Findings:** ${analysis.totalFindings}
- **Critical Issues:** ${analysis.criticalCount}
- **High Issues:** ${analysis.groupedBySeverity.high.length}
- **Medium Issues:** ${analysis.groupedBySeverity.medium.length}
- **Low Issues:** ${analysis.groupedBySeverity.low.length}

${analysis.remediationPlan.join('\n')}

## Files Affected
${Object.entries(analysis.groupedByFile)
  .map(([file, findings]) => `- **${file}** (${findings.length} issue${findings.length !== 1 ? 's' : ''})`)
  .join('\n')}

## Next Steps
1. Review critical findings first
2. Create tickets for each priority level
3. Apply fixes with code review
4. Re-run scan to verify resolution
`

  fs.writeFileSync(path.join(outDir, 'remediation-plan.md'), planContent)
  console.log('✅ Remediation plan written to farm-break-scan-output/remediation-plan.md')
}

async function main() {
  console.log('🚀 Farm Break Scanner Agent - Starting\n')

  await runScan()

  const findings = parseResults()
  const analysis = analyzeFindings(findings)

  writeRemediationPlan(analysis)

  console.log('\n📊 Analysis Complete')
  console.log(`   Total: ${analysis.totalFindings} issues`)
  console.log(`   🔴 Critical: ${analysis.criticalCount}`)
  console.log(`   🟠 High: ${analysis.groupedBySeverity.high.length}`)
  console.log(`   🟡 Medium: ${analysis.groupedBySeverity.medium.length}`)
  console.log(`   🟢 Low: ${analysis.groupedBySeverity.low.length}`)
  console.log(
    '\n📖 Review the full plan: farm-break-scan-output/remediation-plan.md\n'
  )
}

main().catch((err) => {
  console.error('❌ Agent error:', err)
  process.exit(1)
})

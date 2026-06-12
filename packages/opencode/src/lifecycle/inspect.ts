import { SuggestionRepository } from "./repository"
import { SuggestionStatus, type SuggestionWithFiles, type StatusTransition } from "./types"

/**
 * Formats a timestamp as a readable date string
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toISOString().replace("T", " ").substring(0, 19)
}

/**
 * Formats a status with emoji
 */
function formatStatus(status: SuggestionStatus): string {
  const statusMap: Record<SuggestionStatus, string> = {
    [SuggestionStatus.Proposed]: "📝 Proposed",
    [SuggestionStatus.Discarded]: "🗑️  Discarded",
    [SuggestionStatus.Accepted]: "✅ Accepted",
    [SuggestionStatus.Shipped]: "🚀 Shipped",
    [SuggestionStatus.ShippedModified]: "🔧 Shipped (Modified)",
  }
  return statusMap[status] || status
}

/**
 * Formats scan status with emoji
 */
function formatScanStatus(scanStatus: string | null): string {
  if (!scanStatus) return "N/A"
  
  const statusMap: Record<string, string> = {
    pass: "✅ Pass",
    warn: "⚠️  Warn",
    fail: "🛑 Fail",
  }
  
  return statusMap[scanStatus] || scanStatus
}

/**
 * Pads a string to a specific width
 */
function pad(str: string, width: number): string {
  if (str.length >= width) return str
  return str + " ".repeat(width - str.length)
}

/**
 * Renders a suggestion inspection report
 */
export function renderInspection(
  suggestion: SuggestionWithFiles,
  transitions: StatusTransition[]
): string {
  const lines: string[] = []

  lines.push("=".repeat(80))
  lines.push(`🔍 SUGGESTION INSPECTION`)
  lines.push("=".repeat(80))
  lines.push("")

  // Basic info
  lines.push("📋 BASIC INFORMATION")
  lines.push("-".repeat(80))
  lines.push(`Suggestion ID:        ${suggestion.id}`)
  lines.push(`Short ID:             ${suggestion.id.substring(0, 8)}`)
  lines.push(`Session ID:           ${suggestion.sessionId}`)
  lines.push(`Created At:           ${formatTimestamp(suggestion.createdAt)}`)
  lines.push(`Current Status:       ${formatStatus(suggestion.status)}`)
  lines.push(`User Identity:        ${suggestion.userIdentity || "N/A"}`)
  lines.push("")

  // Model info
  lines.push("🤖 MODEL INFORMATION")
  lines.push("-".repeat(80))
  lines.push(`Provider:             ${suggestion.provider}`)
  lines.push(`Model:                ${suggestion.model}`)
  lines.push(`Prompt Hash:          ${suggestion.promptHash}`)
  lines.push("")

  // Scan results
  lines.push("🔍 SECURITY SCAN RESULTS")
  lines.push("-".repeat(80))
  lines.push(`Scan Status:          ${formatScanStatus(suggestion.scanStatus)}`)
  
  if (suggestion.scanFindings && suggestion.scanFindings.length > 0) {
    lines.push(`Findings Count:       ${suggestion.scanFindings.length}`)
    lines.push("")
    lines.push("Findings:")
    
    suggestion.scanFindings.forEach((finding, idx) => {
      lines.push(`  ${idx + 1}. [${finding.scanner?.toUpperCase() || "UNKNOWN"}] ${finding.reason}`)
      if ("severity" in finding) {
        lines.push(`     Severity: ${finding.severity}`)
      }
      if ("match" in finding && finding.match) {
        lines.push(`     Match: "${finding.match}"`)
      }
    })
  } else {
    lines.push(`Findings:             None`)
  }
  lines.push("")

  // Discard info (if applicable)
  if (suggestion.status === SuggestionStatus.Discarded) {
    lines.push("🚫 DISCARD INFORMATION")
    lines.push("-".repeat(80))
    lines.push(`Reason:               ${suggestion.discardReason || "Unknown"}`)
    lines.push("")
  }

  // Shipped info (if applicable)
  if (suggestion.status === SuggestionStatus.Shipped || suggestion.status === SuggestionStatus.ShippedModified) {
    lines.push("🚀 SHIPPED INFORMATION")
    lines.push("-".repeat(80))
    lines.push(`Commit SHA:           ${suggestion.commitSha || "N/A"}`)
    lines.push(`Shipped At:           ${suggestion.shippedAt ? formatTimestamp(suggestion.shippedAt) : "N/A"}`)
    lines.push(`Match Type:           ${suggestion.status === SuggestionStatus.Shipped ? "Clean (exact match)" : "Fuzzy (80%+ match)"}`)
    lines.push("")
  }

  // Files
  lines.push("📁 FILES")
  lines.push("-".repeat(80))
  lines.push(`Total Files:          ${suggestion.files.length}`)
  lines.push("")

  suggestion.files.forEach((file, idx) => {
    lines.push(`File ${idx + 1}: ${file.filePath}`)
    lines.push(`  Old Content Hash:   ${file.oldContentHash || "(new file)"}`)
    lines.push(`  New Content Hash:   ${file.newContentHash}`)
    lines.push(`  Lines Added:        ${file.linesAdded}`)
    lines.push(`  Lines Removed:      ${file.linesRemoved}`)
    lines.push("")
    lines.push("  Diff:")
    const diffLines = file.diffText.split("\n")
    diffLines.forEach((line) => {
      lines.push(`    ${line}`)
    })
    lines.push("")
  })

  // State transition log
  lines.push("📜 STATE TRANSITION LOG")
  lines.push("-".repeat(80))
  
  if (transitions.length === 0) {
    lines.push("No transitions recorded")
  } else {
    transitions.forEach((transition, idx) => {
      const timestamp = formatTimestamp(transition.transitionedAt)
      const fromStatus = transition.fromStatus ? formatStatus(transition.fromStatus) : "(initial)"
      const toStatus = formatStatus(transition.toStatus)
      const reason = transition.reason ? ` - ${transition.reason}` : ""
      
      lines.push(`${idx + 1}. [${timestamp}] ${fromStatus} → ${toStatus}${reason}`)
    })
  }

  lines.push("")
  lines.push("=".repeat(80))
  lines.push("")
  lines.push("📌 This is an AI provenance tracking record.")
  lines.push("   It documents the complete lifecycle of an AI-generated code suggestion.")
  lines.push("")

  return lines.join("\n")
}

/**
 * Finds a suggestion by full or short ID
 */
export function findSuggestion(
  searchId: string,
  projectRoot?: string
): SuggestionWithFiles | null {
  const repo = new SuggestionRepository(projectRoot)
  
  // Try full ID first
  let suggestion = repo.getSuggestionWithFiles(searchId)
  
  if (suggestion) {
    return suggestion
  }

  // If not found and searchId is short (8 chars or less), this is a limitation
  // In a production system, you'd want to add a method to search by short ID
  // For now, we'll just return null
  
  return null
}

/**
 * CLI entry point for inspection command
 */
export function runInspectCLI(args: {
  suggestionId: string
  projectRoot?: string
}): void {
  try {
    const suggestion = findSuggestion(args.suggestionId, args.projectRoot)
    
    if (!suggestion) {
      console.error(`Suggestion not found: ${args.suggestionId}`)
      console.error("")
      console.error("Tips:")
      console.error("  - Make sure you're in the correct project directory")
      console.error("  - Try using the full suggestion ID instead of the short ID")
      console.error("  - Check that the .firm-harness/ directory exists")
      process.exit(1)
    }

    const repo = new SuggestionRepository(args.projectRoot)
    const transitions = repo.getTransitions(suggestion.id)
    
    console.log(renderInspection(suggestion, transitions))
  } catch (error) {
    console.error("Failed to inspect suggestion:", error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

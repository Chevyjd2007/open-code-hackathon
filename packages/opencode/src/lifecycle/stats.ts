import { SuggestionRepository } from "./repository"
import { SuggestionStatus, DiscardReason } from "./types"

/**
 * Stats for a time window
 */
export interface LifecycleStats {
  windowDays: number
  windowStart: number
  totalProposed: number
  totalAccepted: number
  totalShipped: number
  totalShippedModified: number
  totalDiscarded: number
  acceptanceRate: number
  shippingRate: number
  shippingRateFromAccepted: number
  discardedByReason: Record<DiscardReason, number>
  modelStats: Array<{
    model: string
    provider: string
    proposed: number
    accepted: number
    shipped: number
    acceptanceRate: number
    shippingRate: number
  }>
}

/**
 * Calculates lifecycle statistics for a time window
 */
export function calculateStats(
  windowDays: number = 7,
  sessionId?: string,
  projectRoot?: string
): LifecycleStats {
  const repo = new SuggestionRepository(projectRoot)
  const windowStart = Date.now() - windowDays * 24 * 60 * 60 * 1000

  // Get all suggestions, optionally filtered by session
  let suggestions = sessionId ? repo.listBySession(sessionId) : repo.listAll()
  
  // Filter by time window
  suggestions = suggestions.filter((s) => s.createdAt >= windowStart)

  // Calculate basic counts
  const totalProposed = suggestions.length
  const totalAccepted = suggestions.filter((s) => s.status === SuggestionStatus.Accepted || s.status === SuggestionStatus.Shipped || s.status === SuggestionStatus.ShippedModified).length
  const totalShipped = suggestions.filter((s) => s.status === SuggestionStatus.Shipped).length
  const totalShippedModified = suggestions.filter((s) => s.status === SuggestionStatus.ShippedModified).length
  const totalDiscarded = suggestions.filter((s) => s.status === SuggestionStatus.Discarded).length

  // Calculate rates
  const acceptanceRate = totalProposed > 0 ? (totalAccepted / totalProposed) * 100 : 0
  const shippingRate = totalProposed > 0 ? ((totalShipped + totalShippedModified) / totalProposed) * 100 : 0
  const shippingRateFromAccepted = totalAccepted > 0 ? ((totalShipped + totalShippedModified) / totalAccepted) * 100 : 0

  // Count discarded by reason
  const discardedByReason: Record<DiscardReason, number> = {
    [DiscardReason.ScanFailure]: 0,
    [DiscardReason.UserRejection]: 0,
    [DiscardReason.Abandonment]: 0,
    [DiscardReason.PolicyDenial]: 0,
  }

  suggestions
    .filter((s) => s.status === SuggestionStatus.Discarded)
    .forEach((s) => {
      if (s.discardReason) {
        discardedByReason[s.discardReason]++
      }
    })

  // Calculate per-model stats
  const modelMap = new Map<string, {
    model: string
    provider: string
    proposed: number
    accepted: number
    shipped: number
  }>()

  suggestions.forEach((s) => {
    const key = `${s.provider}/${s.model}`
    
    if (!modelMap.has(key)) {
      modelMap.set(key, {
        model: s.model,
        provider: s.provider,
        proposed: 0,
        accepted: 0,
        shipped: 0,
      })
    }

    const modelData = modelMap.get(key)!
    modelData.proposed++

    if (s.status === SuggestionStatus.Accepted || s.status === SuggestionStatus.Shipped || s.status === SuggestionStatus.ShippedModified) {
      modelData.accepted++
    }

    if (s.status === SuggestionStatus.Shipped || s.status === SuggestionStatus.ShippedModified) {
      modelData.shipped++
    }
  })

  const modelStats = Array.from(modelMap.values()).map((data) => ({
    ...data,
    acceptanceRate: data.proposed > 0 ? (data.accepted / data.proposed) * 100 : 0,
    shippingRate: data.proposed > 0 ? (data.shipped / data.proposed) * 100 : 0,
  }))

  return {
    windowDays,
    windowStart,
    totalProposed,
    totalAccepted,
    totalShipped,
    totalShippedModified,
    totalDiscarded,
    acceptanceRate,
    shippingRate,
    shippingRateFromAccepted,
    discardedByReason,
    modelStats,
  }
}

/**
 * Formats a number with one decimal place
 */
function formatPercent(num: number): string {
  return num.toFixed(1) + "%"
}

/**
 * Pads a string to a specific width
 */
function pad(str: string, width: number, align: "left" | "right" = "left"): string {
  if (str.length >= width) return str
  const padding = " ".repeat(width - str.length)
  return align === "left" ? str + padding : padding + str
}

/**
 * Renders a table row
 */
function renderRow(cells: string[], widths: number[]): string {
  return cells.map((cell, i) => pad(cell, widths[i])).join("  ")
}

/**
 * Renders lifecycle stats as formatted text
 */
export function renderStats(stats: LifecycleStats): string {
  const lines: string[] = []

  lines.push("=" .repeat(70))
  lines.push(`📊 LIFECYCLE STATISTICS (Last ${stats.windowDays} Days)`)
  lines.push("=".repeat(70))
  lines.push("")

  // Overall summary
  lines.push("📈 OVERALL SUMMARY")
  lines.push("-".repeat(70))
  lines.push(`Total Proposed:           ${stats.totalProposed}`)
  lines.push(`Total Accepted:           ${stats.totalAccepted} (${formatPercent(stats.acceptanceRate)})`)
  lines.push(`  ├─ Shipped (clean):     ${stats.totalShipped}`)
  lines.push(`  └─ Shipped (modified):  ${stats.totalShippedModified}`)
  lines.push(`Total Shipped:            ${stats.totalShipped + stats.totalShippedModified} (${formatPercent(stats.shippingRate)} of proposed, ${formatPercent(stats.shippingRateFromAccepted)} of accepted)`)
  lines.push(`Total Discarded:          ${stats.totalDiscarded}`)
  lines.push("")

  // Discard reasons
  if (stats.totalDiscarded > 0) {
    lines.push("🚫 DISCARD BREAKDOWN")
    lines.push("-".repeat(70))
    lines.push(`Scan Failure:             ${stats.discardedByReason[DiscardReason.ScanFailure]}`)
    lines.push(`User Rejection:           ${stats.discardedByReason[DiscardReason.UserRejection]}`)
    lines.push(`Policy Denial:            ${stats.discardedByReason[DiscardReason.PolicyDenial]}`)
    lines.push(`Abandonment:              ${stats.discardedByReason[DiscardReason.Abandonment]}`)
    lines.push("")
  }

  // Per-model stats
  if (stats.modelStats.length > 0) {
    lines.push("🤖 PER-MODEL BREAKDOWN")
    lines.push("-".repeat(70))

    const widths = [30, 10, 10, 10, 12, 12]
    const headers = ["Model", "Proposed", "Accepted", "Shipped", "Accept %", "Ship %"]
    lines.push(renderRow(headers, widths))
    lines.push("-".repeat(70))

    stats.modelStats.forEach((model) => {
      const row = [
        `${model.provider}/${model.model}`,
        model.proposed.toString(),
        model.accepted.toString(),
        model.shipped.toString(),
        formatPercent(model.acceptanceRate),
        formatPercent(model.shippingRate),
      ]
      lines.push(renderRow(row, widths))
    })
    lines.push("")
  }

  lines.push("=".repeat(70))

  return lines.join("\n")
}

/**
 * CLI entry point for stats command
 */
export function runStatsCLI(args: {
  windowDays?: number
  sessionId?: string
  projectRoot?: string
}): void {
  try {
    const windowDays = args.windowDays || 7
    const stats = calculateStats(windowDays, args.sessionId, args.projectRoot)
    console.log(renderStats(stats))
  } catch (error) {
    console.error("Failed to calculate stats:", error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

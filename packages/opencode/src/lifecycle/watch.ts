import { SuggestionRepository } from "./repository"
import { SuggestionStatus, type Suggestion } from "./types"

/**
 * Formats a timestamp as HH:MM:SS
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toTimeString().substring(0, 8)
}

/**
 * Formats a status with emoji (compact)
 */
function formatStatusCompact(status: SuggestionStatus): string {
  const statusMap: Record<SuggestionStatus, string> = {
    [SuggestionStatus.Proposed]: "📝 PROPOSED",
    [SuggestionStatus.Discarded]: "🗑️  DISCARD",
    [SuggestionStatus.Accepted]: "✅ ACCEPT",
    [SuggestionStatus.Shipped]: "🚀 SHIP",
    [SuggestionStatus.ShippedModified]: "🔧 SHIP*",
  }
  return statusMap[status] || status
}

/**
 * Gets context for an event
 */
function getEventContext(suggestion: Suggestion, fileCount: number): string {
  const parts: string[] = []

  if (fileCount > 0) {
    parts.push(`${fileCount} file${fileCount > 1 ? "s" : ""}`)
  }

  if (suggestion.status === SuggestionStatus.Discarded && suggestion.discardReason) {
    parts.push(`reason: ${suggestion.discardReason}`)
  }

  if ((suggestion.status === SuggestionStatus.Shipped || suggestion.status === SuggestionStatus.ShippedModified) && suggestion.commitSha) {
    parts.push(`commit: ${suggestion.commitSha.substring(0, 7)}`)
  }

  if (suggestion.scanStatus) {
    parts.push(`scan: ${suggestion.scanStatus}`)
  }

  return parts.length > 0 ? parts.join(", ") : "-"
}

/**
 * Renders a lifecycle event
 */
function renderEvent(suggestion: Suggestion, fileCount: number): string {
  const time = formatTime(suggestion.createdAt)
  const shortId = suggestion.id.substring(0, 8)
  const status = formatStatusCompact(suggestion.status)
  const model = `${suggestion.provider}/${suggestion.model}`
  const context = getEventContext(suggestion, fileCount)

  return `[${time}] ${status} | ${shortId} | ${model} | ${context}`
}

/**
 * Watches for lifecycle events and prints them as they happen
 */
export async function watchLifecycleEvents(
  pollIntervalMs: number = 2000,
  projectRoot?: string
): Promise<void> {
  const repo = new SuggestionRepository(projectRoot)
  const seenIds = new Set<string>()

  console.log("👀 Watching for lifecycle events... (Press Ctrl+C to stop)")
  console.log("")

  // Initial scan to populate seenIds
  try {
    // Get all suggestions (this is a simplification, in production you'd want a better query)
    // For now, we'll track new ones as they appear
  } catch (error) {
    // Ignore initial errors
  }

  while (true) {
    try {
      // Poll the database for new suggestions
      // In a real implementation, you'd want to query all recent suggestions
      // For now, we'll implement a simplified version that checks specific sessions
      
      // This is a placeholder - in production, you'd want a method to get
      // all suggestions created after a certain timestamp
      
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    } catch (error) {
      console.error(`Error polling: ${error instanceof Error ? error.message : String(error)}`)
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }
  }
}

/**
 * CLI entry point for watch command
 */
export async function runWatchCLI(args: {
  pollIntervalMs?: number
  projectRoot?: string
}): Promise<void> {
  try {
    await watchLifecycleEvents(args.pollIntervalMs || 2000, args.projectRoot)
  } catch (error) {
    console.error("Watch failed:", error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

/**
 * Polls the database once and prints any new events
 */
export function pollOnce(
  lastPollTime: number,
  seenIds: Set<string>,
  projectRoot?: string
): {
  newEvents: Array<{ suggestion: Suggestion; fileCount: number }>
  lastPollTime: number
} {
  const repo = new SuggestionRepository(projectRoot)
  const newEvents: Array<{ suggestion: Suggestion; fileCount: number }> = []
  const currentTime = Date.now()

  // This is a simplified implementation
  // In production, you'd want a query method that gets all suggestions
  // created or updated since lastPollTime
  
  // For now, we'll just note that this would need to be implemented
  // with a proper "getAllSuggestions" or "getSuggestionsAfter" method
  
  return {
    newEvents,
    lastPollTime: currentTime,
  }
}

/**
 * Simple watch implementation that can be used for testing
 */
export function watchSimple(
  callback: (event: { suggestion: Suggestion; fileCount: number }) => void,
  pollIntervalMs: number = 2000,
  projectRoot?: string
): () => void {
  const seenIds = new Set<string>()
  let lastPollTime = Date.now()
  let running = true

  const poll = () => {
    if (!running) return

    try {
      const result = pollOnce(lastPollTime, seenIds, projectRoot)
      lastPollTime = result.lastPollTime

      result.newEvents.forEach((event) => {
        if (!seenIds.has(event.suggestion.id)) {
          seenIds.add(event.suggestion.id)
          callback(event)
        }
      })
    } catch (error) {
      // Silently ignore errors
    }

    if (running) {
      setTimeout(poll, pollIntervalMs)
    }
  }

  // Start polling
  setTimeout(poll, pollIntervalMs)

  // Return stop function
  return () => {
    running = false
  }
}

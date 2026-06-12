import { SuggestionRepository } from "./repository"
import { DiscardReason, type CreateSuggestionInput } from "./types"

/**
 * Pipeline integration for lifecycle tracking.
 * Called by the pre-write scan pipeline at well-defined points.
 */
export class LifecyclePipeline {
  private repo: SuggestionRepository

  constructor(projectRoot?: string) {
    this.repo = new SuggestionRepository(projectRoot)
  }

  /**
   * Called when a diff has been scanned and is about to be decided on.
   * Records the suggestion as "proposed" and returns its ID.
   */
  recordProposed(input: CreateSuggestionInput): string {
    const suggestion = this.repo.recordProposed(input)
    return suggestion.id
  }

  /**
   * Called when the scan blocks the write (status = "fail").
   * Marks the suggestion as discarded with reason "scan_failure".
   */
  discardForScanFailure(suggestionId: string): void {
    this.repo.markDiscarded(suggestionId, DiscardReason.ScanFailure)
  }

  /**
   * Called when the user rejects an override prompt.
   * Marks the suggestion as discarded with reason "user_rejection".
   */
  discardForUserRejection(suggestionId: string): void {
    this.repo.markDiscarded(suggestionId, DiscardReason.UserRejection)
  }

  /**
   * Called when the policy engine denies the write.
   * Marks the suggestion as discarded with reason "policy_denial".
   */
  discardForPolicyDenial(suggestionId: string): void {
    this.repo.markDiscarded(suggestionId, DiscardReason.PolicyDenial)
  }

  /**
   * Called when the file is successfully written to disk.
   * Marks the suggestion as "accepted".
   */
  acceptSuggestion(suggestionId: string): void {
    this.repo.markAccepted(suggestionId)
  }

  /**
   * Called at session end to sweep any still-proposed suggestions.
   * Marks them as abandoned.
   */
  sweepAbandonedForSession(sessionId: string): number {
    const suggestions = this.repo.listBySession(sessionId)
    let count = 0

    for (const suggestion of suggestions) {
      if (suggestion.status === "proposed") {
        this.repo.markDiscarded(suggestion.id, DiscardReason.Abandonment)
        count++
      }
    }

    return count
  }

  /**
   * Gets the repository instance (for advanced queries)
   */
  getRepository(): SuggestionRepository {
    return this.repo
  }
}

/**
 * Context attachment for tracking suggestion IDs through the pipeline.
 * This is attached to the in-memory diff context so later stages can reference it.
 */
export interface DiffContext {
  suggestionId?: string
}

/**
 * Global singleton instance (created lazily per project root)
 */
let globalPipeline: LifecyclePipeline | null = null

export function getLifecyclePipeline(projectRoot?: string): LifecyclePipeline {
  if (!globalPipeline) {
    globalPipeline = new LifecyclePipeline(projectRoot)
  }
  return globalPipeline
}

export function resetLifecyclePipeline(): void {
  globalPipeline = null
}

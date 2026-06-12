import { SuggestionStatus } from "./types"

/**
 * Legal state transitions map
 * Maps from current status to allowed next statuses
 */
const LEGAL_TRANSITIONS: Record<SuggestionStatus, SuggestionStatus[]> = {
  [SuggestionStatus.Proposed]: [
    SuggestionStatus.Discarded,
    SuggestionStatus.Accepted,
  ],
  [SuggestionStatus.Discarded]: [],
  [SuggestionStatus.Accepted]: [
    SuggestionStatus.Shipped,
    SuggestionStatus.ShippedModified,
  ],
  [SuggestionStatus.Shipped]: [],
  [SuggestionStatus.ShippedModified]: [],
}

/**
 * Checks whether a state transition is legal
 */
export function isTransitionLegal(
  from: SuggestionStatus,
  to: SuggestionStatus
): boolean {
  const allowedTransitions = LEGAL_TRANSITIONS[from]
  return allowedTransitions.includes(to)
}

/**
 * Asserts that a state transition is legal, throwing if it isn't
 */
export function assertTransitionLegal(
  from: SuggestionStatus,
  to: SuggestionStatus
): void {
  if (!isTransitionLegal(from, to)) {
    throw new Error(
      `Illegal state transition: cannot transition from "${from}" to "${to}"`
    )
  }
}

/**
 * Gets all legal transitions from a given status
 */
export function getLegalTransitions(
  from: SuggestionStatus
): SuggestionStatus[] {
  return LEGAL_TRANSITIONS[from]
}

/**
 * Checks if a status is terminal (no further transitions possible)
 */
export function isTerminalStatus(status: SuggestionStatus): boolean {
  return LEGAL_TRANSITIONS[status].length === 0
}

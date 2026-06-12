import type { ScanFinding, ScanResult } from "../scanners"

/**
 * Lifecycle status enum - the five states a suggestion can be in
 */
export enum SuggestionStatus {
  Proposed = "proposed",
  Discarded = "discarded",
  Accepted = "accepted",
  Shipped = "shipped",
  ShippedModified = "shipped-modified",
}

/**
 * Reasons why a suggestion might be discarded
 */
export enum DiscardReason {
  ScanFailure = "scan_failure",
  UserRejection = "user_rejection",
  Abandonment = "abandonment",
  PolicyDenial = "policy_denial",
}

/**
 * Per-file information for a suggestion
 */
export interface SuggestionFile {
  id?: number
  suggestionId: string
  filePath: string
  oldContentHash: string | null
  newContentHash: string
  linesAdded: number
  linesRemoved: number
  diffText: string
}

/**
 * Full suggestion record
 */
export interface Suggestion {
  id: string
  sessionId: string
  createdAt: number
  model: string
  provider: string
  promptHash: string
  userIdentity: string | null
  status: SuggestionStatus
  discardReason: DiscardReason | null
  commitSha: string | null
  shippedAt: number | null
  scanStatus: ScanResult["status"] | null
  scanFindings: ScanFinding[] | null
}

/**
 * Full suggestion record with associated files
 */
export interface SuggestionWithFiles extends Suggestion {
  files: SuggestionFile[]
}

/**
 * State transition record
 */
export interface StatusTransition {
  id?: number
  suggestionId: string
  fromStatus: SuggestionStatus | null
  toStatus: SuggestionStatus
  reason: string | null
  transitionedAt: number
}

/**
 * Input data for creating a new suggestion
 */
export interface CreateSuggestionInput {
  sessionId: string
  model: string
  provider: string
  promptHash: string
  userIdentity?: string
  scanStatus?: ScanResult["status"]
  scanFindings?: ScanFinding[]
  files: Array<{
    filePath: string
    oldContent?: string
    newContent: string
    diffText: string
  }>
}

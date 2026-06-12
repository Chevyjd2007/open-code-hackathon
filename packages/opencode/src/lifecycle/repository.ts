import type Database from "better-sqlite3"
import { randomUUID } from "crypto"
import { createHash } from "crypto"
import { openDatabase } from "./database"
import {
  SuggestionStatus,
  DiscardReason,
  type Suggestion,
  type SuggestionWithFiles,
  type SuggestionFile,
  type StatusTransition,
  type CreateSuggestionInput,
} from "./types"
import { assertTransitionLegal } from "./state-machine"

/**
 * Computes SHA-256 hash of content
 */
function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex")
}

/**
 * Counts added and removed lines from a unified diff
 */
function countDiffLines(diff: string): { added: number; removed: number } {
  const lines = diff.split("\n")
  let added = 0
  let removed = 0

  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      added++
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      removed++
    }
  }

  return { added, removed }
}

/**
 * Repository class for managing suggestion lifecycle
 */
export class SuggestionRepository {
  private db: Database.Database

  // Prepared statements (reused for performance)
  private stmtInsertSuggestion: Database.Statement
  private stmtInsertFile: Database.Statement
  private stmtInsertTransition: Database.Statement
  private stmtUpdateStatus: Database.Statement
  private stmtUpdateShipped: Database.Statement
  private stmtGetSuggestion: Database.Statement
  private stmtGetFiles: Database.Statement
  private stmtGetTransitions: Database.Statement
  private stmtFindByContentHash: Database.Statement
  private stmtFindRecentByFilePath: Database.Statement
  private stmtListBySession: Database.Statement
  private stmtListAll: Database.Statement
  private stmtListAfter: Database.Statement

  constructor(projectRoot?: string) {
    this.db = openDatabase(projectRoot)

    // Prepare statements
    this.stmtInsertSuggestion = this.db.prepare(`
      INSERT INTO suggestions (
        id, session_id, created_at, model, provider, prompt_hash,
        user_identity, status, scan_status, scan_findings
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    this.stmtInsertFile = this.db.prepare(`
      INSERT INTO suggestion_files (
        suggestion_id, file_path, old_content_hash, new_content_hash,
        lines_added, lines_removed, diff_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    this.stmtInsertTransition = this.db.prepare(`
      INSERT INTO status_transitions (
        suggestion_id, from_status, to_status, reason, transitioned_at
      ) VALUES (?, ?, ?, ?, ?)
    `)

    this.stmtUpdateStatus = this.db.prepare(`
      UPDATE suggestions 
      SET status = ?, discard_reason = ?
      WHERE id = ?
    `)

    this.stmtUpdateShipped = this.db.prepare(`
      UPDATE suggestions 
      SET status = ?, commit_sha = ?, shipped_at = ?
      WHERE id = ?
    `)

    this.stmtGetSuggestion = this.db.prepare(`
      SELECT * FROM suggestions WHERE id = ?
    `)

    this.stmtGetFiles = this.db.prepare(`
      SELECT * FROM suggestion_files WHERE suggestion_id = ?
    `)

    this.stmtGetTransitions = this.db.prepare(`
      SELECT * FROM status_transitions 
      WHERE suggestion_id = ?
      ORDER BY transitioned_at ASC
    `)

    this.stmtFindByContentHash = this.db.prepare(`
      SELECT DISTINCT s.* 
      FROM suggestions s
      JOIN suggestion_files sf ON s.id = sf.suggestion_id
      WHERE s.status = ? AND sf.new_content_hash = ?
    `)

    this.stmtFindRecentByFilePath = this.db.prepare(`
      SELECT DISTINCT s.*
      FROM suggestions s
      JOIN suggestion_files sf ON s.id = sf.suggestion_id
      WHERE s.status = ? AND sf.file_path = ?
      ORDER BY s.created_at DESC
      LIMIT ?
    `)

    this.stmtListBySession = this.db.prepare(`
      SELECT * FROM suggestions
      WHERE session_id = ?
      ORDER BY created_at DESC
    `)

    this.stmtListAll = this.db.prepare(`
      SELECT * FROM suggestions
      ORDER BY created_at DESC
    `)

    this.stmtListAfter = this.db.prepare(`
      SELECT * FROM suggestions
      WHERE created_at > ?
      ORDER BY created_at DESC
    `)
  }

  /**
   * Records a newly proposed suggestion
   */
  recordProposed(input: CreateSuggestionInput): SuggestionWithFiles {
    const id = randomUUID()
    const createdAt = Date.now()

    const suggestion: Suggestion = {
      id,
      sessionId: input.sessionId,
      createdAt,
      model: input.model,
      provider: input.provider,
      promptHash: input.promptHash,
      userIdentity: input.userIdentity || null,
      status: SuggestionStatus.Proposed,
      discardReason: null,
      commitSha: null,
      shippedAt: null,
      scanStatus: input.scanStatus || null,
      scanFindings: input.scanFindings || null,
    }

    // Process files
    const files: SuggestionFile[] = input.files.map((file) => {
      const oldHash = file.oldContent ? sha256(file.oldContent) : null
      const newHash = sha256(file.newContent)
      const lineCount = countDiffLines(file.diffText)

      return {
        suggestionId: id,
        filePath: file.filePath,
        oldContentHash: oldHash,
        newContentHash: newHash,
        linesAdded: lineCount.added,
        linesRemoved: lineCount.removed,
        diffText: file.diffText,
      }
    })

    // Insert everything in a transaction
    const insert = this.db.transaction(() => {
      // Insert suggestion
      this.stmtInsertSuggestion.run(
        suggestion.id,
        suggestion.sessionId,
        suggestion.createdAt,
        suggestion.model,
        suggestion.provider,
        suggestion.promptHash,
        suggestion.userIdentity,
        suggestion.status,
        suggestion.scanStatus,
        suggestion.scanFindings ? JSON.stringify(suggestion.scanFindings) : null
      )

      // Insert files
      for (const file of files) {
        this.stmtInsertFile.run(
          file.suggestionId,
          file.filePath,
          file.oldContentHash,
          file.newContentHash,
          file.linesAdded,
          file.linesRemoved,
          file.diffText
        )
      }

      // Insert initial transition (null -> proposed)
      this.stmtInsertTransition.run(
        id,
        null,
        SuggestionStatus.Proposed,
        null,
        createdAt
      )
    })

    insert()

    return { ...suggestion, files }
  }

  /**
   * Marks a suggestion as discarded
   */
  markDiscarded(id: string, reason: DiscardReason): void {
    const suggestion = this.getSuggestion(id)
    if (!suggestion) {
      throw new Error(`Suggestion ${id} not found`)
    }

    assertTransitionLegal(suggestion.status, SuggestionStatus.Discarded)

    const update = this.db.transaction(() => {
      this.stmtUpdateStatus.run(SuggestionStatus.Discarded, reason, id)
      this.stmtInsertTransition.run(
        id,
        suggestion.status,
        SuggestionStatus.Discarded,
        reason,
        Date.now()
      )
    })

    update()
  }

  /**
   * Marks a suggestion as accepted
   */
  markAccepted(id: string): void {
    const suggestion = this.getSuggestion(id)
    if (!suggestion) {
      throw new Error(`Suggestion ${id} not found`)
    }

    assertTransitionLegal(suggestion.status, SuggestionStatus.Accepted)

    const update = this.db.transaction(() => {
      this.stmtUpdateStatus.run(SuggestionStatus.Accepted, null, id)
      this.stmtInsertTransition.run(
        id,
        suggestion.status,
        SuggestionStatus.Accepted,
        null,
        Date.now()
      )
    })

    update()
  }

  /**
   * Marks a suggestion as shipped (clean match)
   */
  markShipped(id: string, commitSha: string): void {
    const suggestion = this.getSuggestion(id)
    if (!suggestion) {
      throw new Error(`Suggestion ${id} not found`)
    }

    assertTransitionLegal(suggestion.status, SuggestionStatus.Shipped)

    const shippedAt = Date.now()

    const update = this.db.transaction(() => {
      this.stmtUpdateShipped.run(
        SuggestionStatus.Shipped,
        commitSha,
        shippedAt,
        id
      )
      this.stmtInsertTransition.run(
        id,
        suggestion.status,
        SuggestionStatus.Shipped,
        `Committed as ${commitSha}`,
        shippedAt
      )
    })

    update()
  }

  /**
   * Marks a suggestion as shipped-modified (fuzzy match)
   */
  markShippedModified(id: string, commitSha: string): void {
    const suggestion = this.getSuggestion(id)
    if (!suggestion) {
      throw new Error(`Suggestion ${id} not found`)
    }

    assertTransitionLegal(suggestion.status, SuggestionStatus.ShippedModified)

    const shippedAt = Date.now()

    const update = this.db.transaction(() => {
      this.stmtUpdateShipped.run(
        SuggestionStatus.ShippedModified,
        commitSha,
        shippedAt,
        id
      )
      this.stmtInsertTransition.run(
        id,
        suggestion.status,
        SuggestionStatus.ShippedModified,
        `Committed with modifications as ${commitSha}`,
        shippedAt
      )
    })

    update()
  }

  /**
   * Fetches a suggestion by ID
   */
  getSuggestion(id: string): Suggestion | null {
    const row = this.stmtGetSuggestion.get(id) as any
    if (!row) return null

    return {
      id: row.id,
      sessionId: row.session_id,
      createdAt: row.created_at,
      model: row.model,
      provider: row.provider,
      promptHash: row.prompt_hash,
      userIdentity: row.user_identity,
      status: row.status as SuggestionStatus,
      discardReason: row.discard_reason as DiscardReason | null,
      commitSha: row.commit_sha,
      shippedAt: row.shipped_at,
      scanStatus: row.scan_status,
      scanFindings: row.scan_findings ? JSON.parse(row.scan_findings) : null,
    }
  }

  /**
   * Fetches a suggestion with its files
   */
  getSuggestionWithFiles(id: string): SuggestionWithFiles | null {
    const suggestion = this.getSuggestion(id)
    if (!suggestion) return null

    const fileRows = this.stmtGetFiles.all(id) as any[]
    const files: SuggestionFile[] = fileRows.map((row) => ({
      id: row.id,
      suggestionId: row.suggestion_id,
      filePath: row.file_path,
      oldContentHash: row.old_content_hash,
      newContentHash: row.new_content_hash,
      linesAdded: row.lines_added,
      linesRemoved: row.lines_removed,
      diffText: row.diff_text,
    }))

    return { ...suggestion, files }
  }

  /**
   * Finds accepted suggestions with matching content hash (clean-match detection)
   */
  findByContentHash(contentHash: string): Suggestion[] {
    const rows = this.stmtFindByContentHash.all(
      SuggestionStatus.Accepted,
      contentHash
    ) as any[]

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      createdAt: row.created_at,
      model: row.model,
      provider: row.provider,
      promptHash: row.prompt_hash,
      userIdentity: row.user_identity,
      status: row.status as SuggestionStatus,
      discardReason: row.discard_reason as DiscardReason | null,
      commitSha: row.commit_sha,
      shippedAt: row.shipped_at,
      scanStatus: row.scan_status,
      scanFindings: row.scan_findings ? JSON.parse(row.scan_findings) : null,
    }))
  }

  /**
   * Finds recent accepted suggestions for a file path (fuzzy-match detection)
   */
  findRecentByFilePath(filePath: string, limit: number = 10): Suggestion[] {
    const rows = this.stmtFindRecentByFilePath.all(
      SuggestionStatus.Accepted,
      filePath,
      limit
    ) as any[]

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      createdAt: row.created_at,
      model: row.model,
      provider: row.provider,
      promptHash: row.prompt_hash,
      userIdentity: row.user_identity,
      status: row.status as SuggestionStatus,
      discardReason: row.discard_reason as DiscardReason | null,
      commitSha: row.commit_sha,
      shippedAt: row.shipped_at,
      scanStatus: row.scan_status,
      scanFindings: row.scan_findings ? JSON.parse(row.scan_findings) : null,
    }))
  }

  /**
   * Lists all suggestions for a session
   */
  listBySession(sessionId: string): Suggestion[] {
    const rows = this.stmtListBySession.all(sessionId) as any[]

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      createdAt: row.created_at,
      model: row.model,
      provider: row.provider,
      promptHash: row.prompt_hash,
      userIdentity: row.user_identity,
      status: row.status as SuggestionStatus,
      discardReason: row.discard_reason as DiscardReason | null,
      commitSha: row.commit_sha,
      shippedAt: row.shipped_at,
      scanStatus: row.scan_status,
      scanFindings: row.scan_findings ? JSON.parse(row.scan_findings) : null,
    }))
  }

  /**
   * Lists all suggestions (ordered by created_at DESC)
   */
  listAll(): Suggestion[] {
    const rows = this.stmtListAll.all() as any[]

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      createdAt: row.created_at,
      model: row.model,
      provider: row.provider,
      promptHash: row.prompt_hash,
      userIdentity: row.user_identity,
      status: row.status as SuggestionStatus,
      discardReason: row.discard_reason as DiscardReason | null,
      commitSha: row.commit_sha,
      shippedAt: row.shipped_at,
      scanStatus: row.scan_status,
      scanFindings: row.scan_findings ? JSON.parse(row.scan_findings) : null,
    }))
  }

  /**
   * Lists suggestions created after a specific timestamp
   */
  listAfter(timestamp: number): Suggestion[] {
    const rows = this.stmtListAfter.all(timestamp) as any[]

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      createdAt: row.created_at,
      model: row.model,
      provider: row.provider,
      promptHash: row.prompt_hash,
      userIdentity: row.user_identity,
      status: row.status as SuggestionStatus,
      discardReason: row.discard_reason as DiscardReason | null,
      commitSha: row.commit_sha,
      shippedAt: row.shipped_at,
      scanStatus: row.scan_status,
      scanFindings: row.scan_findings ? JSON.parse(row.scan_findings) : null,
    }))
  }

  /**
   * Gets the transition history for a suggestion
   */
  getTransitions(suggestionId: string): StatusTransition[] {
    const rows = this.stmtGetTransitions.all(suggestionId) as any[]

    return rows.map((row) => ({
      id: row.id,
      suggestionId: row.suggestion_id,
      fromStatus: row.from_status as SuggestionStatus | null,
      toStatus: row.to_status as SuggestionStatus,
      reason: row.reason,
      transitionedAt: row.transitioned_at,
    }))
  }

  /**
   * Computes SHA-256 hash of content (exposed for testing/external use)
   */
  static sha256 = sha256

  /**
   * Counts diff lines (exposed for testing/external use)
   */
  static countDiffLines = countDiffLines
}

export { sha256, countDiffLines }

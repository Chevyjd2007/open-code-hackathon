import fs from "fs"
import path from "path"
import { randomUUID } from "crypto"
import { createHash } from "crypto"
import {
  SuggestionStatus,
  DiscardReason,
  type Suggestion,
  type SuggestionFile,
  type StatusTransition,
  type CreateSuggestionInput,
} from "./types"
import { assertTransitionLegal } from "./state-machine"

export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex")
}

function countDiffLines(diff: string): { added: number; removed: number } {
  const lines = diff.split("\n")
  let added = 0, removed = 0
  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++
    else if (line.startsWith("-") && !line.startsWith("---")) removed++
  }
  return { added, removed }
}

function getDBPath(projectRoot?: string): string {
  const root = projectRoot || process.cwd()
  const dir = path.join(root, ".firm-harness")
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, "lifecycle.json")
}

interface DB {
  suggestions: Suggestion[]
  files: SuggestionFile[]
  transitions: StatusTransition[]
}

function readDB(projectRoot?: string): DB {
  const dbPath = getDBPath(projectRoot)
  if (!fs.existsSync(dbPath)) return { suggestions: [], files: [], transitions: [] }
  try {
    return JSON.parse(fs.readFileSync(dbPath, "utf8"))
  } catch {
    return { suggestions: [], files: [], transitions: [] }
  }
}

function writeDB(db: DB, projectRoot?: string): void {
  const dbPath = getDBPath(projectRoot)
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8")
}

export class SuggestionRepository {
  constructor(private projectRoot?: string) {}

  recordProposed(input: CreateSuggestionInput): { id: string } {
    const db = readDB(this.projectRoot)
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

    db.suggestions.push(suggestion)

    input.files.forEach((file) => {
      const oldHash = file.oldContent ? sha256(file.oldContent) : null
      const newHash = sha256(file.newContent)
      const lineCount = countDiffLines(file.diffText)

      db.files.push({
        suggestionId: id,
        filePath: file.filePath,
        oldContentHash: oldHash,
        newContentHash: newHash,
        linesAdded: lineCount.added,
        linesRemoved: lineCount.removed,
        diffText: file.diffText,
      })
    })

    db.transitions.push({
      suggestionId: id,
      fromStatus: null,
      toStatus: SuggestionStatus.Proposed,
      reason: null,
      transitionedAt: createdAt,
    })

    writeDB(db, this.projectRoot)
    return { id, ...suggestion, files: db.files.filter((f) => f.suggestionId === id) }
  }

  markDiscarded(id: string, reason: DiscardReason): void {
    const db = readDB(this.projectRoot)
    const suggestion = db.suggestions.find((s) => s.id === id)
    if (!suggestion) throw new Error(`Suggestion ${id} not found`)
    
    assertTransitionLegal(suggestion.status, SuggestionStatus.Discarded)
    
    suggestion.status = SuggestionStatus.Discarded
    suggestion.discardReason = reason
    
    db.transitions.push({
      suggestionId: id,
      fromStatus: suggestion.status,
      toStatus: SuggestionStatus.Discarded,
      reason,
      transitionedAt: Date.now(),
    })
    
    writeDB(db, this.projectRoot)
  }

  markAccepted(id: string): void {
    const db = readDB(this.projectRoot)
    const suggestion = db.suggestions.find((s) => s.id === id)
    if (!suggestion) throw new Error(`Suggestion ${id} not found`)
    
    assertTransitionLegal(suggestion.status, SuggestionStatus.Accepted)
    
    suggestion.status = SuggestionStatus.Accepted
    
    db.transitions.push({
      suggestionId: id,
      fromStatus: SuggestionStatus.Proposed,
      toStatus: SuggestionStatus.Accepted,
      reason: null,
      transitionedAt: Date.now(),
    })
    
    writeDB(db, this.projectRoot)
  }

  markShipped(id: string, commitSha: string): void {
    const db = readDB(this.projectRoot)
    const suggestion = db.suggestions.find((s) => s.id === id)
    if (!suggestion) throw new Error(`Suggestion ${id} not found`)
    
    assertTransitionLegal(suggestion.status, SuggestionStatus.Shipped)
    
    suggestion.status = SuggestionStatus.Shipped
    suggestion.commitSha = commitSha
    suggestion.shippedAt = Date.now()
    
    db.transitions.push({
      suggestionId: id,
      fromStatus: suggestion.status,
      toStatus: SuggestionStatus.Shipped,
      reason: `Committed as ${commitSha}`,
      transitionedAt: Date.now(),
    })
    
    writeDB(db, this.projectRoot)
  }

  getSuggestion(id: string): Suggestion | null {
    const db = readDB(this.projectRoot)
    return db.suggestions.find((s) => s.id === id) || null
  }

  listAll(): Suggestion[] {
    const db = readDB(this.projectRoot)
    return db.suggestions.sort((a, b) => b.createdAt - a.createdAt)
  }

  listBySession(sessionId: string): Suggestion[] {
    const db = readDB(this.projectRoot)
    return db.suggestions
      .filter((s) => s.sessionId === sessionId)
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  getTransitions(suggestionId: string): StatusTransition[] {
    const db = readDB(this.projectRoot)
    return db.transitions
      .filter((t) => t.suggestionId === suggestionId)
      .sort((a, b) => a.transitionedAt - b.transitionedAt)
  }

  static sha256 = sha256
  static countDiffLines = countDiffLines
}

export { countDiffLines }

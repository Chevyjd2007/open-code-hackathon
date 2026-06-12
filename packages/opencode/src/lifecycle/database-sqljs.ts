import initSqlJs, { Database as SqlJsDatabase } from "sql.js"
import fs from "fs"
import path from "path"

let dbInstance: SqlJsDatabase | null = null
let sqlJs: any = null

/**
 * Finds or creates .firm-harness directory
 */
function findProjectRoot(startDir: string = process.cwd()): string {
  let currentDir = startDir
  const root = path.parse(currentDir).root

  while (currentDir !== root) {
    const firmHarnessPath = path.join(currentDir, ".firm-harness")
    if (fs.existsSync(firmHarnessPath)) {
      return currentDir
    }
    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) break
    currentDir = parentDir
  }

  const firmHarnessPath = path.join(startDir, ".firm-harness")
  if (!fs.existsSync(firmHarnessPath)) {
    fs.mkdirSync(firmHarnessPath, { recursive: true })
  }
  return startDir
}

function getDatabasePath(projectRoot?: string): string {
  const root = projectRoot || findProjectRoot()
  const firmHarnessDir = path.join(root, ".firm-harness")
  if (!fs.existsSync(firmHarnessDir)) {
    fs.mkdirSync(firmHarnessDir, { recursive: true })
  }
  return path.join(firmHarnessDir, "lifecycle.db")
}

function runMigrations(db: SqlJsDatabase): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS suggestions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      model TEXT NOT NULL,
      provider TEXT NOT NULL,
      prompt_hash TEXT NOT NULL,
      user_identity TEXT,
      status TEXT NOT NULL,
      discard_reason TEXT,
      commit_sha TEXT,
      shipped_at INTEGER,
      scan_status TEXT,
      scan_findings BLOB
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS suggestion_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suggestion_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      old_content_hash TEXT,
      new_content_hash TEXT NOT NULL,
      lines_added INTEGER NOT NULL DEFAULT 0,
      lines_removed INTEGER NOT NULL DEFAULT 0,
      diff_text TEXT NOT NULL,
      FOREIGN KEY (suggestion_id) REFERENCES suggestions(id) ON DELETE CASCADE
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS status_transitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suggestion_id TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      reason TEXT,
      transitioned_at INTEGER NOT NULL,
      FOREIGN KEY (suggestion_id) REFERENCES suggestions(id) ON DELETE CASCADE
    )
  `)

  db.run(`CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_suggestions_session_id ON suggestions(session_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_suggestion_files_new_content_hash ON suggestion_files(new_content_hash)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_suggestion_files_suggestion_id ON suggestion_files(suggestion_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_status_transitions_suggestion_id ON status_transitions(suggestion_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_suggestion_files_file_path ON suggestion_files(file_path)`)
}

export async function openDatabase(projectRoot?: string): Promise<SqlJsDatabase> {
  if (dbInstance) return dbInstance

  if (!sqlJs) {
    sqlJs = await initSqlJs()
  }

  const dbPath = getDatabasePath(projectRoot)
  
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath)
    dbInstance = new sqlJs.Database(buffer)
  } else {
    dbInstance = new sqlJs.Database()
  }

  dbInstance.run("PRAGMA foreign_keys = ON")
  runMigrations(dbInstance)
  
  // Save to disk
  const data = dbInstance.export()
  fs.writeFileSync(dbPath, data)

  return dbInstance
}

export function closeDatabase(projectRoot?: string): void {
  if (dbInstance) {
    const dbPath = getDatabasePath(projectRoot)
    const data = dbInstance.export()
    fs.writeFileSync(dbPath, data)
    dbInstance.close()
    dbInstance = null
  }
}

export function getDatabase(): SqlJsDatabase | null {
  return dbInstance
}

export function saveDatabase(projectRoot?: string): void {
  if (dbInstance) {
    const dbPath = getDatabasePath(projectRoot)
    const data = dbInstance.export()
    fs.writeFileSync(dbPath, data)
  }
}

export { findProjectRoot, getDatabasePath }

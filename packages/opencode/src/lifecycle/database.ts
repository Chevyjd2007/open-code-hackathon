import Database from "better-sqlite3"
import fs from "fs"
import path from "path"

let dbInstance: Database.Database | null = null

/**
 * Walks up the directory tree to find the project root containing .firm-harness/
 * Creates the directory if it doesn't exist.
 */
function findProjectRoot(startDir: string = process.cwd()): string {
  let currentDir = startDir
  const root = path.parse(currentDir).root

  while (currentDir !== root) {
    const firmHarnessPath = path.join(currentDir, ".firm-harness")
    
    // Check if .firm-harness exists
    if (fs.existsSync(firmHarnessPath)) {
      return currentDir
    }

    // Move up one directory
    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) break
    currentDir = parentDir
  }

  // Not found, create .firm-harness in the start directory
  const firmHarnessPath = path.join(startDir, ".firm-harness")
  if (!fs.existsSync(firmHarnessPath)) {
    fs.mkdirSync(firmHarnessPath, { recursive: true })
  }
  
  return startDir
}

/**
 * Get the path to the SQLite database file
 */
function getDatabasePath(projectRoot?: string): string {
  const root = projectRoot || findProjectRoot()
  const firmHarnessDir = path.join(root, ".firm-harness")
  
  // Ensure directory exists
  if (!fs.existsSync(firmHarnessDir)) {
    fs.mkdirSync(firmHarnessDir, { recursive: true })
  }
  
  return path.join(firmHarnessDir, "lifecycle.db")
}

/**
 * Run idempotent migrations to create tables and indexes
 */
function runMigrations(db: Database.Database): void {
  // Enable foreign keys
  db.pragma("foreign_keys = ON")

  // Create suggestions table
  db.exec(`
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

  // Create suggestion_files table
  db.exec(`
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

  // Create status_transitions table (append-only log)
  db.exec(`
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

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_suggestions_status 
    ON suggestions(status)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_suggestions_session_id 
    ON suggestions(session_id)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_suggestion_files_new_content_hash 
    ON suggestion_files(new_content_hash)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_suggestion_files_suggestion_id 
    ON suggestion_files(suggestion_id)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_status_transitions_suggestion_id 
    ON status_transitions(suggestion_id)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_suggestion_files_file_path 
    ON suggestion_files(file_path)
  `)
}

/**
 * Opens the SQLite database, running migrations if needed.
 * Returns a cached instance on subsequent calls.
 */
export function openDatabase(projectRoot?: string): Database.Database {
  if (dbInstance) {
    return dbInstance
  }

  const dbPath = getDatabasePath(projectRoot)
  dbInstance = new Database(dbPath)
  
  // Run migrations
  runMigrations(dbInstance)
  
  return dbInstance
}

/**
 * Closes the database connection and clears the cached instance
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}

/**
 * Gets the current database instance without opening a new one
 */
export function getDatabase(): Database.Database | null {
  return dbInstance
}

/**
 * Helper to get project root - exposed for testing
 */
export { findProjectRoot, getDatabasePath }

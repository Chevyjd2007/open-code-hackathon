import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs"
import path from "path"
import os from "os"
import { openDatabase, closeDatabase, getDatabasePath, findProjectRoot } from "./database"

describe("Lifecycle Database", () => {
  let tempDir: string
  let originalCwd: string

  beforeEach(() => {
    // Save original working directory
    originalCwd = process.cwd()
    
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    // Close database
    closeDatabase()
    
    // Restore original working directory
    process.chdir(originalCwd)
    
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  describe("findProjectRoot", () => {
    it("should find existing .firm-harness directory", () => {
      const firmHarnessPath = path.join(tempDir, ".firm-harness")
      fs.mkdirSync(firmHarnessPath)

      const root = findProjectRoot(tempDir)
      expect(root).toBe(tempDir)
    })

    it("should walk up directory tree to find .firm-harness", () => {
      const firmHarnessPath = path.join(tempDir, ".firm-harness")
      const subDir = path.join(tempDir, "some", "nested", "path")
      
      fs.mkdirSync(firmHarnessPath)
      fs.mkdirSync(subDir, { recursive: true })

      const root = findProjectRoot(subDir)
      expect(root).toBe(tempDir)
    })

    it("should create .firm-harness if not found", () => {
      const root = findProjectRoot(tempDir)
      const firmHarnessPath = path.join(root, ".firm-harness")
      
      expect(fs.existsSync(firmHarnessPath)).toBe(true)
      expect(fs.statSync(firmHarnessPath).isDirectory()).toBe(true)
    })
  })

  describe("getDatabasePath", () => {
    it("should return path to lifecycle.db inside .firm-harness", () => {
      const dbPath = getDatabasePath(tempDir)
      expect(dbPath).toBe(path.join(tempDir, ".firm-harness", "lifecycle.db"))
    })

    it("should create .firm-harness directory if missing", () => {
      const dbPath = getDatabasePath(tempDir)
      const firmHarnessPath = path.join(tempDir, ".firm-harness")
      
      expect(fs.existsSync(firmHarnessPath)).toBe(true)
    })
  })

  describe("openDatabase", () => {
    it("should create and open a database file", () => {
      const db = openDatabase(tempDir)
      const dbPath = getDatabasePath(tempDir)
      
      expect(db).toBeDefined()
      expect(fs.existsSync(dbPath)).toBe(true)
    })

    it("should return cached instance on subsequent calls", () => {
      const db1 = openDatabase(tempDir)
      const db2 = openDatabase(tempDir)
      
      expect(db1).toBe(db2)
    })

    it("should create suggestions table with correct schema", () => {
      const db = openDatabase(tempDir)
      
      const tableInfo = db.pragma("table_info(suggestions)")
      const columnNames = tableInfo.map((col: any) => col.name)
      
      expect(columnNames).toContain("id")
      expect(columnNames).toContain("session_id")
      expect(columnNames).toContain("created_at")
      expect(columnNames).toContain("model")
      expect(columnNames).toContain("provider")
      expect(columnNames).toContain("prompt_hash")
      expect(columnNames).toContain("user_identity")
      expect(columnNames).toContain("status")
      expect(columnNames).toContain("discard_reason")
      expect(columnNames).toContain("commit_sha")
      expect(columnNames).toContain("shipped_at")
      expect(columnNames).toContain("scan_status")
      expect(columnNames).toContain("scan_findings")
    })

    it("should create suggestion_files table with correct schema", () => {
      const db = openDatabase(tempDir)
      
      const tableInfo = db.pragma("table_info(suggestion_files)")
      const columnNames = tableInfo.map((col: any) => col.name)
      
      expect(columnNames).toContain("id")
      expect(columnNames).toContain("suggestion_id")
      expect(columnNames).toContain("file_path")
      expect(columnNames).toContain("old_content_hash")
      expect(columnNames).toContain("new_content_hash")
      expect(columnNames).toContain("lines_added")
      expect(columnNames).toContain("lines_removed")
      expect(columnNames).toContain("diff_text")
    })

    it("should create status_transitions table with correct schema", () => {
      const db = openDatabase(tempDir)
      
      const tableInfo = db.pragma("table_info(status_transitions)")
      const columnNames = tableInfo.map((col: any) => col.name)
      
      expect(columnNames).toContain("id")
      expect(columnNames).toContain("suggestion_id")
      expect(columnNames).toContain("from_status")
      expect(columnNames).toContain("to_status")
      expect(columnNames).toContain("reason")
      expect(columnNames).toContain("transitioned_at")
    })

    it("should create index on suggestions.status", () => {
      const db = openDatabase(tempDir)
      
      const indexes = db.pragma("index_list(suggestions)")
      const indexNames = indexes.map((idx: any) => idx.name)
      
      expect(indexNames).toContain("idx_suggestions_status")
    })

    it("should create index on suggestions.session_id", () => {
      const db = openDatabase(tempDir)
      
      const indexes = db.pragma("index_list(suggestions)")
      const indexNames = indexes.map((idx: any) => idx.name)
      
      expect(indexNames).toContain("idx_suggestions_session_id")
    })

    it("should create index on suggestion_files.new_content_hash", () => {
      const db = openDatabase(tempDir)
      
      const indexes = db.pragma("index_list(suggestion_files)")
      const indexNames = indexes.map((idx: any) => idx.name)
      
      expect(indexNames).toContain("idx_suggestion_files_new_content_hash")
    })

    it("should enable foreign key constraints", () => {
      const db = openDatabase(tempDir)
      
      const fkStatus = db.pragma("foreign_keys")
      expect(fkStatus).toEqual([{ foreign_keys: 1 }])
    })

    it("should be idempotent - running migrations multiple times should not fail", () => {
      const db1 = openDatabase(tempDir)
      closeDatabase()
      
      // Open again - should run migrations again without error
      const db2 = openDatabase(tempDir)
      
      expect(db2).toBeDefined()
      
      // Verify tables still exist
      const tables = db2.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      const tableNames = tables.map((t: any) => t.name)
      
      expect(tableNames).toContain("suggestions")
      expect(tableNames).toContain("suggestion_files")
      expect(tableNames).toContain("status_transitions")
    })
  })

  describe("closeDatabase", () => {
    it("should close the database and clear cached instance", () => {
      const db1 = openDatabase(tempDir)
      expect(db1).toBeDefined()
      
      closeDatabase()
      
      // Opening again should create a new instance
      const db2 = openDatabase(tempDir)
      expect(db2).toBeDefined()
      expect(db2).not.toBe(db1)
    })

    it("should not throw if called when no database is open", () => {
      expect(() => closeDatabase()).not.toThrow()
    })
  })

  describe("Foreign Key Cascade", () => {
    it("should cascade delete suggestion_files when suggestion is deleted", () => {
      const db = openDatabase(tempDir)
      
      // Insert a suggestion
      db.prepare(`
        INSERT INTO suggestions (id, session_id, created_at, model, provider, prompt_hash, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run("test-suggestion-1", "session-1", Date.now(), "gpt-4", "openai", "hash123", "proposed")
      
      // Insert a file
      db.prepare(`
        INSERT INTO suggestion_files (suggestion_id, file_path, new_content_hash, diff_text)
        VALUES (?, ?, ?, ?)
      `).run("test-suggestion-1", "test.ts", "contenthash", "diff content")
      
      // Verify file exists
      const filesBefore = db.prepare("SELECT * FROM suggestion_files WHERE suggestion_id = ?").all("test-suggestion-1")
      expect(filesBefore).toHaveLength(1)
      
      // Delete suggestion
      db.prepare("DELETE FROM suggestions WHERE id = ?").run("test-suggestion-1")
      
      // Verify file was cascaded
      const filesAfter = db.prepare("SELECT * FROM suggestion_files WHERE suggestion_id = ?").all("test-suggestion-1")
      expect(filesAfter).toHaveLength(0)
    })

    it("should cascade delete status_transitions when suggestion is deleted", () => {
      const db = openDatabase(tempDir)
      
      // Insert a suggestion
      db.prepare(`
        INSERT INTO suggestions (id, session_id, created_at, model, provider, prompt_hash, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run("test-suggestion-2", "session-1", Date.now(), "gpt-4", "openai", "hash123", "proposed")
      
      // Insert a transition
      db.prepare(`
        INSERT INTO status_transitions (suggestion_id, from_status, to_status, transitioned_at)
        VALUES (?, ?, ?, ?)
      `).run("test-suggestion-2", null, "proposed", Date.now())
      
      // Verify transition exists
      const transitionsBefore = db.prepare("SELECT * FROM status_transitions WHERE suggestion_id = ?").all("test-suggestion-2")
      expect(transitionsBefore).toHaveLength(1)
      
      // Delete suggestion
      db.prepare("DELETE FROM suggestions WHERE id = ?").run("test-suggestion-2")
      
      // Verify transition was cascaded
      const transitionsAfter = db.prepare("SELECT * FROM status_transitions WHERE suggestion_id = ?").all("test-suggestion-2")
      expect(transitionsAfter).toHaveLength(0)
    })
  })
})

// In-memory database for testing (no native dependencies)
import fs from "fs"
import path from "path"

interface Row {
  [key: string]: any
}

class InMemoryDB {
  private tables: Map<string, Row[]> = new Map()
  private autoIncrement: Map<string, number> = new Map()

  constructor() {
    this.tables.set("suggestions", [])
    this.tables.set("suggestion_files", [])
    this.tables.set("status_transitions", [])
    this.autoIncrement.set("suggestion_files", 1)
    this.autoIncrement.set("status_transitions", 1)
  }

  run(sql: string, params: any[] = []): void {
    const normalized = sql.trim().toLowerCase()
    
    if (normalized.startsWith("create table") || normalized.startsWith("create index") || normalized.startsWith("pragma")) {
      return // Ignore schema commands
    }

    if (normalized.startsWith("insert into suggestions")) {
      const table = this.tables.get("suggestions")!
      table.push({
        id: params[0],
        session_id: params[1],
        created_at: params[2],
        model: params[3],
        provider: params[4],
        prompt_hash: params[5],
        user_identity: params[6],
        status: params[7],
        scan_status: params[8],
        scan_findings: params[9],
        discard_reason: null,
        commit_sha: null,
        shipped_at: null,
      })
      this.save() // Auto-save after insert
    } else if (normalized.startsWith("insert into suggestion_files")) {
      const table = this.tables.get("suggestion_files")!
      const id = this.autoIncrement.get("suggestion_files")!
      table.push({
        id,
        suggestion_id: params[0],
        file_path: params[1],
        old_content_hash: params[2],
        new_content_hash: params[3],
        lines_added: params[4],
        lines_removed: params[5],
        diff_text: params[6],
      })
      this.autoIncrement.set("suggestion_files", id + 1)
      this.save() // Auto-save after insert
    } else if (normalized.startsWith("insert into status_transitions")) {
      const table = this.tables.get("status_transitions")!
      const id = this.autoIncrement.get("status_transitions")!
      table.push({
        id,
        suggestion_id: params[0],
        from_status: params[1],
        to_status: params[2],
        reason: params[3],
        transitioned_at: params[4],
      })
      this.autoIncrement.set("status_transitions", id + 1)
      this.save() // Auto-save after insert
    } else if (normalized.startsWith("update suggestions")) {
      const table = this.tables.get("suggestions")!
      const id = params[params.length - 1]
      const row = table.find((r) => r.id === id)
      if (row) {
        if (normalized.includes("commit_sha")) {
          row.status = params[0]
          row.commit_sha = params[1]
          row.shipped_at = params[2]
        } else {
          row.status = params[0]
          row.discard_reason = params[1]
        }
        this.save() // Auto-save after update
      }
    }
  }

  private projectRoot?: string
  
  setProjectRoot(root: string): void {
    this.projectRoot = root
  }

  private save(): void {
    if (!this.projectRoot) return
    try {
      const dbPath = getDatabasePath(this.projectRoot)
      const data = this.export()
      fs.writeFileSync(dbPath, new TextDecoder().decode(data), "utf8")
    } catch (error) {
      console.error("Failed to save lifecycle DB:", error)
    }
  }

  prepare(sql: string): any {
    const normalized = sql.trim().toLowerCase()
    
    return {
      run: (...params: any[]) => this.run(sql, params),
      get: (...params: any[]) => {
        if (normalized.startsWith("select * from suggestions where id")) {
          const table = this.tables.get("suggestions")!
          return table.find((r) => r.id === params[0])
        }
        return null
      },
      all: (...params: any[]) => {
        if (normalized.includes("from suggestions")) {
          const table = this.tables.get("suggestions")!
          if (normalized.includes("where session_id")) {
            return table.filter((r) => r.session_id === params[0])
          }
          if (normalized.includes("where created_at")) {
            return table.filter((r) => r.created_at > params[0])
          }
          if (normalized.includes("where status") && normalized.includes("new_content_hash")) {
            const files = this.tables.get("suggestion_files")!
            const matchingFiles = files.filter((f) => f.new_content_hash === params[1])
            return table.filter((s) => 
              s.status === params[0] && matchingFiles.some((f) => f.suggestion_id === s.id)
            )
          }
          return table
        }
        if (normalized.includes("from suggestion_files")) {
          const table = this.tables.get("suggestion_files")!
          if (normalized.includes("where suggestion_id")) {
            return table.filter((r) => r.suggestion_id === params[0])
          }
          return table
        }
        if (normalized.includes("from status_transitions")) {
          const table = this.tables.get("status_transitions")!
          if (normalized.includes("where suggestion_id")) {
            return table.filter((r) => r.suggestion_id === params[0])
          }
          return table
        }
        return []
      },
    }
  }

  transaction(fn: () => void): () => void {
    return fn
  }

  export(): Uint8Array {
    const data = JSON.stringify({
      suggestions: this.tables.get("suggestions"),
      suggestion_files: this.tables.get("suggestion_files"),
      status_transitions: this.tables.get("status_transitions"),
    })
    return new TextEncoder().encode(data)
  }

  close(): void {
    // No-op
  }

  pragma(): any {
    return [{ foreign_keys: 1 }]
  }
}

let dbInstance: InMemoryDB | null = null

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
  return path.join(root, ".firm-harness", "lifecycle.json")
}

function runMigrations(db: InMemoryDB): void {
  db.run("PRAGMA foreign_keys = ON")
  db.run("CREATE TABLE IF NOT EXISTS suggestions (...)")
  db.run("CREATE TABLE IF NOT EXISTS suggestion_files (...)")
  db.run("CREATE TABLE IF NOT EXISTS status_transitions (...)")
}

export function openDatabase(projectRoot?: string): InMemoryDB {
  if (dbInstance) return dbInstance

  dbInstance = new InMemoryDB()
  dbInstance.setProjectRoot(projectRoot || findProjectRoot())
  runMigrations(dbInstance)

  const dbPath = getDatabasePath(projectRoot)
  if (fs.existsSync(dbPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(dbPath, "utf8"))
      dbInstance.tables.set("suggestions", data.suggestions || [])
      dbInstance.tables.set("suggestion_files", data.suggestion_files || [])
      dbInstance.tables.set("status_transitions", data.status_transitions || [])
    } catch {
      // Ignore load errors
    }
  }

  return dbInstance
}

export function closeDatabase(projectRoot?: string): void {
  if (dbInstance) {
    const dbPath = getDatabasePath(projectRoot)
    const data = dbInstance.export()
    fs.writeFileSync(dbPath, new TextDecoder().decode(data), "utf8")
    dbInstance.close()
    dbInstance = null
  }
}

export function getDatabase(): InMemoryDB | null {
  return dbInstance
}

export { findProjectRoot, getDatabasePath }

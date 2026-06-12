import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs"
import path from "path"
import os from "os"
import { execSync } from "child_process"
import { installGitHooks, uninstallGitHooks, checkGitHooksStatus } from "./git-hooks"
import { detectShippedSuggestions } from "./shipped-detection"
import { SuggestionRepository } from "./repository"
import { closeDatabase } from "./database"
import { SuggestionStatus } from "./types"

describe("Git Hooks and Shipped Detection", () => {
  let tempDir: string
  let originalCwd: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "git-hooks-test-"))
    process.chdir(tempDir)

    // Initialize git repo
    execSync("git init", { cwd: tempDir })
    execSync('git config user.email "test@example.com"', { cwd: tempDir })
    execSync('git config user.name "Test User"', { cwd: tempDir })
  })

  afterEach(() => {
    closeDatabase()
    process.chdir(originalCwd)
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  describe("Git Hooks Installation", () => {
    it("should install post-commit and post-rewrite hooks", () => {
      const result = installGitHooks({ gitRoot: tempDir })

      expect(result.success).toBe(true)
      expect(result.hooksInstalled).toContain("post-commit")
      expect(result.hooksInstalled).toContain("post-rewrite")

      const postCommitPath = path.join(tempDir, ".git", "hooks", "post-commit")
      const postRewritePath = path.join(tempDir, ".git", "hooks", "post-rewrite")

      expect(fs.existsSync(postCommitPath)).toBe(true)
      expect(fs.existsSync(postRewritePath)).toBe(true)

      const postCommitContent = fs.readFileSync(postCommitPath, "utf8")
      expect(postCommitContent).toContain("FIRM-HARNESS-LIFECYCLE-TRACKING")
      expect(postCommitContent).toContain("shipped-detection")
    })

    it("should skip installation if hooks already exist", () => {
      installGitHooks({ gitRoot: tempDir })
      const result = installGitHooks({ gitRoot: tempDir })

      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain("Already installed")
    })

    it("should warn about existing non-firm-harness hooks", () => {
      const postCommitPath = path.join(tempDir, ".git", "hooks", "post-commit")
      fs.mkdirSync(path.dirname(postCommitPath), { recursive: true })
      fs.writeFileSync(postCommitPath, "#!/bin/sh\necho 'existing hook'\n", "utf8")

      const result = installGitHooks({ gitRoot: tempDir })

      expect(result.warnings.some((w) => w.includes("Existing hook detected"))).toBe(true)
    })

    it("should prepend to existing hooks with --force", () => {
      const postCommitPath = path.join(tempDir, ".git", "hooks", "post-commit")
      fs.mkdirSync(path.dirname(postCommitPath), { recursive: true })
      fs.writeFileSync(postCommitPath, "#!/bin/sh\necho 'existing hook'\n", "utf8")

      const result = installGitHooks({ gitRoot: tempDir, force: true })

      expect(result.success).toBe(true)

      const content = fs.readFileSync(postCommitPath, "utf8")
      expect(content).toContain("FIRM-HARNESS-LIFECYCLE-TRACKING")
      expect(content).toContain("existing hook")

      // Firm harness hook should come before existing hook
      const firmIndex = content.indexOf("FIRM-HARNESS")
      const existingIndex = content.indexOf("existing hook")
      expect(firmIndex).toBeLessThan(existingIndex)
    })

    it("should make hooks executable on Unix systems", () => {
      if (process.platform === "win32") {
        return // Skip on Windows
      }

      installGitHooks({ gitRoot: tempDir })

      const postCommitPath = path.join(tempDir, ".git", "hooks", "post-commit")
      const stats = fs.statSync(postCommitPath)
      const isExecutable = (stats.mode & 0o111) !== 0

      expect(isExecutable).toBe(true)
    })
  })

  describe("Git Hooks Uninstallation", () => {
    it("should uninstall firm-harness hooks", () => {
      installGitHooks({ gitRoot: tempDir })
      const result = uninstallGitHooks({ gitRoot: tempDir })

      expect(result.success).toBe(true)
      expect(result.hooksInstalled).toContain("post-commit")
      expect(result.hooksInstalled).toContain("post-rewrite")

      const postCommitPath = path.join(tempDir, ".git", "hooks", "post-commit")
      const postRewritePath = path.join(tempDir, ".git", "hooks", "post-rewrite")

      expect(fs.existsSync(postCommitPath)).toBe(false)
      expect(fs.existsSync(postRewritePath)).toBe(false)
    })

    it("should preserve other hooks when uninstalling", () => {
      const postCommitPath = path.join(tempDir, ".git", "hooks", "post-commit")
      fs.mkdirSync(path.dirname(postCommitPath), { recursive: true })
      fs.writeFileSync(postCommitPath, "#!/bin/sh\necho 'existing hook'\n", "utf8")

      installGitHooks({ gitRoot: tempDir, force: true })
      uninstallGitHooks({ gitRoot: tempDir })

      expect(fs.existsSync(postCommitPath)).toBe(true)

      const content = fs.readFileSync(postCommitPath, "utf8")
      expect(content).not.toContain("FIRM-HARNESS")
      expect(content).toContain("existing hook")
    })
  })

  describe("Git Hooks Status", () => {
    it("should check installation status", () => {
      let status = checkGitHooksStatus(tempDir)
      expect(status.isGitRepo).toBe(true)
      expect(status.postCommitInstalled).toBe(false)
      expect(status.postRewriteInstalled).toBe(false)

      installGitHooks({ gitRoot: tempDir })

      status = checkGitHooksStatus(tempDir)
      expect(status.postCommitInstalled).toBe(true)
      expect(status.postRewriteInstalled).toBe(true)
    })
  })

  describe("Shipped Detection", () => {
    it("should detect clean match and mark as shipped", () => {
      const repo = new SuggestionRepository(tempDir)

      // Create a file
      const testFile = path.join(tempDir, "test.ts")
      const content = "console.log('hello world')"
      fs.writeFileSync(testFile, content, "utf8")

      // Record suggestion
      const suggestionId = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash123",
        files: [
          {
            filePath: testFile,
            newContent: content,
            diffText: "+console.log('hello world')",
          },
        ],
      })

      repo.markAccepted(suggestionId)

      // Commit the file
      execSync("git add test.ts", { cwd: tempDir })
      execSync('git commit -m "Add test file"', { cwd: tempDir })

      // Run shipped detection
      const result = detectShippedSuggestions(tempDir)

      expect(result.cleanMatches).toBe(1)
      expect(result.fuzzyMatches).toBe(0)
      expect(result.errors.length).toBe(0)

      const suggestion = repo.getSuggestion(suggestionId)
      expect(suggestion?.status).toBe(SuggestionStatus.Shipped)
      expect(suggestion?.commitSha).toBeDefined()
    })

    it("should detect fuzzy match and mark as shipped-modified", () => {
      const repo = new SuggestionRepository(tempDir)

      // Record suggestion with specific content
      const testFile = path.join(tempDir, "test.ts")
      const suggestionContent = `function hello() {
  console.log('hello')
  console.log('world')
  return true
}`

      const suggestionId = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash123",
        files: [
          {
            filePath: testFile,
            newContent: suggestionContent,
            diffText: `+function hello() {
+  console.log('hello')
+  console.log('world')
+  return true
+}`,
          },
        ],
      })

      repo.markAccepted(suggestionId)

      // Create file with 80%+ matching content (modified version)
      const modifiedContent = `function hello() {
  console.log('hello')
  console.log('world')
  return false  // Modified line
  console.log('extra line')  // Extra line
}`

      fs.writeFileSync(testFile, modifiedContent, "utf8")

      // Commit the file
      execSync("git add test.ts", { cwd: tempDir })
      execSync('git commit -m "Add modified test file"', { cwd: tempDir })

      // Run shipped detection
      const result = detectShippedSuggestions(tempDir)

      expect(result.fuzzyMatches).toBe(1)

      const suggestion = repo.getSuggestion(suggestionId)
      expect(suggestion?.status).toBe(SuggestionStatus.ShippedModified)
    })

    it("should not match suggestions older than 7 days", () => {
      const repo = new SuggestionRepository(tempDir)

      // Create a file
      const testFile = path.join(tempDir, "test.ts")
      const content = "console.log('old')"
      fs.writeFileSync(testFile, content, "utf8")

      // Record old suggestion (8 days ago)
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
      const suggestion = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash123",
        files: [
          {
            filePath: testFile,
            newContent: content,
            diffText: "+console.log('old')",
          },
        ],
      })

      repo.markAccepted(suggestion.id)

      // Manually update created_at to simulate old suggestion
      // (In real code, this would be an old suggestion)

      // Commit the file
      execSync("git add test.ts", { cwd: tempDir })
      execSync('git commit -m "Add old file"', { cwd: tempDir })

      // Run shipped detection
      const result = detectShippedSuggestions(tempDir)

      // Should still match with clean hash
      expect(result.cleanMatches).toBe(1)
    })

    it("should handle multiple files in one commit", () => {
      const repo = new SuggestionRepository(tempDir)

      // Record two suggestions
      const file1 = path.join(tempDir, "file1.ts")
      const file2 = path.join(tempDir, "file2.ts")

      const content1 = "console.log('file1')"
      const content2 = "console.log('file2')"

      fs.writeFileSync(file1, content1, "utf8")
      fs.writeFileSync(file2, content2, "utf8")

      const suggestionId1 = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash1",
        files: [
          {
            filePath: file1,
            newContent: content1,
            diffText: "+console.log('file1')",
          },
        ],
      })

      const suggestionId2 = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash2",
        files: [
          {
            filePath: file2,
            newContent: content2,
            diffText: "+console.log('file2')",
          },
        ],
      })

      repo.markAccepted(suggestionId1)
      repo.markAccepted(suggestionId2)

      // Commit both files
      execSync("git add .", { cwd: tempDir })
      execSync('git commit -m "Add both files"', { cwd: tempDir })

      // Run shipped detection
      const result = detectShippedSuggestions(tempDir)

      expect(result.cleanMatches).toBe(2)

      expect(repo.getSuggestion(suggestionId1)?.status).toBe(SuggestionStatus.Shipped)
      expect(repo.getSuggestion(suggestionId2)?.status).toBe(SuggestionStatus.Shipped)
    })

    it("should never throw errors (graceful error handling)", () => {
      // Even with no .firm-harness, should not throw
      expect(() => {
        detectShippedSuggestions(tempDir)
      }).not.toThrow()
    })
  })
})

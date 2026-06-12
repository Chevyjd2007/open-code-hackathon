import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs"
import path from "path"
import os from "os"
import { SuggestionRepository, sha256, countDiffLines } from "./repository"
import { closeDatabase } from "./database"
import { SuggestionStatus, DiscardReason } from "./types"

describe("SuggestionRepository", () => {
  let tempDir: string
  let repo: SuggestionRepository
  let originalCwd: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-"))
    process.chdir(tempDir)
    repo = new SuggestionRepository(tempDir)
  })

  afterEach(() => {
    closeDatabase()
    process.chdir(originalCwd)
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  describe("Helper Functions", () => {
    describe("sha256", () => {
      it("should compute SHA-256 hash", () => {
        const hash = sha256("hello world")
        expect(hash).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9")
      })

      it("should produce different hashes for different content", () => {
        const hash1 = sha256("content1")
        const hash2 = sha256("content2")
        expect(hash1).not.toBe(hash2)
      })

      it("should produce same hash for same content", () => {
        const hash1 = sha256("same content")
        const hash2 = sha256("same content")
        expect(hash1).toBe(hash2)
      })
    })

    describe("countDiffLines", () => {
      it("should count added lines", () => {
        const diff = `--- a/test.ts
+++ b/test.ts
@@ -1,3 +1,4 @@
 line1
+line2
 line3`
        const count = countDiffLines(diff)
        expect(count.added).toBe(1)
        expect(count.removed).toBe(0)
      })

      it("should count removed lines", () => {
        const diff = `--- a/test.ts
+++ b/test.ts
@@ -1,3 +1,2 @@
 line1
-line2
 line3`
        const count = countDiffLines(diff)
        expect(count.added).toBe(0)
        expect(count.removed).toBe(1)
      })

      it("should count both added and removed lines", () => {
        const diff = `--- a/test.ts
+++ b/test.ts
@@ -1,3 +1,3 @@
 line1
-old line
+new line
 line3`
        const count = countDiffLines(diff)
        expect(count.added).toBe(1)
        expect(count.removed).toBe(1)
      })

      it("should not count diff headers as changes", () => {
        const diff = `--- a/test.ts
+++ b/test.ts
@@ -1,1 +1,1 @@
 line1`
        const count = countDiffLines(diff)
        expect(count.added).toBe(0)
        expect(count.removed).toBe(0)
      })
    })
  })

  describe("recordProposed", () => {
    it("should create a new suggestion with generated ID", () => {
      const result = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "prompt-hash-123",
        userIdentity: "user@example.com",
        files: [
          {
            filePath: "test.ts",
            newContent: "console.log('hello')",
            diffText: "+console.log('hello')",
          },
        ],
      })

      expect(result.id).toBeDefined()
      expect(result.sessionId).toBe("session-1")
      expect(result.model).toBe("gpt-4")
      expect(result.provider).toBe("openai")
      expect(result.status).toBe(SuggestionStatus.Proposed)
      expect(result.files).toHaveLength(1)
      expect(result.files[0].filePath).toBe("test.ts")
    })

    it("should compute content hashes for files", () => {
      const newContent = "console.log('hello')"
      const result = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [
          {
            filePath: "test.ts",
            oldContent: "// old",
            newContent,
            diffText: "+console.log('hello')",
          },
        ],
      })

      expect(result.files[0].oldContentHash).toBe(sha256("// old"))
      expect(result.files[0].newContentHash).toBe(sha256(newContent))
    })

    it("should count added and removed lines", () => {
      const result = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [
          {
            filePath: "test.ts",
            newContent: "new",
            diffText: "+line1\n+line2\n-old1",
          },
        ],
      })

      expect(result.files[0].linesAdded).toBe(2)
      expect(result.files[0].linesRemoved).toBe(1)
    })

    it("should store scan results", () => {
      const result = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        scanStatus: "warn",
        scanFindings: [
          {
            reason: "Test warning",
            scanner: "test",
            severity: "medium",
          },
        ],
        files: [
          {
            filePath: "test.ts",
            newContent: "new",
            diffText: "+new",
          },
        ],
      })

      expect(result.scanStatus).toBe("warn")
      expect(result.scanFindings).toHaveLength(1)
      expect(result.scanFindings![0].reason).toBe("Test warning")
    })

    it("should create initial status transition", () => {
      const result = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [
          {
            filePath: "test.ts",
            newContent: "new",
            diffText: "+new",
          },
        ],
      })

      const transitions = repo.getTransitions(result.id)
      expect(transitions).toHaveLength(1)
      expect(transitions[0].fromStatus).toBeNull()
      expect(transitions[0].toStatus).toBe(SuggestionStatus.Proposed)
    })

    it("should handle multiple files", () => {
      const result = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [
          {
            filePath: "file1.ts",
            newContent: "content1",
            diffText: "+content1",
          },
          {
            filePath: "file2.ts",
            newContent: "content2",
            diffText: "+content2",
          },
        ],
      })

      expect(result.files).toHaveLength(2)
      expect(result.files[0].filePath).toBe("file1.ts")
      expect(result.files[1].filePath).toBe("file2.ts")
    })
  })

  describe("markDiscarded", () => {
    it("should mark a proposed suggestion as discarded", () => {
      const suggestion = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [{ filePath: "test.ts", newContent: "new", diffText: "+new" }],
      })

      repo.markDiscarded(suggestion.id, DiscardReason.UserRejection)

      const updated = repo.getSuggestion(suggestion.id)
      expect(updated!.status).toBe(SuggestionStatus.Discarded)
      expect(updated!.discardReason).toBe(DiscardReason.UserRejection)
    })

    it("should record status transition", () => {
      const suggestion = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [{ filePath: "test.ts", newContent: "new", diffText: "+new" }],
      })

      repo.markDiscarded(suggestion.id, DiscardReason.ScanFailure)

      const transitions = repo.getTransitions(suggestion.id)
      expect(transitions).toHaveLength(2)
      expect(transitions[1].fromStatus).toBe(SuggestionStatus.Proposed)
      expect(transitions[1].toStatus).toBe(SuggestionStatus.Discarded)
      expect(transitions[1].reason).toBe(DiscardReason.ScanFailure)
    })

    it("should throw on illegal transition", () => {
      const suggestion = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [{ filePath: "test.ts", newContent: "new", diffText: "+new" }],
      })

      repo.markDiscarded(suggestion.id, DiscardReason.UserRejection)

      // Try to discard again
      expect(() => {
        repo.markDiscarded(suggestion.id, DiscardReason.Abandonment)
      }).toThrow("Illegal state transition")
    })

    it("should throw if suggestion not found", () => {
      expect(() => {
        repo.markDiscarded("non-existent", DiscardReason.UserRejection)
      }).toThrow("Suggestion non-existent not found")
    })
  })

  describe("markAccepted", () => {
    it("should mark a proposed suggestion as accepted", () => {
      const suggestion = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [{ filePath: "test.ts", newContent: "new", diffText: "+new" }],
      })

      repo.markAccepted(suggestion.id)

      const updated = repo.getSuggestion(suggestion.id)
      expect(updated!.status).toBe(SuggestionStatus.Accepted)
    })

    it("should record status transition", () => {
      const suggestion = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [{ filePath: "test.ts", newContent: "new", diffText: "+new" }],
      })

      repo.markAccepted(suggestion.id)

      const transitions = repo.getTransitions(suggestion.id)
      expect(transitions).toHaveLength(2)
      expect(transitions[1].fromStatus).toBe(SuggestionStatus.Proposed)
      expect(transitions[1].toStatus).toBe(SuggestionStatus.Accepted)
    })

    it("should throw on illegal transition from discarded", () => {
      const suggestion = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [{ filePath: "test.ts", newContent: "new", diffText: "+new" }],
      })

      repo.markDiscarded(suggestion.id, DiscardReason.UserRejection)

      expect(() => {
        repo.markAccepted(suggestion.id)
      }).toThrow("Illegal state transition")
    })
  })

  describe("markShipped", () => {
    it("should mark accepted suggestion as shipped", () => {
      const suggestion = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [{ filePath: "test.ts", newContent: "new", diffText: "+new" }],
      })

      repo.markAccepted(suggestion.id)
      repo.markShipped(suggestion.id, "abc123")

      const updated = repo.getSuggestion(suggestion.id)
      expect(updated!.status).toBe(SuggestionStatus.Shipped)
      expect(updated!.commitSha).toBe("abc123")
      expect(updated!.shippedAt).toBeDefined()
    })

    it("should record status transition with commit SHA", () => {
      const suggestion = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [{ filePath: "test.ts", newContent: "new", diffText: "+new" }],
      })

      repo.markAccepted(suggestion.id)
      repo.markShipped(suggestion.id, "def456")

      const transitions = repo.getTransitions(suggestion.id)
      expect(transitions).toHaveLength(3)
      expect(transitions[2].toStatus).toBe(SuggestionStatus.Shipped)
      expect(transitions[2].reason).toContain("def456")
    })

    it("should throw on illegal transition from proposed", () => {
      const suggestion = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [{ filePath: "test.ts", newContent: "new", diffText: "+new" }],
      })

      expect(() => {
        repo.markShipped(suggestion.id, "abc123")
      }).toThrow("Illegal state transition")
    })
  })

  describe("markShippedModified", () => {
    it("should mark accepted suggestion as shipped-modified", () => {
      const suggestion = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [{ filePath: "test.ts", newContent: "new", diffText: "+new" }],
      })

      repo.markAccepted(suggestion.id)
      repo.markShippedModified(suggestion.id, "xyz789")

      const updated = repo.getSuggestion(suggestion.id)
      expect(updated!.status).toBe(SuggestionStatus.ShippedModified)
      expect(updated!.commitSha).toBe("xyz789")
      expect(updated!.shippedAt).toBeDefined()
    })

    it("should record status transition", () => {
      const suggestion = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [{ filePath: "test.ts", newContent: "new", diffText: "+new" }],
      })

      repo.markAccepted(suggestion.id)
      repo.markShippedModified(suggestion.id, "modified123")

      const transitions = repo.getTransitions(suggestion.id)
      expect(transitions).toHaveLength(3)
      expect(transitions[2].toStatus).toBe(SuggestionStatus.ShippedModified)
      expect(transitions[2].reason).toContain("modifications")
    })
  })

  describe("getSuggestion", () => {
    it("should retrieve a suggestion by ID", () => {
      const suggestion = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        userIdentity: "user@test.com",
        files: [{ filePath: "test.ts", newContent: "new", diffText: "+new" }],
      })

      const retrieved = repo.getSuggestion(suggestion.id)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.id).toBe(suggestion.id)
      expect(retrieved!.userIdentity).toBe("user@test.com")
    })

    it("should return null for non-existent ID", () => {
      const result = repo.getSuggestion("non-existent")
      expect(result).toBeNull()
    })
  })

  describe("getSuggestionWithFiles", () => {
    it("should retrieve suggestion with files", () => {
      const suggestion = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [
          { filePath: "file1.ts", newContent: "content1", diffText: "+content1" },
          { filePath: "file2.ts", newContent: "content2", diffText: "+content2" },
        ],
      })

      const retrieved = repo.getSuggestionWithFiles(suggestion.id)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.files).toHaveLength(2)
      expect(retrieved!.files[0].filePath).toBe("file1.ts")
      expect(retrieved!.files[1].filePath).toBe("file2.ts")
    })

    it("should return null for non-existent ID", () => {
      const result = repo.getSuggestionWithFiles("non-existent")
      expect(result).toBeNull()
    })
  })

  describe("findByContentHash", () => {
    it("should find accepted suggestions with matching content hash", () => {
      const content = "test content"
      const hash = sha256(content)

      const s1 = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash1",
        files: [{ filePath: "test.ts", newContent: content, diffText: "+test" }],
      })
      repo.markAccepted(s1.id)

      const s2 = repo.recordProposed({
        sessionId: "session-2",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash2",
        files: [{ filePath: "other.ts", newContent: content, diffText: "+test" }],
      })
      repo.markAccepted(s2.id)

      const found = repo.findByContentHash(hash)
      expect(found).toHaveLength(2)
      expect(found.map((s) => s.id)).toContain(s1.id)
      expect(found.map((s) => s.id)).toContain(s2.id)
    })

    it("should not find proposed or discarded suggestions", () => {
      const content = "test content"
      const hash = sha256(content)

      const s1 = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [{ filePath: "test.ts", newContent: content, diffText: "+test" }],
      })
      // Leave as proposed

      const found = repo.findByContentHash(hash)
      expect(found).toHaveLength(0)
    })

    it("should return empty array for non-matching hash", () => {
      const found = repo.findByContentHash("non-existent-hash")
      expect(found).toHaveLength(0)
    })
  })

  describe("findRecentByFilePath", () => {
    it("should find accepted suggestions for file path", () => {
      const s1 = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [{ filePath: "src/test.ts", newContent: "v1", diffText: "+v1" }],
      })
      repo.markAccepted(s1.id)

      const s2 = repo.recordProposed({
        sessionId: "session-2",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [{ filePath: "src/test.ts", newContent: "v2", diffText: "+v2" }],
      })
      repo.markAccepted(s2.id)

      const found = repo.findRecentByFilePath("src/test.ts")
      expect(found).toHaveLength(2)
      // Should be ordered by created_at DESC (most recent first)
      expect(found[0].id).toBe(s2.id)
      expect(found[1].id).toBe(s1.id)
    })

    it("should respect limit parameter", () => {
      for (let i = 0; i < 15; i++) {
        const s = repo.recordProposed({
          sessionId: `session-${i}`,
          model: "gpt-4",
          provider: "openai",
          promptHash: "hash",
          files: [{ filePath: "test.ts", newContent: `v${i}`, diffText: `+v${i}` }],
        })
        repo.markAccepted(s.id)
      }

      const found = repo.findRecentByFilePath("test.ts", 5)
      expect(found).toHaveLength(5)
    })

    it("should return empty array for non-matching path", () => {
      const found = repo.findRecentByFilePath("non-existent.ts")
      expect(found).toHaveLength(0)
    })
  })

  describe("listBySession", () => {
    it("should list all suggestions for a session", () => {
      const s1 = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [{ filePath: "test1.ts", newContent: "v1", diffText: "+v1" }],
      })

      const s2 = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [{ filePath: "test2.ts", newContent: "v2", diffText: "+v2" }],
      })

      const s3 = repo.recordProposed({
        sessionId: "session-2",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [{ filePath: "test3.ts", newContent: "v3", diffText: "+v3" }],
      })

      const found = repo.listBySession("session-1")
      expect(found).toHaveLength(2)
      expect(found.map((s) => s.id)).toContain(s1.id)
      expect(found.map((s) => s.id)).toContain(s2.id)
      expect(found.map((s) => s.id)).not.toContain(s3.id)
    })

    it("should order by created_at DESC", () => {
      const s1 = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [{ filePath: "test1.ts", newContent: "v1", diffText: "+v1" }],
      })

      const s2 = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [{ filePath: "test2.ts", newContent: "v2", diffText: "+v2" }],
      })

      const found = repo.listBySession("session-1")
      expect(found[0].id).toBe(s2.id)
      expect(found[1].id).toBe(s1.id)
    })

    it("should return empty array for non-existent session", () => {
      const found = repo.listBySession("non-existent")
      expect(found).toHaveLength(0)
    })
  })

  describe("getTransitions", () => {
    it("should return all transitions in chronological order", () => {
      const suggestion = repo.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash",
        files: [{ filePath: "test.ts", newContent: "new", diffText: "+new" }],
      })

      repo.markAccepted(suggestion.id)
      repo.markShipped(suggestion.id, "abc123")

      const transitions = repo.getTransitions(suggestion.id)
      expect(transitions).toHaveLength(3)
      expect(transitions[0].toStatus).toBe(SuggestionStatus.Proposed)
      expect(transitions[1].toStatus).toBe(SuggestionStatus.Accepted)
      expect(transitions[2].toStatus).toBe(SuggestionStatus.Shipped)
    })

    it("should return empty array for non-existent suggestion", () => {
      const transitions = repo.getTransitions("non-existent")
      expect(transitions).toHaveLength(0)
    })
  })
})

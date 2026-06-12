import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs"
import path from "path"
import os from "os"
import { LifecyclePipeline, getLifecyclePipeline, resetLifecyclePipeline } from "./pipeline"
import { closeDatabase } from "./database"
import { SuggestionStatus, DiscardReason } from "./types"

describe("Lifecycle Pipeline Integration", () => {
  let tempDir: string
  let pipeline: LifecyclePipeline
  let originalCwd: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-test-"))
    process.chdir(tempDir)
    pipeline = new LifecyclePipeline(tempDir)
  })

  afterEach(() => {
    closeDatabase()
    resetLifecyclePipeline()
    process.chdir(originalCwd)
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  describe("Happy Path - Accepted and Written", () => {
    it("should track suggestion from proposed to accepted", () => {
      const suggestionId = pipeline.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash123",
        userIdentity: "user@test.com",
        scanStatus: "pass",
        files: [
          {
            filePath: "test.ts",
            newContent: "console.log('hello')",
            diffText: "+console.log('hello')",
          },
        ],
      })

      expect(suggestionId).toBeDefined()

      const repo = pipeline.getRepository()
      let suggestion = repo.getSuggestion(suggestionId)
      expect(suggestion?.status).toBe(SuggestionStatus.Proposed)

      pipeline.acceptSuggestion(suggestionId)

      suggestion = repo.getSuggestion(suggestionId)
      expect(suggestion?.status).toBe(SuggestionStatus.Accepted)

      const transitions = repo.getTransitions(suggestionId)
      expect(transitions).toHaveLength(2)
      expect(transitions[0].toStatus).toBe(SuggestionStatus.Proposed)
      expect(transitions[1].toStatus).toBe(SuggestionStatus.Accepted)
    })
  })

  describe("Scan Failure Path", () => {
    it("should mark suggestion as discarded when scan fails and user rejects", () => {
      const suggestionId = pipeline.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash123",
        scanStatus: "fail",
        scanFindings: [
          {
            reason: "eval() usage detected",
            scanner: "vulnerability",
            severity: "critical",
          },
        ],
        files: [
          {
            filePath: "test.ts",
            newContent: "eval('dangerous')",
            diffText: "+eval('dangerous')",
          },
        ],
      })

      const repo = pipeline.getRepository()
      let suggestion = repo.getSuggestion(suggestionId)
      expect(suggestion?.status).toBe(SuggestionStatus.Proposed)
      expect(suggestion?.scanStatus).toBe("fail")
      expect(suggestion?.scanFindings).toHaveLength(1)

      pipeline.discardForUserRejection(suggestionId)

      suggestion = repo.getSuggestion(suggestionId)
      expect(suggestion?.status).toBe(SuggestionStatus.Discarded)
      expect(suggestion?.discardReason).toBe(DiscardReason.UserRejection)

      const transitions = repo.getTransitions(suggestionId)
      expect(transitions).toHaveLength(2)
      expect(transitions[1].toStatus).toBe(SuggestionStatus.Discarded)
      expect(transitions[1].reason).toBe(DiscardReason.UserRejection)
    })

    it("should allow override and accept after scan failure", () => {
      const suggestionId = pipeline.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash123",
        scanStatus: "fail",
        files: [
          {
            filePath: "test.ts",
            newContent: "eval('dangerous')",
            diffText: "+eval('dangerous')",
          },
        ],
      })

      // User overrides and write succeeds
      pipeline.acceptSuggestion(suggestionId)

      const repo = pipeline.getRepository()
      const suggestion = repo.getSuggestion(suggestionId)
      expect(suggestion?.status).toBe(SuggestionStatus.Accepted)
    })
  })

  describe("Policy Denial Path", () => {
    it("should mark suggestion as discarded when policy denies", () => {
      const suggestionId = pipeline.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash123",
        files: [
          {
            filePath: "test.ts",
            newContent: "code",
            diffText: "+code",
          },
        ],
      })

      pipeline.discardForPolicyDenial(suggestionId)

      const repo = pipeline.getRepository()
      const suggestion = repo.getSuggestion(suggestionId)
      expect(suggestion?.status).toBe(SuggestionStatus.Discarded)
      expect(suggestion?.discardReason).toBe(DiscardReason.PolicyDenial)
    })
  })

  describe("Session Abandonment", () => {
    it("should sweep abandoned suggestions at session end", () => {
      const suggestionId1 = pipeline.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash1",
        files: [
          {
            filePath: "test1.ts",
            newContent: "code1",
            diffText: "+code1",
          },
        ],
      })

      const suggestionId2 = pipeline.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash2",
        files: [
          {
            filePath: "test2.ts",
            newContent: "code2",
            diffText: "+code2",
          },
        ],
      })

      const suggestionId3 = pipeline.recordProposed({
        sessionId: "session-2",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash3",
        files: [
          {
            filePath: "test3.ts",
            newContent: "code3",
            diffText: "+code3",
          },
        ],
      })

      // Accept one from session-1
      pipeline.acceptSuggestion(suggestionId2)

      // Sweep abandoned suggestions for session-1
      const count = pipeline.sweepAbandonedForSession("session-1")
      expect(count).toBe(1) // Only suggestionId1 was still proposed

      const repo = pipeline.getRepository()

      const s1 = repo.getSuggestion(suggestionId1)
      expect(s1?.status).toBe(SuggestionStatus.Discarded)
      expect(s1?.discardReason).toBe(DiscardReason.Abandonment)

      const s2 = repo.getSuggestion(suggestionId2)
      expect(s2?.status).toBe(SuggestionStatus.Accepted) // Was already accepted

      const s3 = repo.getSuggestion(suggestionId3)
      expect(s3?.status).toBe(SuggestionStatus.Proposed) // Different session
    })

    it("should not sweep suggestions from other sessions", () => {
      pipeline.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash1",
        files: [
          {
            filePath: "test1.ts",
            newContent: "code1",
            diffText: "+code1",
          },
        ],
      })

      pipeline.recordProposed({
        sessionId: "session-2",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash2",
        files: [
          {
            filePath: "test2.ts",
            newContent: "code2",
            diffText: "+code2",
          },
        ],
      })

      const count = pipeline.sweepAbandonedForSession("session-1")
      expect(count).toBe(1)

      const repo = pipeline.getRepository()
      const suggestions = repo.listBySession("session-2")
      expect(suggestions[0].status).toBe(SuggestionStatus.Proposed)
    })
  })

  describe("Multiple Files Support", () => {
    it("should track suggestions with multiple files", () => {
      const suggestionId = pipeline.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash123",
        files: [
          {
            filePath: "file1.ts",
            newContent: "content1",
            diffText: "+content1",
          },
          {
            filePath: "file2.ts",
            oldContent: "old",
            newContent: "content2",
            diffText: "-old\n+content2",
          },
          {
            filePath: "file3.ts",
            newContent: "content3",
            diffText: "+content3",
          },
        ],
      })

      const repo = pipeline.getRepository()
      const suggestion = repo.getSuggestionWithFiles(suggestionId)
      expect(suggestion?.files).toHaveLength(3)
      expect(suggestion?.files[0].filePath).toBe("file1.ts")
      expect(suggestion?.files[1].filePath).toBe("file2.ts")
      expect(suggestion?.files[2].filePath).toBe("file3.ts")
    })
  })

  describe("Global Singleton", () => {
    it("should return same instance from getLifecyclePipeline", () => {
      const pipeline1 = getLifecyclePipeline(tempDir)
      const pipeline2 = getLifecyclePipeline(tempDir)
      expect(pipeline1).toBe(pipeline2)
    })

    it("should reset singleton with resetLifecyclePipeline", () => {
      const pipeline1 = getLifecyclePipeline(tempDir)
      resetLifecyclePipeline()
      const pipeline2 = getLifecyclePipeline(tempDir)
      expect(pipeline1).not.toBe(pipeline2)
    })
  })

  describe("Error Handling", () => {
    it("should handle illegal state transitions gracefully", () => {
      const suggestionId = pipeline.recordProposed({
        sessionId: "session-1",
        model: "gpt-4",
        provider: "openai",
        promptHash: "hash123",
        files: [
          {
            filePath: "test.ts",
            newContent: "code",
            diffText: "+code",
          },
        ],
      })

      pipeline.discardForUserRejection(suggestionId)

      // Try to accept a discarded suggestion (illegal transition)
      expect(() => {
        pipeline.acceptSuggestion(suggestionId)
      }).toThrow("Illegal state transition")
    })
  })
})

import { SuggestionRepository } from "./src/lifecycle/repository-json"

console.log("Testing JSON repository...")

const repo = new SuggestionRepository(process.cwd())

const result = repo.recordProposed({
  sessionId: "test-session",
  model: "test-model",
  provider: "test",
  promptHash: "test-hash",
  files: [{
    filePath: "test.ts",
    newContent: "hello world",
    diffText: "+hello world"
  }]
})

console.log("✅ Created suggestion:", result.id.substring(0, 8))

const all = repo.listAll()
console.log("✅ Total suggestions:", all.length)
console.log("✅ DB location:", process.cwd() + "/.firm-harness/lifecycle.json")

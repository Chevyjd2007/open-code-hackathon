import assert from "assert"
import { scan } from "./secret"

async function testHardcodedFallback() {
  const diff = `+++ b/src/foo.js
@@
const API_KEY = process.env.API_KEY || "hardcoded_default_123"`
  const res = await scan(diff, {})
  assert(res.status === "warn", `expected warn but got ${res.status}`)
  assert(res.findings.length > 0, "expected findings for hardcoded fallback")
  console.log("testHardcodedFallback passed")
}

async function testEntropyToken() {
  const token = "YmFzZTY0ZW5jb2RlZHRlc3R0b2tlbm90ZXhhbXBsZQ=="
  const diff = `+++ b/src/secret.txt\n@@\nconst KEY = "${token}"`
  const res = await scan(diff, {})
  assert(res.status === "warn", `expected warn for entropy but got ${res.status}`)
  console.log("testEntropyToken passed")
}

async function run() {
  await testHardcodedFallback()
  await testEntropyToken()
}

if (require.main === module) run().catch((e) => { console.error(e); process.exit(1) })

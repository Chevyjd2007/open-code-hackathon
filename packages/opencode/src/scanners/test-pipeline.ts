// Test file to verify prewrite scan pipeline implementation
import type { ScanResult } from "./index"

console.log("Testing Pre-Write Scan Pipeline...")

// Test 1: Secret Scanner
async function testSecretScanner() {
  const { scan: secretScan } = await import("./secret")
  
  const testDiff = `
+++ b/config.ts
+const API_KEY = "hardcoded-secret-key-12345"
+const AWS_KEY = "AKIAIOSFODNN7EXAMPLE"
+process.env.API_KEY || "fallback-secret"
`
  
  const result = await secretScan(testDiff, {})
  console.log("Secret Scanner Test:")
  console.log("  Status:", result.status)
  console.log("  Findings:", result.findings.length)
  if (result.findings.length > 0) {
    result.findings.forEach(f => {
      console.log(`    - [${f.scanner}] ${f.reason}`)
    })
  }
  return result.status !== "pass"
}

// Test 2: License Scanner
async function testLicenseScanner() {
  const { scan: licenseScan } = await import("./license")
  
  const testDiff = `
+++ b/app.ts
+// Licensed under GPL-3.0
+import 'unknown-package'
`
  
  const result = await licenseScan(testDiff, {})
  console.log("\nLicense Scanner Test:")
  console.log("  Status:", result.status)
  console.log("  Findings:", result.findings.length)
  if (result.findings.length > 0) {
    result.findings.forEach(f => {
      console.log(`    - [${f.scanner}] ${f.reason}`)
    })
  }
  return result.findings.length > 0
}

// Test 3: Vulnerability Scanner
async function testVulnScanner() {
  const { scan: vulnScan } = await import("./vuln")
  
  const testDiff = `
+++ b/db.ts
+const query = \`SELECT * FROM users WHERE id = \${userId}\`
+eval(userInput)
`
  
  const result = await vulnScan(testDiff, {})
  console.log("\nVulnerability Scanner Test:")
  console.log("  Status:", result.status)
  console.log("  Findings:", result.findings.length)
  if (result.findings.length > 0) {
    result.findings.forEach(f => {
      console.log(`    - [${f.scanner}] ${f.reason}`)
    })
  }
  return result.status === "fail"
}

// Test 4: Full Pipeline
async function testFullPipeline() {
  const { runScanners } = await import("./index")
  
  const testDiff = `
+++ b/app.ts
+const SECRET = "my-secret-key-12345"
+eval(userInput)
+import 'gpl-licensed-package'
`
  
  const result = await runScanners(testDiff, {})
  console.log("\nFull Pipeline Test:")
  console.log("  Status:", result.status)
  console.log("  Total Findings:", result.findings.length)
  console.log("  By Scanner:")
  const byScanner = result.findings.reduce((acc, f) => {
    acc[f.scanner] = (acc[f.scanner] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  Object.entries(byScanner).forEach(([scanner, count]) => {
    console.log(`    - ${scanner}: ${count}`)
  })
  return result.status !== "pass"
}

// Run all tests
async function runTests() {
  try {
    const secretTest = await testSecretScanner()
    const licenseTest = await testLicenseScanner()
    const vulnTest = await testVulnScanner()
    const pipelineTest = await testFullPipeline()
    
    console.log("\n" + "=".repeat(50))
    console.log("Test Results:")
    console.log("  Secret Scanner:", secretTest ? "✓ PASS" : "✗ FAIL")
    console.log("  License Scanner:", licenseTest ? "✓ PASS" : "✗ FAIL")
    console.log("  Vulnerability Scanner:", vulnTest ? "✓ PASS" : "✗ FAIL")
    console.log("  Full Pipeline:", pipelineTest ? "✓ PASS" : "✗ FAIL")
    console.log("=".repeat(50))
    
    const allPassed = secretTest && licenseTest && vulnTest && pipelineTest
    console.log("\nOverall:", allPassed ? "✓ ALL TESTS PASSED" : "✗ SOME TESTS FAILED")
    
    process.exit(allPassed ? 0 : 1)
  } catch (error) {
    console.error("\n✗ Error running tests:", error)
    process.exit(1)
  }
}

runTests()

import fs from "fs"
import path from "path"
import type { ScanResult } from "./index"

export type ScanLogEntry = {
  timestamp: string
  filepath: string
  user?: string
  workspace?: string
  scanResult: ScanResult
  action: "blocked" | "overridden" | "passed"
  overrideReason?: string
}

function getLogPath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "."
  const logDir = path.join(homeDir, ".opencode", "logs")
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
  return path.join(logDir, "prewrite-scan.jsonl")
}

export function logScanResult(entry: ScanLogEntry): void {
  try {
    const logPath = getLogPath()
    const logLine = JSON.stringify(entry) + "\n"
    fs.appendFileSync(logPath, logLine, "utf8")
  } catch (error) {
    console.error("Failed to log scan result:", error)
  }
}

export function readScanLog(limit = 100): ScanLogEntry[] {
  try {
    const logPath = getLogPath()
    if (!fs.existsSync(logPath)) {
      return []
    }
    const content = fs.readFileSync(logPath, "utf8")
    const lines = content.trim().split("\n").slice(-limit)
    return lines.map((line) => JSON.parse(line))
  } catch (error) {
    console.error("Failed to read scan log:", error)
    return []
  }
}

export default { logScanResult, readScanLog }

import fs from "fs"
import path from "path"
import { execSync } from "child_process"
import { SuggestionRepository, sha256 } from "./repository"
import { SuggestionStatus } from "./types"

/**
 * Shipped detection configuration
 */
const FUZZY_MATCH_THRESHOLD = 0.8
const FUZZY_MATCH_WINDOW_DAYS = 7

/**
 * Logs error to .firm-harness/logs/shipped-detection.log
 */
function logError(projectRoot: string, error: any): void {
  try {
    const logDir = path.join(projectRoot, ".firm-harness", "logs")
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }
    const logPath = path.join(logDir, "shipped-detection.log")
    const timestamp = new Date().toISOString()
    const message = `[${timestamp}] ERROR: ${error instanceof Error ? error.message : String(error)}\n${error instanceof Error ? error.stack : ""}\n\n`
    fs.appendFileSync(logPath, message, "utf8")
  } catch (logError) {
    // Silently fail - we must never block a commit
  }
}

/**
 * Finds the git repository root by walking up from the current directory
 */
function findGitRoot(startDir: string = process.cwd()): string | null {
  let currentDir = startDir
  const root = path.parse(currentDir).root

  while (currentDir !== root) {
    const gitPath = path.join(currentDir, ".git")
    if (fs.existsSync(gitPath)) {
      return currentDir
    }
    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) break
    currentDir = parentDir
  }

  return null
}

/**
 * Gets the HEAD commit SHA
 */
function getHeadCommitSha(gitRoot: string): string {
  return execSync("git rev-parse HEAD", { cwd: gitRoot, encoding: "utf8" }).trim()
}

/**
 * Gets list of files changed in the HEAD commit
 */
function getChangedFiles(gitRoot: string): string[] {
  const output = execSync("git diff-tree --no-commit-id --name-only -r HEAD", {
    cwd: gitRoot,
    encoding: "utf8",
  }).trim()

  if (!output) return []
  return output.split("\n").filter((line) => line.trim())
}

/**
 * Gets file content at HEAD
 */
function getFileContentAtHead(gitRoot: string, filePath: string): string {
  return execSync(`git show HEAD:${filePath}`, { cwd: gitRoot, encoding: "utf8" })
}

/**
 * Parses a unified diff to extract added lines
 */
function extractAddedLines(diff: string): string[] {
  const lines = diff.split("\n")
  const addedLines: string[] = []

  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      // Remove the leading + and add to result
      addedLines.push(line.substring(1))
    }
  }

  return addedLines
}

/**
 * Calculates fuzzy match score between suggestion's added lines and current file content
 */
function calculateFuzzyMatchScore(suggestionDiff: string, currentContent: string): number {
  const addedLines = extractAddedLines(suggestionDiff)
  if (addedLines.length === 0) return 0

  const currentLines = new Set(currentContent.split("\n").map((line) => line.trim()))
  let matchedLines = 0

  for (const line of addedLines) {
    const trimmedLine = line.trim()
    if (trimmedLine && currentLines.has(trimmedLine)) {
      matchedLines++
    }
  }

  return matchedLines / addedLines.length
}

/**
 * Detects shipped suggestions and updates their status
 */
export function detectShippedSuggestions(projectRoot?: string): {
  cleanMatches: number
  fuzzyMatches: number
  errors: string[]
} {
  const errors: string[] = []
  let cleanMatches = 0
  let fuzzyMatches = 0

  try {
    const gitRoot = findGitRoot(projectRoot)
    if (!gitRoot) {
      throw new Error("Not in a git repository")
    }

    const commitSha = getHeadCommitSha(gitRoot)
    const changedFiles = getChangedFiles(gitRoot)

    if (changedFiles.length === 0) {
      return { cleanMatches, fuzzyMatches, errors }
    }

    const repo = new SuggestionRepository(projectRoot || gitRoot)
    const sevenDaysAgo = Date.now() - FUZZY_MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000

    for (const relativeFilePath of changedFiles) {
      try {
        const fileContent = getFileContentAtHead(gitRoot, relativeFilePath)
        const contentHash = sha256(fileContent)

        // Try clean match first
        const cleanMatchSuggestions = repo.findByContentHash(contentHash)

        if (cleanMatchSuggestions.length > 0) {
          for (const suggestion of cleanMatchSuggestions) {
            try {
              repo.markShipped(suggestion.id, commitSha)
              cleanMatches++
            } catch (error) {
              errors.push(`Failed to mark ${suggestion.id} as shipped: ${error}`)
            }
          }
          continue // Skip fuzzy matching if we found clean matches
        }

        // Fall back to fuzzy matching
        const absoluteFilePath = path.join(gitRoot, relativeFilePath)
        const recentSuggestions = repo.findRecentByFilePath(absoluteFilePath)

        for (const suggestion of recentSuggestions) {
          // Only consider suggestions from the last 7 days
          if (suggestion.createdAt < sevenDaysAgo) continue

          // Get the suggestion's files
          const suggestionWithFiles = repo.getSuggestionWithFiles(suggestion.id)
          if (!suggestionWithFiles) continue

          // Find the file record for this path
          const fileRecord = suggestionWithFiles.files.find(
            (f) => f.filePath === absoluteFilePath || f.filePath.endsWith(relativeFilePath)
          )

          if (!fileRecord) continue

          // Calculate fuzzy match score
          const score = calculateFuzzyMatchScore(fileRecord.diffText, fileContent)

          if (score >= FUZZY_MATCH_THRESHOLD) {
            try {
              repo.markShippedModified(suggestion.id, commitSha)
              fuzzyMatches++
              break // Only mark one suggestion per file
            } catch (error) {
              errors.push(
                `Failed to mark ${suggestion.id} as shipped-modified: ${error}`
              )
            }
          }
        }
      } catch (error) {
        errors.push(
          `Failed to process file ${relativeFilePath}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    return { cleanMatches, fuzzyMatches, errors }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    errors.push(`Fatal error: ${errorMessage}`)
    if (projectRoot) {
      logError(projectRoot, error)
    }
    return { cleanMatches, fuzzyMatches, errors }
  }
}

/**
 * CLI entry point for shipped detection (called from git hooks)
 * This function must NEVER throw or exit with non-zero status
 */
export function runShippedDetectionCLI(): void {
  try {
    const gitRoot = findGitRoot()
    if (!gitRoot) {
      // Not in a git repo - silently exit
      process.exit(0)
    }

    const result = detectShippedSuggestions(gitRoot)

    // Log results to .firm-harness/logs/
    const logDir = path.join(gitRoot, ".firm-harness", "logs")
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }

    const logPath = path.join(logDir, "shipped-detection.log")
    const timestamp = new Date().toISOString()
    const logEntry = `[${timestamp}] Shipped detection: ${result.cleanMatches} clean matches, ${result.fuzzyMatches} fuzzy matches${result.errors.length > 0 ? `, ${result.errors.length} errors` : ""}\n`

    fs.appendFileSync(logPath, logEntry, "utf8")

    if (result.errors.length > 0) {
      for (const error of result.errors) {
        fs.appendFileSync(logPath, `  ERROR: ${error}\n`, "utf8")
      }
    }

    // Always exit with 0 to never block commits
    process.exit(0)
  } catch (error) {
    // Log error and exit cleanly
    try {
      const gitRoot = findGitRoot()
      if (gitRoot) {
        logError(gitRoot, error)
      }
    } catch {
      // Ignore logging errors
    }
    process.exit(0)
  }
}

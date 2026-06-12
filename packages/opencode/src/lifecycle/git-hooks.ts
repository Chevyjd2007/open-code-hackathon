import fs from "fs"
import path from "path"
import { execSync } from "child_process"

const FIRM_HARNESS_MARKER = "# FIRM-HARNESS-LIFECYCLE-TRACKING"

/**
 * Finds the git repository root
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
 * Generates the hook script content
 */
function generateHookScript(hookType: "post-commit" | "post-rewrite"): string {
  const script = `#!/bin/sh
${FIRM_HARNESS_MARKER}
# Firm Harness Lifecycle Tracking - ${hookType}
# This hook detects shipped AI-generated code suggestions

# Run shipped detection (never blocks commit)
node -e "require('./node_modules/@opencode-ai/core/dist/lifecycle/shipped-detection.js').runShippedDetectionCLI()" 2>/dev/null || true
`

  return script
}

/**
 * Checks if a hook file contains firm-harness tracking
 */
function hasFirmHarnessHook(hookPath: string): boolean {
  if (!fs.existsSync(hookPath)) return false
  const content = fs.readFileSync(hookPath, "utf8")
  return content.includes(FIRM_HARNESS_MARKER)
}

/**
 * Checks if a hook file has non-firm-harness content
 */
function hasOtherHooks(hookPath: string): boolean {
  if (!fs.existsSync(hookPath)) return false
  const content = fs.readFileSync(hookPath, "utf8")
  const lines = content.split("\n").filter((line) => {
    const trimmed = line.trim()
    return (
      trimmed &&
      !trimmed.startsWith("#") &&
      !trimmed.includes("firm-harness") &&
      !trimmed.includes("FIRM-HARNESS")
    )
  })
  return lines.length > 0
}

/**
 * Install options
 */
export interface InstallOptions {
  force?: boolean
  gitRoot?: string
}

/**
 * Install result
 */
export interface InstallResult {
  success: boolean
  message: string
  warnings: string[]
  hooksInstalled: string[]
}

/**
 * Installs post-commit and post-rewrite hooks
 */
export function installGitHooks(options: InstallOptions = {}): InstallResult {
  const warnings: string[] = []
  const hooksInstalled: string[] = []

  try {
    const gitRoot = options.gitRoot || findGitRoot()
    if (!gitRoot) {
      return {
        success: false,
        message: "Not in a git repository",
        warnings,
        hooksInstalled,
      }
    }

    const hooksDir = path.join(gitRoot, ".git", "hooks")
    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true })
    }

    const hooks: Array<"post-commit" | "post-rewrite"> = ["post-commit", "post-rewrite"]

    for (const hookName of hooks) {
      const hookPath = path.join(hooksDir, hookName)
      const hookScript = generateHookScript(hookName)

      // Check if hook already exists
      if (fs.existsSync(hookPath)) {
        if (hasFirmHarnessHook(hookPath) && !options.force) {
          warnings.push(`${hookName}: Already installed, skipping`)
          continue
        }

        if (hasOtherHooks(hookPath) && !options.force) {
          warnings.push(
            `${hookName}: Existing hook detected. Use --force to prepend firm-harness tracking`
          )
          continue
        }

        if (options.force && hasOtherHooks(hookPath)) {
          // Prepend firm-harness hook to existing content
          const existingContent = fs.readFileSync(hookPath, "utf8")
          const newContent = hookScript + "\n" + existingContent
          fs.writeFileSync(hookPath, newContent, "utf8")
          warnings.push(`${hookName}: Prepended to existing hook (--force used)`)
        } else {
          // Overwrite
          fs.writeFileSync(hookPath, hookScript, "utf8")
        }
      } else {
        // Create new hook
        fs.writeFileSync(hookPath, hookScript, "utf8")
      }

      // Make executable (Unix systems)
      if (process.platform !== "win32") {
        fs.chmodSync(hookPath, 0o755)
      }

      hooksInstalled.push(hookName)
    }

    const message =
      hooksInstalled.length > 0
        ? `Successfully installed ${hooksInstalled.length} git hook(s): ${hooksInstalled.join(", ")}`
        : "No hooks installed (already present or existing hooks detected)"

    return {
      success: hooksInstalled.length > 0 || warnings.length === 0,
      message,
      warnings,
      hooksInstalled,
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to install hooks: ${error instanceof Error ? error.message : String(error)}`,
      warnings,
      hooksInstalled,
    }
  }
}

/**
 * Uninstalls firm-harness git hooks
 */
export function uninstallGitHooks(options: InstallOptions = {}): InstallResult {
  const warnings: string[] = []
  const hooksInstalled: string[] = []

  try {
    const gitRoot = options.gitRoot || findGitRoot()
    if (!gitRoot) {
      return {
        success: false,
        message: "Not in a git repository",
        warnings,
        hooksInstalled,
      }
    }

    const hooksDir = path.join(gitRoot, ".git", "hooks")
    const hooks: Array<"post-commit" | "post-rewrite"> = ["post-commit", "post-rewrite"]

    for (const hookName of hooks) {
      const hookPath = path.join(hooksDir, hookName)

      if (!fs.existsSync(hookPath)) {
        continue
      }

      if (!hasFirmHarnessHook(hookPath)) {
        warnings.push(`${hookName}: No firm-harness hook found, skipping`)
        continue
      }

      const content = fs.readFileSync(hookPath, "utf8")
      const lines = content.split("\n")

      // Remove firm-harness lines
      const filteredLines = lines.filter((line) => {
        return (
          !line.includes(FIRM_HARNESS_MARKER) &&
          !line.includes("Firm Harness Lifecycle Tracking") &&
          !line.includes("firm-harness") &&
          !line.includes("shipped-detection")
        )
      })

      // Check if there's other content left
      const hasOtherContent = filteredLines.some((line) => {
        const trimmed = line.trim()
        return trimmed && !trimmed.startsWith("#") && trimmed !== "#!/bin/sh"
      })

      if (hasOtherContent) {
        // Write back filtered content
        fs.writeFileSync(hookPath, filteredLines.join("\n"), "utf8")
        warnings.push(`${hookName}: Removed firm-harness tracking, kept other hooks`)
      } else {
        // Delete the file
        fs.unlinkSync(hookPath)
      }

      hooksInstalled.push(hookName)
    }

    const message =
      hooksInstalled.length > 0
        ? `Successfully uninstalled ${hooksInstalled.length} git hook(s): ${hooksInstalled.join(", ")}`
        : "No firm-harness hooks found"

    return {
      success: true,
      message,
      warnings,
      hooksInstalled,
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to uninstall hooks: ${error instanceof Error ? error.message : String(error)}`,
      warnings,
      hooksInstalled,
    }
  }
}

/**
 * Checks the status of git hooks installation
 */
export function checkGitHooksStatus(gitRoot?: string): {
  isGitRepo: boolean
  postCommitInstalled: boolean
  postRewriteInstalled: boolean
  postCommitHasOthers: boolean
  postRewriteHasOthers: boolean
} {
  const root = gitRoot || findGitRoot()

  if (!root) {
    return {
      isGitRepo: false,
      postCommitInstalled: false,
      postRewriteInstalled: false,
      postCommitHasOthers: false,
      postRewriteHasOthers: false,
    }
  }

  const hooksDir = path.join(root, ".git", "hooks")
  const postCommitPath = path.join(hooksDir, "post-commit")
  const postRewritePath = path.join(hooksDir, "post-rewrite")

  return {
    isGitRepo: true,
    postCommitInstalled: hasFirmHarnessHook(postCommitPath),
    postRewriteInstalled: hasFirmHarnessHook(postRewritePath),
    postCommitHasOthers: hasOtherHooks(postCommitPath),
    postRewriteHasOthers: hasOtherHooks(postRewritePath),
  }
}

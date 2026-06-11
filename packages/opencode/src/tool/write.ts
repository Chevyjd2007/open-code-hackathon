import { Schema } from "effect"
import * as path from "path"
import { Effect } from "effect"
import * as Tool from "./tool"
import { LSP } from "@/lsp/lsp"
import { createTwoFilesPatch } from "diff"
import DESCRIPTION from "./write.txt"
import { EventV2Bridge } from "@/event-v2-bridge"
import { FileSystem } from "@opencode-ai/core/filesystem"
import { Watcher } from "@opencode-ai/core/filesystem/watcher"
import { Format } from "../format"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { InstanceState } from "@/effect/instance-state"
import { trimDiff } from "./edit"
import { assertExternalDirectoryEffect } from "./external-directory"
import * as Bom from "@/util/bom"
import { Plugin } from "@/plugin"
import { logScanResult } from "@/scanners/log"

const MAX_PROJECT_DIAGNOSTICS_FILES = 5

export const Parameters = Schema.Struct({
  content: Schema.String.annotate({ description: "The content to write to the file" }),
  filePath: Schema.String.annotate({
    description: "The absolute path to the file to write (must be absolute, not relative)",
  }),
})

export const WriteTool = Tool.define(
  "write",
  Effect.gen(function* () {
    const lsp = yield* LSP.Service
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    const format = yield* Format.Service
    const plugin = yield* Plugin.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: { content: string; filePath: string }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const filepath = path.isAbsolute(params.filePath)
            ? params.filePath
            : path.join(instance.directory, params.filePath)
          yield* assertExternalDirectoryEffect(ctx, filepath)

          const exists = yield* fs.existsSafe(filepath)
          const source = exists ? yield* Bom.readFile(fs, filepath) : { bom: false, text: "" }
          const next = Bom.split(params.content)
          const desiredBom = source.bom || next.bom
          const contentOld = source.text
          const contentNew = next.text

          const diff = trimDiff(createTwoFilesPatch(filepath, filepath, contentOld, contentNew))
          
          // Run prewrite scanners
          console.log("🔍 [SCAN] Running pre-write security scans...")
          console.log("🔍 [SCAN] Checking for: secrets, licenses, vulnerabilities")
          const scanStartTime = Date.now()
          const scanOutput: { prewriteScan?: { status: string; findings: any[] } } = {}
          yield* plugin.trigger("prewrite_scan", { diff, user: ctx.user, workspace: instance.directory }, scanOutput)
          const scanResult = scanOutput.prewriteScan
          const scanDuration = Date.now() - scanStartTime
          console.log(`✓ [SCAN] Security scan completed in ${scanDuration}ms`)

          // Handle scan results and log
          if (scanResult && scanResult.status !== "pass") {
            console.log(`⚠️  [SCAN] Status: ${scanResult.status.toUpperCase()} - Found ${scanResult.findings.length} issue(s)`)
            const scanFindings = scanResult.findings.map((f: any) => 
              `  [${f.scanner}] ${f.path}:${f.line} - ${f.reason}${f.match ? ` (${f.match})` : ""}`
            ).join("\n")
            console.log("📋 [SCAN] Findings:\n" + scanFindings)
            
            if (scanResult.status === "fail") {
              console.log("🛑 [SCAN] BLOCKED - Critical security issues detected")
              // Log blocked write
              logScanResult({
                timestamp: new Date().toISOString(),
                filepath,
                user: ctx.user,
                workspace: instance.directory,
                scanResult,
                action: "blocked",
              })
              
              // Block the write on scan failure
              yield* ctx.ask({
                permission: "scan_override",
                patterns: [path.relative(instance.worktree, filepath)],
                always: [],
                metadata: {
                  filepath,
                  diff,
                  scanResult,
                  scanFindings,
                  blocked: true,
                },
              })
              
              // Log override if user proceeded
              logScanResult({
                timestamp: new Date().toISOString(),
                filepath,
                user: ctx.user,
                workspace: instance.directory,
                scanResult,
                action: "overridden",
                overrideReason: "User manually overrode blocked scan",
              })
              console.log("✓ [SCAN] User overrode blocked scan - continuing with write")
            } else if (scanResult.status === "warn") {
              console.log("⚠️  [SCAN] WARNING - Potential security issues detected")
              // Request override for warnings
              yield* ctx.ask({
                permission: "scan_override",
                patterns: [path.relative(instance.worktree, filepath)],
                always: [],
                metadata: {
                  filepath,
                  diff,
                  scanResult,
                  scanFindings,
                  blocked: false,
                },
              })
              
              // Log warning override
              logScanResult({
                timestamp: new Date().toISOString(),
                filepath,
                user: ctx.user,
                workspace: instance.directory,
                scanResult,
                action: "overridden",
                overrideReason: "User overrode warnings",
              })
              console.log("✓ [SCAN] User overrode warnings - continuing with write")
            }
          } else if (scanResult) {
            console.log("✅ [SCAN] PASSED - No security issues detected")
            // Log successful scan
            logScanResult({
              timestamp: new Date().toISOString(),
              filepath,
              user: ctx.user,
              workspace: instance.directory,
              scanResult,
              action: "passed",
            })
          }

          yield* ctx.ask({
            permission: "edit",
            patterns: [path.relative(instance.worktree, filepath)],
            always: ["*"],
            metadata: {
              filepath,
              diff,
            },
          })

          yield* fs.writeWithDirs(filepath, Bom.join(contentNew, desiredBom))
          if (yield* format.file(filepath)) {
            yield* Bom.syncFile(fs, filepath, desiredBom)
          }
          yield* events.publish(FileSystem.Event.Edited, { file: filepath })
          yield* events.publish(Watcher.Event.Updated, {
            file: filepath,
            event: exists ? "change" : "add",
          })

          let output = "Wrote file successfully."
          
          // Add scan summary to output
          if (scanResult) {
            output += `\n\n🔍 Security Scan: ${scanResult.status.toUpperCase()}`
            if (scanResult.findings.length > 0) {
              output += ` (${scanResult.findings.length} finding(s))`
            }
            output += ` - completed in ${scanDuration}ms`
          }
          
          yield* lsp.touchFile(filepath, "document")
          const diagnostics = yield* lsp.diagnostics()
          const normalizedFilepath = FSUtil.normalizePath(filepath)
          let projectDiagnosticsCount = 0
          for (const [file, issues] of Object.entries(diagnostics)) {
            const current = file === normalizedFilepath
            if (!current && projectDiagnosticsCount >= MAX_PROJECT_DIAGNOSTICS_FILES) continue
            const block = LSP.Diagnostic.report(current ? filepath : file, issues)
            if (!block) continue
            if (current) {
              output += `\n\nLSP errors detected in this file, please fix:\n${block}`
              continue
            }
            projectDiagnosticsCount++
            output += `\n\nLSP errors detected in other files:\n${block}`
          }

          return {
            title: path.relative(instance.worktree, filepath),
            metadata: {
              diagnostics,
              filepath,
              exists: exists,
            },
            output,
          }
        }).pipe(Effect.orDie),
    }
  }),
)

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
import { severityDisplay } from "@/scanners"
import { getLifecyclePipeline } from "@/lifecycle/pipeline"
import { sha256 } from "@/lifecycle/repository"

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
          const scanStartTime = Date.now()
          const scanOutput: { prewriteScan?: { status: string; findings: any[] } } = {}
          yield* plugin.trigger("prewrite_scan", { diff, user: ctx.user, workspace: instance.directory }, scanOutput)
          const scanResult = scanOutput.prewriteScan
          const scanDuration = Date.now() - scanStartTime

          // Track suggestion lifecycle - record as proposed after scan completes
          let suggestionId: string | undefined
          if (scanResult) {
            try {
              const lifecycle = getLifecyclePipeline(instance.directory)
              suggestionId = lifecycle.recordProposed({
                sessionId: ctx.sessionID,
                model: "unknown", // TODO: Get from context
                provider: "unknown", // TODO: Get from context
                promptHash: sha256(JSON.stringify({ content: params.content, filePath: params.filePath })),
                userIdentity: ctx.user,
                scanStatus: scanResult.status,
                scanFindings: scanResult.findings,
                files: [{
                  filePath: filepath,
                  oldContent: contentOld || undefined,
                  newContent: contentNew,
                  diffText: diff,
                }],
              })
            } catch (error) {
              // Never fail the write due to lifecycle tracking errors
              console.error("Failed to record suggestion:", error)
            }
          }

          // Handle scan results and log
          if (scanResult && scanResult.status !== "pass") {
            const scanFindings = scanResult.findings.map((f: any) => 
              `  [${f.scanner}] ${f.path}:${f.line} - ${f.reason}${f.match ? ` (${f.match})` : ""}`
            ).join("\n")
            
            if (scanResult.status === "fail") {
              // Log blocked write
              logScanResult({
                timestamp: new Date().toISOString(),
                filepath,
                user: ctx.user,
                workspace: instance.directory,
                scanResult,
                action: "blocked",
              })
              
              // Block the write on scan failure - require explicit override
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
              }).pipe(
                Effect.tap(() =>
                  Effect.sync(() => {
                    // Log override only if permission was granted
                    logScanResult({
                      timestamp: new Date().toISOString(),
                      filepath,
                      user: ctx.user,
                      workspace: instance.directory,
                      scanResult,
                      action: "overridden",
                      overrideReason: "User manually overrode blocked scan",
                    })
                  })
                ),
                Effect.tapError(() =>
                  Effect.sync(() => {
                    // Log rejection if permission was denied
                    logScanResult({
                      timestamp: new Date().toISOString(),
                      filepath,
                      user: ctx.user,
                      workspace: instance.directory,
                      scanResult,
                      action: "rejected",
                      overrideReason: "User rejected scan override",
                    })
                    
                    // Mark suggestion as discarded for user rejection
                    if (suggestionId) {
                      try {
                        const lifecycle = getLifecyclePipeline(instance.directory)
                        lifecycle.discardForUserRejection(suggestionId)
                      } catch (error) {
                        console.error("Failed to mark suggestion as discarded:", error)
                      }
                    }
                  })
                )
              )
            } else if (scanResult.status === "warn") {
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
              }).pipe(
                Effect.tap(() =>
                  Effect.sync(() => {
                    // Log override only if permission was granted
                    logScanResult({
                      timestamp: new Date().toISOString(),
                      filepath,
                      user: ctx.user,
                      workspace: instance.directory,
                      scanResult,
                      action: "overridden",
                      overrideReason: "User overrode warnings",
                    })
                  })
                ),
                Effect.tapError(() =>
                  Effect.sync(() => {
                    // Log rejection if permission was denied
                    logScanResult({
                      timestamp: new Date().toISOString(),
                      filepath,
                      user: ctx.user,
                      workspace: instance.directory,
                      scanResult,
                      action: "rejected",
                      overrideReason: "User rejected warnings",
                    })
                    
                    // Mark suggestion as discarded for user rejection
                    if (suggestionId) {
                      try {
                        const lifecycle = getLifecyclePipeline(instance.directory)
                        lifecycle.discardForUserRejection(suggestionId)
                      } catch (error) {
                        console.error("Failed to mark suggestion as discarded:", error)
                      }
                    }
                  })
                )
              )
            }
          } else if (scanResult) {
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

          // Mark suggestion as accepted after successful write
          if (suggestionId) {
            try {
              const lifecycle = getLifecyclePipeline(instance.directory)
              lifecycle.acceptSuggestion(suggestionId)
            } catch (error) {
              console.error("Failed to mark suggestion as accepted:", error)
            }
          }

          let output = "Wrote file successfully."
          
          // Add comprehensive scan report to output
          if (scanResult) {
            output += `\n\n${"=".repeat(60)}`
            output += `\n🔍 PRE-WRITE SECURITY SCAN REPORT`
            output += `\n${"=".repeat(60)}`
            output += `\nScan Duration: ${scanDuration}ms`
            output += `\nStatus: ${scanResult.status === "pass" ? "✅ PASS" : scanResult.status === "warn" ? "⚠️  WARN" : "🛑 FAIL"}`
            output += `\nFindings: ${scanResult.findings.length}`
            
            if (scanResult.findings.length > 0) {
              output += `\n\n--- Detailed Findings (sorted by severity) ---`
              
              // Group findings by severity level
              const bySeverity: Record<string, any[]> = {
                critical: [],
                high: [],
                medium: [],
                low: [],
              }
              scanResult.findings.forEach((f: any) => {
                if (bySeverity[f.severity]) {
                  bySeverity[f.severity].push(f)
                }
              })
              
              // Display findings grouped by severity
              for (const [severity, findings] of Object.entries(bySeverity)) {
                if (findings.length === 0) continue
                
                const severityInfo = severityDisplay[severity as keyof typeof severityDisplay]
                output += `\n\n${severityInfo.emoji} ${severityInfo.label} (${findings.length} issue(s)) - ${severityInfo.description}`
                
                findings.forEach((f: any, idx: number) => {
                  output += `\n  ${idx + 1}. [${f.scanner.toUpperCase()}] Line ${f.line || "?"}: ${f.reason}`
                  if (f.match) output += `\n     Match: "${f.match}"`
                })
              }
              
              // Summary message
              const criticalCount = bySeverity.critical.length
              const highCount = bySeverity.high.length
              
              if (scanResult.status === "fail") {
                output += `\n\n🛑 CRITICAL: This write contained ${criticalCount} critical and ${highCount} high severity issues.`
                output += `\n   User override was required to proceed.`
              } else if (scanResult.status === "warn") {
                output += `\n\n⚠️  WARNING: Review findings carefully. User override was required.`
              }
            } else {
              output += `\n✅ No security issues detected.`
            }
            
            output += `\n${"=".repeat(60)}`
            
            // Add suggestion ID footer for lifecycle tracking
            if (suggestionId) {
              const shortId = suggestionId.substring(0, 8)
              output += `\n\n📋 Suggestion ID: ${shortId}`
              output += `\n   Track lifecycle: opencode lifecycle inspect ${shortId}`
            }
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

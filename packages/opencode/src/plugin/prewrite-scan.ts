import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { runScanners } from "../scanners"
import { computeUnifiedDiff } from "@/util/diff"

export async function PrewriteScanPlugin(_input: PluginInput): Promise<Hooks> {
  // Register a non-blocking hook `prewrite_scan` that scanners or callers
  // can invoke via the plugin trigger. This hook attaches the scan result
  // to the output object under `prewriteScan` so callers can decide how
  // to enforce policies (fail/warn/pass).
  const hook: any = {
    async prewrite_scan(input: any, output: any) {
      try {
        // Input may include a `diff` string or a `proposedFiles` tree.
        const diff = input.diff ?? (input.proposedFiles ? computeUnifiedDiff(input.originalFiles ?? [], input.proposedFiles) : "")
        const result = await runScanners(diff, { user: input.user, workspace: input.workspace })
        // Attach the result to the output for inspection by the caller.
        output.prewriteScan = result
      } catch (err) {
        // Do not throw — make this plugin tolerant. Caller may decide
        // to treat missing results as a failure.
        output.prewriteScan = { status: "error", findings: [{ reason: String(err) }] }
      }
    },
  }

  return hook as unknown as Hooks
}

export default PrewriteScanPlugin

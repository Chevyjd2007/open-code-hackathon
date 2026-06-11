import { For } from "solid-js"
import type { JSX } from "solid-js"
import { useTheme, tint } from "../context/theme"

export default function PrewriteScan(props: { result: any; onApprove?: (reason: string) => void }): JSX.Element {
  const { theme } = useTheme()

  const colorFor = (status: string) => {
    if (status === "fail") return theme.danger
    if (status === "warn") return theme.warning
    return theme.success
  }

  return (
    <box padding={1} borderStyle="single">
      <box>
        <text fg={theme.textMuted}>Pre-write Scan</text>
      </box>
      <box>
        <text fg={theme.text}>Status: </text>
        <text fg={colorFor(props.result?.status ?? "pass")}>{props.result?.status ?? "pass"}</text>
      </box>
      <box height={1} />
      <For each={props.result?.findings ?? []}>
        {(f: any) => (
          <box>
            <text fg={theme.textMuted}>{f.path}:{f.line} </text>
            <text fg={theme.text}>{f.reason}</text>
            <text fg={theme.textMuted}> {f.match}</text>
          </box>
        )}
      </For>
    </box>
  )
}

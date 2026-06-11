export function computeUnifiedDiff(_originalFiles: Array<{ path: string; content: string }>, proposedFiles: any): string {
  // Minimal unified-diff serializer for plugin use. If the caller already
  // provides a diff string, return it. If proposedFiles is an array of
  // file objects, serialize a simple pseudo-unified diff for scanners.
  if (!proposedFiles) return ""
  if (typeof proposedFiles === "string") return proposedFiles
  if (Array.isArray(proposedFiles)) {
    return proposedFiles
      .map((f: any) => `--- a/${f.path}\n+++ b/${f.path}\n@@\n${f.content}\n`)
      .join("\n")
  }
  try {
    return JSON.stringify(proposedFiles)
  } catch {
    return String(proposedFiles)
  }
}

export default computeUnifiedDiff

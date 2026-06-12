const logo = {
  left: ["                   ", "█▀▀█ █▀▀█ █▀▀█ █▀▀▄", "█__█ █__█ █^^^ █__█", "▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀~~▀"],
  right: ["             ▄     ", "█▀▀▀ █▀▀█ █▀▀█ █▀▀█", "█___ █__█ █__█ █^^^", "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀"],
}

// Chase-inspired palette (approximate)
const reset = "\x1b[0m"
const bold = "\x1b[1m"
const dim = "\x1b[2m"
const chasePrimary = "\x1b[38;2;10;71;161m" // deep Chase blue
const chasePrimaryBg = "\x1b[48;2;10;71;161m"
const chaseLight = "\x1b[38;2;79;143;255m" // highlight
const chaseShadow = "\x1b[38;2;4;47;110m" // darker shadow
const muted = "\x1b[90m"

function wordmark(pad = "") {
  const draw = (line: string, fg: string, shadow: string, bg: string) =>
    [...line]
      .map((char) => {
        if (char === "_") return `${bg} ${reset}`
        if (char === "^") return `${fg}${bg}▀${reset}`
        if (char === "~") return `${shadow}▀${reset}`
        if (char === " ") return " "
        return `${fg}${char}${reset}`
      })
      .join("")

  return logo.left.map((line, index) => {
    const left = draw(line, chasePrimary, chaseShadow, chasePrimaryBg)
    const right = draw(logo.right[index] ?? "", bold + chaseLight, chaseShadow, chasePrimaryBg)
    return `${pad}${left} ${right}`
  })
}

export function sessionEpilogue(input: { title: string; sessionID?: string }) {
  const weak = (text: string) => `${dim}${text.padEnd(10, " ")}${reset}`
  return [
    ...wordmark("  "),
    "",
    `  ${weak("Session")}${bold}${input.title}${reset}`,
    `  ${weak("Continue")}${bold}opencode -s ${input.sessionID}${reset}`,
    "",
  ].join("\n")
}

/**
 * The sums behind a graph block: what each typed line means, the letters that
 * get a slider, the curve's points, the grid's steps, and the block's
 * Markdown. Nothing here draws; the graph view does. mathjs is passed in, so
 * the app loads it only when a graph is on screen (as the calculator does).
 */
import type { MathJsInstance, MathNode, EvalFunction } from "mathjs"

export type GraphLine = { id: string; text: string; color: string }
export type Slider = { value: number; min: number; max: number }
export type View = { xmin: number; xmax: number; ymin: number; ymax: number }

/** The theme's chip colours, in the order new lines take them. */
export const COLORS = ["blue", "red", "green", "purple", "orange", "pink", "brown", "yellow"] as const

export const DEFAULT_VIEW: View = { xmin: -10, xmax: 10, ymin: -6, ymax: 6 }
export const DEFAULT_SLIDER: Slider = { value: 1, min: -10, max: 10 }

export const colorFor = (index: number): string => COLORS[index % COLORS.length]
export const newLine = (index: number, text = ""): GraphLine => ({ id: Math.random().toString(36).slice(2, 9), text, color: colorFor(index) })

/** What a line asks to be drawn as. */
export type Meaning =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  /** y = f(x), or x = g(y) when `over` is "y". */
  | { kind: "explicit"; over: "x" | "y"; f: EvalFunction; tex: string; free: string[] }
  /** F(x, y) = 0, drawn where F changes sign. */
  | { kind: "implicit"; f: EvalFunction; tex: string; free: string[] }
  /** `a = 2`: a slider's own line, nothing to draw. */
  | { kind: "constant"; name: string; value: number; tex: string }

const PRETTY: Array<[RegExp, string]> = [[/π/g, "pi"], [/[·×]/g, "*"], [/[−–]/g, "-"], [/÷/g, "/"], [/√/g, "sqrt"], [/²/g, "^2"], [/³/g, "^3"], [/≤/g, "<="], [/≥/g, ">="]]

/** Constants mathjs knows that are not sliders. */
const KNOWN = new Set(["pi", "e", "E", "PI", "tau", "phi", "Infinity", "NaN"])

/**
 * What a person types, as mathjs reads it: `2x`, `ax^2` and `xy` multiply, as
 * on Desmos, unless the letters spell a function or a constant mathjs knows.
 */
export function tidy(math: MathJsInstance, text: string): string {
  let out = text
  for (const [from, to] of PRETTY) out = out.replace(from, to)
  return out.replace(/[A-Za-z]{2,}/g, (word) =>
    KNOWN.has(word) || typeof (math as unknown as Record<string, unknown>)[word] === "function" ? word : word.split("").join(" "))
}

/** The letters in a formula that are neither x, y, a constant nor a function. */
export function freeLetters(node: MathNode): string[] {
  const found = new Set<string>()
  node.traverse((part, path, parent) => {
    if (part.type !== "SymbolNode") return
    if (parent?.type === "FunctionNode" && path === "fn") return
    const name = (part as unknown as { name: string }).name
    if (name !== "x" && name !== "y" && !KNOWN.has(name)) found.add(name)
  })
  return [...found].sort()
}

const uses = (node: MathNode, letter: string): boolean =>
  node.filter((part) => part.type === "SymbolNode" && (part as unknown as { name: string }).name === letter).length > 0

const texOf = (node: MathNode): string => node.toTex({ parenthesis: "auto", implicit: "hide" }).trim()

/** Read one typed line. */
export function meaningOf(math: MathJsInstance, text: string): Meaning {
  const typed = text.trim()
  if (!typed) return { kind: "empty" }
  try {
    const sides = tidy(math, typed).split(/(?<![<>=!])=(?!=)/)
    if (sides.length > 2) return { kind: "error", message: "One “=” per line" }
    if (sides.length === 1) {
      const right = math.parse(sides[0])
      if (uses(right, "y")) return { kind: "error", message: "Add “= …” to draw a curve in x and y" }
      return { kind: "explicit", over: "x", f: right.compile(), tex: `y=${texOf(right)}`, free: freeLetters(right) }
    }
    const left = math.parse(sides[0])
    const right = math.parse(sides[1])
    const name = left.type === "SymbolNode" ? (left as unknown as { name: string }).name : null
    const tex = `${texOf(left)}=${texOf(right)}`
    // `a = 2`: a value for a letter, the way Desmos makes a slider.
    if (name && name !== "x" && name !== "y" && right.type === "ConstantNode") return { kind: "constant", name, value: Number(right.evaluate()), tex }
    if (name === "y" && !uses(right, "y")) return { kind: "explicit", over: "x", f: right.compile(), tex, free: freeLetters(right) }
    if (name === "x" && !uses(right, "x")) return { kind: "explicit", over: "y", f: right.compile(), tex, free: freeLetters(right) }
    const otherName = right.type === "SymbolNode" ? (right as unknown as { name: string }).name : null
    if (otherName === "y" && !uses(left, "y")) return { kind: "explicit", over: "x", f: left.compile(), tex, free: freeLetters(left) }
    const whole = new math.OperatorNode("-", "subtract", [left, new math.ParenthesisNode(right)])
    return { kind: "implicit", f: whole.compile(), tex, free: freeLetters(whole) }
  } catch (error) {
    return { kind: "error", message: (error as Error).message.replace(/\s*\(char \d+\)/, "") }
  }
}

/** A number from mathjs, or NaN for anything else (a complex root, a unit). */
export const numberOf = (value: unknown): number => (typeof value === "number" ? value : NaN)

/**
 * Points along y = f(x) (or x = f(y)), one per pixel, cut where the curve
 * leaves the real numbers or leaps (tan at π/2) so no line joins the pieces.
 */
export function sampleCurve(f: (t: number) => number, from: number, to: number, steps: number, jump: number): Array<Array<[number, number]>> {
  const pieces: Array<Array<[number, number]>> = []
  let piece: Array<[number, number]> = []
  for (let i = 0; i <= steps; i += 1) {
    const t = from + ((to - from) * i) / steps
    const value = f(t)
    if (!Number.isFinite(value)) {
      if (piece.length) pieces.push(piece)
      piece = []
      continue
    }
    const last = piece[piece.length - 1]
    if (last && Math.abs(value - last[1]) > jump) {
      pieces.push(piece)
      piece = []
    }
    piece.push([t, value])
  }
  if (piece.length) pieces.push(piece)
  return pieces.filter((one) => one.length > 1)
}

/**
 * Where F(x, y) = 0 crosses a grid of cells (marching squares), as short
 * segments in the graph's own numbers. A cell whose corners leap in sign
 * across a pole (1/x = y) is left out, so no wall is drawn at the pole.
 */
export function contour(f: (x: number, y: number) => number, view: View, cols: number, rows: number): Array<[number, number, number, number]> {
  const dx = (view.xmax - view.xmin) / cols
  const dy = (view.ymax - view.ymin) / rows
  const values = new Float64Array((cols + 1) * (rows + 1))
  for (let j = 0; j <= rows; j += 1) for (let i = 0; i <= cols; i += 1) values[j * (cols + 1) + i] = f(view.xmin + i * dx, view.ymin + j * dy)
  const out: Array<[number, number, number, number]> = []
  const at = (i: number, j: number): number => values[j * (cols + 1) + i]
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1)
      if (![a, b, c, d].every(Number.isFinite)) continue
      const x0 = view.xmin + i * dx, y0 = view.ymin + j * dy
      // Where the sign changes along each edge, found by straight-line guess.
      const cross: Array<[number, number]> = []
      const edge = (p: number, q: number, ax: number, ay: number, bx: number, by: number): void => {
        if ((p < 0) === (q < 0)) return
        const k = p / (p - q)
        cross.push([ax + (bx - ax) * k, ay + (by - ay) * k])
      }
      edge(a, b, x0, y0, x0 + dx, y0)
      edge(b, c, x0 + dx, y0, x0 + dx, y0 + dy)
      edge(c, d, x0 + dx, y0 + dy, x0, y0 + dy)
      edge(d, a, x0, y0 + dy, x0, y0)
      // A pole, not a curve: the values either side are far apart against their size.
      const spread = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d))
      const near = Math.min(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d))
      if (spread > 1e3 * Math.max(near, 1e-9) && spread > 50 * (Math.abs(dx) + Math.abs(dy))) continue
      if (cross.length === 2) out.push([cross[0][0], cross[0][1], cross[1][0], cross[1][1]])
      else if (cross.length === 4) {
        out.push([cross[0][0], cross[0][1], cross[1][0], cross[1][1]])
        out.push([cross[2][0], cross[2][1], cross[3][0], cross[3][1]])
      }
    }
  }
  return out
}

/** A round step for grid lines about `px` pixels apart: 1, 2 or 5 times a power of ten. */
export function niceStep(span: number, pixels: number, px = 90): number {
  const raw = (span * px) / Math.max(1, pixels)
  const power = 10 ** Math.floor(Math.log10(raw))
  const unit = raw / power
  return (unit < 1.5 ? 1 : unit < 3.5 ? 2 : unit < 7.5 ? 5 : 10) * power
}

/** A tick's words: no float dust (0.30000000000000004), and π not attempted. */
export function tickLabel(value: number, step: number): string {
  if (Math.abs(value) < step / 1e6) return "0"
  const places = Math.max(0, -Math.floor(Math.log10(step) + 1e-9))
  const big = Math.abs(value) >= 1e6 || (Math.abs(value) < 1e-4)
  return (big ? value.toExponential(1) : value.toFixed(places)).replace("-", "−")
}

/** The same box seen through a window of another shape: equal units on both axes, centred where it was. */
export function fitView(view: View, width: number, height: number): View {
  // Equal units both ways (a circle stays round), and the whole of the saved view in sight: the axis with room to spare
  // widens about its middle, never the other way round, which cut an orbit's top and bottom off.
  const w = Math.max(1, width), h = Math.max(1, height)
  const spanX = view.xmax - view.xmin, spanY = view.ymax - view.ymin
  const perPx = Math.max(spanX / w, spanY / h)
  const cx = (view.xmin + view.xmax) / 2, cy = (view.ymin + view.ymax) / 2
  return { xmin: cx - (perPx * w) / 2, xmax: cx + (perPx * w) / 2, ymin: cy - (perPx * h) / 2, ymax: cy + (perPx * h) / 2 }
}

/** Zoom by `factor` (under 1 closer) keeping the point (px, py) still. */
export function zoomAt(view: View, factor: number, px: number, py: number): View {
  return {
    xmin: px + (view.xmin - px) * factor,
    xmax: px + (view.xmax - px) * factor,
    ymin: py + (view.ymin - py) * factor,
    ymax: py + (view.ymax - py) * factor,
  }
}

const num = (value: number): string => String(Number(value.toPrecision(6)))

/**
 * The block as a fenced ```graph block: a line per formula (its colour in
 * braces), a line per slider with its range, then the view. Readable as it
 * stands, and read back to the same graph.
 */
export function graphToMarkdown(lines: GraphLine[], sliders: Record<string, Slider>, view: View | null, size?: { width?: string | null; height?: number }): string {
  const body = lines.filter((line) => line.text.trim()).map((line) => `${line.text.trim()} {${line.color}}`)
  for (const [name, one] of Object.entries(sliders)) body.push(`${name} = ${num(one.value)} (${num(one.min)} to ${num(one.max)})`)
  if (view) body.push(`view: ${num(view.xmin)}, ${num(view.xmax)}, ${num(view.ymin)}, ${num(view.ymax)}`)
  // Only when not the default: the column's width, 320 high.
  if (size && (size.width || (size.height && size.height !== 320))) body.push(`size: ${size.width ?? "100%"}, ${size.height ?? 320}`)
  return ["```graph", ...body, "```"].join("\n")
}

const NUMBER = "(-?\\d+(?:\\.\\d+)?(?:e-?\\d+)?)"
const SLIDER = new RegExp(`^([A-Za-z])\\s*=\\s*${NUMBER}\\s*\\(\\s*${NUMBER}\\s+to\\s+${NUMBER}\\s*\\)$`)
const VIEW = new RegExp(`^view:\\s*${NUMBER}\\s*,\\s*${NUMBER}\\s*,\\s*${NUMBER}\\s*,\\s*${NUMBER}$`)
const SIZE = /^size:\s*(\d+)%\s*,\s*(\d+)$/

/** A ```graph block's lines, back into the block's attributes. */
export function graphFromMarkdown(source: string): { expressions: GraphLine[]; sliders: Record<string, Slider>; view: View | null; width?: string | null; height?: number } {
  const expressions: GraphLine[] = []
  const sliders: Record<string, Slider> = {}
  let view: View | null = null
  const size: { width?: string | null; height?: number } = {}
  for (const raw of source.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    const sized = SIZE.exec(line)
    if (sized) {
      size.width = sized[1] === "100" ? null : `${sized[1]}%`
      size.height = Math.max(160, Number(sized[2]))
      continue
    }
    const box = VIEW.exec(line)
    if (box) {
      view = { xmin: Number(box[1]), xmax: Number(box[2]), ymin: Number(box[3]), ymax: Number(box[4]) }
      continue
    }
    const slider = SLIDER.exec(line)
    if (slider) {
      sliders[slider[1]] = { value: Number(slider[2]), min: Number(slider[3]), max: Number(slider[4]) }
      continue
    }
    const colored = /^(.*?)\s*\{([a-z]+)\}$/.exec(line)
    const text = colored && (COLORS as readonly string[]).includes(colored[2]) ? colored[1] : line
    const color = colored && text === colored[1] ? colored[2] : colorFor(expressions.length)
    expressions.push({ ...newLine(expressions.length, text), color })
  }
  return { expressions, sliders, view, ...size }
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { NodeViewWrapper, useEditorState, type NodeViewProps } from "@tiptap/react"
import type { MathJsInstance } from "mathjs"

import katex from "@/lib/shims/katex"
import { chime } from "@/lib/sound"
import { Slider as SliderControl } from "@/components/ui/slider"
import { Plus } from "lucide-react"
import { X } from "@/components/ui/icons"
import { Tip } from "@/components/haligtree/ui"
import {
  COLORS, DEFAULT_SLIDER, DEFAULT_VIEW, contour, fitView, meaningOf, newLine, niceStep, numberOf, sampleCurve, tickLabel, zoomAt,
  type GraphLine, type Meaning, type Slider, type View,
} from "@/lib/graph-math"

/** mathjs, loaded the first time a graph is on screen (as the calculator loads it). */
let shared: MathJsInstance | null = null
const loadMath = (): Promise<MathJsInstance> => import("mathjs").then(({ create, all }) => (shared ??= create(all)))

const WIDTHS = [{ label: "S", width: "35%" }, { label: "M", width: "60%" }, { label: "L", width: null }] as const
const MIN_HEIGHT = 160

/** A formula drawn by the app's own KaTeX, the same as its Math blocks. */
function Tex({ tex }: { tex: string }): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    if (ref.current) katex.render(tex, ref.current, { throwOnError: false })
  }, [tex])
  return <span ref={ref} className="mf-graph-tex" />
}

const ink = (style: CSSStyleDeclaration, name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback

export function GraphView(props: NodeViewProps): React.JSX.Element {
  const { node, editor } = props
  const lines = node.attrs.expressions as GraphLine[]
  const sliders = node.attrs.sliders as Record<string, Slider>
  const stored = (node.attrs.view as View | null) ?? DEFAULT_VIEW
  const [math, setMath] = useState<MathJsInstance | null>(shared)
  useEffect(() => void (math || loadMath().then(setMath)), [math])

  const [editing, setEditing] = useState<string | null>(null)
  // Held here while a hand is on the plot, so a drag is not a transaction per pixel.
  const [live, setLive] = useState<View | null>(null)
  const [height, setHeight] = useState<number | null>(null)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [themeTick, setThemeTick] = useState(0)

  const selected = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      const pos = props.getPos()
      if (typeof pos !== "number") return false
      const { from, to } = ed.state.selection
      return from <= pos && to >= pos + node.nodeSize
    },
  })

  const meanings = useMemo(() => new Map<string, Meaning>(math ? lines.map((line) => [line.id, meaningOf(math, line.text)]) : []), [math, lines])
  const constants = useMemo(() => {
    const out: Record<string, number> = {}
    for (const one of meanings.values()) if (one.kind === "constant") out[one.name] = one.value
    return out
  }, [meanings])
  /** Letters that want a slider: free in some line, not given a value by another. */
  const wanted = useMemo(() => {
    const out = new Set<string>()
    for (const one of meanings.values()) if (one.kind === "explicit" || one.kind === "implicit") for (const name of one.free) if (!(name in constants)) out.add(name)
    return [...out].sort()
  }, [meanings, constants])

  /** Writes the block's values, one Undo step a change. A view moved is not an edit, so it skips Undo. */
  const write = useCallback((attrs: Record<string, unknown>, history = true): void => {
    const pos = props.getPos()
    if (typeof pos !== "number") return
    const tr = editor.state.tr
    for (const [key, value] of Object.entries(attrs)) tr.setNodeAttribute(pos, key, value)
    if (!history) tr.setMeta("addToHistory", false)
    editor.view.dispatch(tr)
  }, [editor, props])

  // A new letter gets its slider; one no line uses any more goes.
  useEffect(() => {
    if (!math) return
    const next: Record<string, Slider> = {}
    for (const name of wanted) next[name] = sliders[name] ?? DEFAULT_SLIDER
    if (JSON.stringify(next) !== JSON.stringify(sliders)) write({ sliders: next }, false)
  }, [math, wanted, sliders, write])

  // The theme's colours are read off the page, so a theme change draws again.
  useEffect(() => {
    const watch = new MutationObserver(() => setThemeTick((n) => n + 1))
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme", "data-light"] })
    return () => watch.disconnect()
  }, [])

  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const element = canvas.current?.parentElement
    if (!element) return undefined
    const watch = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    watch.observe(element)
    return () => watch.disconnect()
  }, [])

  const view = fitView(live ?? stored, size.width, size.height)
  const shownHeight = height ?? (node.attrs.height as number)

  // From the graph's numbers to the canvas's pixels and back.
  const toPx = (x: number, y: number): [number, number] => [((x - view.xmin) / (view.xmax - view.xmin)) * size.width, ((view.ymax - y) / (view.ymax - view.ymin)) * size.height]
  const fromPx = (px: number, py: number): [number, number] => [view.xmin + (px / size.width) * (view.xmax - view.xmin), view.ymax - (py / size.height) * (view.ymax - view.ymin)]

  const scope = useMemo(() => {
    const out: Record<string, number> = { ...constants }
    for (const name of wanted) out[name] = (sliders[name] ?? DEFAULT_SLIDER).value
    return out
  }, [constants, wanted, sliders])

  /** What the hover snaps to: the nearest curve in x within 10px. */
  const snap = useMemo(() => {
    if (!hover || !size.width) return null
    const [x, y] = fromPx(hover.x, hover.y)
    let best: { x: number; y: number; color: string; gap: number } | null = null
    for (const line of lines) {
      const one = meanings.get(line.id)
      if (one?.kind !== "explicit") continue
      const at = one.over === "x" ? x : y
      let value = NaN
      try { value = numberOf(one.f.evaluate({ ...scope, [one.over]: at })) } catch { /* outside its domain */ }
      if (!Number.isFinite(value)) continue
      const point = one.over === "x" ? { x, y: value } : { x: value, y }
      const [px, py] = toPx(point.x, point.y)
      const gap = Math.hypot(px - hover.x, py - hover.y)
      if (gap < 10 && (!best || gap < best.gap)) best = { ...point, color: line.color, gap }
    }
    return best
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover, lines, meanings, scope, view.xmin, view.xmax, view.ymin, view.ymax, size.width])

  // The drawing: grid, axes and their numbers, then each line's curve.
  useEffect(() => {
    const element = canvas.current
    if (!element || !size.width || !size.height) return
    const ratio = window.devicePixelRatio || 1
    element.width = Math.round(size.width * ratio)
    element.height = Math.round(size.height * ratio)
    const ctx = element.getContext("2d")
    if (!ctx) return
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, size.width, size.height)
    const style = getComputedStyle(element)
    const text = style.color
    const font = style.fontFamily
    const step = niceStep(view.xmax - view.xmin, size.width, 70)
    const minor = step / (String(step).replace(/[0.]/g, "").startsWith("2") ? 4 : 5)

    // Grid: the minor lines at a breath of ink, the major ones a little more.
    const grid = (every: number, alpha: number): void => {
      ctx.globalAlpha = alpha
      ctx.strokeStyle = text
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = Math.ceil(view.xmin / every) * every; x <= view.xmax; x += every) {
        const [px] = toPx(x, 0)
        ctx.moveTo(Math.round(px) + 0.5, 0)
        ctx.lineTo(Math.round(px) + 0.5, size.height)
      }
      for (let y = Math.ceil(view.ymin / every) * every; y <= view.ymax; y += every) {
        const [, py] = toPx(0, y)
        ctx.moveTo(0, Math.round(py) + 0.5)
        ctx.lineTo(size.width, Math.round(py) + 0.5)
      }
      ctx.stroke()
    }
    grid(minor, 0.04)
    grid(step, 0.1)

    // Axes, and where they leave the view, their numbers keep to the edge.
    const [ox, oy] = toPx(0, 0)
    ctx.globalAlpha = 0.55
    ctx.beginPath()
    if (ox >= 0 && ox <= size.width) (ctx.moveTo(Math.round(ox) + 0.5, 0), ctx.lineTo(Math.round(ox) + 0.5, size.height))
    if (oy >= 0 && oy <= size.height) (ctx.moveTo(0, Math.round(oy) + 0.5), ctx.lineTo(size.width, Math.round(oy) + 0.5))
    ctx.stroke()

    ctx.globalAlpha = 0.7
    ctx.fillStyle = text
    ctx.font = `11px ${font}`
    const labelY = Math.min(Math.max(oy + 4, 4), size.height - 16)
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    for (let x = Math.ceil(view.xmin / step) * step; x <= view.xmax; x += step) {
      if (Math.abs(x) < step / 2) continue
      const [px] = toPx(x, 0)
      if (px < 12 || px > size.width - 12) continue
      ctx.fillText(tickLabel(x, step), px, labelY)
    }
    const labelX = Math.min(Math.max(ox - 5, 30), size.width - 5)
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"
    for (let y = Math.ceil(view.ymin / step) * step; y <= view.ymax; y += step) {
      if (Math.abs(y) < step / 2) continue
      const [, py] = toPx(0, y)
      if (py < 10 || py > size.height - 10) continue
      ctx.fillText(tickLabel(y, step), labelX, py)
    }
    if (ox > 0 && ox < size.width && oy > 0 && oy < size.height) ctx.fillText("0", ox - 5, oy + 10)

    // The curves.
    ctx.globalAlpha = 1
    ctx.lineWidth = 2.25
    ctx.lineJoin = "round"
    ctx.lineCap = "round"
    const paths: string[] = []
    for (const line of lines) {
      const one = meanings.get(line.id)
      if (!one || (one.kind !== "explicit" && one.kind !== "implicit")) continue
      ctx.strokeStyle = ink(style, `--mf-chip-ink-${line.color}`, text)
      ctx.beginPath()
      let drawn = 0
      const evaluate = (values: Record<string, number>): number => {
        try { return numberOf(one.f.evaluate({ ...scope, ...values })) } catch { return NaN }
      }
      if (one.kind === "explicit") {
        const across = one.over === "x"
        const span = across ? view.ymax - view.ymin : view.xmax - view.xmin
        const pieces = sampleCurve((t) => evaluate({ [one.over]: t }), across ? view.xmin : view.ymin, across ? view.xmax : view.ymax, Math.ceil((across ? size.width : size.height) * 1.5), span * 2)
        for (const piece of pieces) {
          piece.forEach(([t, value], i) => {
            const [px, py] = across ? toPx(t, value) : toPx(value, t)
            // Far off the canvas, held at its edge so a steep line still reaches it.
            const cy = Math.max(-1e4, Math.min(1e4, py)), cx = Math.max(-1e4, Math.min(1e4, px))
            if (i === 0) ctx.moveTo(cx, cy)
            else ctx.lineTo(cx, cy)
            drawn += 1
          })
        }
      } else {
        const cols = Math.max(40, Math.round(size.width / (live ? 7 : 4)))
        const rows = Math.max(30, Math.round(size.height / (live ? 7 : 4)))
        for (const [x1, y1, x2, y2] of contour((x, y) => evaluate({ x, y }), view, cols, rows)) {
          const [a, b] = toPx(x1, y1)
          const [c, d] = toPx(x2, y2)
          ctx.moveTo(a, b)
          ctx.lineTo(c, d)
          drawn += 1
        }
      }
      ctx.stroke()
      paths.push(`${line.color}:${drawn}`)
    }
    // What was drawn, for a reader without eyes on the canvas (the probe, a screen reader's summary).
    element.dataset.drawn = paths.join(" ")
    element.dataset.view = [view.xmin, view.xmax, view.ymin, view.ymax].map((n) => n.toFixed(3)).join(",")

    // The hovered point on its curve.
    delete element.dataset.hover
    if (snap) {
      const [px, py] = toPx(snap.x, snap.y)
      ctx.fillStyle = ink(style, `--mf-chip-ink-${snap.color}`, text)
      ctx.beginPath()
      ctx.arc(px, py, 4.5, 0, Math.PI * 2)
      ctx.fill()
      const label = `(${tickLabel(snap.x, 0.001)}, ${tickLabel(snap.y, 0.001)})`
      element.dataset.hover = label
      ctx.font = `600 12px ${font}`
      const w = ctx.measureText(label).width + 16
      // Beside the point, flipped to its other side near the right or top edge.
      const left = px + 10 + w > size.width - 6 ? Math.max(6, px - 10 - w) : px + 10
      const top = py - 32 < 6 ? Math.min(size.height - 28, py + 10) : py - 32
      // Opaque, in the card's own fill with one hairline, as every floating label is.
      ctx.fillStyle = ink(style, "--tt-card-bg-color", "#fff")
      ctx.strokeStyle = text
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(left + 0.5, top + 0.5, w, 22, 8)
      ctx.fill()
      ctx.globalAlpha = 0.14
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.fillStyle = text
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      ctx.fillText(label, left + 8.5, top + 12)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, view.xmin, view.xmax, view.ymin, view.ymax, lines, meanings, scope, snap, themeTick, live])

  // Pan by dragging, the view written once on letting go.
  const pan = (event: React.PointerEvent): void => {
    if (event.button !== 0) return
    event.preventDefault()
    const start = { x: event.clientX, y: event.clientY }
    const from = view
    const perX = (from.xmax - from.xmin) / size.width
    const perY = (from.ymax - from.ymin) / size.height
    let now = from
    const done = new AbortController()
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
    target.dataset.panning = ""
    window.addEventListener("pointermove", (e) => {
      const dx = (e.clientX - start.x) * perX, dy = (e.clientY - start.y) * perY
      now = { xmin: from.xmin - dx, xmax: from.xmax - dx, ymin: from.ymin + dy, ymax: from.ymax + dy }
      setLive(now)
    }, { signal: done.signal })
    window.addEventListener("pointerup", () => {
      done.abort()
      delete target.dataset.panning
      if (now !== from) write({ view: now }, false)
      setLive(null)
    }, { signal: done.signal })
  }

  // Zoom by pinch or scroll, about the point under the pointer.
  useEffect(() => {
    const element = canvas.current
    if (!element) return undefined
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const box = element.getBoundingClientRect()
      const px = event.clientX - box.left, py = event.clientY - box.top
      const v = fitView((node.attrs.view as View | null) ?? DEFAULT_VIEW, box.width, box.height)
      const x = v.xmin + (px / box.width) * (v.xmax - v.xmin)
      const y = v.ymax - (py / box.height) * (v.ymax - v.ymin)
      // A pinch arrives as small steps with ctrl held; a mouse wheel as big ones.
      const factor = Math.exp(event.deltaY * (event.ctrlKey ? 0.01 : 0.002))
      const next = zoomAt(v, Math.min(4, Math.max(0.25, factor)), x, y)
      if (next.xmax - next.xmin < 1e-6 || next.xmax - next.xmin > 1e7) return
      write({ view: next }, false)
    }
    element.addEventListener("wheel", onWheel, { passive: false })
    return () => element.removeEventListener("wheel", onWheel)
  }, [node.attrs.view, write])

  // The bottom grip: the plot's height, written on letting go.
  const resize = (event: React.PointerEvent): void => {
    event.preventDefault()
    const from = shownHeight
    const start = event.clientY
    const at = (e: PointerEvent): number => Math.max(MIN_HEIGHT, Math.round(from + e.clientY - start))
    const done = new AbortController()
    window.addEventListener("pointermove", (e) => setHeight(at(e)), { signal: done.signal })
    window.addEventListener("pointerup", (e) => {
      done.abort()
      write({ height: at(e) })
      setHeight(null)
    }, { signal: done.signal })
  }

  const setLines = (next: GraphLine[]): void => write({ expressions: next })
  const fields = useRef(new Map<string, HTMLInputElement>())
  const focusLine = (id: string | undefined): void => {
    if (!id) return
    setEditing(id)
    requestAnimationFrame(() => fields.current.get(id)?.focus())
  }
  const addLine = (after?: number): void => {
    const at = after == null ? lines.length : after + 1
    const used = new Set(lines.map((line) => line.color))
    const color = COLORS.find((one) => !used.has(one)) ?? COLORS[lines.length % COLORS.length]
    const line = { ...newLine(at), color }
    setLines([...lines.slice(0, at), line, ...lines.slice(at)])
    chime("tick")
    focusLine(line.id)
  }
  const removeLine = (id: string): void => {
    const at = lines.findIndex((line) => line.id === id)
    const next = lines.filter((line) => line.id !== id)
    setLines(next.length ? next : [newLine(0)])
    focusLine(next[Math.max(0, at - 1)]?.id)
  }
  const nextColor = (line: GraphLine): void =>
    setLines(lines.map((one) => (one.id === line.id ? { ...one, color: COLORS[(COLORS.indexOf(line.color as (typeof COLORS)[number]) + 1) % COLORS.length] } : one)))

  // A graph just made from "/" waits with its first line open.
  useEffect(() => {
    if (lines.length === 1 && !lines[0].text && editor.isEditable) focusLine(lines[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onKey = (event: React.KeyboardEvent<HTMLInputElement>, line: GraphLine, index: number): void => {
    // The note's own Undo and Redo, not the field's: every change here is one of the note's steps.
    if (event.metaKey && event.key.toLowerCase() === "z") {
      event.preventDefault()
      if (event.shiftKey) editor.commands.redo()
      else editor.commands.undo()
    } else if (event.key === "Enter") {
      event.preventDefault()
      addLine(index)
    } else if (event.key === "Backspace" && !event.currentTarget.value && lines.length > 1) {
      event.preventDefault()
      removeLine(line.id)
    } else if (event.key === "ArrowUp" && index > 0) {
      event.preventDefault()
      focusLine(lines[index - 1].id)
    } else if (event.key === "ArrowDown" && index < lines.length - 1) {
      event.preventDefault()
      focusLine(lines[index + 1].id)
    } else if (event.key === "Escape") {
      // Back to the block as a whole, picked, the way Esc leaves a picture's caption.
      event.preventDefault()
      setEditing(null)
      const pos = props.getPos()
      if (typeof pos === "number") editor.chain().focus().setNodeSelection(pos).run()
    }
  }

  const width = (node.attrs.width as string | null) ?? null
  return (
    <NodeViewWrapper className={`mf-graph${selected ? " is-selected" : ""}`} style={width ? { width } : undefined} data-graph="">
      <div className="mf-graph-frame">
        <div className="mf-graph-lines">
          {lines.map((line, index) => {
            const one = meanings.get(line.id)
            const open = editing === line.id || !line.text.trim() || one?.kind === "error"
            return (
              <div key={line.id} className="mf-graph-line" data-line={index}>
                <Tip label="Next colour">
                  <button
                    type="button"
                    className="mf-graph-swatch"
                    style={{ color: `var(--mf-chip-ink-${line.color})` }}
                    aria-label={`Colour: ${line.color}. Click for the next`}
                    onClick={() => nextColor(line)}
                  />
                </Tip>
                {open ? (
                  <input
                    ref={(element) => void (element ? fields.current.set(line.id, element) : fields.current.delete(line.id))}
                    className="mf-graph-field"
                    value={line.text}
                    spellCheck={false}
                    placeholder={index === 0 ? "y = sin(x)" : "x^2 + y^2 = 4"}
                    aria-label={`Formula ${index + 1}`}
                    onFocus={() => setEditing(line.id)}
                    onBlur={() => setEditing((now) => (now === line.id ? null : now))}
                    onChange={(event) => setLines(lines.map((other) => (other.id === line.id ? { ...other, text: event.target.value } : other)))}
                    onKeyDown={(event) => onKey(event, line, index)}
                  />
                ) : (
                  <button type="button" className="mf-graph-shown" onClick={() => focusLine(line.id)} aria-label={`Edit ${line.text}`}>
                    {one && "tex" in one ? <Tex tex={one.tex} /> : line.text}
                  </button>
                )}
                <Tip label="Remove this line">
                  <button type="button" className="mf-graph-remove" aria-label="Remove this line" onClick={() => removeLine(line.id)}>
                    <X className="size-3.5" />
                  </button>
                </Tip>
                {one?.kind === "error" && line.text.trim() && editing !== line.id && <div className="mf-graph-error">{one.message}</div>}
              </div>
            )
          })}
          {wanted.map((name) => {
            const one = sliders[name] ?? DEFAULT_SLIDER
            const step = Math.max((one.max - one.min) / 200, 1e-6)
            return (
              <div key={name} className="mf-graph-slider" data-slider={name}>
                <span className="mf-graph-slider-name"><Tex tex={`${name}=${Number(one.value.toPrecision(4))}`} /></span>
                <span className="mf-graph-slider-end">{tickLabel(one.min, step * 10)}</span>
                <SliderControl
                  aria-label={`${name}, from ${one.min} to ${one.max}`}
                  min={one.min}
                  max={one.max}
                  step={step}
                  value={[one.value]}
                  onValueChange={([value]) => write({ sliders: { ...sliders, [name]: { ...one, value } } })}
                />
                <span className="mf-graph-slider-end">{tickLabel(one.max, step * 10)}</span>
              </div>
            )
          })}
          <button type="button" className="mf-graph-add" onClick={() => addLine()}>
            <Plus className="size-3.5" /> Add a line
          </button>
        </div>
        <div className="mf-graph-plot" style={{ height: shownHeight }}>
          <canvas
            ref={canvas}
            aria-label="The graph. Drag to move, pinch or scroll to zoom, double-click to go back"
            onPointerDown={pan}
            onPointerMove={(event) => {
              const box = event.currentTarget.getBoundingClientRect()
              setHover({ x: event.clientX - box.left, y: event.clientY - box.top })
            }}
            onPointerLeave={() => setHover(null)}
            onDoubleClick={() => write({ view: DEFAULT_VIEW }, false)}
          />
          <div className="mf-graph-tools">
            {WIDTHS.map((one) => (
              <button key={one.label} type="button" data-active-state={width === one.width ? "on" : "off"} aria-label={`${one.label} width`} onClick={() => write({ width: one.width })}>
                {one.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mf-graph-grip" onPointerDown={resize} />
    </NodeViewWrapper>
  )
}

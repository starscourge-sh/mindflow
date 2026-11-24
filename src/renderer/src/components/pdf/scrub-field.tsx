import { useEffect, useRef, useState } from "react"
import { stepTap } from "@/lib/haptics"
import { chime } from "@/lib/sound"
import '@/lib/carry-cursor'

/** A number you drag sideways to change (ScrubField), drawn as Haligtree"s own field. */
export const SCRUB = "h-8 w-14 cursor-ew-resize rounded-md border border-input bg-input/20 px-2 text-center text-sm tabular-nums outline-none transition-colors focus:cursor-text focus-visible:border-foreground/25 dark:bg-input/30"

/** The quickest a step's tick repeats: a fast scrub is a soft patter, never a buzz. */
const TICK_GAP = 45
/** How far two fingers travel for one step: a Mac mouse wheel's notch (Chromium's 40px), so a notch is one step. */
const WHEEL_STEP = 40

/**
 * A typed sum, worked out: "20*2" is 40, and one that starts with a sign
 * ("+5", "-3", "*2") is worked from the value already there. mathjs, loaded
 * only when a sum is typed. Null when the words are not a number.
 */
export async function typedSum(typed: string, value: number): Promise<number | null> {
  const text = typed.trim()
  if (!text) return null
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text)
  const { evaluate } = await import("mathjs")
  try {
    const result = evaluate((/^[+\-*/×÷]/.test(text) ? `${value}${text}` : text).replace(/×/g, "*").replace(/÷/g, "/"), {})
    return typeof result === "number" && Number.isFinite(result) ? result : null
  } catch {
    return null
  }
}

/**
 * A number as Figma's number fields are (a page, a setting): press and drag
 * across it to scrub (the further from where you pressed, the faster; ⇧ ten
 * times as fast, ⌥ fine), let go to land. A plain click types a number, or a
 * sum ("+5", "20*2"), instead, and ↑ ↓ step while it has the keys (⇧ by ten).
 * Two fingers (or a mouse wheel) over it step it too, either way, ⇧ by ten,
 * and the page behind stays put. Each step taps the trackpad lightly; the
 * first and last, any of `marks` (a chapter's start), and the value it
 * showed as you came to it, firmly. `shiftBy` is what ⇧ steps by (a week
 * of days is 7), and a ⇧-drag lands on whole steps of it from where it was
 * pressed. `onSettle` is told once a change is let go of (the drag ends, the
 * typed number is kept, the field is left), for a caller that saves once.
 */
export function ScrubField({ value, max, onChange, label = "Page", min = 1, className = "pdf-reader-page-field", marks, show, read, shiftBy = 10, onSettle }: {
  value: number
  max: number
  onChange: (n: number) => void
  label?: string
  min?: number
  className?: string
  marks?: ReadonlySet<number>
  /** How a value is written in the field: a book's printed page ("48", "xii") for its place in the file. */
  show?: (n: number) => string
  /** A value from what was typed (a printed page), else null, and the typed words are worked out as a sum. */
  read?: (typed: string) => number | null
  /** What ⇧ steps by: ten by default, seven for days (a week). */
  shiftBy?: number
  /** Told once a run of changes is let go of: the drag ended, Enter kept a number, the field was left. */
  onSettle?: () => void
}): React.JSX.Element {
  const shown = (n: number): string => (show ? show(n) : String(n))
  const field = useRef<HTMLInputElement>(null)
  const [typed, setTyped] = useState<string | null>(null)
  /** The page shown as the pointer came over the field: the page you came from, felt firmly on the way back. */
  const origin = useRef(value)
  const press = useRef<{ x: number; last: number; from: number; at: number; moved: boolean; tickAt: number } | null>(null)
  const to = (n: number): number => Math.min(Math.max(min, Math.round(n)), Math.max(min, max))
  // A change not yet let go of: settled once, when the drag ends, Enter keeps it, or the field is left.
  const owed = useRef(false)
  const change = (n: number): void => {
    owed.current = true
    onChange(n)
  }
  const settle = (): void => {
    if (!owed.current) return
    owed.current = false
    onSettle?.()
  }
  const land = (n: number, tick: { tickAt: number } | null): void => {
    const next = to(n)
    if (next === value) return
    change(next)
    stepTap(next, min, Math.max(min, max), next === origin.current ? new Set([next]) : marks)
    if (!tick || performance.now() - tick.tickAt > TICK_GAP) {
      chime("tick")
      if (tick) tick.tickAt = performance.now()
    }
  }
  // The wheel a step at a time; the one listener reads this render's value and landing through a ref.
  const wheel = useRef({ land, value, rest: 0, shiftBy })
  wheel.current.land = land
  wheel.current.value = value
  wheel.current.shiftBy = shiftBy
  useEffect(() => {
    const el = field.current
    if (!el) return
    const onWheel = (event: WheelEvent): void => {
      // ⌘ or a pinch (ctrl) is the reader's zoom: let it through.
      if (event.metaKey || event.ctrlKey) return
      event.preventDefault()
      const one = wheel.current
      // The larger of the two ways (⇧ turns a mouse's wheel sideways), in pixels.
      const raw = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      const by = event.deltaMode === 1 ? raw * 16 : event.deltaMode === 2 ? raw * 400 : raw
      // Kept until it makes a whole step: a slow glide steps evenly, a fling further, and nothing is lost between.
      one.rest += by
      const steps = Math.trunc(one.rest / WHEEL_STEP)
      one.rest -= steps * WHEEL_STEP
      if (steps) one.land(one.value + steps * (event.shiftKey ? one.shiftBy : 1), null)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])
  const done = (): void => {
    press.current = null
    delete document.documentElement.dataset.scrubbing
    settle()
  }
  return (
    <input
      ref={field}
      aria-label={label}
      className={className}
      // The sideways arrows say "drag me" until it is opened to type (the app's own rule for fields would show the text cursor).
      style={{ cursor: typed === null ? "ew-resize" : "text" }}
      data-scrub-field=""
      data-swipe-own=""
      inputMode="decimal"
      value={typed ?? shown(value)}
      onPointerDown={(event) => {
        // Typing already: the press places the caret, as in any field.
        if (event.button !== 0 || document.activeElement === event.currentTarget) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        press.current = { x: event.clientX, last: event.clientX, from: value, at: value, moved: false, tickAt: 0 }
      }}
      onPointerMove={(event) => {
        const one = press.current
        if (!one) return
        if (!one.moved && Math.abs(event.clientX - one.x) < 3) return
        if (!one.moved) document.documentElement.dataset.scrubbing = ""
        one.moved = true
        // A page every 8px near where it was pressed, quickening with the distance; ⇧ `shiftBy` times, on whole steps of it, ⌥ a quarter.
        const rate = (1 + Math.abs(event.clientX - one.x) / 60) * (event.shiftKey ? shiftBy : 1) * (event.altKey ? 0.25 : 1)
        one.at = Math.min(Math.max(min, one.at + ((event.clientX - one.last) / 8) * rate), Math.max(min, max))
        one.last = event.clientX
        land(event.shiftKey ? one.from + Math.round((one.at - one.from) / shiftBy) * shiftBy : one.at, one)
      }}
      onPointerUp={(event) => {
        const one = press.current
        done()
        // Pressed and let go in place: a number to type.
        if (one && !one.moved) {
          event.currentTarget.focus()
          event.currentTarget.select()
        }
      }}
      onPointerCancel={done}
      onLostPointerCapture={() => press.current && done()}
      onPointerEnter={() => (origin.current = value)}
      // Stepped by two fingers and the pointer moved on: that run of steps is let go of.
      onPointerLeave={() => !press.current && settle()}
      onFocus={(event) => (setTyped(shown(value)), event.currentTarget.select())}
      onChange={(event) => setTyped(read ? event.target.value.slice(0, 16) : event.target.value.replace(/[^\d.+\-*/×÷() ]/g, ""))}
      onBlur={() => (setTyped(null), settle())}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault()
          // From what the field shows: a second press lands before the saved value comes back.
          const from = typed === null ? value : read ? (read(typed) ?? value) : /^\d+$/.test(typed) ? Number(typed) : value
          const next = to(from + (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? shiftBy : 1))
          land(next, null)
          setTyped(shown(next))
          requestAnimationFrame(() => field.current?.select())
        } else if (event.key === "Enter") {
          const box = event.currentTarget
          const own = read?.(typed ?? "")
          if (own != null) return void (change(to(own)), box.blur())
          void typedSum(typed ?? "", value).then((n) => {
            if (n !== null) change(to(n))
            box.blur()
          })
        } else if (event.key === "Escape") event.currentTarget.blur()
      }}
    />
  )
}

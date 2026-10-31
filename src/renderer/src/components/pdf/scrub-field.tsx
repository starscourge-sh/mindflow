import { useRef, useState } from "react"
import { chime } from "@/lib/sound"

/** A number you drag sideways to change (ScrubField), drawn as Haligtree"s own field. */
export const SCRUB = "h-8 w-14 cursor-ew-resize rounded-md border border-input bg-input/20 px-2 text-center text-sm tabular-nums outline-none transition-colors focus:cursor-text focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"

/** The quickest a step's tick repeats: a fast scrub is a soft patter, never a buzz. */
const TICK_GAP = 45

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
 */
export function ScrubField({ value, max, onChange, label = "Page", min = 1, className = "pdf-reader-page-field" }: { value: number; max: number; onChange: (n: number) => void; label?: string; min?: number; className?: string }): React.JSX.Element {
  const field = useRef<HTMLInputElement>(null)
  const [typed, setTyped] = useState<string | null>(null)
  const press = useRef<{ x: number; last: number; from: number; at: number; moved: boolean; tickAt: number } | null>(null)
  const to = (n: number): number => Math.min(Math.max(min, Math.round(n)), Math.max(min, max))
  const land = (n: number, tick: { tickAt: number } | null): void => {
    const next = to(n)
    if (next === value) return
    onChange(next)
    if (!tick || performance.now() - tick.tickAt > TICK_GAP) {
      chime("tick")
      if (tick) tick.tickAt = performance.now()
    }
  }
  const done = (): void => {
    press.current = null
    delete document.documentElement.dataset.scrubbing
  }
  return (
    <input
      ref={field}
      aria-label={label}
      className={className}
      // The sideways arrows say "drag me" until it is opened to type (the app's own rule for fields would show the text cursor).
      style={{ cursor: typed === null ? "ew-resize" : "text" }}
      data-scrub-field=""
      inputMode="decimal"
      value={typed ?? String(value)}
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
        // A page every 8px near where it was pressed, quickening with the distance; ⇧ ten times, ⌥ a quarter.
        const rate = (1 + Math.abs(event.clientX - one.x) / 60) * (event.shiftKey ? 10 : 1) * (event.altKey ? 0.25 : 1)
        one.at = Math.min(Math.max(min, one.at + ((event.clientX - one.last) / 8) * rate), Math.max(min, max))
        one.last = event.clientX
        land(one.at, one)
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
      onFocus={(event) => (setTyped(String(value)), event.currentTarget.select())}
      onChange={(event) => setTyped(event.target.value.replace(/[^\d.+\-*/×÷() ]/g, ""))}
      onBlur={() => setTyped(null)}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault()
          // From what the field shows: a second press lands before the saved value comes back.
          const from = typed !== null && /^\d+$/.test(typed) ? Number(typed) : value
          const next = to(from + (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1))
          land(next, null)
          setTyped(String(next))
          requestAnimationFrame(() => field.current?.select())
        } else if (event.key === "Enter") {
          const box = event.currentTarget
          void typedSum(typed ?? "", value).then((n) => {
            if (n !== null) onChange(to(n))
            box.blur()
          })
        } else if (event.key === "Escape") event.currentTarget.blur()
      }}
    />
  )
}

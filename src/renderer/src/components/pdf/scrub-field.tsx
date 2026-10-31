import { useRef, useState } from "react"
import { chime } from "@/lib/sound"

/** The quickest a step's tick repeats: a fast scrub is a soft patter, never a buzz. */
const TICK_GAP = 45

/**
 * A page number as Figma's number fields are: press and drag across it to
 * scrub (the further from where you pressed, the faster; ⇧ ten times as
 * fast, ⌥ fine), let go to land. A plain click types a number instead, and
 * ↑ ↓ step while it has the keys (⇧ by ten).
 */
export function ScrubField({ value, max, onChange, label = "Page" }: { value: number; max: number; onChange: (n: number) => void; label?: string }): React.JSX.Element {
  const field = useRef<HTMLInputElement>(null)
  const [typed, setTyped] = useState<string | null>(null)
  const press = useRef<{ x: number; last: number; from: number; at: number; moved: boolean; tickAt: number } | null>(null)
  const to = (n: number): number => Math.min(Math.max(1, Math.round(n)), Math.max(1, max))
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
      className="pdf-reader-page-field"
      data-scrub-field=""
      inputMode="numeric"
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
        one.at = Math.min(Math.max(1, one.at + ((event.clientX - one.last) / 8) * rate), Math.max(1, max))
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
      onChange={(event) => setTyped(event.target.value.replace(/\D/g, ""))}
      onBlur={() => setTyped(null)}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault()
          const next = to(value + (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1))
          land(next, null)
          setTyped(String(next))
          requestAnimationFrame(() => field.current?.select())
        } else if (event.key === "Enter") {
          onChange(to(Number(typed) || value))
          event.currentTarget.blur()
        } else if (event.key === "Escape") event.currentTarget.blur()
      }}
    />
  )
}

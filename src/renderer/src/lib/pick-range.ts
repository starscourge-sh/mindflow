import { useRef } from 'react'
import { chime } from './sound'

/** How a list picks with the mouse and keys, the same in every list. */
export type Picking = {
  /** A row clicked: ⌘ and ⇧ pick and say true; a plain click lets the picked ones go and says false, so the row opens. */
  click: (event: { metaKey: boolean; shiftKey: boolean; altKey: boolean }, id: string) => boolean
  /** ⇧↑ or ⇧↓: from the anchor (or the row the cursor left) to the row it reached. */
  extend: (from: string | undefined, to: string) => void
  /** x, or a menu's "Select": one row in or out, the anchor moved to it. */
  toggle: (id: string) => void
}

/**
 * Picking as Finder does it. ⌘-click puts one row in or takes it out, keeping
 * the rest. ⇧-click picks every row from the anchor (the last row clicked) to
 * this one, on top of what ⌘ picked before, and a second ⇧-click redraws that
 * run rather than adding another. ⇧↑ and ⇧↓ grow or shrink the run the same
 * way. A plain click picks just that row: the others let go, and it opens.
 * `order` is the rows as shown, top to bottom.
 */
export function usePicking(order: string[], chosen: string[], setChosen: (ids: string[]) => void, { can = () => true }: { can?: (id: string) => boolean } = {}): Picking {
  const now = useRef({ order, chosen, setChosen, can })
  now.current = { order, chosen, setChosen, can }
  // Where a run starts, and what was picked before the run, which it never takes away.
  const anchor = useRef<string | null>(null)
  const base = useRef<string[]>([])
  const span = (a: string, b: string): string[] => {
    const { order, can } = now.current
    const i = order.indexOf(a)
    const j = order.indexOf(b)
    if (i < 0 || j < 0) return can(b) ? [b] : []
    return order.slice(Math.min(i, j), Math.max(i, j) + 1).filter(can)
  }
  const toggle = (id: string): void => {
    const { chosen, setChosen, can } = now.current
    if (!can(id)) return
    const next = chosen.includes(id) ? chosen.filter((one) => one !== id) : [...chosen, id]
    chime(chosen.includes(id) ? 'off' : 'on')
    anchor.current = id
    base.current = next
    setChosen(next)
  }
  const run = (from: string | undefined, to: string): void => {
    const { order, chosen, setChosen } = now.current
    if (!anchor.current || !order.includes(anchor.current)) {
      anchor.current = from && order.includes(from) ? from : to
      base.current = chosen
    }
    const next = [...new Set([...base.current, ...span(anchor.current, to)])]
    chime(next.length >= chosen.length ? 'on' : 'off')
    setChosen(next)
  }
  const click: Picking['click'] = (event, id) => {
    if (event.metaKey && !event.altKey) return (toggle(id), true)
    if (event.shiftKey) return (run(undefined, id), true)
    anchor.current = id
    base.current = []
    if (now.current.chosen.length) now.current.setChosen([])
    return false
  }
  return { click, extend: run, toggle }
}

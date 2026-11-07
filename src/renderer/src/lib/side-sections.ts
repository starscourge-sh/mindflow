import { useEffect, useState } from 'react'
import { haligtree } from './haligtree'
import { chime } from './sound'
import { toast } from '@/components/haligtree/ui'
import { swallowClick } from '@/components/haligtree/carry'

/** The sidebar's sections under its places, in their usual order. */
export const SECTIONS_USUAL = ['pinned', 'recent', 'library', 'tags'] as const
const NAMES: Record<string, string> = { pinned: 'Pinned', recent: 'Recent', library: 'Library', tags: 'Tags' }

/** The saved order, every section once: one missing (newer than the saved order) goes where it usually sits. */
export function sideOrder(saved: readonly string[] | undefined): string[] {
  const kept = (saved ?? []).filter((one): one is string => (SECTIONS_USUAL as readonly string[]).includes(one))
  const out = [...new Set(kept)]
  for (const one of SECTIONS_USUAL) if (!out.includes(one)) out.splice(Math.min(out.length, SECTIONS_USUAL.indexOf(one)), 0, one)
  return out
}

/** A section put at `to` in the order, saved, said with Undo. */
export async function placeSection(id: string, to: number): Promise<void> {
  const was = sideOrder((await haligtree.settings()).sideSections)
  const next = was.filter((one) => one !== id)
  next.splice(Math.max(0, Math.min(next.length, to)), 0, id)
  if (next.join() === was.join()) return
  chime('shift')
  await haligtree.setSettings({ sideSections: next })
  toast(`Moved ${NAMES[id] ?? id}`, () => void haligtree.setSettings({ sideSections: was }).then(() => chime('undo')))
}

/** The heading's menu lines: up and down, where there is room. */
export const sectionMoves = (id: string, order: string[]): { label: string; run: () => void }[] => {
  const at = order.indexOf(id)
  return [
    ...(at > 0 ? [{ label: 'Move section up', run: () => void placeSection(id, at - 1) }] : []),
    ...(at >= 0 && at < order.length - 1 ? [{ label: 'Move section down', run: () => void placeSection(id, at + 1) }] : [])
  ]
}

/**
 * A section's heading dragged up or down moves the whole section: past 6px it is carried, a line shows where it
 * would land between the sections, and letting go puts it there (the click that ends it folds nothing). Esc puts it back.
 */
export function useSectionDrag(): { line: { top: number; left: number; width: number } | null; carrying: string | null } {
  const [line, setLine] = useState<{ top: number; left: number; width: number } | null>(null)
  const [carrying, setCarrying] = useState<string | null>(null)
  useEffect(() => {
    let down: { id: string; y: number } | null = null
    let to = -1
    let lifted = false
    const boxes = (): { id: string; r: DOMRect }[] =>
      [...document.querySelectorAll<HTMLElement>('aside nav [data-side-section]')].filter((one) => one.offsetHeight > 0)
        .map((one) => ({ id: one.dataset.sideSection!, r: one.getBoundingClientRect() }))
        .filter((one, n, all) => all.findIndex((other) => other.id === one.id) === n)
        .sort((a, b) => a.r.top - b.r.top)
    const end = (): void => void ((down = null), (to = -1), (lifted = false), setLine(null), setCarrying(null))
    const onDown = (event: PointerEvent): void => {
      if (event.button !== 0) return
      const head = (event.target as Element | null)?.closest?.<HTMLElement>('[data-side-section-handle]')
      if (head) down = { id: head.dataset.sideSectionHandle!, y: event.clientY }
    }
    const onMove = (event: PointerEvent): void => {
      if (!down) return
      if (!(event.buttons & 1)) return end()
      if (!lifted && Math.abs(event.clientY - down.y) < 6) return
      if (!lifted) (lifted = true), setCarrying(down.id)
      const all = boxes()
      if (!all.length) return
      // The gap nearest the pointer: before the first, between two, or after the last.
      const gaps = [all[0].r.top, ...all.map((one) => one.r.bottom)]
      let best = 0
      for (let n = 1; n < gaps.length; n++) if (Math.abs(gaps[n] - event.clientY) < Math.abs(gaps[best] - event.clientY)) best = n
      to = best
      const nav = document.querySelector('aside nav')!.getBoundingClientRect()
      setLine({ top: gaps[best], left: nav.left + 8, width: nav.width - 16 })
    }
    const onUp = (): void => {
      if (!down) return
      const id = down.id
      if (to >= 0) {
        swallowClick()
        const order = boxes().map((one) => one.id)
        const from = order.indexOf(id)
        void placeSection(id, to > from ? to - 1 : to)
      }
      end()
    }
    const onKey = (event: KeyboardEvent): void => void (event.key === 'Escape' && down && (event.stopPropagation(), swallowClick(), end()))
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return { line, carrying }
}

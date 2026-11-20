import { useEffect, useState } from 'react'
import { haligtree } from './haligtree'
import { chime } from './sound'
import { slotTicker } from './proximity'
import { toast } from '@/components/haligtree/ui'
import { clearWay, makeWay, restBox, swallowClick, type Spot } from '@/components/haligtree/carry'
import '@/lib/carry-cursor'

/** The sidebar's sections under its places, in their usual order. */
export const SECTIONS_USUAL = ['folders', 'library', 'pinned', 'recent', 'tags'] as const
const NAMES: Record<string, string> = { folders: 'Folders', pinned: 'Pinned', recent: 'Recent', library: 'Library', tags: 'Tags' }

/** The saved order, every section once: one missing (newer than the saved order) goes where it usually sits. */
export function sideOrder(saved: readonly string[] | undefined): string[] {
  const kept = (saved ?? []).filter((one): one is string => (SECTIONS_USUAL as readonly string[]).includes(one))
  const out = [...new Set(kept)]
  for (const one of SECTIONS_USUAL) if (!out.includes(one)) out.splice(Math.min(out.length, SECTIONS_USUAL.indexOf(one)), 0, one)
  return out
}

/** A section put at `to` in the order (or just before the section named `to`, or after it with `after`), saved, said with Undo. */
export async function placeSection(id: string, to: number | string, after = false): Promise<void> {
  const was = sideOrder((await haligtree.settings()).sideSections)
  const next = was.filter((one) => one !== id)
  const at = typeof to === 'number' ? to : next.indexOf(to) + (after ? 1 : 0)
  next.splice(Math.max(0, Math.min(next.length, at)), 0, id)
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
 * A section's heading dragged up or down moves the whole section, carried as every row in the app is (carry.tsx): past
 * 6px it folds to its heading in the hand, a card under the pointer says what letting go would do, the other sections
 * make way on the rows' one clock and the room opens where it would land, the one line through its band. Letting go
 * puts it there (the click that ends it folds nothing), said with Undo; Esc puts everything back.
 */
export function useSectionDrag(): { carrying: string | null; at: { x: number; y: number } | null; room: Spot | null; words: string | null } {
  const [carrying, setCarrying] = useState<string | null>(null)
  // Where the pointer is, for the lifted card that follows it.
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const [room, setRoom] = useState<Spot | null>(null)
  useEffect(() => {
    let down: { id: string; y: number } | null = null
    let to = -1
    let lifted = false
    let held: HTMLElement | null = null
    const ticks = slotTicker()
    const shown = (): HTMLElement[] =>
      [...document.querySelectorAll<HTMLElement>('aside nav [data-side-section]')].filter((one) => one.offsetHeight > 0)
        .filter((one, n, all) => all.findIndex((other) => other.dataset.sideSection === one.dataset.sideSection) === n)
    // Its place back as it was: unfolded, in sight.
    const unhold = (el = held): void => {
      if (el) for (const key of ['height', 'overflow', 'visibility'] as const) el.style[key] = ''
      if (el) delete el.dataset.carryHeld
      if (el === held) held = null
    }
    const end = (snap: boolean, hold = false): void => {
      if (!hold) (clearWay(snap), unhold())
      down = null
      to = -1
      lifted = false
      delete document.documentElement.dataset.dragging
      setCarrying(null)
      setAt(null)
      setRoom(null)
    }
    const onDown = (event: PointerEvent): void => {
      if (event.button !== 0) return
      const head = (event.target as Element | null)?.closest?.<HTMLElement>('[data-side-section-handle]')
      if (head) down = { id: head.dataset.sideSectionHandle!, y: event.clientY }
    }
    const onMove = (event: PointerEvent): void => {
      if (!down) return
      if (!(event.buttons & 1)) return end(false)
      if (!lifted && Math.abs(event.clientY - down.y) < 6) return
      const id = down.id
      // Lifted as every drag in the app is: the hover light stops following, nothing keeps a focus ring, a card follows.
      if (!lifted) {
        lifted = true
        held = shown().find((one) => one.dataset.sideSection === id) ?? null
        // In the hand a section is its heading, as a group folds in the hand: its place keeps the heading's height alone.
        const head = held?.querySelector<HTMLElement>('[data-side-section-handle]')
        if (held && head) {
          held.style.height = `${Math.round(head.getBoundingClientRect().bottom - held.getBoundingClientRect().top)}px`
          held.style.overflow = 'hidden'
          held.style.visibility = 'hidden'
          held.dataset.carryHeld = ''
        }
        setCarrying(id)
        document.documentElement.dataset.dragging = ''
        ;(document.activeElement as HTMLElement | null)?.blur?.()
        ticks.start('own')
        chime('lift')
      }
      setAt({ x: event.clientX, y: event.clientY })
      const all = shown()
      if (!all.length || !held) return
      // The place nearest the pointer, as the sections lie before any made way: before the first, between two, or after the last.
      const laid = all.map((el) => ({ el, ...restBox(el) })).sort((a, b) => a.top - b.top)
      const gaps = [laid[0].top, ...laid.map((one) => one.top + one.height)]
      let best = 0
      for (let n = 1; n < gaps.length; n++) if (Math.abs(gaps[n] - event.clientY) < Math.abs(gaps[best] - event.clientY)) best = n
      const from = laid.findIndex((one) => one.el === held)
      // A light tick at each new place, none for staying where it was.
      if (best !== to) ticks(best === from || best === from + 1 ? 'own' : String(best))
      to = best
      setRoom(makeWay(all, held, best - 1, held.offsetHeight))
    }
    const onUp = (): void => {
      if (!down) return
      const id = down.id
      if (!lifted) return void (down = null)
      swallowClick()
      const order = shown().map((el) => ({ el, top: restBox(el).top })).sort((a, b) => a.top - b.top).map((one) => one.el.dataset.sideSection!)
      const from = order.indexOf(id)
      // Read before the carry is ended, which forgets it.
      const at = to
      const stays = at < 0 || at === from || at === from + 1
      // Let go where it stays: home. Let go elsewhere: the sections hold where they made way until the saved order is
      // drawn, then are at once where it puts them, so nothing slides back first.
      const was = held
      end(false, !stays)
      if (stays) return chime('stay')
      // Named by the section it lands beside, never by its place among those on show: the saved order also holds
      // sections not drawn (an empty one, one switched off), so a place counted on screen put it elsewhere, or where it
      // already was, and the drop did nothing (the user, 20 Nov: "Look back" let go between Folders and Library).
      const next = order[at] ?? order[order.length - 1]
      void placeSection(id, next, at >= order.length).then(() => (clearWay(true), unhold(was)))
    }
    const onKey = (event: KeyboardEvent): void => void (event.key === 'Escape' && down && (event.stopPropagation(), swallowClick(), lifted && chime('stay'), end(false)))
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
  return { carrying, at, room, words: room && !room.own ? 'Move here' : null }
}

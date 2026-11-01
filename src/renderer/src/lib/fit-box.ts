import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { Plugin } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'

/**
 * The box opens short and grows with what is written, as Linear's "New issue"
 * does. The page measures what the writing needs and tells the main process,
 * which glides the window down to it (window:fit). The same numbers as
 * FIT_MIN and SIZES.compact there.
 */
const SHORT = 280
/** "One line to start": the pill, one line and nothing else (PILL in main). */
const PILL = 56
const FULL = 600
/** Shorter by this much at once (a block deleted) and the box shrinks now; by a line or two, after a pause, so it never bounces as you type. */
const CLEARLY = 72
const PAUSE = 900
/** A line or two of writing: the box grows by this much at once, never gliding behind the caret. */
const LINES = 64
/** What needs the room while it is open: menus, pickers, dialogs, the slash and mention lists, a celebration. Not tooltips. */
/** A pop-up marked data-keeps-size (the kind picker) opens over the box at its size and scrolls inside itself instead. */
const KEEPS = '[data-keeps-size]'
const POPS = [
  `[role=dialog]:not(${KEEPS})`,
  '[role=alertdialog]',
  `[role=menu]:not(${KEEPS})`,
  `[role=listbox]:not(${KEEPS} *)`,
  `[data-radix-popper-content-wrapper]:not(:has([role=tooltip])):not(:has(${KEEPS}))`,
  '.tiptap-suggestion-popup',
  '[data-celebration]:not(:empty)'
].join(', ')

/** The room main keeps round the box's card (its overhang); 0 in a window that is all card. */
const ROOM = window.api.room.bottom
/** All the room the window keeps above and below the card. */
const roomTall = (): number => (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mf-room-top')) || window.api.room.top) + window.api.room.bottom
/** The card's height: with room round it, the window is taller than the card by that room. */
const cardHeight = (): number => (ROOM ? (document.querySelector<HTMLElement>('.app-container')?.offsetHeight ?? window.innerHeight) : window.innerHeight)

/** The card held at `height` (quick capture's overhang), whatever room the window keeps under it; and let go. */
const pin = (height: number): void => {
  // Never held at a height read while the card was not laid out (0, or a sliver): held there, the card shrank to a
  // line across the window while its round controls stayed up beside or above it (qa/box-never-bare.mjs).
  if (height < SHORT_ENOUGH) return
  document.documentElement.style.setProperty('--mf-card-held', `${height}px`)
  document.documentElement.setAttribute('data-card-held', '')
}
/** Shorter than the pill: not a height the card is ever drawn at. */
const SHORT_ENOUGH = 40
const unpin = (): void => void (document.documentElement.removeAttribute('data-card-held'), document.documentElement.style.removeProperty('--mf-card-held'))

/** How tall the window has to be to show the whole note without scrolling, two lines at least; null with no note in it. */
function needed(column: HTMLElement | null): number | null {
  // A voice note recording in the writing's place (voice-note.tsx): the words
  // are hidden, so the box is as tall as what shows (the recorder, the chip
  // under it), with none of the empty room the writing would have had.
  const recording = column?.querySelector<HTMLElement>('[data-recording], :has(> [data-recorder-slot]:not(:empty))')
  if (recording) {
    let shown = 0
    for (const child of Array.from(recording.children) as HTMLElement[]) {
      if (getComputedStyle(child).display === 'none') continue
      const at = getComputedStyle(child)
      shown += child.offsetHeight + (parseFloat(at.marginTop) || 0) + (parseFloat(at.marginBottom) || 0)
    }
    return Math.ceil(cardHeight() - recording.clientHeight + shown)
  }
  const scroller = column?.querySelector<HTMLElement>('.mf-faded .haligtree-editor-content')
  const doc = scroller?.querySelector<HTMLElement>(':scope > .ProseMirror')
  if (!scroller || !doc) return null
  const style = getComputedStyle(doc)
  const padTop = parseFloat(style.paddingTop) || 0
  const padBottom = parseFloat(style.paddingBottom) || 0
  const top = doc.getBoundingClientRect().top
  // Where the writing ends: the last block in the flow (the document itself
  // stretches to fill its box, so its own height says nothing).
  let end = top + padTop
  for (let block = doc.lastElementChild; block; block = block.previousElementSibling) {
    const at = getComputedStyle(block)
    if (at.position === 'absolute' || at.position === 'fixed' || at.display === 'none') continue
    end = block.getBoundingClientRect().bottom + (parseFloat(at.marginBottom) || 0)
    break
  }
  const line = parseFloat(getComputedStyle(doc.querySelector('p') ?? doc).lineHeight) || 26
  const words = Math.max(end - top + padBottom, padTop + 2 * line + padBottom)
  // What scrolls with the words under them (a kept note's mentions).
  let rest = 0
  for (const child of Array.from(scroller.children)) {
    if (child === doc) continue
    const at = getComputedStyle(child)
    if (at.position !== 'absolute' && at.position !== 'fixed') rest += (child as HTMLElement).offsetHeight
  }
  const pad = getComputedStyle(scroller)
  const content = words + rest + (parseFloat(pad.paddingTop) || 0) + (parseFloat(pad.paddingBottom) || 0)
  // Everything around the note (the header, the fields, the footer) stays as it is.
  return Math.ceil(cardHeight() - scroller.clientHeight + content)
}

/**
 * Keeps the box as tall as its writing, between SHORT and FULL. Grows at once;
 * shrinks at once only when clearly shorter, otherwise after a pause. Full
 * height while a pop-up is open or a task is read, back after.
 *
 * `held` is set while the panel glides, so the two never fight over the frame.
 * `guard` is handed the editor: while the box is about to grow, the caret is
 * not scrolled into view (the growing shows it), so the writing never jumps
 * up and settles back down.
 */
export function useFitBox(column: RefObject<HTMLElement | null>, full: boolean, pill = false): { held: { current: boolean }; refit: () => void; guard: (editor: Editor) => void } {
  const sent = useRef(0)
  const wait = useRef<ReturnType<typeof setTimeout>>(undefined)
  const held = useRef(false)
  const fullNow = useRef(full)
  fullNow.current = full
  const pillNow = useRef(pill)
  pillNow.current = pill

  /** Room asked for below the card while a pop-up is open; and whether the screen had none, so the card grew instead. */
  const below = useRef(0)
  const grewForPop = useRef(false)
  const want = useCallback((): number => {
    const popped = document.querySelector(POPS)
    if (pillNow.current && !popped) return PILL
    // With room round the card, a pop-up hangs past the card's foot rather than growing the card.
    const height = fullNow.current || (popped && (!ROOM || grewForPop.current)) ? FULL : (needed(column.current) ?? FULL)
    return Math.min(FULL, Math.max(SHORT, height))
  }, [column])

  const send = useCallback((height: number, snap = false): void => {
    clearTimeout(wait.current)
    // Already asked for, but gliding there: a snap still lands it at once.
    if (height === sent.current && !snap) return
    sent.current = height
    // Held while a pop-up hangs into the room below: the card still grows or shrinks with the writing.
    if (document.documentElement.hasAttribute('data-card-held')) pin(height)
    window.api.fitBox(height, snap)
  }, [])

  /**
   * A pop-up opened in a box too short for it is kept out of sight (and its
   * entrance paused) while the box jumps to full height, then shown where it
   * belongs: never seen clipped, never seen moving. A key opens most of them,
   * so the box gets there at once rather than gliding.
   */
  const settling = useRef(false)
  const room = useCallback((): boolean => {
    const root = document.documentElement
    const popped = Boolean(document.querySelector(POPS))
    const card = cardHeight()
    // Room round the card (main's overhang): a pop-up in a short box gets room below the card's foot, the window
    // growing down while the card stays put; only where the screen has no room there does the card grow, as before.
    if (ROOM && !held.current && !document.hidden) {
      const ask = popped && !grewForPop.current && card < FULL - 1 ? Math.max(0, FULL - card - ROOM) : 0
      if (!popped) grewForPop.current = false
      if (ask !== below.current) {
        below.current = ask
        if (ask && !('growing' in root.dataset)) (root.dataset.growing = ''), setTimeout(() => delete root.dataset.growing, 500)
        // The card is held at its height while the window grows room under it: the page's own room below is a fixed
        // 48px, so unheld the card stretched into the new room, read as taller, gave the room back, shrank, and asked
        // again, the window jumping between the two sizes every few frames while the slash menu flipped above and below.
        if (ask) pin(card)
        void window.api.roomBelow(ask).then((given) => {
          if (below.current !== ask) return
          if (!ask) return unpin()
          if (given) return
          grewForPop.current = true
          below.current = 0
          unpin()
          send(FULL, true)
        })
      }
    }
    const short = !ROOM && !held.current && !document.hidden && card < FULL - 1 && popped
    if (short) {
      // Never left hidden if the box cannot grow (no room on the screen).
      if (!('growing' in root.dataset)) setTimeout(() => delete root.dataset.growing, 500)
      root.dataset.growing = ''
      send(FULL, true)
    } else if ('growing' in root.dataset && !settling.current) {
      // Shown once it has stopped moving: the pop-up places itself in the new
      // room over a frame or two, measured while still unseen.
      settling.current = true
      let last = ''
      let frames = 0
      const still = (): void => {
        const pop = document.querySelector(POPS)
        const at = pop ? JSON.stringify(pop.getBoundingClientRect()) : ''
        const roomy = cardHeight() >= FULL - 1 || (ROOM > 0 && window.innerHeight >= cardHeight() + roomTall() + below.current - 1)
        if (!pop || (at === last && roomy) || ++frames > 12) {
          settling.current = false
          return void delete root.dataset.growing
        }
        last = at
        requestAnimationFrame(still)
      }
      requestAnimationFrame(still)
    }
    return short
  }, [send])

  const refit = useCallback((now = false): void => {
    if (held.current || room()) return
    const height = want()
    // Hidden, it is sized at once: it opens at what it needs, never growing in view.
    if (now || document.hidden || height > sent.current || height < sent.current - CLEARLY) return send(height, Math.abs(height - sent.current) <= LINES)
    clearTimeout(wait.current)
    if (height < sent.current) wait.current = setTimeout(() => !held.current && send(want()), PAUSE)
  }, [want, send])

  useEffect(() => {
    let frame = 0
    const soon = (): void => {
      if (frame) return
      // No frames are drawn while the window is away: a timer instead.
      const run = (): void => void ((frame = 0), refit())
      frame = document.hidden ? (setTimeout(run, 16) as unknown as number) : requestAnimationFrame(run)
    }
    // A pop-up is hidden in the same task it arrives in, before it is ever drawn.
    const changes = new MutationObserver(() => void (room(), soon()))
    changes.observe(document.body, { childList: true, subtree: true, characterData: true })
    window.addEventListener('resize', soon)
    const sizes = new ResizeObserver(soon)
    if (column.current) sizes.observe(column.current)
    // A picture or a card's image arriving makes its block taller.
    document.addEventListener('load', soon, true)
    soon()
    return () => {
      changes.disconnect()
      sizes.disconnect()
      window.removeEventListener('resize', soon)
      document.removeEventListener('load', soon, true)
      clearTimeout(wait.current)
    }
  }, [column, refit, room])

  // A task read here, or back to the note: at once.
  useEffect(() => refit(true), [full, refit])
  // The pill grown or folded back: in the one glide, never in steps.
  useEffect(() => refit(true), [pill, refit])

  const guard = useCallback((editor: Editor): void => {
    editor.registerPlugin(new Plugin({ props: { handleScrollToSelection: () => {
      if (held.current) return false
      const height = want()
      if (height <= cardHeight() + 1) return false
      send(height)
      // Once it has grown, the caret is brought into view if it still needs it.
      setTimeout(() => !editor.isDestroyed && editor.commands.scrollIntoView(), 280)
      return true
    } } }))
  }, [want, send])

  return { held, refit: () => refit(true), guard }
}

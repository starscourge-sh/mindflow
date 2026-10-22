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

/** How tall the window has to be to show the whole note without scrolling, two lines at least; null with no note in it. */
function needed(column: HTMLElement | null): number | null {
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
  return Math.ceil(window.innerHeight - scroller.clientHeight + content)
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
export function useFitBox(column: RefObject<HTMLElement | null>, full: boolean): { held: { current: boolean }; refit: () => void; guard: (editor: Editor) => void } {
  const sent = useRef(0)
  const wait = useRef<ReturnType<typeof setTimeout>>(undefined)
  const held = useRef(false)
  const fullNow = useRef(full)
  fullNow.current = full

  const want = useCallback((): number => {
    const height = fullNow.current || document.querySelector(POPS) ? FULL : (needed(column.current) ?? FULL)
    return Math.min(FULL, Math.max(SHORT, height))
  }, [column])

  const send = useCallback((height: number, snap = false): void => {
    clearTimeout(wait.current)
    // Already asked for, but gliding there: a snap still lands it at once.
    if (height === sent.current && !snap) return
    sent.current = height
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
    const short = !held.current && !document.hidden && window.innerHeight < FULL - 1 && Boolean(document.querySelector(POPS))
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
        if (!pop || (at === last && window.innerHeight >= FULL - 1) || ++frames > 12) {
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

  const guard = useCallback((editor: Editor): void => {
    editor.registerPlugin(new Plugin({ props: { handleScrollToSelection: () => {
      if (held.current) return false
      const height = want()
      if (height <= window.innerHeight + 1) return false
      send(height)
      // Once it has grown, the caret is brought into view if it still needs it.
      setTimeout(() => !editor.isDestroyed && editor.commands.scrollIntoView(), 280)
      return true
    } } }))
  }, [want, send])

  return { held, refit: () => refit(true), guard }
}

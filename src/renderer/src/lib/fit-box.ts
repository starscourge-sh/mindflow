import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { Plugin } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'

/**
 * The box opens short and grows with what is written, as Linear's "New issue"
 * does. The page measures what the writing needs and tells the main process,
 * which glides the window down to it (window:fit). The same numbers as
 * FIT_MIN and SIZES.compact there.
 */
const SHORT = 280
/** "One line to start": the pill, one line and nothing else, as tall as its line at the text size (main.css --mf-pill-h; at least PILL in main). */
const pillHeight = (): number => Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mf-pill-h'))) || 56
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
  // A menu drawn inside a pop-up that keeps the box's size (Display's Sort by list, in its sheet) is part of it.
  `[role=menu]:not(${KEEPS}):not(${KEEPS} *)`,
  `[role=listbox]:not(${KEEPS} *)`,
  `[data-radix-popper-content-wrapper]:not(:has([role=tooltip])):not(:has(${KEEPS}))`,
  '.tiptap-suggestion-popup',
  '[data-celebration]:not(:empty)'
].join(', ')

/** A small window of its own holding one note, on the box's page (App.tsx). */
const SMALL = new URLSearchParams(location.search).has('small')
/** The room main keeps round the box's card (its overhang); 0 in a window that is all card. */
const ROOM = window.api.room.bottom
/** The room under the card its own menus may use (a hint below the card may hold more, given up while one is open). */
const MENU_ROOM = window.api.room.menu ?? ROOM
/** The room under the card as it is now: more while a hint sits there (box.tsx sets it as main changes it). */
const roomUnder = (): number => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mf-room')) || ROOM
/** All the room the window keeps above and below the card. */
const roomTop = (): number => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mf-room-top')) || window.api.room.top
/** The card's height: with room round it, the window is taller than the card by that room (a small window's below it). */
const cardHeight = (): number => (ROOM || SMALL ? (document.querySelector<HTMLElement>('.app-container')?.offsetHeight ?? window.innerHeight) : window.innerHeight)
/**
 * A small window growing with its words (main/small-window.ts): its card drawn at `height` in this frame, inside the
 * clear room its window holds below it, the window itself growing only when that room runs short (main.css,
 * data-small-auto). Never taller than the window has room for: past that its words scroll until the window has grown.
 */
const drawSmall = (height: number): void => {
  if (SMALL && height > 0) document.documentElement.style.setProperty('--mf-small-card', `${Math.min(height, window.innerHeight)}px`)
}

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
  // A card held shorter than what is around its writing (the pill held while it becomes the box) squeezes the writing
  // to nothing, so what is around it reads short and the box grew in steps, each measure a little taller than the last.
  // Measured held at the full height for the moment of the reading, in the same task, so no frame ever shows it.
  const root = document.documentElement
  const held = root.hasAttribute('data-card-held') ? root.style.getPropertyValue('--mf-card-held') : ''
  if (!held) return measure(column)
  root.style.setProperty('--mf-card-held', `${FULL}px`)
  try {
    return measure(column)
  } finally {
    root.style.setProperty('--mf-card-held', held)
  }
}
/** Where the writing ends: the last block in the flow (the document itself stretches to fill its box, so its own height says nothing). */
function wordsEnd(doc: HTMLElement, padTop: number): number {
  for (let block = doc.lastElementChild; block; block = block.previousElementSibling) {
    const at = getComputedStyle(block)
    if (at.position === 'absolute' || at.position === 'fixed' || at.display === 'none') continue
    return block.getBoundingClientRect().bottom + (parseFloat(at.marginBottom) || 0)
  }
  return doc.getBoundingClientRect().top + padTop
}

/**
 * A page read in a small window (App.tsx's Reader): the whole page scrolls as one, its own row of controls, title and
 * properties over the words and its thought bar laid over the room kept under them (main.css, data-docked). As tall
 * as all of that, so the bar sits right under the last line and nothing is left under the bar (16 Nov, shot 03-a).
 */
function measurePage(pane: HTMLElement): number | null {
  const doc = pane.querySelector<HTMLElement>('.haligtree-editor-content > .ProseMirror')
  const content = doc?.parentElement
  if (!doc || !content) return null
  const style = getComputedStyle(doc)
  const top = pane.getBoundingClientRect().top - pane.scrollTop
  const end = wordsEnd(doc, parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0) + (parseFloat(getComputedStyle(content).paddingBottom) || 0)
  return Math.ceil(cardHeight() - pane.clientHeight + end - top)
}

function measure(column: HTMLElement | null): number | null {
  const page = SMALL ? column?.querySelector<HTMLElement>('[data-reading-pane] .note-pane') : null
  if (page) return measurePage(page)
  const scroller = column?.querySelector<HTMLElement>('.mf-faded .haligtree-editor-content')
  const doc = scroller?.querySelector<HTMLElement>(':scope > .ProseMirror')
  if (!scroller || !doc) return null
  const style = getComputedStyle(doc)
  const padTop = parseFloat(style.paddingTop) || 0
  const padBottom = parseFloat(style.paddingBottom) || 0
  const top = doc.getBoundingClientRect().top
  const end = wordsEnd(doc, padTop)
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
export function useFitBox(column: RefObject<HTMLElement | null>, full: boolean, pill = false, ready = true): { held: { current: boolean }; refit: () => void; guard: (editor: Editor) => void; aim: (asPill: boolean) => void; prepare: () => Promise<boolean>; cancel: () => void } {
  // Nothing is asked of the window until the page knows its own shape (the settings read): main shows the box at its
  // first fit, and a fit sent before "One line to start" was known showed the whole box for a frame, then the pill.
  const readyNow = useRef(ready)
  readyNow.current = ready
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
  /** Held at a grown height until the window has grown round it (send). */
  const grown = useRef(false)
  /**
   * The pill held as it is while the window grows to the full box under it (prepare), then the box drawn at its
   * height in one frame: 'asking' while the window grows, 'ready' once it has, 'growing' for the one fit as the pill becomes the box.
   */
  const preparing = useRef<'asking' | 'ready' | 'growing' | null>(null)
  const want = useCallback((): number => {
    const popped = document.querySelector(POPS)
    // The pill stays one line with a list open (/, #, @): the list hangs into the room below it. It grew to full
    // height whenever one opened, and shrank back as it closed (qa/pill-steady.mjs). Only where the screen has no
    // room below does it grow, as the box does.
    if (pillNow.current && (!popped || (ROOM && !grewForPop.current))) return pillHeight()
    // With room round the card, a pop-up hangs past the card's foot rather than growing the card.
    const height = fullNow.current || (popped && (!ROOM || grewForPop.current)) ? FULL : (needed(column.current) ?? FULL)
    // A small window (main/small-window.ts) grows with the words past the box's full height, as far as the screen
    // allows (main keeps it under that ceiling and over its own short height); a pop-up gives it the box's full height.
    // No words to measure (its note's stand-in in its place): the box's full height, never a card too short for it.
    if (SMALL) return Math.max(popped || fullNow.current ? FULL : 0, needed(column.current) ?? FULL)
    return Math.min(FULL, Math.max(SHORT, height))
  }, [column])

  const send = useCallback((height: number, snap = false): void => {
    clearTimeout(wait.current)
    drawSmall(height)
    // Already asked for, but gliding there: a snap still lands it at once.
    if (height === sent.current && !snap) return
    sent.current = height
    // Held while a pop-up hangs into the room below, or while the window catches up with a grow: the card still grows
    // or shrinks with the writing.
    if (document.documentElement.hasAttribute('data-card-held')) pin(height)
    // Growing (a new line in the pill), into room the window already keeps under the card (main's hintRoom keeps the
    // grown box's under the pill): drawn at its new height in this frame, held there until the window has grown round
    // it. Waiting on main's resize (a message and a setBounds, 40 to 60ms), the second line showed cut off at the
    // pill's foot for a few frames. Becoming the pill the same: waiting on main, the pill's one line showed in the tall
    // card for three frames. Only the pill: any other height main may keep (the box with its panel, ⌃⇧F's), and a card
    // held at one it never takes stayed squeezed. Never while ⌘\'s move holds the box (`held`): it draws that itself.
    else if (ROOM && !below.current && !document.hidden && ((height > cardHeight() + 1 && window.innerHeight - roomTop() >= height) || (height === pillHeight() && pillNow.current && height < cardHeight() - 1 && !held.current))) {
      pin(height)
      grown.current = true
    }
    if (document.documentElement.hasAttribute('data-card-held') && preparing.current === 'growing') grown.current = true
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
    // A glance hung above the pill (box-glance.tsx: the box at the screen's foot, where there is no room to give
    // below): its pop-ups place themselves in the room there is, and never grow the pill into the box.
    const popped = Boolean(document.querySelector(POPS)) && !document.querySelector('[data-glance-panel][data-glance-above]')
    // The card's height read only with a pop-up open: read on every change to the page (the observer below), it laid
    // the whole box out in the middle of each draw, about 60 ms of opening a task from the list (qa/open-speed-big.mjs).
    let read: number | null = null
    const card = (): number => (read ??= cardHeight())
    // Room round the card (main's overhang): a pop-up in a short box gets room below the card's foot, the window
    // growing down while the card stays put; only where the screen has no room there does the card grow, as before.
    if (ROOM && !held.current && !document.hidden) {
      const ask = popped && !grewForPop.current && card() < FULL - 1 ? Math.max(0, FULL - card() - MENU_ROOM) : 0
      if (!popped) grewForPop.current = false
      if (ask !== below.current) {
        below.current = ask
        if (ask && !('growing' in root.dataset)) (root.dataset.growing = ''), setTimeout(() => delete root.dataset.growing, 500)
        // The card is held at its height while the window grows room under it: the page's own room below is a fixed
        // 48px, so unheld the card stretched into the new room, read as taller, gave the room back, shrank, and asked
        // again, the window jumping between the two sizes every few frames while the slash menu flipped above and below.
        if (ask) pin(card())
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
    const short = !ROOM && !held.current && !document.hidden && popped && card() < FULL - 1
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
        const roomy = cardHeight() >= FULL - 1 || (ROOM > 0 && window.innerHeight >= cardHeight() + roomTop() + Math.max(MENU_ROOM + below.current, roomUnder()) - 1)
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
    // The pill held while the window grows for the box: nothing asked of the window until it is the box.
    if (!readyNow.current || held.current || preparing.current === 'asking' || preparing.current === 'ready' || room()) return
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
    // The window has grown round a card drawn ahead of it: let go, the card filling its room at the same height.
    const caught = (): void => {
      if (!grown.current || below.current || preparing.current) return
      const room = window.innerHeight - roomTop() - roomUnder()
      // Grown round it, or come down to it from the full height prepare asked for: never let go on the way down,
      // where the card would fill the taller window and shrink with it.
      if (room < sent.current - 1 || room > sent.current + 1) return
      grown.current = false
      unpin()
    }
    window.addEventListener('resize', caught)
    // A small window grown round its card: the card takes the height it was held short of.
    const regrown = (): void => drawSmall(sent.current)
    window.addEventListener('resize', regrown)
    // “Text size” is worn on the page's root (editor-setup.ts wearFonts): the pill takes its new height at once, up or
    // down (--mf-pill-h), as a key asked for it. Only when that height changed: the root's style holds the room too.
    let tall = pillHeight()
    const sized = new MutationObserver(() => void (tall !== pillHeight() && ((tall = pillHeight()), refit(true))))
    sized.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    const sizes = new ResizeObserver(soon)
    if (column.current) sizes.observe(column.current)
    // A picture or a card's image arriving makes its block taller.
    document.addEventListener('load', soon, true)
    soon()
    return () => {
      changes.disconnect()
      sized.disconnect()
      sizes.disconnect()
      window.removeEventListener('resize', soon)
      window.removeEventListener('resize', caught)
      window.removeEventListener('resize', regrown)
      document.removeEventListener('load', soon, true)
      clearTimeout(wait.current)
    }
  }, [column, refit, room])

  // A task read here, or back to the note: at once.
  useEffect(() => refit(true), [full, refit])
  // The pill grown or folded back: in the one glide, never in steps.
  useEffect(() => refit(true), [pill, refit])
  // Grown after prepare: at its height before the frame is drawn, the window already tall enough for it.
  useLayoutEffect(() => {
    if (pill || preparing.current !== 'ready') return
    preparing.current = 'growing'
    refit(true)
    preparing.current = null
  }, [pill, refit])
  // The settings read: the first fit, at the shape the box really has.
  useEffect(() => void (ready && refit(true)), [ready, refit])

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

  /**
   * The height the box will want once the panel is put away, told before main starts the panel's glide: main glides
   * width and height together to it, in one move. Told after (the panel's glide holds the fit), main glided the width
   * in and the height only to the last height the full box asked for (280), a large empty card, then shrank it to the
   * pill in a second glide (the tracker: "moving from oneliner prompt to ⌘\ looks like... glitchy, formless").
   */
  const aim = useCallback((asPill: boolean): void => {
    const was = pillNow.current
    pillNow.current = asPill
    const height = want()
    pillNow.current = was
    send(height, false)
  }, [want, send])

  /**
   * The pill about to become the box for something that needs the box's room at once (a word's meaning): the pill
   * held as it is while the window grows to the full box under it (clicks pass through the room), resolved once it
   * has; then the box is drawn at its own height in one frame, and the window comes up to it unseen. Without it the
   * box grew in steps as the window caught up, its foot cut off meanwhile. `cancel` puts it back as it was.
   */
  const prepare = useCallback(async (): Promise<boolean> => {
    if (!ROOM || !pillNow.current || document.hidden || preparing.current) return true
    preparing.current = 'asking'
    clearTimeout(wait.current)
    pin(cardHeight())
    sent.current = FULL
    const given = await window.api.fitNow(FULL)
    // Answered once main has set the window's size: the page hears of it in its next resize, if it has not yet.
    if (given && Math.abs(window.innerHeight - given) > 1) await new Promise<void>((done) => window.addEventListener('resize', () => done(), { once: true }))
    if (preparing.current !== 'asking') return false
    preparing.current = 'ready'
    return true
  }, [])
  const cancel = useCallback((): void => {
    if (preparing.current !== 'asking' && !(preparing.current === 'ready' && pillNow.current)) return
    preparing.current = null
    unpin()
    refit(true)
  }, [refit])

  return { held, refit: () => refit(true), guard, aim, prepare, cancel }
}

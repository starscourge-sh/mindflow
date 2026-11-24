import { dayPart } from '../../../../main/journal-words'
import { ProgressBar } from './progress-bar'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { WritingSound } from './writing-sound'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'

import { useCounts } from '@/components/count/word-count'
import { ofTheWriting } from '@/lib/writing-floats'
import { scapeStop } from '@/lib/sound'
import { EASING, still, useStill } from '@/lib/motion'
import { useLive, haligtree, type Settings } from '@/lib/haligtree'
import { read as aimOf } from '@/components/count/word-aim'
import { Rolling } from './ui'
import { clock, num } from '../../../../main/dates'
import { useEditorDom } from '@/lib/editor-dom'
import { BlurEdge } from './blur-edge'


/**
 * Today's writing as a page rather than a form: a still caption over the
 * words for the time of day, the rest of the page stepping back while you
 * write, a caret that glides, and the count kept in view at the window's
 * foot (WriterLine). The look is main.css, read from `data-day-typing` and
 * `data-day-writing` on the root.
 */

/** The caption over today's words, for the hour the page opened in: the same parts of the day the page's question
 * takes (dayPart), so 4:51 in the morning is late at night for both, never "Morning pages" over "What's keeping you up?". */
export const dayCaption = (hour = new Date().getHours()): string =>
  dayPart(hour) === 'late' ? 'Night pages: whatever will not let you sleep.'
    : hour < 12 ? 'Morning pages: whatever is on your mind.'
    : hour < 18 ? 'Afternoon pages: wherever the day has got to.'
      : 'Evening pages: what happened, what stayed with you.'

/** A pause this long and you are no longer typing: the count and the squiggles come back. */
const TYPING = 1200
/** Words typed in a run before the rest of the page steps back. */
const WORDS_IN = 3
/** A gap between keys longer than this is not time spent writing. */
const GAP = 20_000

const timeKey = (day: string): string => `day-time:${day}`
const timeOf = (day: string): number => { try { return Number(localStorage.getItem(timeKey(day))) || 0 } catch { return 0 } }
const keepTime = (day: string, ms: number): void => { try { localStorage.setItem(timeKey(day), String(Math.round(ms))) } catch { /* only a nicety */ } }

/** How far the words slide to sit in the window's middle while the rest is gone; never past the room the page has. */
const shiftOf = (words: HTMLElement): number => {
  // The whole pane slides (main.css): its card clips, so the words alone could not go past its edge.
  const pane = words.closest<HTMLElement>('[data-pane]')
  if (!pane) return 0
  const slid = parseFloat(getComputedStyle(pane).translate) || 0
  const rect = words.getBoundingClientRect()
  const room = pane.getBoundingClientRect()
  const want = window.innerWidth / 2 - (rect.left - slid + rect.width / 2)
  return Math.max(Math.min(want, window.innerWidth - 8 - (room.right - slid)), 8 - (room.left - slid))
}

/**
 * Every element on the way up from a day's words to the page's body marked
 * `data-day-path`, for main.css to fade everything beside that way. Asked of
 * the page as `body :has([data-day-write])`, it made the browser look again
 * at every element in the window each time anything was added anywhere
 * (about 20 ms a time on a full page, several times over as a note or a tag
 * opened), whether a day page was open or not.
 *
 * And each box beside that way marked too (`data-day-aside`; what sits in a wrapper of display: contents is marked
 * `in`, for opacity skips the wrapper), so the rules that fade them name them. Named only as "a child of the way
 * that is not on it", they were rules that could reach any box at all, and each time a day page opened or shut
 * (Home coming and going) the browser worked out every box in the window again: 150 ms and more with a long note
 * still on the page behind it. What is added beside the way later (a toast, a menu) is marked as it comes.
 */
const besides = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => markDayPaths())
function markDayPaths(): void {
  const open = document.querySelectorAll('[data-day-write]')
  const way = new Set<Element>()
  // And the way up from what stays at hand while you write (data-day-keep: "Writing room"): faded with the bar, the
  // first click on it only brought the bar back, and the room seemed to do nothing (the user, 20 Nov 2026).
  const kept = open.length ? [...document.querySelectorAll('[data-day-keep]')] : []
  // Path is the words' way up, plus each keep and its ancestors (so a faded parent does not hide
  // “Writing room”). Keep's own siblings (Copy link, Name, …) still fade — they used to stay lit
  // because the whole actions row joined the path with the keep (24 Nov walk).
  for (const words of open) for (let up = words.parentElement; up && up !== document.body; up = up.parentElement) way.add(up)
  for (const one of kept) {
    way.add(one)
    for (let up = one.parentElement; up && up !== document.body; up = up.parentElement) way.add(up)
  }
  const aside = new Map<Element, string>()
  const markAside = (beside: Element): void => {
    if (way.has(beside)) return
    aside.set(beside, '')
    if (beside.classList.contains('contents')) for (const inner of beside.children) aside.set(inner, 'in')
  }
  if (open.length) {
    for (const on of [document.body, ...way]) for (const beside of on.children) markAside(beside)
    for (const one of kept) {
      const parent = one.parentElement
      if (!parent) continue
      for (const sib of parent.children) if (sib !== one) markAside(sib)
    }
  }  // Only what changed is touched: a mark taken off and put back is still a change the browser must answer.
  for (const one of document.querySelectorAll('[data-day-path]')) if (!way.has(one)) one.removeAttribute('data-day-path')
  for (const one of way) if (!one.hasAttribute('data-day-path')) one.setAttribute('data-day-path', '')
  for (const one of document.querySelectorAll('[data-day-aside]')) if (!aside.has(one)) one.removeAttribute('data-day-aside')
  for (const [one, kind] of aside) if (one.getAttribute('data-day-aside') !== kind) one.setAttribute('data-day-aside', kind)
  besides?.disconnect()
  if (open.length) for (const on of [document.body, ...way, ...[...aside.keys()].filter((one) => one.classList.contains('contents'))]) besides?.observe(on, { childList: true })
  // And a day page open at all, said on the root: asked of the page as :root:has([data-day-write]), it cost the same look at every element.
  document.documentElement.toggleAttribute('data-day-open', open.length > 0)
}

/**
 * Typing in the day's words: the count goes at the first key,
 * and a few words in the rest of the page fades to nothing, the sidebar with
 * it, and the words slide calmly to the window's middle (main.css). It stays
 * so until Esc or a click outside the words and their line; a pause or a move
 * of the pointer never ends it. Keeps the time spent writing that day, too.
 */
export function useWritingQuiet(editor: Editor | null, day: string): number {
  const [spent, setSpent] = useState(() => timeOf(day))
  const dom = useEditorDom(editor)
  useEffect(() => {
    setSpent(timeOf(day))
    if (!dom || !editor || editor.isDestroyed) return
    const root = document.documentElement
    markDayPaths()
    let typed = 0
    let words = 0
    let last = 0
    const quiet = (): void => {
      clearTimeout(typed)
      root.removeAttribute('data-day-typing')
      setSpent(timeOf(day))
    }
    // While writing, the page scrolls only across the words: the rest of it is faded to nothing but still there, and
    // a swipe carried an empty page's words thousands of pixels away into blank paper (the user, 5 Nov: "not weird
    // to you?"). The words' top never comes lower than where it stood as writing began, nor their end higher than a
    // quarter of the way down the pane.
    let scroller: HTMLElement | null = null
    let startTop = 0
    const hold = (): void => {
      if (!scroller) return
      const view = scroller.getBoundingClientRect()
      const lines = dom.getBoundingClientRect()
      const low = Math.max(startTop, view.top + view.height / 2)
      const high = view.top + view.height / 4
      if (lines.top > low) scroller.scrollTop += lines.top - low
      else if (lines.bottom < high) scroller.scrollTop -= high - lines.bottom
    }
    const back = (): void => {
      // Leaving writing mode hushes its soundscape, whichever way: Esc ("Esc to leave"), a click away, another page.
      // It comes again with the next words (the user, 20 Nov 2026: "pressed escape, it's still playing").
      if (root.hasAttribute('data-day-writing')) scapeStop(1)
      words = 0
      root.removeAttribute('data-day-writing')
      scroller?.removeEventListener('scroll', hold)
      scroller = null
    }
    const writing = (): void => {
      if (root.hasAttribute('data-day-writing')) return
      // Marked again: the page around the words may have been drawn anew since it opened.
      markDayPaths()
      // The words themselves are put in the middle, not the column round them: that column is wider than the words
      // (room kept at their right), so centring it left the words 130px short of the middle at 1280px.
      root.style.setProperty('--mf-day-shift', `${Math.round(shiftOf(dom))}px`)
      root.setAttribute('data-day-writing', '')
      for (let up = dom.parentElement; up; up = up.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(up).overflowY) && up.scrollHeight > up.clientHeight) { scroller = up; break }
      }
      startTop = dom.getBoundingClientRect().top
      scroller?.addEventListener('scroll', hold)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.isComposing) return
      if (event.key.length !== 1 && event.key !== 'Backspace' && event.key !== 'Enter') return
      const now = Date.now()
      if (last && now - last < GAP) keepTime(day, timeOf(day) + now - last)
      last = now
      root.setAttribute('data-day-typing', '')
      clearTimeout(typed)
      typed = window.setTimeout(quiet, TYPING)
      if ((event.key === ' ' || event.key === 'Enter') && ++words >= WORDS_IN) writing()
    }
    // Once begun, writing mode stays until you leave it: Esc, or a click outside the words and their line. A pause
    // or a move of the pointer never ends it (the user found being put in and out of it by those confusing), and a
    // click on the writer's line (its sound) keeps it.
    const onPress = (event: PointerEvent): void => {
      if (!root.hasAttribute('data-day-writing')) return
      const at = event.target as Element | null
      // "Writing room" kept in sight (data-day-keep) takes the writing on into the room, sound and all.
      if (at?.closest?.('[data-writer-line], [data-day-keep]') || ofTheWriting(at) || (at && dom.contains(at))) return
      back()
    }
    // Esc brings it all back at once, and is taken: it is not the page's Esc too.
    const onEsc = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !root.hasAttribute('data-day-writing') || document.querySelector('[data-room]')) return
      event.preventDefault()
      event.stopPropagation()
      back()
    }
    const off = (): void => quiet()
    // Leaving the page ends it, as Esc does: a page kept behind another tab came back still in writing mode, its line
    // over a day only being read (qa/day-page-cap.mjs).
    const shown = new IntersectionObserver(([one]) => void (one && !one.isIntersecting && root.hasAttribute('data-day-writing') && back()))
    shown.observe(dom)
    dom.addEventListener('keydown', onKey, true)
    window.addEventListener('keydown', onEsc, true)
    window.addEventListener('pointerdown', onPress, true)
    dom.addEventListener('blur', off)
    window.addEventListener('blur', off)
    return () => {
      shown.disconnect()
      off()
      back()
      // Run once the page is gone: only the day pages still open keep their way marked.
      markDayPaths()
      dom.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keydown', onEsc, true)
      window.removeEventListener('pointerdown', onPress, true)
      dom.removeEventListener('blur', off)
      window.removeEventListener('blur', off)
    }
  }, [editor, dom, day])
  return spent
}

/**
 * A long day's page kept to a height on the Journal (about a third of the window), its foot fading with a
 * "Show the whole page" under it, so the day's tasks stay near. It opens whole, smoothly, on that, on a click
 * in the words, or once you write (writing mode), and stays open until you leave the page.
 */
export function PageCap({ editor }: { editor: Editor | null }): React.JSX.Element | null {
  const [more, setMore] = useState(0)
  const [open, setOpen] = useState(false)
  const openRef = useRef(open)
  openRef.current = open
  const reveal = useRef<() => void>(() => {})
  const dom = useEditorDom(editor)
  useEffect(() => {
    if (!editor || !dom) return
    const box = dom.closest<HTMLElement>('[data-caret-room]')
    const frame = dom.closest<HTMLElement>('.haligtree-editor-wrapper')
    if (!box || !frame) return
    const measure = (): void => {
      if (openRef.current) return
      const line = parseFloat(getComputedStyle(dom).lineHeight) || 28
      // Lines past the frame's foot, counted to the last line written (not the room kept after it for writing).
      const end = (dom.lastElementChild?.getBoundingClientRect().bottom ?? 0) - frame.getBoundingClientRect().top
      const hidden = Math.max(0, Math.round((end - frame.clientHeight) / line))
      box.toggleAttribute('data-page-capped', hidden > 0)
      setMore(hidden)
    }
    const whole = (): void => {
      if (openRef.current) return
      openRef.current = true
      // From its capped height to its full one, then free: the words below slide down with it.
      const from = frame.getBoundingClientRect().height
      box.setAttribute('data-page-open', '')
      const to = frame.getBoundingClientRect().height
      if (to > from + 1 && !still()) frame.animate([{ height: `${from}px`, overflow: 'hidden' }, { height: `${to}px`, overflow: 'hidden' }], { duration: Math.min(700, 260 + (to - from) / 4), easing: EASING })
      setOpen(true)
    }
    reveal.current = whole
    const writing = new MutationObserver(() => document.documentElement.hasAttribute('data-day-writing') && whole())
    writing.observe(document.documentElement, { attributes: true, attributeFilter: ['data-day-writing'] })
    // A click in the words (not the caret put there on arrival): the page opens, the line clicked staying where it is.
    frame.addEventListener('pointerdown', whole)
    editor.on('update', measure)
    const sized = new ResizeObserver(measure)
    sized.observe(dom)
    measure()
    return () => {
      writing.disconnect()
      frame.removeEventListener('pointerdown', whole)
      editor.off('update', measure)
      sized.disconnect()
      box.removeAttribute('data-page-open')
      box.removeAttribute('data-page-capped')
    }
  }, [editor, dom])
  if (open || more < 1) return null
  return (
    <div data-page-more className="relative z-[2] -mt-9 flex justify-center">
      <button type="button" onClick={() => reveal.current()} className="flex h-7 items-center gap-1.5 rounded-full border border-foreground/10 bg-background px-3 text-control text-muted-foreground shadow-xs transition-colors hover:text-foreground">
        Show the whole page<span className="tabular-nums text-muted-foreground">· {more} more {more === 1 ? 'line' : 'lines'}</span><ChevronDown aria-hidden className="size-3.5" />
      </button>
    </div>
  )
}

/**
 * A caret in the accent colour, a touch thicker than the system's, that
 * glides to each new letter and blinks slowly once you pause. Under reduced
 * motion the editor keeps a plain accent caret of its own (main.css). The
 * spelling pill is every editor's own (SpellPill). Drawn in the nearest
 * `data-caret-room` (the Journal's words, quick capture's note); in Vim's
 * normal mode the block caret is the cue, so this one steps aside.
 */
export function LivingCaret({ editor }: { editor: Editor | null }): React.JSX.Element | null {
  const calm = useStill()
  const caret = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(false)
  const dom = useEditorDom(editor)
  useEffect(() => {
    if (!editor || !dom) return
    const box = dom.closest<HTMLElement>('[data-caret-room]')
    if (!box) return
    let frame = 0
    let still = 0
    const place = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (editor.isDestroyed) return
        const { selection } = editor.state
        const on = editor.isFocused && selection.empty && document.hasFocus() && dom.getAttribute('data-vim-mode') !== 'normal'
        setShown(on)
        const one = caret.current
        if (!on || !one) return
        const at = editor.view.coordsAtPos(selection.head)
        const from = box.getBoundingClientRect()
        // The room scrolls inside itself: its own scroll counts.
        one.style.translate = `${at.left - from.left}px ${at.top - from.top + box.scrollTop}px`
        one.style.height = `${at.bottom - at.top}px`
        // Moving: solid; a beat after it rests, the slow blink.
        one.removeAttribute('data-resting')
        clearTimeout(still)
        still = window.setTimeout(() => one.setAttribute('data-resting', ''), 600)
      })
    }
    editor.on('selectionUpdate', place)
    editor.on('update', place)
    editor.on('focus', place)
    editor.on('blur', place)
    window.addEventListener('resize', place)
    // The words moving under it with no edit: a picture loading above it, the room scrolled, Vim's mode changed.
    const sized = new ResizeObserver(place)
    sized.observe(dom)
    box.addEventListener('scroll', place, true)
    // A picture growing to its size once loaded or let go of (the editor itself may not change size, filling its
    // room), and any change of size that eases in: placed again once each lands.
    dom.addEventListener('load', place, true)
    dom.addEventListener('transitionend', place, true)
    const moded = new MutationObserver(place)
    moded.observe(dom, { attributes: true, subtree: true })
    place()
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(still)
      sized.disconnect()
      moded.disconnect()
      box.removeEventListener('scroll', place, true)
      dom.removeEventListener('load', place, true)
      dom.removeEventListener('transitionend', place, true)
      editor.off('selectionUpdate', place)
      editor.off('update', place)
      editor.off('focus', place)
      editor.off('blur', place)
      window.removeEventListener('resize', place)
    }
  }, [editor, dom])
  return calm ? null : <span ref={caret} aria-hidden data-living-caret data-shown={shown || undefined} className="mf-living-caret" />
}

/**
 * The day's count, kept in view: one line at the window's foot under the
 * words' own column, set as the writing room's foot is. Words so far and
 * minutes spent, the day's word aim as a short meter beside the count if it has
 * one, and on today the time, small. What a writer glances down at, and
 * nothing else. Always there, the same line in the same place whether the rest
 * of the page is up or gone; while keys go it holds still, and on a pause its
 * digits roll on. Fixed, it sits over nothing in the page's flow, so the
 * words never move for it.
 */
export function WriterLine({ editor, day, spent, today }: { editor: Editor | null; day: string; spent: number; today: boolean }): React.JSX.Element | null {
  const counts = useCounts(editor)
  const live = counts?.words ?? 0
  const [typing, setTyping] = useState(false)
  const [column, setColumn] = useState<{ left: number; width: number; foot: number } | null>(null)
  const held = useRef(live)
  if (!typing) held.current = live
  useEffect(() => {
    const root = document.documentElement
    const watch = new MutationObserver(() => setTyping(root.hasAttribute('data-day-typing')))
    watch.observe(root, { attributes: true, attributeFilter: ['data-day-typing'] })
    return () => watch.disconnect()
  }, [])
  // Only while the page is in use: the caret in it, or writing mode on. Read or passed by, the line keeps out of the way.
  const [inUse, setInUse] = useState(() => document.documentElement.hasAttribute('data-day-writing'))
  const [writingNow, setWritingNow] = useState(() => document.documentElement.hasAttribute('data-day-writing'))
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const root = document.documentElement
    // Once writing mode has begun the controls stay while the page is in use, so the pointer coming to them (which brings the
    // page back) does not take them away; they go when the words are left.
    // The line, and the blur under it, only once writing mode has faded the page: on the caret alone it floated over
    // the day's tasks and cards still in sight, a dark band cut through them (the user, 15 Nov: "what the fuck is
    // happening here?"). The sound goes when the words are left, so there is nothing playing to stop outside it.
    const check = (): void => {
      const writing = root.hasAttribute('data-day-writing')
      setInUse(writing)
      setWritingNow(writing)
    }
    const watch = new MutationObserver(check)
    watch.observe(root, { attributes: true, attributeFilter: ['data-day-writing'] })
    check()
    return () => watch.disconnect()
  }, [editor])
  // Lined up with the words' column and sitting on the page's foot, wherever the page puts them: a hint under the page lifts its foot.
  const dom = useEditorDom(editor)
  useEffect(() => {
    if (!dom) return
    const page = dom.closest('[data-pane-card]')
    // Where the notices are (home.tsx, note-window.tsx): what they keep clear of is said there, not on the root (main.css).
    const lane = document.querySelector<HTMLElement>('[data-toast-lane]')
    const measure = (): void => {
      const box = dom.getBoundingClientRect()
      // Lifted by what sits under the page (a hint), never by the window's own frame round it: with nothing under the
      // page it sits on the window's foot, exactly where the writing room's foot sits.
      const bottom = page?.getBoundingClientRect().bottom ?? window.innerHeight
      // Always the page's own foot: set to the window's, its band ran past the page's rounded edge onto the frame (16 Nov).
      const foot = Math.max(0, window.innerHeight - bottom)
      // Notices keep clear of the line, in plain pixels: the toast lane reads this as a number.
      lane?.style.setProperty('--mf-writer-toast', `${foot + 60}px`)
      setColumn((was) => (was && Math.abs(was.left - box.left) < 1 && Math.abs(was.width - box.width) < 1 && Math.abs(was.foot - foot) < 1 ? was : { left: box.left, width: box.width, foot }))
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(dom)
    if (page) watch.observe(page)
    window.addEventListener('resize', measure)
    return () => {
      watch.disconnect()
      window.removeEventListener('resize', measure)
      lane?.style.removeProperty('--mf-writer-toast')
    }
  }, [dom])
  const [, tick] = useState(0)
  // The time moves on once a minute, never per frame.
  useEffect(() => {
    if (!today) return
    const timer = window.setInterval(() => tick((n) => n + 1), 60_000)
    return () => clearInterval(timer)
  }, [today])
  const settings = useLive(haligtree.settings, null as Settings | null)
  const words = held.current
  // Today's line is there from the first moment, with only the time and its controls until there are words.
  // Said on the root while the line shows, for main.css: asked as :root:has([data-writer-line]), every change anywhere
  // made the browser look at the whole page again (11 Nov).
  const shown = !!((words || today) && column)
  useEffect(() => {
    document.documentElement.toggleAttribute('data-writer-shown', shown)
    return () => document.documentElement.removeAttribute('data-writer-shown')
  }, [shown])
  if (!shown) return null
  const aim = aimOf(`day-${day}`)
  const share = aim ? Math.min(1, words / aim.words) : 0
  const minutes = Math.round(spent / 60_000)
  // Over the words and tasks blurring out under it (BlurEdge), so what scrolls past never runs sharp through its numbers.
  // Its words and the blur's layers fade, never the line itself: faded, it would leave the blur nothing to see.
  return createPortal(
    <div data-writer-line data-in-use={inUse || undefined} inert={!inUse} className="pointer-events-none fixed z-40 flex flex-col items-center pt-4 pb-[1.125rem] text-sm text-muted-foreground tabular-nums"
      style={{ left: column.left, width: column.width, bottom: column.foot }}>
      <BlurEdge bar hide={!inUse} />
      <span className="relative flex items-center justify-center gap-3 transition-opacity duration-300 motion-reduce:transition-none" style={{ opacity: inUse ? 1 : 0 }}>
        {[
          words > 0 && <span key="words" data-writer-words className="inline-flex items-center gap-2">
            <span><Rolling text={num(words)} /> {words === 1 ? 'word' : 'words'}{aim ? ` of ${num(aim.words)}` : ''}</span>
            {/* The aim as a short meter beside its count, never a rule across the page. */}
            {aim && (
              <span data-writer-aim className="w-10"><ProgressBar edge value={share} label={`${num(words)} of ${num(aim.words)} words`} thick={4} silent fill={share >= 0.9 ? 'var(--primary)' : 'color-mix(in oklab, var(--foreground) 40%, transparent)'} /></span>
            )}
          </span>,
          minutes > 0 && <span key="minutes"><Rolling text={num(minutes)} /> {minutes === 1 ? 'minute' : 'minutes'}</span>,
          today && <span key="time" data-writer-time>{clock(Date.now())}</span>,
          // Its two controls only once writing mode has begun (the page faded): before that there is nothing for them to do.
          // A sound chosen stays reachable whenever the line shows, so whatever is playing can always be turned off here.
          today && (writingNow || (settings?.writingSound ?? 'off') !== 'off') && <WritingSound key="sound" className="pointer-events-auto -mx-1.5" />,
          // Quietly here: the rest of the page stays gone till Esc, not just till a pause.
          // How to leave, said once writing mode has begun: nothing else ends it.
          writingNow && <span key="leave" data-writing-leave>Esc to leave</span>
        ].filter(Boolean).flatMap((one, i) => (i ? [<span key={`dot-${i}`} aria-hidden>·</span>, one] : [one]))}
      </span>
    </div>,
    document.body
  )
}

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { WritingSound } from './writing-sound'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'

import { useCounts } from '@/components/count/word-count'
import { misspeltAt, wordAt, type Misspelling } from '@/components/turn-into/spelling'
import { spellFixes } from '@/lib/grammar'
import { useStill } from '@/lib/motion'
import { useLive, haligtree, type Settings } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { read as aimOf } from '@/components/count/word-aim'
import { Kbd, Rolling } from './ui'
import { clock, num } from '../../../../main/dates'

/**
 * Today's writing as a page rather than a form: a still caption over the
 * words for the time of day, the rest of the page stepping back while you
 * write, a caret that glides, and the count kept in view at the window's
 * foot (WriterLine). The look is main.css, read from `data-day-typing` and
 * `data-day-writing` on the root.
 */

/** The caption over today's words, for the hour the page opened in. */
export const dayCaption = (hour = new Date().getHours()): string =>
  hour < 12 ? 'Morning pages: whatever is on your mind.'
    : hour < 18 ? 'Afternoon pages: wherever the day has got to.'
      : 'Evening pages: what happened, what stayed with you.'

/** A pause this long and you are no longer typing: the count and the squiggles come back. */
const TYPING = 1200
/** A pause this long, and what stepped back comes back. */
const BACK = 9000
/** A hand on the pointer means it when it travels this far, in px, within MOVE ms: a jiggle is not a move. */
const REACH = 40
const MOVE = 300
/** Words typed in a run before the rest of the page steps back. */
const WORDS_IN = 3
/** A gap between keys longer than this is not time spent writing. */
const GAP = 20_000

const timeKey = (day: string): string => `day-time:${day}`
const timeOf = (day: string): number => { try { return Number(localStorage.getItem(timeKey(day))) || 0 } catch { return 0 } }
const keepTime = (day: string, ms: number): void => { try { localStorage.setItem(timeKey(day), String(Math.round(ms))) } catch { /* only a nicety */ } }

/** How far the words slide to sit in the window's middle while the rest is gone; never past the room the page has. */
const shiftOf = (box: HTMLElement): number => {
  // The whole pane slides (main.css): its card clips, so the words alone could not go past its edge.
  const pane = box.closest<HTMLElement>('[data-pane]')
  if (!pane) return 0
  const slid = parseFloat(getComputedStyle(pane).translate) || 0
  const rect = box.getBoundingClientRect()
  const room = pane.getBoundingClientRect()
  const want = window.innerWidth / 2 - (rect.left - slid + rect.width / 2)
  return Math.max(Math.min(want, window.innerWidth - 8 - (room.right - slid)), 8 - (room.left - slid))
}

/**
 * Typing in the day's words: the count goes at the first key,
 * and a few words in the rest of the page fades to nothing, the sidebar with
 * it, and the words slide calmly to the window's middle (main.css). A
 * deliberate move of the pointer, about nine seconds' pause, or Esc brings it
 * all back; with "Stay in writing mode" on, only Esc. Keeps the time spent
 * writing that day, too.
 */
export function useWritingQuiet(editor: Editor | null, day: string): number {
  const [spent, setSpent] = useState(() => timeOf(day))
  const stay = useLive(haligtree.settings, null as Settings | null)?.writingStay === true
  useEffect(() => {
    setSpent(timeOf(day))
    const dom = editor?.view.dom
    if (!dom || editor.isDestroyed) return
    const root = document.documentElement
    let typed = 0
    let words = 0
    let last = 0
    let from: { x: number; y: number; t: number } | null = null
    const quiet = (): void => {
      clearTimeout(typed)
      root.removeAttribute('data-day-typing')
      setSpent(timeOf(day))
    }
    const back = (): void => {
      words = 0
      root.removeAttribute('data-day-writing')
    }
    const writing = (): void => {
      if (root.hasAttribute('data-day-writing')) return
      const box = dom.closest<HTMLElement>('[data-day-write]')
      root.style.setProperty('--mf-day-shift', `${box ? Math.round(shiftOf(box)) : 0}px`)
      root.setAttribute('data-day-writing', '')
    }
    let backLater = 0
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
      clearTimeout(backLater)
      if (!stay) backLater = window.setTimeout(back, BACK)
    }
    // Only a hand that means it: REACH px in MOVE ms. A jiggle, or the move Chromium fires at a still pointer as the page changes, is not one.
    const onMove = (event: PointerEvent): void => {
      if (stay || !root.hasAttribute('data-day-writing')) return void (from = null)
      const now = { x: event.screenX, y: event.screenY, t: event.timeStamp }
      if (!from || now.t - from.t > MOVE) return void (from = now)
      if (Math.hypot(now.x - from.x, now.y - from.y) >= REACH) back()
    }
    // Esc brings it all back at once, and is taken: it is not the page's Esc too.
    const onEsc = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !root.hasAttribute('data-day-writing') || document.querySelector('[data-room]')) return
      event.preventDefault()
      event.stopPropagation()
      back()
    }
    const off = (): void => (quiet(), stay ? undefined : back())
    dom.addEventListener('keydown', onKey, true)
    window.addEventListener('keydown', onEsc, true)
    window.addEventListener('pointermove', onMove, true)
    dom.addEventListener('blur', off)
    window.addEventListener('blur', off)
    return () => {
      off()
      clearTimeout(backLater)
      back()
      dom.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keydown', onEsc, true)
      window.removeEventListener('pointermove', onMove, true)
      dom.removeEventListener('blur', off)
      window.removeEventListener('blur', off)
    }
  }, [editor, day, stay])
  return spent
}

/**
 * A caret in the accent colour, a touch thicker than the system's, that
 * glides to each new letter and blinks slowly once you pause. With the caret
 * on a word the spellchecker flags, its first suggestion comes on a pause in
 * a small pill clear of the words (under the word on the last line, else in
 * the margin beside its line), and Tab takes it. Under reduced motion the editor keeps a plain accent
 * caret of its own (main.css), and this draws only the suggestion.
 */
/**
 * A long day's page kept to a height on the Journal (about a third of the window), its foot fading with a
 * "Show the whole page" under it, so the day's tasks stay near. It opens whole, smoothly, on that, on a click
 * in the words, or once you write (writing mode), and stays open until you leave the page.
 */
/** How many letters apart two words are (added, dropped or changed), stopping early past 2. */
const apart = (a: string, b: string): number => {
  if (Math.abs(a.length - b.length) > 2) return 3
  let row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    row = next
  }
  return row[b.length]
}

export function PageCap({ editor }: { editor: Editor | null }): React.JSX.Element | null {
  const [more, setMore] = useState(0)
  const [open, setOpen] = useState(false)
  const openRef = useRef(open)
  openRef.current = open
  const reveal = useRef<() => void>(() => {})
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const dom = editor.view.dom as HTMLElement
    const box = dom.closest<HTMLElement>('[data-day-write]')
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
      if (to > from + 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) frame.animate([{ height: `${from}px`, overflow: 'hidden' }, { height: `${to}px`, overflow: 'hidden' }], { duration: Math.min(700, 260 + (to - from) / 4), easing: 'cubic-bezier(0.23, 1, 0.32, 1)' })
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
  }, [editor])
  if (open || more < 1) return null
  return (
    <div data-page-more className="relative z-[2] -mt-9 flex justify-center">
      <button type="button" onClick={() => reveal.current()} className="flex h-7 items-center gap-1.5 rounded-full border border-foreground/10 bg-background px-3 text-control text-muted-foreground shadow-xs transition-colors hover:text-foreground">
        Show the whole page<span className="tabular-nums text-muted-foreground/80">· {more} more {more === 1 ? 'line' : 'lines'}</span><ChevronDown aria-hidden className="size-3.5" />
      </button>
    </div>
  )
}

export function LivingCaret({ editor }: { editor: Editor | null }): React.JSX.Element | null {
  const calm = useStill()
  const caret = useRef<HTMLSpanElement>(null)
  const [hint, setHint] = useState<(Misspelling & { x: number; y: number; h: number; end?: boolean }) | null>(null)
  const shownHint = useRef(hint)
  shownHint.current = hint
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const dom = editor.view.dom
    const box = dom.closest<HTMLElement>('[data-day-write]')
    if (!box) return
    let frame = 0
    let still = 0
    const place = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (editor.isDestroyed) return
        const { selection } = editor.state
        const on = editor.isFocused && selection.empty && document.hasFocus()
        setShown(on)
        if (!on) return setHint(null)
        const at = editor.view.coordsAtPos(selection.head)
        const from = box.getBoundingClientRect()
        const x = at.left - from.left
        // The room scrolls inside itself: its own scroll counts.
        const y = at.top - from.top + box.scrollTop
        const h = at.bottom - at.top
        const one = caret.current
        if (one) {
          one.style.translate = `${x}px ${y}px`
          one.style.height = `${h}px`
          // Moving: solid; a beat after it rests, the slow blink.
          one.removeAttribute('data-resting')
          clearTimeout(still)
          still = window.setTimeout(() => one.setAttribute('data-resting', ''), 600)
        }
        const resting = !document.documentElement.hasAttribute('data-day-typing')
        const flagged = resting ? misspeltAt(editor, at.left - 1, (at.top + at.bottom) / 2) : null
        // Underlined but with nothing from the page's checker (its list is short): Harper's dictionary, asked once
        // per word, and shown only if the caret is still on that word. Names (a capital) are left alone.
        if (resting && !flagged?.suggestions.length) {
          const here = wordAt(editor, at.left - 1, (at.top + at.bottom) / 2)
          if (here && here.word.length > 2 && here.word === here.word.toLowerCase()) {
            void spellFixes(here.word).then((fixes) => {
              const now = editor.state.selection.head
              if (!fixes.length || editor.isDestroyed || now < here.from || now > here.to || editor.state.doc.textBetween(here.from, here.to) !== here.word) return
              const word = editor.view.coordsAtPos(here.from)
              setHint({ ...here, suggestions: fixes, x: word.left - from.left + box.scrollLeft, y: y + h + 2, h })
            })
          }
        }
        // Tab offers only a likely fix: for a word in lower case, a capitalised one only when it is that word with a
        // capital ("monday" to "Monday") or a letter off, never a different name ("Sligo" for "slsig").
        const best = flagged?.suggestions[0]
        if (!best || (flagged.word === flagged.word.toLowerCase() && best !== best.toLowerCase() && apart(best.toLowerCase(), flagged.word) > 1)) return setHint(null)
        // Right under the word it fixes, as the Mac's own autocorrect bubble sits: its left edge at the word's, just
        // below its line, over the next line if there is one (it goes as you type on).
        const word = editor.view.coordsAtPos(flagged.from)
        setHint({ ...flagged, x: word.left - from.left + box.scrollLeft, y: y + h + 2, h })
      })
    }
    // Tab takes the suggestion while it shows; otherwise Tab is the editor's.
    const onKey = (event: KeyboardEvent): void => {
      const flagged = shownHint.current
      const word = flagged?.suggestions[0]
      if (event.key !== 'Tab' || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || !flagged || !word) return
      event.preventDefault()
      event.stopImmediatePropagation()
      editor.chain().focus().command(({ tr }) => (tr.insertText(word, flagged.from, flagged.to), true)).run()
    }
    // The squiggles come back on a pause: so does the suggestion.
    const watch = new MutationObserver(place)
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-day-typing'] })
    editor.on('selectionUpdate', place)
    editor.on('update', place)
    editor.on('focus', place)
    editor.on('blur', place)
    dom.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', place)
    place()
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(still)
      watch.disconnect()
      editor.off('selectionUpdate', place)
      editor.off('update', place)
      editor.off('focus', place)
      editor.off('blur', place)
      dom.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', place)
    }
  }, [editor])
  return (
    <>
      {!calm && <span ref={caret} aria-hidden data-living-caret data-shown={shown || undefined} className="mf-living-caret" />}
      {hint && (
        <span aria-hidden data-spell-hint className="mf-spell-hint pointer-events-none absolute top-0 left-0 z-[3] inline-flex h-6 items-center gap-1.5 rounded-full border border-foreground/10 bg-background ps-2.5 pe-1 text-control whitespace-nowrap text-foreground/80 shadow-xs"
          style={{ translate: hint.end ? `calc(${hint.x}px - 100%) ${hint.y}px` : `${hint.x}px ${hint.y}px` }}>
          {hint.suggestions[0]}<Kbd>Tab</Kbd>
        </span>
      )}
    </>
  )
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
  const [column, setColumn] = useState<{ left: number; width: number } | null>(null)
  const held = useRef(live)
  if (!typing) held.current = live
  useEffect(() => {
    const root = document.documentElement
    const watch = new MutationObserver(() => setTyping(root.hasAttribute('data-day-typing')))
    watch.observe(root, { attributes: true, attributeFilter: ['data-day-typing'] })
    return () => watch.disconnect()
  }, [])
  // Only while the page is in use: the caret in it, or writing mode on. Read or passed by, the line keeps out of the way.
  const [inUse, setInUse] = useState(() => !!editor?.isFocused || document.documentElement.hasAttribute('data-day-writing'))
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const root = document.documentElement
    const check = (): void => setInUse(editor.isFocused || root.hasAttribute('data-day-writing'))
    const watch = new MutationObserver(check)
    watch.observe(root, { attributes: true, attributeFilter: ['data-day-writing'] })
    editor.on('focus', check)
    editor.on('blur', check)
    check()
    return () => void (watch.disconnect(), editor.off('focus', check), editor.off('blur', check))
  }, [editor])
  // Lined up with the words' column, wherever the page puts it.
  useEffect(() => {
    const dom = editor?.view.dom
    if (!dom) return
    const measure = (): void => {
      const box = dom.getBoundingClientRect()
      setColumn((was) => (was && Math.abs(was.left - box.left) < 1 && Math.abs(was.width - box.width) < 1 ? was : { left: box.left, width: box.width }))
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(dom)
    window.addEventListener('resize', measure)
    return () => (watch.disconnect(), window.removeEventListener('resize', measure))
  }, [editor])
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
  if ((!words && !today) || !column) return null
  const aim = aimOf(`day-${day}`)
  const share = aim ? Math.min(1, words / aim.words) : 0
  const minutes = Math.round(spent / 60_000)
  return createPortal(
    <div data-writer-line data-in-use={inUse || undefined} inert={!inUse} className="pointer-events-none fixed bottom-0 z-40 flex flex-col items-center pb-[1.125rem] text-sm text-muted-foreground tabular-nums transition-opacity duration-300 motion-reduce:transition-none"
      style={{ left: column.left, width: column.width, opacity: inUse ? 1 : 0 }}>
      <span className="flex items-center justify-center gap-3">
        {[
          words > 0 && <span key="words" data-writer-words className="inline-flex items-center gap-2">
            <span><Rolling text={num(words)} /> {words === 1 ? 'word' : 'words'}{aim ? ` of ${num(aim.words)}` : ''}</span>
            {/* The aim as a short meter beside its count, never a rule across the page. */}
            {aim && (
              <span data-writer-aim aria-hidden className="relative h-1 w-10 overflow-hidden rounded-full bg-foreground/10">
                <span className={`absolute inset-0 origin-left rounded-full transition-transform duration-700 ${share >= 0.9 ? 'bg-primary' : 'bg-foreground/40'}`}
                  style={{ transform: `scaleX(${share})`, transitionTimingFunction: 'var(--mf-ease)' }} />
              </span>
            )}
          </span>,
          minutes > 0 && <span key="minutes"><Rolling text={num(minutes)} /> {minutes === 1 ? 'minute' : 'minutes'}</span>,
          today && <span key="time" data-writer-time>{clock(Date.now())}</span>,
          today && <WritingSound key="sound" className="pointer-events-auto -mx-1.5" />,
          // Quietly here: the rest of the page stays gone till Esc, not just till a pause.
          today && <button key="stay" type="button" data-writing-stay data-on={settings?.writingStay || undefined} aria-pressed={!!settings?.writingStay}
            title="The rest of the page stays gone until you press Esc"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => (chime('tap'), void haligtree.setSettings({ writingStay: !settings?.writingStay }))}
            className="pointer-events-auto -mx-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:text-foreground data-on:bg-accent data-on:text-foreground">Stay in writing mode</button>
        ].filter(Boolean).flatMap((one, i) => (i ? [<span key={`dot-${i}`} aria-hidden>·</span>, one] : [one]))}
      </span>
    </div>,
    document.body
  )
}

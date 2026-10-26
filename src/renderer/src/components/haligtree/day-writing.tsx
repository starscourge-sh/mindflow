import { useEffect, useRef, useState } from 'react'
import { WritingSound } from './writing-sound'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'

import { useCounts } from '@/components/count/word-count'
import { misspeltAt, type Misspelling } from '@/components/turn-into/spelling'
import { useStill } from '@/lib/motion'
import { read as aimOf } from '@/components/count/word-aim'
import { Rolling } from './ui'
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
const BACK = 3000
/** Words typed in a run before the rest of the page steps back. */
const WORDS_IN = 3
/** A gap between keys longer than this is not time spent writing. */
const GAP = 20_000

const timeKey = (day: string): string => `day-time:${day}`
const timeOf = (day: string): number => { try { return Number(localStorage.getItem(timeKey(day))) || 0 } catch { return 0 } }
const keepTime = (day: string, ms: number): void => { try { localStorage.setItem(timeKey(day), String(Math.round(ms))) } catch { /* only a nicety */ } }

/**
 * Typing in the day's words: the count goes at the first key,
 * and a few words in the rest of the page fades to near nothing. A hand on the
 * pointer, or a few seconds' pause, brings it all back. Only opacity changes,
 * so nothing moves. Keeps the time spent writing that day, too.
 */
export function useWritingQuiet(editor: Editor | null, day: string): number {
  const [spent, setSpent] = useState(() => timeOf(day))
  useEffect(() => {
    setSpent(timeOf(day))
    const dom = editor?.view.dom
    if (!dom || editor.isDestroyed) return
    const root = document.documentElement
    let typed = 0
    let words = 0
    let last = 0
    let at: { x: number; y: number } | null = null
    const quiet = (): void => {
      clearTimeout(typed)
      root.removeAttribute('data-day-typing')
      setSpent(timeOf(day))
    }
    const back = (): void => {
      words = 0
      root.removeAttribute('data-day-writing')
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
      if ((event.key === ' ' || event.key === 'Enter') && ++words >= WORDS_IN) root.setAttribute('data-day-writing', '')
      clearTimeout(backLater)
      backLater = window.setTimeout(back, BACK)
    }
    // Only a hand that moves: Chromium fires a move at a still pointer as the page changes under it.
    const onMove = (event: PointerEvent): void => {
      const was = at
      at = { x: event.screenX, y: event.screenY }
      if (was && Math.abs(was.x - at.x) + Math.abs(was.y - at.y) < 3) return
      back()
    }
    const off = (): void => (quiet(), back())
    dom.addEventListener('keydown', onKey, true)
    window.addEventListener('pointermove', onMove, true)
    dom.addEventListener('blur', off)
    window.addEventListener('blur', off)
    return () => {
      off()
      clearTimeout(backLater)
      dom.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointermove', onMove, true)
      dom.removeEventListener('blur', off)
      window.removeEventListener('blur', off)
    }
  }, [editor, day])
  return spent
}

/**
 * A caret in the accent colour, a touch thicker than the system's, that
 * glides to each new letter and blinks slowly once you pause. With the caret
 * on a word the spellchecker flags, its first suggestion sits quietly beside
 * it, and ⌥↵ takes it. Under reduced motion the editor keeps a plain accent
 * caret of its own (main.css), and this draws only the suggestion.
 */
export function LivingCaret({ editor }: { editor: Editor | null }): React.JSX.Element | null {
  const calm = useStill()
  const caret = useRef<HTMLSpanElement>(null)
  const [hint, setHint] = useState<(Misspelling & { x: number; y: number; h: number }) | null>(null)
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
        const flagged = document.documentElement.hasAttribute('data-day-typing') ? null : misspeltAt(editor, at.left - 1, (at.top + at.bottom) / 2)
        setHint(flagged?.suggestions.length ? { ...flagged, x: editor.view.coordsAtPos(flagged.to).left - from.left + box.scrollLeft, y, h } : null)
      })
    }
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.altKey && event.key === 'Enter')) return
      const caretAt = editor.view.coordsAtPos(editor.state.selection.head)
      const flagged = misspeltAt(editor, caretAt.left - 1, (caretAt.top + caretAt.bottom) / 2)
      const word = flagged?.suggestions[0]
      if (!flagged || !word) return
      event.preventDefault()
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
        <span aria-hidden data-spell-hint className="pointer-events-none absolute top-0 left-0 ms-2 text-sm whitespace-nowrap text-muted-foreground"
          style={{ translate: `${hint.x}px ${hint.y}px`, lineHeight: `${hint.h}px` }}>
          {hint.suggestions[0]} <kbd className="ms-1 font-sans text-xs opacity-70">⌥↵</kbd>
        </span>
      )}
    </>
  )
}

/**
 * The day's count, kept in view: one line at the window's foot under the
 * words' own column, set as the writing room's foot is. Words so far and
 * minutes spent, the day's word aim as a hairline filling over them if it has
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
  const words = held.current
  if (!words || !column) return null
  const aim = aimOf(`day-${day}`)
  const share = aim ? Math.min(1, words / aim.words) : 0
  const minutes = Math.round(spent / 60_000)
  return createPortal(
    <div data-writer-line className="pointer-events-none fixed bottom-0 z-40 flex flex-col items-center gap-1.5 pb-[1.125rem] text-sm text-muted-foreground tabular-nums"
      style={{ left: column.left, width: column.width }}>
      {aim && (
        <div data-writer-aim className="h-px w-full overflow-hidden rounded-full bg-foreground/10">
          <div className={`h-full origin-left transition-transform duration-700 ${share >= 0.9 ? 'bg-primary' : 'bg-foreground/40'}`}
            style={{ transform: `scaleX(${share})`, transitionTimingFunction: 'var(--mf-ease)' }} />
        </div>
      )}
      <span className="flex items-center justify-center gap-3">
        <span data-writer-words><Rolling text={num(words)} /> {words === 1 ? 'word' : 'words'}{aim ? ` of ${num(aim.words)}` : ''}</span>
        {minutes > 0 && <><span aria-hidden>·</span><span><Rolling text={num(minutes)} /> {minutes === 1 ? 'minute' : 'minutes'}</span></>}
        {today && <><span aria-hidden>·</span><span data-writer-time>{clock(Date.now())}</span></>}
        {today && <><span aria-hidden>·</span><WritingSound className="pointer-events-auto -mx-1.5" /></>}
      </span>
    </div>,
    document.body
  )
}

import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { WordCount, useCounts } from '@/components/count/word-count'
import { chime } from '@/lib/sound'
import { isSession, useLive, vigil, type Focus, type Settings } from '@/lib/vigil'
import { MORE, clock, worked } from './focus-pill'
import { Tip } from './ui'
import { still } from '@/lib/motion'

/** One dot and the gap after it, in pixels: the row holds as many whole ones as fit. */
const STEP = 9

/**
 * The words a note had when a session first saw it, by session and note, so
 * opening the same note again in the same session goes on counting from there.
 */
const since = new Map<string, number>()
/** Sessions whose time-up pulse has played in this window: once each. */
const pulsed = new Set<string>()

/**
 * The focus session at the foot of the note being written in, when Settings
 * puts the timer there: the time left on the left, a row of dots across that
 * light up as the session goes, and on the right the words written in this
 * note since the session began. With no session running, or the timer kept to
 * the bubble, it is the plain word count as before.
 */
export function SessionFooter({ editor, note }: { editor: Editor | null; note: string }): React.JSX.Element {
  const focus = useLive(vigil.focusNow, null as Focus | null)
  const shows = useLive(vigil.settings, null as Settings | null)?.focusShows ?? 'bubble'
  if (!focus || shows === 'bubble') return <WordCount editor={editor} />
  return <Foot key={`${focus.id}|${note}`} editor={editor} focus={focus} note={note} />
}

function Foot({ editor, focus, note }: { editor: Editor | null; focus: Focus; note: string }): React.JSX.Element {
  // Once a second is all a clock that shows seconds needs; the dots step with it.
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // As many dots as the row is wide, counted again only when it changes size.
  const row = useRef<HTMLSpanElement>(null)
  const [dots, setDots] = useState(0)
  useEffect(() => {
    const box = row.current
    if (!box) return
    const watch = new ResizeObserver(() => setDots(Math.floor(box.clientWidth / STEP)))
    watch.observe(box)
    return () => watch.disconnect()
  }, [])

  // Words now less the words there were when the session first met this note.
  // An emptied note (the box once a thought is sent) starts again from nothing.
  const words = useCounts(editor)?.words
  const key = `${focus.id}|${note}`
  if (words !== undefined && (!since.has(key) || words === 0)) since.set(key, words)
  const written = words === undefined ? 0 : Math.max(0, words - (since.get(key) ?? words))

  const done = worked(focus, now)
  const left = focus.plannedMs ? focus.plannedMs - done : null
  const over = left !== null && left <= 0
  const paused = !!focus.pausedAt
  // How many are lit: the share of the time gone, or for a session with no
  // length, one more each minute, starting the row again once it is full.
  const lit = focus.plannedMs ? Math.round(Math.min(1, done / focus.plannedMs) * dots) : dots ? Math.floor(done / 60000) % (dots + 1) : 0

  // Time up: every dot lit, and the row breathes once. Not with Motion off.
  useEffect(() => {
    if (!over || pulsed.has(focus.id) || still()) return
    pulsed.add(focus.id)
    row.current?.animate([{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], { duration: 1400, iterations: 2, easing: 'ease-in-out' })
  }, [over, focus.id])

  // The dots are one painted row, not an element each: a lit run laid over the
  // faint ones, as wide as the dots it covers.
  const paint = (strength: number): string =>
    `radial-gradient(circle at center, color-mix(in oklab, var(--tt-brand-color-400) ${strength}%, transparent) 1.5px, transparent 2px) 0 50% / ${STEP}px 100% repeat-x`

  return (
    <div className="mf-session-foot pointer-events-none absolute inset-x-0 bottom-0 z-20 flex h-9 items-center gap-4 px-5 font-mono text-[11px] text-muted-foreground tabular-nums select-none">
      {/* The time is also how to pause: with the time in the note alone, the bubble's buttons are not there. */}
      <button
        type="button"
        disabled={over}
        title={paused ? 'Resume' : over ? undefined : 'Pause'}
        aria-label={over ? "Time's up" : `${paused ? 'Paused' : left !== null ? `${clock(left)} left` : `${clock(done)} so far`}. ${paused ? 'Resume' : 'Pause'}`}
        onClick={() => void (paused ? vigil.resumeSession(focus.id) : vigil.pauseSession(focus.id)).then(() => chime(paused ? 'on' : 'off'))}
        className={`pointer-events-auto -mx-1 min-w-[9ch] shrink-0 rounded px-1 text-left whitespace-nowrap transition-colors hover:text-foreground disabled:hover:text-muted-foreground ${over ? 'text-[var(--tt-brand-color-400)]' : ''}`}
      >
        {focus.kind === 'break' && !over ? 'Break · ' : ''}{over ? (focus.kind === 'break' ? "Break's over" : "Time's up") : paused ? 'Paused' : clock(left ?? done)}
      </button>
      {/* Up, with the time kept in the note: ten more minutes from here too, as the bubble offers. */}
      {over && (
        <Tip label="Ten more minutes  ⌃⌥⌘="><button type="button" data-foot-more onClick={() => void vigil.extendSession(focus.id, MORE).then((ok) => ok === false && chime('nope'))}
          className="pointer-events-auto -mx-1 shrink-0 rounded px-1 font-semibold text-foreground transition-colors hover:bg-accent">
          +10 min
        </button></Tip>
      )}
      {/* And the way to finish it: the bubble is not on screen to answer its bell. */}
      {over && (
        <Tip label={focus.kind === 'break' ? 'End the break' : isSession(focus) ? 'Finish the session' : 'Stop the timer'}><button type="button" data-foot-done
          onClick={() => void (isSession(focus) ? vigil.endSession(focus.id, '', false) : vigil.cancelSession(focus.id)).then(() => chime('done'))}
          className="pointer-events-auto -mx-1 shrink-0 rounded px-1 font-semibold text-foreground transition-colors hover:bg-accent">
          Done
        </button></Tip>
      )}
      <span ref={row} aria-hidden className="relative h-2 min-w-0 flex-1">
        <span className="absolute inset-y-0 left-0" style={{ width: dots * STEP, background: paint(32) }} />
        {/* As wide as the row of dots, cut to what is lit: a clip, not a scale, so the lit dots stay round and over the faint ones. */}
        <span
          className="absolute inset-y-0 left-0 transition-[clip-path] duration-700 ease-(--mf-ease)"
          style={{ width: dots * STEP, clipPath: `inset(0 ${dots ? 100 - ((over ? dots : lit) / dots) * 100 : 100}% 0 0)`, background: paint(paused ? 50 : 85) }}
        />
      </span>
      <Tip label="Words written in this note this session"><span className="pointer-events-auto shrink-0">{written} {written === 1 ? 'word' : 'words'}</span></Tip>
    </div>
  )
}

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarDays, Gem, ListTodo, NotebookText, Plus } from 'lucide-react'
import { EASE, spring } from '@/lib/motion'
import { STORY_DAY } from '@/lib/welcome-box'
import { gemOf, story, taskPhrase, type Story } from '@/lib/welcome-stories'
import { when } from '@/lib/clock'
import { useFitPicture } from '@/lib/fit-text'
import { readTask } from '../../../../main/task-words'
import { FileText as Article, Brain, Eye, ListTodo as Check } from '@/components/ui/icons'
import sherlockPrint from '@/assets/welcome-books/sherlock.webp'
import frankensteinPrint from '@/assets/welcome-books/frankenstein.webp'
import draculaPrint from '@/assets/welcome-books/dracula.webp'
import pridePrint from '@/assets/welcome-books/pride.webp'
import odysseyPrint from '@/assets/welcome-books/odyssey.webp'

/**
 * The welcome's Write chapter: the thought about a book caught in Catch
 * grows into a page (a print from the book, then one written paragraph),
 * and a drawn pointer selects two phrases in it (dragged across, then
 * "Make a task" or "Make a gem" pressed beside the selection), one made a
 * task (its day read from the words, by the same reader the app uses,
 * task-words.ts) and two gems: one kept as it is, which comes back now and
 * then, and the last sentence with a question for Review. Every card is
 * drawn as the app draws it (the box, a page, the bar, a task row with its
 * date, the gem card), each picked phrase and the card it becomes in one
 * colour, a line drawn from the very words to the card. Pictures only:
 * nothing here takes a click. Still (a skip, Motion off, Reduce motion), it
 * is all there at once.
 */

/** The two things the note becomes, each in its own colour: its mark in the note and its card share it. */
export const HUE = {
  task: { ink: 'var(--primary)', wash: 'color-mix(in oklab, var(--primary) 16%, transparent)' },
  gem: { ink: 'var(--tt-color-text-pink)', wash: 'color-mix(in oklab, var(--tt-color-text-pink) 22%, transparent)' }
} as const

/** Each story's picture, a print from the book itself (assets/welcome-books/SOURCES.txt), and where its crop sits. */
const PRINT: Record<Story['id'], { src: string; focus: string }> = {
  sherlock: { src: sherlockPrint, focus: '72% 45%' },
  frankenstein: { src: frankensteinPrint, focus: '50% 35%' },
  dracula: { src: draculaPrint, focus: '50% 45%' },
  pride: { src: pridePrint, focus: '50% 25%' },
  odyssey: { src: odysseyPrint, focus: '50% 50%' }
}

/**
 * The story told now (welcome-stories.ts, picked as the welcome opens), in the words Catch, Write, Remember
 * and the sandbox (sandbox-seed.ts) show. The page is its sentences as one paragraph, then the step the
 * thinking asks for, written where it came up with its day: "I should ... on Friday." That phrase becomes
 * the task; the last of its own sentences becomes the gem.
 */
export function flowWords(): { id: Story['id']; book: string; author: string; caught: string; note: string; words: string[]; phrase: string; task: string; kept: string; gem: string; question: string } {
  const one = story()
  return { id: one.id, book: one.book, author: one.author, caught: one.caught, note: one.note, words: one.words, phrase: taskPhrase(one, STORY_DAY), task: one.task, kept: one.kept, gem: gemOf(one), question: one.question }
}

/** The task as the app reads it from the page's phrase: only its day is read, its name kept as written (so "first night" stays words, not a time). */
export function flowTask(): { title: string; due: string | null; allDay: boolean } {
  const words = flowWords()
  const read = readTask(words.phrase, new Date(), [{ from: 0, to: words.task.length }])
  return { title: words.task, due: read.due, allDay: read.allDay }
}

/** What each card says of itself, under it. */
const FLOW_SAID = {
  caught: 'Caught on a walk',
  page: 'Written out as a page, in “Writing”',
  task: `Now a task, due ${STORY_DAY}`,
  /** How each gem comes back, said as the Gems list says it under a gem (items-view.tsx, rowOf), beside the same mark. */
  kept: 'Shows up now and then in the app',
  gem: '“Review” asks you as you start to forget'
}

const FLOW_LAST = 'Nothing is copied out: each one stays linked to its line in the note.'

/**
 * How far it has got: `shown` cards set down (the caught thought, the note,
 * the task, the gem), the line `picked` with the bar over it and whether its
 * button is `pressed`, `lit` lines marked in the note, the gem's question
 * typed so far, and the closing line.
 */
export type FlowShot = { /** The caught thought, typed so far. */ caught: string; /** "New page", offered beside the capture and then pressed. */ newPage: 'off' | 'shown'; /** The page's title, typed so far. */ title: string; /** How many of the page's lines are written. */ body: number; shown: number; picked: Pick | null; pressed: boolean; lit: number; question: string; last: boolean; cursor: Aim | null; bar: boolean }
/** A phrase picked out of the page: the task, the plain gem (kept as it is), or the gem with a question. */
export type Pick = 'task' | 'kept' | 'gem'
/** The order they are picked and set down in, each marked when `lit` reaches its place (1, 2, 3). */
export const PICKS: readonly Pick[] = ['task', 'kept', 'gem']
/** Where the pointer is headed: a picked line's start, its end (dragging the selection across it), or its "Make a" button. */
export type Aim = { line: Pick | 'page'; to: 'start' | 'end' | 'button' }
export const FLOW_START: FlowShot = { caught: '', newPage: 'off', title: '', body: 0, shown: 1, picked: null, pressed: false, lit: 0, question: '', last: false, cursor: null, bar: false }
/** How many steps the page is written in: its picture, each of its sentences, then the task's. */
export const flowParts = (): number => flowWords().words.length + 2
/** All of it there, in the words of the story told now. */
export function flowEnd(): FlowShot {
  const words = flowWords()
  return { caught: words.caught, newPage: 'off', title: words.note, body: flowParts(), shown: 5, picked: null, pressed: false, lit: 3, question: words.question, last: true, cursor: null, bar: false }
}
/** How long the pointer takes to travel to a line, to drag across it, and to reach its button (welcome.tsx times its beats by these). */
export const CURSOR_MS = { travel: 520, drag: 480, button: 380 }

const CARD = 'rounded-xl border border-foreground/10 bg-popover text-popover-foreground shadow-(--mf-panel-shadow)'
const EDITOR_FONT = { fontFamily: 'var(--mf-font, "Fraunces Variable", Georgia, serif)', fontVariationSettings: '"SOFT" 20, "WONK" 1' }
const SUB = 'text-[0.9375rem] leading-snug text-(--mf-wl-body)'
const HEAD = 'flex items-center gap-1.5 text-[0.8125rem] font-medium text-(--mf-wl-quiet)'
/** A text selection's own colour, as a background that can grow across the words. */
const SELECTION = 'linear-gradient(color-mix(in oklab, var(--primary) 28%, transparent), color-mix(in oklab, var(--primary) 28%, transparent))'
const SPINE = 'color-mix(in oklab, var(--muted-foreground) 55%, transparent)'

/** The lines drawn between the cards: from where each one leaves to where it lands, in its colour. */
const LINKS: { id: string; from: string; to: string; at: number; ink: string }[] = [
  { id: 'note', from: 'caught', to: 'note', at: 2, ink: SPINE },
  { id: 'task', from: 'line:task', to: 'task', at: 3, ink: `color-mix(in oklab, ${HUE.task.ink} 70%, transparent)` },
  { id: 'kept', from: 'line:kept', to: 'kept', at: 4, ink: `color-mix(in oklab, ${HUE.gem.ink} 75%, transparent)` },
  { id: 'gem', from: 'line:gem', to: 'gem', at: 5, ink: `color-mix(in oklab, ${HUE.gem.ink} 75%, transparent)` }
]

/** A card set down in its place: it fades and grows in, never moves anything else. */
function Landed({ id, on, quiet, className = '', children }: { id: string; on: boolean; quiet: boolean; className?: string; children: ReactNode }): React.JSX.Element {
  return (
    <motion.div data-flow={id} data-shown={on || undefined} className={`relative w-full ${className}`}
      initial={false} animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.95 }} transition={quiet ? { duration: 0 } : { duration: 0.35, ease: EASE }}>
      {children}
    </motion.div>
  )
}

/** The one action beside a selection, "Make a task" or "Make a gem", pressed by the pointer. A picture of it: it takes no pointer and no focus. */
function Bar({ on, pressed, at }: { on: Pick; pressed: boolean; at: Sel }): React.JSX.Element {
  const Icon = on === 'task' ? ListTodo : Gem
  return (
    <motion.span data-overlay data-bar={on} inert aria-hidden className={`pointer-events-none absolute z-20 flex ${at.beside ? '-translate-y-1/2' : '-translate-x-full'} items-center rounded-lg border border-foreground/15 bg-[color-mix(in_oklab,var(--foreground)_5%,var(--popover))] p-1 font-sans text-[0.8125rem] whitespace-nowrap text-muted-foreground shadow-(--mf-panel-shadow) select-none`}
      style={at.beside ? { left: at.x1 + BESIDE, top: at.y1 } : { left: at.x1 + 6, top: at.top - BAR_RISE }}
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: spring.fast.exit }} transition={spring.fast}>
      <motion.span className={`flex h-7 items-center gap-1.5 rounded-md px-2 transition-[background-color,color,box-shadow] duration-150 ${pressed ? 'bg-accent text-foreground shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary)_45%,transparent)]' : ''}`}
        animate={{ scale: pressed ? 0.94 : 1 }} transition={{ duration: 0.12, ease: EASE }}>
        <Icon className="size-4" style={{ color: HUE[on === 'task' ? 'task' : 'gem'].ink }} />{on === 'task' ? 'Make a task' : 'Make a gem'}
      </motion.span>
    </motion.span>
  )
}

/** Where a picked line's words run, in the picture's own space: the first letter, the last, and the top of the line. */
type Sel = { x0: number; y0: number; x1: number; y1: number; top: number; /** Room in the note to its right for the button: it sits beside the selection, not over the line above. */ beside: boolean }
/** The button sits just right of the selection; with no room there, above the line, its right edge at the selection's end. */
const BESIDE = 10
const BAR_RISE = 40
/** The least room between two lines leaving the page's edge. */
const APART = 8
/** The gems' two lines, which leave the page as one; and how far before their card it forks. */
const GEMS = ['kept', 'gem']
const FORK = 26
/** About the button's width, to know whether it fits beside. */
const BAR_W = 130

/** Haligtree's own pointer, drawn: it travels on a gentle curve (its two axes eased differently), drags, and dips as it presses. */
function Pointer({ aim, sels, pressed }: { aim: Aim; sels: Record<string, Sel>; pressed: boolean }): React.JSX.Element | null {
  const sel = sels[aim.line]
  if (!sel) return null
  const press = aim.line === 'page' ? [sel.x0 + 28, sel.y0 + 4] : sel.beside ? [sel.x1 + BESIDE + 70, sel.y1 + 2] : [sel.x1 - 38, sel.top - BAR_RISE + 18]
  const [x, y] = aim.to === 'start' ? [sel.x0, sel.y0] : aim.to === 'end' ? [sel.x1, sel.y1] : press
  const ms = (aim.to === 'end' ? CURSOR_MS.drag : aim.to === 'button' ? CURSOR_MS.button : CURSOR_MS.travel) / 1000
  // A drag runs even, with the selection; a move leads with one axis so the path bows.
  const move = aim.to === 'end'
    ? { x: { duration: ms, ease: DRAG }, y: { duration: ms, ease: DRAG } }
    : { x: { duration: ms, ease: [0.45, 0, 0.25, 1] as const }, y: { duration: ms, ease: EASE } }
  return (
    <motion.div data-cursor={aim.to} aria-hidden className="pointer-events-none absolute top-0 left-0 z-30"
      initial={{ opacity: 0, x: x + 36, y: y + 64 }} animate={{ opacity: 1, x, y }} exit={{ opacity: 0, transition: { duration: 0.2, ease: EASE } }}
      transition={{ ...move, opacity: { duration: 0.2, ease: EASE } }}>
      <motion.svg viewBox="0 0 20 22" className="-mt-[2px] -ml-[3px] block h-[22px] w-5 origin-top-left drop-shadow-[0_1px_2px_rgb(0_0_0/0.3)]"
        animate={{ scale: pressed ? 0.84 : 1 }} transition={{ duration: 0.12, ease: EASE }}>
        <path d="M3 2v15.5l4.1-3.9 2.9 6.6 2.7-1.2-2.9-6.4H16z" fill="var(--foreground)" stroke="var(--background)" strokeWidth="1.3" strokeLinejoin="round" />
      </motion.svg>
    </motion.div>
  )
}

/** A drag's pace: even, so the selection keeps up with the pointer. */
const DRAG = [0.4, 0, 0.5, 1] as const

/**
 * A phrase in the page picked out: selected as the pointer drags across it (the selection's own colour
 * growing behind the words, across a wrap too: one background, sliced), then marked as what it became,
 * a soft highlight in its colour with its small icon right after the words. The words never move.
 */
function Marked({ on, shot, quiet, children }: { on: Pick; shot: FlowShot; quiet: boolean; children: ReactNode }): React.JSX.Element {
  const lit = shot.lit >= PICKS.indexOf(on) + 1
  const picked = shot.picked === on
  const Icon = on === 'task' ? Check : Gem
  const hue = HUE[on === 'task' ? 'task' : 'gem']
  return (
    <motion.span data-mark={on} data-wash={on} data-lit={lit || undefined} data-selected={(picked && !lit) || undefined}
      className={`rounded-[3px] bg-no-repeat px-[0.08em] ${quiet ? '' : 'transition-[background-color] duration-300'}`}
      style={{ backgroundImage: SELECTION, backgroundSize: '0% 100%', backgroundColor: lit ? hue.wash : 'transparent' }}
      initial={false} animate={{ backgroundSize: picked && !lit ? '100% 100%' : '0% 100%' }}
      transition={picked && !lit && !quiet ? { duration: CURSOR_MS.drag / 1000, ease: DRAG } : { duration: 0 }}>
      {children}
      {/* The icon's room kept from the start, the icon itself only fading and growing into it: opening its own room as it
          came, it pushed the words after it, and a word at a line's end jumped down to the next line under the reader's
          eyes ("Pride" 25px down as the gem was marked, Write, 20 Nov film, 51.2s). */}
      <motion.span aria-hidden data-ink={on} className="inline-block w-[1.05em] overflow-visible align-[-0.08em] whitespace-nowrap" style={{ color: hue.ink }}
        initial={false} animate={{ opacity: lit ? 1 : 0, scale: lit ? 1 : 0.6 }} transition={quiet ? { duration: 0 } : { duration: 0.3, ease: EASE }}>
        <Icon className="ml-[0.2em] size-[0.85em]" />
      </motion.span>
    </motion.span>
  )
}

/** A gem's row in the Gems card: its icon in the gem's colour, then its words with their wash, as the page marked them. */
function GemRow({ on, words }: { on: 'kept' | 'gem'; words: string }): React.JSX.Element {
  // The card's head says gem once; each row leads with how it comes back instead, the Gems list's own mark (items-view.tsx, rowOf).
  const Mark = on === 'gem' ? Brain : Eye
  return (
    <p data-lands className="flex items-start gap-1.5 font-heading text-[1rem] leading-snug text-foreground">
      <span data-ink={on} data-comes-mark={on} className="mt-[0.3em] flex shrink-0" style={{ color: HUE.gem.ink }}><Mark className="size-3.5" /></span>
      <span><span data-wash={on} className="rounded-[3px] [box-decoration-break:clone] px-0.5" style={{ background: HUE.gem.wash }}>{words}</span></span>
    </p>
  )
}

export function FlowTree({ shot, quiet }: { shot: FlowShot; quiet: boolean }): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null)
  // The cards and their lines take the room left over the closing line: a little smaller on a short window, so the
  // closing line stays whole over the footer. Each line is measured in the picture's own space, so it follows the zoom.
  const room = useRef<HTMLElement>(null)
  useFitPicture(root, room)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [spots, setSpots] = useState<Record<string, { x0: number; x1: number; y: number }>>({})
  const [sels, setSels] = useState<Record<string, Sel>>({})
  // The story told now, kept for as long as this picture is up; and its task as the app reads it from the page: its name, and the day it read.
  const words = useMemo(flowWords, [])
  const task = useMemo(flowTask, [])
  const day = task.due ? when(task.due, task.allDay) : STORY_DAY
  const print = PRINT[words.id]
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const watch = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  // Where each card and each picked line sits, by layout (not by its scale while it lands), so a line leaves the very words it came from.
  useLayoutEffect(() => {
    const el = root.current
    if (!el || !size.w) return
    const place = (one: HTMLElement): { x0: number; x1: number; y: number } => {
      let [x, y] = [0, 0]
      for (let at: HTMLElement | null = one; at && at !== el; at = at.offsetParent as HTMLElement | null) (x += at.offsetLeft, (y += at.offsetTop))
      return { x0: x, x1: x + one.offsetWidth, y: y + one.offsetHeight / 2 }
    }
    const next: Record<string, { x0: number; x1: number; y: number }> = {}
    for (const one of el.querySelectorAll<HTMLElement>('[data-flow]')) {
      next[one.dataset.flow!] = place(one)
      // A gem's line lands on its own words' first line, not the middle of its row (the question under it would pull it down).
      const lands = one.querySelector<HTMLElement>('[data-lands]')
      if (lands) next[one.dataset.flow!].y = place(lands).y - lands.offsetHeight / 2 + parseFloat(getComputedStyle(lands).lineHeight) / 2
    }
    setSpots(next)
    // Each picked line's words, letter to letter, in the picture's space: the note's own scale (while it lands) taken out.
    const note = el.querySelector<HTMLElement>('[data-flow="note"]')
    if (!note) return
    const box = note.getBoundingClientRect()
    const k = box.width / note.offsetWidth || 1
    const at = (x: number, y: number): [number, number] => [(x - box.left - box.width / 2) / k + next.note.x0 + note.offsetWidth / 2, (y - box.top - box.height / 2) / k + next.note.y]
    const lines: Record<string, Sel> = {}
    for (const one of el.querySelectorAll<HTMLElement>('[data-mark]')) {
      const rects = [...one.getClientRects()]
      if (!rects.length) continue
      const [a, b] = [rects[0], rects[rects.length - 1]]
      const [x0, y0] = at(a.left, (a.top + a.bottom) / 2)
      const [x1, y1] = at(b.right, (b.top + b.bottom) / 2)
      lines[one.dataset.mark!] = { x0, y0, x1, y1, top: at(a.left, a.top)[1],
        // Beside the words only where the paragraph ends with them; with words after them, above, as an editor's menu sits, so it covers no words of their line.
        beside: !one.parentElement?.nextElementSibling && x1 + BESIDE + BAR_W <= next.note.x1 - 12 }
    }
    // "New page", for the pointer to press.
    const button = el.querySelector<HTMLElement>('[data-new-page]')
    if (button) {
      const spot = place(button)
      lines.page = { x0: spot.x0, y0: spot.y, x1: spot.x1, y1: spot.y, top: spot.y, beside: false }
    }
    setSels(lines)
  }, [size.w, size.h])
  const draw = quiet ? { duration: 0 } : { duration: 0.45, ease: EASE }
  const fade = quiet ? { duration: 0 } : { duration: 0.3, ease: EASE }
  const typing = shot.question.length > 0 && shot.question !== words.question
  // Where each picked phrase's line leaves the page's edge: level with its last line of words, top to bottom; two phrases ending on the same line of words part by a few pixels, so their lines never lie on one another.
  const leave: Record<string, number> = {}
  let above = -Infinity
  for (const one of PICKS.filter((pick) => sels[pick]).sort((a, b) => sels[a].y1 - sels[b].y1)) above = leave[one] = Math.max(sels[one].y1, above + APART)
  // Grown from the top of its room, under the page's words: centred in it, each card set down moved every card already
  // there up by half its height (the page 12px as the gems came, Write, 19 Nov film, 53.3s).
  return (
    <figure ref={room} data-story={words.id} aria-label="The thought caught on a walk becomes a page; a phrase in it becomes a task, one sentence a gem that comes back now and then, and another a gem with a question for Review" className="flex min-h-0 w-full flex-1 flex-col justify-start">
      <div ref={root} className="relative flex shrink-0 flex-col">
        {/* Over the cards. A picked phrase's line starts at the page's right edge, level with the phrase's last line of words (marked in place by its
            highlight and icon), and curves across to its card: it never runs through or under the paragraph. The cards stand in the order their phrases
            do in the page (both gems, then the task), so the lines never cross. */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 z-10 size-full overflow-visible">
          {LINKS.map((link) => {
            const [sel, card, to] = [link.from.startsWith('line:') ? sels[link.from.slice(5)] : undefined, spots[link.from], spots[link.to]]
            const from = sel ? spots.note && { x0: spots.note.x1, x1: spots.note.x1, y: leave[link.id] } : card && { ...card, x0: card.x1 }
            if (!from || !to) return null
            const [x1, x2, y2] = [from.x1, to.x0, to.y]
            const on = shot.shown >= link.at
            // The gems share one line out of the page, from between their two phrases, that forks just before their card into a branch for each row.
            const fork = sel && GEMS.includes(link.id) && GEMS.every((one) => leave[one] !== undefined && spots[one])
            const y1 = fork ? (leave.kept + leave.gem) / 2 : from.y
            const [fx, fy] = fork ? [x2 - FORK, (spots.kept.y + spots.gem.y) / 2] : [x2, y2]
            const mx = (x1 + fx) / 2
            const d = fork
              ? `M${from.x0},${y1} H${x1} C${mx},${y1} ${mx},${fy} ${fx},${fy} C${fx + FORK / 2},${fy} ${fx + FORK / 2},${y2} ${x2},${y2}`
              : `M${from.x0},${y1} H${x1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`
            return (
              <motion.path key={link.id} data-link={link.id} d={d} fill="none" stroke={link.ink} strokeWidth={link.at > 2 ? 1.75 : 1.5} strokeLinecap="round"
                initial={false} animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }} transition={draw} />
            )
          })}
        </svg>
        <AnimatePresence>{shot.bar && shot.picked && sels[shot.picked] && <Bar key={`bar-${shot.picked}`} on={shot.picked} pressed={shot.pressed} at={sels[shot.picked]} />}</AnimatePresence>
        <AnimatePresence>{!quiet && shot.cursor && <Pointer key="pointer" aim={shot.cursor} sels={sels} pressed={shot.pressed} />}</AnimatePresence>
        {/* The caught thought on the left, the note it grew into, and what the note becomes, one above the other, at the right. */}
        <div className="grid shrink-0 items-center gap-x-[clamp(1.25rem,3.2vw,2.75rem)]" style={{ gridTemplateColumns: COLUMNS }}>
          <div className="flex flex-col gap-2">
            <Landed id="caught" on={shot.shown >= 1} quiet={quiet}>
              {/* Quick capture, as the box draws itself: the words in the editor's face, the kind chip, Create. */}
              <div className="overflow-hidden rounded-[14px] border border-foreground/10 bg-popover text-popover-foreground" style={{ boxShadow: 'var(--mf-panel-shadow), inset 0 1px 0 rgb(255 255 255 / 0.06)' }}>
                {/* Written as you watch, a key at a time, so it reads as yours; the rest of it kept in place, unseen, so nothing moves as it types. */}
                <p aria-label={words.caught} data-flow-caught={shot.caught.length} className="px-3.5 pt-3 pb-2 text-[1rem] leading-snug text-foreground" style={EDITOR_FONT}>
                  <span aria-hidden>{shot.caught}</span>
                  {!quiet && shot.caught.length < words.caught.length && <span aria-hidden className="mf-caret mf-caret-typing" />}
                  <span aria-hidden className="invisible">{words.caught.slice(shot.caught.length)}</span>
                </p>
                <div className="flex items-center gap-1.5 bg-linear-to-t from-[var(--accent)]/40 px-3 pt-1.5 pb-2.5">
                  <span className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-primary px-2 text-[0.75rem] font-medium text-foreground">
                    <NotebookText className="size-3.5" style={{ color: 'var(--tt-color-text-gray)' }} />Note
                  </span>
                </div>
              </div>
            </Landed>
            <motion.p className={SUB} initial={false} animate={{ opacity: shot.caught === words.caught ? 1 : 0 }} transition={fade}>{FLOW_SAID.caught}</motion.p>
          </div>
          <div className="relative flex flex-col gap-2">
          {/* "New page", as Writing offers it: pressed, and the capture is written out at length as a page of its own. */}
          <motion.span data-new-page aria-hidden className="pointer-events-none absolute -top-11 left-0 z-10 inline-flex h-8 items-center gap-1.5 rounded-lg border border-foreground/12 bg-popover px-2.5 text-[0.875rem] font-medium text-foreground shadow-(--mf-panel-shadow)"
            initial={false} animate={{ opacity: shot.newPage === 'shown' ? 1 : 0, y: shot.newPage === 'shown' ? 0 : 4, scale: shot.newPage === 'shown' && shot.pressed && shot.cursor?.line === 'page' ? 0.95 : 1 }} transition={fade}>
            <Plus className="size-4 text-muted-foreground" />New page
          </motion.span>
          <Landed id="note" on={shot.shown >= 2} quiet={quiet}>
            <div className={`${CARD} px-4 pt-3 pb-4`}>
              <div className="flex items-start gap-3.5">
                {/* A print from the book, set in first as the page is written: a small framed picture, as a postcard's stamp is. */}
                <motion.div data-print={words.id} className="mt-0.5 shrink-0 -rotate-2 rounded-[3px] bg-white p-[3px] shadow-[0_1px_3px_color-mix(in_oklab,var(--mf-shadow-ink)_25%,transparent)]"
                  initial={false} animate={{ opacity: shot.body >= 1 ? 1 : 0, scale: shot.body >= 1 ? 1 : 0.92 }} transition={fade}>
                  <img src={print.src} alt={`An illustration from ${words.book}`} draggable={false} className="block h-[clamp(4.25rem,11vh,6rem)] w-[clamp(3.4rem,8.8vh,4.8rem)] rounded-[1px] object-cover" style={{ objectPosition: print.focus }} />
                </motion.div>
                <div className="min-w-0 flex-1">
                  <p className={HEAD}><Article className="size-3.5" style={{ color: 'var(--tt-color-text-brown)' }} />Page</p>
                  {/* The title, written from the thought: typed, the rest kept in place unseen, so nothing moves. */}
                  <p aria-label={words.note} className="mt-1 font-heading text-[1.1875rem] leading-snug font-semibold text-foreground">
                    <span aria-hidden>{shot.title}</span>
                    {!quiet && shot.shown >= 2 && shot.title.length < words.note.length && <span aria-hidden className="mf-caret mf-caret-typing" />}
                    <span aria-hidden className="invisible">{words.note.slice(shot.title.length)}</span>
                  </p>
                  <motion.p className="mt-1 text-[0.875rem] leading-snug text-(--mf-wl-body)" initial={false} animate={{ opacity: shot.body >= 1 ? 1 : 0 }} transition={fade}>
                    <i>{words.book}</i>, {words.author}
                  </motion.p>
                </div>
              </div>
              {/* One paragraph, as it is written: a sentence at a time, each in its place from the start so the page never grows.
                  The gem's sentence and the task's phrase are marked where they stand, as a highlighter marks a book. */}
              <p className="mt-2.5 border-t border-foreground/10 pt-2.5 text-[0.9375rem] leading-[1.6] text-foreground" style={EDITOR_FONT}>
                {words.words.map((sentence, n) => (
                  <motion.span key={sentence} initial={false} animate={{ opacity: shot.body >= n + 2 ? 1 : 0 }} transition={fade}>
                    {sentence === words.gem ? <Marked on="gem" shot={shot} quiet={quiet}>{sentence}</Marked> : sentence === words.kept ? <Marked on="kept" shot={shot} quiet={quiet}>{sentence}</Marked> : sentence}{' '}
                  </motion.span>
                ))}
                <motion.span initial={false} animate={{ opacity: shot.body >= words.words.length + 2 ? 1 : 0 }} transition={fade}>
                  I should <Marked on="task" shot={shot} quiet={quiet}>{words.phrase}</Marked>.
                </motion.span>
              </p>
            </div>
          </Landed>
          <motion.p className={SUB} initial={false} animate={{ opacity: shot.body >= flowParts() ? 1 : 0 }} transition={fade}>{FLOW_SAID.page}</motion.p>
          </div>
          <div className={`flex flex-col gap-[clamp(0.5rem,1.2vh,1rem)] ${BRANCH}`}>
            {/* Both gems in one card, as the Gems list keeps them: a row each, its words, and under them how it comes back beside the list's own mark
                (items-view.tsx, rowOf): the eye for one that comes back now and then, the brain for one Review asks. Each row lands as it is made. */}
            <motion.div data-gems className={`${CARD} overflow-hidden`} initial={false}
              animate={{ opacity: shot.shown >= 4 ? 1 : 0, scale: shot.shown >= 4 ? 1 : 0.95 }} transition={quiet ? { duration: 0 } : { duration: 0.35, ease: EASE }}>
              <p className={`${HEAD} px-3.5 pt-2.5`}><Gem className="size-3.5" style={{ color: HUE.gem.ink }} />Gems</p>
              <Landed id="kept" on={shot.shown >= 4} quiet={quiet} className="px-3.5 pt-1.5 pb-2">
                <GemRow on="kept" words={words.kept} />
                <p data-comes="feed" className={`${SUB} mt-1 pl-5`}>{FLOW_SAID.kept}</p>
              </Landed>
              <Landed id="gem" on={shot.shown >= 5} quiet={quiet} className="border-t border-foreground/10 px-3.5 pt-1.5 pb-2">
                <GemRow on="gem" words={words.gem} />
                {/* The whole question kept in place unseen, so the box never grows as it is typed (a second line pushed the cards down mid-way).
                    The typed words stand at its top, where they will end: centred in the room of the whole question, they rose
                    10px as they wrapped to a second line (Write, 20 Nov film, 54.9s). The hint alone is centred in the box. */}
                <p data-question className="mt-1.5 grid min-h-7 items-start rounded-md py-1 border border-foreground/10 px-2 text-[0.875rem] leading-snug text-foreground">
                  <span aria-hidden className="invisible [grid-area:1/1]">{words.question}</span>
                  <span className="[grid-area:1/1]">
                    {shot.question || <span className="text-muted-foreground">The question it answers, for review</span>}
                    {typing && !quiet && <span className="mf-ghost-caret" data-typing="" />}
                  </span>
                </p>
                <p data-comes="review" className={`${SUB} mt-1 pl-5`}>{FLOW_SAID.gem}</p>
              </Landed>
            </motion.div>
            <Landed id="task" on={shot.shown >= 3} quiet={quiet}>
              {/* A task, as the Tasks list draws its row: the box, the name, its day under it. */}
              <div className={`${CARD} px-3.5 pt-2.5 pb-2.5`}>
                <div className={HEAD}><span data-ink="task" className="flex" style={{ color: HUE.task.ink }}><Check className="size-3.5" /></span>Task</div>
                <div className="mt-1.5 flex items-start gap-2.5">
                  <svg aria-hidden viewBox="0 0 16 16" className="mt-[0.2rem] size-4 shrink-0 text-foreground/40"><circle cx="8" cy="8" r="6.75" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
                  <div className="flex min-w-0 flex-col items-start gap-1.5">
                    <span className="text-[0.9375rem] leading-snug text-foreground">{task.title}</span>
                    <span data-wash="task" className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.8125rem] font-medium whitespace-nowrap tabular-nums" style={{ background: HUE.task.wash, color: HUE.task.ink }}>
                      <CalendarDays className="size-3.5" />{day}
                    </span>
                  </div>
                </div>
                <p className={`${SUB} mt-1.5`}>{FLOW_SAID.task}</p>
              </div>
            </Landed>
          </div>
        </div>
      </div>
      <motion.p data-flow-last className="mt-[clamp(0.625rem,2vh,2rem)] shrink-0 font-heading text-[clamp(1.125rem,min(2.6vw,3.3vh),2rem)] leading-tight text-balance text-foreground"
        initial={false} animate={{ opacity: shot.last ? 1 : 0, y: shot.last ? 0 : 8 }} transition={quiet ? { duration: 0 } : { duration: 0.45, ease: EASE }}>
        {FLOW_LAST}
      </motion.p>
    </figure>
  )
}

/** The caught thought, the note (the widest, so its lines mostly keep to one), and what it becomes. */
const COLUMNS = 'minmax(0,0.7fr) minmax(0,1.55fr) minmax(0,1.45fr)'
/** Room before what the note becomes, for the two lines to part. */
const BRANCH = 'pl-[clamp(0.5rem,2.5vw,2rem)]'

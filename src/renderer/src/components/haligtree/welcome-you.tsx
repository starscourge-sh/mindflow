import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Lightbulb } from 'lucide-react'
import { EASE } from '@/lib/motion'
import { chime } from '@/lib/sound'
import type { Setup } from '@/lib/onboarding'
import { haligtree } from '@/lib/haligtree'
import { keyFor } from '@/lib/keys'
import { Kbd, refuse } from './ui'
import { dated, dayjs } from '../../../../main/dates'
import { DatePicker } from './date-picker'
import { HashField, isTag } from './hash-field'
import { LogLine } from './goals-view'
import { GoalCardPreview } from './goal-beacon'
import { Float } from './memory-postcard'
import { sourceFrom } from './welcome-import'
import { seeded, typingWaits } from '@/lib/typing'
import { APP_NAME } from '../../../../main/name'

/**
 * The welcome's first questions, before anything is shown: what Haligtree is for
 * and what you used before; then a first space (a #tag, and for a course its
 * exam date) and a goal, both optional. Every answer is kept as it is given
 * (onboarding.ts, setup); Next then acts on them at once and says what was
 * done (Payoff), each with its own Undo. Nothing here is required: with
 * nothing answered, Next goes straight on.
 */

type Use = NonNullable<Setup['use']>
const USES: [Use, string][] = [['study', 'Study'], ['work', 'Work'], ['writing', 'Writing and reading'], ['life', 'Everyday life']]
const FROM = ['Anki', 'Obsidian', 'Notion', 'Todoist', 'Raycast', 'Apple Notes', 'Paper', 'Nothing yet']
/** A first #tag to start from, by what Haligtree is for. */
const SPACES: Record<Use, string[]> = {
  study: ['biology', 'history', 'maths'],
  work: ['project', 'clients', 'meetings'],
  writing: ['reading', 'essay', 'draft'],
  life: ['home', 'health', 'travel']
}

/** What was made from the answers, so it is made once, follows a changed answer, and can be taken back. */
type Made = NonNullable<Setup['made']>
/** A thing made from the answers that can be undone on its own. */
export type Piece = 'sidebar' | 'exam' | 'goal'

/** The day a goal is for: the day asked, else the exam's, else three months on. */
// A day already gone (kept from a welcome seen before) is not a goal's day: three months on instead.
const goalDay = (setup: Setup): string => {
  const picked = setup.goalBy ?? setup.exam
  return dayjs(picked && !dayjs(picked).isBefore(dayjs(), 'day') ? picked : dayjs().add(3, 'month')).format('YYYY-MM-DD')
}

/**
 * What was answered, done: the first tag's exam date, and the goal. Every
 * book's sidebar is the same, so no answer changes it. Safe to
 * run again: each thing is made once, follows an answer changed since, and a
 * piece undone (`undone`) is taken back and left alone. Gives the answers back
 * with what was made, to keep.
 */
export async function applySetup(setup: Setup): Promise<Setup> {
  const made: Made = { ...setup.made }
  const off = new Set(setup.undone ?? [])
  // The exam date, on the tag it is for.
  const exam = setup.space && setup.exam && !off.has('exam') ? setup.space : null
  if (made.examTag && made.examTag !== exam) await haligtree.setTag(made.examTag, { examAt: null })
  if (exam) await haligtree.setTag(exam, { examAt: setup.exam })
  made.examTag = exam
  // The goal: made once; a changed name or day makes it again, undone takes it away.
  const title = !off.has('goal') ? setup.goal?.trim() || null : null
  const by = goalDay(setup)
  if (made.goalId && (title !== made.goalTitle || by !== made.goalBy)) {
    await haligtree.dropGoal(made.goalId)
    made.goalId = null
  }
  if (title && !made.goalId) {
    made.goalId = await haligtree.newGoal(title, by)
    made.goalTitle = title
    made.goalBy = by
  }
  if (!made.goalId) made.goalTitle = made.goalBy = null
  return { ...setup, made }
}

/** Whether anything was answered that Haligtree can act on. */
export const answered = (setup: Setup): boolean =>
  !!(setup.use || setup.space || setup.goal?.trim() || setup.from.some((one) => one !== 'Nothing yet'))

/** What Haligtree will do for each use: the outcome a person came for, not how the app is arranged. */
const USE_DOES: Record<Use, string> = {
  study: 'Turn what you read into questions, and “Review” asks them back, waiting longer each time you remember them, up to the exam.',
  work: 'A task you jot down lands on its day. One made from a note keeps a link back to it.',
  writing: 'Lines you keep from your reading wait as gems, ready to pull into whatever you are drafting.',
  life: 'A recipe, a plan, a line from a film: one key from any app, and it is kept and findable.'
}
const USE_SAID: Record<Use, string> = { study: 'studying', work: 'work', writing: 'writing and reading', life: 'everyday life' }
/** For someone coming from each tool: one habit that carries over. Advice, not something set up, so it is shown apart from the ticks. */
const FROM_SAID: Record<string, string> = {
  Anki: 'Cards still wait longer each time you remember them, and each one keeps the note it came from.',
  Obsidian: 'Type [[ or @ to link notes, and “Map” draws how they connect.',
  Notion: 'Type / for headings, tables and more, as you are used to.',
  Todoist: 'Type a task with its day, like “call Sam friday 3pm”, and it lands on that day.',
  // Quick capture is opened, sent and put away the way Raycast is (App.tsx: ⌘↵ sends, the box is put away and the app you came from has the focus again). No import from Raycast is claimed: there is none.
  Raycast: 'Quick capture opens the same way: press ⌘. over any app, type, then ⌘↵, and you are back where you were.',
  'Apple Notes': 'One key from any app opens quick capture, with nothing to open first.',
  Paper: 'Write as freely as on paper, and everything stays searchable.'
}

/** The keys a tip names, as they are pressed now (changed in Settings, the new ones). */
const TIP_KEYS = ['⌘.', '⌘↵']
const keyNow = (keys: string): string => keyFor(keys) || keys

/** A tip for each tool you came from, the step to bring its notes over on the first. */
export function tipsOf(setup: Setup): { tool: string; line: string }[] {
  const from = setup.from.filter((one) => one !== 'Nothing yet' && FROM_SAID[one])
  const source = sourceFrom(setup.from)
  // The step to bring notes over goes under the app they come from, never under one with nothing to bring (Raycast, Todoist).
  return from.map((tool) => ({ tool, line: `${TIP_KEYS.reduce((line, keys) => line.replaceAll(keys, keyNow(keys)), FROM_SAID[tool])}${tool === source ? ` Bringing your ${source} notes over is one step at the end.` : ''}` }))
}

/** A tip's line with its keys drawn as keys. */
function TipLine({ line }: { line: string }): React.JSX.Element {
  const keys = TIP_KEYS.map(keyNow).filter(Boolean)
  const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = keys.length ? line.split(new RegExp(`(${keys.map(escape).join('|')})`)) : [line]
  return <>{parts.map((part, i) => (keys.includes(part) ? <Kbd key={i} className="mx-[0.1em] h-[1.3em] min-w-[1.3em] translate-y-[-0.08em] rounded-[0.3em] px-[0.3em] align-middle text-[0.72em]">{part}</Kbd> : part))}</>
}

/** A line of the summary: what was done, in a bold lead-in and a plain line, and the piece Undo takes back. */
type Row = { id: string; lead: string; line: string; piece?: Piece; undone?: boolean; /** A goal's title: how to log progress on it is said under its line. */ goal?: string }

/** What Haligtree did with the answers, a line each, from what was made. */
export function rowsOf(setup: Setup): Row[] {
  const made = setup.made ?? {}
  const off = new Set(setup.undone ?? [])
  const rows: Row[] = []
  const use = setup.use
  // What Haligtree will do for what it is for: the outcome, not how the sidebar was arranged for it (Settings, Sidebar, changes that).
  if (use) rows.push({ id: 'use', lead: `Ready for ${USE_SAID[use]}.`, line: USE_DOES[use] })
  if (setup.space) {
    rows.push({ id: 'tag', lead: `#${setup.space} is ready when you need it.`, line: 'Add it to anything you catch. Tags are easy to rename or drop later.' })
    if (setup.exam) {
      const days = dayjs(setup.exam).startOf('day').diff(dayjs().startOf('day'), 'day')
      rows.push({ id: 'exam', lead: `#${setup.space} counts down to your exam.`, line: off.has('exam') ? 'No exam date on it now.' : `${dated(setup.exam, 'dddd D MMMM')}, ${days === 1 ? 'tomorrow' : `${days} days away`}. Its page shows how ready you are.`, piece: 'exam', undone: off.has('exam') })
    }
  }
  if (setup.goal?.trim()) {
    const by = made.goalBy ?? goalDay(setup)
    const days = dayjs(by).diff(dayjs().startOf('day'), 'day')
    rows.push({ id: 'goal', lead: `“${setup.goal.trim()}” is on your Goals page.`, line: off.has('goal') ? 'Taken off again.' : `${days} days to go, until ${dated(by, 'D MMMM')}.`, piece: 'goal', undone: off.has('goal'), goal: setup.goal.trim() })
  }
  return rows
}

/** What a log line says was done, in the example: anything fits after the colon. */
const DID = 'an hour on it today'

/**
 * The answers paid off, at once: each thing Haligtree just did with them, a line
 * each, coming in one after another, every one with its own Undo (and Redo),
 * and the goal on its road. Nothing here waits for the welcome to end.
 */
export function Payoff({ setup, onChange, onBack, still }: { setup: Setup; onChange: (next: Setup) => void; onBack: () => void; still: boolean }): React.JSX.Element {
  const [busy, setBusy] = useState<string | null>(null)
  const rows = rowsOf(setup)
  const tips = tipsOf(setup)
  const flip = async (piece: Piece, undo: boolean): Promise<void> => {
    setBusy(piece)
    const undone = undo ? [...new Set([...(setup.undone ?? []), piece])] : (setup.undone ?? []).filter((one) => one !== piece)
    try {
      onChange(await applySetup({ ...setup, undone }))
      chime(undo ? 'undo' : 'settled')
    } finally {
      setBusy(null)
    }
  }
  const goal = setup.made?.goalId && setup.made.goalBy ? setup.made : null
  return (
    // With the goal's card beside it, the rows make room for it, so it never sits over an Undo.
    <div data-payoff className={`flex w-full max-w-[52rem] flex-col gap-[clamp(0.75rem,2.4vh,1.25rem)] ${goal && !(setup.undone ?? []).includes('goal') ? '[@container(min-width:1141px)]:max-w-[min(52rem,calc(100%-22rem))]' : ''}`}>
      {rows.map((row, i) => (
        <motion.div key={row.id} data-made={row.id} className="flex items-start gap-3"
          initial={still ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE, delay: still ? 0 : 0.15 + i * 0.22 }}>
          <span className={`mt-[0.3em] flex size-5 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${row.undone ? 'bg-foreground/10 text-(--mf-wl-quiet)' : 'bg-primary text-primary-foreground'}`}>
            <Check className="size-3.5" strokeWidth={2.6} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className={`font-heading text-[clamp(1.125rem,min(2.2vw,3.2vh),1.5rem)] leading-tight transition-colors duration-200 ${row.undone ? 'text-(--mf-wl-quiet) line-through decoration-foreground/30' : 'text-foreground'}`}>{row.lead}</p>
            <p className="text-[clamp(1rem,min(1.8vw,2.6vh),1.1875rem)] leading-snug text-(--mf-wl-body)">{row.line}</p>
            {/* How to log progress on it, with the line itself as quick capture shows it, and where it goes. */}
            {row.goal && !row.undone && (
              <p data-goal-how className="mt-1.5 text-[clamp(1rem,min(1.8vw,2.6vh),1.1875rem)] leading-relaxed text-foreground">
                <strong className="font-semibold">Made progress?</strong> Write it in quick capture, starting with the goal’s name: <LogLine goal={row.goal} did={DID} />. It is added to the goal’s progress log on your Goals page.
              </p>
            )}
          </div>
          {row.piece && (
            <button type="button" disabled={busy === row.piece} onClick={() => void flip(row.piece!, !row.undone)}
              className="mt-0.5 flex h-8 shrink-0 items-center rounded-[0.6rem] px-3 text-[0.9375rem] text-(--mf-wl-body) transition-colors hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.97] disabled:opacity-50">
              {row.undone ? 'Redo' : 'Undo'}
            </button>
          )}
        </motion.div>
      ))}
      {/* Tips for the tools you came from: advice, not something done, so no tick; set apart below. */}
      {tips.map((tip, i) => (
        <motion.div key={tip.tool} data-tip={tip.tool} className="flex max-w-[40rem] items-start gap-3 rounded-xl bg-foreground/[0.045] px-4 py-3"
          initial={still ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE, delay: still ? 0 : 0.15 + (rows.length + i) * 0.22 }}>
          <Lightbulb className="mt-[0.2em] size-[1.125rem] shrink-0 text-(--mf-wl-body)" strokeWidth={2} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-[0.875rem] font-semibold text-(--mf-wl-body)">From {tip.tool}</p>
            <p className="text-[clamp(1rem,min(1.8vw,2.6vh),1.1875rem)] leading-snug text-foreground"><TipLine line={tip.line} /></p>
          </div>
        </motion.div>
      ))}
      {/* The goal's card, where the questions showed it: the same card, as it sits on your desktop. */}
      {goal && !(setup.undone ?? []).includes('goal') && <GoalOnDesk title={goal.goalTitle!} by={goal.goalBy!} still />}
      <motion.p className="text-[clamp(1rem,min(1.8vw,2.6vh),1.1875rem)] text-(--mf-wl-body)" initial={still ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: still ? 0 : 0.2 + (rows.length + tips.length) * 0.22 }}>
        You can change all of it later in “Settings”.{' '}
        <button type="button" onClick={onBack} className="rounded-sm underline decoration-current/30 underline-offset-4 transition-colors hover:text-foreground hover:decoration-current/60">Change my answers</button>
      </motion.p>
    </div>
  )
}

/** Goals people set, typed into the empty goal field one after another: the one for what Haligtree is for first. */
const EXAMPLE_GOALS = ['Finish reading The Godfather', 'Watch every Studio Ghibli film', 'Read the whole Dune saga', 'Learn the Imperial March on piano', 'Run a 5K like Forrest Gump']

/** Tags people make, typed into the empty field one after another. */
const OWN_TAGS = ['reading-list', 'side-project', 'big-ideas', 'chapter-3']

/**
 * A placeholder that types itself: each example typed in a person's rhythm
 * (lib/typing.ts), held to be read, cleared, and the next. `still` (Motion off,
 * the field focused or filled) stops it on `rest`; with Motion off from the
 * start it shows the first example whole.
 */
export function useTypedHint(words: string[], still: boolean, rest: string): string {
  const off = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
  const [shown, setShown] = useState(() => (off() ? words[0] : ''))
  const [stopped, setStopped] = useState(false)
  useEffect(() => {
    if (still) return void setStopped(true)
    setStopped(false)
    if (off()) return void setShown(words[0])
    const random = seeded(7)
    const timers: ReturnType<typeof setTimeout>[] = []
    // It starts once the page's headline has been glanced at: nothing on the page moves while it is.
    let at = 1900
    // Four rounds through the list, then it rests on the first, whole.
    for (let round = 0; round < 4; round++) {
      for (const word of words) {
        typingWaits(word, random, 1.4).forEach((wait, i) => {
          at += wait
          timers.push(setTimeout(() => setShown(word.slice(0, i + 1)), at))
        })
        at += 1700
        timers.push(setTimeout(() => setShown(''), at))
        at += 350
      }
    }
    timers.push(setTimeout(() => setShown(words[0]), at))
    return () => timers.forEach(clearTimeout)
  }, [still]) // eslint-disable-line react-hooks/exhaustive-deps
  return stopped ? rest : shown
}

// A little tighter in a narrow window, so a row of picked tools (each with its tick) still fits on one line.
const CHIP = 'flex h-9 items-center gap-1.5 rounded-full border px-3.5 [@container(max-width:960px)]:px-3 text-[0.9375rem] transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]'
export const FIELD = 'h-10 min-w-0 rounded-lg border border-foreground/15 bg-popover px-3 text-[0.9375rem] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_18%,transparent)]'

function Pick({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }): React.JSX.Element {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`${CHIP} ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-foreground/15 text-foreground hover:bg-foreground/[0.05]'}`}>
      {on && <Check className="size-3.5" strokeWidth={2.6} />}{children}
    </button>
  )
}

/** A question, large, on its own line; its answers under it. */
function Ask({ said, note, children, delay = 0, still }: { said: string; note?: string; children: ReactNode; delay?: number; still: boolean }): React.JSX.Element {
  return (
    <motion.div className="flex flex-col gap-2.5" initial={still ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE, delay }}>
      {/* The note under the question, on a line of its own, so a narrow column wraps it instead of cutting it off. */}
      <p className="flex min-w-0 flex-col gap-1 font-heading text-[clamp(1.125rem,min(2.2vw,3.2vh),1.5rem)] leading-tight text-foreground">
        <span>{said}</span>
        {note && <span className="font-sans text-[0.68em] leading-snug text-pretty text-(--mf-wl-body)">{note}</span>}
      </p>
      <div className="flex flex-wrap items-center gap-2 [@container(max-width:960px)]:gap-x-1.5">{children}</div>
    </motion.div>
  )
}

export function YouPage({ setup, onChange, still }: { setup: Setup; onChange: (next: Setup) => void; still: boolean }): React.JSX.Element {
  const set = (patch: Partial<Setup>): void => {
    chime('tap')
    onChange({ ...setup, ...patch })
  }
  const use = setup.use ?? 'life'
  const picks = SPACES[use]
  const space = setup.space ?? ''
  // Your own tag as it is typed; kept (Enter, or leaving the field) it becomes a chip.
  const [own, setOwn] = useState('')
  const [focused, setFocused] = useState(false)
  // Examples type themselves into the empty field, as quick capture's hints do; it stops once you are in it.
  const hint = useTypedHint(OWN_TAGS, still || focused || !!own, 'your own tag')
  // The goal field types its examples the same way, until you are in it.
  const [inGoal, setInGoal] = useState(false)
  const goalHint = useTypedHint(EXAMPLE_GOALS, still || inGoal || !!setup.goal, 'Your goal')
  // While an example types itself into the empty field, the card shows it too, marked as an example, so the card is seen
  // before a goal comes to mind. Between examples it keeps the last one, so it never blinks out. Never saved: only shown.
  const lastExample = useRef(EXAMPLE_GOALS[0])
  if (goalHint && goalHint !== 'Your goal') lastExample.current = goalHint
  const example = !setup.goal && !inGoal ? (goalHint && goalHint !== 'Your goal' ? goalHint : lastExample.current) : ''
  // The goal as its card on the desktop, once typing pauses: what will sit there, in your words.
  const [shownGoal, setShownGoal] = useState(setup.goal?.trim() ?? '')
  useEffect(() => {
    const goal = setup.goal?.trim() ?? ''
    const timer = setTimeout(() => setShownGoal(goal), goal ? 400 : 0)
    return () => clearTimeout(timer)
  }, [setup.goal])
  const keepOwn = (): void => {
    const tag = own.replace(/-+$/, '')
    if (!tag) return
    if (!isTag(tag)) return void chime('nope')
    setOwn('')
    set({ space: tag })
  }
  return (
    // Where the goal's card shows beside them, the questions make room for it, so a long row of chips wraps rather than runs under it.
    <div className="flex w-full max-w-[52rem] flex-col gap-[clamp(1rem,3.2vh,1.75rem)] [@container(min-width:1141px)]:max-w-[min(52rem,calc(100%-22rem))]">
      {/* Start from what is on your mind: it is your first capture, in the Inbox. Old notes can come over later. */}
      <Ask said="What's on your mind?" note="It becomes your first note. Old notes can come over at the end." still={still}>
        <FirstCapture setup={setup} onChange={onChange} />
      </Ask>
      <Ask said={`What is ${APP_NAME} for, mostly?`} delay={0.04} still={still}>
        {USES.map(([id, label]) => <Pick key={id} on={setup.use === id} onClick={() => set({ use: setup.use === id ? null : id })}>{label}</Pick>)}
      </Ask>
      <Ask said="What did you use before?" note="Any that apply" delay={0.08} still={still}>
        {FROM.map((name) => {
          const on = setup.from.includes(name)
          // Nothing yet stands alone; anything else takes it away.
          const next = on ? setup.from.filter((one) => one !== name) : name === 'Nothing yet' ? [name] : [...setup.from.filter((one) => one !== 'Nothing yet'), name]
          return <Pick key={name} on={on} onClick={() => set({ from: next })}>{name}</Pick>
        })}
      </Ask>
      <Ask said="Your first tag" note={use === 'study' ? 'A course, and its exam date' : 'For a project, a book or a subject'} delay={0.16} still={still}>
        {picks.map((tag) => <Pick key={tag} on={space === tag} onClick={() => set({ space: space === tag ? null : tag })}>#{tag}</Pick>)}
        {/* Your own, once kept: a chip like the others, picked. */}
        {space && !picks.includes(space) && <Pick on onClick={() => set({ space: null })}>#{space}</Pick>}
        <HashField aria-label="Your own tag" placeholder={hint} value={own} maxLength={41}
          onFocus={() => setFocused(true)}
          className={`${FIELD} w-44 focus-within:border-primary/60 focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_18%,transparent)]`}
          onChange={setOwn}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            event.stopPropagation()
            keepOwn()
          }}
          onBlur={() => (setFocused(false), keepOwn())} />
        {use === 'study' && space && (
          <DatePicker value={setup.exam} onChange={(exam) => set({ exam })} placeholder="Exam date" suggest={['in 1 month', 'in 3 months']} className="h-10 border border-foreground/15 bg-popover" />
        )}
      </Ask>
      <Ask said="A goal, if you have one" note="Optional" delay={0.24} still={still}>
        <input aria-label="A goal" className={`${FIELD} w-[min(24rem,100%)]`} placeholder={goalHint} value={setup.goal ?? ''} maxLength={120}
          onFocus={() => setInGoal(true)} onBlur={() => (setInGoal(false), setShownGoal(setup.goal?.trim() ?? ''))}
          onKeyDown={(event) => void (event.key === 'Enter' && setShownGoal(setup.goal?.trim() ?? ''))}
          onChange={(event) => onChange({ ...setup, goal: event.target.value || null })} />
        {setup.goal && (
          // Read as one sentence, "Finish reading The Godfather by 26 Oct": the "by" said once, here, and not
          // again when the goal already has one ("…by June") or in the picker's own empty words.
          <>
            {!/\bby\b/i.test(setup.goal) && <span data-goal-by className="self-center text-[clamp(1rem,1.6vw,1.125rem)] text-(--mf-wl-body)">by</span>}
            <DatePicker value={setup.goalBy ?? setup.exam ?? null} onChange={(goalBy) => (goalBy && dayjs(goalBy).isBefore(dayjs(), 'day') ? refuse('Pick a day from today on') : set({ goalBy }))} placeholder="a date" suggest={['in 1 month', 'in 3 months', 'in 6 months']} className="h-10 border border-foreground/15 bg-popover" />
          </>
        )}
      </Ask>
      <GoalOnDesk title={shownGoal || example} example={!shownGoal && !!example} by={goalDay(setup)} still={still} />
    </div>
  )
}

/** One line, kept as your first capture once you press Return or move on; changed, the same capture changes. */
function FirstCapture({ setup, onChange }: { setup: Setup; onChange: (next: Setup) => void }): React.JSX.Element {
  const [text, setText] = useState('')
  const [kept, setKept] = useState('')
  // Back on this page after Next: the thought already kept is in its field again, never a blank one.
  const firstId = setup.made?.firstId
  useEffect(() => {
    if (!firstId) return
    let live = true
    void window.api.captures.list().then((rows) => {
      const line = rows.find((one) => one.id === firstId)?.label.split('\n')[0].trim()
      if (live && line) (setText((now) => now || line), setKept(line))
    })
    return () => void (live = false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const keep = async (): Promise<void> => {
    const line = text.trim()
    if (!line || line === kept) return
    const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: line }] }] }
    const was = setup.made?.firstId
    if (was) await window.api.captures.save(was, { body })
    else onChange({ ...setup, made: { ...setup.made, firstId: await window.api.captures.create({ kind: 'note', body }) } })
    chime('send')
    setKept(line)
  }
  return (
    <span className="flex w-full max-w-[38rem] min-w-0 items-center gap-3">
      <input data-welcome-first aria-label="What's on your mind?" className={`${FIELD} w-full max-w-[30rem] min-w-0 flex-1 text-ellipsis`} placeholder="A thought, a worry, a reminder" value={text} maxLength={400}
        onChange={(event) => setText(event.target.value)} onBlur={() => void keep()}
        onKeyDown={(event) => void (event.key === 'Enter' && (event.preventDefault(), event.stopPropagation(), keep()))} />
      {kept && kept === text.trim() && <span data-welcome-first-kept className="flex shrink-0 items-center gap-1.5 text-[1.0625rem] font-medium whitespace-nowrap text-foreground"><Check className="size-4" /> In your Inbox</span>}
    </span>
  )
}

/**
 * The goal you typed, as its card will sit on your desktop: the real card,
 * floating a little like the postcard, beside the questions, with one line
 * saying where it goes. Only where there is room beside them: in a narrow
 * window it never covers a question (the next page shows the goal too).
 */
function GoalOnDesk({ title, by, still, example = false }: { title: string; by: string; still: boolean; /** One of the typed-in examples, not your goal: shown lighter, and said to be an example. */ example?: boolean }): React.JSX.Element {
  return (
    <div aria-live="polite" inert className="pointer-events-none absolute top-1/2 right-[clamp(1.5rem,5vw,4rem)] -translate-y-1/2 [@container(max-width:1140px)]:hidden">
      <AnimatePresence>
        {title && (
          <motion.figure key="goal" data-goal-desk className="flex w-[15rem] flex-col items-center gap-4"
            initial={still ? { opacity: 0 } : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: still ? 0 : 8, transition: { duration: 0.18, ease: EASE } }}
            transition={still ? { duration: 0.2 } : { type: 'spring', duration: 0.7, bounce: 0.15 }}>
            <Float hold={false}>
              {/* The real card is drawn at its desktop size, then set down at three quarters. */}
              {/* Leaning a little, as it is taped to the desk; the words under it stay level. */}
              <div className="relative h-[246px] w-[201px] rotate-2 transition-opacity duration-300" style={{ opacity: example ? 0.62 : 1 }}>
                <div className="origin-top-left scale-75"><GoalCardPreview title={title} goalAt={by} /></div>
              </div>
            </Float>
            <figcaption data-goal-example={example || undefined} className="text-center text-[1.0625rem] leading-snug font-medium text-balance text-foreground">
              {example ? <><span className="mb-1 block text-[0.8125rem] font-semibold tracking-wide text-(--mf-wl-body) uppercase">Example</span>Your goal sits on your desktop like this, so it stays in sight.</> : 'It sits on your desktop, so the goal stays in sight.'}
            </figcaption>
          </motion.figure>
        )}
      </AnimatePresence>
    </div>
  )
}

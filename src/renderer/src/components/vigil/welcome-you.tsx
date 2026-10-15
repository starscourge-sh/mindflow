import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Check } from 'lucide-react'
import { EASE } from '@/lib/motion'
import { chime } from '@/lib/sound'
import type { Setup } from '@/lib/onboarding'
import { vigil } from '@/lib/vigil'
import { dayjs } from '../../../../main/dates'
import { DatePicker } from './date-picker'
import { HashField, isTag } from './hash-field'
import { Journey } from './goals-view'
import { sourceFrom } from './welcome-import'

/**
 * The welcome's first questions, before anything is shown: what Vigil is for
 * and what you used before; then a first space (a #tag, and for a course its
 * exam date) and a goal, both optional. Every answer is kept as it is given
 * (onboarding.ts, setup); Next then acts on them at once and says what was
 * done (Payoff), each with its own Undo. Nothing here is required: with
 * nothing answered, Next goes straight on.
 */

type Use = NonNullable<Setup['use']>
const USES: [Use, string][] = [['study', 'Study'], ['work', 'Work'], ['writing', 'Writing and reading'], ['life', 'Everyday life']]
const FROM = ['Anki', 'Obsidian', 'Notion', 'Todoist', 'Apple Notes', 'Paper', 'Nothing yet']
/** A first #tag to start from, by what Vigil is for. */
const SPACES: Record<Use, string[]> = {
  study: ['biology', 'history', 'maths'],
  work: ['project', 'clients', 'meetings'],
  writing: ['reading', 'essay', 'draft'],
  life: ['home', 'health', 'travel']
}
const GOALS: Record<Use, string> = { study: 'Pass the exam', work: 'Ship the new site', writing: 'Finish the first draft', life: 'Run a half marathon' }

/** The sidebar as it comes (places.tsx, SHOWN). */
const USUAL = ['inbox', 'all', 'review', 'day', 'today', 'week', 'upcoming', 'nuggets', 'articles', 'questions', 'goals', 'queue']
/** The sidebar each answer starts with (Settings, Sidebar changes it any time). Everyday life keeps the usual one. */
const SIDEBAR: Partial<Record<Use, string[]>> = {
  study: ['inbox', 'review', 'day', 'today', 'nuggets', 'articles', 'questions', 'goals', 'tags'],
  work: ['inbox', 'review', 'day', 'today', 'week', 'upcoming', 'nuggets', 'articles', 'goals'],
  writing: ['inbox', 'review', 'day', 'articles', 'nuggets', 'questions', 'queue', 'tags']
}


/** What was made from the answers, so it is made once, follows a changed answer, and can be taken back. */
type Made = NonNullable<Setup['made']>
/** A thing made from the answers that can be undone on its own. */
export type Piece = 'sidebar' | 'exam' | 'goal'

const isUsual = (now: string[]): boolean => now.length === USUAL.length && USUAL.every((one) => now.includes(one))
/** The day a goal is for: the day asked, else the exam's, else three months on. */
const goalDay = (setup: Setup): string => dayjs(setup.goalBy ?? setup.exam ?? dayjs().add(3, 'month')).format('YYYY-MM-DD')

/**
 * What was answered, done: the sidebar for what Vigil is for (only if you
 * never changed it yourself), the first tag's exam date, and the goal. Safe to
 * run again: each thing is made once, follows an answer changed since, and a
 * piece undone (`undone`) is taken back and left alone. Gives the answers back
 * with what was made, to keep.
 */
export async function applySetup(setup: Setup): Promise<Setup> {
  const made: Made = { ...setup.made }
  const off = new Set(setup.undone ?? [])
  // The sidebar: set for what Vigil is for, or put back as it was.
  const settings = (await vigil.settings()) as { sidebarShown?: string[] }
  const layout = setup.use && !off.has('sidebar') ? SIDEBAR[setup.use] : undefined
  if (made.sidebarFor) {
    if (layout && made.sidebarFor !== setup.use) {
      await vigil.setSettings({ sidebarShown: layout } as never)
      made.sidebarFor = setup.use
    } else if (!layout) {
      await vigil.setSettings({ sidebarShown: made.sidebarWas ?? USUAL } as never)
      made.sidebarFor = null
    }
  } else if (layout && isUsual(settings.sidebarShown ?? USUAL)) {
    made.sidebarWas = settings.sidebarShown ?? null
    await vigil.setSettings({ sidebarShown: layout } as never)
    made.sidebarFor = setup.use
  }
  // The exam date, on the tag it is for.
  const exam = setup.space && setup.exam && !off.has('exam') ? setup.space : null
  if (made.examTag && made.examTag !== exam) await vigil.setTag(made.examTag, { examAt: null })
  if (exam) await vigil.setTag(exam, { examAt: setup.exam })
  made.examTag = exam
  // The goal: made once; a changed name or day makes it again, undone takes it away.
  const title = !off.has('goal') ? setup.goal?.trim() || null : null
  const by = goalDay(setup)
  if (made.goalId && (title !== made.goalTitle || by !== made.goalBy)) {
    await vigil.dropGoal(made.goalId)
    made.goalId = null
  }
  if (title && !made.goalId) {
    made.goalId = await vigil.newGoal(title, by)
    made.goalTitle = title
    made.goalBy = by
  }
  if (!made.goalId) made.goalTitle = made.goalBy = null
  return { ...setup, made }
}

/** Whether anything was answered that Vigil can act on. */
export const answered = (setup: Setup): boolean =>
  !!(setup.use || setup.space || setup.goal?.trim() || setup.from.some((one) => one !== 'Nothing yet'))

/** What each use sets the sidebar to, in words. */
const SIDEBAR_SAID: Partial<Record<Use, string>> = {
  study: 'Your sidebar now leads with what studying needs: Review, Questions, Goals and Tags.',
  work: 'Your sidebar now leads with what work needs: Today, This week, Upcoming and Goals.',
  writing: 'Your sidebar now leads with what writing needs: Writing, Gems, Questions and Tags.'
}
const USE_SAID: Record<Use, string> = { study: 'study', work: 'work', writing: 'writing and reading', life: 'everyday life' }
/** What each tool you came from is, here. */
const FROM_SAID: Record<string, string> = {
  Anki: 'Review asks your cards back, spaced out the way Anki does it, and any line you keep can become one.',
  Obsidian: 'Notes link with @ instead of [[ ]], and the map draws them.',
  Notion: 'Long pages live here too: type / for headings, tables and more.',
  Todoist: 'Write a task with its day, like “call Sam friday 3pm”, and it lands on that day.',
  'Apple Notes': 'Quick capture is one key away from any app, like a note you never have to open.',
  Paper: 'Everything you write is searchable, and comes back to you when it matters.'
}

/** A line of the summary: what was done, in a bold lead-in and a plain line, and the piece Undo takes back. */
type Row = { id: string; lead: string; line: string; piece?: Piece; undone?: boolean }

/** What Vigil did with the answers, a line each, from what was made. */
export function rowsOf(setup: Setup): Row[] {
  const made = setup.made ?? {}
  const off = new Set(setup.undone ?? [])
  const rows: Row[] = []
  const use = setup.use
  if (use) {
    const said = SIDEBAR_SAID[use]
    rows.push(
      made.sidebarFor || off.has('sidebar')
        ? { id: 'sidebar', lead: `Set up for ${USE_SAID[use]}.`, line: off.has('sidebar') ? 'Your sidebar is back as it came.' : said!, piece: 'sidebar', undone: off.has('sidebar') }
        : { id: 'sidebar', lead: `Set up for ${USE_SAID[use]}.`, line: said ? 'Your sidebar stays as you arranged it; Settings, Sidebar changes it.' : 'Your sidebar keeps everything, as it comes.' }
    )
  }
  const from = setup.from.filter((one) => one !== 'Nothing yet')
  if (from.length) {
    const named = from.length === 1 ? from[0] : `${from.slice(0, -1).join(', ')} and ${from[from.length - 1]}`
    rows.push({ id: 'from', lead: `Coming from ${named}?`, line: `${FROM_SAID[from[0]] ?? ''}${sourceFrom(from) ? ` At the end, your ${sourceFrom(from)} notes can come with you.` : ''}`.trim() })
  }
  if (setup.space) {
    rows.push({ id: 'tag', lead: `#${setup.space} is your first tag.`, line: 'The examples ahead carry it, and your first card at the end goes into it.' })
    if (setup.exam) {
      const days = dayjs(setup.exam).startOf('day').diff(dayjs().startOf('day'), 'day')
      rows.push({ id: 'exam', lead: `#${setup.space} counts down to your exam.`, line: off.has('exam') ? 'No exam date on it now.' : `${dayjs(setup.exam).format('dddd D MMMM')}, ${days === 1 ? 'tomorrow' : `${days} days away`}. Its page shows how ready you are.`, piece: 'exam', undone: off.has('exam') })
    }
  }
  if (setup.goal?.trim()) {
    const by = made.goalBy ?? goalDay(setup)
    const days = dayjs(by).diff(dayjs().startOf('day'), 'day')
    rows.push({ id: 'goal', lead: `“${setup.goal.trim()}” is on your Goals page.`, line: off.has('goal') ? 'Taken off again.' : `${days} days to go, until ${dayjs(by).format('D MMMM')}. Write +${goalWord(setup.goal)}: and what you did, in quick capture, to log a step.`, piece: 'goal', undone: off.has('goal') })
  }
  return rows
}

/** The short name a goal is logged under: its last two words, as "+chapter three:" is for "Finish chapter three". */
export const goalWord = (goal: string): string => goal.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').split(/\s+/).slice(-2).join(' ')

/**
 * The answers paid off, at once: each thing Vigil just did with them, a line
 * each, coming in one after another, every one with its own Undo (and Redo),
 * and the goal on its road. Nothing here waits for the welcome to end.
 */
export function Payoff({ setup, onChange, onBack, still }: { setup: Setup; onChange: (next: Setup) => void; onBack: () => void; still: boolean }): React.JSX.Element {
  const [busy, setBusy] = useState<string | null>(null)
  const rows = rowsOf(setup)
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
    <div data-payoff className="flex w-full max-w-[52rem] flex-col gap-[clamp(0.75rem,2.4vh,1.25rem)]">
      {rows.map((row, i) => (
        <motion.div key={row.id} data-made={row.id} className="flex items-start gap-3"
          initial={still ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE, delay: still ? 0 : 0.15 + i * 0.22 }}>
          <span className={`mt-[0.3em] flex size-5 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${row.undone ? 'bg-foreground/10 text-(--mf-wl-quiet)' : 'bg-primary text-primary-foreground'}`}>
            <Check className="size-3.5" strokeWidth={2.6} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className={`font-heading text-[clamp(1.125rem,min(2.2vw,3.2vh),1.5rem)] leading-tight transition-colors duration-200 ${row.undone ? 'text-(--mf-wl-quiet) line-through decoration-foreground/30' : 'text-foreground'}`}>{row.lead}</p>
            <p className="text-[clamp(1rem,min(1.8vw,2.6vh),1.1875rem)] leading-snug text-(--mf-wl-body)">{row.line}</p>
            {row.id === 'goal' && goal && !row.undone && (
              <div className="mt-2 max-w-[30rem] rounded-xl border border-foreground/10 bg-popover p-3 text-popover-foreground shadow-(--mf-panel-shadow)">
                <Journey from={dayjs().format('YYYY-MM-DD')} target={goal.goalBy!} today={dayjs().format('YYYY-MM-DD')} logs={[]} compact />
              </div>
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
      <motion.p className="text-[clamp(1rem,min(1.8vw,2.6vh),1.1875rem)] text-(--mf-wl-body)" initial={still ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: still ? 0 : 0.2 + rows.length * 0.22 }}>
        All of it changes later in Settings.{' '}
        <button type="button" onClick={onBack} className="rounded-sm underline decoration-current/30 underline-offset-4 transition-colors hover:text-foreground hover:decoration-current/60">Change my answers</button>
      </motion.p>
    </div>
  )
}

const CHIP = 'flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[0.9375rem] transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]'
const FIELD = 'h-10 min-w-0 rounded-lg border border-foreground/15 bg-popover px-3 text-[0.9375rem] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_18%,transparent)]'

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
      <p className="font-heading text-[clamp(1.125rem,min(2.2vw,3.2vh),1.5rem)] leading-tight text-foreground">
        {said}{note && <span className="ml-2 text-[0.8em] text-(--mf-wl-quiet)">{note}</span>}
      </p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
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
  const keepOwn = (): void => {
    const tag = own.replace(/-+$/, '')
    if (!tag) return
    if (!isTag(tag)) return void chime('nope')
    setOwn('')
    set({ space: tag })
  }
  return (
    <div className="flex w-full max-w-[52rem] flex-col gap-[clamp(1rem,3.2vh,1.75rem)]">
      <Ask said="What is Vigil for, mostly?" still={still}>
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
      <Ask said="Your first tag" note={use === 'study' ? 'A course, and its exam date' : 'For a project, a book or a course'} delay={0.16} still={still}>
        {picks.map((tag) => <Pick key={tag} on={space === tag} onClick={() => set({ space: space === tag ? null : tag })}>#{tag}</Pick>)}
        {/* Your own, once kept: a chip like the others, picked. */}
        {space && !picks.includes(space) && <Pick on onClick={() => set({ space: null })}>#{space}</Pick>}
        <HashField aria-label="Your own tag" placeholder="your own tag" value={own} maxLength={41}
          className={`${FIELD} w-44 focus-within:border-primary/60 focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_18%,transparent)]`}
          onChange={setOwn}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            event.stopPropagation()
            keepOwn()
          }}
          onBlur={keepOwn} />
        {use === 'study' && space && (
          <DatePicker value={setup.exam} onChange={(exam) => set({ exam })} placeholder="Exam date" suggest={['in 1 month', 'in 3 months']} className="h-10 border border-foreground/15 bg-popover" />
        )}
      </Ask>
      <Ask said="A goal, if you have one" note="Optional" delay={0.24} still={still}>
        <input aria-label="A goal" className={`${FIELD} w-[min(24rem,100%)]`} placeholder={GOALS[use]} value={setup.goal ?? ''} maxLength={120}
          onChange={(event) => onChange({ ...setup, goal: event.target.value || null })} />
        {setup.goal && (
          <DatePicker value={setup.goalBy ?? setup.exam ?? null} onChange={(goalBy) => set({ goalBy })} placeholder="By when" suggest={['in 1 month', 'in 3 months', 'in 6 months']} className="h-10 border border-foreground/15 bg-popover" />
        )}
      </Ask>
    </div>
  )
}

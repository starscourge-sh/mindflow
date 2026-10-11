import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { Check } from 'lucide-react'
import { EASE } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { onboarding, type Setup } from '@/lib/onboarding'
import { vigil } from '@/lib/vigil'
import { dayjs } from '../../../../main/dates'
import { DatePicker } from './date-picker'

/**
 * The welcome's first questions, before anything is shown: what Vigil is for
 * and what you used before; then a first space (a #tag, and for a course its
 * exam date) and a goal, both optional. Every answer is kept as it is given
 * (onboarding.ts, setup) and acted on once the welcome ends (applySetup).
 * Nothing here is required: Next goes on with whatever was picked.
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
const USUAL = ['inbox', 'review', 'day', 'today', 'week', 'nuggets', 'articles', 'questions', 'goals', 'queue']
/** The sidebar each answer starts with (Settings, Sidebar changes it any time). Everyday life keeps the usual one. */
const SIDEBAR: Partial<Record<Use, string[]>> = {
  study: ['inbox', 'review', 'day', 'today', 'nuggets', 'articles', 'questions', 'goals', 'tags'],
  work: ['inbox', 'review', 'day', 'today', 'week', 'upcoming', 'nuggets', 'articles', 'goals'],
  writing: ['inbox', 'review', 'day', 'articles', 'nuggets', 'questions', 'queue', 'tags']
}

/** A #tag as Vigil keeps one: no #, lower case, words joined. */
export const asTag = (text: string): string => text.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_/-]/gu, '').slice(0, 40)

/**
 * What was answered, done once the welcome ends: the sidebar for what Vigil is
 * for (only if you never changed it yourself), the first space's exam date,
 * and the goal. The goal is made once: after it is, the answer is cleared.
 */
export async function applySetup(setup: Setup): Promise<void> {
  const settings = await vigil.settings()
  const layout = setup.use ? SIDEBAR[setup.use] : undefined
  // Only a sidebar never changed: still the usual one (places.tsx, SHOWN), in any order.
  const now = (settings as { sidebarShown?: string[] }).sidebarShown ?? USUAL
  const usual = now.length === USUAL.length && USUAL.every((one) => now.includes(one))
  if (layout && usual) await vigil.setSettings({ sidebarShown: layout } as never)
  if (setup.space && setup.exam) await vigil.setTag(setup.space, { examAt: setup.exam })
  if (setup.goal?.trim()) {
    const by = setup.goalBy ?? setup.exam ?? dayjs().add(3, 'month').toISOString()
    await vigil.newGoal(setup.goal.trim(), dayjs(by).format('YYYY-MM-DD'))
    await onboarding.set({ setup: { ...setup, goal: null, goalBy: null } })
  }
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
      <Ask said="Your first tag" note={use === 'study' ? 'A course, and its exam date' : 'A #tag for a project, a book or a course'} delay={0.16} still={still}>
        {picks.map((tag) => <Pick key={tag} on={space === tag} onClick={() => set({ space: space === tag ? null : tag })}>#{tag}</Pick>)}
        <input aria-label="Or a tag of your own" className={`${FIELD} w-44`} placeholder="Or your own #tag" value={space && !picks.includes(space) ? `#${space}` : ''}
          onChange={(event) => onChange({ ...setup, space: asTag(event.target.value) || null })} />
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

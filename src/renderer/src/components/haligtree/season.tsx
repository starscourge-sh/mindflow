import { useEffect, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { Flag } from 'lucide-react'
import { chime } from '@/lib/sound'
import { unloaded, useLive, haligtree, type Item, type Settings } from '@/lib/haligtree'
import { ensurePlaybook, findPlaybook, keepSeasonLine, openPlaybook } from '@/lib/playbook'
import { HaligtreeEditor } from '../haligtree'
import { Button } from '@/components/ui/button'
import { toast } from './ui'
import { GoalBar, openOnes, warmth } from './goals-view'
import { daysLeft, leftSaid, percent, wayThrough } from '../../../../main/goal-days'
import { dayKey, num } from '../../../../main/dates'

/**
 * Closing the season: once a quarter, Close the week grows one short part,
 * on its first close after a new quarter begins (within that quarter's first
 * three weeks). It asks three things and adds no screen of its own: is the
 * playbook still true (edited right there), what mattered most in the season
 * just gone (a line kept in the playbook), and how the goals stand. Done or
 * skipped, it is remembered for the quarter; closing the week counts as done.
 */

/** "2026-Q4": the quarter a day is in. */
export const seasonKey = (at = new Date()): string => `${at.getFullYear()}-Q${Math.floor(at.getMonth() / 3) + 1}`
/** How long into a quarter it is still offered. */
const WEEKS = 3
/** Whether Close the week has the season's part now: early in a quarter, and not closed or skipped for it yet. */
export function seasonDue(closed: string | undefined, at = new Date()): boolean {
  const start = new Date(at.getFullYear(), Math.floor(at.getMonth() / 3) * 3, 1)
  return closed !== seasonKey(at) && at.getTime() - start.getTime() < WEEKS * 7 * 86_400_000
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** The season just gone, in words: "July to September", with its year when it is not this one. */
export function lastSeason(at = new Date()): { said: string; kept: string } {
  const first = new Date(at.getFullYear(), Math.floor(at.getMonth() / 3) * 3 - 3, 1)
  const said = `${MONTHS[first.getMonth()]} to ${MONTHS[first.getMonth() + 2]}`
  return { said: first.getFullYear() === at.getFullYear() ? said : `${said} ${first.getFullYear()}`, kept: `${said} ${first.getFullYear()}` }
}
/** The month the next season begins, for "back in January". */
const nextSeason = (at = new Date()): string => MONTHS[(Math.floor(at.getMonth() / 3) * 3 + 3) % 12]

/** Close the week's quarterly part. Nothing at all in the other weeks. */
export function SeasonPart(): React.JSX.Element | null {
  const settings = useLive(haligtree.settings, null as Settings | null)
  // What it was when the sheet opened: closing it here folds it to a line, rather than taking it away.
  const [due, setDue] = useState<boolean | null>(null)
  useEffect(() => void (settings && due === null && setDue(seasonDue(settings.seasonClosed))), [settings, due])
  const [ended, setEnded] = useState<'done' | 'skipped' | null>(null)
  const [mattered, setMattered] = useState('')
  const said = useRef(mattered)
  said.current = mattered
  const season = lastSeason()
  const allGoals = useLive(() => haligtree.items('goal'), [] as Item[], [], ['item'])
  const goals = openOnes(allGoals)
  const today = dayKey()
  const [playbook, setPlaybook] = useState<{ id: string; body: JSONContent | null } | null | undefined>(undefined)
  useEffect(() => {
    if (!due) return
    void findPlaybook().then(async (id) => setPlaybook(id ? { id, body: ((await haligtree.item(id))?.body ?? null) as JSONContent | null } : null))
  }, [due])
  const saving = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pending = useRef<{ id: string; body: JSONContent } | null>(null)
  const flush = (): void => {
    clearTimeout(saving.current)
    if (pending.current) void haligtree.saveItem(pending.current.id, { body: pending.current.body })
    pending.current = null
  }
  useEffect(() => flush, [])

  const finish = async (how: 'done' | 'skipped', quiet = false): Promise<void> => {
    flush()
    const was = (await haligtree.settings()).seasonClosed
    if (how === 'done') await keepSeasonLine(season.kept, said.current)
    await haligtree.setSettings({ seasonClosed: seasonKey() })
    if (quiet) return
    setEnded(how)
    chime(how === 'done' ? 'season' : 'fold')
    if (how === 'skipped') toast(`Season skipped. Back in ${nextSeason()}`, () => void haligtree.setSettings({ seasonClosed: was }).then(() => setEnded(null)))
  }
  // Closing the week with the part still open: what was written is kept, and the season counts as closed.
  const live = useRef({ due, ended })
  live.current = { due, ended }
  useEffect(() => {
    const closed = (): void => void (live.current.due && !live.current.ended && finish('done', true))
    window.addEventListener('haligtree:week-closed', closed)
    return () => window.removeEventListener('haligtree:week-closed', closed)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!due) return null
  const heading = 'text-control font-semibold tracking-[0.01em] text-foreground'
  if (ended) return (
    <section data-close-season={ended} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-body text-foreground">
      <span className="font-semibold">{ended === 'done' ? 'Season closed.' : 'Season skipped.'}</span>
      <span className="text-foreground/75">Back in {nextSeason()}.</span>
    </section>
  )
  return (
    <section data-close-season="open" className="flex flex-col gap-4 rounded-lg border px-4 py-3.5">
      <div className="flex items-baseline gap-2">
        <h3 className="font-heading text-base font-semibold text-foreground">Close the season too</h3>
        <span className="text-control text-foreground/70">Once a quarter: {season.said} is over.</span>
      </div>

      <div data-season-playbook>
        <h4 className={heading}>Still true?</h4>
        <p className="mt-0.5 text-control text-foreground/75">Your playbook, “How I work”. Change anything that is not true any more, right here.</p>
        {playbook === undefined ? null : playbook ? (
          <div className="mt-2 max-h-44 overflow-y-auto rounded-md border [--mf-padding:0.5rem_0.75rem]">
            <HaligtreeEditor documentId={`season-${playbook.id}`} defaultContent={playbook.body ?? ''} toolbar={false} handles={false} slash={false} outline={false} search={false} autofocus={false}
              onChange={(body) => {
                pending.current = { id: playbook.id, body }
                clearTimeout(saving.current)
                saving.current = setTimeout(flush, 600)
              }} />
          </div>
        ) : (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-body text-foreground">
            You have no playbook yet.
            <Button size="sm" variant="secondary" data-season-start onClick={() => void ensurePlaybook().then(async ({ id }) => {
              chime('promote')
              setPlaybook({ id, body: ((await haligtree.item(id))?.body ?? null) as JSONContent | null })
            })}>Start from an outline</Button>
          </p>
        )}
      </div>

      <div>
        <h4 className={heading}>What mattered most to you from {season.said}?</h4>
        <input value={mattered} onChange={(event) => setMattered(event.target.value)} placeholder="In a line" aria-label="What mattered most this season"
          className="mt-1.5 w-full rounded-md border bg-transparent px-2.5 py-1.5 text-body text-foreground outline-none placeholder:text-muted-foreground focus:border-ring" />
        <p className="mt-1 text-control text-foreground/70">Kept in your playbook, one line a season.</p>
      </div>

      <div data-season-goals>
        <h4 className={heading}>Your goals</h4>
        {goals.length ? (
          <ul className="mt-1.5 flex flex-col gap-2">
            {goals.map((goal) => {
              const left = daysLeft(goal.goalAt!, today)
              const way = wayThrough(goal.goalFrom ?? today, goal.goalAt!)
              return (
                <li key={goal.id} data-private={goal.private ? '' : undefined} className="flex flex-col gap-1 text-control">
                  <span className="flex min-w-0 items-center gap-2">
                    <Flag className="size-3.5 shrink-0" style={{ color: warmth(Math.max(left, 0)) }} />
                    <span className="private-text min-w-0 flex-1 truncate font-medium text-foreground">{goal.title}</span>
                    <span className="shrink-0 tabular-nums text-foreground/80">{percent(way)} of the way · {left < 0 ? 'past its day' : left === 0 ? 'today' : leftSaid(left)} · {goal.clues ? `${num(goal.clues)} ${goal.clues === 1 ? 'log' : 'logs'}` : 'no logs yet'}</span>
                  </span>
                  <GoalBar left={left} way={way} className="ml-5.5" />
                </li>
              )
            })}
          </ul>
        ) : !unloaded(allGoals) && <p className="mt-1 text-body text-foreground/75">No goals set. A season is a good length for one: Goals has a “New goal” button.</p>}
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" data-season-done onClick={() => void finish('done')}>Done with the season</Button>
        <Button size="sm" variant="ghost" data-season-skip onClick={() => void finish('skipped')}>Skip this season</Button>
      </div>
    </section>
  )
}

/** In the other weeks: the playbook, one click from Close the week. */
export function PlaybookLink({ onLeave }: { onLeave: () => void }): React.JSX.Element | null {
  const settings = useLive(haligtree.settings, null as Settings | null)
  if (!settings || seasonDue(settings.seasonClosed)) return null
  return (
    <button type="button" data-playbook-link onClick={() => (onLeave(), void openPlaybook())}
      className="rounded-md px-2 py-1 text-control text-muted-foreground hover:bg-accent hover:text-foreground">
      Open my playbook
    </button>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { call, useLive } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { HoldButton } from './hold-button'
import { Setting } from './settings-view'
import { Grows, Kbd, news, refuse, toast, typing } from './ui'
import { num, plural } from '../../../../main/dates'
import type { Away, Kind, Plan, Result } from '../../../../main/start-fresh'

/** Writing, from a notice's "Show me" (home.tsx listens). */
const showWriting = (): void => void window.dispatchEvent(new CustomEvent('haligtree:show-writing'))
const readAway = (): Promise<Away[]> => call<Away[]>('fresh:away')

/**
 * Start fresh, in Settings › Your book: what it would do, each kind with its count read from the book now, under
 * the row as it unfolds; a hold, never a click; then one notice of what was done. Main does the work (start-fresh.ts).
 */
export function StartFresh({ point }: { /** Asked for from ⌘K: unfolded. */ point?: number }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [running, setRunning] = useState(false)
  const unfold = (): void => {
    chime('open')
    setOpen(true)
    void call<Plan>('fresh:plan').then(setPlan)
  }
  useEffect(() => void (point && unfold()), [point]) // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (): Promise<void> => {
    setRunning(true)
    const done = await call<Result>('fresh:run').finally(() => setRunning(false))
    if (!done.done) return refuse(`${done.why}. Nothing was changed.`)
    chime('anew')
    setOpen(false)
    setPlan(null)
    news(`Started fresh: ${plural(done.away, 'thing')} put away, ${plural(done.gone, 'record')} of test material deleted. A whole copy is in “${done.backup.split('/').pop()}” in your backup folder.`, undefined, 'success', { label: 'Show me', key: 'S', run: showWriting })
  }
  const list = (lines: Plan['away']): React.JSX.Element => (
    <ul className="mt-2 grid gap-1.5">
      {lines.map((one) => (
        <li key={one.key} data-fresh-line={one.key} data-n={one.n} className="flex items-baseline gap-2 text-body text-foreground">
          <span className="min-w-14 text-right font-medium tabular-nums">{num(one.n)}</span>
          <span>{one.words}</span>
        </li>
      ))}
    </ul>
  )
  return (
    <Setting title="Start fresh" anchor="start-fresh" note="Put everything away and bring back only what you choose. **Nothing of yours is deleted**; test material from PDFs and every stat is."
      more="Your folders go inside “From Obsidian”, every page, gem and deck is put away, and open tasks go on hold in “From before”. The Inbox stays as it is. A whole copy of the book is made first."
      keywords="start fresh over clean slate reset archive put away bring back own obsidian test pdf stats"
      below={open && (
        <Grows inner="pt-3" data-fresh-plan="">
          {!plan ? <p className="text-body text-muted-foreground">Counting what is in your book…</p> : (
            <div className="grid gap-4 rounded-[6px] bg-accent/40 p-4">
              <section data-fresh-group="away">
                <p className="text-body text-foreground"><strong className="font-semibold">Put away.</strong> Nothing deleted, all found by search, each can be brought back.</p>
                {plan.away.length ? list(plan.away) : <p className="mt-2 text-body text-foreground">Nothing to put away.</p>}
                <p className="mt-2 text-body text-foreground">Captures in the Inbox stay as they are.</p>
              </section>
              <section data-fresh-group="gone">
                <p className="text-body text-foreground"><strong className="font-semibold">Deleted for good.</strong> Test material: what PDFs made, and every stat.</p>
                {plan.gone.length ? list(plan.gone) : <p className="mt-2 text-body text-foreground">Nothing to delete.</p>}
                {plan.stay > 0 && <p className="mt-2 text-body text-foreground">{plural(plan.stay, 'PDF')} {plan.stay === 1 ? 'stays' : 'stay'}: {plan.stay === 1 ? 'a note' : 'notes'} with your own words {plan.stay === 1 ? 'holds it' : 'hold them'}.</p>}
              </section>
              <p data-fresh-backup className="text-body text-foreground"><strong className="font-semibold">A whole copy first,</strong> to <span className="break-all">{plan.backup}</span>. If it can’t be made, nothing changes.</p>
              <div className="flex items-center gap-2">
                <HoldButton variant="destructive" hint="Copy the book, then put it all away" done="Starting fresh…" cue={null} disabled={running} onHold={() => void run()}>Hold to start fresh</HoldButton>
                <Button variant="ghost" size="sm" onClick={() => (chime('off'), setOpen(false))}>Not now</Button>
              </div>
            </div>
          )}
        </Grows>
      )}>
      {!open && <Button variant="outline" size="sm" data-fresh-open="" onClick={unfold}>Start fresh…</Button>}
    </Setting>
  )
}

const KINDS: { kind: Kind; one: string; many: string }[] = [
  { kind: 'folder', one: 'folder', many: 'Folders' },
  { kind: 'page', one: 'page', many: 'Pages' },
  { kind: 'gem', one: 'gem', many: 'Gems' },
  { kind: 'note', one: 'note', many: 'Notes in folders' },
  { kind: 'deck', one: 'deck', many: 'Decks' },
  { kind: 'card', one: 'card', many: 'Cards' },
  { kind: 'task', one: 'task', many: 'Tasks' }
]
/** Rows shown of a kind before the rest wait for a search: 5,000 gems never draw at once. */
const SHOWN = 40

/** One thing brought back, said with Undo (put away again). */
async function back(one: Away): Promise<void> {
  await call('fresh:back', one.kind, one.id)
  chime('unshelve')
  const where = one.kind === 'task' ? 'Tasks' : one.kind === 'deck' || one.kind === 'card' ? 'Review' : 'Writing'
  toast(`Brought back to ${where}: “${one.title.slice(0, 48)}”`, () => void call('fresh:unback', one.kind, one.id).then(() => chime('shelve')))
}

/**
 * Bring back, in Settings › Your book: what Start fresh put away, by kind, with search; and "Go through them", one at
 * a time as the Inbox's go-through steps, B to bring back, → to leave it, Esc to stop.
 */
export function BringBack({ point }: { point?: number }): React.JSX.Element | null {
  const away = useLive(readAway, null as Away[] | null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [pass, setPass] = useState<number | null>(null)
  useEffect(() => void (point && setOpen(true)), [point])
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return (away ?? []).filter((one) => words.every((word) => `${one.title} ${one.within ?? ''}`.toLowerCase().includes(word)))
  }, [away, query])
  const current = pass === null ? null : shown[pass] ?? null
  // The pass's keys, while it is on: B brings back, → leaves it, Esc stops.
  const state = useRef({ current, pass })
  state.current = { current, pass }
  useEffect(() => {
    if (pass === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (typing() || event.metaKey || event.ctrlKey || event.altKey) return
      const { current: one, pass: at } = state.current
      if (event.key === 'Escape') (event.preventDefault(), event.stopPropagation(), chime('off'), setPass(null))
      else if ((event.key === 'b' || event.key === 'B') && one) (event.preventDefault(), void back(one))
      else if (event.key === 'ArrowRight' && at !== null) (event.preventDefault(), chime('slide'), setPass(at + 1))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [pass])
  if (!away?.length) return null
  const step = (): React.JSX.Element => (
    <div data-fresh-pass="" className="grid gap-3 rounded-[6px] bg-accent/40 p-4">
      {current ? (<>
        <p className="text-body text-foreground"><strong className="font-semibold">{num((pass ?? 0) + 1)} of {num(shown.length)}</strong> · {KINDS.find((one) => one.kind === current.kind)?.one}{current.within ? ` · ${current.within}` : ''}</p>
        <p data-fresh-current className="font-heading text-title text-foreground">{current.title}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void back(current)}>Bring back <Kbd>B</Kbd></Button>
          <Button variant="outline" size="sm" onClick={() => (chime('slide'), setPass((pass ?? 0) + 1))}>Leave it <Kbd>→</Kbd></Button>
          <Button variant="ghost" size="sm" onClick={() => (chime('off'), setPass(null))}>Stop <Kbd>esc</Kbd></Button>
        </div>
      </>) : (<>
        <p className="text-body text-foreground"><strong className="font-semibold">That’s all of them.</strong> What you left stays put away, found by search.</p>
        <div><Button variant="outline" size="sm" onClick={() => (chime('done'), setPass(null))}>Done</Button></div>
      </>)}
    </div>
  )
  return (
    <Setting title="Bring back" anchor="bring-back" note={`**${plural(away.length, 'thing')} put away** by Start fresh. Bring back only what you choose.`}
      keywords="bring back put away start fresh unarchive restore from obsidian from before"
      below={(open || pass !== null) && (
        <Grows inner="pt-3" data-fresh-away="">
          {pass !== null ? step() : (
            <div className="grid gap-3">
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search what is put away" aria-label="Search what is put away" className="max-w-80" />
              {KINDS.map(({ kind, many }) => {
                const rows = shown.filter((one) => one.kind === kind)
                if (!rows.length) return null
                return (
                  <section key={kind} data-fresh-kind={kind}>
                    <p className="text-body font-medium text-foreground">{many} <span className="tabular-nums">{num(rows.length)}</span></p>
                    <ul className="mt-1 grid">
                      {rows.slice(0, SHOWN).map((one) => (
                        <li key={`${one.kind}:${one.id}`} data-fresh-row={one.id} className="group flex items-center gap-3 rounded-[4px] px-2 py-1 hover:bg-accent">
                          <span className="min-w-0 flex-1 truncate text-body text-foreground">{one.title}</span>
                          {one.within && <span className="shrink-0 truncate text-control text-muted-foreground">{one.within}</span>}
                          <Button variant="outline" size="sm" className="shrink-0" onClick={() => void back(one)}>Bring back</Button>
                        </li>
                      ))}
                    </ul>
                    {rows.length > SHOWN && <p className="mt-1 px-2 text-body text-foreground">{num(rows.length - SHOWN)} more: search to find one.</p>}
                  </section>
                )
              })}
              {!shown.length && <p className="text-body text-foreground">Nothing put away matches “{query}”.</p>}
            </div>
          )}
        </Grows>
      )}>
      <Button variant="outline" size="sm" data-fresh-go="" onClick={() => (chime('open'), setOpen(true), setPass(0))}>Go through them</Button>
      {!open && pass === null && <Button variant="ghost" size="sm" data-fresh-list="" onClick={() => (chime('open'), setOpen(true))}>See the list</Button>}
    </Setting>
  )
}

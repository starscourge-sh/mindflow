import { useEffect, useRef, useState } from 'react'
import { useReading } from '@/lib/reads-in'
import { Play, Plus } from 'lucide-react'

import { chime } from '@/lib/sound'
import { useSelectAll } from '@/lib/select-all'
import { shredFrom } from '@/lib/fly-home'
import { unloaded, useLive, vigil, type Focus } from '@/lib/vigil'
import { openSource, sources, type SourceField, type SourceSummary } from '@/lib/sources'
import { DAYS, honestSaid, loadSaid, practices, startPractice, suggestSaid, timeSaid, usePractices, whenSaid, type LoadKind, type Loaded, type Practice, type PracticeRow } from '@/lib/practices'
import { START_MIN } from '../../../../main/practice-rules'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Chips } from './display'
import { TimeField } from './time-field'
import { HashField } from './hash-field'
import { RowMenu, copy, type RowItem } from './row-menu'
import { Empty, Island, Page, Tip, toast, typing } from './ui'
import { num } from '../../../../main/dates'

/**
 * Practices: what you do again and again with no end, each with its days, a
 * time and a target. At its time it is offered for 5 minutes (it never starts
 * by itself), and it opens with your material loaded: the desk at the top.
 * Reached from Tasks, ⌘K and quick capture's kinds.
 */

const TARGETS = [10, 15, 20, 30, 45, 60].map((n) => ({ id: String(n), label: `${n} min` }))
const LOADS: { id: LoadKind | 'none'; label: string; tip: string }[] = [
  { id: 'none', label: 'Nothing', tip: 'Just the time' },
  { id: 'tag', label: 'A tag', tip: 'Your gems on it, recall cards due, the last draft' },
  { id: 'source', label: 'A book or source', tip: 'Its page at your last spot, ready for an excerpt' },
  { id: 'queue', label: 'Reading queue', tip: 'The next thing in your queue' },
  { id: 'problems', label: 'A problem list', tip: 'A note of problems: the next one, and last time’s note' }
]
const blank = (): Partial<Practice> => ({ name: '', days: [0, 1, 2, 3, 4, 5, 6], at: '21:00', targetMin: 30, loadKind: null, load: null })

export function PracticesView({ focus, onOpen }: { focus?: string; onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const all = usePractices()
  const running = useLive(vigil.focusNow, null as Focus | null)
  const [editing, setEditing] = useState<Partial<Practice> | null>(focus === 'new' ? blank() : null)
  useEffect(() => void (focus === 'new' && setEditing(blank())), [focus])
  const live = running?.practiceId ? all.find((one) => one.id === running.practiceId) : undefined
  // Sent here for one (its offer, ⌘K, the bubble's goal): its desk, ready, even before it runs.
  const shown = live ?? (focus && focus !== 'new' ? all.find((one) => one.id === focus) : undefined)
  // Several at once, as every list takes them: ⌘A, ⇧-click, ⌘-click; ⌫ and the
  // right-click menu act on what is picked; one Undo (and ⌘Z) brings them all back.
  const [chosen, setChosen] = useState<string[]>([])
  const picked = chosen.filter((id) => all.some((one) => one.id === id))
  const anchor = useRef<string | null>(null)
  const remove = (list: PracticeRow[]): void => {
    if (!list.length) return
    // Each row goes through the shredder, as everything moved to the Bin does.
    const lands = list.map((one) => shredFrom(document.querySelector<HTMLElement>(`[data-practice-row="${CSS.escape(one.id)}"]`)))
    void Promise.all(list.map((one) => practices.bin(one.id))).then(() => {
      lands.forEach((land) => land?.())
      setChosen([])
      chime('away')
      toast(list.length === 1 ? `${list[0].name} moved to the Bin` : `${num(list.length)} practices moved to the Bin`,
        () => void Promise.all(list.map((one) => practices.unbin(one.id))).then(() => chime('back')))
    })
  }
  const rowsOf = (ids: string[]): PracticeRow[] => all.filter((one) => ids.includes(one.id))
  const [cursor, setCursor] = useState(-1)
  const focused = (): string | undefined => (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-practice-row]')?.dataset.practiceRow
  const selectAll = useSelectAll(() => all.map((one) => one.id), picked, setChosen, {
    enabled: !editing,
    onDelete: (ids) => remove(rowsOf(ids)),
    current: focused,
    titleOf: (id) => all.find((one) => one.id === id)?.name
  })
  const toggle = (id: string): void => setChosen((was) => (chime(was.includes(id) ? 'off' : 'on'), was.includes(id) ? was.filter((one) => one !== id) : [...was, id]))
  const pickClick = (event: React.MouseEvent, id: string, at: number): void => {
    if (event.altKey || (!event.metaKey && !event.shiftKey)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.metaKey) return void (toggle(id), (anchor.current = id))
    // A run from the last one picked to this one, added to what is picked.
    const ids = all.map((one) => one.id)
    const from = Math.max(0, ids.indexOf(anchor.current ?? picked[picked.length - 1] ?? id))
    chime('on')
    setChosen((was) => [...new Set([...was, ...ids.slice(Math.min(from, at), Math.max(from, at) + 1)])])
  }
  // Esc lets go of what is picked, or the one you are on, or closes the form.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (typing() || event.defaultPrevented || document.querySelector('[role="menu"]')) return
      if (event.key === 'Escape' && (editing || cursor >= 0 || picked.length)) return void (setEditing(null), setCursor(-1), setChosen([]), chime('fold'))
      // ↑ and ↓ walk the list as every list does (from nothing picked, ↓ takes the first); ↵ opens the one you are on to change it.
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && all.length && !editing && !event.metaKey && !event.altKey) {
        const next = cursor < 0 ? (event.key === 'ArrowDown' ? 0 : all.length - 1) : Math.max(0, Math.min(all.length - 1, cursor + (event.key === 'ArrowDown' ? 1 : -1)))
        const row = document.querySelector<HTMLElement>(`[data-practice-row="${CSS.escape(all[next].id)}"]`)
        if (row) (event.preventDefault(), row.focus(), row.scrollIntoView({ block: 'nearest' }))
        // ⇧↑ and ⇧↓ pick as they go.
        if (row && event.shiftKey) setChosen((was) => [...new Set([...was, ...(all[cursor] ? [all[cursor].id] : []), all[next].id])])
      }
      if (event.key === 'Enter' && all[cursor] && (event.target as HTMLElement | null)?.dataset?.practiceRow !== undefined) (event.preventDefault(), chime('open'), setEditing(all[cursor]))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const allPicked = all.length > 0 && all.every((one) => picked.includes(one.id))
  const menuOf = (one: PracticeRow): RowItem[] => picked.includes(one.id) && picked.length > 1 ? [
    { label: `Copy their names`, keys: '⌘C', run: () => copy(rowsOf(picked).map((row) => row.name).join('\n')) },
    !allPicked && { label: 'Select all', keys: '⌘A', run: selectAll },
    'separator',
    { label: `Move ${num(picked.length)} to the Bin`, keys: '⌫', danger: true, run: () => remove(rowsOf(picked)) }
  ].filter(Boolean) as RowItem[] : [
    { label: 'Start now', run: () => void startPractice(one.id) },
    { label: 'Edit', keys: '↵', run: () => setEditing(one) },
    { label: 'Copy its name', keys: '⌘C', run: () => copy(one.name) },
    !allPicked && all.length > 1 && { label: 'Select all', keys: '⌘A', run: selectAll },
    'separator',
    { label: 'Move to the Bin', keys: '⌫', danger: true, run: () => remove([one]) }
  ].filter(Boolean) as RowItem[]
  return (
    // One "New practice" on the page: with none yet, the empty page's own button is it.
    <Page title="Practices" count={all.length} unit={['practice', 'practices']} actions={all.length ? (
      <Button size="sm" variant="outline" data-new-practice onClick={() => (chime('open'), setEditing(blank()))}><Plus /> New practice</Button>
    ) : undefined}>
      <div className="px-5 pb-16">
        {shown && <Desk practice={shown} running={!!live} runningId={live ? running!.id : null} onOpen={onOpen} />}
        {editing && <PracticeForm start={editing} onDone={() => setEditing(null)} />}
        {!all.length && editing ? null : !all.length ? (
          <Empty title="No practices yet" action={<Button size="sm" data-new-practice onClick={() => (chime('open'), setEditing(blank()))}><Plus /> New practice</Button>}>
            A practice is something you repeat with no end: reading, Spanish, a problem a day. At its time you are offered 5 minutes, and it opens with your material ready.
          </Empty>
        ) : (
          <Island title="Your practices" className="mt-6">
            {all.map((one, at) => (
              <RowMenu key={one.id} items={menuOf(one)}>
                <div data-practice-row={one.id} data-picked={picked.includes(one.id) ? '' : undefined} tabIndex={0} aria-selected={cursor === at || picked.includes(one.id)}
                  onFocus={() => setCursor(at)} onBlur={() => setCursor(-1)} onClickCapture={(event) => pickClick(event, one.id, at)}
                  className={`px-4 py-3 outline-none ${picked.includes(one.id) ? 'bg-[color-mix(in_oklab,var(--tt-brand-color-400)_14%,transparent)]' : cursor === at ? 'bg-accent/50' : ''}`}>
                  <PracticeCard practice={one} onEdit={() => setEditing(one)} />
                </div>
              </RowMenu>
            ))}
          </Island>
        )}
      </div>
    </Page>
  )
}

/** One practice: its name, when, its target and what it opens, its honest record, and the move it may suggest. */
function PracticeCard({ practice, onEdit }: { practice: PracticeRow; onEdit: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-body font-semibold text-foreground">{practice.name}</h3>
        <Tip label={`${START_MIN} minutes to start; keep going as long as you like`}>
          <Button size="sm" data-practice-start-now onClick={() => void startPractice(practice.id)}><Play className="fill-current" /> Start</Button>
        </Tip>
        <Button size="sm" variant="ghost" data-practice-edit onClick={onEdit}>Edit</Button>
      </div>
      <p className="text-control text-foreground/80">{whenSaid(practice)} · {practice.targetMin} min target · {loadSaid(practice)}</p>
      {practice.honest ? (
        <p data-practice-honest className="text-body font-medium text-foreground">{honestSaid(practice.honest)}</p>
      ) : practice.runs > 0 ? (
        <p className="text-control text-foreground/80">{practice.runs} {practice.runs === 1 ? 'session' : 'sessions'} so far. Your average shows after a few weeks.</p>
      ) : null}
      {practice.suggest && (
        <div data-practice-suggest-row className="mt-1 flex flex-wrap items-center gap-2 rounded-lg border bg-background px-3 py-2">
          <p className="min-w-0 flex-1 text-body text-foreground">{suggestSaid(practice.suggest)} Move it?</p>
          <Button size="sm" data-practice-move-row onClick={() => void practices.move(practice.id, practice.suggest!.to).then(() => (chime('move'), toast(`${practice.name} moved to ${timeSaid(practice.suggest!.to)}`, () => void practices.move(practice.id, practice.suggest!.from))))}>Move to {timeSaid(practice.suggest.to)}</Button>
          <Button size="sm" variant="ghost" onClick={() => void practices.move(practice.id, null).then(() => chime('tap'))}>Keep {timeSaid(practice.suggest.from)}</Button>
        </div>
      )}
    </div>
  )
}

/**
 * New or changed: a name, the days and time, a target, and what it opens
 * with. Every field the card shows is changed here.
 */
function PracticeForm({ start, onDone }: { start: Partial<Practice>; onDone: () => void }): React.JSX.Element {
  const [p, setP] = useState(start)
  useEffect(() => setP(start), [start])
  const set = (patch: Partial<Practice>): void => setP((was) => ({ ...was, ...patch }))
  const list = useLive(sources.list, [] as SourceSummary[])
  const [find, setFind] = useState('')
  const [found, setFound] = useState<{ type: string; id: string; label: string }[]>([])
  useEffect(() => {
    if (p.loadKind !== 'problems' || !find.trim()) return void setFound([])
    let gone = false
    void window.api.captures.find(find).then((rows) => !gone && setFound(rows.filter((one) => one.type !== 'task' && one.type !== 'event').slice(0, 6).map((one) => ({ type: one.type, id: one.id, label: one.label }))))
    return () => void (gone = true)
  }, [find, p.loadKind])
  const save = (): void => {
    if (!p.name?.trim()) return chime('nope')
    void practices.save(p).then((id) => {
      if (!id) return chime('nope')
      chime('added')
      toast(start.id ? `${p.name} changed` : `${p.name}: ${whenSaid({ days: p.days ?? [], at: p.at ?? '21:00' }).toLowerCase()}`)
      onDone()
    })
  }
  const name = useRef<HTMLInputElement>(null)
  useEffect(() => name.current?.focus(), [])
  return (
    <Island title={start.id ? `Change ${start.name}` : 'New practice'} className="mt-6">
      <div data-practice-form className="flex flex-col gap-4 px-4 py-4"
        onKeyDown={(event) => {
          if (event.key === 'Escape') (event.preventDefault(), event.stopPropagation(), chime('fold'), onDone())
          if (event.key === 'Enter' && (event.metaKey || (event.target as HTMLElement).tagName === 'INPUT' && (event.target as HTMLElement).dataset.practiceName !== undefined)) (event.preventDefault(), save())
        }}>
        <label className="flex flex-col gap-1.5">
          <span className="text-control font-medium text-foreground">Name</span>
          <Input ref={name} data-practice-name value={p.name ?? ''} placeholder="Design patterns" onChange={(event) => set({ name: event.target.value })} />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-control font-medium text-foreground">Days</span>
          <Chips options={DAYS} on={(id) => (p.days ?? []).includes(Number(id))} pick={(id) => (chime('tap'), set({ days: (p.days ?? []).includes(Number(id)) ? (p.days ?? []).filter((day) => day !== Number(id)) : [...(p.days ?? []), Number(id)] }))} />
          <p className="text-control text-foreground/80">{whenSaid({ days: p.days ?? [], at: p.at ?? '21:00' })}</p>
        </div>
        {/* Headings on one line; each control under its own. */}
        <div className="flex flex-wrap items-start gap-6">
          <label className="flex flex-col gap-1.5">
            <span className="text-control font-medium text-foreground">Time</span>
            <TimeField label="Practice time" value={p.at ?? '21:00'} onChange={(at) => set({ at })} />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-control font-medium text-foreground">Target</span>
            <Chips options={TARGETS} on={(id) => Number(id) === p.targetMin} pick={(id) => (chime('tap'), set({ targetMin: Number(id) }))} />
          </div>
        </div>
        <p className="text-control text-foreground/80">It starts with {START_MIN} minutes. Stop whenever you like: every minute counts.</p>
        <div className="flex flex-col gap-1.5">
          <span className="text-control font-medium text-foreground">Opens with</span>
          <Chips options={LOADS} on={(id) => (p.loadKind ?? 'none') === id} pick={(id) => (chime('tap'), set({ loadKind: id === 'none' ? null : (id as LoadKind), load: null }))} />
          {p.loadKind === 'tag' && <HashField value={p.load ?? ''} onChange={(load) => set({ load })} placeholder="design-patterns" className="mt-1 w-64" />}
          {p.loadKind === 'source' && (list.length ? (
            <Chips options={list.slice(0, 14).map((one) => ({ id: `${one.field}:${one.name}`, label: one.name }))} on={(id) => id === p.load} pick={(id) => (chime('tap'), set({ load: id }))} className="mt-1 flex-wrap" />
          ) : <p className="text-control text-foreground/80">No books or sources yet. A quote with a who or where makes one.</p>)}
          {p.loadKind === 'problems' && (
            <div className="mt-1 flex flex-col gap-1">
              <Input data-practice-find value={find} placeholder={p.load ? 'Picked. Search to pick another note' : 'Find the note with your problems'} onChange={(event) => setFind(event.target.value)} className="w-80" />
              {found.map((one) => (
                <button key={one.id} type="button" data-practice-pick={one.id} onClick={() => (chime('tap'), set({ load: one.id }), setFind(''))}
                  className={`w-80 truncate rounded-md px-2 py-1 text-left text-control hover:bg-accent ${p.load === one.id ? 'bg-accent font-medium' : ''}`}>{one.label}</button>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => (chime('fold'), onDone())}>Cancel</Button>
          <Button size="sm" data-practice-save onClick={save}>{start.id ? 'Save' : 'Make practice'}</Button>
        </div>
      </div>
    </Island>
  )
}

/**
 * The desk: what this practice opens with, so you are working within a second.
 * A tag brings its gems, the recall cards due and the last draft; a source,
 * its last spot with an excerpt field ready; a problem list, the next problem
 * and last time's note.
 */
function Desk({ practice, running, runningId, onOpen }: { practice: PracticeRow; running: boolean; runningId: string | null; onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const loaded = useLive(() => practices.load(practice.id), null as Loaded | null, [practice.id, runningId], ['item', 'capture'])
  const row = 'flex w-full items-baseline gap-2 px-4 py-2 text-left text-body text-foreground hover:bg-accent/50'
  const [excerpt, setExcerpt] = useState('')
  const [page, setPage] = useState('')
  const keepExcerpt = async (): Promise<void> => {
    const source = loaded?.source
    if (!source || !excerpt.trim()) return chime('nope')
    const id = await window.api.captures.create({ kind: 'quote', body: excerpt.trim(), [source.field]: source.name } as never)
    if (page.trim()) await practices.spot(id, page)
    if (runningId) await vigil.logToSession(runningId, `Excerpt kept${page.trim() ? `, ${page.trim()}` : ''}`)
    chime('added')
    toast('Excerpt kept')
    setExcerpt('')
  }
  return (
    <Island title={running ? `Now: ${practice.name}` : `${practice.name}, ready for next time`} className="mt-6">
      <div data-practice-desk={practice.id} className="contents">
        {loaded?.lastNote && <p data-desk-last className="px-4 py-2.5 text-body text-foreground"><span className="font-semibold">Last time:</span> {loaded.lastNote}</p>}
        {loaded?.problem && (
          <button type="button" data-desk-problem onClick={() => onOpen(loaded.problem!.noteType, loaded.problem!.noteId)} className={row}>
            <span className="shrink-0 font-semibold">Next problem</span>
            <span className="min-w-0 flex-1 truncate">{loaded.problem.text}</span>
            <span className="shrink-0 text-control text-foreground/70 tabular-nums">{loaded.problem.index + 1} of {loaded.problem.total}</span>
          </button>
        )}
        {loaded?.source && (
          <div data-desk-source className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-foreground">{loaded.source.name}</span>
              <span className="text-body text-foreground">{loaded.source.spot ? `Last spot: ${loaded.source.spot}` : 'No spot kept yet'}</span>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => openSource(loaded.source!.field as SourceField, loaded.source!.name)}>Open its page</Button>
            </div>
            <Textarea data-desk-excerpt value={excerpt} placeholder={`An excerpt from ${loaded.source.name}`} onChange={(event) => setExcerpt(event.target.value)} className="min-h-16"
              onKeyDown={(event) => event.key === 'Enter' && event.metaKey && (event.preventDefault(), void keepExcerpt())} />
            <div className="flex items-center gap-2">
              <Input data-desk-page value={page} placeholder="Page, e.g. p. 43" onChange={(event) => setPage(event.target.value)} className="w-40" />
              <Button size="sm" data-desk-keep onClick={() => void keepExcerpt()}>Keep excerpt</Button>
            </div>
          </div>
        )}
        {loaded?.queue && (
          <button type="button" data-desk-queue onClick={() => onOpen(loaded.queue!.type, loaded.queue!.id)} className={row}>
            <span className="shrink-0 font-semibold">Next in your queue</span><span className="min-w-0 flex-1 truncate">{loaded.queue.title}</span>
          </button>
        )}
        {loaded?.draft && (
          <button type="button" data-desk-draft onClick={() => onOpen('article', loaded.draft!.id)} className={row}>
            <span className="shrink-0 font-semibold">Your draft</span><span className="min-w-0 flex-1 truncate">{loaded.draft.title}</span>
          </button>
        )}
        {loaded && loaded.cards.length > 0 && (
          <div data-desk-cards className="px-4 py-2">
            <p className="font-semibold text-foreground">{loaded.cards.length === 1 ? 'A recall card is due' : `${num(loaded.cards.length)} recall cards are due`}</p>
            {loaded.cards.map((card) => (
              <button key={card.id} type="button" onClick={() => onOpen('nugget', card.id)} className="block w-full truncate py-0.5 text-left text-body text-foreground hover:underline">{card.prompt}</button>
            ))}
          </div>
        )}
        {loaded && loaded.gems.length > 0 && (
          <div data-desk-gems className="px-4 py-2">
            <p className="font-semibold text-foreground">Your gems on #{loaded.tag}</p>
            {loaded.gems.map((gem) => (
              <button key={gem.id} type="button" onClick={() => onOpen('nugget', gem.id)} className="block w-full truncate py-0.5 text-left text-body text-foreground hover:underline">{gem.title}</button>
            ))}
          </div>
        )}
        {loaded && !loaded.lastNote && !loaded.problem && !loaded.source && !loaded.queue && !loaded.draft && !loaded.cards.length && !loaded.gems.length && (
          <p className="px-4 py-3 text-body text-foreground">{practice.loadKind ? `Nothing here yet for ${loadSaid(practice).replace(/^Opens /, '')}. What you keep on it shows up here next time.` : 'Nothing to load: just the time. Edit it to open a tag, a book, your queue or a problem list.'}</p>
        )}
      </div>
    </Island>
  )
}

/** Stats: the honest record of each practice, "planned 30, averaging 22", once there are a few weeks of it. */
export function PracticeStats(): React.JSX.Element | null {
  const read = usePractices()
  const all = read.filter((one) => one.honest)
  useReading(unloaded(read))
  if (!all.length) return null
  return (
    <Island title="Practices" className="mt-8">
      {all.map((one) => (
        <p key={one.id} data-stats-practice={one.id} className="px-4 py-3 text-body text-foreground">
          <span className="font-semibold">{one.name}</span>: {honestSaid(one.honest!)}
        </p>
      ))}
    </Island>
  )
}

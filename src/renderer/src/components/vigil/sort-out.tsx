import { useEffect, useMemo, useRef, useState } from 'react'
import { chime } from '@/lib/sound'
import { useLive, vigil, type Settings } from '@/lib/vigil'
import { useByKeys } from '@/lib/motion'
import { readingQueue } from '@/lib/reading-queue'
import { Button } from '@/components/ui/button'
import { sortOut, suggestedTag, type Sort, type Sorted } from '../../../../main/day-lines'
import { num } from '../../../../main/dates'
import { shiftTo } from './tasks-view'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Kbd, Tip, toast } from './ui'
import { ChevronDown, Undo2, X } from 'lucide-react'
import { takeExit, unpromote } from '@/lib/capture-links'
import { markSorted, openInboxSort, sortAway, sortDue } from '@/lib/sort-out'
import { realMove } from '@/lib/real-move'

/**
 * Sort this out: a running page pasted in (the kind kept in Raycast Notes or
 * Apple Notes, with Now and Next, links, a word to learn, a saying, ideas)
 * shown line by line as what each is best kept as. Every line can be changed
 * or left out before anything happens, and nothing moves until “Sort them”.
 * The page itself stays as it was. One Undo takes back all of it.
 */

const KINDS: { id: Sort; label: string; said: [string, string] }[] = [
  { id: 'task', label: 'Task', said: ['task', 'tasks'] },
  { id: 'link', label: 'Link', said: ['link to read', 'links to read'] },
  { id: 'word', label: 'Word', said: ['word to learn', 'words to learn'] },
  { id: 'saying', label: 'Saying', said: ['saying', 'sayings'] },
  { id: 'note', label: 'Note', said: ['note', 'notes'] },
  { id: 'skip', label: 'Leave', said: ['left out', 'left out'] }
]
const TINT: Record<Sort, string> = {
  task: 'var(--tt-color-text-orange)', link: 'var(--tt-color-text-blue)', word: 'var(--tt-color-text-green)',
  saying: 'var(--tt-color-text-purple)', note: 'var(--muted-foreground)', skip: 'var(--muted-foreground)'
}

/** A note's words as the editor keeps them: one paragraph. */
const doc = (text: string): unknown => ({ type: 'doc', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] })
/** "Slow is smooth. - Navy SEALs": the words and who said them. */
const saying = (text: string): { words: string; by?: string } => {
  const found = /^["“'‘]?(.+?)["”'’]?\s*[-–—]\s*([^-–—]{2,60})$/.exec(text)
  return found ? { words: found[1].trim(), by: found[2].trim() } : { words: text.replace(/^["“'‘]|["”'’]$/g, '').trim() }
}

export function SortSheet(): React.JSX.Element | null {
  const [asked, setAsked] = useState<{ text: string; origin: string | null; inbox?: boolean } | null>(null)
  useEffect(() => {
    const open = (event: Event): void => {
      chime('open')
      setAsked((event as CustomEvent<{ text: string; origin: string | null; inbox?: boolean }>).detail)
    }
    window.addEventListener('vigil:sort-out', open)
    return () => window.removeEventListener('vigil:sort-out', open)
  }, [])
  if (!asked) return null
  if (asked.inbox) return <InboxSort onClose={() => setAsked(null)} />
  return <Sheet key={asked.text} text={asked.text} origin={asked.origin} onClose={() => setAsked(null)} />
}

function Sheet({ text, origin, onClose }: { text: string; origin: string | null; onClose: () => void }): React.JSX.Element {
  // Opened by a key it is simply there, read once: a click inside never plays the entrance after.
  const keyed = useByKeys(true)
  const first = useMemo(() => sortOut(text), [text])
  const [rows, setRows] = useState<Sorted[]>(first)
  // Tags offered from a leading "[word]": chosen only by you.
  const [tagged, setTagged] = useState<Record<string, boolean>>({})
  // From the box there is no page yet: kept as one note too unless you say not.
  const [keepPage, setKeepPage] = useState(!origin)
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const set = (id: string, patch: Partial<Sorted>): void => setRows((all) => all.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  const counts = KINDS.map((kind) => [kind, rows.filter((row) => row.kind === kind.id).length] as const).filter(([, n]) => n)
  const kept = rows.filter((row) => row.kind !== 'skip')
  const close = (): void => (chime('fold'), onClose())
  /** The next or last kind, round the list, Leave included. */
  const cycle = (row: Sorted, by: 1 | -1): void => {
    const at = KINDS.findIndex((kind) => kind.id === row.kind)
    chime('tap')
    set(row.id, { kind: KINDS[(at + by + KINDS.length) % KINDS.length].id })
  }

  /** The words a line is kept with: a chosen tag moved from its "[word]" to the end as #tag. */
  const words = (row: Sorted): string => {
    const tag = row.suggest && tagged[row.id] ? row.suggest : null
    const body = tag ? row.text.replace(/^\s*\[[^\]]+\]\s*/, '') : row.text
    return [body, tag && `#${tag}`, row.tag && row.kind === 'note' && `#${row.tag}`].filter(Boolean).join(' ')
  }

  const sort = async (): Promise<void> => {
    if (busy || !kept.length) return chime('nope')
    setBusy(true)
    const tasks: { id: string; existed: boolean }[] = []
    const captures: string[] = []
    let page: string | null = null
    // Links that were kept but could not join the Queue: said, not dropped.
    let unqueued = 0
    try {
      if (keepPage && !origin) page = await window.api.captures.create({ kind: 'note', body: { type: 'doc', content: text.split('\n').map((line) => ({ type: 'paragraph', content: line.trim() ? [{ type: 'text', text: line }] : [] })) } })
      const from = origin ?? page ?? undefined
      for (const row of kept) {
        const line = words(row)
        if (row.kind === 'task') {
          const head = (row.under ?? '').toLowerCase()
          const made = await vigil.addTask(line, from, head === 'now' || head === 'today')
          tasks.push({ id: made.id, existed: made.existed })
          if (made.existed) continue
          if (head === 'later' || head === 'someday') await vigil.saveTask(made.id, { plan: 'someday' })
          if (head === 'tomorrow') await vigil.saveTask(made.id, { due: shiftTo(1) })
          if (row.steps.length) await vigil.saveTask(made.id, { subtasks: row.steps })
          if (row.done) await vigil.doneTask(made.id)
          continue
        }
        const kind = row.kind === 'saying' ? 'quote' : row.kind
        const said = row.kind === 'saying' ? saying(line) : { words: line }
        const id = await window.api.captures.create({ kind: kind as 'note', body: doc(said.words), origin: from, ...(said.by ? { attribution: said.by } : {}) })
        captures.push(id)
        if (row.kind === 'link') await readingQueue.add([id]).catch(() => void unqueued++)
      }
    } finally {
      setBusy(false)
    }
    chime('promote')
    onClose()
    const parts = KINDS.filter((kind) => kind.id !== 'skip').map((kind) => [kind, kept.filter((row) => row.kind === kind.id).length] as const).filter(([, n]) => n)
      .map(([kind, n]) => `${num(n)} ${kind.said[n === 1 ? 0 : 1]}`)
    const missed = unqueued ? `. ${unqueued === 1 ? 'One link' : `${num(unqueued)} links`} could not join the Queue and ${unqueued === 1 ? 'waits' : 'wait'} in the Inbox` : ''
    toast(`Sorted: ${parts.join(', ')}${missed}`, () => {
      chime('undo')
      void Promise.all([
        ...tasks.map((one) => vigil.unmakeTask(one.id, one.existed, [], [])),
        ...captures.map((id) => (origin || page ? vigil.unmakeCapture(id, (origin ?? page)!) : window.api.captures.save(id, { status: 'discarded' }))),
        ...(page ? [window.api.captures.save(page, { status: 'discarded' })] : [])
      ])
    }, unqueued ? 'warning' : 'success')
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // An open kind menu takes its own Escape: only that closes, every choice kept.
      if (event.key === 'Escape' && document.querySelector('[role="menu"]')) return
      if (event.key === 'Escape') return void (event.preventDefault(), event.stopImmediatePropagation(), close())
      if (event.key === 'Enter' && event.metaKey) return void (event.preventDefault(), void sort())
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  // Under the heading each line sat under, as the page had them.
  const groups = rows.reduce<{ under: string | null; rows: Sorted[] }[]>((all, row) => {
    const last = all[all.length - 1]
    if (last && last.under === row.under) last.rows.push(row)
    else all.push({ under: row.under, rows: [row] })
    return all
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[5vh]" onMouseDown={close}>
      <div ref={box} role="dialog" aria-label="Sort this out" data-sort-out
        className={`flex max-h-[88vh] w-[min(44rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-(--mf-panel-shadow) ${keyed ? '' : 'animate-in fade-in-0 slide-in-from-bottom-2 duration-200'}`}
        onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b px-5 py-3">
          <h2 className="font-heading text-heading font-semibold text-foreground">Sort this out</h2>
          <span className="flex-1" />
          <Kbd>Esc</Kbd>
          <p data-sort-note className="basis-full text-body text-foreground">{num(rows.length)} lines. Change any guess; <strong className="font-semibold">nothing moves until you say so</strong>.</p>
        </div>
        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
          {groups.map((group, at) => (
            <section key={at}>
              {group.under && <h3 className="mb-1 text-control font-semibold text-foreground">{group.under}</h3>}
              <ul className="flex flex-col">
                {group.rows.map((row) => (
                  <li key={row.id} data-sort-row={row.id} data-kind={row.kind} className="flex flex-col gap-1 rounded-md px-1 py-1.5 hover:bg-accent/40">
                    <div className="flex items-center gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          {/* A choice, and looks it: a chevron, a hover, and ↑ ↓ change it without opening the list. */}
                          <button type="button" aria-label={`Keep it as: ${KINDS.find((kind) => kind.id === row.kind)!.label}. Change`} data-kind-chip
                            onKeyDown={(event) => {
                              if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                              event.preventDefault()
                              event.stopPropagation()
                              cycle(row, event.key === 'ArrowDown' ? 1 : -1)
                            }}
                            className="flex h-7 w-[5.5rem] shrink-0 items-center justify-between gap-1 rounded-md border border-foreground/10 bg-foreground/[0.04] pr-1.5 pl-2 text-left text-control font-semibold transition-colors hover:border-foreground/25 hover:bg-accent data-[state=open]:bg-accent" style={{ color: TINT[row.kind] }}>
                            {KINDS.find((kind) => kind.id === row.kind)!.label}
                            <ChevronDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {KINDS.map((kind) => (
                            <DropdownMenuItem key={kind.id} onSelect={() => (chime('tap'), set(row.id, { kind: kind.id }))}>
                              <span className="font-semibold" style={{ color: TINT[kind.id] }}>{kind.label}</span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <input value={row.text}
                        // ⌥↑ ⌥↓ change what it is kept as from the words themselves.
                        onKeyDown={(event) => {
                          if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
                          event.preventDefault()
                          cycle(row, event.key === 'ArrowDown' ? 1 : -1)
                        }} onChange={(event) => set(row.id, { text: event.target.value, suggest: suggestedTag(event.target.value) })} aria-label="Its words"
                        className={`min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-0.5 text-body outline-none focus:bg-accent/50 ${row.kind === 'skip' ? 'text-muted-foreground line-through' : 'text-foreground'}`} />
                      {row.suggest && row.kind !== 'skip' && (
                        <button type="button" aria-pressed={!!tagged[row.id]} onClick={() => (chime(tagged[row.id] ? 'untag' : 'tag'), setTagged((all) => ({ ...all, [row.id]: !all[row.id] })))}
                          className={`shrink-0 rounded-md px-1.5 py-0.5 text-control transition-colors ${tagged[row.id] ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
                          {tagged[row.id] ? `#${row.suggest}` : `Tag #${row.suggest}?`}
                        </button>
                      )}
                      {/* Left out, or back in: one click, the line stays where it is. */}
                      <Tip label={row.kind === 'skip' ? 'Keep this line after all' : 'Leave this line out'}>
                        <button type="button" data-leave={row.id} aria-label={row.kind === 'skip' ? 'Keep this line after all' : 'Leave this line out'}
                          onClick={() => (chime(row.kind === 'skip' ? 'on' : 'off'), set(row.id, { kind: row.kind === 'skip' ? (first.find((one) => one.id === row.id)?.kind ?? 'note') === 'skip' ? 'note' : first.find((one) => one.id === row.id)!.kind : 'skip' }))}
                          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                          {row.kind === 'skip' ? <Undo2 className="size-3.5" /> : <X className="size-3.5" />}
                        </button>
                      </Tip>
                    </div>
                    {row.kind === 'task' && row.done && <p className="pl-[5.5rem] text-control font-medium text-[var(--tt-color-text-green)]">Ticked on the page: kept as done</p>}
                    {row.kind === 'task' && row.steps.length > 0 && (
                      <p className="pl-[5.5rem] text-control text-muted-foreground">{num(row.steps.length)} {row.steps.length === 1 ? 'step' : 'steps'}: {row.steps.map((one) => one.text).join(', ')}</p>
                    )}
                    {row.kind === 'note' && row.tag && <p className="pl-[5.5rem] text-control text-muted-foreground">Tagged #{row.tag}, from its heading</p>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t px-5 py-3">
          <p data-sort-counts className="min-w-0 flex-1 text-body text-foreground">
            {counts.filter(([kind]) => kind.id !== 'skip').map(([kind, n], at) => (
              <span key={kind.id}>{at ? ', ' : ''}<strong className="font-semibold tabular-nums" style={{ color: TINT[kind.id] }}>{num(n)}</strong> {kind.said[n === 1 ? 0 : 1]}</span>
            ))}
          </p>
          {!origin && (
            <button type="button" role="switch" aria-checked={keepPage} onClick={() => (chime(keepPage ? 'off' : 'on'), setKeepPage(!keepPage))}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 text-control text-foreground hover:bg-accent">
              <span aria-hidden className={`relative h-4 w-7 rounded-full transition-colors ${keepPage ? 'bg-foreground' : 'bg-foreground/20'}`}>
                <span className={`absolute top-0.5 left-0.5 size-3 rounded-full bg-background transition-transform ${keepPage ? 'translate-x-3' : ''}`} />
              </span>
              Keep the page as a note too
            </button>
          )}
          <Button size="sm" disabled={busy || !kept.length} onClick={() => void sort()}>Sort them <Kbd>⌘↵</Kbd></Button>
        </div>
      </div>
    </div>
  )
}

// --- the morning sort: "Sort this out" over the Inbox, about ten minutes

/** How long the morning sort is meant to take. A guide, never a cut-off. */
export const SORT_MINUTES = 10

type Way = 'task' | 'gem' | 'resolve' | 'bin' | 'leave'
const WAYS: { id: Way; label: string; key: string; tint: string; said: [string, string] }[] = [
  { id: 'task', label: 'Task', key: 'T', tint: 'var(--tt-color-text-orange)', said: ['task', 'tasks'] },
  { id: 'gem', label: 'Gem', key: 'G', tint: 'var(--tt-color-text-purple)', said: ['gem', 'gems'] },
  { id: 'resolve', label: 'Resolve', key: 'R', tint: 'var(--tt-color-text-green)', said: ['resolved', 'resolved'] },
  { id: 'bin', label: 'Bin', key: 'B', tint: 'var(--tt-color-text-red)', said: ['to the Bin', 'to the Bin'] },
  { id: 'leave', label: 'Later', key: 'L', tint: 'var(--muted-foreground)', said: ['left for later', 'left for later'] }
]
/** A first guess from the words, the way a pasted page is read: a to-do is a task, a saying or a word a gem; the rest is yours to say. */
const guess = (text: string): Way => {
  const kind = sortOut(text)[0]?.kind
  return kind === 'task' ? 'task' : kind === 'saying' || kind === 'word' ? 'gem' : 'leave'
}

/**
 * The Inbox, a line a capture, each with where it goes: a task, a gem,
 * resolved, the Bin, or left for later. A gentle ten-minute clock runs at the
 * top; when it is up it says so once and nothing stops. Nothing moves until
 * “Sort them”, and one Undo takes all of it back.
 */
function InboxSort({ onClose }: { onClose: () => void }): React.JSX.Element {
  const keyed = useByKeys(true)
  const [rows, setRows] = useState<{ id: string; text: string; way: Way }[] | null>(null)
  const [cursor, setCursor] = useState(0)
  const [busy, setBusy] = useState(false)
  const [started] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    markSorted()
    const day = new Date().toLocaleDateString('en-CA')
    void window.api.captures.list().then((all) => setRows(all
      .filter((one) => one.status === 'open' && !one.archivedAt && !one.keptIn && !(one.snoozedUntil && one.snoozedUntil > day))
      .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
      .map((one) => ({ id: one.id, text: one.label, way: guess(one.label) }))))
    const every = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(every)
  }, [])
  const left = Math.max(0, SORT_MINUTES * 60_000 - (now - started))
  const up = left === 0
  // Said once, softly, when the ten minutes are up.
  const [told, setTold] = useState(false)
  useEffect(() => void (up && !told && (setTold(true), chime('settled'))), [up, told])
  const list = rows ?? []
  const set = (id: string, way: Way): void => (chime('tap'), setRows((all) => (all ?? []).map((row) => (row.id === id ? { ...row, way } : row))))
  const close = (): void => (chime('fold'), onClose())
  const moving = list.filter((row) => row.way !== 'leave')

  const sort = async (): Promise<void> => {
    if (busy || !moving.length) return chime('nope')
    setBusy(true)
    const undo: (() => Promise<unknown>)[] = []
    const done: Way[] = []
    try {
      for (const row of moving) {
        if (row.way === 'task') {
          const made = await vigil.addTask(row.text, row.id)
          await window.api.captures.save(row.id, { status: 'resolved' })
          undo.push(() => vigil.unmakeTask(made.id, made.existed, [], []), () => window.api.captures.save(row.id, { status: 'open' }))
        } else if (row.way === 'gem') {
          const result = await takeExit(row.id, 'promoted')
          if (typeof result !== 'string') continue
          undo.push(() => unpromote(row.id, result))
        } else {
          await window.api.captures.save(row.id, { status: row.way === 'bin' ? 'discarded' : 'resolved' })
          undo.push(() => window.api.captures.save(row.id, { status: 'open' }))
        }
        done.push(row.way)
      }
    } finally {
      setBusy(false)
    }
    chime('promote')
    onClose()
    const parts = WAYS.filter((way) => way.id !== 'leave').map((way) => [way, done.filter((one) => one === way.id).length] as const).filter(([, n]) => n)
      .map(([way, n]) => `${num(n)} ${way.said[n === 1 ? 0 : 1]}`)
    const waiting = list.length - done.length
    toast(`Inbox sorted: ${parts.join(', ') || 'nothing moved'}${waiting ? `. ${num(waiting)} still waiting` : ''}`, () => (chime('undo'), void Promise.all(undo.map((run) => run()))), 'success')
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') return void (event.preventDefault(), event.stopImmediatePropagation(), close())
      if (event.key === 'Enter' && event.metaKey) return void (event.preventDefault(), void sort())
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const row = list[cursor]
      const way = WAYS.find((one) => one.key.toLowerCase() === event.key.toLowerCase())
      if (event.key === 'j' || event.key === 'ArrowDown') setCursor((at) => Math.min(list.length - 1, at + 1))
      else if (event.key === 'k' || event.key === 'ArrowUp') setCursor((at) => Math.max(0, at - 1))
      else if (row && way) (set(row.id, way.id), setCursor((at) => Math.min(list.length - 1, at + 1)))
      else return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const minutes = Math.ceil(left / 60_000)
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[5vh]" onMouseDown={close}>
      <div role="dialog" aria-label="Sort this out: your Inbox" data-sort-out="inbox"
        className={`flex max-h-[88vh] w-[min(44rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-(--mf-panel-shadow) ${keyed ? '' : 'animate-in fade-in-0 slide-in-from-bottom-2 duration-200'}`}
        onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b px-5 py-3">
          <h2 className="font-heading text-heading font-semibold text-foreground">Sort this out: your Inbox</h2>
          <span className="flex-1" />
          <span data-sort-timer={up ? 'up' : minutes} className="text-body font-semibold tabular-nums" style={{ color: up ? 'var(--tt-color-text-green)' : 'var(--foreground)' }}>
            {up ? 'Ten minutes are up' : `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left`}
          </span>
          <Kbd>Esc</Kbd>
          {/* The clock as a thin line that empties, never a red alarm. */}
          <span aria-hidden className="relative mt-1.5 block h-1 basis-full overflow-hidden rounded-full bg-foreground/10">
            <span className="absolute inset-0 origin-left rounded-full bg-[var(--tt-color-text-green)] transition-transform duration-1000 ease-linear" style={{ transform: `scaleX(${left / (SORT_MINUTES * 60_000)})` }} />
          </span>
          <p data-sort-note className="basis-full text-body text-foreground">
            {rows === null ? '' : !list.length ? 'Your Inbox is empty. Nothing to sort this morning.'
              : up ? <><strong className="font-semibold">That is the ten minutes.</strong> Sort what you have decided; the rest waits for tomorrow.</>
              : <>{num(list.length)} {list.length === 1 ? 'capture' : 'captures'}, oldest first. Pick where each goes with <strong className="font-semibold">T G R B L</strong>; nothing moves until you say so.</>}
          </p>
        </div>
        <ul className="flex flex-col overflow-y-auto px-3 py-2">
          {list.map((row, at) => (
            <li key={row.id} data-sort-row={row.id} data-kind={row.way} data-cursor={at === cursor || undefined} onMouseMove={(event) => realMove(event) && setCursor(at)}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${at === cursor ? 'bg-accent/50' : ''}`}>
              <span className={`min-w-0 flex-1 truncate text-body ${row.way === 'bin' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{row.text || 'Untitled'}</span>
              <span className="flex shrink-0 items-center gap-1">
                {WAYS.map((way) => (
                  <button key={way.id} type="button" aria-pressed={row.way === way.id} onClick={() => set(row.id, way.id)}
                    className={`flex h-6 items-center gap-1 rounded-md px-2 text-control font-medium transition-colors ${row.way === way.id ? 'bg-foreground text-background' : 'hover:bg-accent'}`}
                    style={row.way === way.id ? undefined : { color: way.tint }}>
                    {way.label}<kbd className={`font-sans text-[0.6875rem] ${at === cursor ? 'opacity-80' : 'opacity-45'}`}>{way.key}</kbd>
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3 border-t px-5 py-3">
          <p data-sort-counts className="min-w-0 flex-1 text-body text-foreground">
            {WAYS.map((way) => [way, list.filter((row) => row.way === way.id).length] as const).filter(([, n]) => n).map(([way, n], at) => (
              <span key={way.id}>{at ? ', ' : ''}<strong className="font-semibold tabular-nums" style={{ color: way.tint }}>{num(n)}</strong> {way.said[n === 1 ? 0 : 1]}</span>
            ))}
          </p>
          <Button size="sm" disabled={busy || !moving.length} onClick={() => void sort()}>Sort them <Kbd>⌘↵</Kbd></Button>
        </div>
      </div>
    </div>
  )
}

/** On Home in the morning, once: a calm line offering the ten-minute sort, while the Inbox has something in it. */
export function MorningSortOffer(): React.JSX.Element | null {
  const settings = useLive(vigil.settings, null as Settings | null)
  const waiting = useLive(() => window.api.captures.list().then((all) => all.filter((one) => one.status === 'open' && !one.archivedAt && !one.keptIn).length), null as number | null)
  const [, tick] = useState(0)
  useEffect(() => {
    const again = (): void => tick((n) => n + 1)
    const every = setInterval(again, 60_000)
    window.addEventListener('vigil:morning-sorted', again)
    return () => (clearInterval(every), window.removeEventListener('vigil:morning-sorted', again))
  }, [])
  if (!settings || !waiting || !sortDue(settings.morningSort)) return null
  return (
    <section data-morning-sort aria-label="Morning sort" className="mx-3 flex items-center gap-3 rounded-xl border bg-background px-4 py-3 @[44rem]/page:mx-6">
      <p className="min-w-0 flex-1 text-body text-foreground">
        <strong className="font-semibold">Good morning.</strong> {num(waiting)} {waiting === 1 ? 'capture waits' : 'captures wait'} in your Inbox. Sort them in about ten minutes, then get on with the day.
      </p>
      <Button size="sm" onClick={() => openInboxSort()}>Sort this out</Button>
      <button type="button" aria-label="Not today" onClick={() => (chime('fold'), sortAway())} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground">
        <X className="size-3.5" />
      </button>
    </section>
  )
}

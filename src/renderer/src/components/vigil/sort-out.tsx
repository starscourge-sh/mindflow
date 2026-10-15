import { useEffect, useMemo, useRef, useState } from 'react'
import { chime } from '@/lib/sound'
import { vigil } from '@/lib/vigil'
import { useByKeys } from '@/lib/motion'
import { readingQueue } from '@/lib/reading-queue'
import { Button } from '@/components/ui/button'
import { sortOut, suggestedTag, type Sort, type Sorted } from '../../../../main/day-lines'
import { num } from '../../../../main/dates'
import { shiftTo } from './tasks-view'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Kbd, Tip, toast } from './ui'
import { ChevronDown, Undo2, X } from 'lucide-react'

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
  const [asked, setAsked] = useState<{ text: string; origin: string | null } | null>(null)
  useEffect(() => {
    const open = (event: Event): void => {
      chime('open')
      setAsked((event as CustomEvent<{ text: string; origin: string | null }>).detail)
    }
    window.addEventListener('vigil:sort-out', open)
    return () => window.removeEventListener('vigil:sort-out', open)
  }, [])
  if (!asked) return null
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

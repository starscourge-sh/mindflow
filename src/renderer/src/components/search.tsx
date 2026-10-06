import { Fragment, useEffect, useRef, useState } from 'react'
import { chime, click, type Cue } from '@/lib/sound'
import type { JSONContent } from '@tiptap/core'

import { CAPTURE_TYPES } from './capture-kinds/capture-kind-picker'
import { whereFrom } from './capture-list'
import { MindflowEditor } from './mindflow'
import { AskWho, Kbd, Typed } from './vigil/ui'
import { AliveIcon } from './vigil/alive-icon'
import { Orb } from './vigil/orb'
import MagnifierIcon from '@/components/ui/magnifier-icon'
import LayoutSidebarRightIcon from '@/components/ui/layout-sidebar-right-icon'
import { Chips } from './vigil/display'
import { Tip } from '@/components/vigil/ui'
import { vigil, when, type TaskFull } from '@/lib/vigil'
import { BUCKETS, bucket } from '@/lib/tasks'
import { PRIORITY_NAMES } from '../../../main/task-words'
import { GlossLine, openGloss } from './vigil/gloss-line'
import { dayjs, daysSince } from '../../../main/dates'

type Capture = Awaited<ReturnType<typeof window.api.captures.find>>[number]

/** Something to do from the palette, with the key that does it anywhere. */
/** `cue` is its sound, on/off for a switch; a tap when it says nothing. */
export type Action = { label: string; keys?: string; run: () => void; cue?: Cue | null; own?: boolean }

/** Which of Notion's three groups a date falls in. */
const groupOf = (at: string): string => {
  return dayjs(at).isSame(dayjs(), 'day') ? 'Today' : daysSince(at) <= 30 ? 'Past 30 days' : 'Older'
}

/**
 * Search, the way Notion's works: type, and the matches come up grouped by when
 * they were captured, with the one under the cursor previewed on the right.
 * Arrows move, Enter opens, Escape closes.
 */
export function Search({ onOpen, onClose, initial = '', actions = [], placeholder }: { onOpen: (type: string, id: string) => void; onClose: () => void; initial?: string; actions?: Action[]; placeholder?: string }): React.JSX.Element {
  const [query, setQuery] = useState(initial)
  // Opening search sends out one ping.
  useEffect(() => chime('search'), [])
  const [found, setFound] = useState<Capture[]>([])
  // A search still out after 300ms: the last words' results go, and the orb
  // says it is looking. A quick one never shows either.
  const [slow, setSlow] = useState(false)
  // Notion's chips under the box: names only, one type of thing, one kind.
  const [titleOnly, setTitleOnly] = useState(false)
  const [types, setTypes] = useState<string[]>([])
  const [kinds, setKinds] = useState<string[]>([])
  const flip = (list: string[], id: string): string[] => (list.includes(id) ? list.filter((one) => one !== id) : [...list, id])
  const words = query.toLowerCase().split(/\s+/).filter((word) => word && !word.startsWith('kind:'))
  const results = (slow ? [] : found).filter((one) =>
    (!titleOnly || words.every((word) => one.label.toLowerCase().includes(word))) &&
    (!types.length || types.includes(one.type === 'article' || one.type === 'question' ? 'nugget' : one.type)) &&
    (!kinds.length || kinds.includes(one.kind)))
  // Raycast's ⌘K: what you can do comes first, matched by the same words,
  // then what you have written. One list, one cursor.
  // Typed, the open note's own actions come before places to go: "Archive"
  // with a note open means archive it, not the Archived list.
  const doing = actions.filter((one) => words.every((word) => one.label.toLowerCase().includes(word)))
    .sort((a, b) => (query.trim() ? Number(!!b.own) - Number(!!a.own) : 0)).slice(0, query.trim() ? 4 : 12)
  const [at, setAt] = useState(0)
  // Tab on a result asks who said it, without leaving search.
  const [asking, setAsking] = useState(false)
  const box = useRef<HTMLInputElement>(null)
  // Notion's highlight pane: on by default, and a button to put it away.
  const [pane, setPane] = useState(true)
  // The words the list on screen answers. A reply for words since changed is
  // dropped: a slow search must not land over a quicker, newer one.
  const [searched, setSearched] = useState<string | null>(null)
  useEffect(() => {
    let old = false
    const late = setTimeout(() => setSlow(true), 300)
    // Asked once the typing pauses, not for every letter of a word on the way.
    const ask = setTimeout(() => void window.api.captures.find(query).then((list) => {
      if (old) return
      clearTimeout(late)
      setSlow(false)
      setFound(list)
      setSearched(query)
      setAt(0)
    }), 80)
    return () => {
      old = true
      clearTimeout(late)
      clearTimeout(ask)
    }
  }, [query])
  // The kinds are many: one Kind chip opens them.
  const [kindsOpen, setKindsOpen] = useState(false)
  useEffect(() => setAt(0), [titleOnly, types, kinds])
  // The highlighted result stays in view as the arrows move it.
  useEffect(() => {
    document.querySelector('[data-search-at]')?.scrollIntoView({ block: 'nearest' })
  }, [at, results.length])
  const current = at >= doing.length ? results[at - doing.length] : undefined
  const total = doing.length + results.length
  // Opened for something to do, it is Raycast's small list: no filters, no
  // empty preview half. Typing makes it the full search.
  const compact = actions.length > 0 && !query.trim()
  const preview = pane && !!current
  // A gloss on anything found, a task included: there it lands in the task's log.
  const glossable = !!current
  // ⌘; pressed with the preview put away: the line opens under the row instead.
  const [glossing, setGlossing] = useState(false)
  useEffect(() => setGlossing(false), [current?.id])
  const backToBox = (): void => (setGlossing(false), box.current?.focus())
  const run = (action: Action): void => {
    // null: the action sounds for itself (the sound switch, the panel).
    if (action.cue !== null) chime(action.cue ?? 'tap')
    onClose()
    action.run()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[10vh]" onMouseDown={onClose}>
      <div className={`@container/search flex flex-col overflow-hidden rounded-xl border bg-background text-sm shadow-(--mf-panel-shadow) ${compact ? 'max-h-[70vh] w-[min(36rem,calc(100vw-2rem))]' : 'h-[70vh] w-[min(56rem,calc(100vw-2rem))]'}`} onMouseDown={(event) => event.stopPropagation()}>
        <label className="flex items-center gap-3 border-b px-4 py-3">
          <span className="text-muted-foreground"><AliveIcon icon={MagnifierIcon} size={16} /></span>
          <input
            ref={box}
            autoFocus
            className="flex-1 bg-transparent text-heading outline-none"
            placeholder={placeholder ?? (actions.length ? 'Do something, or search everything…' : 'Search everything… kind:quote to narrow')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { event.preventDefault(); chime('fold'); onClose() }
              else if (event.key === 'Enter' && at < doing.length) run(doing[at])
              else if (event.key === 'Enter' && current) onOpen(current.type, current.id)
              else if (event.key === 'Tab' && current?.type === 'capture') setAsking(true)
              // ⌘; a thought on the highlighted one, without opening it.
              // Taken even on an action, so it never reaches a hint card behind search.
              else if (event.metaKey && event.key === ';') { if (glossable) { chime('tap'); setGlossing(true); if (preview) openGloss(current.id) } }
              // The arrows, or Ctrl-J and Ctrl-K: the editor's vim, carried into the box.
              else if (event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'j')) { click('soft'); setAt((n) => Math.min(n + 1, total - 1)) }
              else if (event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'k')) { click('soft'); setAt((n) => Math.max(n - 1, 0)) }
              else return
              event.preventDefault()
            }}
          />
          <Tip label="Show highlight pane">
          <button type="button" className={`rounded p-1 hover:bg-accent ${pane ? 'text-foreground' : 'text-muted-foreground'} ${compact ? 'hidden' : ''}`} onClick={() => { chime(pane ? 'fold' : 'slide'); setPane(!pane) }}>
            <AliveIcon icon={LayoutSidebarRightIcon} size={16} />
          </button>
          </Tip>
        </label>
        {/* One gap everywhere; the groups are told apart by a hairline, not by wider gaps. */}
        <div className={`flex flex-wrap items-center gap-x-1 gap-y-0.5 border-b px-2 py-1.5 ${compact ? 'hidden' : ''}`}>
          <Chips options={[{ id: 'name', label: 'Name only' }]} on={() => titleOnly} pick={() => setTitleOnly(!titleOnly)} />
          <span aria-hidden className="mx-1 h-3.5 w-px bg-border" />
          <Chips options={[{ id: 'capture', label: 'Captures' }, { id: 'nugget', label: 'Nuggets' }, { id: 'task', label: 'Tasks' }]} on={(id) => types.includes(id)} pick={(id) => setTypes(flip(types, id))} />
          <span aria-hidden className="mx-1 h-3.5 w-px bg-border" />
          <Chips options={[{ id: 'kind', label: kinds.length ? `Kind · ${kinds.length}` : 'Kind' }]} on={() => kindsOpen || kinds.length > 0} pick={() => setKindsOpen(!kindsOpen)} />
          {kindsOpen && <span aria-hidden className="mx-1 h-3.5 w-px bg-border" />}
          {kindsOpen && <Chips options={CAPTURE_TYPES} on={(id) => kinds.includes(id)} pick={(id) => setKinds(flip(kinds, id))} />}
        </div>
        {/* Side by side when there is room; in a narrow window the preview goes
            under the results instead of squeezing both to nothing. */}
        <div className="flex min-h-0 flex-1 flex-col @[34rem]/search:flex-row">
          {/* mf-more: faded at an edge while there is more past it; the scroll
              padding keeps a row the arrows reach clear of that fade. */}
          <div className={`mf-more min-h-0 min-w-0 flex-1 scroll-pt-8 scroll-pb-12 overflow-y-auto p-2 ${preview ? '@[34rem]/search:w-1/2 @[34rem]/search:flex-none' : ''}`}>
            {doing.length > 0 && <div className="px-2 pt-1 pb-1 text-xs text-muted-foreground">Actions</div>}
            {doing.map((one, index) => (
              <button
                key={one.label}
                type="button"
                className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left ${index === at ? 'bg-accent' : ''}`}
                data-search-at={index === at || undefined}
                onMouseEnter={() => setAt(index)}
                onClick={() => run(one)}
              >
                <span className="min-w-0 flex-1 truncate">{one.label}</span>
                {one.keys && <span className="flex shrink-0 gap-0.5">{Array.from(one.keys).map((key, n) => <Kbd key={n}>{key}</Kbd>)}</span>}
              </button>
            ))}
            {!query.trim() && !doing.length && (
              <p className="px-2 py-3 text-body text-muted-foreground"><Typed text="Type to search captures, nuggets, articles and tasks. kind:quote narrows to one kind." /></p>
            )}
            {slow && query.trim() && (
              // The orb only if it is a real wait: a search back at once never shows it.
              <p className="flex px-2 py-2"><Orb state="searching" label="Searching…" className="animate-in fade-in-0 duration-200" /></p>
            )}
            {query.trim() && searched === query && !results.length && !doing.length && (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                <Typed text={types.length || kinds.length || titleOnly
                  ? 'Nothing matches with those filters. Turn a chip off to widen it.'
                  : 'Nothing matches. Try fewer words: every word has to appear somewhere.'} />
              </p>
            )}
            {results.map((capture, index) => {
              const kind = CAPTURE_TYPES.find((type) => type.id === capture.kind) ?? CAPTURE_TYPES[0]
              const group = groupOf(capture.capturedAt)
              return (
                <Fragment key={capture.id}>
                  {group !== (index ? groupOf(results[index - 1].capturedAt) : '') && (
                    <div className="px-2 pt-3 pb-1 text-xs text-muted-foreground">{group}</div>
                  )}
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left ${index + doing.length === at ? 'bg-accent' : ''}`}
                    data-search-at={index + doing.length === at || undefined}
                    onMouseEnter={() => setAt(index + doing.length)}
                    data-row
                    onClick={() => onOpen(capture.type, capture.id)}
                  >
                    <kind.icon className="size-4 shrink-0" style={{ color: kind.tint }} />
                    <span className="min-w-0 truncate">{capture.label || 'Untitled'}</span>
                    {capture.type !== 'capture' && <span className="shrink-0 rounded bg-accent px-1.5 text-xs text-muted-foreground capitalize">{capture.type}</span>}
                    {whereFrom(capture.source, capture.label) && <span className="min-w-0 max-w-[40%] truncate text-xs text-muted-foreground">· {whereFrom(capture.source, capture.label)}</span>}
                    {index + doing.length === at && !asking && capture.type === 'capture' && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{capture.attribution ?? 'Tab: who said it'}</span>}
                  </button>
                  {index + doing.length === at && glossing && !preview && glossable && (
                    <div className="px-8 pb-1"><GlossLine id={capture.id} open onDone={backToBox} /></div>
                  )}
                  {index + doing.length === at && asking && (
                    <div className="px-8 pb-1">
                      <AskWho id={capture.id} onDone={() => {
                        setAsking(false)
                        box.current?.focus()
                        void window.api.captures.find(query).then(setFound)
                      }} />
                    </div>
                  )}
                </Fragment>
              )
            })}
          </div>
          {/* The capture as it reads, not its raw text: the same editor, read only,
              and a fresh one for each result. */}
          {pane && current && (
            <div className="m-3 mt-0 flex max-h-[45%] min-h-24 shrink-0 flex-col overflow-hidden rounded-lg border @[34rem]/search:mt-3 @[34rem]/search:max-h-none @[34rem]/search:w-1/2 @[34rem]/search:shrink">
              <div className="min-h-0 flex-1 overflow-y-auto [--mf-padding:1rem_1.25rem]">
              {current.type === 'task' ? <TaskPreview key={current.id} id={current.id} /> : <NotePreview key={current.id} type={current.type} id={current.id} />}
              </div>
              {/* A thought on it right from the results: ⌘; or a click. */}
              {glossable && (
                <div className="shrink-0 border-t bg-accent/25 px-3 py-1.5">
                  <GlossLine key={current.id} id={current.id} open={glossing} onDone={backToBox} keys="⌘;" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * A note as the preview shows it: its start, read only, fetched for the one
 * highlighted rather than sent along with every result.
 */
function NotePreview({ type, id }: { type: string; id: string }): React.JSX.Element | null {
  const [body, setBody] = useState<unknown>(undefined)
  useEffect(() => {
    let old = false
    void window.api.captures.peek(type, id).then((found) => !old && setBody(found))
    return () => void (old = true)
  }, [type, id])
  if (body === undefined) return null
  return <MindflowEditor defaultContent={(body as JSONContent | string | null) ?? ''} readOnly toolbar={false} handles={false} slash={false} outline={false} search={false} autofocus={false} />
}

/**
 * A task as the preview shows it: its name, when it is planned and due, how
 * much it matters, its steps and its notes. A task's notes alone were often
 * empty, which left the preview an empty frame.
 */
function TaskPreview({ id }: { id: string }): React.JSX.Element | null {
  const [task, setTask] = useState<TaskFull | null>(null)
  useEffect(() => void vigil.task(id).then(setTask), [id])
  if (!task) return null
  const later = bucket(task)
  const facts = [
    task.dueAt ? `Scheduled ${when(task.dueAt, !!task.allDay)}` : later ? BUCKETS[later] : 'Not scheduled',
    task.deadline && `Due ${when(task.deadline, !task.deadlineTimed)}`,
    task.priority ? PRIORITY_NAMES[task.priority] : null,
    task.status !== 'open' && (task.status === 'done' ? 'Done' : 'Dropped')
  ].filter(Boolean)
  const notes = /"text":|"src":/.test(JSON.stringify(task.notes ?? null))
  return (
    <div className="flex flex-col gap-3 p-4 text-body">
      <div>
        <p className="text-base font-medium text-foreground">{task.title || 'Untitled task'}</p>
        <p className="mt-1 text-muted-foreground">{facts.join(' · ')}</p>
      </div>
      {task.subtasks.length > 0 && (
        <ul className="flex flex-col gap-1">
          {task.subtasks.map((one, index) => (
            <li key={index} className={`flex items-baseline gap-2 ${one.done ? 'text-muted-foreground line-through' : ''}`}>
              <span aria-hidden className="shrink-0">{one.done ? '☑' : '☐'}</span>
              <span className="min-w-0">{one.text}</span>
            </li>
          ))}
        </ul>
      )}
      {notes && (
        <div className="-mx-4 border-t pt-1">
          <MindflowEditor defaultContent={task.notes as JSONContent} readOnly toolbar={false} handles={false} slash={false} outline={false} search={false} autofocus={false} />
        </div>
      )}
    </div>
  )
}

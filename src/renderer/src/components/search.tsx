import { Fragment, useEffect, useRef, useState } from 'react'
import { chime } from '@/lib/sound'
import { PanelRight, Search as SearchIcon } from 'lucide-react'
import type { JSONContent } from '@tiptap/core'

import { CAPTURE_TYPES } from './capture-kinds/capture-kind-picker'
import { MindflowEditor } from './mindflow'
import { AskWho, Kbd } from './vigil/ui'
import { Chips } from './vigil/display'
import { Tip } from '@/components/vigil/ui'

type Capture = Awaited<ReturnType<typeof window.api.captures.find>>[number]

/** Something to do from the palette, with the key that does it anywhere. */
export type Action = { label: string; keys?: string; run: () => void }

/** Which of Notion's three groups a date falls in. */
const groupOf = (at: string): string => {
  const days = (Date.now() - new Date(at).getTime()) / 86400000
  return new Date(at).toDateString() === new Date().toDateString() ? 'Today' : days <= 30 ? 'Past 30 days' : 'Older'
}

/**
 * Search, the way Notion's works: type, and the matches come up grouped by when
 * they were captured, with the one under the cursor previewed on the right.
 * Arrows move, Enter opens, Escape closes.
 */
export function Search({ onOpen, onClose, initial = '', actions = [] }: { onOpen: (type: string, id: string) => void; onClose: () => void; initial?: string; actions?: Action[] }): React.JSX.Element {
  const [query, setQuery] = useState(initial)
  // Opening search sends out one ping.
  useEffect(() => chime('search'), [])
  const [found, setFound] = useState<Capture[]>([])
  // Notion's chips under the box: names only, one type of thing, one kind.
  const [titleOnly, setTitleOnly] = useState(false)
  const [types, setTypes] = useState<string[]>([])
  const [kinds, setKinds] = useState<string[]>([])
  const flip = (list: string[], id: string): string[] => (list.includes(id) ? list.filter((one) => one !== id) : [...list, id])
  const words = query.toLowerCase().split(/\s+/).filter((word) => word && !word.startsWith('kind:'))
  const results = found.filter((one) =>
    (!titleOnly || words.every((word) => one.label.toLowerCase().includes(word))) &&
    (!types.length || types.includes(one.type === 'article' ? 'nugget' : one.type)) &&
    (!kinds.length || kinds.includes(one.kind)))
  // Raycast's ⌘K: what you can do comes first, matched by the same words,
  // then what you have written. One list, one cursor.
  const doing = actions.filter((one) => words.every((word) => one.label.toLowerCase().includes(word))).slice(0, query.trim() ? 4 : 12)
  const [at, setAt] = useState(0)
  // Tab on a result asks who said it, without leaving search.
  const [asking, setAsking] = useState(false)
  const box = useRef<HTMLInputElement>(null)
  // Notion's highlight pane: on by default, and a button to put it away.
  const [pane, setPane] = useState(true)
  useEffect(() => {
    void window.api.captures.find(query).then((list) => {
      setFound(list)
      setAt(0)
    })
  }, [query])
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
  const run = (action: Action): void => {
    onClose()
    action.run()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[10vh]" onMouseDown={onClose}>
      <div className={`flex flex-col overflow-hidden rounded-xl border bg-background text-sm shadow-(--mf-panel-shadow) ${compact ? 'max-h-[70vh] w-[min(36rem,calc(100vw-2rem))]' : 'h-[70vh] w-[min(56rem,calc(100vw-2rem))]'}`} onMouseDown={(event) => event.stopPropagation()}>
        <label className="flex items-center gap-3 border-b px-4 py-3">
          <SearchIcon className="size-4 text-muted-foreground" />
          <input
            ref={box}
            autoFocus
            className="flex-1 bg-transparent text-heading outline-none"
            placeholder={actions.length ? 'Do something, or search everything…' : 'Search everything… kind:quote to narrow'}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { event.preventDefault(); onClose() }
              else if (event.key === 'Enter' && at < doing.length) run(doing[at])
              else if (event.key === 'Enter' && current) onOpen(current.type, current.id)
              else if (event.key === 'Tab' && current?.type === 'capture') setAsking(true)
              // The arrows, or Ctrl-J and Ctrl-K: the editor's vim, carried into the box.
              else if (event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'j')) setAt((n) => Math.min(n + 1, total - 1))
              else if (event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'k')) setAt((n) => Math.max(n - 1, 0))
              else return
              event.preventDefault()
            }}
          />
          <Tip label="Show highlight pane">
          <button type="button" className={`rounded p-1 hover:bg-accent ${pane ? 'text-foreground' : 'text-muted-foreground'} ${compact ? 'hidden' : ''}`} onClick={() => setPane(!pane)}>
            <PanelRight className="size-4" />
          </button>
          </Tip>
        </label>
        <div className={`flex flex-wrap items-center gap-3 border-b px-2 py-1.5 ${compact ? 'hidden' : ''}`}>
          <Chips options={[{ id: 'name', label: 'Name only' }]} on={() => titleOnly} pick={() => setTitleOnly(!titleOnly)} />
          <Chips options={[{ id: 'capture', label: 'Captures' }, { id: 'nugget', label: 'Nuggets' }, { id: 'task', label: 'Tasks' }]} on={(id) => types.includes(id)} pick={(id) => setTypes(flip(types, id))} />
          <Chips options={CAPTURE_TYPES} on={(id) => kinds.includes(id)} pick={(id) => setKinds(flip(kinds, id))} />
        </div>
        <div className="flex min-h-0 flex-1">
          <div className={`${preview ? 'w-1/2' : 'flex-1'} overflow-y-auto p-2`}>
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
                {one.keys && <span className="flex shrink-0 gap-0.5">{one.keys.split(' ').map((key) => <Kbd key={key}>{key}</Kbd>)}</span>}
              </button>
            ))}
            {!query.trim() && !doing.length && (
              <p className="px-2 py-3 text-body text-muted-foreground">Type to search captures, nuggets, articles and tasks. kind:quote narrows to one kind.</p>
            )}
            {query.trim() && !results.length && !doing.length && (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                {types.length || kinds.length || titleOnly
                  ? 'Nothing matches with those filters. Turn a chip off to widen it.'
                  : 'Nothing matches. Try fewer words: every word has to appear somewhere.'}
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
                    {capture.source && <span className="min-w-0 max-w-[40%] truncate text-xs text-muted-foreground">· {capture.source.replace(/\.md$/, '')}</span>}
                    {index + doing.length === at && !asking && capture.type === 'capture' && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{capture.attribution ?? 'Tab: who said it'}</span>}
                  </button>
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
            <div className="m-3 w-1/2 overflow-y-auto rounded-lg border [--mf-padding:1rem_1.25rem]">
              <MindflowEditor
                key={current.id}
                defaultContent={(current.body as JSONContent | string | null) ?? ''}
                readOnly
                toolbar={false}
                handles={false}
                slash={false}
                outline={false}
                search={false}
                autofocus={false}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

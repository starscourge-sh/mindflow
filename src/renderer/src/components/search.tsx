import { Fragment, useEffect, useRef, useState } from 'react'
import { PanelRight, Search as SearchIcon } from 'lucide-react'
import type { JSONContent } from '@tiptap/core'

import { CAPTURE_TYPES } from './capture-kinds/capture-kind-picker'
import { MindflowEditor } from './mindflow'
import { AskWho } from './vigil/ui'
import { Chips } from './vigil/display'
import { Tip } from '@/components/vigil/ui'

type Capture = Awaited<ReturnType<typeof window.api.captures.find>>[number]

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
export function Search({ onOpen, onClose, initial = '' }: { onOpen: (type: string, id: string) => void; onClose: () => void; initial?: string }): React.JSX.Element {
  const [query, setQuery] = useState(initial)
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
  const current = results[at]

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[10vh]" onMouseDown={onClose}>
      <div className="flex h-[70vh] w-[min(56rem,90vw)] flex-col overflow-hidden rounded-xl border bg-background text-sm shadow-(--mf-panel-shadow)" onMouseDown={(event) => event.stopPropagation()}>
        <label className="flex items-center gap-3 border-b px-4 py-3">
          <SearchIcon className="size-4 text-muted-foreground" />
          <input
            ref={box}
            autoFocus
            className="flex-1 bg-transparent text-heading outline-none"
            placeholder="Search everything… kind:quote to narrow"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { event.preventDefault(); onClose() }
              else if (event.key === 'Enter' && current) onOpen(current.type, current.id)
              else if (event.key === 'Tab' && current?.type === 'capture') setAsking(true)
              // The arrows, or Ctrl-J and Ctrl-K: the editor's vim, carried into the box.
              else if (event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'j')) setAt((n) => Math.min(n + 1, results.length - 1))
              else if (event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'k')) setAt((n) => Math.max(n - 1, 0))
              else return
              event.preventDefault()
            }}
          />
          <Tip label="Show highlight pane">
          <button type="button" className={`rounded p-1 hover:bg-accent ${pane ? 'text-foreground' : 'text-muted-foreground'}`} onClick={() => setPane(!pane)}>
            <PanelRight className="size-4" />
          </button>
          </Tip>
        </label>
        <div className="flex flex-wrap items-center gap-3 border-b px-2 py-1.5">
          <Chips options={[{ id: 'name', label: 'Name only' }]} on={() => titleOnly} pick={() => setTitleOnly(!titleOnly)} />
          <Chips options={[{ id: 'capture', label: 'Captures' }, { id: 'nugget', label: 'Nuggets' }, { id: 'task', label: 'Tasks' }]} on={(id) => types.includes(id)} pick={(id) => setTypes(flip(types, id))} />
          <Chips options={CAPTURE_TYPES} on={(id) => kinds.includes(id)} pick={(id) => setKinds(flip(kinds, id))} />
        </div>
        <div className="flex min-h-0 flex-1">
          <div className={`${pane ? 'w-1/2' : 'flex-1'} overflow-y-auto p-2`}>
            {!query.trim() && (
              <p className="px-2 py-3 text-body text-muted-foreground">Type to search captures, nuggets, articles and tasks. kind:quote narrows to one kind.</p>
            )}
            {query.trim() && !results.length && (
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
                    className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left ${index === at ? 'bg-accent' : ''}`}
                    data-search-at={index === at || undefined}
                    onMouseEnter={() => setAt(index)}
                    data-row
                    onClick={() => onOpen(capture.type, capture.id)}
                  >
                    <kind.icon className="size-4 shrink-0" style={{ color: kind.tint }} />
                    <span className="min-w-0 truncate">{capture.label || 'Untitled'}</span>
                    {capture.type !== 'capture' && <span className="shrink-0 rounded bg-accent px-1.5 text-xs text-muted-foreground capitalize">{capture.type}</span>}
                    {capture.source && <span className="min-w-0 max-w-[40%] truncate text-xs text-muted-foreground">· {capture.source.replace(/\.md$/, '')}</span>}
                    {index === at && !asking && capture.type === 'capture' && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{capture.attribution ?? 'Tab: who said it'}</span>}
                  </button>
                  {index === at && asking && (
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

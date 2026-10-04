import { Fragment, useEffect, useState } from 'react'
import { PanelRight, Search as SearchIcon } from 'lucide-react'
import type { JSONContent } from '@tiptap/core'

import { CAPTURE_TYPES } from './capture-kinds/capture-kind-picker'
import { MindflowEditor } from './mindflow'

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
export function Search({ onOpen, onClose }: { onOpen: (id: string) => void; onClose: () => void }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Capture[]>([])
  const [at, setAt] = useState(0)
  // Notion's highlight pane: on by default, and a button to put it away.
  const [pane, setPane] = useState(true)
  useEffect(() => {
    void window.api.captures.find(query).then((found) => {
      setResults(found)
      setAt(0)
    })
  }, [query])
  const current = results[at]

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[10vh]" onMouseDown={onClose}>
      <div className="flex h-[70vh] w-[min(56rem,90vw)] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <label className="flex items-center gap-3 border-b px-4 py-3">
          <SearchIcon className="size-4 text-muted-foreground" />
          <input
            autoFocus
            className="flex-1 bg-transparent outline-none"
            placeholder="Search captures…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose()
              else if (event.key === 'Enter' && current) onOpen(current.id)
              // The arrows, or Ctrl-J and Ctrl-K: the editor's vim, carried into the box.
              else if (event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'j')) setAt((n) => Math.min(n + 1, results.length - 1))
              else if (event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'k')) setAt((n) => Math.max(n - 1, 0))
              else return
              event.preventDefault()
            }}
          />
          <button type="button" title="Show highlight pane" className={`rounded p-1 hover:bg-accent ${pane ? 'text-foreground' : 'text-muted-foreground'}`} onClick={() => setPane(!pane)}>
            <PanelRight className="size-4" />
          </button>
        </label>
        <div className="flex min-h-0 flex-1">
          <div className={`${pane ? 'w-1/2' : 'flex-1'} overflow-y-auto p-2`}>
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
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${index === at ? 'bg-accent' : ''}`}
                    onMouseEnter={() => setAt(index)}
                    onClick={() => onOpen(capture.id)}
                  >
                    <kind.icon className="size-4 shrink-0" style={{ color: kind.tint }} />
                    <span className="truncate">{capture.title || 'Untitled'}</span>
                    {capture.source && <span className="shrink-0 truncate text-xs text-muted-foreground">— {capture.source.replace(/\.md$/, '')}</span>}
                  </button>
                </Fragment>
              )
            })}
          </div>
          {/* The capture as it reads, not its raw text: the same editor, read only,
              and a fresh one for each result. */}
          {pane && current && (
            <div className="m-3 w-1/2 overflow-y-auto rounded-lg border">
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

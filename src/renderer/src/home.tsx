import { useEffect, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { Calendar, FileText, Hash, Inbox, Layers, Search as SearchIcon, SquarePen } from 'lucide-react'

import { MindflowEditor, TAGS } from './components/mindflow'
import { CAPTURE_TYPES, CaptureKindPicker, type CaptureType } from './components/capture-kinds/capture-kind-picker'
import { CaptureList, useCaptures, type CaptureMeta } from './components/capture-list'
import { EXITS, STATUS_ICON, captureKey, findCaptures, takeExit } from './lib/capture-links'
import { titleOf } from './lib/document'
import { toMarkdown } from './lib/export'
import { Search } from './components/search'

type Capture = NonNullable<Awaited<ReturnType<typeof window.api.captures.get>>>

/** The views down the side: what is still open, everything, and each kind. */
const VIEWS = [
  { id: 'inbox', label: 'Inbox', icon: Inbox, tint: undefined, keep: (c: CaptureMeta) => c.status === 'open' },
  { id: 'all', label: 'All', icon: Layers, tint: undefined, keep: () => true },
  ...CAPTURE_TYPES.map((type) => ({ ...type, keep: (c: CaptureMeta) => c.kind === type.id }))
]

/**
 * The main window, in three panes the way Linear lays out its inbox: the views,
 * the captures in the one picked, and the open capture with its properties.
 */
export function Home(): React.JSX.Element {
  const captures = useCaptures()
  const [view, setView] = useState(VIEWS[0])
  const [open, setOpen] = useState<Capture | null>(null)
  const pick = (id: string): void => void window.api.captures.get(id).then(setOpen)
  // Cmd+K searches, the chord every one of these apps uses for it.
  const [searching, setSearching] = useState(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'k' || !event.metaKey) return
      event.preventDefault()
      setSearching(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const shown = captures.filter(view.keep)
  // The open capture as the list last saw it, so its status follows an exit.
  const meta = captures.find((c) => c.id === open?.id)
  const save = (patch: Parameters<typeof window.api.captures.save>[1]): void => {
    if (open) void window.api.captures.save(open.id, patch)
  }

  return (
    <div className="flex h-screen bg-background text-sm text-foreground">
      {searching && (
        <Search
          onClose={() => setSearching(false)}
          onOpen={(id) => {
            setSearching(false)
            pick(id)
          }}
        />
      )}
      <aside className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r p-2 pt-10">
        <div className="mb-3 flex items-center justify-between px-2">
          <span className="flex-1 font-medium">Vigil</span>
          <button type="button" className="rounded-md p-1.5 hover:bg-accent" title="Search ⌘K" onClick={() => setSearching(true)}>
            <SearchIcon className="size-4" />
          </button>
          <button type="button" className="rounded-md p-1.5 hover:bg-accent" title="New capture ⌘." onClick={() => window.api.showPrompt()}>
            <SquarePen className="size-4" />
          </button>
        </div>
        {VIEWS.map((item, index) => (
          <div key={item.id}>
            {index === 2 && <div className="mt-4 mb-1 px-2 text-xs text-muted-foreground">Kinds</div>}
            <button
              type="button"
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent ${item.id === view.id ? 'bg-accent' : ''}`}
              onClick={() => setView(item)}
            >
              <item.icon className="size-4" style={{ color: item.tint }} />
              <span className="flex-1 text-left">{item.label}</span>
              <span className="text-xs text-muted-foreground">{captures.filter(item.keep).length || ''}</span>
            </button>
          </div>
        ))}
      </aside>

      <section className="flex w-80 shrink-0 flex-col border-r">
        <header className="px-4 pt-10 pb-2 font-medium">
          {view.label} <span className="font-normal text-muted-foreground">{shown.length}</span>
        </header>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          <CaptureList captures={shown} selected={open?.id} onPick={pick} />
        </div>
      </section>

      {open && meta ? (
        <main className="flex min-w-0 flex-1">
          <div className="min-w-0 flex-1 overflow-y-auto pt-8">
            {/* The first line names the capture, the same as in the prompt. */}
            <MindflowEditor
              host={window.api}
              tokens={TAGS}
              toolbar={{ fixed: false }}
              documentId={`capture-${open.id}`}
              defaultContent={(open.body as JSONContent | string | null) ?? ''}
              findNotes={findCaptures}
              onOpenNote={pick}
              onChange={(body, editor) => save({ body, title: titleOf(body), markdown: toMarkdown(editor) })}
            />
          </div>
          <Properties capture={meta} onKind={(kind) => save({ kind })} />
        </main>
      ) : (
        <main className="flex flex-1 items-center justify-center text-muted-foreground">
          Pick a capture, or press ⌘. to write one.
        </main>
      )}
    </div>
  )
}

/** What Linear puts down the right of an issue, cut to what a capture has. */
function Properties({ capture, onKind }: { capture: CaptureMeta; onKind: (kind: CaptureType) => void }): React.JSX.Element {
  const Status = STATUS_ICON[capture.status as keyof typeof STATUS_ICON] ?? STATUS_ICON.open
  const row = 'flex items-center gap-2 px-2 py-1'

  return (
    <aside className="flex w-56 shrink-0 flex-col gap-1 border-l p-3 pt-10 text-muted-foreground">
      <div className="mb-1 px-2 text-xs">Properties</div>
      <div className={`${row} text-foreground`}>
        <Status className="size-4" />
        <span className="capitalize">{capture.status}</span>
      </div>
      {capture.status === 'open' && (
        <div className="flex gap-1 px-1 text-xs">
          {EXITS.map((one) => (
            <button key={one.key} type="button" className="rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground" onClick={() => void takeExit(capture.id, one.status)}>
              {one.label}
            </button>
          ))}
        </div>
      )}
      <div className="px-1">
        <CaptureKindPicker value={capture.kind as CaptureType} onChange={onKind} />
      </div>
      <div className={row}><Hash className="size-4" />{captureKey(capture.number)}</div>
      {capture.source && <div className={row}><FileText className="size-4 shrink-0" /><span className="truncate">{capture.source.replace(/\.md$/, '')}</span></div>}
      <div className={row}><Calendar className="size-4" />{new Date(capture.capturedAt).toLocaleDateString()}</div>
    </aside>
  )
}

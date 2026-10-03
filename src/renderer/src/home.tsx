import { useEffect, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { Plus } from 'lucide-react'

import { MindflowEditor, TAGS } from './components/mindflow'
import { titleOf } from './lib/document'
import { captureKey, findCaptures } from './lib/capture-links'
import { toMarkdown } from './lib/export'

type Capture = NonNullable<Awaited<ReturnType<typeof window.api.captures.get>>>
type CaptureMeta = Awaited<ReturnType<typeof window.api.captures.list>>[number]

/**
 * The main window: every capture down the side, the open one beside it.
 *
 * "New" brings up the capture prompt rather than adding a row here, so there
 * is one way in for a thought wherever you are. The list reloads whenever any
 * window writes, which is how a capture sent from the prompt turns up here.
 */
export function Home(): React.JSX.Element {
  const [captures, setCaptures] = useState<CaptureMeta[]>([])
  const [open, setOpen] = useState<Capture | null>(null)

  useEffect(() => {
    const reload = (): void => void window.api.captures.list().then(setCaptures)
    reload()
    return window.api.captures.onChange(reload)
  }, [])

  return (
    <div className="flex h-screen">
      <aside className="flex w-64 flex-col gap-1 overflow-y-auto border-r p-3 text-sm">
        <button
          type="button"
          className="mb-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
          onClick={() => window.api.showPrompt()}
        >
          <Plus className="size-4" /> New
        </button>
        {captures.map((capture) => (
          <button
            key={capture.id}
            type="button"
            className={`truncate rounded-md px-2 py-1.5 text-left hover:bg-accent ${capture.id === open?.id ? 'bg-accent' : ''}`}
            onClick={() => void window.api.captures.get(capture.id).then(setOpen)}
          >
            <span className="mr-2 text-muted-foreground">{captureKey(capture.number)}</span>
            {capture.title || 'Untitled'}
          </button>
        ))}
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {/* The first line names the capture, the same as in the prompt. */}
        <MindflowEditor
          host={window.api}
          tokens={TAGS}
          documentId={open ? `capture-${open.id}` : null}
          defaultContent={(open?.body as JSONContent | null) ?? ''}
          findNotes={findCaptures}
          onOpenNote={(id) => void window.api.captures.get(id).then(setOpen)}
          onChange={(body, editor) =>
            open &&
            window.api.captures.save(open.id, { body, title: titleOf(body), markdown: toMarkdown(editor) })
          }
        />
      </main>
    </div>
  )
}

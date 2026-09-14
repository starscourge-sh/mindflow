import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { JSONContent } from '@tiptap/core'
import { Plus } from 'lucide-react'

import { MindflowEditor } from './components/mindflow/mindflow-editor'
import { TitleEditor } from './components/title/title-editor'
import { NotesMenu } from './components/notes/notes-menu'
import { ResizablePanelGroup } from '@/components/ui/resizable'

/** Long enough that a run of typing is one write, short enough to feel saved. */
const TITLE_DEBOUNCE_MS = 400

type Note = Awaited<ReturnType<typeof window.api.notes.open>>
type Patch = Parameters<typeof window.api.notes.save>[1]

export default function App(): React.JSX.Element {
  const [note, setNote] = useState<Note | null>(null)
  // Held apart from `note` so the window heading follows the caret rather than
  // the last thing written to disk.
  const [title, setTitle] = useState('')

  // The title editor reports every keystroke, so its writes are held back. The
  // note id is held with them: without it a save queued just before switching
  // notes would land on the one being switched to.
  const held = useRef<{ id: string; patch: Patch } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const flush = useCallback((): void => {
    clearTimeout(timer.current)
    const pending = held.current
    held.current = null
    if (pending) void window.api.notes.save(pending.id, pending.patch)
  }, [])

  const saveTitle = useCallback(
    (id: string, patch: Patch): void => {
      // A change still held for another note goes out now rather than being
      // folded into this one.
      if (held.current && held.current.id !== id) flush()
      held.current = { id, patch: { ...held.current?.patch, ...patch } }
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, TITLE_DEBOUNCE_MS)
    },
    [flush]
  )

  const show = useCallback(
    async (next: Promise<Note>): Promise<void> => {
      // The note being left keeps its last edit, and keeps it under its own id.
      flush()
      const opened = await next
      setNote(opened)
      setTitle(opened.title)
    },
    [flush]
  )

  useEffect(() => {
    void show(window.api.notes.open())
  }, [show])

  // Nothing in the editor claims this, so it works wherever the caret is.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'n' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        void show(window.api.notes.create())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show])

  // Closing the window never unmounts React, so both hooks are needed for the
  // last few hundred milliseconds of typing to survive.
  useEffect(() => {
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  return (
    <div className="relative flex h-full w-full flex-col">
      <div
        className="fixed top-0 right-0 left-0 z-10 flex items-center gap-2 px-4 py-2 text-xs backdrop-blur-3xl"
        style={{ WebkitAppRegion: 'drag' } as CSSProperties}
      >
        <span className="flex-1" />
        <span className="flex-1 truncate text-center text-muted-foreground">
          {title || 'Untitled'}
        </span>

        <div
          className="flex flex-1 justify-end"
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        >
          <div className="flex items-center gap-0.5 rounded-full bg-accent/70 p-0.5">
            <NotesMenu
              currentId={note?.id ?? null}
              onPick={(id) => void show(window.api.notes.open(id))}
            />
            <button
              type="button"
              aria-label="New note"
              title="New note (⌘N)"
              className="rounded-full p-1.5 hover:bg-background"
              onClick={() => void show(window.api.notes.create())}
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Nothing is editable until a note has arrived: an editor shown first and
          filled in afterwards would throw away anything typed into it. */}
      {note ? (
        <>
          {/* The title stacks above the body and shares its column: the editor
              centres at 648px inside 4.75rem of padding, so these line up. */}
          <div className="mx-auto w-full max-w-[648px] shrink-0 px-[4.75rem] pt-12 pb-4">
            <TitleEditor
              key={note.id}
              defaultContent={note.titleHtml}
              placeholder="Untitled"
              onChange={({ text, html }) => {
                setTitle(text)
                saveTitle(note.id, { title: text, titleHtml: html })
              }}
            />
          </div>

          <ResizablePanelGroup
            orientation="horizontal"
            className="h-full min-h-0 w-full"
          >
            {/* Keyed by note: the editor reads its document once, at mount, so a
                different note means a different editor. Its own debounce is why
                this one writes straight through. */}
            <MindflowEditor
              key={note.id}
              defaultContent={(note.doc as JSONContent | null) ?? ''}
              onChange={(doc) => void window.api.notes.save(note.id, { doc })}
            />
          </ResizablePanelGroup>
        </>
      ) : null}
    </div>
  )
}

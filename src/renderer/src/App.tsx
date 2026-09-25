import { useState, type CSSProperties } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import type { JSONContent } from '@tiptap/core'

import { MindflowEditor } from './components/mindflow/mindflow-editor'
import { TitleEditor } from './components/mindflow/presets'
import { useNotes } from './lib/use-notes'

export default function App(): React.JSX.Element {
  return (
    <div className="app-container flex flex-col items-center justify-center relative flex h-full w-full flex-col pt-3 bg-background/50">
      <Header />
      <CapturePrompt />
    </div>
  )
}

const Header = (): React.JSX.Element => {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="fixed top-0 right-0 left-0 z-10 flex items-center gap-2 px-4 pt-8 text-xs"
      style={{ WebkitAppRegion: 'drag', } as CSSProperties}>
      <span className="flex-1" />
      <span className="flex-1" />

      {/* The strip is the window's drag handle, so the one thing on it that is
          not a handle has to say so, or the click never lands. */}
      <button
        type="button"
        aria-label={expanded ? 'Contract window' : 'Expand window'}
        className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        onClick={() => {
          setExpanded(!expanded)
          void window.api.setExpanded(!expanded)
        }}
      >
        {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      </button>
    </div>
  )
}

const CapturePrompt = (): React.JSX.Element => {
  const { note, notes, save, open } = useNotes()

  // `@` offers the notes we already have listed, so typing does not hit disk.
  const findNotes = (query: string): Array<{ id: string; label: string }> => {
    const term = query.trim().toLowerCase()
    return notes
      .filter((other) => other.id !== note?.id)
      .filter((other) => (other.title || 'Untitled').toLowerCase().includes(term))
      .slice(0, 8)
      .map((other) => ({ id: other.id, label: other.title || 'Untitled' }))
  }

  return (
    <div className="relative overflow-hidden flex w-full flex-1 min-h-0 flex-col rounded-2xl bg-backgorund transition transition-all transition-duration-3 pt-5"
      style={{ transform: 'translate(0,0)' }}
    >
      {/* Nothing is editable until a note has arrived: an editor shown first and
          filled in afterwards would throw away anything typed into it. Both are
          keyed by note, because both read their content once, at mount. */}
      {note ? (
        <>
          <TitleEditor
            key={`title-${note.id}`}
            className="border-b"
            defaultContent={note.titleHtml}
            placeholder="Issue title"
            onChange={(_doc, editor) =>
              save({ title: editor.getText(), titleHtml: editor.getHTML() })
            }
          />

          <MindflowEditor
            key={`doc-${note.id}`}
            defaultContent={(note.doc as JSONContent | null) ?? ''}
            findNotes={findNotes}
            onOpenNote={open}
            onChange={(doc) => save({ doc })}
          />
        </>
      ) : null}
    </div>
  )
}

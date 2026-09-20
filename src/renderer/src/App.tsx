import type { CSSProperties } from 'react'
import type { JSONContent } from '@tiptap/core'

import { MindflowEditor } from './components/mindflow/mindflow-editor'
import { TitleEditor } from './components/title/title-editor'
import { useNotes } from './lib/use-notes'

export default function App(): React.JSX.Element {
  return (
    <div className="app-container flex flex-col items-center justify-center relative flex h-full w-full flex-col pt-3 bg-background">
      <Header />
      <CapturePrompt />
    </div>
  )
}

const Header = (): React.JSX.Element => {
  return (
    <div className="fixed top-0 right-0 left-0 z-10 flex items-center gap-2 px-4 pt-8 text-xs"
      style={{ WebkitAppRegion: 'drag', } as CSSProperties}>
      <span className="flex-1" />
      {/*
      <span className="truncate text-center text-muted-foreground bg-accent/95 py-2 px-4 rounded-full border shadow-lg">
        Mindflow
      </span>
        */}
      <span className="flex-1" />
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
    <div className="relative overflow-hidden flex flex-col h-[400px] w-[625px] rounded-2xl"
      style={{ transform: 'translate(0,0)' }}
    >
      {/* Nothing is editable until a note has arrived: an editor shown first and
          filled in afterwards would throw away anything typed into it. Both are
          keyed by note, because both read their content once, at mount. */}
      {note ? (
        <>
          <TitleEditor
            key={`title-${note.id}`}
            variant="task"
            defaultContent={note.titleHtml}
            placeholder="Issue title"
            onChange={({ text, html }) => save({ title: text, titleHtml: html })}
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

import React, { useEffect, useState, type CSSProperties } from 'react'
import { Maximize2, Minimize2, Crosshair } from 'lucide-react'
import type { JSONContent } from '@tiptap/core'
import { v4 as uuidv4 } from 'uuid';

import { EmojiButton, MindflowEditor, TitleEditor } from './components/mindflow'
import { StatusPicker, type Status } from './components/status/status-picker'
import { CaptureKindPicker, type CaptureType } from './components/capture-kinds/capture-kind-picker';
import { PriorityPicker, type Priority } from './components/priority/priority-picker'

export default function App(): React.JSX.Element {
  return (
    <div className="app-container bg-background/20 flex flex-col items-center justify-center relative flex h-full w-full flex-col pt-3 color-white">
      <Header />
      <CapturePrompt />
    </div>
  )
}

const Header = (): React.JSX.Element => {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="fixed top-0 right-0 left-0 z-10 flex items-center gap-2 text-xs"
      style={{ WebkitAppRegion: 'drag', padding: '0.3rem 4.75rem' } as CSSProperties}>
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
        <Crosshair className="size-4" />
      </button>
    </div>
  )
}

type CaptureKind =
  | 'note'      // ✍️ - default — anything that isn't one of the others
  | 'quote'     // 💬 - someone else's words
  | 'word'      // 🗨️ - a term you looked up
  | 'link'      // 🔗 - a URL — parser sets this from paste detection
  | 'excerpt'   // 📑 - a long pasted block; the container, not the extract
  | 'decision'  // ⚖️ - a choice made, with its why
  | 'bit'       // 🃏 - a joke or one-liner
  | 'todo'      // 🎯 - an obligation

type CaptureStatus = 'open' | 'promoted' | 'resolved' | 'discarded'
type Capture = {
  id: string,
  body: string
  title: string | null
  capturedAt: string
  status: CaptureStatus
  kind: CaptureKind
  closedAt: string | null
  isDraft: boolean
}

const CapturePrompt = (): React.JSX.Element => {
  // const { note, notes, save, open } = useNotes()
  const [capture, setCapture] = useState<Capture>(null)
  // console.log("[CapturePrompt][note] note: ", note)
  // console.log("[CapturePrompt][notes] notes: ", notes)

  const [icon, setIcon] = useState('📃')
  const [status, setStatus] = useState<Status>('todo')
  const [priority, setPriority] = useState<Priority>('none')
  const [kind, setKind] = useState<CaptureType>('note')
  const [title, setTitle] = useState<string>('')
  const [body, setBody] = useState<string>('')

  console.log('[CapturePrompt][title][🐦‍🔥]: ', title)
  console.log('[CapturePrompt][body][🐦‍🔥🐦‍🔥]: ', body)
  console.log('[CapturePrompt][capture][🫪]: ', capture)

  useEffect(() => {
    const c: Capture = {
      id: uuidv4(),
      title: title,
      body: body,
      capturedAt: (new Date()).toISOString(),
      status: 'open',
      kind: 'note',
      closedAt: null,
      isDraft: true
    }
    // setCature(c)
    setCapture(c)
  }, [title, body])


  return (
    <div className="relative overflow-hidden flex w-full flex-1 min-h-0 flex-col rounded-2xl transition transition-all transition-duration-3 pt-5"
      style={{ transform: 'translate(0,0)' }}>

      {/* The icon sits beside the title rather than above it: a title is one
          line, and this is part of that line. `save({ icon })` persists it -
          the note carries it, the document does not. */}
      <div className="flex items-center relative">
        {/* <EmojiButton icon={icon} className="mf-note-icon absolute z-10 left-[1.3em] w-[30px] h-[30px] cursor-pointer" onPick={(change) => change.icon && setIcon(change.icon)} /> */}
        <div className='flex flex-1 mx-[4.75em]'>
          <TitleEditor
            host={window.api}
            // The presets leave vim off, because a form field that swallows `i`
            // would surprise most callers. A title in this app is not that.
            vim
            // documentId={note ? `title-${note.id}` : null}
            className="flex-1"
            // defaultContent={note?.titleHtml}
            placeholder="Issue title"
            onChange={(_doc, editor) => {
              // save({ title: editor.getText(), titleHtml: editor.getHTML() })
              setTitle(editor.getHTML())
            }}
          />
          <div className='w-fit flex items-center'></div>
        </div>
      </div>

      <div className="flex flex-1 mx-[4.75em] gap-2 pb-2 bg-background/5 rounded-xl">
        <CaptureKindPicker value={kind} onChange={setKind} />
        {/*
          <StatusPicker value={status} onChange={setStatus} />
          <PriorityPicker value={priority} onChange={setPriority} />
          */}
      </div>

      <MindflowEditor
        host={window.api}
        placeholder="' / '  for commands..."
        onChange={(doc) => {
          // save({ doc })
          setBody(doc)
        }}
      // findNotes={findNotes}
      />
    </div>
  )
}


{/*
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

      //* `documentId` carries both rules: nothing renders until the note has
      //  arrived, and a different note is a different editor.
      <TitleEditor
        host={window.api}
        // The presets leave vim off, because a form field that swallows `i`
        // would surprise most callers. A title in this app is not that.
        vim
        documentId={note ? `title-${note.id}` : null}
        className="border-b"
        defaultContent={note?.titleHtml}
        placeholder="Issue title"
        onChange={(_doc, editor) =>
          save({ title: editor.getText(), titleHtml: editor.getHTML() })
        }
      />

      <MindflowEditor
        host={window.api}
        documentId={note ? `doc-${note.id}` : null}
        defaultContent={(note?.doc as JSONContent | null) ?? ''}
        findNotes={findNotes}
        onOpenNote={open}
        onChange={(doc) => save({ doc })}
      />
    </div>
  )
}

*/}

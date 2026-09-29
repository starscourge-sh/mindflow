import React, { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Maximize2, Minimize2, AudioLines } from 'lucide-react'
import type { JSONContent } from '@tiptap/core'
import { v4 as uuidv4 } from 'uuid';

import { MindflowEditor, TitleEditor, TAGS } from './components/mindflow'
// import { EmojiButton } from './components/mindflow'
// import { StatusPicker, type Status } from './components/status/status-picker'
// import { PriorityPicker, type Priority } from './components/priority/priority-picker'
import { CaptureKindPicker, type CaptureType } from './components/capture-kinds/capture-kind-picker';
import { Button } from './components/ui/button';

export default function App(): React.JSX.Element {
  return (
    <div className="app-container bg-background/20 flex flex-col items-center justify-center relative flex h-full w-full flex-col pt-3 color-white">
      <Header />
      <CapturePrompt />

      <div
        className="z-10 w-full bottom-0 left-0 right-0 py-[0.3rem] px-[4.75rem] flex justify-end">
        <Button size="sm" className="">
          Create
        </Button>
      </div>
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

      {/*
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
        */}

    </div>
  )
}

type CaptureStatus = 'open' | 'promoted' | 'resolved' | 'discarded'
type Capture = {
  id: string,
  body?: JSONContent | null | undefined
  title: string | null
  capturedAt: string
  status: CaptureStatus
  kind: CaptureType
  closedAt: string | null
  isDraft: boolean
}

const CapturePrompt = (): React.JSX.Element => {
  // const {note, notes, save, open} = useNotes()
  // const [icon, setIcon] = useState('📃')
  // const [status, setStatus] = useState<Status>('todo')
  // const [capture, setCapture] = useState<Capture>(localStorage.getItem("capture-draft") && JSON.parse(localStorage.getItem("capture-draft")) as Capture)
  // const [priority, setPriority] = useState<Priority>('none')
  const [kind, setKind] = useState<CaptureType>('note')
  const [title, setTitle] = useState<string>('')
  const [body, setBody] = useState<JSONContent | null>(null)
  const id = useRef(uuidv4())

  const [capture, setCapture] = useState<Capture | null>({
    id: id.current,
    title: "",
    capturedAt: (new Date()).toISOString(),
    status: 'open',
    kind: 'note',
    closedAt: null,
    isDraft: true
  })

  console.log('[CapturePrompt][id.current][🐦‍🔥]: ', id.current)
  console.log('[CapturePrompt][title][🐦‍🔥]: ', title)
  console.log('[CapturePrompt][body][🐦‍🔥]: ', body)
  console.log('[CapturePrompt][kind][🐦‍🔥]: ', kind)
  console.log('[CapturePrompt][capture][🫪]: ', capture)

  useEffect(() => {
    const raw = localStorage.getItem("capture-draft")
    const draft: Capture | null = raw ? JSON.parse(raw) : null
    if (draft && draft.title) {
      setCapture(draft)
    }
  }, [])

  // useEffect(() => {
  //   const c: Capture = {
  //     id: id.current,
  //     title: title,
  //     body: body,
  //     capturedAt: (new Date()).toISOString(),
  //     // status: status,
  //     kind: kind,
  //     closedAt: null,
  //     isDraft: true
  //   }
  //   localStorage.setItem("capture-draft", JSON.stringify(c))
  //   // setCature(c)
  //   setCapture(c)
  // }, [title, body, kind])
  //

  return (
    <div className="relative overflow-hidden flex w-full flex-1 min-h-0 flex-col rounded-2xl transition transition-all transition-duration-3 pt-5"
      style={{ transform: 'translate(0,0)' }}>

      {/* The icon sits beside the title rather than above it: a title is one
          line, and this is part of that line. `save({ icon })` persists it -
          the note carries it, the document does not. */}
      <div className="flex items-center relative">
        {/*
        <EmojiButton
          icon={icon}
          className="mf-note-icon absolute z-10 left-[1.3em] w-[30px] h-[30px] cursor-pointer"
          onPick={(change) => change.icon && setIcon(change.icon)}
        />
        */}

        <div className='flex flex-1 mx-[4.75em]'>
          {/* Every option written out, whether or not it differs from the
              default, so what this editor is can be read without opening the
              component. A line that matches the default changes nothing. */}
          <TitleEditor
            // --- what it holds ---
            // `shape` and `marks` come from the preset: one paragraph, and the
            // four marks a title has room for. Setting them here would undo it.
            placeholder="Issue title"
            // defaultContent={note?.titleHtml}
            defaultContent={capture?.title || ""}
            tokens={TAGS}
            // documentId={note ? `title-${note.id}` : null}

            // --- what is switched on ---
            // The preset switches the handles, the `/` menu, the outline, the
            // find bar and the toolbars off already: none of them belong in a
            // one line field.
            //
            // It leaves vim off too, because a form field that swallows `i`
            // would surprise most callers. A title in this app is not that.
            vim={true}
            showSource={false}
            readOnly={false}

            // --- the app around it ---
            host={window.api}
            className="flex-1"

            // --- what it tells you ---
            onChange={(_doc, editor) => {
              // save({ title: editor.getText(), titleHtml: editor.getHTML() })
              setTitle(editor.getHTML())
            }}
            onSubmit={undefined}
          />
          <div className='w-fit flex items-center color-white'>
            <Button className="bg-transparent cursor-pointer text-red-400 hover:bg-background cursor-pointer"> <AudioLines /> </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 mx-[4.75em] gap-2 py-2 rounded-xl">
        <CaptureKindPicker value={capture?.kind || "note"} onChange={setKind} />
        {/*
          <StatusPicker value={status} onChange={setStatus} />
          <PriorityPicker value={priority} onChange={setPriority} />
          */}
      </div>

      {/* The same, spelled out. See `docs/components.md` for what each one
          does and what it is when you leave it out. */}
      <MindflowEditor
        // --- what it holds ---
        shape="document"
        placeholder="' / '  for commands..."
        defaultContent={capture.body}
        tokens={TAGS}
        // documentId={note ? `doc-${note.id}` : null}

        // --- what is switched on ---
        // No fixed toolbar: the dock would sit over the capture prompt. The
        // selection toolbar keeps its default contents.
        toolbar={{ fixed: false }}
        handles={true}
        slash={true}
        outline={true}
        search={true}
        showSource={false}
        readOnly={false}

        // --- the app around it ---
        host={window.api}

        // --- what it tells you ---
        onChange={(doc) => {
          // save({ doc })
          setBody(doc)
        }}
        // findNotes={findNotes}
        // onOpenNote={open}
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

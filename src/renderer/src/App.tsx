import React, { useEffect, useState, type CSSProperties } from 'react'
import {
  AudioLines,
  FileJson2,
  Keyboard,
  KeyboardOff,
  Lock,
  LockOpen,
  Maximize2,
  Minimize2,
  X
} from 'lucide-react'
// import { Maximize2, Minimize2 } from 'lucide-react'
import type { JSONContent } from '@tiptap/core'
import { v4 as uuidv4 } from 'uuid';

import { MindflowEditor, TAGS, currentVim, onVimChange, setVim } from './components/mindflow'
import { ThemePicker } from './components/theme/theme-picker'
// import { TitleEditor } from './components/mindflow'
// import { EmojiButton } from './components/mindflow'
// import { StatusPicker, type Status } from './components/status/status-picker'
// import { PriorityPicker, type Priority } from './components/priority/priority-picker'
import { CaptureKindPicker, type CaptureType } from './components/capture-kinds/capture-kind-picker';
import { Button } from './components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from './components/ui/sheet';

/**
 * The controls on the bar at the foot of the window.
 *
 * A colour of their own: inheriting left them near enough invisible against
 * the bar, and an icon you have to look for is not a control.
 */
const CONTROL =
  'bg-transparent cursor-pointer text-foreground/75 hover:text-foreground ' +
  'hover:bg-accent [&_svg]:size-[1.1rem]'

export default function App(): React.JSX.Element {
  // Read once, as the first state there is, rather than set from an effect:
  // an effect runs after the first paint, so the window came up empty and then
  // swapped to the draft a frame later. A function, so the parse happens on
  // mount and not on every render.
  // No setter: nothing writes the draft back yet - the save is still
  // commented out below - so this is read once and read only.
  const [capture] = useState<Capture>(() => {
    const raw = localStorage.getItem("capture-draft")
    const draft = raw ? (JSON.parse(raw) as Capture | null) : null
    // A draft with no title is a box nobody typed in, which is not worth
    // restoring over a fresh one.
    if (draft?.title) return draft

    return {
      // `useState`, not `useRef(uuidv4())`: a ref's argument is evaluated on
      // every render, so that minted an id each time and threw it away.
      id: uuidv4(),
      title: "",
      capturedAt: new Date().toISOString(),
      status: 'open',
      kind: 'note',
      closedAt: null,
      isDraft: true
    }
  })
  const [kind, setKind] = useState<CaptureType>('note')


  // The editor takes both of these as props, so the buttons for them can live
  // in the app's own chrome without reaching inside it.
  // Vim is the page's, not this component's, so the switch reads it back from
  // the editor package rather than owning it - another editor on the page, or
  // the `\` toggle inside one, has to move this button too.
  const [vim, setVimOn] = useState(currentVim)
  useEffect(() => onVimChange(setVimOn), [])
  const [locked, setLocked] = useState(false)
  const [source, setSource] = useState(false)
  // The document, as the editor last handed it over. The drawer reads this
  // rather than the editor's own panel, so the source can sit beside the note
  // instead of on top of it.
  const [body, setBody] = useState<JSONContent | null>(null)

  console.log('[CapturePrompt][kind][🐦‍🔥]: ', kind)
  console.log('[CapturePrompt][capture][🫪]: ', capture)


  return (
    <div className="app-container flex flex-col items-center justify-center relative flex h-full w-full flex-col pt-3 color-white">
      <Header />
      <CapturePrompt locked={locked} onChange={setBody} />
      <SourceDrawer open={source} doc={body} onOpenChange={setSource} />
      <div className="w-full flex justify-between py-[0.5rem] px-[4.75rem] bg-linear-to-t from-[var(--accent)]/40">
        <CaptureKindPicker value={capture?.kind || "note"} onChange={setKind} />
        {/*
          <StatusPicker value={status} onChange={setStatus} />
          <PriorityPicker value={priority} onChange={setPriority} />
          */}
        <div className="flex items-center gap-1">
          {/* The editor's settings, drawn here rather than in its toolbar: it
              exposes them as props, so the chrome is the app's business and
              the package stays whole. The theme knows how to look after
              itself - it is a page-level thing, not an editor one. */}
          <Button
            className={CONTROL}
            aria-label={vim ? 'Turn vim keys off' : 'Turn vim keys on'}
            onClick={() => setVim(!vim)}
          >
            {vim ? <Keyboard /> : <KeyboardOff />}
          </Button>
          <Button
            className={CONTROL}
            aria-label={locked ? 'Unlock the note' : 'Lock the note'}
            onClick={() => setLocked(!locked)}
          >
            {locked ? <Lock /> : <LockOpen />}
          </Button>
          <Button
            className={CONTROL}
            aria-label={source ? 'Hide the source' : 'Show the source'}
            onClick={() => setSource(!source)}
          >
            <FileJson2 />
          </Button>
          <ThemePicker className={`${CONTROL} gap-1.5 rounded-full cursor-pointer`} />
          <Button className={`${CONTROL} text-red-400 hover:text-red-300`}>
            <AudioLines />
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Escape puts the window away, the way it does in Raycast's notes.
 *
 * Only once nothing else wants it. A menu closes, the find bar closes, vim
 * leaves visual mode - each of those says so by preventing the default, and
 * this asks rather than keeping its own list of what might be open. The list
 * was always going to be missing whatever was added last.
 *
 * Vim in its resting state deliberately does not claim it, or Escape could
 * never reach the window from inside the editor. `jk` is the way out of
 * insert mode, so Escape has nothing to do there anyway.
 */
function useEscapeToHide(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      window.api.hideWindow()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/**
 * The three dots, top left. Raycast's rather than the system's.
 *
 * They are not there until the pointer is over the window, and they only
 * colour in once it is over them - the window is meant to look like a sheet of
 * paper until you go looking for a control. Only the first one does anything;
 * the other two are the shape people recognise.
 *
 * `no-drag`, because the strip they sit on is what moves the window, and a
 * drag region swallows the click before the button sees it.
 */
const WindowDots = (): React.JSX.Element => (
  <div className="mf-dots" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
    {/* Out of the tab order: it is a window control, not part of the form, and
        tabbing through a note should never land on the thing that closes it. */}
    <button
      type="button"
      tabIndex={-1}
      aria-label="Close"
      onClick={() => window.api.hideWindow()}
    >
      <X />
    </button>
    <span />
    <span />
  </div>
)

const Header = (): React.JSX.Element => {
  const [expanded, setExpanded] = useState(false)

  const toggle = (): void => {
    setExpanded((was) => {
      void window.api.setExpanded(!was)
      return !was
    })
  }

  // The same chord Linear uses for it. On the window rather than the editor:
  // the size of the box is not the document's business, and the shortcut has
  // to work with the caret anywhere - or nowhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'f') return
      if (!event.ctrlKey || !event.shiftKey || event.metaKey || event.altKey) return
      event.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // Once: `toggle` reads the size through the updater, so it is never stale.
  }, [])

  return (
    <div className="fixed top-0 right-0 left-0 z-10 flex items-center gap-2 text-xs"
      style={{ WebkitAppRegion: 'drag', padding: '1rem 4.75rem' } as CSSProperties}>
      <WindowDots />
      <span className="flex-1" />

      {/* The strip is the window's drag handle, so the one thing on it that is
          not a handle has to say so, or the click never lands. Out of the tab
          order for the same reason the close button is: it is a window
          control, not part of the note. */}
      <button
        type="button"
        tabIndex={-1}
        className="mf-expand"
        aria-label={expanded ? 'Shrink the window' : 'Expand the window'}
        title={`${expanded ? 'Shrink' : 'Expand'} \u2303\u21e7F`}
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        onClick={toggle}
      >
        {expanded ? <Minimize2 /> : <Maximize2 />}
      </button>
    </div>
  )
}

type CaptureStatus = 'open' | 'promoted' | 'resolved' | 'discarded'
type Capture = {
  id: string,
  body?: JSONContent | undefined | string
  title: string | undefined
  capturedAt: string
  status: CaptureStatus
  kind: CaptureType
  closedAt: string | null
  isDraft: boolean
}

/**
 * The document as JSON, in a drawer off the right edge.
 *
 * Beside the note rather than over it: the editor's own source panel takes the
 * window, and reading the shape of what you wrote while you cannot see what you
 * wrote is not much use. It is fed by `onChange`, so it is whatever the editor
 * last handed over.
 */
const SourceDrawer = ({
  open,
  doc,
  onOpenChange
}: {
  open: boolean
  doc: JSONContent | null
  onOpenChange: (open: boolean) => void
}): React.JSX.Element => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="gap-0 p-0">
      <SheetHeader className="border-b p-4">
        <SheetTitle className="text-sm">Source</SheetTitle>
        <SheetDescription className="sr-only">
          The note as the editor last handed it over.
        </SheetDescription>
      </SheetHeader>
      <pre className="flex-1 overflow-auto p-4 text-xs leading-relaxed break-words whitespace-pre-wrap">
        {doc ? JSON.stringify(doc, null, 2) : ''}
      </pre>
    </SheetContent>
  </Sheet>
)

const CapturePrompt = ({
  locked,
  onChange
}: {
  locked: boolean
  onChange: (doc: JSONContent) => void
}): React.JSX.Element => {
  useEscapeToHide()

  // const {note, notes, save, open} = useNotes()
  // const [icon, setIcon] = useState('📃')
  // const [status, setStatus] = useState<Status>('todo')
  // const [capture, setCapture] = useState<Capture>(localStorage.getItem("capture-draft") && JSON.parse(localStorage.getItem("capture-draft")) as Capture)
  // const [priority, setPriority] = useState<Priority>('none')
  // const [kind, setKind] = useState<CaptureType>('note')
  // const [title, setTitle] = useState<string>('')
  // const [body, setBody] = useState<JSONContent | null>(null)
  // console.log('[CapturePrompt][title][🐦‍🔥]: ', title)
  // console.log('[CapturePrompt][body][🐦‍🔥]: ', body)
  // console.log('[CapturePrompt][kind][🐦‍🔥]: ', kind)


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
    <div className="relative overflow-hidden flex w-full flex-1 min-h-0 flex-col transition transition-all transition-duration-3 pt-6 border-b-2 rounded-b-3xl shadow-xl"
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
      </div>

      {/* The same, spelled out. See `docs/components.md` for what each one
          does and what it is when you leave it out. */}
      <MindflowEditor
        // --- what it holds ---
        shape="document"
        placeholder="' / '  for commands..."
        // defaultContent={capture?.body}
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
        // vim is left out, so it follows the page switch.
        vimStart="insert"
        autofocus={true}
        showSource={false}
        readOnly={locked}

        // --- the app around it ---
        host={window.api}

        // --- what it tells you ---
        onChange={onChange}
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

import React, { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Archive, FileJson2, Inbox, Keyboard, KeyboardOff, Lock, LockOpen, Maximize2, Minimize2, SquarePen, TableOfContents, X } from 'lucide-react'
import type { Editor, JSONContent } from '@tiptap/core'

import { MindflowEditor, TAGS, currentVim, onVimChange, setVim } from './components/mindflow'
import { ThemePicker } from './components/theme/theme-picker'
import { titleOf } from './lib/document'
import { findCaptures } from './lib/capture-links'
import { toMarkdown } from './lib/export'
import { CaptureList, useCaptures } from './components/capture-list'
import { RotCards, textOf } from './components/rot-cards'
import { HintCard } from './components/hint-card'
import { Pins } from './components/pins'
import { TodayPanel } from './components/vigil/today-panel'
import { selectionActions } from './components/vigil/selection-actions'
import { ReviewView } from './components/vigil/review-view'
import { useAppearance, useLive } from './lib/vigil'
import { BackToTop, useListKeys } from './components/vigil/ui'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip'
import type { LucideIcon } from 'lucide-react'
import { Toaster, toast } from './components/vigil/ui'
import { vigil } from './lib/vigil'
import { chime } from './lib/sound'

// import { Maximize2, Minimize2 } from 'lucide-react'
// import { StatusPicker, type Status } from './components/status/status-picker'
// import { PriorityPicker, type Priority } from './components/priority/priority-picker'

import { CAPTURE_TYPES, CaptureKindPicker, type CaptureType } from './components/capture-kinds/capture-kind-picker';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from './components/ui/sheet';

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"



/**
 * Whether a body holds anything, so ⌘↵ on an empty box saves nothing. An empty
 * editor still hands over one bare paragraph, so an empty paragraph or heading
 * does not count; a picture or a drawing has nothing inside it and still does.
 */
const hasContent = (body: JSONContent | string | null): boolean =>
  typeof body === 'string'
    ? body.trim() !== ''
    : (body?.content ?? []).some((b) => b.content?.length || !['paragraph', 'heading'].includes(b.type ?? ''))

/**
 * The controls on the bar at the foot of the window.
 *
 * A colour of their own: inheriting left them near enough invisible against
 * the bar, and an icon you have to look for is not a control.
 */
const CONTROL = 'bg-transparent cursor-pointer text-foreground/75 hover:text-foreground ' +
  'hover:bg-accent [&_svg]:size-[1.1rem]'

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
  <div
    className="mf-dots flex items-center"
    style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
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

const Header = ({ onNew }: { onNew: () => void }): React.JSX.Element => {
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
    <div className="h-fit fixed top-0 right-0 left-0 z-10 flex flex-col items-center py-2 text-xs cursor-pointer" style={{ WebkitAppRegion: 'drag' }}>
      <div className="flex w-full" style={{ padding: '0rem 4.75rem' } as CSSProperties}>
        <WindowDots />
        <span className="flex-1" />
        <button
          type="button"
          tabIndex={-1}
          className="mf-expand"
          aria-label="New capture"
          title="New capture ⌘N"
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
          onClick={onNew}
        >
          <SquarePen />
        </button>
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
      <div className="w-full shadow-xl px-[4.75rem]">
        <div className="h-[2px] w-full bg-background/10 shadow-xl" />
      </div>
    </div>
  )
}

export default function App(): React.JSX.Element {
  const [kind, setKind] = useState<CaptureType>('note')
  const captures = useCaptures()
  useAppearance()

  // The window's controls show while the pointer is over it. Told by the main
  // process rather than read from `:hover`, which goes false over the drag strip.
  const [pointerIn, setPointerIn] = useState(false)
  useEffect(() => window.api.onPointer(setPointerIn), [])

  const [vim, setVimOn] = useState(currentVim)
  useEffect(() => onVimChange(setVimOn), [])

  const [locked, setLocked] = useState(false)

  // The heading outline down the right edge. Dimmed button means hidden.
  const [outline, setOutline] = useState(false)
  const [source, setSource] = useState(false)

  // The document, as the editor last handed it over. The drawer reads this
  const [body, setBody] = useState<JSONContent | null>(null)

  const title = titleOf(body)
  // The same, as text, for the copy kept beside the backups.
  const [markdown, setMarkdown] = useState('')
  // Bumped on submit. The prompt is keyed on it, so a fresh editor replaces
  // the one just sent.
  const [round, setRound] = useState(0)
  // A capture opened from the list on the right. Edits save to it as they
  // happen; Cmd+Enter puts it down and brings back a fresh prompt.
  const [editing, setEditing] = useState<{ id: string; body: JSONContent } | null>(null)
  const editorRef = useRef<Editor | null>(null)
  // Keep or offload: the plan's most consequential field. Keep, and it can
  // come back; offload, and it is only ever found by looking. Set per capture.
  const [offload, setOffload] = useState(false)
  const [sending, setSending] = useState(false)
  const actionTags = useLive(() => vigil.tagMeta().then((meta) => meta.filter((row) => row.action).map((row) => row.tag)), [] as string[])

  // Kind by prefix: while the capture is a single word that starts a kind's
  // name, Tab takes that kind and clears the word. Only at the very start, and
  // gone at the first space, so "we made a decision" never offers one.
  // From the document, not the editor: after ⌘N the old editor is gone.
  const typed = body ? textOf(body).trim() : ''
  const offered = !editing && typed && !/\s/.test(typed)
    ? CAPTURE_TYPES.find((type) => type.label.toLowerCase().startsWith(typed.toLowerCase()))
    : undefined
  // The same idea arriving again is a vote, not a duplicate: say so quietly,
  // and let the new one land anyway.
  const [like, setLike] = useState<{ id: string; number: number; title: string } | null>(null)
  useEffect(() => {
    if (editing || !title) return setLike(null)
    void vigil.similar(title).then(setLike)
  }, [title, editing])

  useEffect(() => {
    if (!offered) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab' || event.shiftKey) return
      event.preventDefault()
      event.stopPropagation()
      setKind(offered.id)
      editorRef.current?.commands.clearContent(true)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [offered])
  const openCapture = (id: string): void =>
    void window.api.captures.get(id).then((found) => {
      if (!found) return
      setEditing({ id, body: found.body as JSONContent })
      setBody(found.body as JSONContent)
      setKind(found.kind as CaptureType)
    })
  const fresh = (): void => {
    editorRef.current = null
    setEditing(null)
    setBody(null)
    setKind('note')
    setRound((n) => n + 1)
  }
  // ⌘. means "I want to write something". A capture opened from the list is
  // put down, so the box comes back empty; a new one you had started and not
  // sent is still there, the way any capture box keeps a half-typed thought.
  const latestEditing = useRef(editing)
  latestEditing.current = editing
  useEffect(() => window.api.onHiding(() => latestEditing.current && fresh()), [])
  // ⌘N, from anywhere in the window: a fresh box. ⌘⇧O: keep or offload.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey && event.shiftKey && event.code === 'KeyO') {
        event.preventDefault()
        return setOffload((on) => !on)
      }
      if (!event.metaKey || event.key !== 'n') return
      event.preventDefault()
      fresh()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Cmd+Enter sends the capture to the main process, which stores it and tells
  // every window. Caught before the editor sees it, where it would otherwise
  // only step out of a code block.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' || !event.metaKey) return
      event.preventDefault()
      event.stopPropagation()
      if (editing) return fresh()
      if (!hasContent(body)) return
      // What a paste is, when the kind was left alone: a bare link is a link,
      // and a long block is an excerpt, the container for what comes out of it.
      const text = textOf(body).trim()
      const sorted = kind !== 'note' ? kind : /^https?:\/\/\S+$/.test(text) ? 'link' : text.length > 600 ? 'excerpt' : kind
      // A tag marked "makes a task" (#bug, #fix and the rest by default) is a
      // todo wearing a label: it goes to the task list at once, as a todo does.
      const tags = [...text.matchAll(/(?:^|\s)#([a-z][\w-]*)/gi)].map((match) => match[1].toLowerCase())
      const action = sorted === 'todo' || tags.some((tag) => actionTags.includes(tag))
      chime('send')
      setSending(true)
      void window.api.captures.create({ title, kind: sorted, body, markdown }).then(async (id) => {
        await vigil.setCapture(id, 'discharge', offload ? 1 : 0)
        await vigil.linkSession(id)
        if (action) {
          await vigil.toTask(id)
          toast('Added to your tasks')
        }
        // Let the box finish leaving before it is replaced.
        // ⌥⌘↵ is Linear's "create more": saved, and a fresh box for the next.
        const more = event.altKey
        setTimeout(() => {
          setSending(false)
          setOffload(false)
          fresh()
          if (more) toast('Saved. Next one')
          else window.api.hideWindow()
        }, 180)
      })
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [body, title, kind, markdown, editing, offload, actionTags])


  return (
    <TooltipProvider delayDuration={500}>
    <div className={`app-container ${pointerIn ? 'pointer-in' : ''} flex flex-col items-center justify-center relative flex h-full w-full flex-col pt-8 color-white`}>
      <Toaster />
      <Header onNew={fresh} />

      <ResizablePanelGroup
        orientation="horizontal"
        className="w-full h-full"
      >
        <ResizablePanel
          defaultSize="60%"
          minSize={"60%"}
          className="h-full w-full"
        >
          <div className="h-full w-full flex flex-col">
            {/* Keyed like the editor, so each note that opens, old or fresh,
                eases in rather than snapping into place. */}
            <motion.div
              key={editing?.id ?? round}
              className="flex min-h-0 flex-1 flex-col"
              initial={{ opacity: 0, y: 8, filter: 'blur(3px)' }}
              animate={sending ? { opacity: 0, y: -10, scale: 0.985, filter: 'blur(2px)' } : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              transition={{ duration: sending ? 0.18 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
            <CapturePrompt
              key={editing?.id ?? round}
              initial={editing?.body}
              locked={locked}
              outline={outline}
              onChange={(doc, editor) => {
                editorRef.current = editor
                setBody(doc)
                setMarkdown(toMarkdown(editor))
                if (editing) {
                  void window.api.captures.save(editing.id, { body: doc, title: titleOf(doc), markdown: toMarkdown(editor) })
                }
              }}
            />
            </motion.div>
            <main className="flex justify-between py-[0.5rem] px-[4.75rem] bg-linear-to-t from-[var(--accent)]/40">
              <CaptureKindPicker
                value={kind}
                onChange={(next) => {
                  setKind(next)
                  if (editing) void window.api.captures.save(editing.id, { kind: next })
                }}
              />
              <BarToggle
                on={!offload}
                icon={offload ? Archive : Inbox}
                label={offload ? 'Offload' : 'Keep'}
                tip={offload ? 'Offload: out of your head, found only by searching' : 'Keep: it can come back to you'}
                keys="⌘⇧O"
                onClick={() => setOffload(!offload)}
                text
              />
              {offered && <span className="mr-auto ml-2 self-center text-xs text-muted-foreground">⇥ {offered.label}</span>}
              {!offered && like && (
                <button
                  type="button"
                  onClick={() => openCapture(like.id)}
                  className="mr-auto ml-2 max-w-64 truncate self-center text-xs text-muted-foreground hover:text-foreground"
                  title={like.title}
                >
                  You wrote something like this: MF-{like.number}
                </button>
              )}
              {!offered && !like && <span className="flex-1" />}
              {/* The editor's settings, one shape each, every one named with its
                  key on hover, and on or off shown by a fill rather than a fade. */}
              <div className="flex items-center gap-0.5">
                <BarToggle on={vim} icon={vim ? Keyboard : KeyboardOff} label="Vim keys" tip={vim ? 'Vim keys on' : 'Vim keys off'} keys={'\\'} onClick={() => setVim(!vim)} />
                <BarToggle on={locked} icon={locked ? Lock : LockOpen} label="Lock" tip={locked ? 'Locked: read only' : 'Lock the note'} onClick={() => setLocked(!locked)} />
                <BarToggle on={outline} icon={TableOfContents} label="Outline" tip={outline ? 'Hide the outline' : 'Show the outline'} onClick={() => setOutline(!outline)} />
                <BarToggle on={source} icon={FileJson2} label="Source" tip={source ? 'Hide the source' : 'Show the source'} keys="⌘⌥S" onClick={() => setSource(!source)} />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span><ThemePicker className={`${CONTROL} gap-1.5 rounded-md`} /></span>
                  </TooltipTrigger>
                  <TooltipContent>Theme</TooltipContent>
                </Tooltip>
              </div>
            </main>
          </div>
          <SourceDrawer open={source} doc={body} onOpenChange={setSource} />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize="40%" minSize={"30%"}>
          <SidePanel captures={captures} editing={editing?.id} onOpen={openCapture} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
    </TooltipProvider>
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
  initial,
  locked,
  outline,
  onChange
}: {
  initial?: JSONContent
  locked: boolean
  outline: boolean
  onChange: (doc: JSONContent, editor: Editor) => void
}): React.JSX.Element => {
  useEscapeToHide()


  return (
    <div className="flex-1 w-full relative overflow-hidden flex w-full flex-1 min-h-0 flex-col transition transition-all transition-duration-3 border-b-2 rounded-b-3xl shadow-xl"
      style={{ transform: 'translate(0,0)' }}>

      {/* The same, spelled out. See `docs/components.md` for what each one
          does and what it is when you leave it out. */}
      <MindflowEditor
        shape="document"
        placeholder="' / '  for commands..."
        defaultContent={initial}
        tokens={TAGS}
        // documentId={note ? `doc-${note.id}` : null}

        // --- what is switched on ---
        // No fixed toolbar: the dock would sit over the capture prompt. The
        // selection toolbar keeps its default contents.
        toolbar={{ fixed: false, selectionExtra: selectionActions({}) }}
        handles={true}
        slash={true}
        outline={outline}
        search={true}
        // vim is left out, so it follows the page switch.
        vimStart="insert"
        autofocus={true}
        showSource={false}
        readOnly={locked}

        // --- the app around it ---
        host={window.api}

        smoothScroll={false}
        // --- what it tells you ---
        onChange={onChange}
        findNotes={findCaptures}
      />
    </div>
  )
}

/**
 * The prompt's right-hand side, which is most of the app for most of the day:
 * the inbox (pins, a hint, the rot cards, everything captured), today's tasks,
 * and the review queue, a tab each. The main window has the same things with
 * room to spread out; this is them at the size you actually keep open.
 */
function SidePanel({ captures, editing, onOpen }: {
  captures: Parameters<typeof CaptureList>[0]['captures']
  editing?: string
  onOpen: (id: string) => void
}): React.JSX.Element {
  const [tab, setTab] = useState<'inbox' | 'today' | 'review'>('inbox')
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  const due = useLive(() => window.api.vigil('review:counts') as Promise<number>, 0)
  const today = useLive(
    () => (window.api.vigil('tasks') as Promise<{ status: string; dueAt: string | null }[]>).then(
      (tasks) => tasks.filter((task) => task.status === 'open' && task.dueAt && new Date(task.dueAt).getTime() < new Date().setHours(24, 0, 0, 0)).length
    ),
    0
  )
  const tabs = [
    { id: 'inbox', label: 'Inbox', count: captures.filter((capture) => capture.status === 'open').length },
    { id: 'today', label: 'Today', count: today },
    { id: 'review', label: 'Review', count: due }
  ] as const
  // The same keys as every list: j and k when the editor does not have the
  // focus, Enter to open. ⌘1 to ⌘3 switch tabs from anywhere in the window.
  const [cursor] = useListKeys(captures.length, { onOpen: (index) => onOpen(captures[index].id), enabled: tab === 'inbox' })
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const to = event.metaKey ? tabs[Number(event.key) - 1] : undefined
      if (!to) return
      event.preventDefault()
      setTab(to.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="relative flex h-full w-full flex-col p-2">
      <div className="mb-2 flex gap-1 rounded-lg bg-accent/40 p-0.5 text-sm">
        {tabs.map((one) => (
          <button
            key={one.id}
            type="button"
            onClick={() => {
              if (tab !== one.id) chime('tap')
              setTab(one.id)
            }}
            title={`⌘${tabs.indexOf(one) + 1}`}
            className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-md py-1 transition-colors ${tab === one.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {/* One pill that slides between tabs rather than three that blink. */}
            {tab === one.id && (
              <motion.span layoutId="prompt-tab" className="absolute inset-0 -z-10 rounded-md bg-background shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
            )}
            {one.label}
            {one.count ? <span className="text-xs tabular-nums text-muted-foreground">{one.count}</span> : null}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={tab}
        ref={setScroller}
        initial={{ opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -8 }}
        transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {tab === 'inbox' ? (
          <>
            <Pins />
            <HintCard />
            <RotCards onOpen={onOpen} />
            <CaptureList captures={captures} selected={editing} cursor={cursor} onPick={onOpen} />
          </>
        ) : tab === 'today' ? (
          <TodayPanel />
        ) : (
          <div className="flex h-full [&_header]:hidden">
            <ReviewView />
          </div>
        )}
      </motion.div>
      </AnimatePresence>
      <BackToTop target={scroller} />
    </div>
  )
}

/**
 * One control on the prompt's bar: an icon, a fill when it is on, and a
 * tooltip that names it and gives its key, so nothing on the bar is a guess.
 */
function BarToggle({ on, icon: Icon, label, tip, keys, onClick, text }: {
  on: boolean
  icon: LucideIcon
  label: string
  tip: string
  keys?: string
  onClick: () => void
  text?: boolean
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={tip}
          aria-pressed={on}
          onClick={() => {
            chime('tap')
            onClick()
          }}
          className={`flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[13px] transition-colors [&_svg]:size-4 ${
            on ? 'bg-accent/70 text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
          }`}
        >
          <Icon />
          {text && label}
        </button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        {tip}
        {keys && <kbd className="rounded border border-border/80 px-1 font-sans text-[11px] text-muted-foreground">{keys}</kbd>}
      </TooltipContent>
    </Tooltip>
  )
}

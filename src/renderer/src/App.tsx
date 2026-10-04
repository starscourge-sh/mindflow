import React, { useEffect, useRef, useState, type CSSProperties } from 'react'
import { cardUp, cardsUp } from './lib/link-card'
import { AnimatePresence, motion } from 'motion/react'
import { FileJson2, Keyboard, KeyboardOff, Lock, LockOpen, Maximize2, Minimize2, SquarePen, TableOfContents, X } from 'lucide-react'
import type { Editor, JSONContent } from '@tiptap/core'

import { MindflowEditor, TAGS, currentVim, onVimChange, setVim } from './components/mindflow'
import { ThemePicker } from './components/theme/theme-picker'
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
import { BackToTop, Remembered, useListKeys, useSmooth, FocusNote, useFocusMode, SoundToggle } from './components/vigil/ui'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip'
import type { LucideIcon } from 'lucide-react'
import { Toaster, toast } from './components/vigil/ui'
import { vigil } from './lib/vigil'
import { chime } from './lib/sound'


import { ASKS, CAPTURE_TYPES, CaptureKindPicker, type CaptureType } from './components/capture-kinds/capture-kind-picker'
import { firstLine, kindOf } from '../../main/import'
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
import { Tip } from '@/components/vigil/ui'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'



/**
 * A new note half written, kept as you type so it survives quitting and
 * reading old captures. Only if it holds anything.
 */
const readDraft = (): JSONContent | undefined => {
  try {
    const saved = JSON.parse(localStorage.getItem('capture-draft') ?? 'null')
    return hasContent(saved) ? saved : undefined
  } catch {
    return undefined
  }
}

/** youtube.com is YouTube; anything else, its name with a capital. */
const SITES: Record<string, string> = { youtube: 'YouTube', youtu: 'YouTube', github: 'GitHub', linkedin: 'LinkedIn', x: 'X', twitter: 'X' }
const siteName = (host: string): string => {
  // The name before the domain's ending: en.wikipedia.org is Wikipedia.
  const parts = host.split('.')
  const name = (['co', 'com', 'org', 'ac', 'gov'].includes(parts.at(-2) ?? '') ? parts.at(-3) : parts.at(-2)) ?? parts[0]
  return SITES[name] ?? name.charAt(0).toUpperCase() + name.slice(1)
}


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
        <SoundToggle className="mf-expand" />
        <Tip label="New capture ⌘N">
        <button
          type="button"
          tabIndex={-1}
          className="mf-expand"
          aria-label="New capture"
        
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
          onClick={onNew}
        >
          <SquarePen />
        </button>
        </Tip>
        {/* The strip is the window's drag handle, so the one thing on it that is
          not a handle has to say so, or the click never lands. Out of the tab
          order for the same reason the close button is: it is a window
          control, not part of the note. */}
        <Tip label={`${expanded ? 'Shrink' : 'Expand'} \u2303\u21e7F`}>
        <button
          type="button"
          tabIndex={-1}
          className="mf-expand"
          aria-label={expanded ? 'Shrink the window' : 'Expand the window'}
        
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
          onClick={toggle}
        >
          {expanded ? <Minimize2 /> : <Maximize2 />}
        </button>
        </Tip>
      </div>
      <div className="w-full shadow-xl px-[4.75rem]">
        <div className="h-[2px] w-full bg-background/10 shadow-xl" />
      </div>
    </div>
  )
}

export default function App(): React.JSX.Element {
  const [kind, setKind] = useState<CaptureType>('note')
  // Picked by hand: from then on the wording no longer suggests one.
  const [chosen, setChosen] = useState(false)
  const captures = useCaptures()
  useAppearance()
  // Focus: only the writing, until ⌘⇧F again.
  const focus = useFocusMode('prompt')
  // Once a launch, a little after it: links still bare become cards, and
  // cards whose pictures live on their sites keep a copy.
  useEffect(() => void setTimeout(cardsUp, 5000), [])

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

  // What you write. Its first line is its name, worked out wherever it is
  // shown and never stored, so an edit never leaves a stale one behind.
  const [body, setBody] = useState<JSONContent | null>(() => readDraft() ?? null)
  const first = firstLine(body)
  // Who said it and where you met it. Null who means the words are yours.
  const [attribution, setAttribution] = useState('')
  const [medium, setMedium] = useState('')
  // Private from the start: never surfaces unasked in quiet hours or safe mode.
  const [secret, setSecret] = useState(false)
  // Linear's "Create more": on, a save keeps the box open for the next one.
  const [createMore, setCreateMore] = useState(() => localStorage.getItem('create-more') === 'on')
  useEffect(() => localStorage.setItem('create-more', createMore ? 'on' : 'off'), [createMore])
  // When the box was opened, for how long a capture took to write.
  const openedAt = useRef(Date.now())
  useEffect(() => window.api.onShown(() => void (openedAt.current = Date.now())), [])
  // Bumped on a fresh box. The editor is keyed on it, so a new one replaces it.
  const [round, setRound] = useState(0)
  // A capture opened from the list on the right. Edits save to it as they
  // happen; Cmd+Enter puts it down and brings back the box you had.
  const [editing, setEditing] = useState<{ id: string; body: JSONContent } | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const [sending, setSending] = useState(false)
  const actionTags = useLive(() => vigil.tagMeta().then((meta) => meta.filter((row) => row.action).map((row) => row.tag)), [] as string[])

  // Kept as you type, so a half-written note survives quitting.
  useEffect(() => {
    if (!editing) localStorage.setItem('capture-draft', JSON.stringify(body))
  }, [body, editing])

  // The same idea arriving again is a vote, not a duplicate: say so quietly,
  // and let the new one land anyway.
  const [like, setLike] = useState<{ id: string; number: number; title: string } | null>(null)
  useEffect(() => {
    if (editing || !first) return setLike(null)
    void vigil.similar(first).then(setLike)
  }, [first, editing])

  const openCapture = (id: string): void => {
    // The note being written is kept as it is now, not as it was at the last
    // pause in typing, or opening another straight after typing loses words.
    if (!latestEditing.current && editorRef.current) localStorage.setItem('capture-draft', JSON.stringify(editorRef.current.getJSON()))
    void window.api.captures.get(id).then((found) => {
      if (!found) return
      setEditing({ id, body: found.body as JSONContent })
      setBody(found.body as JSONContent)
      setKind(found.kind as CaptureType)
      setChosen(true)
      setAttribution(found.attribution ?? '')
      setMedium(found.medium ?? '')
      setSecret(!!found.private)
    })
  }
  // A fresh box. Sent, or a new note asked for, and the draft goes; put down
  // after reading an old capture, and the note you had started comes back.
  const fresh = (keepDraft = false): void => {
    if (!keepDraft) localStorage.removeItem('capture-draft')
    const draft = keepDraft ? readDraft() : undefined
    setEditing(null)
    setBody(draft ?? null)
    setAttribution('')
    setMedium('')
    setSecret(false)
    setKind('note')
    setChosen(false)
    setRound((n) => n + 1)
    requestAnimationFrame(() => editorRef.current?.commands.focus('end'))
  }
  // ⌘. means "I want to write something". A capture opened from the list is
  // put down as the window hides, so the box comes back as the one you had.
  const latestEditing = useRef(editing)
  latestEditing.current = editing
  useEffect(() => window.api.onHiding(() => latestEditing.current && fresh(true)), [])
  // ⌘N, from anywhere in the window: a fresh box.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || event.key !== 'n') return
      event.preventDefault()
      fresh()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Saving an open capture's fields as they change.
  const saveField = (patch: Parameters<typeof window.api.captures.save>[1]): void => {
    if (editing) void window.api.captures.save(editing.id, patch)
  }

  // Save. Never fails, and no field can block it: an empty box is the only
  // thing it refuses, because there is nothing there to keep.
  const submit = (once = false): void => {
    const more = once || createMore
    if (editing) return fresh(true)
    // Read from the editor itself: its onChange waits for a pause in the
    // typing, and ⌘↵ often comes before one.
    const doc = editorRef.current?.getJSON() ?? body
    const text = textOf(doc).trim()
    if (!text) return
    // What a paste is, when the kind was left alone: a bare link is a link,
    // and where it came from is the site; a long block is an excerpt, the
    // container for what comes out of it later.
    const url = /^https?:\/\/\S+$/.test(text) ? new URL(text) : null
    // The suggestion is worked out a moment after typing stops; a save before
    // then works it out here, so a quick "Call the plumber" is still a todo.
    const said = chosen ? kind : ((kindOf(firstLine(doc)) as CaptureType | null) ?? kind)
    const sorted = said !== 'note' ? said : url ? 'link' : text.length > 600 ? 'excerpt' : said
    const where = medium || (url ? siteName(url.hostname) : '')
    // A tag marked "makes a task" (#bug, #fix and the rest by default) is a
    // todo wearing a label: it goes to the task list at once, as a todo does.
    const tags = [...text.matchAll(/(?:^|\s)#([a-z][\w-]*)/gi)].map((match) => match[1].toLowerCase())
    const action = sorted === 'todo' || tags.some((tag) => actionTags.includes(tag))
    chime('send')
    const markdown = editorRef.current ? toMarkdown(editorRef.current) : undefined
    // ⌥ is Linear's "create more": the box is fresh at once, so the next one
    // can be typed straight away. Otherwise the box leaves and the window goes.
    if (more) {
      fresh()
      toast('Saved. Next one')
    } else setSending(true)
    void window.api.captures
      .create({ title: '', kind: sorted, elapsedMs: Date.now() - openedAt.current, body: hasContent(doc) ? doc : null, markdown })
      .then(async (id) => {
        if (attribution.trim()) await vigil.setCapture(id, 'attribution', attribution.trim())
        if (where) await vigil.setCapture(id, 'medium', where)
        await vigil.linkSession(id)
        if (secret) await vigil.setPrivate('captures', id, true)
        // A link shows as its card, filled in once the page answers.
        if (sorted === 'link') void cardUp({ id, kind: sorted, body: hasContent(doc) ? doc : null })
        if (action) {
          await vigil.toTask(id)
          toast('Added to your tasks')
        }
        if (more) return
        // Let the box finish leaving before it is replaced.
        setTimeout(() => {
          setSending(false)
          fresh()
          window.api.hideWindow()
        }, 180)
      })
  }
  // ⌘↵ from anywhere in the window saves and closes; ⌥⌘↵ saves and starts another. Caught before the
  // editor, where it would otherwise only step out of a code block.
  const pick = (next: CaptureType): void => {
    setKind(next)
    setChosen(true)
    saveField({ kind: next })
  }
  const latestPick = useRef(pick)
  latestPick.current = pick
  const latestSubmit = useRef(submit)
  latestSubmit.current = submit
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // ⌘1 to ⌘8: a kind you already know, without opening the picker.
      const picked = event.metaKey && !event.shiftKey && !event.altKey ? CAPTURE_TYPES[Number(event.key) - 1] : undefined
      if (picked) {
        event.preventDefault()
        latestPick.current(picked.id)
        return
      }
      if (event.key !== 'Enter' || !event.metaKey) return
      event.preventDefault()
      event.stopPropagation()
      latestSubmit.current(event.altKey)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])


  return (
    <TooltipProvider delayDuration={500}>
    <div className={`app-container ${pointerIn ? 'pointer-in' : ''} flex flex-col items-center justify-center relative flex h-full w-full flex-col pt-8 color-white`}>
      <Toaster />
      <FocusNote />
      <Header onNew={() => fresh()} />

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
              initial={editing?.body ?? readDraft()}
              locked={locked}
              outline={outline}
              onReady={(editor) => (editorRef.current = editor)}
              onOpenNote={openCapture}
              onChange={(doc, editor) => {
                setBody(doc)
                // The kind follows the wording of the first line until you choose one.
                if (!chosen && !editing) setKind((kindOf(firstLine(doc)) ?? 'note') as CaptureType)
                saveField({ body: doc, markdown: toMarkdown(editor) })
              }}
            />
            {/* Reading another capture with a note half written: the way back
                to it stays in view, so a link followed never loses the draft. */}
            {editing && readDraft() && (
              <div className="flex items-center gap-2 px-[4.75rem] pt-2 text-xs text-muted-foreground">
                <span className="truncate">Your draft “{firstLine(readDraft()) || 'unfinished'}” is waiting: Done takes you back to it.</span>
              </div>
            )}
            {/* Under the writing: what it is, who said it and where you met it. */}
            <div data-chrome className="flex items-center gap-1 px-[4.6rem] py-2">
              <CaptureKindPicker
                suggested={!chosen && kind !== 'note'}
                value={kind}
                onChange={pick}
              />
              {/* Only what this kind asks for, unless it already holds something. */}
              {(ASKS[kind].who || attribution) && (
                <Remembered field="attribution" value={attribution} placeholder={ASKS[kind].who ?? 'Who'} onChange={(value) => {
                  setAttribution(value)
                  if (editing) void vigil.setCapture(editing.id, 'attribution', value.trim() || null)
                }} />
              )}
              {(ASKS[kind].where || medium) && (
                <Remembered field="medium" value={medium} placeholder={ASKS[kind].where ?? 'Where'} onChange={(value) => {
                  setMedium(value)
                  if (editing) void vigil.setCapture(editing.id, 'medium', value.trim() || null)
                }} />
              )}
              <Tip label={secret ? 'Private: never comes up unasked in quiet hours or safe mode' : 'Make it private'}>
                <Button variant="ghost" size="icon-sm" aria-label="Private" className={secret ? 'text-foreground' : 'text-muted-foreground/60'} onClick={() => {
                  setSecret(!secret)
                  if (editing) void vigil.setPrivate('captures', editing.id, !secret)
                }}>
                  {secret ? <Lock /> : <LockOpen />}
                </Button>
              </Tip>
              {ASKS[kind].why && textOf(body).trim().split('\n').filter(Boolean).length < 2 && (
                <span className="truncate px-1.5 text-xs text-muted-foreground/70">{ASKS[kind].why}</span>
              )}
              {like && (
                <Tip label={like.title}>
                <button
                  type="button"
                  onClick={() => openCapture(like.id)}
                  className="ml-auto max-w-56 truncate text-xs text-muted-foreground hover:text-foreground"
                
                >
                  You wrote something like this: MF-{like.number}
                </button>
                </Tip>
              )}
            </div>
            {/* A hint sits at the foot of the box: a glance at something you
                wrote once, while you are here to write. Usually empty. */}
            <div data-chrome className="px-[4.75rem]">
              {!focus && <HintCard onOpen={openCapture} />}
            </div>
            </motion.div>
            <main data-chrome className="flex items-center gap-1 py-[0.5rem] px-[4.75rem] bg-linear-to-t from-[var(--accent)]/40">
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
              {/* Create, bottom right, where the eye ends up. */}
              {!editing && (
                <label className="mr-4 ml-auto flex items-center gap-2 text-[13px] text-muted-foreground">
                  <Switch checked={createMore} onCheckedChange={setCreateMore} />
                  Create more
                </label>
              )}
              <Tip label={createMore && !editing ? 'Save, and a fresh box for the next  ⌘↵' : 'Save and close  ⌘↵ · once with a fresh box after  ⌥⌘↵'}>
              <Button variant="secondary" onClick={() => submit()} className={`${editing ? 'ml-auto ' : ''}text-[13px]`}>
                {editing ? 'Done' : 'Create'} <kbd className="font-sans text-[11px] text-muted-foreground">⌘↵</kbd>
              </Button>
              </Tip>
            </main>
          </div>
          <SourceDrawer open={source} doc={body} onOpenChange={setSource} />
        </ResizablePanel>

        {!focus && <ResizableHandle withHandle />}
        {!focus && (
          <ResizablePanel defaultSize="40%" minSize={"30%"}>
            <SidePanel captures={captures} editing={editing?.id} onOpen={openCapture} />
          </ResizablePanel>
        )}
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
  onChange,
  onReady,
  onOpenNote
}: {
  initial?: JSONContent
  locked: boolean
  outline: boolean
  onChange: (doc: JSONContent, editor: Editor) => void
  onReady: (editor: Editor) => void
  onOpenNote: (id: string) => void
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
        onReady={onReady}
        showSource={false}
        readOnly={locked}

        // --- the app around it ---
        host={window.api}

        smoothScroll={false}
        // --- what it tells you ---
        onChange={onChange}
        findNotes={findCaptures}
        onOpenNote={onOpenNote}
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
  // The same easing as the main window's lists.
  useSmooth(scroller)
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
      const to = event.ctrlKey && !event.metaKey ? tabs[Number(event.key) - 1] : undefined
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
          <Tip key={one.id} label={`⌃${tabs.indexOf(one) + 1}`}>
          <button
            type="button"
            onClick={() => {
              if (tab !== one.id) chime('tap')
              setTab(one.id)
            }}
          
            className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-md py-1 transition-colors ${tab === one.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {/* One pill that slides between tabs rather than three that blink. */}
            {tab === one.id && (
              <motion.span layoutId="prompt-tab" className="absolute inset-0 -z-10 rounded-md border border-border bg-background shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
            )}
            {one.label}
            {one.count ? <span className="text-xs tabular-nums text-muted-foreground">{one.count}</span> : null}
          </button>
          </Tip>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={tab}
        initial={{ opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -8 }}
        transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
        className="flex min-h-0 flex-1 flex-col"
      >
        {/* Two kinds of thing, two places: what is waiting on you stays put,
            and only your captures scroll under it. Its shadow is the capture
            box's own, cut to fall only below it. */}
        {tab === 'inbox' && (
          <div className="relative z-10 shrink-0 shadow-xl [clip-path:inset(0_0_-3rem_0)]">
            <Pins />
            <RotCards onOpen={onOpen} />
          </div>
        )}
        <div ref={setScroller} className="min-h-0 flex-1 overflow-y-auto">
          {/* One child, which is what the easing moves. */}
          <div className="flex min-h-full flex-col">
            {tab === 'inbox' ? (
              <CaptureList captures={captures} selected={editing} cursor={cursor} onPick={onOpen} />
            ) : tab === 'today' ? (
              <TodayPanel />
            ) : (
              <div className="flex flex-1 [&_header]:hidden">
                <ReviewView />
              </div>
            )}
          </div>
        </div>
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

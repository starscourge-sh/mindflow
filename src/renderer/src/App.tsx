import { themeActions } from '@/lib/theme'
import React, { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { cardUp, cardsUp } from './lib/link-card'
import { AnimatePresence, motion } from 'motion/react'
import { useSwipeBack } from './lib/use-swipe-back'
import { ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight, EyeOff, Orbit, X } from 'lucide-react'
import type { Editor, JSONContent } from '@tiptap/core'

import { convertImports } from './lib/convert-imports'
import { MindflowEditor, TAGS, currentVim, foldEverything, goToHeading, onVimChange, setVim } from './components/mindflow'
import { EXITS, exit, findCaptures, findHeadings, follow } from './lib/capture-links'
import { toMarkdown } from './lib/export'
import { useSameWords } from './lib/same-words'
import { CaptureList, useCaptures, type CaptureMeta } from './components/capture-list'
import { RotCards, textOf } from './components/rot-cards'
import { HintCard } from './components/hint-card'
import { Pins } from './components/pins'
import { TodayPanel } from './components/vigil/today-panel'
import { selectionActions } from './components/vigil/selection-actions'
import { ReviewView } from './components/vigil/review-view'
import { useAppearance, useLive } from './lib/vigil'
import { BackToTop, Empty, Kbd, Remembered, Strip, StripSlot, ask, typing, useListKeys, useReadKey, useSmooth, FocusNote, useFocusMode, startAt } from './components/vigil/ui'
import { TooltipProvider } from './components/ui/tooltip'
import { Rolling, Toaster, Typed, beam, refuse, toast, whyFailed } from './components/vigil/ui'
import { Reader } from './components/vigil/reader'
import { OptionsMenu } from './components/vigil/options-menu'
import { ReadThrough, type Readable } from './components/vigil/read-through'
import { PassLinks, Passes, openPass } from './components/vigil/pass'
import { assetsOf } from './lib/document'
import { firstLineOf, tagsOf, type TokenPattern } from './extensions/tokens'
import { KeptPanel } from './components/vigil/kept-panel'
import { clueTarget, startQuestion } from './components/vigil/questions-view'
import { PinnedQuestions, clueInto } from './components/vigil/pinned-questions'
import { RecentPanel } from './components/vigil/recent-panel'
import { BOX_TABS, useShown, type Place } from './components/vigil/places'
import { RowMenu } from './components/vigil/row-menu'
import { CaptureProps, useCaptureDisplay } from './components/vigil/captures-view'
import { Search } from './components/search'
import { noteActions, useOpenNote } from './lib/notes'
import { vigil, type Item, type PinnedQuestion, type Settings } from './lib/vigil'
import { makeTask, placed } from './lib/tasks'
import { TaskChips, taskTokens } from './components/vigil/task-input'
import { readTask } from '../../main/task-words'
import { chime, soundOn } from './lib/sound'
import { liftFrom } from './lib/fly-home'
import { lengthSaid, timerFrom } from './lib/timer'
import { stickOnDesktop } from './components/vigil/sticky-note'
import { NotePreview } from './components/vigil/note-preview'


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
import { Tip, Pressed } from '@/components/vigil/ui'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import BookIcon from '@/components/ui/book-icon'
import LayoutSidebarRightIcon from '@/components/ui/layout-sidebar-right-icon'
import GearIcon from '@/components/ui/gear-icon'
import PenIcon from '@/components/ui/pen-icon'
import { AliveIcon } from '@/components/vigil/alive-icon'
import { useStoredFlag } from '@/lib/use-stored-flag'
import { ShortcutSheet } from '@/components/vigil/shortcut-sheet'
import { FocusScenery, Rest } from './components/vigil/scenery'
import { num } from '../../main/dates'



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

/**
 * The draft put by for later. A note too big for the window's small store (a
 * few large pictures) is not kept as a draft, rather than breaking the box.
 */
const putDraft = (doc: unknown): void => {
  try {
    localStorage.setItem('capture-draft', JSON.stringify(doc))
  } catch {
    // Still in the box; only quitting now would lose it.
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

const Header = ({ panel, onPanel, onNew, menu, nav, title, aside }: {
  panel: boolean
  onPanel: () => void
  onNew: () => void
  /** The actions menu, handed the window's size and the way to change it. */
  menu: (expanded: boolean, toggleExpanded: () => void) => React.ReactNode
  nav?: React.ReactNode
  /** The note's first line, once it has scrolled out of sight. */
  title?: string | null
  /** Said beside the pill, like Safe mode. */
  aside?: React.ReactNode
}): React.JSX.Element => {
  const [expanded, setExpanded] = useState(false)
  const toggle = (): void => {
    setExpanded((was) => {
      // Growing sounds like it, and so does coming back down.
      chime(was ? 'fold' : 'slide')
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
      <div className="relative flex w-full items-center gap-1" // Over the panel, the icons end where the panel's own edge does.
        style={{ padding: panel ? '0 0.75rem 0 4.75rem' : '0rem 4.75rem' } as CSSProperties}>
        <WindowDots />
        <span style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>{nav}</span>
        <span className="flex-1" />
        {/* The note's name, faint and centred, once its first line has
            scrolled away - so a long note still says what it is. */}
        <AnimatePresence>
          {title && (
            <motion.span
              key="title"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-none absolute inset-x-0 truncate px-48 text-center text-control text-muted-foreground/70"
            >
              {title}
            </motion.span>
          )}
        </AnimatePresence>
        {/* One pill for the window's controls, there while the pointer is,
            the way Raycast Notes keeps them: a new note, the actions, the
            panel. The strip is the window's drag handle, so the pill has to
            say it is not, or no click lands. Out of the tab order: these are
            window controls, not part of the note. Expand is in the actions. */}
        {/* The chip sits where the pill will be while the pill is away, and
            steps aside for it when the pointer comes in, so it never floats
            beside an empty space. */}
        <span className="group/top relative flex items-center">
        {aside && <span className="transition-[margin] duration-150 group-has-[[data-state=open]]/top:mr-[calc(5.5rem+0.25rem)] [.pointer-in_&]:mr-[calc(5.5rem+0.25rem)]">{aside}</span>}
        <span
          className="mf-pill absolute right-0 flex items-center overflow-hidden rounded-full border border-foreground/15 bg-background/60 opacity-0 transition-opacity duration-150 [.pointer-in_&]:opacity-100 has-[[data-state=open]]:opacity-100 [&>*+*]:border-l [&>*+*]:border-foreground/15"
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        >
          <Tip label="New capture  ⌘N">
            <button type="button" tabIndex={-1} aria-label="New capture" className="flex h-6 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              onMouseDown={(event) => event.preventDefault()} onClick={onNew}>
              <AliveIcon icon={PenIcon} size={14} />
            </button>
          </Tip>
          <span className="flex h-6 w-7 items-center justify-center">{menu(expanded, toggle)}</span>
          <Tip label={`${panel ? 'Hide' : 'Show'} Inbox, Tasks, Review and Kept  ⌘\\`}>
            <button type="button" tabIndex={-1} aria-label={panel ? 'Hide the side panel' : 'Show the side panel'} aria-pressed={panel}
              className="flex h-6 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground aria-pressed:text-foreground"
              onMouseDown={(event) => event.preventDefault()} onClick={onPanel}>
              <AliveIcon icon={LayoutSidebarRightIcon} size={14} />
            </button>
          </Tip>
        </span>
        </span>
      </div>
      {/* Room under the buttons, so none of them sits on the rule. */}
      <div className="mt-2 w-full shadow-xl px-[4.75rem]">
        <div className="h-[2px] w-full bg-background/10 shadow-xl" />
      </div>
    </div>
  )
}

export default function App(): React.JSX.Element {
  const [kind, setKind] = useState<CaptureType>('note')
  // Picked by hand: from then on the wording no longer suggests one.
  const [chosen, setChosen] = useState(false)
  // Archived ones too: Display's Archived filter reaches them; every other
  // use here leaves them out itself.
  const captures = useCaptures(true)
  useAppearance()
  // Focus: only the writing, until ⇧⌘F again.
  const focus = useFocusMode('prompt')
  // Once a launch, a little after it: links still bare become cards, and
  // cards whose pictures live on their sites keep a copy.
  useEffect(() => void setTimeout(cardsUp, 5000), [])
  // Notes just imported as Markdown become documents, read once here so
  // opening a long one later is quick. Again whenever an import lands.
  useEffect(() => {
    const later = setTimeout(convertImports, 1500)
    const stop = window.api.captures.onChange(convertImports)
    const landed = window.api.onImported(convertImports)
    return () => (clearTimeout(later), stop(), landed())
  }, [])

  // The window's controls show while the pointer is over it. Told by the main
  // process rather than read from `:hover`, which goes false over the drag strip.
  const [pointerIn, setPointerIn] = useState(false)
  useEffect(() => window.api.onPointer(setPointerIn), [])

  const [vim, setVimOn] = useState(currentVim)
  useEffect(() => onVimChange(setVimOn), [])

  const [locked, setLocked] = useState(false)

  // The heading outline down the right edge. Dimmed button means hidden.
  // Remembered, so an outline left open is open on the next launch.
  const [outline, setOutline] = useStoredFlag('outline')
  // The note's first line while it is scrolled out of sight, for the top bar.
  const [topTitle, setTopTitle] = useState<string | null>(null)
  const [source, setSource] = useState(false)
  const [details, setDetails] = useState(false)
  // ⇧⌘D: the open capture's details, in the prompt (⌘I stays italic).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || !event.shiftKey || event.key.toLowerCase() !== 'd') return
      event.preventDefault()
      // A note not yet sent has no details to show: say so, rather than nothing.
      if (!latestEditing.current) return chime('nope')
      setDetails((open) => !open)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // What you write. Its first line is its name, worked out wherever it is
  // shown and never stored, so an edit never leaves a stale one behind.
  const [body, setBody] = useState<JSONContent | null>(() => readDraft() ?? null)
  const first = firstLine(body)
  // Whether anything is written yet: who and where wait until there is.
  const started = hasContent(body)
  // Who said it and where you met it. Null who means the words are yours.
  const [attribution, setAttribution] = useState('')
  const [medium, setMedium] = useState('')
  // Private from the start: never surfaces unasked in quiet hours or safe mode.
  const [secret, setSecret] = useState(false)
  // Hidden from screen recordings and shares unless let in, for a demo or a
  // Loom; remembered, and put back on every start.
  const appSettings = useLive(vigil.settings, null as Settings | null)
  // What the side panel's Inbox has waiting on you: rot cards (as many as it
  // would show) and pins, for the chip at the top while the panel is shut.
  const oldCount = useLive(vigil.rotWaiting, 0)
  const pinned = useLive(vigil.pins, [] as Awaited<ReturnType<typeof vigil.pins>>)
  // The word count under the note, on unless you would rather not see it.
  const [counting, setCountingState] = useStoredFlag('word-count', true)
  const setCounting = (on: boolean): void => {
    setCountingState(on)
    if (on) delete document.documentElement.dataset.wordCount
    else document.documentElement.dataset.wordCount = 'off'
  }
  // Private words shown plainly, for a moment you choose: always back to
  // blurred the next time the box is opened, so it is never left on.
  const [reveal, setRevealState] = useState(false)
  const setReveal = (on: boolean): void => {
    setRevealState(on)
    if (on) document.documentElement.dataset.reveal = ''
    else delete document.documentElement.dataset.reveal
  }
  useEffect(() => window.api.onShown(() => setReveal(false)), [])
  const [recordable, setRecordableState] = useStoredFlag('recordable')
  const setRecordable = (on: boolean): void => {
    setRecordableState(on)
    void window.api.setRecordable(on)
  }
  useEffect(() => void (recordable && window.api.setRecordable(true)), []) // eslint-disable-line react-hooks/exhaustive-deps
  // Summoned, the box is simply there: it is called up hundreds of times a
  // day, and a slide seen for the hundredth time only reads as waiting.
  // A focus session left running across a restart brings its timer back.
  useEffect(() => void vigil.focusNow().then((focus) => focus && window.api.showFocus(true)), [])
  // One that ran out while Vigil was closed was ended quietly at start: said
  // once, the first time the box is on screen, rather than ringing late.
  useEffect(() => {
    const tell = (): void => void vigil.focusMissed().then((said) => said && toast(said, undefined, 'info'))
    if (document.visibilityState === 'visible') tell()
    return window.api.onShown(tell)
  }, [])
  // Linear's "Create more": on, a save keeps the box open for the next one.
  const [createMore, setCreateMore] = useStoredFlag('create-more')
  // When the box was opened, for how long a capture took to write.
  const openedAt = useRef(Date.now())
  // Each time the window comes up, the box has the caret, ready to type, not
  // whichever button the focus was last left on.
  useEffect(() => window.api.onShown(() => {
    openedAt.current = Date.now()
    requestAnimationFrame(() => {
      const active = document.activeElement
      if (!active || active === document.body || active.closest('header, [data-window-controls], button')) editorRef.current?.commands.focus('end')
    })
  }), [])
  // Bumped on a fresh box. The editor is keyed on it, so a new one replaces it.
  const [round, setRound] = useState(0)
  // A capture opened from the list on the right. Edits save to it as they
  // happen; Cmd+Enter puts it down and brings back the box you had.
  const [editing, setEditing] = useState<{ id: string; body: JSONContent } | null>(null)
  // Closed again whenever a different capture opens or the box is put down.
  useEffect(() => setDetails(false), [editing?.id])

  const editorRef = useRef<Editor | null>(null)
  // A todo's first line is read as you type, Todoist's way: its date and
  // priority words light up. Read through refs, as the editor's patterns are
  // built once; painted again when the note turns into a todo or out of one.
  const kindNow = useRef(kind)
  kindNow.current = kind
  const [boxTokens] = useState(() => [...TAGS, ...taskTokens(() => (kindNow.current === 'todo' && editorRef.current ? (firstLineOf(editorRef.current.state.doc)?.text ?? null) : null))])
  useEffect(() => {
    const editor = editorRef.current
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr)
  }, [kind])
  // What is open now, for a change that arrives late from a box already put
  // down: it must not land on the draft that came back.
  const editingNow = useRef<string | undefined>(undefined)
  editingNow.current = editing?.id
  const [sending, setSending] = useState(false)
  const [saved, setSaved] = useState(false)
  const actionTags = useLive(() => vigil.tagMeta().then((meta) => meta.filter((row) => row.action).map((row) => row.tag)), [] as string[])

  // Kept as you type, so a half-written note survives quitting.
  // Not while it is being sent: kept, it must not come back as a draft too.
  useEffect(() => {
    if (!editing && !sending) putDraft(body)
  }, [body, editing, sending])

  // The same idea arriving again is a vote, not a duplicate: say so quietly,
  // and let the new one land anyway.
  const [like, setLike] = useState<{ id: string; number: number; title: string } | null>(null)
  useEffect(() => {
    if (editing || !first) return setLike(null)
    void vigil.similar(first).then(setLike)
  }, [first, editing])

  // "+name" on the first line: a clue for a question you are holding, not a
  // capture. The open questions, to find which one the name means.
  const held = useLive(() => vigil.items('question').then((list) => list.filter((one) => !one.closedAt && !one.archivedAt)), [] as Item[], [], ['item'])
  const plus = editing ? null : clueTarget(first, held)
  // A question kept in view, picked under the writing: the words go into it
  // as a clue and nothing is captured; an open capture moves into it.
  const clueToPinned = (question: PinnedQuestion): void => {
    if (editing) return void clueInto(question, { captureId: editing.id })
    const doc = editorRef.current?.getJSON() ?? body
    const text = textOf(doc).trim()
    if (!text) return refuse('Write something first: it goes into the question as a clue')
    beam('success')
    void clueInto(question, { text }, () => (putDraft(doc), fresh(true)))
    fresh()
  }

  // A task, nugget or article open in the prompt, in place of the box: read
  // and changed here, never by switching to the main window. The note you were
  // writing waits as a draft, as it does when a capture is opened.
  const [reading, setReading] = useState<{ type: string; id: string } | null>(null)
  const openAny = (type: string, id: string, travelling = false): void => {
    if (type === 'capture') return openCapture(id, travelling)
    // A day's page lives in the main window.
    if (type === 'day') return void (chime('day'), window.api.openInHome('day', id))
    if (!travelling) cameBy.current = 0
    if (!latestEditing.current && editorRef.current) putDraft(editorRef.current.getJSON())
    // A nugget, article or task is a step in the box's history too: ⌘[ comes back.
    const step = `${type}:${id}`
    if (!travelling) setTrail((now) => (now.stack[now.at] === step ? now : { stack: [...now.stack.slice(0, now.at + 1), step], at: now.at + 1 }))
    setReading({ type, id })
  }
  // Escape goes back to the note, before it hides the window. Not while a
  // field or the editor's insert mode has it: those keep their own Escape.
  useEffect(() => {
    if (!reading) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // Reading full screen over it: that Escape is reading's, not this note's.
      if (document.querySelector('[aria-label="Reading"]')) return
      const target = event.target as HTMLElement
      if (target.closest?.('[data-vim-mode="insert"]')) return
      event.preventDefault()
      event.stopPropagation()
      if (['INPUT', 'TEXTAREA'].includes(target.tagName)) return target.blur()
      setReading(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [reading])
  // The box alone until the side panel is asked for: progressive disclosure.
  // Remembered, and the window is sized to match on every start.
  const [panel, setPanelOpen] = useStoredFlag('panel', false, ['open', 'closed'])
  const [tab, setTab] = useState<Tab>('inbox')
  const setPanel = (open: boolean): void => {
    chime(open ? 'slide' : 'fold')
    setPanelOpen(open)
    void window.api.setPanel(open)
  }
  useEffect(() => void window.api.setPanel(panel), []) // eslint-disable-line react-hooks/exhaustive-deps
  // From the writing to the list and back without the mouse: ⌃J or ⌃K leaves
  // the note for the panel's list (opening the panel if it is shut), and I
  // comes back, as vim's insert does. A menu open in the note keeps ⌃J and ⌃K.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.altKey) return
      const inNote = !!(document.activeElement as HTMLElement | null)?.closest?.('.ProseMirror')
      const key = event.key.toLowerCase()
      if (event.ctrlKey && inNote && (key === 'j' || key === 'k')) {
        if (document.querySelector('.tiptap-suggestion-popup, [cmdk-root], [role="menu"], [role="dialog"]')) return
        ;(document.activeElement as HTMLElement).blur()
        if (!panel) setPanel(true)
        // The cards waiting on you come first, then the list under them.
        if (tab !== 'inbox') return
        // No cards waiting and the panel already open: the list takes ⌃J.
        if (panel && !document.querySelector('[data-card]')) return
        event.preventDefault()
        // Shown as reached by keyboard, controls and all; a panel just opened
        // has a frame or two before its cards are there.
        let tries = 0
        const land = (): void => {
          const card = document.querySelector<HTMLElement>('[data-card]')
          if (card) card.focus({ focusVisible: true } as FocusOptions)
          else if (tries++ < 20) requestAnimationFrame(land)
        }
        land()
        return
      }
      if (!event.ctrlKey && event.key === 'i' && !inNote && panel && !typing()) {
        event.preventDefault()
        document.querySelector<HTMLElement>('.tiptap.ProseMirror')?.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  // ⌘\ shows or hides the panel; ⌃1 to ⌃5 open it on Inbox, Tasks, Review, Kept or Recent.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // ⇧⌘Y: Recent in the panel, or the panel away again from there.
      if (event.metaKey && event.shiftKey && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        if (panel && tab === 'recent') return setPanel(false)
        if (tab !== 'recent') chime('tap')
        setTab('recent')
        if (!panel) setPanel(true)
        return
      }
      if (event.metaKey && !event.ctrlKey && event.key === '\\') {
        event.preventDefault()
        return setPanel(!panel)
      }
      const to = event.ctrlKey && !event.metaKey ? TABS[Number(event.key) - 1] : undefined
      if (!to) return
      event.preventDefault()
      if (to !== tab || !panel) chime('tap')
      setTab(to)
      if (!panel) setPanel(true)
      // Going to a list means working the list: its keys, not the note's.
      ;(document.activeElement as HTMLElement | null)?.closest?.('.ProseMirror') && (document.activeElement as HTMLElement).blur()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  // Reading through a list, one note at a time with nothing else on screen.
  const [readList, setReadList] = useState<{ items: Readable[]; start: number } | null>(null)
  // With the panel shut, ⇧⌘R still reads: the inbox, from the top.
  useReadKey(() => setReadList({ items: captures.filter((one) => one.status === 'open' && !one.archivedAt).map((one) => ({ type: 'capture', id: one.id })), start: 0 }), captures.length, !panel)
  // ⌘K: search everything from the prompt, and open what it finds here.
  // ⌘K: notes and every action. ⌘P, Obsidian's quick open: notes only.
  const [searching, setSearching] = useState<boolean | 'notes'>(false)
  // What search opens with: a clicked tag, or nothing.
  const [searchFrom, setSearchFrom] = useState('')
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || (event.key !== 'k' && event.key !== 'p')) return
      event.preventDefault()
      event.stopPropagation()
      setSearching(event.key === 'k' || 'notes')
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  // Where the box has been, for back and forward the way a browser keeps
  // them: the draft you were writing (null), then each capture opened from it.
  const [trail, setTrail] = useState<{ stack: (string | null)[]; at: number }>({ stack: [null], at: 0 })
  // Which way the last step went, so the note arrives from that side: back
  // comes in from the left, forward from the right. A plain open is 0.
  const cameBy = useRef(0)
  const travel = (to: number): void => {
    const where = trail.stack[to]
    if (to < 0 || to >= trail.stack.length) return
    cameBy.current = Math.sign(to - trail.at)
    chime('tap')
    setTrail((now) => ({ ...now, at: to }))
    if (where?.includes(':')) return openAny(where.split(':')[0], where.split(':')[1], true)
    setReading(null)
    if (where) openCapture(where, true)
    else fresh(true, true)
  }
  // Two fingers sideways on the note go back and forward too.
  const column = useRef<HTMLDivElement>(null)
  const swipeX = useSwipeBack(column, (by) => trail.stack[trail.at + by] !== undefined, (by) => travel(trail.at + by))
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || event.shiftKey || event.altKey || event.ctrlKey || (event.key !== '[' && event.key !== ']')) return
      event.preventDefault()
      travel(trail.at + (event.key === '[' ? -1 : 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const openCapture = (id: string, travelling = false): void => {
    // A lock is for the note it was set on, not the next one.
    setLocked(false)
    if (!travelling) cameBy.current = 0
    // The same one again is not a step back to take.
    if (!travelling) setTrail((now) => (now.stack[now.at] === id ? now : { stack: [...now.stack.slice(0, now.at + 1), id], at: now.at + 1 }))
    setReading(null)
    // The note being written is kept as it is now, not as it was at the last
    // pause in typing, or opening another straight after typing loses words.
    if (!latestEditing.current && editorRef.current) putDraft(editorRef.current.getJSON())
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
  // ⇧⌘C: the note as Markdown on the clipboard, ready to paste anywhere.
  const copyMarkdown = (): void => {
    const editor = editorRef.current
    if (!editor || !textOf(editor.getJSON()).trim()) return refuse('Nothing to copy yet')
    void navigator.clipboard.writeText(toMarkdown(editor)).then(() => {
      chime('copy')
      toast('Copied as Markdown')
    })
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || !event.shiftKey || event.altKey || event.ctrlKey || event.key.toLowerCase() !== 'c') return
      event.preventDefault()
      copyMarkdown()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  // ⌥C: Create more on or off from the keys. Read by its key's place, since
  // ⌥C types ç on a Mac, and taken before the editor can write it.
  useEffect(() => {
    if (editing) return
    const onKey = (event: KeyboardEvent): void => {
      if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey || event.code !== 'KeyC') return
      event.preventDefault()
      event.stopPropagation()
      setCreateMore(!createMore)
      chime(createMore ? 'off' : 'on')
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [editing, createMore, setCreateMore])
  const fresh = (keepDraft = false, travelling = false): void => {
    setLocked(false)
    if (!travelling) cameBy.current = 0
    if (!travelling) setTrail({ stack: [null], at: 0 })
    if (!keepDraft) localStorage.removeItem('capture-draft')
    // A draft set aside for good takes its pending links with it; a submit
    // has already used them by now.
    if (!keepDraft) keepLifted([])
    const draft = keepDraft ? readDraft() : undefined
    openedAt.current = Date.now()
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
  // The capture open here is the note ⌘K acts on, as in the main window.
  const editingMeta = editing ? captures.find((one) => one.id === editing.id) : undefined
  // The draft set aside while a kept capture is open, read once a render.
  const waiting = editing ? readDraft() : undefined
  useOpenNote(editingMeta ? { table: 'captures', type: 'capture', id: editingMeta.id, kind: editingMeta.kind, archived: !!editingMeta.archivedAt } : null)
  useEffect(() => {
    // Opened in a window of its own, from here or another window: put down
    // here, so only one editor saves it.
    const onApart = (event: Event): void => void ((event as CustomEvent).detail === latestEditing.current?.id && fresh(true))
    // Version history lives in the main window, where there is room to read
    // back through them: the note goes there, its history open.
    const onVersions = (event: Event): void => {
      const id = (event as CustomEvent).detail
      if (id !== latestEditing.current?.id) return
      fresh(true)
      window.api.openInHome('versions', id)
    }
    window.addEventListener('vigil:opened-apart', onApart)
    window.addEventListener('vigil:versions', onVersions)
    return () => {
      window.removeEventListener('vigil:opened-apart', onApart)
      window.removeEventListener('vigil:versions', onVersions)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // ⌘N, from anywhere in the window: a fresh box.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || event.key !== 'n') return
      event.preventDefault()
      chime('tap')
      latestFresh.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // A new note asked for (⌘N, the pill's +, the ⌘K list) over words not yet
  // sent: they go, but a toast can bring them back.
  const startOver = (): void => {
    const draft = latestEditing.current ? readDraft() : editorRef.current?.getJSON()
    const links = [...lifted]
    fresh()
    if (!hasContent(draft ?? null)) return
    toast('Draft cleared', () => {
      putDraft(draft)
      keepLifted(links)
      fresh(true)
    })
  }
  // The current startOver(), for the listener above, which is set up once.
  const latestFresh = useRef(startOver)
  latestFresh.current = startOver

  // Saving an open capture's fields as they change.
  const saveField = (patch: Parameters<typeof window.api.captures.save>[1]): void => {
    if (editing) void window.api.captures.save(editing.id, patch)
  }
  // An open capture's words, saved only over what it was opened on: the same
  // note open in the main window, or a merge into it, is never written over.
  const words = useSameWords('captures', editing?.id, editing?.body, (id, body, base, editor) =>
    window.api.captures.save(id, { body, base, ...(editor ? { markdown: toMarkdown(editor) } : {}) }))

  // Save. Never fails, and no field can block it: an empty box is the only
  // thing it refuses, because there is nothing there to keep.
  const submit = (once = false): void => {
    const more = once || createMore
    if (editing) return fresh(true)
    // A second ⌘↵ while the first is still on its way would keep it twice.
    if (sending) return
    // Read from the editor itself: its onChange waits for a pause in the
    // typing, and ⌘↵ often comes before one.
    const doc = editorRef.current?.getJSON() ?? body
    const text = textOf(doc).trim()
    // Nothing to keep: said with the "not allowed" sound, not in silence. A
    // picture or a drawing with no words is still something.
    const something = (doc as JSONContent | null)?.content?.some((node) => node.type !== 'paragraph' || node.content?.length)
    if (!text && !something) return chime('nope')
    // "+name: …": a dated clue in that question, and nothing is captured. A
    // name that matches no question is kept as a capture, as the chip warned.
    const clueFor = clueTarget(firstLine(doc), held)
    if (clueFor?.question) {
      const question = clueFor.question
      const clue = [clueFor.rest, textOf(doc).split('\n').slice(1).join('\n').trim()].filter(Boolean).join('\n')
      if (!clue) return refuse('Write the clue after a colon, or on the lines under the question’s name')
      chime('clue')
      beam('success')
      void vigil.addClue(question.id, clue).then((id) => toast(`A clue in “${question.title.length > 36 ? `${question.title.slice(0, 36)}…` : question.title}”`, () => {
        if (id) void vigil.dropClue(id)
        putDraft(doc)
        fresh(true)
      }))
      fresh()
      if (!more) window.api.hideWindow()
      return
    }
    // "5m tea", "timer 25m": a countdown in the floating timer, not a capture.
    // Not when a kind was picked or it is a todo, nor when the rest has a date,
    // a repeat or a tag: "10 min walk every day #health" is a task to keep.
    const asTimer = !chosen && kind !== 'todo' && (doc as JSONContent | null)?.content?.length === 1 ? timerFrom(text) : null
    const rest = asTimer && readTask(asTimer.goal)
    const timer = rest && !rest.due && !rest.deadline && !rest.recurrence && !rest.plan && !/(?:^|\s)#[a-z]/i.test(text) ? asTimer : null
    if (timer) {
      chime('timer')
      beam('success')
      void vigil.startTimer(timer.goal, timer.ms).then((id) => {
        window.api.showFocus(true)
        // Undone, the words come back into the box as they were typed.
        toast(`Timer set: ${lengthSaid(timer.ms)}${timer.goal === 'Timer' ? '' : ` for ${timer.goal}`}`, () => {
          void vigil.cancelSession(id)
          putDraft(doc)
          fresh(true)
        })
      })
      fresh()
      if (!more) window.api.hideWindow()
      return
    }
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
    // The top edge lights green: kept, without a word.
    beam('success')
    const markdown = editorRef.current ? toMarkdown(editorRef.current) : undefined
    // With the panel open, the note is seen going into the Inbox tab.
    const land = panel ? liftFrom(document.querySelector<HTMLElement>('.mindflow-editor-content'), 'capture') : undefined
    // Taken now: a fresh box clears the list before the save comes back.
    const pieces = [...lifted]
    keepLifted([])
    // ⌥ is Linear's "create more": the box is fresh at once, so the next one
    // can be typed straight away. Otherwise the box leaves and the window goes.
    if (more) {
      // Emptied now, not on the next render: a second ⌘↵ straight after
      // would otherwise read the same words and keep them twice.
      editorRef.current?.commands.clearContent()
      fresh()
      // Said on the button itself, rolling to Saved and back: the box is
      // already fresh for the next one, so nothing else needs to move.
      setSaved(true)
      setTimeout(() => setSaved(false), 1200)
    } else {
      setSending(true)
      // Quit before the box has gone, and it is kept once, not kept and back as a draft.
      localStorage.removeItem('capture-draft')
    }
    void window.api.captures
      .create({ title: '', kind: sorted, elapsedMs: Date.now() - openedAt.current, body: hasContent(doc) ? doc : null, markdown,
        attribution: attribution.trim(), medium: where || undefined, private: secret })
      .then(async (id) => {
        land?.()
        await vigil.linkSession(id)
        // Anything captured out of this note while it was a draft now points
        // back to it, so its lineage holds.
        for (const piece of pieces) await vigil.setCapture(piece, 'origin', id)
        // A link shows as its card, filled in once the page answers.
        if (sorted === 'link') void cardUp({ id, kind: sorted, body: hasContent(doc) ? doc : null })
        if (action) {
          await makeTask({ capture: id }, 'Added to your tasks')
        }
        if (more) return
        // Let the box finish leaving before it is replaced.
        setTimeout(() => {
          setSending(false)
          fresh()
          window.api.hideWindow()
        }, 180)
      }, (error: unknown) => {
        // Not kept: the words must not go with it. Without ⌥ they are still in
        // the box; with it the box was already cleared, so they come back into
        // it, or, if the next note is under way, on a key from the toast.
        keepLifted(pieces)
        if (!more) putDraft(doc)
        setSending(false)
        const why = `Not saved: ${whyFailed(error)}.`
        const restore = (): void => {
          putDraft(doc)
          fresh(true)
        }
        if (!more) return refuse(`${why} Your note is still here.`, 'error')
        if (!latestEditing.current && !hasContent(editorRef.current?.getJSON() ?? null)) {
          restore()
          return refuse(`${why} Your note is back in the box.`, 'error')
        }
        chime('nope')
        toast(why, undefined, 'error', { label: 'Bring it back', key: 'B', run: restore })
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
      // ⌘1 to ⌘9: a kind you already know, without opening the picker.
      const picked = event.metaKey && !event.shiftKey && !event.altKey ? CAPTURE_TYPES[Number(event.key) - 1] : undefined
      if (picked) {
        event.preventDefault()
        chime('settled')
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
    <div className={`app-container ${pointerIn ? 'pointer-in' : ''} isolate flex flex-col items-center justify-center relative flex h-full w-full flex-col pt-10 color-white`}>
      {/* Toasts sit above the box's footer here, clear of Create. */}
      {/* Toasts over the note, above its footer: clear of Create and of the panel. */}
      <div className={`contents [--toast-bottom:6.5rem] ${panel ? '[--toast-right:440px]' : ''}`}><Toaster /></div>
      <NotePreview />
      <ShortcutSheet />
      <Passes onOpen={(type, id) => openAny(type, id)} />
      {readList && (
        <ReadThrough
          items={readList.items}
          start={readList.start}
          onClose={() => setReadList(null)}
          onEdit={(type, id) => {
            setReadList(null)
            openAny(type, id)
          }}
        />
      )}
      {searching && (
        <Search
          initial={searchFrom}
          // Everything the box can do, by name and key, as Raycast's ⌘K lists it.
          actions={searching === 'notes' ? [] : [
            { label: 'New capture', keys: '⌘N', run: () => startOver() },
            { label: 'New question', cue: null, run: () => void startQuestion(openAny) },
            { label: panel ? 'Hide the side panel' : 'Show the side panel', keys: '⌘\\', cue: null, run: () => setPanel(!panel) },
            ...TABS.map((one, index) => ({ label: `Go to ${({ inbox: 'Inbox', today: 'Tasks', review: 'Review', kept: 'Kept', recent: 'Recent' } as Record<string, string>)[one] ?? one}`, keys: `⌃${index + 1}`, run: () => {
              setTab(one)
              if (!panel) setPanel(true)
            } })),
            { label: 'Tidy: a few minutes over the latest captures', run: () => openPass('tidy') },
            { label: 'Decide: the weekly pass over what waited', run: () => openPass('decide') },
            { label: 'Read the inbox from the top', run: () => setReadList({ items: captures.filter((one) => one.status === 'open' && !one.archivedAt).map((one) => ({ type: 'capture', id: one.id })), start: 0 }) },
            { label: 'Copy this note as Markdown', keys: '⇧⌘C', run: copyMarkdown },
            ...(editing ? [{ label: 'Stick this note on the desktop', cue: null, run: () => stickOnDesktop('capture', editing.id) }] : []),
            { label: locked ? 'Unlock this note' : 'Lock this note: read only', cue: locked ? 'off' : 'on', run: () => setLocked(!locked) },
            { label: secret ? 'Make this note not private' : 'Make this note private', cue: editing ? null : secret ? 'off' : 'on', run: () => {
              setSecret(!secret)
              if (editing) void vigil.setPrivate('captures', editing.id, !secret)
            } },
            { label: outline ? 'Hide the outline' : 'Show the outline', cue: outline ? 'off' : 'on', run: () => setOutline(!outline) },
            { label: 'Fold every heading', cue: null, run: () => void (foldEverything(true) || chime('nope')) },
            { label: 'Unfold every heading', cue: null, run: () => void (foldEverything(false) || chime('nope')) },
            { label: source ? 'Hide the source' : 'Show the source', keys: '⌘E', cue: null, run: () => setSource(!source) },
            { label: vim ? 'Turn vim keys off' : 'Turn vim keys on', cue: vim ? 'off' : 'on', run: () => setVim(!vim) },
            { label: appSettings?.sounds ? 'Turn sounds off' : 'Turn sounds on', cue: null, run: () => {
              soundOn(!appSettings?.sounds)
              chime(appSettings?.sounds ? 'off' : 'on')
              void vigil.setSettings({ sounds: !appSettings?.sounds })
            } },
            { label: appSettings?.safeMode ? 'Turn safe mode off' : 'Turn safe mode on', keys: '⌥⌘S', cue: appSettings?.safeMode ? 'off' : 'on', run: () => void vigil.setSettings({ safeMode: !appSettings?.safeMode }).then(() => toast(appSettings?.safeMode ? 'Safe mode off' : 'Safe mode: no hints, rot cards or pins come up')) },
            { label: recordable ? 'Hide from screen recordings' : 'Show in screen recordings', cue: recordable ? 'off' : 'on', run: () => setRecordable(!recordable) },
            { label: reveal ? 'Blur private titles again' : 'Show private titles for now', cue: reveal ? 'off' : 'on', run: () => setReveal(!reveal) },
            { label: 'Open the main window', run: () => window.api.openInHome('view', 'inbox') },
            { label: "Open the week's page", cue: 'season', run: () => window.api.openInHome('view', 'weekpage') },
            { label: "Open the month's page", cue: 'season', run: () => window.api.openInHome('view', 'monthpage') },
            { label: 'Year: your seasons of life, month by month', cue: 'season', run: () => window.api.openInHome('view', 'yearpage') },
            ...noteActions(),
            { label: 'Keyboard shortcuts', keys: '?', run: () => window.dispatchEvent(new CustomEvent('vigil:shortcuts')) },
            { label: 'Import an Obsidian vault or Notion export…', cue: null, run: () => void window.api.importFrom('vault') },
            { label: 'Import Readwise, Kindle, Markdown, bookmarks or Anki…', cue: null, run: () => void window.api.importFrom('files') },
            ...themeActions((text) => toast(text)),
            { label: appSettings?.blur === false ? 'Turn blurring on' : 'Turn blurring off', cue: appSettings?.blur === false ? 'on' : 'off', run: () => void vigil.setSettings({ blur: appSettings?.blur === false }) },
            { label: 'Settings', keys: '⌘,', run: () => window.api.openInHome('view', 'settings') },
            // The recap opens in the main window, over Stats.
            { label: 'Your month, wrapped', run: () => window.api.openInHome('recap', 'month') },
            { label: 'Your year, wrapped', run: () => window.api.openInHome('recap', 'year') }
          ]}
          onClose={() => {
            setSearching(false)
            setSearchFrom('')
          }}
          onOpen={(type, id) => {
            setSearching(false)
            setSearchFrom('')
            openAny(type, id)
          }}
        />
      )}
      <FocusNote />
      <FocusScenery />
      <Header panel={panel} onPanel={() => setPanel(!panel)} nav={trail.stack.length > 1 && (
        // Back and forward, joined in one pill as Safari and Raycast do it.
        <span className="ml-3 flex items-center self-center rounded-full border border-foreground/15 [&_svg]:size-3">
          {([['Back  ⌘[', -1, ChevronLeft], ['Forward  ⌘]', 1, ChevronRight]] as const).map(([label, by, Icon], index) => (
            <Tip key={label} label={label}>
              <button type="button" tabIndex={-1} aria-label={label} disabled={!trail.stack[trail.at + by] && trail.stack[trail.at + by] !== null}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => travel(trail.at + by)}
                className={`flex h-5 w-6 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-35 ${index ? 'border-l border-foreground/15' : ''}`}>
                <Icon className="size-3.5" />
              </button>
            </Tip>
          ))}
        </span>
      )} onNew={() => {
        chime('tap')
        startOver()
      }} title={appSettings?.topTitle === false ? null : topTitle}
      // Safe mode says so beside the pill, or the quiet looks like nothing happening.
      aside={appSettings?.safeMode ? <Tip label="Safe mode: no hints, rot cards or pins come up  ⌥⌘S"><span className="flex h-5 items-center rounded-full bg-accent px-2 text-key leading-none text-[color-mix(in_srgb,var(--tt-brand-color-400)_55%,var(--foreground))]">Safe</span></Tip>
        // Rot cards and reminder pins live in the side panel's Inbox; with the
        // panel shut, a chip up here says they are there, and opens it on them.
        : !panel && (oldCount || pinned.length) ? (
          <Tip label={'Open the Inbox in the side panel  ⌘\\'}>
            <button type="button" data-waiting style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setTab('inbox')
                setPanel(true)
              }}
              className="flex h-5 items-center gap-1 rounded-full bg-accent px-2 text-key leading-none text-muted-foreground hover:text-foreground">
              {oldCount > 0 && <span><Rolling text={oldCount} /> to revisit</span>}
              {oldCount > 0 && pinned.length > 0 && <span>·</span>}
              {pinned.length > 0 && <span><Rolling text={pinned.length} /> waiting</span>}
            </button>
          </Tip>
        ) : null}
      menu={(expanded, toggleExpanded) => (
        <OptionsMenu
          app
          label="Actions"
          icon={<AliveIcon icon={GearIcon} size={14} />}
          side="bottom"
          align="end"
          className="h-6 w-7 flex-none rounded-none hover:bg-accent/60"
          options={[
            { label: 'Vim keys', on: vim, set: setVim },
            { label: 'Show in screen recordings', on: recordable, set: setRecordable },
            { label: 'Show private titles for now', on: reveal, set: setReveal },
            { label: 'Word count', on: counting, set: setCounting }
          ]}
          actions={[
            { label: expanded ? 'Shrink the window' : 'Expand the window', keys: '⌃⇧F', run: toggleExpanded },
            { label: 'Settings', keys: '⌘,', run: () => window.api.openInHome('view', 'settings') }
          ]}
        />
      )} />

      <ResizablePanelGroup
        orientation="horizontal"
        className="w-full h-full"
      >
        <ResizablePanel
          defaultSize="60%"
          minSize={"60%"}
          className="h-full w-full"
        >
          <motion.div ref={column} style={{ x: swipeX }} className="h-full w-full flex flex-col">
            {reading ? (
              <motion.div key={reading.id} initial={{ opacity: 0, x: 10 * cameBy.current }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.1, ease: 'easeOut' }} className="flex min-h-0 flex-1 flex-col">
                <div data-chrome className="flex items-center gap-2 px-[4.25rem] pt-2 text-control text-muted-foreground">
                  <Button variant="ghost" size="sm" onClick={() => setReading(null)}>
                    <ArrowLeft className="size-4" /> Back to your note
                  </Button>
                  <Kbd>Esc</Kbd>
                </div>
                <div className="@container/page flex min-h-0 flex-1">
                  <Reader type={reading.type} id={reading.id} onOpen={openAny} onClose={() => setReading(null)} />
                </div>
              </motion.div>
            ) : (
            <>
            {/* Keyed like the editor, so each note that opens, old or fresh,
                eases in rather than snapping into place. */}
            <motion.div
              key={editing?.id ?? round}
              className="flex min-h-0 flex-1 flex-col"
              // A short fade only: notes are opened all day, so nothing blurs,
              // and it moves only to say which way back or forward went.
              initial={{ opacity: 0, x: 10 * cameBy.current }}
              animate={sending ? { opacity: 0, y: -10, scale: 0.985, filter: 'blur(2px)' } : { opacity: 1, x: 0, y: 0, scale: 1, filter: 'blur(0px)' }}
              transition={{ duration: sending ? 0.18 : 0.1, ease: 'easeOut' }}
            >
            <CapturePrompt
              key={editing?.id ?? round}
              initial={editing?.body ?? readDraft()}
              locked={locked}
              outline={outline}
              onTitleOut={setTopTitle}
              onReady={(editor) => {
                editorRef.current = editor
                words.ready(editor)
              }}
              tokens={boxTokens}
              // A heading in the note already open is gone to here; anywhere else, once it opens.
              onOpenNote={(link, heading) => (heading && link === editing?.id && editorRef.current ? void goToHeading(editorRef.current, heading) : follow(link, (type, id) => openAny(type, id), heading))}
              from={editing?.id}
              onSource={() => setSource((open) => !open)}
              // A tag opens everything carrying it, in search.
              onTag={(tag) => {
                setSearchFrom(`#${tag}`)
                setSearching(true)
              }}
              onChange={(doc, editor) => {
                if (editing?.id !== editingNow.current) return words.save(doc, editor)
                setBody(doc)
                // The kind follows the wording of the first line until you choose one.
                if (!chosen && !editing) setKind((kindOf(firstLine(doc)) ?? 'note') as CaptureType)
                // Only a capture already kept is written as you type; a new note's
                // Markdown is made once, when it is saved, not on every pause.
                if (editing) words.save(doc, editor)
              }}
            />
            {/* Reading another capture with a note half written: the way back
                to it stays in view, so a link followed never loses the draft. */}
            {waiting && (
              <div className="flex items-center gap-2 px-[4.75rem] pt-2 text-xs text-muted-foreground">
                {/* A sentence, so it types in; the key drawn as a key. */}
                <span className="truncate"><Typed text={`Your draft “${(firstLine(waiting) || 'unfinished').slice(0, 32)}${(firstLine(waiting) ?? '').length > 32 ? '…' : ''}” is waiting:`} /></span>
                <span className="flex shrink-0 items-center gap-1"><Pressed keys="⌘[" /> takes you back.</span>
              </div>
            )}
            {/* Under the writing: what it is, who said it and where you met it. */}
            <div data-chrome className="flex items-center gap-1 px-[4.75rem] py-2">
              <OptionsMenu
                label="This note"
                options={[
                  { label: 'Lock: read only', on: locked, set: setLocked },
                  { label: 'Outline', on: outline, set: setOutline },
                  { label: 'Source', on: source, keys: '⌘E', set: setSource },
                  ...(editing ? [{ label: 'Details', on: details, keys: '⇧⌘D', set: setDetails }] : []),
                  { label: 'Private', on: secret, set: (on: boolean) => {
                    setSecret(on)
                    if (editing) void vigil.setPrivate('captures', editing.id, on, true)
                  } }
                ]}
                actions={[{ label: 'New capture', keys: '⌘N', run: () => fresh() }]}
              />
              {/* A todo says what it understood of its first line: the day, the deadline, the priority. */}
              {kind === 'todo' && <TaskChips read={readTask(firstLine(body))} />}
              {/* Only what this kind asks for, unless it already holds something. */}
              {/* Who and where once there is something to say it about, and only
                  what this kind asks for, unless it already holds something. */}
              {((started && ASKS[kind].who) || attribution) && (
                <Remembered field="attribution" value={attribution} placeholder={ASKS[kind].who ?? 'Who'} className="field-sizing-content min-w-16 max-w-48 px-1.5 py-0.5 text-meta" onChange={(value) => {
                  setAttribution(value)
                  if (editing) void vigil.setCapture(editing.id, 'attribution', value.trim() || null)
                }} />
              )}
              {((started && ASKS[kind].where) || medium) && (
                <Remembered field="medium" value={medium} placeholder={ASKS[kind].where ?? 'Where'} className="field-sizing-content min-w-16 max-w-48 px-1.5 py-0.5 text-meta" onChange={(value) => {
                  setMedium(value)
                  if (editing) void vigil.setCapture(editing.id, 'medium', value.trim() || null)
                }} />
              )}
              {/* Private shows only when it is on; it is switched in Options. */}
              {secret && (
                <Tip label="Private: blurred in lists, never a hint. Click to make it public">
                  <Button variant="ghost" size="icon-sm" aria-label="Private" aria-pressed onClick={() => {
                    setSecret(false)
                    if (editing) void vigil.setPrivate('captures', editing.id, false)
                  }}>
                    <EyeOff />
                  </Button>
                </Tip>
              )}
              {ASKS[kind].why && textOf(body).trim().split('\n').filter(Boolean).length < 2 && (
                <span className="truncate px-1.5 text-xs text-muted-foreground/70"><Typed text={ASKS[kind].why} /></span>
              )}
              {/* "+name": which question the clue will go into, said before you send. */}
              {plus && (
                <span className="ml-auto flex max-w-72 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground animate-in fade-in-0 zoom-in-95 duration-200">
                  <Orbit className="size-3.5 shrink-0" />
                  <span className="truncate"><Rolling by="word" text={plus.question ? `A clue for “${plus.question.title}”` : held.length ? `No question matches “${plus.name}”: it will be a capture` : 'No questions held yet: it will be a capture'} /></span>
                </span>
              )}
              {like && !plus && (
                <Tip label={`Open it: ${like.title}`}>
                <button
                  type="button"
                  onClick={() => openCapture(like.id)}
                  // Hard to miss but not loud: a brand-tinted chip whose words
                  // roll in when a match arrives, and roll over when it changes.
                  className="group/like ml-auto flex max-w-64 cursor-pointer items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--tt-brand-color-400)_35%,transparent)] bg-[color-mix(in_srgb,var(--tt-brand-color-400)_12%,transparent)] px-2.5 py-0.5 text-xs text-foreground animate-in fade-in-0 zoom-in-95 duration-200 hover:bg-[color-mix(in_srgb,var(--tt-brand-color-400)_20%,transparent)]"
                >
                  {/* Still, not pulsing: it turns up while you write, and a beat that never stops pulls the eye off the words. */}
                  <span className="size-1.5 shrink-0 rounded-full bg-[var(--tt-brand-color-400)]" />
                  <span className="truncate"><Rolling by="word" text={`Similar to MF-${like.number}`} /></span>
                  {/* Says it goes somewhere: an arrow that leans further on hover. */}
                  <ArrowUpRight className="size-3.5 shrink-0 text-[var(--tt-brand-color-400)] transition-transform group-hover/like:translate-x-0.5 group-hover/like:-translate-y-0.5" />
                </button>
                </Tip>
              )}
            </div>
            {/* The questions kept in view, once there is something to match against them. */}
            {started && !plus && !focus && <div data-chrome className="px-[4.75rem] pb-1"><PinnedQuestions onPick={clueToPinned} /></div>}
            {/* A hint sits at the foot of the box: a glance at something you
                wrote once, while you are here to write. Usually empty. */}
            <div data-chrome className="px-[4.75rem]">
              {!focus && <HintCard onOpen={openAny} />}
            </div>
            </motion.div>
            </>
            )}
            {!reading && (
            <main data-chrome className="flex items-center gap-1 pt-2 pb-3 px-[4.75rem] bg-linear-to-t from-[var(--accent)]/40">
              {/* What matters first is the writing and Create; every other
                  switch is in here, each keeping its own key. */}
              <CaptureKindPicker
                suggested={!chosen && kind !== 'note'}
                value={kind}
                onChange={pick}
              />
              <span className="flex-1" />
              {/* Beside Create, as in Linear: on, a save keeps the box open for the next one. */}
              {!editing && (
                <Tip label="Keep the box open after each save  ⌥C">
                <label className="mr-2 flex cursor-pointer items-center gap-2 text-control text-muted-foreground">
                  <Switch size="sm" checked={createMore} onCheckedChange={setCreateMore} tabIndex={-1} />
                  Create more
                </label>
                </Tip>
              )}
              {/* The button shows its own words and ⌘↵: the tip says only what it does not. */}
              <Tip label={createMore && !editing ? 'A fresh box for the next' : (editing ? 'Back to your draft: changes already save as you make them' : 'With a fresh box after  ⌥⌘↵')}>
              <Button variant="secondary" onClick={() => submit()} className="text-control">
                {/* Open on a saved note: closing it, since changes already save. */}
                <Rolling text={editing ? 'Close note' : saved ? 'Saved' : plus?.question ? 'Add clue' : 'Create'} /> <kbd className="font-sans text-key opacity-70">⌘↵</kbd>
              </Button>
              </Tip>
            </main>
            )}
          </motion.div>
          <SourceDrawer open={source} doc={body} onOpenChange={setSource} />
          {editing && <DetailsDrawer open={details} id={editing.id} captures={captures} onOpenChange={setDetails} onOpen={openAny} />}
        </ResizablePanel>

        {!focus && panel && <ResizableHandle withHandle />}
        {!focus && panel && (
          <ResizablePanel defaultSize="40%" minSize={"30%"}>
            <SidePanel tab={tab} setTab={setTab} captures={captures} editing={editing?.id} onOpen={openCapture} onOpenAny={openAny} reading={reading?.id} onRead={(items, start) => setReadList({ items, start })} />
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
    // The editor marks every Escape as handled, so whether it was spent is
    // read before it gets there: in the editor, Escape hides the window only
    // when nothing else would take it (no menu open, no words selected, and
    // vim, if on, already at rest in normal mode).
    let free = false
    const before = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      const editor = (event.target as Element | null)?.closest?.('.ProseMirror')
      if (!editor) return void (free = false)
      const mode = editor.getAttribute('data-vim-mode')
      free = (!mode || mode === 'normal') && (window.getSelection()?.isCollapsed ?? true) &&
        !document.querySelector('[role=menu], [role=listbox], [role=dialog], .tiptap-suggestion-popup, [cmdk-root]')
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (event.defaultPrevented && !free) return
      free = false
      window.api.hideWindow()
    }
    window.addEventListener('keydown', before, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', before, true)
      window.removeEventListener('keydown', onKey)
    }
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
/**
 * An open capture's details in the prompt, the same panel the main window
 * shows beside it: exits, kind, surfacing, who and where, lineage, merge,
 * reminder and date, and the words as first written.
 */
function DetailsDrawer({ open, id, captures, onOpenChange, onOpen }: {
  open: boolean
  id: string
  captures: CaptureMeta[]
  onOpenChange: (open: boolean) => void
  onOpen: (type: string, id: string) => void
}): React.JSX.Element | null {
  const capture = captures.find((one) => one.id === id)
  const original = useLive(() => window.api.captures.get(id).then((found) => found?.original ?? null), null as unknown, [id])
  if (!capture) return null
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="gap-0 overflow-y-auto p-0"
        // Back to the writing, so the next Escape is the editor's, not a hide.
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.querySelector<HTMLElement>('.tiptap.ProseMirror')?.focus()
        }}
      >
        <SheetHeader className="border-b p-4">
          <SheetTitle className="text-sm">Details</SheetTitle>
          <SheetDescription className="sr-only">What can be done with this capture, and where it came from.</SheetDescription>
        </SheetHeader>
        <div>
          <CaptureProps capture={capture} onOpen={onOpen} className="w-full border-l-0 p-2 pt-3" />
          {original !== null && original !== undefined && (
            <div className="mx-4 mt-3 border-t pt-3">
              <p className="mb-1 text-meta text-muted-foreground">As first written</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{textOf(original as JSONContent)}</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

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
    <SheetContent side="right" className="gap-0 p-0"
      // Closed, the keys go back to the writing, so ⌘E opens it again.
      onCloseAutoFocus={(event) => {
        event.preventDefault()
        document.querySelector<HTMLElement>('.tiptap.ProseMirror')?.focus()
      }}
      // ⌘E closes it as it opened it.
      onKeyDown={(event) => {
        if (event.metaKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'e') {
          event.preventDefault()
          onOpenChange(false)
        }
      }}
    >
      <SheetHeader className="border-b p-4">
        <SheetTitle className="text-sm">Source</SheetTitle>
        <SheetDescription className="sr-only">
          The note as the editor last handed it over.
        </SheetDescription>
      </SheetHeader>
      {/* What the note uses, before what it is: its tags, and the files a
          backup has to carry with it. */}
      {doc && (tagsOf(doc).length > 0 || assetsOf(doc).length > 0) && (
        <div className="space-y-3 border-b p-4 text-xs">
          {tagsOf(doc).length > 0 && (
            <div>
              <p className="mb-1 text-muted-foreground">Tags</p>
              <p>{tagsOf(doc).map((tag) => `#${tag.value}${tag.count > 1 ? ` ×${tag.count}` : ''}`).join('  ')}</p>
            </div>
          )}
          {assetsOf(doc).length > 0 && (
            <div>
              {/* What the note holds besides words, as you would know them: a
                  picture by its look, a file by its name. The store names
                  them by a hash of their bytes, which means nothing to read. */}
              <p className="mb-1 text-muted-foreground">Pictures and files</p>
              <ul className="flex flex-wrap gap-2">
                {assetsOf(doc).map((asset) => (
                  <li key={asset.src} className="flex min-w-0 items-center gap-2">
                    {asset.kind === 'image'
                      ? <img src={asset.src} alt="" className="size-12 rounded-md border object-cover" />
                      : <span className="max-w-48 truncate rounded-md border px-2 py-1">{asset.name ?? 'File'}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <pre className="flex-1 overflow-auto p-4 text-xs leading-relaxed break-words whitespace-pre-wrap">
        {doc ? JSON.stringify(doc, null, 2) : ''}
      </pre>
    </SheetContent>
  </Sheet>
)

/** Captures lifted out of the note being written, waiting for it to be saved. */
// Kept beside the draft, so quitting with a draft does not lose its links.
const lifted: string[] = (() => {
  try {
    return JSON.parse(localStorage.getItem('capture-lifted') ?? '[]') as string[]
  } catch {
    return []
  }
})()
const keepLifted = (ids: string[]): void => {
  lifted.splice(0, lifted.length, ...ids)
  localStorage.setItem('capture-lifted', JSON.stringify(lifted))
}

const CapturePrompt = ({
  initial,
  locked,
  outline,
  onChange,
  onReady,
  onOpenNote,
  from,
  onSource,
  onTag,
  onTitleOut,
  tokens = TAGS
}: {
  onSource: () => void
  /** What the editor lights up: tags, and a todo's date and priority words. */
  tokens?: TokenPattern[]
  /** The first line went out of sight (its words), or came back (null). */
  onTitleOut: (title: string | null) => void
  onTag: (tag: string) => void
  /** The capture open in the box, if any: what a selection lifted out of it points back to. */
  from?: string
  initial?: JSONContent
  locked: boolean
  outline: boolean
  onChange: (doc: JSONContent, editor: Editor) => void
  onReady: (editor: Editor) => void
  onOpenNote: (id: string, heading?: string) => void
}): React.JSX.Element => {
  useEscapeToHide()


  return (
    // mf-faded: the note fades out at its top and bottom edges as it scrolls,
    // the way Raycast Notes reads, instead of being cut by a hard line.
    <div className="mf-faded relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-b-3xl border-b shadow-xl"
      style={{ transform: 'translate(0,0)' }}>

      {/* The same, spelled out. See `docs/components.md` for what each one
          does and what it is when you leave it out. */}
      <MindflowEditor
        shape="document"
        placeholder="Type / for commands…"
        defaultContent={initial}
        tokens={tokens}
        onTokenClick={(token) => token.name === 'tag' && onTag(token.value)}
        onToggleSource={onSource}
        // documentId={note ? `doc-${note.id}` : null}
        foldKey={from ? `capture-${from}` : undefined}

        // --- what is switched on ---
        // No fixed toolbar: the dock would sit over the capture prompt. The
        // selection toolbar keeps its default contents.
        toolbar={{ fixed: false, selectionExtra: selectionActions({ captureId: from, from, onLifted: (id) => keepLifted([...lifted, id]) }) }}
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
        findHeadings={findHeadings}
        onOpenNote={onOpenNote}
        onTitleOut={onTitleOut}
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
type Tab = 'inbox' | 'today' | 'review' | 'kept' | 'recent'
const TABS: Tab[] = ['inbox', 'today', 'review', 'kept', 'recent']

function SidePanel({ captures, editing, onOpen, onOpenAny, reading, onRead, tab, setTab }: {
  tab: Tab
  setTab: (tab: Tab) => void
  /** Read through a list, from a place in it. */
  onRead: (items: Readable[], start: number) => void
  captures: CaptureMeta[]
  editing?: string
  onOpen: (id: string) => void
  /** A task, nugget or article, opened in the prompt. */
  onOpenAny: (type: string, id: string) => void
  reading?: string
}): React.JSX.Element {
  // Which tab is open is the window's to keep: ⌃1 to ⌃4 open the panel on one.
  // Today and Review are worked by keys, so the capture box lets go of them
  // there; typing goes back to the box on the Inbox tab or a click into it.
  useEffect(() => {
    if (tab !== 'inbox') (document.activeElement as HTMLElement | null)?.blur()
  }, [tab])
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  const [stripSlot, setStripSlot] = useState<HTMLDivElement | null>(null)
  // The tab going away stays a moment while the new one is already there, so
  // its slot and scroller let go only if they are still the ones in use.
  const keep = (set: typeof setScroller) => (node: HTMLDivElement | null) => {
    set(node)
    return () => set((now) => (now === node ? null : now))
  }
  const holdSlot = useCallback(keep(setStripSlot), []) // eslint-disable-line react-hooks/exhaustive-deps
  const holdScroller = useCallback(keep(setScroller), []) // eslint-disable-line react-hooks/exhaustive-deps
  // Which way the lists travel: a tab to the right slides in from the right,
  // one to the left from the left, the way the tabs sit in their row.
  const lastTab = useRef(tab)
  const travel = useRef(1)
  if (lastTab.current !== tab) {
    travel.current = Math.sign(TABS.indexOf(tab) - TABS.indexOf(lastTab.current)) || 1
    lastTab.current = tab
  }
  // The same easing as the main window's lists.
  useSmooth(scroller)
  const due = useLive(() => window.api.vigil('review:counts') as Promise<number>, 0, [], ['item'])
  // Each tab counts what it holds, so a thing sent there visibly arrives:
  // what is due today (as the main window's Today counts it), every nugget
  // and article.
  const openTasks = useLive(
    () => vigil.tasks().then((tasks) => {
      // The same count as the Today list: scheduled or due by today.
      const end = new Date().setHours(24, 0, 0, 0)
      return tasks.filter((task) => task.status === 'open' && !task.waitingOn && (placed(task) ?? Infinity) < end).length
    }),
    0
  )
  // Archived ones are out of sight, so not counted.
  // Questions held open count as kept too; settled ones do not.
  const kept = useLive(() => Promise.all([vigil.items('nugget'), vigil.items('article'), vigil.items('question')]).then((all) => all.flat().filter((one) => !one.archivedAt && !one.closedAt).length), 0, [], ['item'])
  // The inbox is what has no exit yet; what is handled lives in All captures.
  const open = captures.filter((capture) => capture.status === 'open' && !capture.archivedAt)
  // The same Display menu as the main window's inbox: filter, sort, group.
  // Every capture, starting on those with no exit: Display's Status reaches
  // the handled and discarded ones without leaving the prompt.
  const { groups, display, chips, density } = useCaptureDisplay('prompt:captures', captures, { status: ['open'] })
  const shown = groups.flatMap(([, list]) => list)
  // x picks several, the way it does in the main window, for one exit on all.
  const [chosen, setChosen] = useState<string[]>([])
  const shownNow = useRef(shown)
  shownNow.current = shown
  // Only what is waiting on you is counted: the inbox is somewhere to set
  // things down, reassurance, never a queue with a number on it.
  const counts: Partial<Record<Tab, number>> = { today: openTasks, review: due, kept }
  // The tabs you keep (Settings, or a right click on the row); one reached by
  // its key or ⌘K shows while it is open.
  const shownTabs = useShown('boxTabs')
  const tabs = BOX_TABS.filter((one) => shownTabs.includes(one.id) || one.id === tab) as (Place & { id: Tab })[]
  // The same keys as every list: j and k when the editor does not have the
  // focus, Enter to open. ⌃1 to ⌃4 switch tabs from anywhere in the window.
  const [cursor, setCursor] = useListKeys(shown.length, { onOpen: (index) => onOpen(shown[index].id), enabled: tab === 'inbox' })
  // On the row under the cursor: x picks it, and P, R and D take the exit the
  // right-click menu shows them beside.
  useEffect(() => {
    if (tab !== 'inbox') return
    const onKey = (event: KeyboardEvent): void => {
      if (typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      // A focused card takes its own P, R and D.
      if ((event.target as Element | null)?.closest?.('[data-card]')) return
      if (event.key === 'Escape' && chosen.length) {
        event.preventDefault()
        chime('off')
        return setChosen([])
      }
      const row = shownNow.current[cursor]
      if (!row) return
      if (event.key === 'x') return setChosen((ids) => (chime(ids.includes(row.id) ? 'off' : 'on'), ids.includes(row.id) ? ids.filter((one) => one !== row.id) : [...ids, row.id]))
      const one = EXITS.find((e) => e.key === event.key)
      if (one && row.status === 'open') void exit(row.id, one.status)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [tab, cursor, chosen.length])
  // ⇧⌘R reads through the inbox as it is shown, from the row under the cursor.
  useReadKey(() => onRead(shownNow.current.map((one) => ({ type: 'capture', id: one.id })), startAt(shownNow.current, editing, cursor)), shown.length, tab === 'inbox')
  const bulk = (status: string): void => {
    const ids = chosen
    setChosen([])
    void Promise.all(ids.map((id) => window.api.captures.save(id, { status }))).then((results) => {
      // Only captures still in the inbox take an exit; the undo puts back only
      // what this changed, each to the status it had.
      const moved = ids.flatMap((id, at) => (results[at]?.refused ? [] : [{ id, was: (results[at]?.was ?? 'open') as 'open' }]))
      if (!moved.length) return refuse('Nothing changed: none of the picked captures is still in the inbox')
      chime(status === 'discarded' ? 'away' : 'resolve')
      toast(`${status[0].toUpperCase()}${status.slice(1)} ${num(moved.length)}`, () => void Promise.all(moved.map((one) => window.api.captures.save(one.id, { status: one.was }))))
    })
  }

  return (
    <div className="relative flex h-full w-full flex-col p-2">
      {/* Right click the row to show or hide a tab; the last one stays. */}
      <RowMenu items={BOX_TABS.filter((one) => !(shownTabs.length === 1 && shownTabs[0] === one.id)).map((one) => {
        const on = shownTabs.includes(one.id)
        return { label: `${on ? 'Hide' : 'Show'} ${one.label}`, run: () => void vigil.setSettings({ boxTabs: on ? shownTabs.filter((id) => id !== one.id) : [...shownTabs, one.id] }).then(() => chime(on ? 'off' : 'on')) }
      })}>
      <div data-hover-quiet className="mb-2 flex gap-1 rounded-lg border border-foreground/10 bg-accent/40 p-0.5 text-sm">
        {tabs.map((one) => (
          <Tip key={one.id} label={`⌃${TABS.indexOf(one.id) + 1}`}>
          <button
            type="button"
            // Where a promoted capture or a new task flies to.
            data-home={one.id === 'kept' ? 'nugget question' : one.id === 'today' ? 'task' : one.id === 'inbox' ? 'capture' : undefined}
            onClick={() => {
              if (tab !== one.id) chime('tap')
              setTab(one.id)
            }}
          
            className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-md py-1 transition-colors ${tab === one.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {/* One pill that slides between tabs rather than three that blink. */}
            {tab === one.id && (
              <motion.span layoutId="prompt-tab" className="absolute inset-0 -z-10 rounded-md border border-foreground/15 bg-background shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
            )}
            {one.label}
            {counts[one.id] ? <span className="text-xs tabular-nums text-muted-foreground"><Rolling text={counts[one.id]!} /></span> : null}
          </button>
          </Tip>
        ))}
      </div>
      </RowMenu>
      {/* Never waits for the old tab to leave: ⌃1 ⌃2 ⌃3 pressed fast lands
          at once, and a spring turned around mid-way simply heads back. */}
      <AnimatePresence mode="popLayout" initial={false} custom={travel.current}>
      <motion.div
        key={tab}
        custom={travel.current}
        variants={{
          from: (by: number) => ({ opacity: 0, x: 12 * by }),
          here: { opacity: 1, x: 0 },
          // The old tab gets out of the way fast, so the two barely overlap.
          gone: (by: number) => ({ opacity: 0, x: -12 * by, pointerEvents: 'none', transition: { opacity: { duration: 0.07 }, x: { type: 'spring', stiffness: 700, damping: 50 } } })
        }}
        initial="from"
        animate="here"
        exit="gone"
        transition={{ type: 'spring', stiffness: 700, damping: 50, mass: 0.6 }}
        className="flex min-h-0 flex-1 flex-col"
      >
        {/* Two kinds of thing, two places: what is waiting on you stays put,
            and only your captures scroll under it. Its shadow is the capture
            box's own, cut to fall only below it. */}
        {tab === 'inbox' && (
          <div className="relative z-10 shrink-0 shadow-xl [clip-path:inset(0_0_-3rem_0)]">
            <Pins onOpen={onOpenAny} />
            <PassLinks className="px-1 pb-1" />
            <RotCards onOpen={onOpen} />
          </div>
        )}
        {/* Each list's top bar lands here, above the scrolling, never over rows. */}
        <div ref={holdSlot} className="shrink-0" />
        <StripSlot.Provider value={stripSlot}>
        <div ref={holdScroller} className="min-h-0 flex-1 overflow-y-auto pr-1">
          {/* One child, which is what the easing moves. */}
          <div className="flex min-h-full flex-col">
            {tab === 'inbox' ? (
              <>
                {/* Above the list, not over it: what you are looking at, and what you can do with it. */}
                <Strip className="flex h-8 shrink-0 items-center gap-1 px-1 pl-2 text-control text-muted-foreground">
                  {chosen.length ? (
                    <>
                      <span className="mr-auto"><Rolling text={chosen.length} /> selected</span>
                      <Button variant="ghost" size="sm" onClick={() => bulk('resolved')}>Resolve</Button>
                      <Button variant="ghost" size="sm" onClick={() => bulk('discarded')}>Discard</Button>
                      {chosen.length > 1 && (
                        <Button variant="ghost" size="sm" onClick={() => void ask(`One task from these ${num(chosen.length)}. What is it?`, 'e.g. sort out the freight rules by Thursday').then((text) => {
                          if (!text) return
                          const ids = chosen
                          setChosen([])
                          void makeTask({ captures: ids, text }, `One task, from ${num(ids.length)} captures`)
                        })}>One task</Button>
                      )}
                      <Tip label="Let them go  Esc">
                      <Button variant="ghost" size="icon-sm" onClick={() => setChosen([])} aria-label="Clear the selection"><X className="size-3.5" /></Button>
                      </Tip>
                    </>
                  ) : (
                    <>
                      <Tip label="Every capture with no exit yet; the sort and view menu (F) shows the rest under Status. x selects several.">
                        <h3 className="w-fit">{shown.length === open.length ? 'Inbox' : `${num(shown.length)} shown`}</h3>
                      </Tip>
                      <Tip label="One note at a time, full screen, from the highlighted one  ⇧⌘R">
                        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => onRead(shown.map((one) => ({ type: 'capture', id: one.id })), startAt(shown, editing, cursor))}>
                          <AliveIcon icon={BookIcon} size={14} /> Read through
                        </Button>
                      </Tip>
                      <span>{display}</span>
                    </>
                  )}
                </Strip>
                <div className="px-1 pb-1 empty:hidden">{chips}</div>
                {shown.length > 0 && <CaptureList groups={groups} density={density} selected={editing} cursor={cursor} onCursor={setCursor} chosen={chosen} onPick={onOpen} />}
                {!shown.length && (
                  open.length ? (
                    <Empty compact shape={['ellipse', 3]} title="Nothing matches">The filters hide everything here. Clear them with the × above, or press F to change them.</Empty>
                  ) : (
                    <Rest compact seed="inbox"><Empty compact shape={['flower', 2]} title={captures.length ? 'Nothing waiting' : 'Nothing caught yet'}>{captures.length ? 'Every capture has taken its exit. Write the next thought on the left.' : 'Write a thought on the left and send it with ⌘↵: it waits here.'}</Empty></Rest>
                  )
                )}
              </>
            ) : tab === 'today' ? (
              <TodayPanel onOpen={(id) => onOpenAny('task', id)} open={reading} />
            ) : tab === 'kept' ? (
              <KeptPanel onOpen={onOpenAny} open={reading} onRead={onRead} />
            ) : tab === 'recent' ? (
              <RecentPanel className="flex-1 [&>header]:h-8 [&>header]:border-0 [&>header]:px-2" onOpen={onOpenAny} />
            ) : (
              <div className="flex flex-1 [&_header]:hidden">
                <ReviewView compact />
              </div>
            )}
          </div>
        </div>
        </StripSlot.Provider>
      </motion.div>
      </AnimatePresence>
      <BackToTop target={scroller} />
    </div>
  )
}



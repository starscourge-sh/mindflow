import { themeActions } from '@/lib/theme'
import { useStickiesOut } from '@/lib/stickies-out'
import { useAbandonAction } from '@/lib/abandon'
import React, { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { cardUp, cardsUp } from './lib/link-card'
import { AnimatePresence, motion } from 'motion/react'
import { useSwipeBack } from './lib/use-swipe-back'
import { EASE, byKeys, shift } from './lib/motion'
import { alive } from '@/components/ui/alive-icon'
import ArrowNarrowLeftIcon from '@/components/ui/arrow-narrow-left-icon'
import ExternalLinkIcon from '@/components/ui/external-link-icon'
import RightChevronIcon from '@/components/ui/right-chevron'
import EyeOffIcon from '@/components/ui/eye-off-icon'
import CameraIcon from '@/components/ui/camera-icon'
import CameraOffIcon from '@/components/ui/camera-off-icon'
import XIcon from '@/components/ui/x-icon'
import type { Editor, JSONContent } from '@tiptap/core'

import { convertImports } from './lib/convert-imports'
import { MindflowEditor, TAGS, currentVim, foldEverything, goToHeading, onVimChange, setVim } from './components/mindflow'
import { settleVim } from './lib/vim'
import { EXITS, exit, findCaptures, findHeadings, follow } from './lib/capture-links'
import { toMarkdown } from './lib/export'
import { useSameWords } from './lib/same-words'
import { CaptureList, tagCaptures, useCaptures, type CaptureMeta } from './components/capture-list'
import { Example } from './components/vigil/example'
import { exampleInbox } from './lib/examples'
import { RotCards, textOf } from './components/rot-cards'
import { HintCard } from './components/hint-card'
import { Pins } from './components/pins'
import { TodayPanel } from './components/vigil/today-panel'
import { selectionActions } from './components/vigil/selection-actions'
import { ReviewView } from './components/vigil/review-view'
import { SessionFooter } from './components/vigil/session-footer'
import { unloaded, useAppearance, useLive } from './lib/vigil'
import { allRecorded, moveOldRecordable, recordAll } from './lib/recordings'
import { BackToTop, Empty, Kbd, Remembered, Strip, StripSlot, typing, useListKeys, useReadKey, useSmooth, FocusNote, useFocusMode, startAt } from './components/vigil/ui'
import { TooltipProvider } from './components/ui/tooltip'
import { Rolling, Toaster, Typed, beam, refuse, toast, useWorking, whyFailed } from './components/vigil/ui'
import { Reader } from './components/vigil/reader'
import { OptionsMenu } from './components/vigil/options-menu'
import { ReadThrough, type Readable } from './components/vigil/read-through'
import { PassLinks, Passes, openPass } from './components/vigil/pass'
import { assetsOf } from './lib/document'
import { tagsOf, type TokenPattern } from './extensions/tokens'
import { KeptPanel } from './components/vigil/kept-panel'
import { startQuestion } from './components/vigil/questions-view'
import { clueInto } from './components/vigil/pinned-questions'
import { logInto } from './components/vigil/goals-view'
import { BoxOffers } from './components/vigil/box-offers'
import { RecentPanel } from './components/vigil/recent-panel'
import { BOX_TABS, dropOrder, orderItems, useInOrder, useOrder, useShown, type Place } from './components/vigil/places'
import { SortableList, SortableRow } from './components/vigil/sortable'
import { RowMenu } from './components/vigil/row-menu'
import { CaptureProps, useCaptureDisplay } from './components/vigil/captures-view'
import { Search } from './components/search'
import { InboxBinned, InboxZero, useJustCleared } from './components/vigil/inbox-zero'
import { keepTyped } from './lib/keep-typed'
import { notePromoted } from './lib/promote'
import { noteActions, useOpenNote } from './lib/notes'
import { vigil, type Item, type PinnedQuestion, type Settings } from './lib/vigil'
import { markFromBox } from './lib/milestones'
import { makeListTasks, makeTask, makeTasks, oneTask, picked } from './lib/tasks'
import { boxKind, boxList } from './lib/line-tasks'
import { openSort } from './lib/sort-out'
import { tasksSaid } from '../../main/day-lines'
import { useSelectAll } from './lib/select-all'
import { binItem, moveToBin } from './lib/to-bin'
import TrashIcon from './components/ui/trash-icon'
import { WillDo, TokenHint } from './components/vigil/will-do'
import { boxTokensPlugin, keepPlain, keptMessage, planNow, rearm, replan, type BoxContext, type BoxPlan, type BoxToken } from './lib/box-tokens'
import { chime, soundOn } from './lib/sound'
import { crumpleFrom, liftFrom } from './lib/fly-home'
import { lengthSaid } from './lib/timer'
import { stickOnDesktop } from './components/vigil/sticky-note'
import { NotePreview } from './components/vigil/note-preview'


import { CAPTURE_TYPES, CaptureKindPicker, asksFor, type CaptureType } from './components/capture-kinds/capture-kind-picker'
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
import { Celebrations } from '@/components/vigil/celebrate'
import { Mentions } from '@/components/vigil/mentions'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import BookIcon from '@/components/ui/book-icon'
import LayoutSidebarRightIcon from '@/components/ui/layout-sidebar-right-icon'
import GearIcon from '@/components/ui/gear-icon'
import PenIcon from '@/components/ui/pen-icon'
import { AliveIcon } from '@/components/vigil/alive-icon'
import { useStoredFlag } from '@/lib/use-stored-flag'
import { ShortcutSheet } from '@/components/vigil/shortcut-sheet'
import { WordNotes } from '@/components/vigil/term'
import { FocusScenery, Rest } from './components/vigil/scenery'
import { num } from '../../main/dates'
import { holdKeys, useLesson, useWelcomePlaceholder } from './lib/welcome-box'
import { SandboxChip } from '@/components/vigil/sandbox'
import { DefineGhost, defineable, fixIn, useDefinition } from '@/components/vigil/word-define'
import { notes } from './lib/notes'
import { useFitBox } from './lib/fit-box'
import { menuShowing } from '@/lib/menu-keys'
import HashtagIcon from '@/components/ui/hashtag-icon'

// itshover drawings in lucide's place, moving when their control is pointed at.
const ArrowLeft = alive(ArrowNarrowLeftIcon)
const ArrowUpRight = alive(ExternalLinkIcon)
const ChevronLeft = alive(RightChevronIcon, 'rotate-180')
const ChevronRight = alive(RightChevronIcon)
const EyeOff = alive(EyeOffIcon)
const Hashtag = alive(HashtagIcon)
const X = alive(XIcon)



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

/** The box's width, and what the side panel adds: the same numbers as WIDTH and WITH_PANEL in the main process. */
const BOX_WIDTH = 640
const PANEL_WIDTH = 440

const Header = ({ panel, drawn, onPanel, onNew, menu, nav, title, aside }: {
  panel: boolean
  /** The panel is on screen, or still gliding away. */
  drawn: boolean
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

  // How wide the chip and the pill are at the right, so the title stops short of them.
  const top = useRef<HTMLSpanElement>(null)
  const [room, setRoom] = useState(0)
  useEffect(() => {
    const at = top.current
    if (!at) return
    const measure = (): void => setRoom(Math.max(at.offsetWidth, at.querySelector<HTMLElement>('.mf-pill')?.offsetWidth ?? 0))
    const watch = new ResizeObserver(measure)
    watch.observe(at)
    return () => watch.disconnect()
  }, [])

  return (
    <div className="h-fit fixed top-0 right-0 left-0 z-10 flex flex-col items-center py-2 text-xs cursor-pointer" style={{ WebkitAppRegion: 'drag' }}>
      {/* Over the panel, the icons end where the panel's own edge does; the
          move there takes the window's glide, its length and its curve. */}
      <div className="relative flex w-full items-center gap-1 transition-[padding] duration-[240ms] ease-[cubic-bezier(0.165,0.84,0.44,1)] motion-reduce:transition-none"
        style={{ padding: panel ? '0 0.75rem 0 4.75rem' : '0rem 4.75rem' } as CSSProperties}>
        <WindowDots />
        <span style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>{nav}</span>
        {/* The note's name, faint, once its first line has scrolled away, so
            a long note still says what it is: centred over the writing, a
            short line at most, never over the side panel or the window dots. */}
        <span className="flex-1" />
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center" style={{ ...(drawn ? { width: BOX_WIDTH } : { right: 0 }), paddingInline: drawn ? 160 : Math.max(160, room + 84) }}>
        <AnimatePresence>
          {title && (
            <motion.span
              key="title"
              initial={{ opacity: 0, transform: shift('translateY(4px)') }}
              animate={{ opacity: 1, transform: shift('translateY(0px)') }}
              // Out quicker than in: it gets out of the way of the line coming back.
              exit={{ opacity: 0, transform: shift('translateY(-4px)'), transition: { duration: 0.1, ease: EASE } }}
              transition={{ duration: 0.16, ease: EASE }}
              className="pointer-events-none min-w-0 max-w-[34ch] truncate text-control text-muted-foreground/70"
            >
              {title}
            </motion.span>
          )}
        </AnimatePresence>
        </span>
        {/* One pill for the window's controls, there while the pointer is,
            the way Raycast Notes keeps them: a new note, the actions, the
            panel. The strip is the window's drag handle, so the pill has to
            say it is not, or no click lands. Out of the tab order: these are
            window controls, not part of the note. Expand is in the actions. */}
        {/* The chip sits where the pill will be while the pill is away, and
            steps aside for it when the pointer comes in, so it never floats
            beside an empty space. */}
        {/* In turn, never on top of each other: coming in, the chip steps
            aside and then the pill fades in; going out, the pill fades first. */}
        <span ref={top} className="mf-top relative flex items-center">
        {aside && <span data-aside className="transition-[margin] delay-150 duration-150 [.mf-top:has([data-state=open])_&]:mr-[calc(5.5rem+0.25rem)] [.mf-top:has([data-state=open])_&]:delay-0 [.pointer-in_&]:mr-[calc(5.5rem+0.25rem)] [.pointer-in_&]:delay-0">{aside}</span>}
        <span
          className="mf-pill absolute right-0 flex items-center overflow-hidden rounded-full border border-foreground/15 bg-[color-mix(in_oklab,var(--background)_max(60%,var(--mf-window-tint,20%)),transparent)] opacity-0 transition-opacity duration-150 [.pointer-in_&]:opacity-100 [.pointer-in_.mf-top:has([data-aside])_&]:delay-150 has-[[data-state=open]]:opacity-100 [&>*+*]:border-l [&>*+*]:border-foreground/15"
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        >
          <Tip label="New capture  ⌘N">
            <button type="button" tabIndex={-1} aria-label="New capture" className="flex h-6 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              onMouseDown={(event) => event.preventDefault()} onClick={onNew}>
              <AliveIcon icon={PenIcon} size={14} />
            </button>
          </Tip>
          <span className="flex h-6 w-7 items-center justify-center">{menu(expanded, toggle)}</span>
          <Tip label={`${panel ? 'Hide' : 'Show'} Inbox, Tasks, Review, Saved and Recent  ⌘\\`}>
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
      <div data-lesson="hide" className="mt-2 w-full shadow-xl px-[4.75rem]">
        <div className="h-[2px] w-full bg-background/10 shadow-xl" />
      </div>
    </div>
  )
}

/** A key held back in the welcome, said once in a line. */
const heldNote = (): void => toast('That waits until the welcome is done. ⌘↵ keeps this one.', undefined, 'info')
// Registered as the module loads, so it comes before every other key listener in the box.
holdKeys(() => document.documentElement.hasAttribute('data-welcome-ph'), true, heldNote)

export default function App(): React.JSX.Element {
  // Here, not in the writing, so a task or idea open in its place hides too.
  useEscapeToHide()
  // While the welcome runs, the empty line offers examples, a starter picked
  // there arrives written in with its fields filled, and the box is in lesson
  // mode: what is not being taught is calm, what draws on your history is hidden.
  useWelcomePlaceholder((who, where, starter) => {
    // The starter's own kind, as a guess, whatever kind the box was left on before.
    setKind(starter as CaptureType)
    setChosen(false)
    setAttribution(who)
    setMedium(where)
    autoWho.current = who
    autoWhere.current = where
  })
  const lesson = useLesson()
  // A name read from a quote's "- Name" tail, kept up to date while it is still ours, not yours.
  const autoWho = useRef('')
  const autoWhere = useRef('')
  useEffect(() => window.api.onHeld(heldNote), [])
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
  // Once, on a first start after Vim stopped being on for everyone: see `settleVim`.
  useEffect(() => (void settleVim(), onVimChange(setVimOn)), [])

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
  // The questions and goals the words did not match: one line in the ⋯ menu shows them all.
  const [offersHidden, setOffersHidden] = useState(0)
  const [offersAll, setOffersAll] = useState(false)
  useEffect(() => void (!started && setOffersAll(false)), [started])
  // Who and where, as this kind (or a #book) asks; and what a tag that does something will do.
  const boxText = textOf(body)
  const asks = asksFor(kind, boxText)
  // Who said it and where you met it. Null who means the words are yours.
  const [attribution, setAttribution] = useState('')
  const [medium, setMedium] = useState('')
  // Private from the start: never surfaces unasked in quiet hours or safe mode.
  const [secret, setSecret] = useState(false)
  // Hidden from screen recordings and shares unless let in, for a demo or a
  // Loom; remembered, and put back on every start.
  const appSettings = useLive(vigil.settings, null as Settings | null)
  // ⌘K's Abandon session, while one runs.
  const abandonAction = useAbandonAction()
  // Tidy stickies only with a sticky out to tidy.
  const stickiesOut = useStickiesOut()
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
  // Which windows show in screen recordings: all at once from ⌘K and the menu here, each on its own in Settings.
  const recordable = allRecorded(appSettings?.inRecordings)
  const setRecordable = (on: boolean): void => recordAll(on, appSettings?.inRecordings)
  useEffect(() => void moveOldRecordable(), [])
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
  // The editor a fresh box replaced, until the new one is ready: its plans are no longer this box's.
  const retired = useRef<Editor | null>(null)
  // The box's command words, lit as you type, Todoist's way: a timer, a clue,
  // a task's day and priority, a tag that does something, a signature, a link.
  // Each can be kept as plain text; what is lit is what the send does (see
  // lib/box-tokens.ts). Read through a ref, as the editor's plugin is built
  // once; read again when the kind, the questions or the action tags change.
  const boxContext = useRef<BoxContext>({ off: true, kind, chosen, held: [], actionTags: [] })
  const [plan, setPlan] = useState<BoxPlan | null>(null)
  const [tokenHover, setTokenHover] = useState<{ token: BoxToken; rect: DOMRect } | null>(null)
  // Kept plain: said, with Undo, which lights it again.
  const keptPlain = (token: BoxToken, seq: number): void => {
    const view = editorRef.current?.view
    chime('off')
    toast(keptMessage([token]), () => view && rearm(view, seq))
  }
  const latestKept = useRef(keptPlain)
  latestKept.current = keptPlain
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
  // A Todo written as a list: a task a line, its indented lines their steps,
  // said under the box. Its first line alone is not "similar" to anything:
  // a line named like a task you have joins it, and the notice says so.
  const listed = !editing && kind === 'todo' ? boxList(editorRef.current) : null
  boxKind.todo = !editing && kind === 'todo'

  // "+name" on the first line: a clue for a question you are holding, or a
  // log for a goal, not a capture. The open questions and goals, to find
  // which one the name means.
  const held = useLive(() => Promise.all([vigil.items('question'), vigil.items('goal')]).then((lists) => lists.flat().filter((one) => !one.closedAt && !one.archivedAt)), [] as Item[], [], ['item'])
  boxContext.current = { off: !!editing, kind, chosen, held, actionTags }
  useEffect(() => void (editorRef.current !== retired.current && replan(editorRef.current)), [editing, kind, chosen, held, actionTags])
  // "+name" read as a clue, or as a name nothing matches yet.
  const plus = editing || !plan ? null : plan.clue ?? plan.miss
  // A Word that is one word: its meaning looked up in the background and
  // offered faint under it. Not for an open note, the welcome, a private one,
  // or words lit to do something else (a timer, a clue, a task).
  const { definition, keep: keepDefinition } = useDefinition(!editing && !lesson && !secret && kind === 'word' && !plan?.timer && !plan?.clue && !plan?.task ? defineable(boxText) : null)
  // A timer newly lit is about to act: a brief warm light round the box says so.
  const timerLit = !editing && (!!plan?.timer || !!plan?.rounds)
  useEffect(() => void (timerLit && beam('warm')), [timerLit])
  // The beam turns round the box while a link's card or a word's meaning is fetched.
  useWorking(!editing && (definition?.state === 'looking' || !!plan?.card?.loading))
  const plusGoal = plan?.clue?.question.tier === 'goal'
  // A quote's "- Name" fills Who said it, unless you wrote one there; kept
  // as plain text, the name it filled goes again.
  useEffect(() => {
    if (!plan || editing) return
    // A link kept as plain text is a note at once, not after the next key.
    if (!chosen && plan.kind !== kind) setKind(plan.kind)
    const by = plan.signature ?? { who: '', where: '' }
    // The box emptied by hand: a who and where read from a quote's tail go
    // with the words, so the next note does not start signed by someone else.
    // Read from the editor, not the saved words, which wait for a pause.
    const emptied = !lesson && !!editorRef.current?.isEmpty
    if (attribution === autoWho.current && by.who !== attribution && (by.who || plan.signatureKept || emptied)) {
      autoWho.current = by.who
      setAttribution(by.who)
    }
    if (medium === autoWhere.current && by.where !== medium && (by.where || plan.signatureKept || emptied)) {
      autoWhere.current = by.where
      setMedium(by.where)
    }
  }, [plan]) // eslint-disable-line react-hooks/exhaustive-deps
  // A goal picked under the writing: the words are logged to it and nothing
  // is captured; an open capture moves into it.
  const logToGoal = (goal: Item): void => {
    if (editing) return void logInto(goal, { captureId: editing.id })
    const doc = editorRef.current?.getJSON() ?? body
    const text = textOf(doc).trim()
    if (!text) return refuse('Write something first: it is logged to the goal')
    beam('success')
    void logInto(goal, { text }, () => (putDraft(doc), fresh(true)))
    fresh()
  }
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
  // Escape in one of its fields lets go of the field, before it hides the
  // window. It never goes back to the note: that is ⌘[, as everywhere.
  useEffect(() => {
    if (!reading) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // Reading full screen over it: that Escape is reading's, not this note's.
      if (document.querySelector('[aria-label="Reading"]')) return
      const target = event.target as HTMLElement
      if (!['INPUT', 'TEXTAREA'].includes(target.tagName)) return
      event.preventDefault()
      event.stopPropagation()
      target.blur()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [reading])
  // The side panel is open to start (⌘\ hides it). Remembered, and the
  // window is sized to match on every start. A new key, so a panel shut
  // before it opened by default starts open once.
  const [panel, setPanelOpen] = useStoredFlag('boxPanel', true, ['open', 'closed'])
  const [tab, setTab] = useState<Tab>('inbox')
  // The panel stays drawn while the window glides shut, so closing slides
  // it out of view instead of leaving an empty strip, and is drawn before
  // the window starts to widen, so opening uncovers it from the right.
  const [panelDrawn, setPanelDrawn] = useState(panel)
  const panelWanted = useRef(panel)
  panelWanted.current = panel
  const setPanel = (open: boolean): void => {
    chime(open ? 'slide' : 'fold')
    setPanelOpen(open)
    panelWanted.current = open
    if (open) setPanelDrawn(true)
    // The panel's glide sets the height too; the writing's own waits for it to land.
    box.held.current = true
    void window.api.setPanel(open).then(() => {
      box.held.current = false
      if (!panelWanted.current) setPanelDrawn(false)
      box.refit()
    })
  }
  useEffect(() => void window.api.setPanel(panel), []) // eslint-disable-line react-hooks/exhaustive-deps
  // From the writing to the list and back without the mouse: ⌃J or ⌃K leaves
  // the note for the panel's list (opening the panel if it is shut), and I
  // comes back, as vim's insert does. A menu open in the note keeps ⌃J and ⌃K.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.altKey) return
      // Nothing holding the keys (a palette just closed) counts as the note: ⌃J still leaves for the list.
      const active = document.activeElement as HTMLElement | null
      const inNote = !!active?.closest?.('.ProseMirror') || !active || active === document.body
      const key = event.key.toLowerCase()
      if (event.ctrlKey && inNote && (key === 'j' || key === 'k')) {
        if (document.querySelector('.tiptap-suggestion-popup, [cmdk-root], [role="menu"], [role="dialog"]')) return
        active?.blur()
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
      // ⌃⌘C: the box to the middle of its screen.
      if (event.metaKey && event.ctrlKey && !event.altKey && !event.shiftKey && event.code === 'KeyC') {
        event.preventDefault()
        return window.api.centreBox()
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
  // ⌘K put away, by Escape or an action picked: the caret goes back into the
  // note, so the box's keys (⌃J, typing) work at once. Not when the action
  // opened something that took the keys itself.
  const wasSearching = useRef(false)
  useEffect(() => {
    const was = wasSearching.current
    wasSearching.current = !!searching
    if (!was || searching) return
    requestAnimationFrame(() => {
      const active = document.activeElement
      if ((!active || active === document.body) && !document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) editorRef.current?.commands.focus()
    })
  }, [searching])
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
  // The window as tall as the writing, from short to full: see fit-box.
  const box = useFitBox(column, Boolean(reading))
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
    // The names read from the last quote's tail go with it, or the next quote's never fills in.
    autoWho.current = ''
    autoWhere.current = ''
    // The editor going is let go now: read again before the new one is ready
    // (the kind changing replans), the old words would sign the fresh note.
    retired.current = editorRef.current
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
  // The note open here moved to the Bin (the side panel's Inbox, ⌘K, another
  // window): put down, as every other place puts down what goes to the Bin,
  // and the box is a new capture again (with any draft set aside for it). The
  // notice's Undo brings the note back to the Inbox.
  useEffect(() => {
    if (editing && editingMeta?.status === 'discarded') fresh(true)
  }, [editing?.id, editingMeta?.status]) // eslint-disable-line react-hooks/exhaustive-deps
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
    // Thrown away: the sheet crumples and is tossed, before it goes blank.
    const land = hasContent(draft ?? null) ? crumpleFrom(document.querySelector<HTMLElement>('.tiptap.ProseMirror.mindflow-editor')) : undefined
    fresh()
    land?.()
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

  // ⌘O, Little Arc's "Open in Arc": what is open here goes to the main
  // window as the same thing. A draft is kept as a capture first, with its
  // caret; the box then grows toward the main window and fades (main's
  // `box:promote`), and the main window opens on it. With nothing written,
  // ⌘O simply opens the main window, as before.
  const promote = async (): Promise<void> => {
    if (reading) return window.api.promote(reading.type, reading.id)
    const editor = editorRef.current
    const at = editor?.state.selection.from ?? 0
    if (editing) {
      // Saved now, not at the next pause, so the main window opens on every word.
      if (editor) words.save(editor.getJSON(), editor)
      notePromoted(editing.id, at)
      window.api.promote('capture', editing.id)
      return fresh(true)
    }
    const doc = editor?.getJSON() ?? body
    if (!hasContent(doc ?? null) || sending) return window.api.promote(null, null)
    setSending(true)
    try {
      const id = await window.api.captures.create({ kind: chosen && kind !== 'todo' ? kind : 'note', elapsedMs: Date.now() - openedAt.current, body: doc,
        markdown: editor ? toMarkdown(editor) : undefined, attribution: attribution.trim(), medium: medium || undefined, private: secret })
      await vigil.linkSession(id)
      localStorage.removeItem('capture-draft')
      notePromoted(id, at)
      window.api.promote('capture', id)
      // Cleared once it has gone, so the glide shows the words, not a blank box.
      setTimeout(() => (setSending(false), fresh()), 260)
    } catch (error) {
      setSending(false)
      refuse(`Not opened: ${whyFailed(error)}. Your note is still here.`, 'error')
    }
  }
  const latestPromote = useRef(promote)
  latestPromote.current = promote
  useEffect(() => window.api.onPromoteAsked(() => void latestPromote.current()), [])
  // Words sent from ⌘K in the main window ("in quick capture"): written at
  // the end of the note here, the caret after them, ready to finish.
  useEffect(() => window.api.onSeed((text) => {
    let tries = 0
    const write = (): void => {
      const editor = editorRef.current
      if (!editor || editor.isDestroyed) return void (tries++ < 60 && requestAnimationFrame(write))
      chime('tap')
      const paragraph = { type: 'paragraph', content: [{ type: 'text', text }] }
      if (editor.isEmpty) editor.chain().setContent({ type: 'doc', content: [paragraph] }, { emitUpdate: true }).focus('end').run()
      else editor.chain().focus('end').insertContentAt(editor.state.doc.content.size, paragraph).focus('end').run()
    }
    write()
  }), [])

  // Saving an open capture's fields as they change.
  const saveField = (patch: Parameters<typeof window.api.captures.save>[1]): void => {
    if (editing) void window.api.captures.save(editing.id, patch)
  }
  // An open capture's words, saved only over what it was opened on: the same
  // note open in the main window, or a merge into it, is never written over.
  const words = useSameWords('captures', editing?.id, editing?.body, (id, body, base, editor) =>
    window.api.captures.save(id, { body, base, ...(editor ? { markdown: toMarkdown(editor) } : {}) }))

  // The box closing after a send, still to come: an undo straight after keeps it open.
  const leaving = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Set by bringBack: the next editor to be ready puts the caret at its end.
  const toEnd = useRef(false)
  /**
   * A send taken back (⌘Z or Undo on its toast): the box comes back as it was
   * sent, the words, pictures and tags in it, who said it and where, its kind
   * and whether it was private, with the caret at the end, ready to change
   * and send again. Brought back if it had gone. Anything typed into a fresh
   * box since stays, under the words that came back.
   */
  const bringBack = (sent: { doc: JSONContent; attribution: string; medium: string; kind: CaptureType; chosen: boolean; secret: boolean; pieces: string[]; editor: Editor | null }): void => {
    clearTimeout(leaving.current)
    setSending(false)
    // A fresh box started since (⌥⌘↵, Create more) with words in it already.
    const now = editorRef.current !== sent.editor && !latestEditing.current ? editorRef.current?.getJSON() : undefined
    const doc = now && hasContent(now) ? { ...sent.doc, content: [...(sent.doc.content ?? []), ...(now.content ?? [])] } : sent.doc
    putDraft(doc)
    keepLifted(sent.pieces)
    fresh(true)
    setAttribution(sent.attribution)
    setMedium(sent.medium)
    setSecret(sent.secret)
    if (sent.chosen) (setKind(sent.kind), setChosen(true))
    toEnd.current = true
    // A celebration the send earned ("100 captures kept") goes with it.
    window.dispatchEvent(new CustomEvent('vigil:uncelebrate'))
    // Gone already (it leaves as the send lands): summoned back.
    window.api.revealPrompt()
  }
  // Save. Never fails, and no field can block it: an empty box is the only
  // thing it refuses, because there is nothing there to keep.
  const submit = (once = false): void => {
    // In the welcome, one is kept and the box goes, whatever Create more says.
    const more = (once || createMore) && !lesson
    if (editing) return fresh(true)
    // A second ⌘↵ while the first is still on its way would keep it twice.
    if (sending) return
    // Read from the editor itself: its onChange waits for a pause in the
    // typing, and ⌘↵ often comes before one. What it does is what is lit in
    // it: the plan, read again now, with every word kept as plain text left be.
    replan(editorRef.current)
    const plan = planNow(editorRef.current)
    const raw = cardsSettled(editorRef.current?.getJSON() ?? body)
    const doc = plan?.signatureKept ? raw : withoutTail(raw, attribution.trim())
    const text = textOf(doc).trim()
    // Nothing to keep: said with the "not allowed" sound, not in silence. A
    // picture or a drawing with no words is still something.
    const something = (doc as JSONContent | null)?.content?.some((node) => node.type !== 'paragraph' || node.content?.length)
    if (!text && !something) return chime('nope')
    // As it was sent, for an undo to put back exactly (bringBack).
    const sent = { doc: doc as JSONContent, attribution, medium, kind, chosen, secret, pieces: [...lifted], editor: editorRef.current }
    // "+name: …": a dated clue in that question, and nothing is captured. A
    // name that matches no question is kept as a capture, as the chip warned.
    const clueFor = plan?.clue
    if (clueFor) {
      const question = clueFor.question
      const clue = [clueFor.rest, textOf(doc).split('\n').slice(1).join('\n').trim()].filter(Boolean).join('\n')
      const goal = question.tier === 'goal'
      if (!clue) return refuse(goal ? 'Write the log after a colon, or on the lines under the goal’s name' : 'Write the clue after a colon, or on the lines under the question’s name')
      chime(goal ? 'mark' : 'clue')
      beam('success')
      void vigil.addClue(question.id, clue).then((id) => toast(`${goal ? 'Logged to' : 'A clue in'} “${question.title.length > 36 ? `${question.title.slice(0, 36)}…` : question.title}”`, () => {
        if (id) void vigil.dropClue(id)
        bringBack(sent)
      }))
      fresh()
      if (!more) window.api.hideWindow()
      return
    }
    // "!milestone Exam on 3 Dec": that day marked, and nothing captured.
    if (plan?.milestone) {
      beam('success')
      void markFromBox(plan.milestone, () => bringBack(sent))
      fresh()
      if (!more) window.api.hideWindow()
      return
    }
    // "5m tea", "timer 25m": a countdown in the floating timer, not a capture.
    // Not when a kind was picked or it is a todo, nor when the rest has a date,
    // a repeat or a tag: "10 min walk every day #health" is a task to keep.
    // "4x25 essay": pomodoro rounds in the floating timer, each break with its own sound.
    const rounds = plan?.rounds
    if (rounds) {
      chime('timer')
      beam('success')
      void vigil.startRounds(rounds.goal, rounds).then((id) => {
        window.api.showFocus(true)
        toast(`${rounds.rounds} ${rounds.rounds === 1 ? 'round' : 'rounds'} of ${lengthSaid(rounds.workMs)} started`, () => {
          void vigil.cancelSession(id)
          bringBack(sent)
        })
      })
      fresh()
      if (!more) window.api.hideWindow()
      return
    }
    const timer = plan?.timer
    if (timer) {
      chime('timer')
      beam('success')
      void vigil.startTimer(timer.goal, timer.ms).then((id) => {
        window.api.showFocus(true)
        // Undone, the words come back into the box as they were typed.
        toast(`Timer set: ${lengthSaid(timer.ms)}${timer.goal === 'Timer' ? '' : ` for ${timer.goal}`}`, () => {
          void vigil.cancelSession(id)
          bringBack(sent)
        })
      })
      fresh()
      if (!more) window.api.hideWindow()
      return
    }
    // What a paste is, when the kind was left alone: a bare link is a link,
    // and where it came from is the site; a long block is a quote, the
    // container for what comes out of it later.
    const url = plan ? plan.url : null
    // The suggestion is worked out a moment after typing stops; a save before
    // then works it out here, so a quick "Call the plumber" is still a todo.
    const said = plan ? plan.kind : chosen ? kind : ((kindOf(firstLine(doc)) as CaptureType | null) ?? kind)
    const sorted = said !== 'note' ? said : url ? 'link' : text.length > 600 ? 'quote' : said
    const where = medium || (url ? siteName(url.hostname) : '')
    // A tag marked "makes a task" (#bug, #fix and the rest by default) is a
    // todo wearing a label: it goes to the task list at once, as a todo does.
    // A Todo written as a list: a task a line, the indented lines their steps,
    // one notice and one Undo for the lot. Undone, the box comes back as sent.
    const list = sorted === 'todo' ? boxList(editorRef.current) : null
    // A page of mixed lines (links or sayings among the to-dos) is never made
    // one task: kept as a note, and opened in "Sort this out" to pick what each line becomes.
    const page = list?.mixed ? list.text : null
    const action = !page && (sorted === 'todo' || !!plan?.task)
    if (list && !list.mixed) {
      beam('success')
      void makeListTasks(list.list, { onUndo: () => bringBack(sent), away: !more })
      fresh()
      if (!more) window.api.hideWindow()
      return
    }
    chime('send')
    // The top edge lights green: kept, without a word; and one sweep round the box.
    beam('success')
    // A meaning taken with Tab goes with it as the Word's own fields.
    const meaning = sorted === 'word' && definition?.kept ? definition.found : undefined
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
      .create({ title: plan?.card && !plan.card.loading ? plan.card.title : '', kind: page ? 'note' : sorted, elapsedMs: Date.now() - openedAt.current, body: hasContent(doc) ? doc : null, markdown,
        attribution: attribution.trim(), medium: where || undefined, private: secret, plainTags: plan?.plainTags.length ? plan.plainTags : undefined })
      .then(async (id) => {
        land?.()
        await vigil.linkSession(id)
        // Anything captured out of this note while it was a draft now points
        // back to it, so its lineage holds.
        for (const piece of pieces) await vigil.setCapture(piece, 'origin', id)
        // A link shows as its card, filled in once the page answers.
        if (sorted === 'link') void cardUp({ id, kind: sorted, body: hasContent(doc) ? doc : null })
        if (meaning) {
          await notes.setField('captures', id, 'definition', meaning.definition)
          if (meaning.example) await notes.setField('captures', id, 'example', meaning.example)
        }
        if (action) {
          // The welcome shows the task it became itself; the box says nothing over it.
          // Undone, the capture goes too and the box comes back as it was sent.
          await makeTask({ capture: id, plain: plan?.taskPlain, whole: true }, 'Added to your tasks', { quiet: document.documentElement.hasAttribute('data-welcome-ph'), onUndo: () => (void vigil.unlift('capture', id), bringBack(sent)) })
        } else if (!document.documentElement.hasAttribute('data-welcome-ph')) {
          // A plain note takes back the same way as every other send: the
          // capture goes, and the box comes back as it was sent.
          toast(page ? 'Page kept in your inbox. Pick what each line becomes' : 'Kept in your inbox', () => (void vigil.unlift('capture', id), bringBack(sent)))
        }
        if (page) openSort(page, id)
        if (more) return
        // Let the box finish leaving before it is replaced.
        leaving.current = setTimeout(() => {
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
          return refuse(`${why} Your note is back in quick capture.`, 'error')
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
  // A list's offer taken up (lib/line-tasks.ts): the box becomes a Todo, and says what Create will make.
  boxKind.pick = () => (chime('settled'), latestPick.current('todo'))
  const latestSubmit = useRef(submit)
  latestSubmit.current = submit
  const latestOver = useRef({ searching, reading })
  latestOver.current = { searching, reading }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // Search, a dialog or a menu has the keys: the note under it is not
      // touched, and ⌘↵ is not taken as a plain ↵ by what is open either.
      if (latestOver.current.searching || document.querySelector('[role=dialog], [role=alertdialog], [role=menu], [role=listbox], [cmdk-root]')) {
        if (event.key === 'Enter' && event.metaKey) (event.preventDefault(), event.stopPropagation())
        return
      }
      // ⌘1 to ⌘9: a kind you already know, without opening the picker.
      // Not while a task is being read here: its note is out of sight.
      const picked = event.metaKey && !event.shiftKey && !event.altKey && !latestOver.current.reading ? CAPTURE_TYPES[Number(event.key) - 1] : undefined
      if (picked) {
        event.preventDefault()
        chime('settled')
        latestPick.current(picked.id)
        return
      }
      // In the welcome, a lone Enter on a one-line note sends it, as a newcomer
      // expects; anything longer, or a menu open in the editor, keeps its Enter.
      const lone = event.key === 'Enter' && !event.metaKey && !event.shiftKey && !event.altKey && !event.ctrlKey && document.documentElement.hasAttribute('data-welcome-ph') &&
        !!(event.target as HTMLElement | null)?.closest?.('.ProseMirror') && !menuShowing('.tiptap-suggestion-popup') &&
        (editorRef.current?.state.doc.childCount ?? 2) === 1 && !!editorRef.current?.getText().trim()
      if (lone) {
        event.preventDefault()
        event.stopPropagation()
        return latestSubmit.current()
      }
      if (event.key !== 'Enter' || !event.metaKey) return
      event.preventDefault()
      event.stopPropagation()
      latestSubmit.current(event.altKey)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])


  // A toast says its piece in the footer's own row, between the kind and
  // Create, never over the writing or its fields; Create more and the sandbox
  // chip step back while it is up (box-extras.css).
  const footer = useRef<HTMLElement>(null)
  const [toastLane, setToastLane] = useState<CSSProperties | undefined>(undefined)
  useEffect(() => {
    const row = footer.current
    if (!row) return setToastLane(undefined)
    const place = (): void => {
      const last = row.lastElementChild?.getBoundingClientRect()
      if (!last || !last.width) return
      // The whole row left of Create, the kind stepping back while it is up, so a notice and its
      // button fit on one line. A toast is about 34px tall: centred on the Create button.
      const left = row.getBoundingClientRect().left + parseFloat(getComputedStyle(row).paddingLeft)
      const next = { '--toast-left': `${Math.round(left - 16)}px`, '--toast-right': `${Math.round(window.innerWidth - last.left)}px`, '--toast-bottom': `${Math.max(4, Math.round(window.innerHeight - last.bottom - (34 - last.height) / 2))}px` } as CSSProperties
      setToastLane((was) => (JSON.stringify(was) === JSON.stringify(next) ? was : next))
    }
    place()
    const watch = new ResizeObserver(place)
    watch.observe(row)
    for (const child of row.children) watch.observe(child)
    window.addEventListener('resize', place)
    return () => (watch.disconnect(), window.removeEventListener('resize', place))
  }, [reading, kind, editing, panel, chosen])
  // The footer is told while a toast is up, so what shares its row steps back.
  const toasts = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const lane = toasts.current
    if (!lane) return
    const tell = (): void => {
      const up = lane.querySelector('[role=status]')
      footer.current?.toggleAttribute('data-toast-up', !!up)
      // One too long for a line grows up over the fields above the footer: they step back too.
      document.body.toggleAttribute('data-toast-tall', !!up && up.getBoundingClientRect().height > 40)
    }
    const watch = new MutationObserver(tell)
    watch.observe(lane, { childList: true, subtree: true })
    return () => watch.disconnect()
  }, [])
  return (
    <TooltipProvider delayDuration={500}>
    <div className={`app-container ${pointerIn ? 'pointer-in' : ''} isolate flex flex-col items-center justify-center relative flex h-full w-full flex-col pt-10 color-white`}>
      {/* Toasts sit above the box's footer here, clear of Create. */}
      {/* Toasts over the note, above its footer: clear of Create and of the panel. */}
      <div ref={toasts} className={toastLane ? 'contents' : `contents [--toast-bottom:6.5rem] ${panel ? `[--toast-right:${PANEL_WIDTH}px]` : ''}`} style={toastLane}><Toaster /></div>
      <Celebrations place="box" />
      <NotePreview />
      <ShortcutSheet />
      <WordNotes />
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
      <AnimatePresence>
      {searching && (
        <Search
          initial={searchFrom}
          // Words that match nothing: kept here, in the box, as the main window keeps them.
          onKeep={(as, text) => {
            setSearching(false)
            setSearchFrom('')
            void keepTyped(as, text, openAny, (words) => (setSearchFrom(words), setSearching(true)))
          }}
          // Everything the box can do, by name and key, as Raycast's ⌘K lists it.
          actions={searching === 'notes' ? [] : [
            { label: 'New capture', keys: '⌘N', run: () => startOver() },
            { label: 'New question', cue: null, run: () => void startQuestion(openAny) },
            { label: panel ? 'Hide the side panel' : 'Show the side panel', keys: '⌘\\', cue: null, run: () => (setPanel(!panel), toast(panel ? 'Side panel hidden' : 'Side panel shown', () => setPanel(panel))) },
            ...TABS.map((one, index) => ({ label: `Go to ${({ inbox: 'Inbox', today: 'Tasks', review: 'Review', kept: 'Saved', recent: 'Recent' } as Record<string, string>)[one] ?? one}`, keys: `⌃${index + 1}`, run: () => {
              setTab(one)
              if (!panel) setPanel(true)
            } })),
            ...(picked.ids.length > 1 ? [{ label: `Make one task from the ${num(picked.ids.length)} selected captures`, cue: null, run: () => window.dispatchEvent(new CustomEvent('vigil:one-task')) }] : []),
            { label: "Keep today's tasks on screen", cue: null, run: () => stickOnDesktop('today', 'today') },
            { label: 'Tidy: a few minutes tagging your latest captures', run: () => openPass('tidy') },
            { label: 'Decide: once a week, choose what to keep', run: () => openPass('decide') },
            { label: 'Read the inbox from the top', run: () => setReadList({ items: captures.filter((one) => one.status === 'open' && !one.archivedAt).map((one) => ({ type: 'capture', id: one.id })), start: 0 }) },
            { label: 'Copy this note as Markdown', keys: '⇧⌘C', run: copyMarkdown },
            ...(editing ? [{ label: 'Stick this note on the desktop', cue: null, run: () => stickOnDesktop('capture', editing.id) }] : []),
            { label: locked ? 'Unlock this note' : 'Lock this note: read only', cue: locked ? 'off' : 'on', run: () => (setLocked(!locked), toast(locked ? 'Note unlocked' : 'Note locked: read only', () => setLocked(locked))) },
            { label: secret ? 'Make this note not private' : 'Make this note private', cue: editing ? null : secret ? 'off' : 'on', run: () => {
              const set = (on: boolean): void => {
                setSecret(on)
                if (editing) void vigil.setPrivate('captures', editing.id, on)
              }
              set(!secret)
              toast(secret ? 'Note no longer private' : 'Note is private', () => set(secret))
            } },
            { label: outline ? 'Hide the outline' : 'Show the outline', cue: outline ? 'off' : 'on', run: () => (setOutline(!outline), toast(outline ? 'Outline hidden' : 'Outline shown', () => setOutline(outline))) },
            { label: 'Fold every heading', cue: null, run: () => void (foldEverything(true) || chime('nope')) },
            { label: 'Unfold every heading', cue: null, run: () => void (foldEverything(false) || chime('nope')) },
            { label: source ? 'Hide the source' : 'Show the source', keys: '⌘E', cue: null, run: () => setSource(!source) },
            { label: vim ? 'Turn vim keys off' : 'Turn vim keys on', cue: vim ? 'off' : 'on', run: () => (setVim(!vim), toast(vim ? 'Vim keys off' : 'Vim keys on', () => setVim(vim))) },
            { label: appSettings?.sounds ? 'Turn sounds off' : 'Turn sounds on', cue: null, run: () => {
              soundOn(!appSettings?.sounds)
              chime(appSettings?.sounds ? 'off' : 'on')
              void vigil.setSettings({ sounds: !appSettings?.sounds })
              const was = !!appSettings?.sounds
              toast(was ? 'Sounds off' : 'Sounds on', () => (soundOn(was), void vigil.setSettings({ sounds: was })))
            } },
            { label: appSettings?.safeMode ? 'Turn safe mode off' : 'Turn safe mode on', keys: '⌥⌘S', cue: appSettings?.safeMode ? 'off' : 'on', run: () => {
              const on = !appSettings?.safeMode
              void vigil.setSettings({ safeMode: on }).then(() => toast(on ? 'Safe mode on' : 'Safe mode off', () => void vigil.setSettings({ safeMode: !on })))
            } },
            { label: recordable ? 'Hide Vigil from screen recordings' : 'Show Vigil in screen recordings', cue: recordable ? 'off' : 'on', icon: recordable ? CameraOffIcon : CameraIcon, run: () => setRecordable(!recordable) },
            { label: appSettings?.stickiesShown === false ? 'Show sticky notes' : 'Hide sticky notes', keys: '⌃⌥⌘N', cue: null, run: () => {
              const show = appSettings?.stickiesShown === false
              void vigil.setSettings({ stickiesShown: show }).then(() => toast(show ? 'Sticky notes shown' : 'Sticky notes hidden', () => void vigil.setSettings({ stickiesShown: !show })))
            } },
            { label: 'Bring sticky notes here', cue: null, run: () => window.api.gatherStickies() },
            ...(stickiesOut > 0 && !appSettings?.safeMode ? [{ label: 'Tidy stickies', keys: '⌃⌥⌘T', cue: null, run: () => window.api.tidyStickies() }] : []),
            { label: reveal ? 'Blur private titles again' : 'Show private titles for now', cue: reveal ? 'off' : 'on', run: () => (setReveal(!reveal), toast(reveal ? 'Private titles blurred' : 'Private titles shown', () => setReveal(reveal))) },
            { label: editing || reading || hasContent(body) ? 'Open this in the main window' : 'Open the main window', keys: '⌘O', run: () => void promote() },
            { label: "Open the week's page", cue: 'season', run: () => window.api.openInHome('view', 'weekpage') },
            { label: "Open the month's page", cue: 'season', run: () => window.api.openInHome('view', 'monthpage') },
            { label: 'Year: your seasons of life, month by month', cue: 'season', run: () => window.api.openInHome('view', 'yearpage') },
            ...noteActions(),
            ...abandonAction,
            { label: 'Keyboard shortcuts', keys: '?', run: () => window.dispatchEvent(new CustomEvent('vigil:shortcuts')) },
            { label: 'Import an Obsidian vault or Notion export…', cue: null, run: () => void window.api.importFrom('vault') },
            { label: 'Import Readwise, Kindle, Markdown, bookmarks or Anki…', cue: null, run: () => void window.api.importFrom('files') },
            ...themeActions((text, undo) => toast(text, undo)),
            { label: appSettings?.blur === false ? 'Turn blurring on' : 'Turn blurring off', cue: appSettings?.blur === false ? 'on' : 'off', run: () => {
              const on = appSettings?.blur === false
              void vigil.setSettings({ blur: on }).then(() => toast(on ? 'Blurring on' : 'Blurring off', () => void vigil.setSettings({ blur: !on })))
            } },
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
      </AnimatePresence>
      <FocusNote />
      <FocusScenery />
      <Header panel={panel} drawn={panelDrawn} onPanel={() => setPanel(!panel)} nav={trail.stack.length > 1 && (
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
      aside={appSettings?.safeMode ? <Tip label="Safe mode: no hints, old captures or pinned notes come up  ⌥⌘S"><span className="flex h-5 items-center rounded-full bg-accent px-2 text-key leading-none text-[color-mix(in_srgb,var(--tt-brand-color-400)_55%,var(--foreground))]">Safe</span></Tip>
        // Rot cards and reminder pins live in the side panel's Inbox; with the
        // panel shut, a chip up here says they are there, and opens it on them.
        // Kept with the panel open too, so it never pops out as the panel slides in.
        : (oldCount || pinned.length) && !lesson ? (
          <Tip label={panel ? 'Show the Inbox in the side panel  ⌃1' : 'Open the Inbox in the side panel  ⌘\\'}>
            <button type="button" data-waiting style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setTab('inbox')
                setPanel(true)
              }}
              className="group/waiting flex h-5 items-center gap-1 rounded-full bg-accent pr-1 pl-2 text-key leading-none text-muted-foreground transition-colors hover:text-foreground">
              {oldCount > 0 && <span><Rolling text={oldCount} /> {oldCount === 1 ? 'old capture' : 'old captures'}</span>}
              {oldCount > 0 && pinned.length > 0 && <span>·</span>}
              {pinned.length > 0 && <span><Rolling text={pinned.length} /> pinned</span>}
              {/* Says it opens something: a chevron that leans on hover. */}
              <ChevronRight aria-hidden className="size-3 transition-transform group-hover/waiting:translate-x-0.5" />
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
            { label: 'Show private titles until it closes', on: reveal, set: setReveal },
            { label: 'Word count under the note', on: counting, set: setCounting }
          ]}
          actions={[
            { label: editing || reading || hasContent(body) ? 'Open this in the main window' : 'Open the main window', keys: '⌘O', run: () => void promote() },
            { label: expanded ? 'Shrink the window' : 'Expand the window', keys: '⌃⇧F', run: toggleExpanded },
            { label: 'Settings', keys: '⌘,', run: () => window.api.openInHome('view', 'settings') }
          ]}
        />
      )} />

      {/* With the panel, laid out at the full width from the start, the writing
          exactly as wide as without it, so nothing in the note re-wraps while
          the window glides: the window uncovers the panel, nothing squeezes. */}
      <ResizablePanelGroup
        orientation="horizontal"
        className="w-full h-full"
        style={!focus && panelDrawn ? { width: '100%', minWidth: BOX_WIDTH + PANEL_WIDTH, alignSelf: 'flex-start' } : undefined}
      >
        <ResizablePanel
          defaultSize={!focus && panelDrawn ? `${BOX_WIDTH}px` : '100%'}
          minSize={!focus && panelDrawn ? '50%' : '100%'}
          className="h-full w-full"
        >
          <motion.div ref={column} style={{ x: swipeX }} className="h-full w-full flex flex-col">
            {reading ? (
              <motion.div key={reading.id} initial={byKeys() ? false : { opacity: 0, transform: shift(`translateX(${10 * cameBy.current}px)`) }} animate={{ opacity: 1, transform: shift('translateX(0px)') }} transition={{ duration: 0.1, ease: EASE }} className="flex min-h-0 flex-1 flex-col">
                <div data-chrome className="flex items-center gap-2 px-[4.25rem] pt-2 text-control text-muted-foreground">
                  <Button variant="ghost" size="sm" onClick={() => setReading(null)}>
                    <ArrowLeft className="size-4" /> Back to your note
                  </Button>
                  <Kbd>⌘[</Kbd>
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
              // and it moves only to say which way back or forward went. Reached
              // by keys (⌘[, ⌘], a fresh page after ⌘↵) it is simply there.
              // Whole transform strings: the send runs while the note saves.
              initial={byKeys() ? false : { opacity: 0, transform: shift(`translate(${10 * cameBy.current}px, 0px) scale(1)`) }}
              animate={sending ? { opacity: 0, transform: shift('translate(0px, -10px) scale(0.985)'), filter: 'blur(2px)' } : { opacity: 1, transform: shift('translate(0px, 0px) scale(1)'), filter: 'blur(0px)' }}
              transition={{ duration: sending ? 0.18 : 0.1, ease: EASE }}
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
                if (toEnd.current) (toEnd.current = false, requestAnimationFrame(() => editor.commands.focus('end')))
                box.guard(editor)
                // First among its plugins, so a click on a lit tag keeps it plain rather than opening it.
                if (!planNow(editor))
                  editor.registerPlugin(boxTokensPlugin({
                    context: () => boxContext.current,
                    onPlan: (next) => editorRef.current === editor && editor !== retired.current && setPlan(next),
                    onKept: (token, seq) => latestKept.current(token, seq),
                    onHover: setTokenHover
                  }), (plugin, plugins) => [plugin, ...plugins])
              }}
              tokens={TAGS}
              // A heading in the note already open is gone to here; anywhere else, once it opens.
              onOpenNote={(link, heading) => (heading && link === editing?.id && editorRef.current ? void goToHeading(editorRef.current, heading) : follow(link, (type, id) => openAny(type, id), heading))}
              from={editing?.id}
              // A kept note's mentions under it; a new draft has none yet.
              // A new Word's meaning, faint under the word itself, where it lands once kept.
              after={editing ? <Mentions id={editing.id} compact onOpen={(type, id) => openAny(type, id)} /> : definition && <DefineGhost definition={definition} onKeep={keepDefinition} onFix={(fix) => definition && fixIn(editorRef.current, definition.word, fix)} />}
              onSource={() => setSource((open) => !open)}
              // A tag opens everything carrying it, in search.
              onTag={(tag) => {
                setSearchFrom(`#${tag}`)
                setSearching(true)
              }}
              onChange={(doc, editor) => {
                if (editing?.id !== editingNow.current) return words.save(doc, editor)
                setBody(doc)
                // The kind follows the wording of the first line until you
                // choose one; a link kept as plain text is a note. A quote's
                // "- Name" fills Who said it, from the plan (see above).
                const guess = (chosen ? kind : (planNow(editor)?.kind ?? kindOf(firstLine(doc)) ?? 'note')) as CaptureType
                if (!chosen && !editing) setKind(guess)
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
            {/* What sending it will do, read from the lit words, each with its ×. */}
            {!editing && (
              <WillDo
                plan={plan}
                list={listed && !listed.mixed ? tasksSaid(listed.list) : null}
                // The same as Create: the page kept, then sorted line by line.
                onSort={listed?.mixed ? () => latestSubmit.current() : null}
                onKeep={(tokens) => {
                  const view = editorRef.current?.view
                  if (!view || !tokens.length) return
                  const seqs = tokens.map((one) => keepPlain(view, one))
                  chime('off')
                  toast(keptMessage(tokens), () => seqs.forEach((seq) => rearm(view, seq)))
                }}
                onNotTask={() => pick('note')}
                onUncard={() => {
                  const editor = editorRef.current
                  const card = planNow(editor)?.card
                  if (!editor || !card) return
                  const node = editor.state.doc.nodeAt(card.pos)
                  if (node?.type.name !== 'bookmark') return
                  const { schema } = editor.state
                  editor.view.dispatch(editor.state.tr.replaceWith(card.pos, card.pos + node.nodeSize, schema.nodes.paragraph.create(null, schema.text(card.href))))
                  chime('off')
                }}
                onNewQuestion={(name) => void vigil.newQuestion(name).then((id) => {
                  chime('hold')
                  toast(`Saved as a question: “${name.length > 36 ? `${name.slice(0, 36)}…` : name}”`, () => void vigil.dropQuestion(id))
                })}
              />
            )}
            <TokenHint hover={tokenHover} />
            {/* Under the writing: what it is, who said it and where you met it. */}
            {/* Wraps onto a second line rather than squeezing a field or a chip. */}
            <div data-chrome data-under-tall-toast className="flex flex-wrap items-center gap-1 px-[4.75rem] py-2">
              <span data-lesson="hide" className="inline-flex">
              <OptionsMenu
                label="This note"
                options={[
                  { label: 'Lock: read only', on: locked, set: setLocked },
                  { label: 'Outline of its headings', on: outline, set: setOutline },
                  { label: 'Raw data (JSON), for the technical', on: source, keys: '⌘E', set: setSource },
                  ...(editing ? [{ label: 'Details: kind, date, where it came from', on: details, keys: '⇧⌘D', set: setDetails }] : []),
                  { label: 'Private: blurred in lists', on: secret, set: (on: boolean) => {
                    setSecret(on)
                    if (editing) void vigil.setPrivate('captures', editing.id, on, true)
                  } }
                ]}
                actions={[
                  { label: 'New capture', keys: '⌘N', run: () => startOver() },
                  ...(offersHidden > 0 ? [{ label: 'Add to a question or goal…', run: () => setOffersAll(true) }] : [])
                ]}
              />
              </span>
              {/* Only what this kind asks for, unless it already holds something. */}
              {/* Who and where once there is something to say it about, and only
                  what this kind asks for, unless it already holds something. */}
              {((started && asks.who) || attribution) && (
                <Remembered field="attribution" complete={!lesson} value={attribution} placeholder={asks.who ?? 'Who'} className={FIELD} onChange={(value) => {
                  setAttribution(value)
                  if (editing) void vigil.setCapture(editing.id, 'attribution', value.trim() || null)
                }} />
              )}
              {((started && asks.where) || medium) && (
                <Remembered field="medium" complete={!lesson} value={medium} placeholder={asks.where ?? 'Where'} className={FIELD} onChange={(value) => {
                  setMedium(value)
                  if (editing) void vigil.setCapture(editing.id, 'medium', value.trim() || null)
                }} />
              )}
              {/* Private shows only when it is on; it is switched in Options. */}
              {secret && (
                <Tip label="Private: blurred in lists, never shown as a hint. Click to make it not private">
                  <Button variant="ghost" size="icon-sm" aria-label="Private" aria-pressed onClick={() => {
                    setSecret(false)
                    if (editing) void vigil.setPrivate('captures', editing.id, false)
                  }}>
                    <EyeOff />
                  </Button>
                </Tip>
              )}
              {asks.why && boxText.trim().split('\n').filter(Boolean).length < 2 && (
                // Wrapped, not cut: an ellipsis lands mid-word over words that type in.
                <span className="min-w-0 px-1.5 text-xs text-muted-foreground/70"><Typed text={asks.why} /></span>
              )}
              {like && !plus && !lesson && !listed && (
                <Tip label={`Open it: ${like.title}`}>
                <button
                  type="button"
                  onClick={() => openCapture(like.id)}
                  // Hard to miss but not loud: a brand-tinted chip whose words
                  // roll in when a match arrives, and roll over when it changes.
                  className="group/like ml-auto flex max-w-full shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--tt-brand-color-400)_35%,transparent)] bg-[color-mix(in_srgb,var(--tt-brand-color-400)_12%,transparent)] px-2.5 py-0.5 text-xs text-foreground animate-in fade-in-0 zoom-in-95 duration-200 hover:bg-[color-mix(in_srgb,var(--tt-brand-color-400)_20%,transparent)]"
                >
                  {/* Still, not pulsing: it turns up while you write, and a beat that never stops pulls the eye off the words. */}
                  <span className="size-1.5 shrink-0 rounded-full bg-[var(--tt-brand-color-400)]" />
                  <span className="truncate"><Rolling by="word" text={`Similar to “${like.title}”`} /></span>
                  {/* Says it goes somewhere: an arrow that leans further on hover. */}
                  <ArrowUpRight className="size-3.5 shrink-0 text-[var(--tt-brand-color-400)] transition-transform group-hover/like:translate-x-0.5 group-hover/like:-translate-y-0.5" />
                </button>
                </Tip>
              )}
            </div>
            {/* Where else it could go, the questions kept in view and the open goals, on
                one quiet line, and only once a few words are written: an empty box asks nothing. */}
            {started && !plus && !focus && !lesson && textOf(body).trim().split(/\s+/).length >= 3 && (
              <div data-under-tall-toast><BoxOffers words={textOf(body)} all={offersAll} onHidden={setOffersHidden} onClue={clueToPinned} onLog={logToGoal} /></div>
            )}
            {/* A hint sits at the foot of the box: a glance at something you
                wrote once, while you are here to write. Usually empty. */}
            <div data-chrome data-under-tall-toast className="px-[4.75rem]">
              {!focus && !lesson && <HintCard onOpen={openAny} />}
            </div>
            </motion.div>
            </>
            )}
            {!reading && (
            <main ref={footer} data-chrome className="flex items-center gap-1 pt-2 pb-3 px-[4.75rem]">
              {/* What matters first is the writing and Create; every other
                  switch is in here, each keeping its own key. */}
              <span data-under-toast className="inline-flex"><CaptureKindPicker
                suggested={!chosen && kind !== 'note' && !lesson}
                value={kind}
                onChange={pick}
              /></span>
              <span className="flex-1" />
              {/* In the sandbox, said here too: a practice box, not your own. */}
              <span data-under-toast className="inline-flex"><SandboxChip /></span>
              {/* Beside Create, as in Linear: on, a save keeps the box open for the next one. */}
              {!editing && (
                <Tip label="Keep quick capture open after each save  ⌥C">
                <label data-lesson="hide" data-under-toast className="mr-2 flex cursor-pointer items-center gap-2 text-control text-muted-foreground">
                  <Switch size="sm" checked={createMore} onCheckedChange={setCreateMore} tabIndex={-1} />
                  Create more
                </label>
                </Tip>
              )}
              {/* The button shows its own words and ⌘↵: the tip says only what it does not. */}
              <Tip label={createMore && !editing ? 'Then empties quick capture for the next one' : (editing ? 'Back to your draft: changes already save as you make them' : 'Then empties it for the next one:  ⌥⌘↵')}>
              <Button variant="secondary" onClick={() => submit()} className="text-control">
                {/* Open on a saved note: closing it, since changes already save. */}
                <Rolling text={editing ? 'Close note' : saved ? 'Saved' : plan?.clue && !editing ? (plusGoal ? 'Add log' : 'Add clue') : 'Create'} /> <kbd className="font-sans text-key opacity-70">⌘↵</kbd>
              </Button>
              </Tip>
            </main>
            )}
          </motion.div>
          <SourceDrawer open={source} doc={body} onOpenChange={setSource} />
          {editing && <DetailsDrawer open={details} id={editing.id} captures={captures} onOpenChange={setDetails} onOpen={openAny} />}
        </ResizablePanel>

        {!focus && panelDrawn && <ResizableHandle withHandle />}
        {!focus && panelDrawn && (
          <ResizablePanel defaultSize={`${PANEL_WIDTH - 1}px`} minSize="30%">
            <SidePanel tab={tab} setTab={setTab} captures={captures} editing={editing?.id} onOpen={openCapture} onOpenAny={openAny} reading={reading?.id} onRead={(items, start) => setReadList({ items, start })} />
          </ResizablePanel>
        )}
      </ResizablePanelGroup>
    </div>
    </TooltipProvider>
  )
}

/**
 * A link card still fetching its page when the note is sent goes as its plain
 * address: the fetch that would fill it is left behind with the box, and the
 * saved link is made its card afterwards (lib/link-card.ts).
 */
function cardsSettled(doc: JSONContent | null): JSONContent | null {
  if (!doc?.content) return doc
  const walk = (node: JSONContent): JSONContent =>
    node.type === 'bookmark' && node.attrs?.loading
      ? { type: 'paragraph', content: [{ type: 'text', text: String(node.attrs.href) }] }
      : node.content ? { ...node, content: node.content.map(walk) } : node
  return walk(doc)
}

/**
 * A quote whose line ends "- Name" (or "- Name, Source") with that name in Who said it: kept
 * without the tail, so the name is said once, as its signature.
 */
function withoutTail(doc: JSONContent | null, who: string): JSONContent | null {
  if (!doc?.content || !who) return doc
  const at = doc.content.findIndex((node) => node.content?.some((one) => one.text?.trim()))
  const block = doc.content[at]
  const last = block?.content?.[block.content.length - 1]
  const tail = new RegExp(`(["”'])\\s*[-–—]\\s*${who.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s*,[^"”']*)?\\s*$`)
  if (!block?.content || !last?.text || !tail.test(last.text)) return doc
  const content = [...block.content.slice(0, -1), { ...last, text: last.text.replace(tail, '$1') }]
  return { ...doc, content: doc.content.map((node, i) => (i === at ? { ...block, content } : node)) }
}

/**
 * Escape puts the window away, the way it does in Raycast's notes.
 *
 * Only once nothing else wants it. A menu closes, the find bar closes, vim
 * leaves visual mode - each of those says so by preventing the default, and
 * this asks rather than keeping its own list of what might be open. The list
 * was always going to be missing whatever was added last.
 *
 * With Vim on, Escape in insert mode goes to normal mode first, as it does in
 * vim, so hiding the box takes a second press. Normal mode, vim's resting
 * state, does not claim it, or Escape could never reach the window from
 * inside the editor. Vim is off unless turned on.
 */
function useEscapeToHide(): void {
  useEffect(() => {
    // The editor marks every Escape as handled, so whether it was spent is
    // read before it gets there: in the editor, Escape hides the window only
    // when nothing else would take it (no menu open, no words selected, and
    // vim, if on, already at rest in normal mode).
    let free = false
    // A menu or picker open when Escape came: that Escape closes it, never the window.
    let layered = false
    const before = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      layered = !!document.querySelector('[role=menu], [role=listbox], [role=dialog], .tiptap-suggestion-popup, [cmdk-root]')
      const editor = (event.target as Element | null)?.closest?.('.ProseMirror')
      if (!editor) return void (free = false)
      const mode = editor.getAttribute('data-vim-mode')
      free = (!mode || mode === 'normal') && (window.getSelection()?.isCollapsed ?? true) &&
        !document.querySelector('[role=menu], [role=listbox], [role=dialog], .tiptap-suggestion-popup, [cmdk-root]')
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if ((event.defaultPrevented && !free) || layered) return void (layered = false)
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
  after,
  tokens = TAGS
}: {
  /** Under the words, inside their scroll: the note's mentions, for one already kept. */
  after?: React.ReactNode
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
  return (
    // mf-faded: the note fades out at its top and bottom edges as it scrolls,
    // the way Raycast Notes reads, instead of being cut by a hard line. No
    // card edge or shadow of its own: the box is one frosted sheet throughout.
    <div className="mf-faded relative flex min-h-0 w-full flex-1 flex-col overflow-hidden"
      style={{ transform: 'translate(0,0)' }}>

      {/* The same, spelled out. See `docs/components.md` for what each one
          does and what it is when you leave it out. */}
      <MindflowEditor
        shape="document"
        placeholder="Write a thought, a quote, a link… or type / for more"
        defaultContent={initial}
        tokens={tokens}
        onTokenClick={(token) => token.name === 'tag' && onTag(token.value)}
        onToggleSource={onSource}
        // documentId={note ? `doc-${note.id}` : null}
        foldKey={from ? `capture-${from}` : undefined}

        // --- what is switched on ---
        // No fixed toolbar: the dock would sit over the capture prompt. The
        // selection toolbar keeps its default contents.
        toolbar={{ fixed: false, selectionExtra: selectionActions({ captureId: from, from, onLifted: (id) => keepLifted([...lifted, id]), takeOut: !from }) }}
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
        after={after}
        // A focus session running, the time and the words written show at the foot.
        foot={(editor) => <SessionFooter editor={editor} note={from ? `capture-${from}` : 'box'} />}
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

/** Who and where under the writing: empty or filled, the same quiet pill, so an empty one still reads as a field. */
const FIELD = 'field-sizing-content min-w-28 max-w-60 shrink-0 text-ellipsis rounded-full border border-foreground/10 px-2 py-0.5 text-meta placeholder:text-muted-foreground hover:border-foreground/20 focus:border-foreground/20'

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
  // The tabs in your own order (dragged along the row, or moved from a right click).
  const tabSaved = useOrder('boxTabsOrder')
  const tabOrder = useInOrder(BOX_TABS, 'boxTabsOrder', (one) => one.id).map((one) => one.id as Tab)
  const lastTab = useRef(tab)
  const travel = useRef(1)
  if (lastTab.current !== tab) {
    travel.current = Math.sign(tabOrder.indexOf(tab) - tabOrder.indexOf(lastTab.current)) || 1
    lastTab.current = tab
  }
  // The same easing as the main window's lists.
  useSmooth(scroller)
  const due = useLive(() => window.api.vigil('review:counts') as Promise<number>, 0, [], ['item'])
  // Each tab counts what it holds, so a thing sent there visibly arrives:
  // every open task, dated or not (a list of fourteen made at once reads as
  // fourteen, never as the one due today), every nugget and article.
  const openTasks = useLive(() => vigil.tasks().then((tasks) => tasks.filter((task) => task.status === 'open').length), 0)
  // Archived ones are out of sight, so not counted.
  // Questions held open count as kept too; settled ones do not.
  const kept = useLive(() => Promise.all([vigil.items('nugget'), vigil.items('article'), vigil.items('question')]).then((all) => all.flat().filter((one) => !one.archivedAt && !one.closedAt).length), 0, [], ['item'])
  // The inbox is what has no exit yet; what is handled lives in All captures.
  const open = captures.filter((capture) => capture.status === 'open' && !capture.archivedAt)
  // The Inbox emptied here, in front of you: its moment (inbox-zero.tsx).
  const cleared = useJustCleared(open, captures, !unloaded(captures))
  // The same Display menu as the main window's inbox: filter, sort, group.
  // Every capture, starting on those with no exit: Display's Status reaches
  // the handled and discarded ones without leaving the prompt.
  const { groups, display, chips, density } = useCaptureDisplay('prompt:captures', captures, { status: ['open'] })
  const shown = groups.flatMap(([, list]) => list)
  // x picks several, the way it does in the main window, for one exit on all.
  const [chosen, setChosen] = useState<string[]>([])
  // Several made one task, from the bar or ⌘K: its name starts as the first one's title.
  const makeOne = (): void => {
    const ids = chosen
    void oneTask(ids, captures.find((capture) => capture.id === ids[0])?.label ?? '').then((made) => made && setChosen([]))
  }
  // ⌘A picks every capture on show, outside the writing; Escape lets them go.
  // ⌫ on what is picked (or the row under the cursor): to the Bin at once, with Undo.
  const binRefs = (ids: string[]): { type: string; id: string; status?: string }[] =>
    ids.map((id) => ({ type: 'capture', id, status: captures.find((one) => one.id === id)?.status }))
  const toBin = (ids: string[]): void => void moveToBin(binRefs(ids)).then((n) => n && setChosen([]))
  const cursorAt = useRef(-1)
  const selectAll = useSelectAll(() => shown.map((one) => one.id), chosen, setChosen, { enabled: tab === 'inbox', onDelete: toBin, current: () => shownNow.current[cursorAt.current]?.id, titleOf: (id) => captures.find((one) => one.id === id)?.label })
  const allPicked = shown.length > 0 && shown.every((one) => chosen.includes(one.id))
  const choose = (id: string): void => setChosen((ids) => (chime(ids.includes(id) ? 'off' : 'on'), ids.includes(id) ? ids.filter((one) => one !== id) : [...ids, id]))
  // A task for each one picked, made as "Make it a task" makes one.
  const makeEach = (): void =>
    void makeTasks(chosen.flatMap((id) => {
      const capture = captures.find((one) => one.id === id)
      return capture ? [{ id, title: capture.label, private: !!capture.private, capture: true as const, open: capture.status === 'open' }] : []
    })).then((made) => made && setChosen([]))
  useEffect(() => {
    picked.ids = chosen
    const onAsk = (): void => void (chosen.length > 1 && makeOne())
    window.addEventListener('vigil:one-task', onAsk)
    return () => {
      window.removeEventListener('vigil:one-task', onAsk)
      picked.ids = []
    }
  })
  const shownNow = useRef(shown)
  shownNow.current = shown
  // Only what is waiting on you is counted: the inbox is somewhere to set
  // things down, reassurance, never a queue with a number on it.
  const counts: Partial<Record<Tab, number>> = { today: openTasks, review: due, kept }
  // The tabs you keep (Settings, or a right click on the row); one reached by
  // its key or ⌘K shows while it is open.
  const shownTabs = useShown('boxTabs')
  const tabs = tabOrder.map((id) => BOX_TABS.find((one) => one.id === id)!).filter((one) => shownTabs.includes(one.id) || one.id === tab) as (Place & { id: Tab })[]
  // The same keys as every list: j and k when the editor does not have the
  // focus, Enter to open. ⌃1 to ⌃4 switch tabs from anywhere in the window.
  const [cursor, setCursor] = useListKeys(shown.length, { onOpen: (index) => onOpen(shown[index].id), enabled: tab === 'inbox' })
  cursorAt.current = cursor
  // On the row under the cursor: x picks it, and P, R and D take the exit the
  // right-click menu shows them beside.
  useEffect(() => {
    if (tab !== 'inbox') return
    const onKey = (event: KeyboardEvent): void => {
      if (typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      // A focused card takes its own P, R and D.
      if ((event.target as Element | null)?.closest?.('[data-card]')) return
      // An open menu takes its own Escape: closing it keeps what is picked.
      if (event.key === 'Escape' && chosen.length && !document.querySelector('[role="menu"]')) {
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
      chime('resolve')
      const skipped = ids.length - moved.length
      toast(`Resolved ${num(moved.length)}: done with, still in All captures${skipped ? `. ${num(skipped)} already dealt with stayed as ${skipped === 1 ? 'it was' : 'they were'}` : ''}`, () => void Promise.all(moved.map((one) => window.api.captures.save(one.id, { status: one.was }))))
    })
  }

  return (
    <div className="relative flex h-full w-full flex-col p-2">
      <div data-hover-quiet className="mb-2 flex gap-1 rounded-lg border border-foreground/10 bg-foreground/[0.045] p-0.5 text-sm">
        {/* Drag a tab along the row into your own order. Right click one to move it a step, or to show or hide a tab; the last one stays. */}
        <SortableList axis="x" items={tabs} keyOf={(one) => one.id} onMove={dropOrder('boxTabsOrder', BOX_TABS.map((one) => one.id), (id) => BOX_TABS.find((one) => one.id === id)?.label)}>
        {(row) => row.map((one) => (
          <SortableRow key={one.id} id={one.id} glide={`box-tab-${one.id}`} className="flex min-w-0 flex-1">
          <RowMenu items={[
            ...orderItems({ setting: 'boxTabsOrder', usual: BOX_TABS.map((each) => each.id), id: one.id, among: row.map((each) => each.id), what: 'The tabs', name: one.label, sideways: true }, tabSaved.length > 0),
            'separator',
            ...BOX_TABS.filter((each) => !(shownTabs.length === 1 && shownTabs[0] === each.id)).map((each) => {
              const on = shownTabs.includes(each.id)
              return { label: `${on ? 'Hide' : 'Show'} ${each.label}`, run: () => void vigil.setSettings({ boxTabs: on ? shownTabs.filter((id) => id !== each.id) : [...shownTabs, each.id] }).then(() => chime(on ? 'off' : 'on')) }
            })
          ]}>
          <span className="flex min-w-0 flex-1">
          <Tip label={`${one.id === 'today' && counts.today ? `${num(counts.today)} open ${counts.today === 1 ? 'task' : 'tasks'}, dated or not  ` : ''}⌃${TABS.indexOf(one.id) + 1}`}>
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
              <motion.span layoutId="prompt-tab" className="absolute inset-0 -z-10 rounded-md border border-foreground/15 bg-foreground/[0.08]" transition={byKeys() ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 38 }} />
            )}
            {one.label}
            {counts[one.id] ? <span className="text-xs tabular-nums text-muted-foreground"><Rolling text={counts[one.id]!} /></span> : null}
          </button>
          </Tip>
          </span>
          </RowMenu>
          </SortableRow>
        ))}
        </SortableList>
      </div>
      {/* Never waits for the old tab to leave. ⌃1 ⌃2 ⌃3 are pressed all day,
          so a tab reached by its key is simply there; a click slides it in
          from the side its tab sits on. */}
      <AnimatePresence mode="popLayout" initial={false} custom={travel.current}>
      <motion.div
        key={tab}
        custom={travel.current}
        variants={{
          from: (by: number) => ({ opacity: 0, transform: shift(`translateX(${12 * by}px)`) }),
          here: { opacity: 1, transform: shift('translateX(0px)') },
          // The old tab gets out of the way fast, so the two barely overlap.
          gone: (by: number) => byKeys()
            ? { opacity: 0, pointerEvents: 'none', transition: { duration: 0 } }
            : { opacity: 0, transform: shift(`translateX(${-12 * by}px)`), pointerEvents: 'none', transition: { opacity: { duration: 0.07 }, transform: { duration: 0.14, ease: EASE } } }
        }}
        initial={byKeys() ? false : 'from'}
        animate="here"
        exit="gone"
        transition={{ duration: 0.2, ease: EASE }}
        className="flex min-h-0 flex-1 flex-col"
      >
        {/* Two kinds of thing, two places: what is waiting on you stays put,
            and only your captures scroll under it. A rule between them, not a
            shadow: a shadow on paper read as a smudge. */}
        {tab === 'inbox' && (
          <div className="relative z-10 shrink-0 border-b border-border/70">
            <Pins onOpen={onOpenAny} />
            {/* The passes are things to do; the cards under them are a section: a rule and room between the two,
                and neither when there are no cards under them. */}
            <PassLinks className="px-1 pb-2 [&:not(:last-child)]:mb-3 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border/50" />
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
                      <span className="mr-auto font-medium text-foreground"><Rolling text={chosen.length} /> selected</span>
                      <Tip label="A task for each, linked to its note">
                        <Button variant="ghost" size="sm" onClick={makeEach}>{chosen.length === 1 ? 'Make it a task' : `Make ${num(chosen.length)} tasks`}</Button>
                      </Tip>
                      <Button variant="ghost" size="sm" onClick={() => bulk('resolved')}>Resolve</Button>
                      {/* Short for the narrow panel: the icon and its tip say where they go. */}
                      <Tip label={`Move to the Bin, where ${chosen.length === 1 ? 'it' : 'they'} can come back  ⌫`}>
                        <Button variant="ghost" size="sm" aria-label="Move to the Bin" onClick={() => toBin(chosen)}><TrashIcon size={14} /> Bin</Button>
                      </Tip>
                      {/* An icon only: the panel is narrow, and the tip says it in words. */}
                      <Tip label={chosen.length === 1 ? 'Add a tag…' : `Add a tag to all ${num(chosen.length)}…`}>
                        <Button variant="ghost" size="icon-sm" aria-label="Add a tag…" onClick={() => void tagCaptures(chosen)}><Hashtag className="size-3.5" /></Button>
                      </Tip>
                      {!allPicked && (
                        <Tip label="Every capture on show  ⌘A">
                          <Button variant="ghost" size="sm" onClick={selectAll}>Select all</Button>
                        </Tip>
                      )}
                      <Tip label="Clear the selection  Esc">
                      <Button variant="ghost" size="icon-sm" onClick={() => (chime('off'), setChosen([]))} aria-label="Clear the selection"><X className="size-3.5" /></Button>
                      </Tip>
                    </>
                  ) : (
                    <>
                      <Tip label="Every capture still waiting for you; the sort and view menu (F) shows the rest under “Status”. X selects several.">
                        <h3 className="w-fit whitespace-nowrap">{shown.length === open.length ? 'Inbox' : `${num(shown.length)} shown`}</h3>
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
                <div className="px-1 pb-3 empty:hidden">{chips}</div>
                {shown.length > 0 && <CaptureList groups={groups} density={density} selected={editing} cursor={cursor} onCursor={setCursor} chosen={chosen} onPick={onOpen} onChoose={choose}
                  // Right-clicked among several picked, the menu speaks for all of them.
                  menu={(capture, usual) => chosen.includes(capture.id) && chosen.length > 1 ? [
                    { label: `Make ${num(chosen.length)} tasks`, run: makeEach },
                    { label: 'Make one task from them', run: makeOne },
                    'separator',
                    { label: `Resolve ${num(chosen.length)}`, run: () => bulk('resolved') },
                    { label: `Add a tag to ${num(chosen.length)}…`, run: () => void tagCaptures(chosen) },
                    'separator',
                    binItem(binRefs(chosen), () => setChosen([])),
                    'separator',
                    !allPicked && { label: 'Select all', keys: '⌘A', run: selectAll },
                    { label: 'Clear the selection', keys: 'esc', run: () => (chime('off'), setChosen([])) }
                  ] : [...usual, 'separator', { label: chosen.includes(capture.id) ? 'Unselect' : 'Select', keys: 'X', run: () => choose(capture.id) }, shown.length > 1 && !allPicked && { label: 'Select all', keys: '⌘A', run: selectAll }]} />}
                {!shown.length && !unloaded(captures) && (
                  !captures.length ? (
                    <Example compact tryIt="write a thought on the left and send it with ⌘↵. It waits here.">
                      <CaptureList groups={[['', exampleInbox()]]} density={density} cursor={-1} onPick={() => undefined} />
                    </Example>
                  ) : open.length ? (
                    <Empty compact title="Nothing matches">The filters hide everything here. Clear them with the × above, or press F to change them.</Empty>
                  ) : (
                    <Rest compact seed="inbox">{cleared?.how === 'binned' ? <InboxBinned compact left={cleared.left} /> : cleared ? <InboxZero compact onReview={() => setTab('review')} onRead={(row) => onOpenAny(row.type, row.itemId)} /> : <Empty compact title={captures.length ? 'Nothing waiting' : 'Nothing caught yet'}>{captures.length ? 'Every capture has been dealt with. Write the next thought on the left.' : 'Write a thought on the left and send it with ⌘↵: it waits here.'}</Empty>}</Rest>
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



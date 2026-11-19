import { themeActions } from '@/lib/theme'
import { deskAwayAction, useDeskAway } from '@/lib/desk-away'
import { useReadsIn } from './lib/reads-in'
import { clock } from '@/lib/clock'
import { carryWindow } from '@/lib/carry'
import { useStickiesOut } from '@/lib/stickies-out'
import { useAbandonAction } from '@/lib/abandon'
import { usePracticeActions } from '@/lib/practices'
import { LivingCaret } from '@/components/haligtree/day-writing'
import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { cardUp, cardsUp } from './lib/link-card'
import { AnimatePresence, motion } from 'motion/react'
import { EASE, byKeys, shift, spring } from './lib/motion'
import { applyRoom, morphBox } from './lib/box-morph'
import CameraIcon from '@/components/ui/camera-icon'
import CameraOffIcon from '@/components/ui/camera-off-icon'
import type { Editor, JSONContent } from '@tiptap/core'

import { convertImports } from './lib/convert-imports'
import { HaligtreeEditor, TAGS, currentVim, foldEverything, goToHeading, onVimChange, setVim } from './components/haligtree'
import { settleVim } from './lib/vim'
import { EXITS, exit, exitMany, findCaptures, findHeadings, follow } from './lib/capture-links'
import { madeByLink } from './extensions/note-link'
import { toMarkdown } from './lib/export'
import { useSameWords } from './lib/same-words'
import { CaptureList, inInboxWindow, selectionWays, tagCaptures, useCaptures, type CaptureMeta } from './components/capture-list'
import { Example } from './components/haligtree/example'
import { exampleInbox } from './lib/examples'
import { Waiting, textOf } from './components/rot-cards'
import { BOX_PINS } from './components/pins'
import { THROWS, comboOf } from './lib/keys'
import { GraphChip, InboxGraph, useGraphShown } from './components/haligtree/inbox-graph'
import { HintCard, HintRoom } from './components/hint-card'
import { createPortal, flushSync } from 'react-dom'
import { TodayPanel } from './components/haligtree/today-panel'
import { BoxGlance, type Glance } from './components/haligtree/box-glance'
import { selectionActions } from './components/haligtree/selection-actions'
import { ReviewView } from './components/haligtree/review-view'
import { SessionFooter } from './components/haligtree/session-footer'
import { afterPaint, shownName, unloaded, useAppearance, useInboxDays, useLive, warmLive } from './lib/haligtree'
import { allRecorded, moveOldRecordable, recordAll } from './lib/recordings'
import { BackToTop, Empty, Kbd, Remembered, Strip, StripSlot, typing, useListKeys, useReadKey, useSmooth, FocusNote, useFocusMode, startAt, quietly } from './components/haligtree/ui'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip'
import { cn } from '@/lib/cn'
import { Count, Rolling, Toaster, Typed, refuse, sayNow, toast, whyFailed } from './components/haligtree/ui'
import { beam } from './components/haligtree/beam'
import { Reader } from './components/haligtree/reader'
import { OptionsMenu, PointMenu, type Section } from './components/haligtree/options-menu'
import { useZen } from './lib/zen'
import { ReadThrough, type Readable } from './components/haligtree/read-through'
import { Passes, openPass } from './components/haligtree/pass'
import { assetsOf } from './lib/document'
import { tagsOf, type TokenPattern } from './extensions/tokens'
import { KeptPanel } from './components/haligtree/kept-panel'
import { startQuestion } from './components/haligtree/questions-view'
import { clueInto } from './components/haligtree/pinned-questions'
import { logInto } from './components/haligtree/goals-view'
import { BoxOffers, askedLine } from './components/haligtree/box-offers'
import { RecentPanel } from './components/haligtree/recent-panel'
import { BOX_TABS, dropOrder, orderItems, useInOrder, useOrder, useShown, type Place } from './components/haligtree/places'
import { SortableList, SortableRow } from './components/haligtree/sortable'
import { RowMenu } from './components/haligtree/row-menu'
import { CaptureProps, GoThrough, useCaptureDisplay } from './components/haligtree/captures-view'
import { useShowOpen } from './components/haligtree/islands'
import { Search } from './components/search'
import { InboxBinned, InboxZero, useJustCleared } from './components/haligtree/inbox-zero'
import { keepTyped } from './lib/keep-typed'
import { notePromoted } from './lib/promote'
import { noteActions, useOpenNote } from './lib/notes'
import { haligtree, type Item, type PinnedQuestion, type Settings } from './lib/haligtree'
import { wearFinish } from './components/haligtree/review-toolbar'
import { markFromBox } from './lib/milestones'
import { makeListTasks, makeTask, makeTasks, oneTask, picked, taskName } from './lib/tasks'
import { boxKind, boxList } from './lib/line-tasks'
import { openSort } from './lib/sort-out'
import { tasksSaid } from '../../main/day-lines'
import { useSelectAll } from './lib/select-all'
import { listInFront, useListScope } from './lib/list-front'
import { usePicking } from './lib/pick-range'
import { PickDays } from './components/haligtree/late-tasks'
import { binItem, moveToBin } from './lib/to-bin'
import TrashIcon from './components/ui/trash-icon'
import { WillDo, TokenHint } from './components/haligtree/will-do'
import { boxTokensPlugin, boxGuess, withoutWord, keepPlain, keptMessage, planNow, rearm, replan, type BoxContext, type BoxPlan, type BoxToken } from './lib/box-tokens'
import { chime, soundOn } from './lib/sound'
import { liftFrom } from './lib/fly-home'
import { lengthSaid } from './lib/timer'
import { stickOnDesktop } from './components/haligtree/sticky-note'
import { NotePreview } from './components/haligtree/note-preview'

import { CAPTURE_TYPES, CaptureKindPicker, asksFor, type CaptureType } from './components/capture-kinds/capture-kind-picker'
import { firstLine, saidBy } from '../../main/import'
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
import { Tip, Pressed, untoast } from '@/components/haligtree/ui'
import { MicIcon, recordAsCapture, recordInto } from '@/components/haligtree/voice-note'
import { MEETING_WORDS, recordMeeting } from '@/lib/meeting'
import { recordingNow, useRecording } from '@/lib/recording'
import { recordingsWithoutWords, transcribePage } from '@/lib/transcribe'
import { Celebrations } from '@/components/haligtree/celebrate'
import { Mentions } from '@/components/haligtree/mentions'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import LayoutSidebarRightIcon from '@/components/ui/layout-sidebar-right-icon'
import GearIcon from '@/components/ui/gear-icon'
import PenIcon from '@/components/ui/pen-icon'
import { AliveIcon } from '@/components/ui/alive-icon'
import { RoundPair, ShotButton, type RoundChoice } from '@/components/haligtree/shot-button'
import { talkInto, useTalking } from '@/components/haligtree/talk'
import { AppWindow, AudioLines, TextCursorInput } from 'lucide-react'
import type { BoxFrom } from '../../main/site-block'

/** The microphone's two ways, as the camera's two: a voice note kept as sound, or the words typed as you talk. */
const VOICE_CHOICES: RoundChoice[] = [
  { id: 'record', label: 'Record: a voice note, kept in the note', Icon: AudioLines },
  { id: 'dictate', label: 'Dictate: talk, and the words are typed', Icon: TextCursorInput }
]
import { useStoredFlag } from '@/lib/use-stored-flag'
import { ShortcutSheet } from '@/components/haligtree/shortcut-sheet'
import { WordNotes } from '@/components/haligtree/term'
import { FocusScenery, Rest } from './components/haligtree/scenery'
import { brief, dayjs, num, plural } from '../../main/dates'
import { holdKeys, useLesson, useWelcomePlaceholder, useWelcoming } from './lib/welcome-box'
import { SandboxChip } from '@/components/haligtree/sandbox'
import { DefineGhost, defineable, fixIn, useDefinition } from '@/components/haligtree/word-define'
import { notes } from './lib/notes'
import { sources } from './lib/sources'
import { DatePicker } from './components/haligtree/date-picker'
import { useFitBox } from './lib/fit-box'
import { caretTakesEscape, menuShowing, layerOpen, menuOpen } from '@/lib/menu-keys'
import { clip, quoted } from '../../main/clip'
import { soundTitle } from './components/haligtree/sound-player'
import { ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight, EyeOff, Tag as Hashtag, X } from '@/components/ui/icons'
import { kMeansLink } from './extensions/link-tidy'
import { BIG_PASTE, BigPaste } from './extensions/big-paste'
import { breath, markdownToDocumentGently } from './lib/markdown-doc'
import { sizeOfStored } from './lib/note-size'
import { APP_NAME } from '../../main/name'
import { domOf } from '@/lib/editor-dom'
import { ArrowUpDown, Layers2 } from 'lucide-react'
import { isCollecting, startCollect, stopCollect } from '@/extensions/collect'
import { clearRoom } from '@/lib/clear-room'
import { Apart } from '@/lib/apart'

/**
 * A small window (main/small-window.ts): this same page in a window of its own that holds one note, saved as it is
 * written, so quick capture stays free for everything else. Its address names the note ('capture:id', or another
 * kind's 'type:id'; a new one is an empty capture main made for it). It has no draft of its own: quick capture's draft
 * and leftover are never read or written from one.
 */
const SMALL = new URLSearchParams(location.search).get('small')
// Its card's look from the first frame (main.css, data-small): the window is see-through until the card is drawn.
// Clicks in the clear room under the card pass to the app behind, as round a sticky (lib/clear-room.ts).
// Growing (data-small-auto) until main says it was resized by hand, so its card never shows filling the window first.
if (SMALL) (document.documentElement.dataset.small = '', document.documentElement.setAttribute('data-small-auto', ''), clearRoom())
/**
 * A small window's note taken by a note's own window (one note, one window): its place here says so, with the way to
 * that window and back, as the main window's place does (lib/apart.tsx); back, it is read afresh. Elsewhere, the page.
 */
function SmallHold({ note, title, hidden, onBack, children }: { note: { id: string } | null; title: string; hidden: boolean; onBack: () => void; children: React.ReactNode }): React.JSX.Element {
  if (!note) return <>{children}</>
  return <Apart type="capture" id={note.id} title={title || null} hidden={hidden} onBack={onBack}>{children}</Apart>
}
/** Put away: quick capture hides; a small window closes, its note kept where it lives. */
const putWindowAway = (): void => (SMALL ? window.close() : window.api.hideWindow())

/**
 * A new note half written, kept as you type so it survives quitting and
 * reading old captures. Only if it holds anything.
 */
const readDraft = (): JSONContent | undefined => {
  if (SMALL) return undefined
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
  if (SMALL) return
  try {
    const text = JSON.stringify(doc)
    if (localStorage.getItem('capture-draft') === text) return
    localStorage.setItem('capture-draft', text)
    // When it was last written in: an hour untouched, it is a leftover (see LEFTOVER_AFTER).
    localStorage.setItem('capture-draft-at', String(Date.now()))
  } catch {
    // Still in the box; only quitting now would lose it.
  }
}

/**
 * A draft untouched this long is a leftover, not what you came to write: the
 * box opens empty with the caret in it, and the leftover waits in a small
 * "Unsaved from earlier" chip under the writing line, one click from coming back.
 */
const LEFTOVER_AFTER = 60 * 60_000
/**
 * How long the offer lasts, and how often it may be passed by: a day, or three opens it was shown on and left; and a
 * new capture saved puts it away for good. A draft of a word or two under three letters is not worth offering.
 */
const LEFTOVER_KEEPS = 24 * 60 * 60_000
const LEFTOVER_SHOWN = 3
const forgetLeftover = (): void => ['capture-leftover', 'capture-leftover-at', 'capture-leftover-shown'].forEach((key) => localStorage.removeItem(key))
const readLeftover = (): JSONContent | null => {
  if (SMALL) return null
  try {
    const saved = JSON.parse(localStorage.getItem('capture-leftover') ?? 'null') as JSONContent | null
    const at = Number(localStorage.getItem('capture-leftover-at')) || 0
    const shown = Number(localStorage.getItem('capture-leftover-shown')) || 0
    const worth = !!saved && hasContent(saved) && (textOf(saved).replace(/\s+/g, '').length >= 3 || (saved.content ?? []).some((one) => one.type !== 'paragraph'))
    if (!worth || (at && Date.now() - at > LEFTOVER_KEEPS) || shown >= LEFTOVER_SHOWN) return (saved && forgetLeftover(), null)
    return saved
  } catch {
    return null
  }
}
/** What a leftover is, in a few words: its first line, or "Voice note · 0:56" for a recording alone. */
const leftoverName = (doc: JSONContent): string => {
  const line = shownName(firstLine(doc))
  if (line) return quoted(line, 28)
  let file: { name?: string; duration?: number } | null = null
  const walk = (node: JSONContent): void => {
    if (!file && node.type === 'attachment') file = node.attrs ?? {}
    node.content?.forEach(walk)
  }
  walk(doc)
  const found = file as { name?: string; duration?: number } | null
  if (!found) return 'a note'
  return /\.(mp3|m4a|weba|wav|ogg|aac|flac)$/i.test(found.name ?? '') ? soundTitle(found.name, found.duration ?? null) : quoted(found.name ?? 'a file', 28)
}

/** youtube.com is YouTube; anything else, its name with a capital. */
const SITES: Record<string, string> = { youtube: 'YouTube', youtu: 'YouTube', github: 'GitHub', linkedin: 'LinkedIn', x: 'X', twitter: 'X' }
const siteName = (host: string): string => {
  // The name before the domain's ending: en.wikipedia.org is Wikipedia.
  const parts = host.split('.')
  const name = (['co', 'com', 'org', 'ac', 'gov'].includes(parts.at(-2) ?? '') ? parts.at(-3) : parts.at(-2)) ?? parts[0]
  // example-university is Example University: words, each with a capital.
  return SITES[name] ?? name.split(/[-_]+/).filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

/**
 * A link's site in words: the name a page's title ends with when it matches
 * the address ("Deal with the Devil - Wikipedia", "… | The New York Times"
 * on nytimes.com), else the address's own name.
 */
const linkSite = (url: URL, title = ''): string => {
  const plain = siteName(url.hostname)
  const tail = title.match(/\s[-|–—·:]\s([^-|–—·:]{2,40})$/)?.[1]?.trim()
  const squash = (words: string): string => words.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '')
  return tail && (squash(tail).includes(squash(plain)) || squash(plain).includes(squash(tail))) ? tail : plain
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
      onClick={putWindowAway}
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

/**
 * The header's one shape: the window's pill (new, actions, panel) and the
 * chips beside it ("2 pinned", Safe) share its height, hairline and fill, so
 * the top right reads as one group rather than two kinds of thing.
 */
const HEADER_SHAPE = 'h-[28px] rounded-full border border-foreground/15 bg-[color-mix(in_oklab,var(--background)_max(60%,var(--mf-window-tint,20%)),transparent)]'

const Header = ({ panel, drawn, onPanel, onNew, onBrowse, onAutoSize, menu, nav, title, aside }: {
  panel: boolean
  /** The panel is on screen, or still gliding away. */
  drawn: boolean
  /** None in "One line to start", which has no side panel: no button that would do nothing. */
  onPanel?: () => void
  onNew: () => void
  /** A small window's: another note in this window, picked by name. */
  onBrowse?: () => void
  /** A small window resized by hand: growing with the words again. */
  onAutoSize?: () => void
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
      // Quick capture's own expander: a small window sizes itself (Auto-size) or by its edges.
      if (SMALL || event.key.toLowerCase() !== 'f') return
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
    // The chip's step aside for the pill (a transform, so not in its width) counted in
    // always, so the title never re-centres as the pointer comes and goes.
    const aside = (): number => (at.querySelector('[data-aside]') ? parseFloat(getComputedStyle(document.documentElement).fontSize) * 5.75 : 0)
    const measure = (): void => {
      const wide = Math.max(at.offsetWidth + aside(), at.querySelector<HTMLElement>('.mf-pill')?.offsetWidth ?? 0)
      setRoom(wide)
      // Quick capture's hint above the card stops short of this whole row ("1 pinned" and the round controls), however wide.
      document.documentElement.style.setProperty('--mf-top-row', `${wide}px`)
    }
    const watch = new ResizeObserver(measure)
    watch.observe(at)
    return () => watch.disconnect()
  }, [])

  // Where Back and Forward end, so the centred title starts clear of them (it sat under the pill).
  const back = useRef<HTMLSpanElement>(null)
  const [backEnd, setBackEnd] = useState(0)
  useEffect(() => {
    const at = back.current
    if (!at) return
    const measure = (): void => setBackEnd(at.offsetWidth ? at.offsetLeft + at.offsetWidth + 12 : 0)
    const watch = new ResizeObserver(measure)
    watch.observe(at)
    return () => watch.disconnect()
  }, [])

  return (
    <div data-drag-strip="" className="h-fit fixed top-0 right-0 left-0 z-10 flex flex-col items-center pt-2.5 pb-2 text-xs cursor-pointer" style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
      {/* Over the panel, the icons end where the panel's own edge does; the
          move there takes the window's glide, its length and its curve, on a
          transform (the strip's padding stays put). */}
      {/* A small window's controls sit in its corners, where a window's are (Raycast Notes keeps its lights there). */}
      <div className="mf-top-row relative flex w-full items-center gap-1"
        style={{ padding: SMALL ? '0rem 0.875rem' : '0rem 4.75rem' } as CSSProperties}>
        <WindowDots />
        <span ref={back} style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>{nav}</span>
        {/* The note's name, faint, once its first line has scrolled away, so
            a long note still says what it is: centred over the writing, a
            short line at most, never over the side panel or the window dots. */}
        <span className="flex-1" />
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center" style={{ ...(drawn ? { width: BOX_WIDTH } : { right: 0 }), paddingInline: Math.max(160, backEnd, drawn ? 0 : room + 84) }}>
        <AnimatePresence>
          {title && (
            <motion.span
              key="title"
              initial={{ opacity: 0, transform: shift('translateY(4px)') }}
              animate={{ opacity: 1, transform: shift('translateY(0px)') }}
              // Out quicker than in: it gets out of the way of the line coming back.
              exit={{ opacity: 0, transform: shift('translateY(-4px)'), transition: { duration: 0.1, ease: EASE } }}
              transition={{ duration: 0.16, ease: EASE }}
              className="pointer-events-none min-w-0 max-w-[34ch] truncate text-control text-muted-foreground"
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
        <span ref={top} className="mf-top relative flex items-center transition-transform duration-[240ms] ease-(--mf-ease) motion-reduce:transition-none" style={{ transform: panel ? 'translateX(4rem)' : 'translateX(0rem)' }}>
        {aside && <span data-aside className="transition-transform delay-150 duration-150 ease-(--mf-ease) motion-reduce:transition-none [.mf-top:has([data-state=open])_&]:-translate-x-[calc(4.625rem+0.375rem)] [.mf-top:has([data-state=open])_&]:delay-0 [.pointer-in_&]:-translate-x-[calc(4.625rem+0.375rem)] [.pointer-in_&]:delay-0">{aside}</span>}
        <span
          data-zen-target
          className={`mf-pill absolute right-0 flex items-center overflow-hidden mf-segs ${HEADER_SHAPE} opacity-0 transition-opacity duration-150 [.pointer-in_&]:opacity-100 [.pointer-in_.mf-top:has([data-aside])_&]:delay-150 has-[[data-state=open]]:opacity-100`}
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        >
          {/* Resized by hand, a small window stops growing with the words: this gives it back (and the menu's
              “Auto-size”). In its bottom row it pushed “Close note” past the edge; floated, it covered the row. */}
          {onAutoSize && (
            <Tip label="Auto-size: grow with the words again">
              <button type="button" tabIndex={-1} aria-label="Auto-size" data-small-auto className="mf-seg relative flex size-[22px] after:absolute after:-inset-0.5 after:rounded-full items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent/60"
                onMouseDown={(event) => event.preventDefault()} onClick={onAutoSize}>
                <ArrowUpDown className="size-3.5" strokeWidth={1.75} />
              </button>
            </Tip>
          )}
          <Tip label={SMALL ? 'New note in this window  ⌘N' : 'New capture  ⌘N'}>
            <button type="button" tabIndex={-1} aria-label={SMALL ? 'New note' : 'New capture'} className="mf-seg relative flex size-[22px] after:absolute after:-inset-0.5 after:rounded-full items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              onMouseDown={(event) => event.preventDefault()} onClick={onNew}>
              <AliveIcon icon={PenIcon} size={14} />
            </button>
          </Tip>
          {onBrowse && (
            <Tip label="Another note in this window  ⌘P">
              <button type="button" tabIndex={-1} aria-label="Browse notes" data-small-browse className="mf-seg relative flex size-[22px] after:absolute after:-inset-0.5 after:rounded-full items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                onMouseDown={(event) => event.preventDefault()} onClick={onBrowse}>
                <Layers2 className="size-3.5" strokeWidth={1.75} />
              </button>
            </Tip>
          )}
          <span className="mf-seg flex">{menu(expanded, toggle)}</span>
{onPanel && (
          <Tip label={`${panel ? 'Hide' : 'Show'} Inbox, Tasks, Review, Saved and Recent  ⌘\\`}>
            <button type="button" tabIndex={-1} data-lesson="hide" aria-label={panel ? 'Hide the side panel' : 'Show the side panel'} aria-pressed={panel}
              className="mf-seg relative flex size-[22px] after:absolute after:-inset-0.5 after:rounded-full items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground aria-pressed:text-foreground"
              onMouseDown={(event) => event.preventDefault()} onClick={onPanel}>
              <AliveIcon icon={LayoutSidebarRightIcon} size={14} />
            </button>
          </Tip>
          )}
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
  // A pill grown by hand folds back first (see oneLine below).
  const foldPill = useRef<() => boolean>(() => false)
  useEscapeToHide(foldPill)
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
  }, (typed) => {
    // An example typing into the empty line: the chip guesses from it as it would from your words (a link is a Link, one word a Word).
    if (chosen || !editorRef.current?.isEmpty) return
    const guess = (typed.trim() && boxGuess(typed)) || 'note'
    setKind((now) => (now === guess ? now : guess))
  })
  const lesson = useLesson()
  // A name read from a quote's "- Name" tail, kept up to date while it is still ours, not yours.
  const autoWho = useRef('')
  const autoWhere = useRef('')
  useEffect(() => window.api.onHeld(heldNote), [])
  const [kind, setKind] = useState<CaptureType>('note')
  // A Check back's day, picked as the kind is: the calendar opens straight away, and the day stays on its button.
  const [backOn, setBackOn] = useState<string | null>(null)
  const [backAsk, setBackAsk] = useState(0)
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
    // Bookmarks come in already documents, so their cards are looked at here too.
    const landed = window.api.onImported(() => (convertImports(), void cardsUp()))
    return () => (clearTimeout(later), stop(), landed())
  }, [])

  // The window's controls show while the pointer is over it, from the page's own pointer events: quick capture has
  // no native drag strip any more (it is carried by lib/carry.ts), so the page hears the pointer everywhere in its
  // window, the clear room round the card included (its moves are forwarded there, lib/clear-room.ts).
  const [pointerIn, setPointerIn] = useState(false)
  useEffect(() => {
    const over = (): void => setPointerIn(true)
    const out = (event: PointerEvent): void => void (event.relatedTarget || setPointerIn(false))
    window.addEventListener('pointerover', over, true)
    document.documentElement.addEventListener('pointerleave', out)
    return () => (window.removeEventListener('pointerover', over, true), document.documentElement.removeEventListener('pointerleave', out))
  }, [])

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
  // The questions and goals the words did not match: one line in the gear menu shows them all.
  const [offersHidden, setOffersHidden] = useState(0)
  const [offersAll, setOffersAll] = useState(false)
  useEffect(() => void (!started && setOffersAll(false)), [started])
  // Who and where, as this kind (or a #book) asks; and what a tag that does something will do.
  const boxText = textOf(body)
  // The box holds one line, and it asks something: it is kept as a question in Writing, as a task line goes to the tasks. Picking a kind (× on its line) keeps it a note.
  const loneQuestion = (plan: BoxPlan | null, words: string): string | null =>
    !chosen && plan?.kind === 'note' && !plan.task && !plan.clue && !plan.miss && !plan.url && !plan.timer && askedLine(words) === words.trim() ? words.trim() : null
  const asks = asksFor(kind, boxText)
  // Who said it and where you met it. Null who means the words are yours.
  const [attribution, setAttribution] = useState('')
  const [medium, setMedium] = useState('')
  // Who and where for a saved note: shown only with something in them, or once
  // asked for from the gear menu (and kept while you clear them, so typing never loses its field).
  const [askSource, setAskSource] = useState(false)
  // Private from the start: never surfaces unasked in quiet hours or safe mode.
  const [secret, setSecret] = useState(false)
  // Hidden from screen recordings and shares unless let in, for a demo or a
  // Loom; remembered, and put back on every start.
  const appSettings = useLive(haligtree.settings, null as Settings | null)
  // Review's finish on the card studied in the box too (review-toolbar.tsx).
  useEffect(() => { if (appSettings) wearFinish(appSettings.reviewFinish ?? 'satin') }, [appSettings?.reviewFinish]) // eslint-disable-line react-hooks/exhaustive-deps
  // ⌘K's Abandon session, while one runs.
  const abandonAction = useAbandonAction()
  const practiceActions = usePracticeActions()
  // Tidy stickies only with a sticky out to tidy.
  const stickiesOut = useStickiesOut()
  const desk = useDeskAway()
  // What the side panel's Inbox has waiting on you: pinned notes,
  // for the chip at the top while the panel is shut.
  const pinned = useLive(haligtree.pins, [] as Awaited<ReturnType<typeof haligtree.pins>>)
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
  // "Hide buttons" (⌥⌘,): the box's buttons stay out of sight until pointed at; off to start.
  const hideButtons = appSettings?.boxHideButtons === true
  const setHideButtons = (on: boolean, byKey = false): void => {
    // A menu's tick makes its own sound; the key needs one of its own.
    if (byKey) chime(on ? 'on' : 'off')
    void haligtree.setSettings({ boxHideButtons: on })
    void (on ? (undo: () => void) => toast('Buttons hidden until pointed at. ⌥⌘, brings them back.', undo) : quietly)(() => void haligtree.setSettings({ boxHideButtons: !on }))
  }
  const hideNow = useRef(hideButtons)
  hideNow.current = hideButtons
  useZen(hideButtons)
  // ⌥⌘, from anywhere in the box, writing or not. Read by its key's place: ⌥ turns "," into "≤".
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.code !== 'Comma' || !event.metaKey || !event.altKey || event.ctrlKey || event.shiftKey) return
      event.preventDefault()
      setHideButtons(!hideNow.current, true)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => void moveOldRecordable(), [])
  // Summoned, the box is simply there: it is called up hundreds of times a
  // day, and a slide seen for the hundredth time only reads as waiting.
  // A focus session left running across a restart brings its timer back.
  // So does one left running in another book by a switch: the pill names that book.
  useEffect(() => void Promise.all([haligtree.focusNow(), haligtree.focusElsewhere().catch(() => null)]).then(([focus, elsewhere]) => (focus || elsewhere) && window.api.showFocus(true)), [])
  // One that ran out while Haligtree was closed was ended quietly at start: said
  // once, the first time the box is on screen, rather than ringing late.
  useEffect(() => {
    const tell = (): void => void haligtree.focusMissed().then((said) => said && toast(said, undefined, 'info'))
    if (document.visibilityState === 'visible') tell()
    return window.api.onShown(tell)
  }, [])
  // Linear's "Create more": on, a save keeps the box open for the next one.
  const [createMore, setCreateMore] = useStoredFlag('create-more')
  // Put away, the box starts its next opening clean: "Create more" off, and no
  // notice left over from the last save (its Undo still held for ⌘Z).
  useEffect(() => {
    const root = document.documentElement
    const offHiding = window.api.onHiding(() => (root.setAttribute('data-box-away', ''), untoast(), setCreateMore(false)))
    const offShown = window.api.onShown(() => root.removeAttribute('data-box-away'))
    return () => (offHiding(), offShown())
  }, [setCreateMore])
  // When the box was opened, for how long a capture took to write.
  const openedAt = useRef(Date.now())
  // What you were in as the box came up (main's boxFrom): kept with the capture, said on its chip first, × leaves it off.
  const [from, setFrom] = useState<BoxFrom | null>(null)
  const [fromOff, setFromOff] = useState(false)
  useEffect(() => window.api.onShown(() => {
    // Asked again only for a new note: words already begun keep where they were begun.
    if (latestEditing.current || (editorRef.current && !editorRef.current.isEmpty)) return
    setFromOff(false)
    void window.api.haligtree<BoxFrom | null>('box:from', false).then(setFrom, () => setFrom(null))
  }), [])
  // "Add the page": the browser asked once (the Mac's own question), read unasked after that.
  const askPage = (): void => {
    chime('tap')
    void window.api.haligtree<BoxFrom | null>('box:from', true).then((said) => said && setFrom(said))
  }
  const fromKept = (): BoxFrom | undefined => (from?.app && !fromOff && !SMALL ? from : undefined)
  const fromSaid = (one: BoxFrom): { app: string; title: string; url: string; page: string } => ({ app: one.app, title: one.title, url: one.url, page: one.page })
  // Each time the window comes up, the box has the caret, ready to type, not
  // whichever button the focus was last left on.
  useEffect(() => window.api.onShown(() => {
    openedAt.current = Date.now()
    // A draft left an hour or more: set aside as a leftover, and the box is fresh.
    const at = Number(localStorage.getItem('capture-draft-at')) || 0
    const draft = readDraft()
    if (!latestEditing.current && draft && Date.now() - at > LEFTOVER_AFTER) {
      const before = readLeftover()
      // Two leftovers: the older one first, then the newer, as one note to keep.
      localStorage.setItem('capture-leftover', JSON.stringify(before ? { type: 'doc', content: [...(before.content ?? []), ...(draft.content ?? [])] } : draft))
      // Set aside now: its day starts here, and it has not been passed by yet.
      localStorage.setItem('capture-leftover-at', String(Date.now()))
      localStorage.removeItem('capture-leftover-shown')
      fresh()
    }
    // Shown on this open: one more time it may be passed by (readLeftover lets it go after the third).
    const offered = readLeftover()
    if (offered) localStorage.setItem('capture-leftover-shown', String((Number(localStorage.getItem('capture-leftover-shown')) || 0) + 1))
    setLeftover(offered)
    requestAnimationFrame(() => {
      const active = document.activeElement
      if (!active || active === document.body || active.closest('header, [data-window-controls], button')) editorRef.current?.commands.focus('end')
    })
  }), [])
  // Bumped on a fresh box. The editor is keyed on it, so a new one replaces it.
  const [round, setRound] = useState(0)
  const [leftover, setLeftover] = useState<JSONContent | null>(readLeftover)
  // A page read in the box: whichever part of it scrolls at this width (the
  // page itself when narrow, the note's words beside its details when wide).
  const [readPane, setReadPane] = useState<HTMLDivElement | null>(null)
  const [readScroller, setReadScroller] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!readPane) return setReadScroller(null)
    const find = (): void => {
      const all = [readPane.querySelector<HTMLElement>('.note-pane'), readPane.querySelector<HTMLElement>('.note-pane .haligtree-editor-content')]
      setReadScroller(all.find((one) => one && /auto|scroll/.test(getComputedStyle(one).overflowY)) ?? null)
    }
    // Found once laid out (the size watch tells of the pane at its first layout), and again at the next frame after
    // its parts change: looked for at once, as a page opened, it worked out the half-built page's styles each time.
    const watch = new ResizeObserver(find)
    watch.observe(readPane)
    let frame = 0
    const added = new MutationObserver(() => void (frame ||= requestAnimationFrame(() => ((frame = 0), find()))))
    added.observe(readPane, { childList: true })
    return () => (watch.disconnect(), added.disconnect(), cancelAnimationFrame(frame))
  }, [readPane])
  /** The offer let go, by its ×: gone for good, with an Undo that brings the offer back. */
  const dropLeftover = (): void => {
    const keep = ['capture-leftover', 'capture-leftover-at', 'capture-leftover-shown'].map((key) => [key, localStorage.getItem(key)] as const)
    forgetLeftover()
    setLeftover(null)
    chime('away')
    toast('The draft from earlier is let go', () => (keep.forEach(([key, value]) => value !== null && localStorage.setItem(key, value)), setLeftover(readLeftover())))
  }
  /**
   * The leftover back in the box: in place of an empty one, or after what is there.
   * The chip already holds the note. Reading storage again would refuse it: this open
   * is the one that counted as shown, and the third showing is the last the reader allows,
   * so the click cleared the chip and put nothing back.
   */
  const leftoverBack = (): void => {
    const editor = editorRef.current
    const doc = leftover
    if (!editor || !doc) return
    const empty = !textOf(editor.getJSON()).trim() && !editor.getJSON().content?.some((one) => one.type !== 'paragraph')
    const ran = empty ? editor.chain().setContent(doc).focus('end').run() : editor.chain().focus('end').insertContent(doc.content ?? []).run()
    if (!ran) return
    forgetLeftover()
    setLeftover(null)
    chime('open')
  }
  // A capture opened from the list on the right. Edits save to it as they
  // happen; Cmd+Enter puts it down and brings back the box you had.
  const [editing, setEditing] = useState<{ id: string; body: JSONContent } | null>(null)
  // Another note, or a fresh box: who and where go back out of sight until asked for.
  useEffect(() => (setAskSource(false), setOffersAll(false)), [editing?.id])
  // Closed again whenever a different capture opens or the box is put down.
  useEffect(() => setDetails(false), [editing?.id])
  // An open Check back shows the day it already has.
  useEffect(() => void (editing ? notes.fields('captures', editing.id).then((all) => setBackOn(typeof all.back === 'string' ? all.back : null)) : setBackOn(null)), [editing?.id])

  // Never a taken-down editor: Tiptap empties one's storage when it goes, so
  // turning it into Markdown threw "reading 'manager'" and nothing was kept.
  // A box that lost its editor falls back on `body`, its words as last typed.
  // Quick capture's writing area hands its place to a voice note while it records (voice-note.tsx).
  const recordSlot = useRef<HTMLDivElement>(null)
  const recording = useRecording()
  // Recording a voice note or talking to type: either way the recorder bar has the footer's row (recorder-bar.tsx).
  const listening = useTalking() || recording
  const editorRef = useMemo(() => {
    let held: Editor | null = null
    return { get current() { return held && !held.isDestroyed ? held : null }, set current(editor: Editor | null) { held = editor } }
  }, [])
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
  const actionTags = useLive(() => haligtree.tagMeta().then((meta) => meta.filter((row) => row.action).map((row) => row.tag)), [] as string[])

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
    void haligtree.similar(first).then(setLike)
  }, [first, editing])
  // A Todo written as a list: a task a line, its indented lines their steps,
  // said under the box. Its first line alone is not "similar" to anything:
  // a line named like a task you have joins it, and the notice says so.
  const listed = !editing && kind === 'todo' ? boxList(editorRef.current) : null
  boxKind.todo = !editing && kind === 'todo'
  // A task named as one already on your list joins it (main's addTask): the "This will" line says so before the
  // send, as the main window's notice says it after.
  const [twin, setTwin] = useState<string | null>(null)
  useEffect(() => {
    if (editing || !(kind === 'todo' || plan?.task) || listed || !first) return setTwin(null)
    void haligtree.taskTwin(body, plan?.taskPlain).then(setTwin)
  }, [first, editing, kind, plan?.task, !!listed, plan?.taskPlain.length])

  // "+name" on the first line: a clue for a question you are holding, or a
  // log for a goal, not a capture. The open questions and goals, to find
  // which one the name means.
  const held = useLive(() => Promise.all([haligtree.items('question'), haligtree.items('goal')]).then((lists) => lists.flat().filter((one) => !one.closedAt && !one.archivedAt)), [] as Item[], [], ['item'])
  boxContext.current = { off: !!editing, kind, chosen, held, actionTags, timers: appSettings?.focusTools === true }
  useEffect(() => void (editorRef.current !== retired.current && replan(editorRef.current)), [editing, kind, chosen, held, actionTags])
  // "+name" read as a clue, or as a name nothing matches yet.
  const plus = editing || !plan ? null : plan.clue ?? plan.miss
  // A Word that is one word: its meaning looked up from the Mac's Dictionary
  // and offered quietly under it. As the “Word meanings” setting says:
  // whenever the box holds one word (Word is guessed for it), only once Word
  // is picked, or never. Not for an open note, the welcome, a private one,
  // or words lit to do something else (a timer, a clue, a task).
  const meanings = appSettings?.wordMeanings ?? 'one-word'
  const asksMeaning = meanings === 'one-word' ? kind === 'word' : meanings === 'word-kind' && chosen && kind === 'word'
  const defining = !editing && !lesson && !secret && asksMeaning && !plan?.timer && !plan?.clue && !plan?.task ? defineable(boxText) : null
  const { definition, keep: keepDefinition, hide: hideDefinition } = useDefinition(defining)
  // A timer newly lit is about to act: a brief warm light round the box says so.
  const timerLit = !editing && (!!plan?.timer || !!plan?.rounds)
  useEffect(() => void (timerLit && beam('warm')), [timerLit])
  // No light round the window while a link's card or a word's meaning is
  // fetched: each says its own wait in place (the card's "Fetching preview…",
  // the meaning's faint lines under the word), so nothing comes in from the edge.
  const plusGoal = plan?.clue?.question.tier === 'goal'
  // Who and where read from a quote's "- who, where": tinted like the words they came
  // from, and saying so, until you type in them. A name you wrote yourself is never tied.
  const signedBy = plan?.signature ? plan.tokens.find((one) => one.kind === 'signature')?.text : undefined
  const readWho = !!signedBy && !!attribution && attribution === plan?.signature?.who && attribution === autoWho.current
  const readWhere = !!signedBy && !!medium && medium === plan?.signature?.where && medium === autoWhere.current
  const readTip = signedBy ? `Read from ${quoted(clip(signedBy.trim(), 48), 80)} in your words. Write “- who, where” after a quote, or “Tom said” before it, to fill these.` : ''
  // A quote's "- Name" fills Who said it, unless you wrote one there; kept
  // as plain text, the name it filled goes again.
  useEffect(() => {
    if (!plan || editing) return
    // A link kept as plain text is a note at once, not after the next key.
    if (!chosen && plan.kind !== kind) setKind(plan.kind)
    // A link's site is filled as soon as the link is read, so Site shows what Create will keep.
    const by = plan.signature ?? { who: '', where: plan.url ? linkSite(plan.url, plan.card?.title) : '' }
    // The box emptied by hand: a who and where read from a quote's tail go
    // with the words, so the next note does not start signed by someone else.
    // Read from the editor, not the saved words, which wait for a pause.
    const emptied = !lesson && !!editorRef.current?.isEmpty
    // A field cleared by hand and then the words cleared too: a fresh start, so the next link may fill it again.
    if (emptied && !medium) autoWhere.current = ''
    if (emptied && !attribution) autoWho.current = ''
    if (attribution === autoWho.current && by.who !== attribution && (by.who || plan.signatureKept || emptied)) {
      autoWho.current = by.who
      setAttribution(by.who)
    }
    // Still signed but naming no source now: what it read as one a key ago was part of a year being typed
    // ("194" on the way to "1947"), and goes.
    if (medium === autoWhere.current && by.where !== medium && (by.where || plan.signatureKept || emptied || !!plan.signature)) {
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

  // A line ending in "?" kept as a question of its own (box-offers.tsx): that
  // line its name, the rest of the words its first clue. A capture open in the
  // box goes in whole as the first clue, as H does in the Inbox. Undoable.
  const keepAsQuestion = (line: string): void => {
    if (editing) {
      const id = editing.id
      void haligtree.newQuestion(line, id).then((question) => {
        if (!question) return refuse('That capture was already dealt with. Put it back in the Inbox first')
        chime('hold')
        toast('Kept as a question: add clues as they come', () => void haligtree.dropQuestion(question).then(() => chime('undo')), 'success', { label: 'Open', key: 'O', run: () => window.api.openInHome('question', question) }, { type: 'question', id: question, title: line })
      })
      return
    }
    const doc = editorRef.current?.getJSON() ?? body
    const rest = textOf(doc).split('\n').filter((one) => one.trim() !== line).join('\n').trim()
    beam('success')
    void haligtree.newQuestion(line).then(async (question) => {
      if (rest) await haligtree.addClue(question, rest)
      chime('hold')
      toast('Kept as a question: add clues as they come', () => void haligtree.dropQuestion(question).then(() => (chime('undo'), putDraft(doc), fresh(true))), 'success', { label: 'Open', key: 'O', run: () => window.api.openInHome('question', question) }, { type: 'question', id: question, title: line })
    })
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
    // An event lives on the Calendar, in the main window.
    if (type === 'event') return void (chime('open'), window.api.openInHome('event', id))
    // A PDF opens in the reader, in the main window.
    if (type === 'pdf' || type === 'web') return void (chime('open'), window.api.openInHome(type, id))
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
  // The side panel is shut to start: quick capture is the box alone. ⌘\ (or "Side panel in quick capture" in
  // Settings) shows it. Remembered, and the window is sized to match on every start.
  const [chosenPanel, setPanelOpen] = useStoredFlag('boxPanel', false, ['open', 'closed'])
  // While the welcome runs the box is its small self, the panel unopened whatever was chosen
  // (main sizes the window to match); the choice itself is kept for after.
  const welcoming = useWelcoming()
  // “One line to start” opens as the pill alone; ⌘\ (or the panel button, or the pinned chip) grows it into the box
  // with the side panel open, until ⌘\ again puts it away and the box folds back to the pill; the panel you chose
  // for the full box ("One line to start" off) is kept as it was.
  const oneLineOn = appSettings?.boxOneLine === true
  const [pillPanel, setPillPanel] = useState(false)
  // A small window has no side panel: one note, and the browse button for another.
  const panel = !SMALL && (oneLineOn ? pillPanel : chosenPanel) && !welcoming
  const [tab, setTab] = useState<Tab>('inbox')
  // The panel is drawn from the first frame the box grows, at its own width, and stays drawn while the box shrinks
  // back, fading as it goes (lib/box-morph.ts): never squeezed, never an empty strip.
  const [panelKept, setPanelDrawn] = useState(panel)
  const panelDrawn = panelKept && !welcoming
  const panelWanted = useRef(panel)
  const pillAfterPanel = useRef(false)
  /** What main was last told about the panel: a change made elsewhere (Settings) is told too. */
  const panelTold = useRef<boolean | null>(null)
  // Followed from the state, except while a move it asked for has not yet landed (the state changes as it starts).
  const panelMoving = useRef(false)
  if (!panelMoving.current) panelWanted.current = panel
  /**
   * The panel shown or put away as one move (lib/box-morph.ts): the box laid out as it starts to grow, kept laid out
   * until it has shrunk back to the pill (or the box alone), main told in between. `quiet`: turned in Settings, no
   * sound. Every way in comes here: ⌘\, the panel button, the pinned chip, ⌃J, ⌃1 to ⌃5, ⇧⌘Y and Settings.
   */
  const setPanel = (open: boolean, quiet = false): void => {
    // A small window holds one note and has no side panel: its keys get the app's "no" sound, and nothing moves.
    if (SMALL) return void (open && chime('nope'))
    if (!quiet) chime(open ? 'slide' : 'fold')
    // The panel's move sets the height too; the writing's own waits for it to land.
    box.held.current = true
    // Put away: the height the box will want without it, told first, so main puts it back at that size.
    if (!open) box.aim(pillAfterPanel.current)
    panelWanted.current = open
    panelTold.current = open
    panelMoving.current = true
    void morphBox(open, pillAfterPanel.current, window.api.setPanel, () => {
      if (oneLineOn) setPillPanel(open)
      else setPanelOpen(open)
      if (open) setPanelDrawn(true)
    }, () => {
      if (!panelWanted.current) setPanelDrawn(false)
    }).then((landed) => {
      if (!landed) return
      panelMoving.current = false
      box.held.current = false
      box.refit()
    })
  }
  // Said to main only once the settings are read: before, "One line to start" reads as off, the full box's panel
  // was asked for, and the box widened and narrowed again as it opened.
  const settingsRead = appSettings !== null
  useEffect(() => void (settingsRead && ((panelTold.current = panel), window.api.setPanel(panel).then((room) => room && applyRoom(room)))), [oneLineOn, settingsRead]) // eslint-disable-line react-hooks/exhaustive-deps
  // Turned on or off in Settings: drawn (or not) and the box sized to match, without a sound.
  useEffect(() => {
    if (panelTold.current === null || panelTold.current === panel) return
    setPanel(panel, true)
  }, [chosenPanel]) // eslint-disable-line react-hooks/exhaustive-deps
  // What the panel shows read ahead once the box has first drawn: ⌘\ draws it whole from the first frame it grows
  // (warmPanel), and each later time from what it last said, read afresh once drawn, as any view opened again. Not at
  // every open: the open count reads every task, and the box opens many times a day. Quick capture only.
  useEffect(() => void (window.api.room.left && afterPaint(warmPanel)), [])
  // From the writing to the list and back without the mouse: ⌃J (or ⌃K, from outside the words) leaves
  // the note for the panel's list (opening the panel if it is shut), and I
  // comes back, as vim's insert does. A menu open in the note keeps ⌃J and ⌃K.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.altKey) return
      // Nothing holding the keys (a palette just closed) counts as the note: ⌃J still leaves for the list.
      const active = document.activeElement as HTMLElement | null
      const inNote = !!active?.closest?.('.ProseMirror') || !active || active === document.body
      const key = event.key.toLowerCase()
      // ⌃K in the writing is the Mac's own "delete to the end of the line", as in every text field; it goes to the
      // list only from outside the writing.
      const inWriting = !!active?.closest?.('.ProseMirror')
      if (event.ctrlKey && !event.shiftKey && key === 'k' && inWriting && !layerOpen()) {
        event.preventDefault()
        const words = getSelection()
        if (words?.isCollapsed) {
          words.modify('extend', 'forward', 'lineboundary')
          // At the end of a line it takes the line break, as the Mac's does.
          if (words.isCollapsed) words.modify('extend', 'forward', 'character')
        }
        if (words && !words.isCollapsed) document.execCommand('delete')
        return
      }
      if (event.ctrlKey && inNote && (key === 'j' || (key === 'k' && !inWriting))) {
        if (layerOpen()) return
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
        // The panel as last asked for: a second press before the first has landed turns the move round.
        return setPanel(!panelWanted.current)
      }
      // ⌃ and a number alone: with ⌥ too it is a glance tab's key (box-glance.tsx), never a side panel's list.
      const to = event.ctrlKey && !event.metaKey && !event.altKey ? TABS[Number(event.key) - 1] : undefined
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
      // ⌘K with the caret in a web link edits the link, and on words picked gives them one, as in any editor.
      if (!event.metaKey || (event.key !== 'k' && event.key !== 'p') || (event.key === 'k' && kMeansLink())) return
      event.preventDefault()
      event.stopPropagation()
      // Quick capture's window is a small see-through card: ⌘K opens in the main window, the same box as everywhere
      // else, never squeezed into the card (in the one-line pill only its input showed, a flat bar).
      if (document.documentElement.hasAttribute('data-overhang')) return window.api.openInHome('search', event.key === 'k' ? 'all' : 'notes')
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
    // A small window's first note has nothing before it to go back to.
    else if (SMALL) return
    else fresh(true, true)
  }
  const column = useRef<HTMLDivElement>(null)
  // “One line to start” (Settings): the box opens as one line, a pill, and
  // grows once there is more to show: a second line, what sending it will
  // do, or the kind picker asked for from the pill's icon. Never while the
  // welcome runs, which teaches the whole box.
  const oneLine = oneLineOn && !welcoming && !SMALL
  const [opened, setOpened] = useState(false)
  // The Inbox's Display, opened by F with no list in sight: the pill grows into the box for its sheet to lie over.
  const [sheetUp, setSheetUp] = useState(false)
  // A draft of more than one line opens grown, at the height its words need: worked out from the draft itself, before
  // the editor is drawn, so the box never shows as the pill first and grows a moment later.
  const [wraps, setWraps] = useState(() => (body?.content ?? []).filter((one) => hasContent({ type: 'doc', content: [one] })).length > 1)
  // A tag, a mention or a / typed is still one line: the pill stays the pill (its list hangs outside, in the room below
  // it), and grows only when the words pass one line. As a token it grew to the box's short height on the list closing
  // and shrank back once the token was gone (qa/pill-steady.mjs).
  // A word's meaning (or "Did you mean") lies under the word, in room kept after the writing: the pill grows into the
  // box to show it. Kept as the pill, that room scrolled the one line up inside its clip and cut the word along its
  // middle (the user's "humanoid").
  // From the pill, it shows once the window has grown room for the box under the pill (useFitBox's prepare), so the
  // box is drawn at its whole height in the frame the meaning shows: before, it grew in three steps as the window
  // caught up, its foot cut off meanwhile.
  const meaningFound = definition?.state === 'found' || definition?.state === 'fix'
  // Listening, it is the box: the recorder bar lives in its footer's row.
  // Still the box while the panel is drawn: put away, it stays laid out as the box until it has shrunk back (box-morph).
  const pillOtherwise = oneLine && !reading && !editing && !lesson && !opened && !wraps && !panel && !panelDrawn && !sheetUp && !listening
  const [roomFor, setRoomFor] = useState<string | null>(null)
  const meaningShown = meaningFound && (!pillOtherwise || roomFor === definition?.word)
  const meaningWaits = meaningFound && !meaningShown ? definition?.word ?? null : null
  const pill = pillOtherwise && !meaningShown
  // Whether it will be the pill once the panel is put away (setPanel tells the box's height before the glide).
  pillAfterPanel.current = oneLine && !reading && !editing && !lesson && !opened && !wraps && !meaningShown
  // “Glance tabs” (Settings, on to start with “One line to start”): Write, Notes and Today standing on the pill
  // (box-glance.tsx). Write is the pill as it is; another tab puts its own line where the writing's is and hangs its
  // glance under the pill. Only while it is the pill: grown into the box, by anything, it is Write again. Every open
  // starts on Write.
  const glanceOn = oneLine && appSettings?.boxGlance !== false
  const [glanceTab, setGlance] = useState<Glance>('write')
  const glance: Glance = glanceOn && pill ? glanceTab : 'write'
  const glanceNow = useRef<Glance>('write')
  useEffect(() => {
    const was = glanceNow.current
    glanceNow.current = glance
    if (glance !== 'write') return
    setGlance('write')
    // Back on Write by its tab, its key or Esc, the caret is in the writing again (not when the pill grew into the box).
    if (was !== 'write' && pill) editorRef.current?.commands.focus()
  }, [glance]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => window.api.onShown(() => setGlance('write')), [])
  // One sound for the change, whichever way it was asked: a tab pressed or its key (a tap), Esc back to Write (a fold).
  const pickGlance = useCallback((to: Glance, cue: Parameters<typeof chime>[0] = 'tap'): void => {
    if (glanceNow.current !== to) chime(cue)
    setGlance(to)
  }, [])
  // Measured before it is drawn, so a second line grows the box in the frame it appears: on each change in the editor
  // (onReady below), not only when the box draws again. The box draws again only once the editor's words are handed
  // up, half a second after the typing stops (haligtree-editor.tsx SAVE_DEBOUNCE_MS), and a new line sat squeezed
  // into the pill all that while.
  const wrapsNow = useRef(wraps)
  wrapsNow.current = wraps
  const oneLineNow = useRef(oneLine)
  oneLineNow.current = oneLine
  const measureWraps = useRef<() => boolean | null>(() => null)
  measureWraps.current = () => {
    if (!oneLine) return null
    const doc = column.current?.querySelector<HTMLElement>('.ProseMirror')
    const first = doc?.firstElementChild as HTMLElement | null | undefined
    if (!doc || !first) return null
    if (doc.childElementCount > 1) return true
    // An empty draft never wraps: its hint ("Write a thought…") is held inside the line and wraps with the width
    // (paragraph-node.scss), so measured at a narrow moment it read as a second line and grew the pill into a box that
    // then kept itself narrow, the hint wrapping on (qa/hint-room.mjs, the pill).
    if (first.classList.contains('is-editor-empty')) return false
    const line = parseFloat(getComputedStyle(first).lineHeight) || 26
    return first.offsetHeight > line * 1.5
  }
  React.useLayoutEffect(() => {
    const next = measureWraps.current()
    if (next !== null) setWraps(next)
  })
  // Grown or folded, the block handle forgets where it was: placed while the pointer was over the pill's line, it
  // stayed there as the box grew, its grip over the first letter of the writing until the pointer moved again.
  React.useLayoutEffect(() => {
    const editor = editorRef.current
    if (!oneLine || !editor || editor.isDestroyed) return
    editor.view.dispatch(editor.state.tr.setMeta('hideDragHandle', true))
    document.querySelectorAll('.tiptap-drag-handle.is-shown').forEach((one) => one.classList.remove('is-shown'))
  }, [pill]) // eslint-disable-line react-hooks/exhaustive-deps
  // Emptied (sent, or cleared): back to the pill for the next one.
  useEffect(() => void (!boxText.trim() && setOpened(false)), [boxText])
  // Esc on a glance tab shuts its glance first (back to Write, the pill alone); the next one puts the box away.
  foldPill.current = () => (glance !== 'write' ? (pickGlance('write', 'fold'), true) : oneLine && opened && !wraps && !plan?.tokens.length ? (chime('fold'), setOpened(false), true) : false)
  // The window as tall as the writing, from short to full (or one line, as the pill): see fit-box. A page read in quick
  // capture takes its full height; a small window's page is its note, as tall as its words.
  const box = useFitBox(column, (Boolean(reading) && !SMALL) || sheetUp, pill, appSettings !== null)
  // While it waits, the meaning is still "looking" under the word (the orb, if the wait was long enough to show it),
  // and its place under the writing is kept: made afresh, it came a render after the box was measured, short.
  useEffect(() => {
    if (!meaningWaits) return
    let live = true
    void box.prepare().then((ready) => live && ready && setRoomFor(meaningWaits))
    return () => void ((live = false), box.cancel())
  }, [meaningWaits]) // eslint-disable-line react-hooks/exhaustive-deps
  // The meaning gone (the word changed, or put away): the next one grows the pill afresh.
  useEffect(() => void (!meaningFound && setRoomFor(null)), [meaningFound])
  // No two-finger swipe back and forward here: ⌘ and two fingers throw the box, and the two fought. ⌘[ and ⌘] still step back and on.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || event.shiftKey || event.altKey || event.ctrlKey || (event.key !== '[' && event.key !== ']')) return
      event.preventDefault()
      travel(trail.at + (event.key === '[' ? -1 : 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  // Clicked in the list, the keys stay on the list (⌫, ↓, P), as in the main
  // window; a click into the words, ↵ or Tab moves them into the note.
  const quietOpen = useRef(false)
  const openCapture = (id: string, travelling = false, quiet = false): void => {
    quietOpen.current = quiet
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
  // A small window opens on its note (a new one's is an empty capture main made, gone again if the window closes with
  // it empty: main/small-window.ts), as the box opens a capture or a page from its list: the same editor, saved as you write.
  useEffect(() => {
    const at = SMALL?.indexOf(':') ?? -1
    if (!SMALL || at < 0) return
    const [type, id] = [SMALL.slice(0, at), SMALL.slice(at + 1)]
    // Its first note is where its history starts: nothing before it.
    setTrail({ stack: [type === 'capture' ? id : SMALL], at: 0 })
    if (type === 'capture') openCapture(id, true)
    else openAny(type, id, true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Main keeps which note each small window holds, for after a restart and for an empty one to go.
  useEffect(() => {
    if (SMALL && (editing || reading)) void window.api.haligtree('small:holds', editing ? `capture:${editing.id}` : `${reading!.type}:${reading!.id}`)
  }, [editing?.id, reading?.type, reading?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // Its own switches (main keeps them with its place): growing with the words, and stepping aside.
  const [small, setSmall] = useState<{ auto: boolean; aside: boolean; top: boolean } | null>(null)
  useEffect(() => {
    if (!SMALL) return
    void window.api.haligtree<{ auto: boolean; aside: boolean; top: boolean } | null>('small:state').then(setSmall)
    // Resized by hand: main has stopped it growing.
    const said = (event: Event): void => {
      const { what, value } = (event as CustomEvent<{ what: string; value: boolean }>).detail
      if (what === 'auto') setSmall((now) => now && { ...now, auto: value })
    }
    window.addEventListener('haligtree:small', said)
    return () => window.removeEventListener('haligtree:small', said)
  }, [])
  // Growing, the card is drawn at its own height in the room below it (main.css); resized by hand, it fills its window.
  useEffect(() => void (SMALL && small && document.documentElement.toggleAttribute('data-small-auto', small.auto)), [small?.auto])
  const setSmallSwitch = (patch: { auto?: boolean; aside?: boolean; top?: boolean }): void => {
    void window.api.haligtree<{ auto: boolean; aside: boolean; top: boolean } | null>('small:set', patch).then((now) => {
      setSmall(now)
      // Growing again: to the words' height now, not at the next key.
      if (patch.auto) box.refit()
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
    }, () => refuse('Could not copy it', 'error'))
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
  // ⇧⌘2 (or “Attach a screenshot”): the screen behind the box, with none of
  // Haligtree's windows in it, as a picture in the note where the caret is,
  // captioned with when and the app in front. Screen Recording refused, it
  // says so and opens the Privacy settings.
  const attachScreenshot = async (area = false, taken?: Awaited<ReturnType<typeof window.api.screenShot>>): Promise<void> => {
    const editor = editorRef.current
    if (!editor || editor.isDestroyed) return refuse('Open a note first')
    if (locked) return refuse('This note is locked. Unlock it to add a screenshot')
    const shot = taken ?? await window.api.screenShot(area)
    if (!shot) return refuse('The screenshot could not be saved. Try again')
    if ('cancelled' in shot) return
    if ('denied' in shot) {
      chime('nope')
      if (shot.restart) return toast(`Screen Recording is allowed. Restart ${APP_NAME} to use it`, undefined, 'warning', { label: `Restart ${APP_NAME}`, key: 'R', run: () => window.api.restart() })
      return toast(shot.asked ? `Allow ${APP_NAME} under “Screen Recording” in the window macOS opened, then try again` : `${APP_NAME} can’t see the screen yet. Turn it on under “Screen Recording”. Already on? Turn it off and on again`, undefined, 'warning', { label: 'Open Privacy settings', key: 'P', run: () => window.api.privacySettings('screen') })
    }
    const now = new Date()
    const caption = `${area ? 'Area' : 'Screen'}, ${now.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${clock(now)}${shot.app ? ` · ${shot.app}` : ''}`
    const picture = { type: 'image', attrs: { src: shot.url, caption } }
    if (editor.isEmpty) editor.chain().setContent({ type: 'doc', content: [picture, { type: 'paragraph' }] }, { emitUpdate: true }).focus('end').run()
    else editor.chain().focus().insertContent([picture, { type: 'paragraph' }]).run()
    chime('shutter')
    // The picture is in the note in front of you: no toast to read, ⌘Z still takes it out.
    quietly(() => editor.commands.undo())
  }
  // Thrown to an edge or a corner: ⌃⌥ and an arrow, or ⌘ held with a
  // two-finger flick while the box has the keys. Holding ⌘ makes the flick
  // a deliberate act, so plain scrolling of the lists never moves the box.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // ⌃⌥ and an arrow as made: keys changed in Settings arrive as these (lib/keys.ts), and these themselves are stopped.
      const combo = comboOf(event)
      const at = combo ? THROWS.indexOf(combo) : -1
      if (at < 0) return
      const way = ([[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][])[at]
      event.preventDefault()
      event.stopPropagation()
      chime('slide')
      window.api.throwBox(...way)
    }
    // ⌘ and two fingers over the box, focused or not (macOS sends the wheel
    // to the window under the pointer): when they let go it is thrown all the
    // way that way, to an edge or a corner, never left partway. The page has no word for "the
    // fingers lifted", so the trackpad's glide after them (each step a little
    // shorter than the last) is taken as the let go. Once thrown, the rest of
    // that glide is swallowed until the wheel goes quiet, so it never fights
    // the throw. Deltas go to main as they came: it knows which way the Mac
    // scrolls and turns them the fingers' way.
    let samples: { t: number; x: number; y: number }[] = []
    let frame = 0
    let quiet = 0
    let thrown = false
    // How far and how fast the fingers went over their last tenth of a second.
    const recent = (): { x: number; y: number; far: number; speed: number } => {
      const last = samples[samples.length - 1]?.t ?? 0
      const near = samples.filter((one) => last - one.t <= 100)
      const x = near.reduce((sum, one) => sum + one.x, 0)
      const y = near.reduce((sum, one) => sum + one.y, 0)
      const far = Math.hypot(x, y)
      return { x, y, far, speed: far / (near.length ? last - near[0].t + 16 : 16) }
    }
    // Let go: thrown all the way the way the fingers went over the whole stroke (a nudge too small to read stays put).
    const letGo = (): void => {
      if (frame) cancelAnimationFrame(frame), (frame = 0)
      const x = samples.reduce((sum, one) => sum + one.x, 0)
      const y = samples.reduce((sum, one) => sum + one.y, 0)
      const far = Math.hypot(x, y)
      const { speed } = recent()
      samples = []
      if (far < 12) return window.api.restBox()
      chime('slide')
      window.api.throwBox(x / far, y / far, Math.max(speed, 0.6))
      thrown = true
      clearTimeout(quiet)
      quiet = window.setTimeout(() => (thrown = false), 160)
    }
    // The trackpad's own glide: four steps in a row, each shorter than the one before.
    const gliding = (): boolean => {
      const tail = samples.slice(-4).map((one) => Math.hypot(one.x, one.y))
      return tail.length === 4 && tail.every((one, n) => !n || one < tail[n - 1] * 0.97)
    }
    const onWheel = (event: WheelEvent): void => {
      if (!thrown && !event.metaKey) return
      // The graph zooms with ⌘ and the wheel: left to it.
      if (!thrown && (event.target as Element | null)?.closest?.('canvas, [data-inbox-graph]')) return
      event.preventDefault()
      clearTimeout(quiet)
      if (thrown) return void (quiet = window.setTimeout(() => (thrown = false), 160))
      samples.push({ t: performance.now(), x: event.deltaX, y: event.deltaY })
      if (gliding()) return letGo()
      quiet = window.setTimeout(letGo, 160)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('wheel', onWheel, { capture: true })
      clearTimeout(quiet)
      cancelAnimationFrame(frame)
    }
  }, [])
  // ⇧⌘. from anywhere: an area already picked, put in the note with the caret on the line under it.
  const attachRef = useRef(attachScreenshot)
  attachRef.current = attachScreenshot
  // Always a fresh note: an old capture open stays as it was, and words half
  // written stay the draft, waiting as they do while any kept capture is open.
  const openRef = useRef(openCapture)
  openRef.current = openCapture
  useEffect(() => window.api.onPicture((shot) => {
    if ('denied' in shot) return void attachRef.current(true, shot)
    const now = new Date()
    const caption = `Area, ${now.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${clock(now)}${shot.app ? ` · ${shot.app}` : ''}`
    void window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'image', attrs: { src: shot.url, caption } }, { type: 'paragraph' }] } }).then((id) => {
      if (!id) return refuse('The screenshot could not be saved. Try again')
      chime('shutter')
      openRef.current(id)
      // Once the note is in the editor: the caret on the line under the picture.
      // Put there, and kept there for half a second while the opened note settles (its editor can be made again as it loads).
      const caret = (tries = 0, held = 0): void => {
        const editor = editorRef.current
        const ready = !!editor && !!domOf(editor)?.querySelector('img')
        // Saved, a note loses its empty last line: the line to write on is put back under the picture.
        if (ready && editor.state.doc.lastChild?.type.name !== 'paragraph') editor.chain().insertContentAt(editor.state.doc.content.size, { type: 'paragraph' }).run()
        if (ready && !(editor.isFocused && editor.state.selection.empty && editor.state.selection.to >= editor.state.doc.content.size - 1)) editor.commands.focus('end')
        if (ready ? held < 30 : tries < 60) setTimeout(() => caret(tries + 1, ready ? held + 1 : 0), 50)
      }
      caret()
      // The box often gets the keys only after the area pick hands them back: the caret goes under the picture then too.
      window.addEventListener('focus', () => caret(0, 20), { once: true })
    })
  }), [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || !event.shiftKey || event.altKey || event.ctrlKey || event.code !== 'Digit2' || event.repeat) return
      event.preventDefault()
      event.stopPropagation()
      void attachScreenshot()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
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
    // A small window's note put down (Close note, sent to the Bin, opened in a window of its own): the window goes
    // with it, the note kept where it lives.
    if (SMALL) return void window.close()
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
    setBackOn(null)
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
  // A box sent and put away is cleared as main hides it (`window:hiding`), so it comes back blank, never on a timer
  // guessing when the hide has happened.
  const clearOnHide = useRef(false)
  useEffect(() => window.api.onHiding(() => {
    if (latestEditing.current) return fresh(true)
    if (!clearOnHide.current) return
    clearOnHide.current = false
    setSending(false)
    fresh()
  }), [])
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
  useOpenNote(editingMeta ? { table: 'captures', type: 'capture', id: editingMeta.id, kind: editingMeta.kind, archived: !!editingMeta.archivedAt, status: editingMeta.status } : null)
  useEffect(() => {
    // Opened in a window of its own, from here or another window: put down
    // here, so only one editor saves it.
    // A small window keeps its place instead, saying where the note went (SmallHold, lib/apart.tsx).
    const onApart = (event: Event): void => void (!SMALL && (event as CustomEvent).detail === latestEditing.current?.id && fresh(true))
    // Version history lives in the main window, where there is room to read
    // back through them: the note goes there, its history open.
    const onVersions = (event: Event): void => {
      const id = (event as CustomEvent).detail
      if (id !== latestEditing.current?.id) return
      fresh(true)
      window.api.openInHome('versions', id)
    }
    window.addEventListener('haligtree:opened-apart', onApart)
    window.addEventListener('haligtree:versions', onVersions)
    return () => {
      window.removeEventListener('haligtree:opened-apart', onApart)
      window.removeEventListener('haligtree:versions', onVersions)
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
  // A new note asked for (⌘N, the pill's pen, the ⌘K list) over words not yet sent: they are kept, as ⌥⌘↵ keeps
  // them (what the "This will" line says, with Undo), and the box is blank for the next one; New never throws words
  // away (the user, 15 Nov 2026: "keep the draft instead of clearing it", after it crumpled their "test 3"). With a
  // capture open in the box, its own words are saved already: the draft set aside meanwhile comes back.
  const startOver = (): void => {
    // In a small window: a new note in this window, the one it held kept where it lives (or gone, if left empty).
    if (SMALL) return void window.api.haligtree<string>('small:new').then((id) => openCapture(id), (error) => refuse(`No new note: ${whyFailed(error)}`, 'error'))
    if (!latestEditing.current && hasContent(editorRef.current?.getJSON() ?? null)) return submit(true)
    fresh(!!latestEditing.current)
  }
  // The current startOver(), for the listener above, which is set up once.
  const latestFresh = useRef(startOver)
  latestFresh.current = startOver

  // ⌘O, Little Arc's "Open in Arc": what is open here goes to the main
  // window as the same thing. A draft is kept as a capture first, with its
  // caret; the box then grows toward the main window and fades (main's
  // `box:promote`), and the main window opens on it. With nothing written,
  // ⌘O simply opens the main window, as before.
  // ⌥⌘O, "Open in a small window": the same move into a small window of its own (main/small-window.ts), grown out of
  // the box's own place and size, and quick capture is put away blank, free for the next thing. With nothing written,
  // a new note in one.
  const promote = async (to: 'main' | 'small' = 'main'): Promise<void> => {
    const card = document.querySelector('.app-container')?.getBoundingClientRect()
    const send = (type: string | null, id: string | null): void => {
      if (to === 'main') return window.api.promote(type, id)
      chime('window')
      void window.api.haligtree('small:open', type && id ? `${type}:${id}` : null, card ? { x: card.x, y: card.y, width: card.width, height: card.height } : null)
      putWindowAway()
    }
    if (reading) return send(reading.type, reading.id)
    const editor = editorRef.current
    const at = editor?.state.selection.from ?? 0
    if (editing) {
      // Saved now, not at the next pause, so the main window opens on every word.
      if (editor) words.save(editor.getJSON(), editor)
      if (to === 'main') notePromoted(editing.id, at)
      send('capture', editing.id)
      return fresh(true)
    }
    const doc = editor?.getJSON() ?? body
    if (!hasContent(doc ?? null) || sending) return send(null, null)
    setSending(true)
    try {
      const id = await window.api.captures.create({ kind: chosen && kind !== 'todo' ? kind : 'note', elapsedMs: Date.now() - openedAt.current, body: doc,
        markdown: editor ? toMarkdown(editor) : undefined, attribution: attribution.trim(), medium: medium || undefined, private: secret, from: fromKept() && fromSaid(fromKept()!) })
      await haligtree.linkSession(id)
      localStorage.removeItem('capture-draft')
      // A new capture kept: the draft from earlier is not offered again.
      forgetLeftover()
      setLeftover(null)
      if (to === 'main') notePromoted(id, at)
      send('capture', id)
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
  // ⌥⌘O: into a small window. Read by its key's place: ⌥ turns "o" into "ø".
  useEffect(() => {
    if (SMALL) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.code !== 'KeyO' || !event.metaKey || !event.altKey || event.ctrlKey || event.shiftKey || event.repeat) return
      event.preventDefault()
      event.stopPropagation()
      void latestPromote.current('small')
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  // Words sent from ⌘K in the main window ("in quick capture"): written at
  // the end of the note here, the caret after them, ready to finish.
  useEffect(() => window.api.onSeed((text) => {
    let tries = 0
    const write = (): void => {
      const editor = editorRef.current
      if (!editor || editor.isDestroyed) return void (tries++ < 60 && requestAnimationFrame(write))
      // A whole long note sent this way goes where a paste of it goes: kept as a note of its own, never drawn in the box.
      if (text.length >= BIG_PASTE) return void keepBigPaste(text, editor)
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
  const words = useSameWords('captures', editing?.id, editing?.body, (id, words, wordsBase, markdown) => window.api.captures.save(id, { words, wordsBase, markdown }))

  // The box closing after a send, still to come: an undo straight after keeps it open.
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
    clearOnHide.current = false
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
    window.dispatchEvent(new CustomEvent('haligtree:uncelebrate'))
    // Gone already (it leaves as the send lands): summoned back.
    window.api.revealPrompt()
  }
  // Save. Never fails, and no field can block it: an empty box is the only
  // thing it refuses, because there is nothing there to keep.
  // The box going after a save: marked first, so the notice the save sends does not flash up as it leaves.
  const putAway = (): void => (document.documentElement.setAttribute('data-box-away', ''), putWindowAway())
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
    const signed = plan?.signatureKept ? raw : withoutTail(raw, attribution.trim())
    // "@1y" is a command, not words: it is taken off what is kept, as a task's date is.
    const later = plan?.later ?? null
    const doc = later ? laterOff(signed, later.text) : signed
    const text = textOf(doc).trim()
    const asked = loneQuestion(plan, text)
    if (asked) {
      keepAsQuestion(asked)
      if (!more) putAway()
      return
    }
    const back = backOn
    // Nothing to keep: said with the "not allowed" sound, not in silence. A
    // picture or a drawing with no words is still something.
    const something = (doc as JSONContent | null)?.content?.some((node) => node.type !== 'paragraph' || node.content?.length)
    if (!text && !something) return chime('nope')
    // As it was sent, for an undo to put back exactly (bringBack).
    const sent = { doc: signed as JSONContent, attribution, medium, kind, chosen, secret, pieces: [...lifted], editor: editorRef.current }
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
      void haligtree.addClue(question.id, clue).then((id) => toast(`${goal ? 'Logged to' : 'A clue in'} ${quoted(question.title, 36)}`, () => {
        if (id) void haligtree.dropClue(id)
        bringBack(sent)
      }))
      fresh()
      if (!more) putAway()
      return
    }
    // "!milestone Exam on 3 Dec": that day marked, and nothing captured.
    if (plan?.milestone) {
      beam('success')
      void markFromBox(plan.milestone, () => bringBack(sent))
      fresh()
      if (!more) putAway()
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
      void haligtree.startRounds(rounds.goal, rounds).then((id) => {
        window.api.showFocus(true)
        toast(`${plural(rounds.rounds, 'round')} of ${lengthSaid(rounds.workMs)} started`, () => {
          void haligtree.cancelSession(id)
          bringBack(sent)
        })
      })
      fresh()
      if (!more) putAway()
      return
    }
    const timer = plan?.timer
    if (timer) {
      chime('timer')
      beam('success')
      // Words that name an open task ("start 25m reply to emails") time that task: a session on it, kept in its
      // Sessions and in Stats, as starting one from the task does. Anything else is a plain timer.
      const named = timer.goal.toLowerCase()
      void haligtree.tasks().then((list) => {
        const task = named === 'timer' ? undefined : list.find((one) => one.status === 'open' && taskName(one.title).text.trim().toLowerCase() === named)
        void (task ? haligtree.startSession(task.id, undefined, timer.ms) : haligtree.startTimer(timer.goal, timer.ms)).then((id) => {
          window.api.showFocus(true)
          // Undone, the words come back into the box as they were typed.
          toast(task ? `Session on ${quoted(taskName(task.title).text, 80)}: ${lengthSaid(timer.ms)}` : `Timer set: ${lengthSaid(timer.ms)}${timer.goal === 'Timer' ? '' : ` for ${timer.goal}`}`, () => {
            void haligtree.cancelSession(id)
            bringBack(sent)
          })
        })
      })
      fresh()
      if (!more) putAway()
      return
    }
    // What a paste is, when the kind was left alone: a bare link is a link,
    // and where it came from is the site. Length alone never makes a quote: long notes of your own
    // ("Raycast notes") were typed as quotes and then asked for a source they never had.
    const url = plan ? plan.url : null
    // The suggestion is worked out a moment after typing stops; a save before
    // then works it out here, so a quick "Call the plumber" is still a todo.
    const said = plan ? plan.kind : chosen ? kind : (boxGuess(firstLine(doc)) ?? kind)
    const sorted = said !== 'note' ? said : url ? 'link' : said
    const where = medium || (url ? linkSite(url, plan?.card?.title) : '')
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
      void makeListTasks(list.list, { onUndo: () => bringBack(sent), away: !more, plain: plan?.listPlain })
      fresh()
      if (!more) putAway()
      return
    }
    // Going: hidden before anything else is done, so none of it holds the box on screen (the first send of a run, its
    // sound started and its words read into Markdown first, stayed 397 ms; the four after it 120). The save and all
    // that follows finish while it is hidden; the words are read below, and the box is cleared once it is hidden.
    if (!more) putAway()
    chime('send')
    // The top edge lights green: kept, without a word; and one sweep round the box, where it is still seen.
    if (more) beam('success')
    // A meaning taken with Tab goes with it as the Word's own fields.
    const meaning = sorted === 'word' && definition?.kept ? definition.found : undefined
    const written = editorRef.current ? toMarkdown(editorRef.current) : undefined
    const markdown = written && later ? withoutWord(written, later.text) : written
    // With the panel open, the note is seen going into the Inbox tab.
    const land = panel ? liftFrom(document.querySelector<HTMLElement>('.haligtree-editor-content'), 'capture') : undefined
    // Taken now: a fresh box clears the list before the save comes back.
    const pieces = [...lifted]
    keepLifted([])
    // A new capture kept: the draft from earlier is not offered again.
    forgetLeftover()
    setLeftover(null)
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
      // Hidden above, before the save: it used to wait for the save and all that follows it (0.3 to 1 s in a built app,
      // about 3 s in the user's dev app, 15 Nov 2026: "it says on screen for another 3 seconds"), and a leave timer of
      // 180 ms still slipped to 0.4 to 1.1 s behind the box's own redraw. Cleared as it hides (`clearOnHide`).
      clearOnHide.current = true
    }
    void window.api.captures
      .create({ title: plan?.card && !plan.card.loading ? plan.card.title : '', kind: page ? 'note' : sorted, elapsedMs: Date.now() - openedAt.current, body: hasContent(doc) ? doc : null, markdown,
        attribution: attribution.trim(), medium: where || undefined, private: secret, plainTags: plan?.plainTags.length ? plan.plainTags : undefined, from: fromKept() && fromSaid(fromKept()!) })
      .then(async (id) => {
        land?.()
        await haligtree.linkSession(id)
        // Anything captured out of this note while it was a draft now points
        // back to it, so its lineage holds.
        for (const piece of pieces) await haligtree.setCapture(piece, 'origin', id)
        // A link shows as its card, filled in once the page answers.
        if (sorted === 'link') void cardUp({ id, kind: sorted, body: hasContent(doc) ? doc : null })
        // Named after the page: its title kept as the source, so it can be renamed after its topic.
        if (plan?.card && !plan.card.loading && plan.card.title && plan.card.title !== plan.card.href) await notes.setField('captures', id, 'title', plan.card.title)
        if (meaning) {
          await notes.setField('captures', id, 'definition', meaning.definition)
          if (meaning.example) await notes.setField('captures', id, 'example', meaning.example)
        }
        // A letter to future you: out of every list until its day, then back on Today saying when you wrote it.
        if (later && !action) await haligtree.snoozeCapture(id, later.day)
        if (sorted === 'checkback' && back) await notes.setField('captures', id, 'back', back)
        // "- Mary Shelley, Frankenstein, 1818, p. 42": the page is the quote's own; the year is its source's (set
        // on Frankenstein if it has none yet), and the quote's own only when it names no source.
        const year = sorted === 'quote' ? plan?.signature?.year : ''
        const source = (plan?.signature?.where || medium).trim()
        if (year && source) {
          const card = await sources.card(null, source)
          if (!card?.born.trim()) await sources.facts('medium', source, { born: year })
        } else if (year) await notes.setField('captures', id, 'year', year)
        if (sorted === 'quote' && plan?.signature?.page) await notes.setField('captures', id, 'location', plan.signature.page)
        if (action) {
          // The welcome shows the task it became itself; the box says nothing over it.
          // Undone, the capture goes too and the box comes back as it was sent.
          await makeTask({ capture: id, plain: plan?.taskPlain, whole: true }, 'Added to your tasks', { quiet: document.documentElement.hasAttribute('data-welcome-ph'), box: more ? 'here' : 'away', onUndo: () => (void haligtree.unlift('capture', id), bringBack(sent)) })
        } else if (!document.documentElement.hasAttribute('data-welcome-ph')) {
          // A plain note takes back the same way as every other send: the
          // capture goes, and the box comes back as it was sent.
          toast(page ? 'Page kept in your Inbox. Pick what each line becomes' : later ? `A letter to future you: back ${dayjs(later.day).format('ddd D MMM YYYY')}` : 'Kept in the Inbox', () => (void haligtree.unlift('capture', id), bringBack(sent)), 'success', undefined, { type: 'capture', id })
        }
        if (page) openSort(page, id)
      }, (error: unknown) => {
        // Not kept: the words must not go with it. The box was cleared as it sent (and went, without ⌥), so they come
        // back into it, or, if the next note is under way, on a key from the toast; a box that went comes back to say so.
        keepLifted(pieces)
        document.documentElement.removeAttribute('data-box-away')
        setSending(false)
        const why = `Not saved: ${whyFailed(error)}.`
        const restore = (): void => {
          putDraft(doc)
          fresh(true)
        }
        if (!more) window.api.showPrompt()
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
    if (next === 'checkback') setBackAsk((n) => n + 1)
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
  const latestOver = useRef({ searching, reading, glance: false })
  latestOver.current = { searching, reading, glance: glance !== 'write' }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // A voice note recording has the keys: Esc and ⌘↵ are its own (voice-note.tsx).
      if (recordingNow()) return
      // A glance tab's line has the keys (box-glance.tsx): ⌘↵ and ⌘1 to ⌘9 are not the draft's, out of sight behind it.
      if (latestOver.current.glance) return
      // Search, a dialog or a menu has the keys: the note under it is not
      // touched, and ⌘↵ is not taken as a plain ↵ by what is open either.
      // An editor's own suggestions (a tag, a link) are not one: ⌘↵ sends what is written, as typed.
      const suggestionOnly = event.key === 'Enter' && event.metaKey && !latestOver.current.searching && menuShowing('.tiptap-suggestion-popup') && !menuShowing('[role=menu], [role=dialog], [role=alertdialog]')
      if (!suggestionOnly && (latestOver.current.searching || layerOpen())) {
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
  const [toastWidth, setToastWidth] = useState(0)
  useEffect(() => {
    const row = footer.current
    if (!row) return setToastLane(undefined)
    const place = (): void => {
      const last = row.lastElementChild?.getBoundingClientRect()
      if (!last || !last.width) {
        // No footer drawn: the one-line pill. The lane the grown box last set would put a notice over the pill's
        // words, so it sits under the card instead, centred on it, in the room the window keeps there, as the hint
        // and the postcard do. Above it, the room was shorter than a notice with its Undo, which then lay over the
        // pill's words (and what is behind the window); only with no room under the card does it go above.
        const card = document.querySelector('.app-container')?.getBoundingClientRect()
        if (!card?.width) return
        document.body.removeAttribute('data-toast-raised')
        // The round controls, when they sit above the pill (a narrow screen), keep their own room: the notice is
        // centred in what is left of the card's width, left of them.
        const controls = document.querySelector('.mf-top')?.getBoundingClientRect()
        const end = controls?.width && controls.bottom <= card.top + 1 && controls.left > card.left ? Math.min(card.right, controls.left - 8) : card.right
        const sides = { '--toast-left': `${Math.round(card.left)}px`, '--toast-right': `${Math.round(window.innerWidth - end)}px` }
        // A glance hanging under the pill (box-glance.tsx): the notice goes under it where the window has the room, and
        // over its foot where it has not, as a notice lies over the foot of any list; never over the rows nearest the
        // line. A glance hung above its tabs (the screen's foot) has its foot at its top. Above the pill the notice
        // stays clear of the glance tabs standing there.
        const glance = document.querySelector('[data-glance-panel]')?.getBoundingClientRect()
        const under = glance?.height && glance.top >= card.bottom ? glance : null
        const over = glance?.height && glance.bottom <= card.top ? glance : null
        const tabs = document.querySelector('[data-glance-tabs]')?.getBoundingClientRect()
        const foot = under ? under.bottom : card.bottom
        const roomUnder = window.innerHeight - foot
        // Under the card nothing of its own is in the way: centred on the whole card.
        const whole = { '--toast-left': `${Math.round(card.left)}px`, '--toast-right': `${Math.round(window.innerWidth - card.right)}px` }
        const lane = (roomUnder >= 72 ? { ...whole, '--toast-top': `${Math.round(foot + 8)}px`, '--toast-bottom': '0px' }
          : under ? { ...whole, '--toast-bottom': `${Math.round(window.innerHeight - under.bottom + 8)}px` }
          : over ? { ...whole, '--toast-top': `${Math.round(over.top + 8)}px`, '--toast-bottom': '0px' }
          : { ...sides, '--toast-bottom': `${Math.round(window.innerHeight - (tabs?.height ? tabs.top : card.top) + 8)}px` }) as unknown as CSSProperties
        setToastLane((was) => (JSON.stringify(was) === JSON.stringify(lane) ? was : lane))
        return
      }
      // The whole row left of Create, the kind stepping back while it is up, so a notice and its
      // button fit on one line. A toast is about 34px tall: centred on the Create button.
      // One short enough is centred under the writing, as everywhere else. One too long to pass
      // Create there rises a row, still centred, on one line, and what it covers steps back.
      const at = row.getBoundingClientRect()
      const pad = parseFloat(getComputedStyle(row).paddingLeft)
      const middle = (at.left + at.right) / 2
      const fits = !toastWidth || middle + toastWidth / 2 + 16 <= last.left
      document.body.toggleAttribute('data-toast-raised', !fits)
      if (!fits) document.body.setAttribute('data-toast-tall', '')
      const next = (fits
        ? { '--toast-left': `${Math.round(2 * middle - last.left)}px`, '--toast-right': `${Math.round(window.innerWidth - last.left)}px`, '--toast-bottom': `${Math.max(4, Math.round(window.innerHeight - last.bottom - (34 - last.height) / 2))}px` }
        : { '--toast-left': `${Math.round(at.left + pad - 16)}px`, '--toast-right': `${Math.round(window.innerWidth - at.right + pad - 16)}px`, '--toast-bottom': `${Math.round(window.innerHeight - at.top + 6)}px` }) as CSSProperties
      setToastLane((was) => (JSON.stringify(was) === JSON.stringify(next) ? was : next))
    }
    place()
    const watch = new ResizeObserver(place)
    watch.observe(row)
    for (const child of row.children) watch.observe(child)
    // The glance under the pill grows and shrinks with its rows: the notice keeps clear of it as it does.
    const hung = document.querySelector('[data-glance-panel]')
    if (hung) watch.observe(hung)
    window.addEventListener('resize', place)
    return () => (watch.disconnect(), window.removeEventListener('resize', place))
  }, [reading, kind, editing, panel, chosen, toastWidth, glance])
  // The footer is told while a toast is up, so what shares its row steps back.
  const toasts = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const lane = toasts.current
    if (!lane) return
    const tell = (): void => {
      const up = lane.querySelector('[role=status]')
      footer.current?.toggleAttribute('data-toast-up', !!up)
      // Its width on one line, unwrapped, whatever room the lane gives it now.
      if (up instanceof HTMLElement) {
        const probe = up.cloneNode(true) as HTMLElement
        probe.style.cssText += ';position:fixed;left:0;top:0;visibility:hidden;width:max-content;max-width:none;margin:0'
        document.body.append(probe)
        setToastWidth(probe.offsetWidth)
        probe.remove()
      } else setToastWidth(0)
      // One too long for a line grows up over the fields above the footer: they step back too.
      document.body.toggleAttribute('data-toast-tall', !!up && (up.getBoundingClientRect().height > 40 || document.body.hasAttribute('data-toast-raised')))
    }
    const watch = new MutationObserver(tell)
    watch.observe(lane, { childList: true, subtree: true })
    return () => watch.disconnect()
  }, [])
  // What can be done to the note open in the box, written once: the gear
  // menu's first part, and what a right click on the note brings up. Nothing
  // to act on in an empty box or while reading something else, so no part then.
  // Since ⌘K in quick capture opens the main window's (e5ad3bb60), what quick capture did to its own note only through
  // its own ⌘K lives here: copying it as Markdown, sticking it on the desktop, folding its headings; and a screenshot,
  // which an empty box may take too. A small window has the same menu.
  const hasNote = !reading && (!!editing || started)
  const noteSection: Section = { label: 'This note', items: reading ? [] : [
    ...(hasNote ? [
      { label: 'Lock', hint: 'Read only until you unlock it', on: locked, set: setLocked },
      { label: 'Private', hint: 'Blurred in lists, never shown as a hint', on: secret, set: (on: boolean) => {
        setSecret(on)
        if (editing) void haligtree.setPrivate('captures', editing.id, on, true)
      } },
      { label: 'Outline', hint: 'Its headings, beside the note', on: outline, set: setOutline },
      ...(editing ? [{ label: 'Details', hint: 'Kind, date and where it came from', on: details, keys: '⇧⌘D', set: setDetails }] : []),
      ...(offersHidden > 0 ? [{ label: 'Add to a question or goal…', run: () => setOffersAll(true) }] : [])
    ] : []),
    { label: 'Attach a screenshot', hint: `The screen behind this, without ${APP_NAME}`, keys: '⇧⌘2', run: () => setTimeout(() => void attachScreenshot(), 200) },
    // Reading a report and keeping what matters: every line copied on this Mac lands in this note, Esc stops.
    isCollecting()
      ? { label: 'Stop collecting what I copy', hint: 'What you copy stays on the clipboard only', keys: '⎋', run: stopCollect }
      : { label: 'Collect what I copy', hint: 'Everything you copy on this Mac lands in this note', run: () => void (startCollect() || refuse('Open a note to collect into')) },
    ...(hasNote ? [
      // Who and where, out of sight until there is something to say: brought out here.
      ...(!askSource && !medium && !attribution && !lesson ? [{ label: asks.who || !asks.where ? 'Add who and where it’s from' : 'Add where it’s from', hint: 'The person, book or site it came from', run: () => {
        setAskSource(true)
        // After the menu has closed and handed focus back.
        setTimeout(() => document.querySelector<HTMLInputElement>('[data-box-where]')?.focus(), 250)
      } }] : []),
      { label: 'Copy as Markdown', hint: 'Ready to paste anywhere', keys: '⇧⌘C', run: copyMarkdown },
      ...(editing ? [{ label: 'Stick on the desktop', hint: 'Over every window, until you take it off', run: () => stickOnDesktop('capture', editing.id) }] : []),
      { label: 'Fold every heading', hint: 'Only its headings show', run: () => void (foldEverything(true) || chime('nope')) },
      { label: 'Unfold every heading', hint: 'Everything under them shows again', run: () => void (foldEverything(false) || chime('nope')) }
    ] : [])
  ] }
  // What quick capture starts, beside its ⌘N: a voice note kept as a capture of its own, a question.
  const newSection: Section = { label: 'New', items: [
    SMALL ? { label: 'New note', hint: 'In this window: the one here stays where it lives', keys: '⌘N', run: () => startOver() } : { label: 'New capture', keys: '⌘N', run: () => startOver() },
    { label: 'Record a voice note', hint: 'Kept as a new capture', run: () => void recordAsCapture((id) => openAny('capture', id)) },
    { label: 'New question', hint: 'Kept in Questions until it is answered', run: () => void startQuestion(openAny) }
  ] }
  // A right click on the note away from any line (a line or a selection keeps its own menu).
  const [noteMenuAt, setNoteMenuAt] = useState<{ x: number; y: number } | null>(null)
  return (
    <TooltipProvider delayDuration={500}>
    <div data-one-line={oneLine || undefined} data-pill={pill || undefined} data-glance={(glanceOn && pill) || undefined} className={`app-container ${pointerIn ? 'pointer-in' : ''} isolate flex flex-col items-center justify-center relative flex h-full w-full flex-col pt-10 color-white`}>
      {/* A small window growing keeps clear room below its card, so its own foot is not where a hand reaches: the
          card's foot resizes it, as a window's edge does (main's small:height), and growing stops there. */}
      {SMALL && (
        <div data-small-grip aria-hidden className="absolute inset-x-6 bottom-0 z-20 h-1.5 cursor-ns-resize" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            const grip = event.currentTarget
            grip.setPointerCapture(event.pointerId)
            const from = { y: event.screenY, height: grip.parentElement?.offsetHeight ?? window.innerHeight }
            const move = (moved: PointerEvent): void => void window.api.haligtree('small:height', from.height + moved.screenY - from.y)
            const up = (): void => (grip.removeEventListener('pointermove', move), grip.removeEventListener('pointerup', up))
            grip.addEventListener('pointermove', move)
            grip.addEventListener('pointerup', up)
          }} />
      )}
      {/* The pill's two ends: the kind it will be kept as (pressed, the box grows to show the kind picker) and ⌘↵.
          With no header, the room at each end drags the window, as the header does; the line between is for writing. */}
      {/* The glance tabs stand on the pill; a tab other than Write has its own line here, in the writing's place. */}
      {glanceOn && pill && <BoxGlance on={glance} pick={pickGlance} captures={captures}
        // A note, an event or the Calendar opens in the main window; a task here, in quick capture, as from the side panel.
        onOpen={(type, id) => (type === 'task' ? openAny(type, id) : (type === 'capture' && chime('open'), window.api.openInHome(type, id)))} />}
      {oneLine && !reading && glance === 'write' && (
        <div data-pill-ends aria-hidden={!pill} className={cn('pointer-events-none absolute inset-x-0 top-0 z-10 flex h-14 items-center justify-between', !pill && 'transition-opacity duration-150 ease-out motion-reduce:transition-none')} style={{ opacity: pill ? 1 : 0 }}>
          {/* Back as the pill (by a key: Esc, ⌫, ⌘↵), the ends are simply there; growing, they fade as the row under the writing arrives. */}
          {(() => {
            const Icon = (CAPTURE_TYPES.find((one) => one.id === kind) ?? CAPTURE_TYPES[0]).icon
            return (
              <div data-pill-drag="start" className="flex h-full w-[4.75rem] items-center justify-end pr-1.5" style={pill ? ({ WebkitAppRegion: 'drag' } as CSSProperties) : undefined}>
                {/* To its right: above, in a window one line tall, it was cut off. */}
                <Tip label="Kind, and more" side="right">
                  <button type="button" data-pill-kind tabIndex={-1} aria-label="Show the kind and more" disabled={!pill}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => (chime('slide'), setOpened(true))}
                    style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
                    className={cn('flex size-8 cursor-pointer items-center justify-center text-muted-foreground transition-[color,scale] duration-150 ease-out hover:text-foreground active:scale-[0.97] [&_svg]:size-5', pill && 'pointer-events-auto')}>
                    <Icon />
                  </button>
                </Tip>
              </div>
            )
          })()}
          <div data-pill-drag="end" className="flex h-full items-center justify-end pr-3" style={pill ? ({ WebkitAppRegion: 'drag' } as CSSProperties) : undefined}>
            <button type="button" data-pill-keep aria-keyshortcuts="Meta+Enter" disabled={!pill}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => latestSubmit.current()}
              style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
              className={cn('flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-control text-muted-foreground transition-colors hover:text-foreground active:scale-[0.97]', pill && 'pointer-events-auto')}>
              Keep <kbd className="font-sans text-key">⌘↵</kbd>
            </button>
          </div>
        </div>
      )}
      {/* Toasts sit above the box's footer here, clear of Create. */}
      {/* Toasts over the note, above its footer: clear of Create and of the panel. */}
      <div ref={toasts} className={toastLane ? 'contents' : `contents [--toast-bottom:6.5rem] ${panel ? `[--toast-right:${PANEL_WIDTH}px]` : ''}`} style={toastLane}><Toaster /></div>
      <PickDays />
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
          // On the card and no further: the window never grows for it, nothing is cut off at its foot, and the
          // chips above the card stay where they are (it filled the whole window before, room and all, and asked
          // for room below, so the window grew under it and the palette was clipped while it settled).
          inCard
          initial={searchFrom}
          // Words that match nothing: kept here, in the box, as the main window keeps them.
          onKeep={(as, text) => {
            setSearching(false)
            setSearchFrom('')
            void keepTyped(as, text, openAny, (words) => (setSearchFrom(words), setSearching(true)))
          }}
          // Everything the box can do, by name and key, as Raycast's ⌘K lists it.
          actions={searching === 'notes' ? [] : [
            SMALL
              ? { label: 'New note', hint: 'In this window: the one here stays where it lives', keys: '⌘N', first: true, run: () => startOver() }
              : { label: 'New capture', hint: 'Keeps what is written, then a blank box', keys: '⌘N', first: true, run: () => startOver() },
            { label: 'Record a voice note', hint: 'Kept as a new capture', first: true, cue: null, run: () => void recordAsCapture((id) => openAny('capture', id)) },
            { label: 'Record a call or lecture', hint: 'Your microphone and this Mac’s sound, who said what', keys: '⌃⌥⌘M', words: MEETING_WORDS, cue: null, run: () => void recordMeeting() },
            ...(recordingsWithoutWords() ? [{ label: 'Transcribe the voice notes', hint: 'Their words under each, on this Mac', cue: null, run: transcribePage }] : []),
            { label: 'New question', hint: 'Something you want to find out, kept in Questions until it is answered', first: true, cue: null, run: () => void startQuestion(openAny) },
            // Not offered in "One line to start", which has no side panel to show, nor in a small window, which has none.
            ...(SMALL ? [] : [{ label: panel ? 'Hide the side panel' : 'Show the side panel', hint: panel ? 'The box alone, without the lists beside it' : 'The Inbox, Tasks and Review beside the box', keys: '⌘\\', cue: null, run: () => (setPanel(!panel), quietly(() => setPanel(panel))) }]),
            ...(SMALL ? [] : TABS.map((one, index) => ({ label: `Go to ${({ inbox: 'Inbox', today: 'Tasks', review: 'Review', kept: 'Saved', recent: 'Recent' } as Record<string, string>)[one] ?? one}`, hint: 'In the side panel beside the box', keys: `⌃${index + 1}`, run: () => {
              setTab(one)
              if (!panel) setPanel(true)
            } }))),
            ...(picked.ids.length > 1 ? [{ label: 'Make one task', hint: `From the ${num(picked.ids.length)} selected captures`, first: true, cue: null, run: () => window.dispatchEvent(new CustomEvent('haligtree:one-task')) }] : []),
            { label: 'Stick Today on the desktop', hint: 'Today’s tasks on a sticky note, over every window', cue: null, run: () => stickOnDesktop('today', 'today') },
            { label: 'Stick all goals', hint: 'On the desktop, each goal in its own colour, with a legend', words: 'desktop sticky stickies one', cue: null, run: () => stickOnDesktop('goals', 'all') },
            { label: 'Tidy captures', hint: 'A few minutes tagging your latest captures', run: () => openPass('tidy') },
            { label: 'Decide what to keep', hint: 'Once a week, look over what waited', run: () => openPass('decide') },
            { label: 'Read the Inbox', hint: 'From the top, one at a time', run: () => setReadList({ items: captures.filter((one) => one.status === 'open' && !one.archivedAt).map((one) => ({ type: 'capture', id: one.id })), start: 0 }) },
            { label: 'Copy as Markdown', hint: 'This note', first: true, keys: '⇧⌘C', run: copyMarkdown },
            ...(reading ? [] : [{ label: 'Attach a screenshot', hint: `The screen behind quick capture, without ${APP_NAME}`, first: true, keys: '⇧⌘2', cue: null, run: () => setTimeout(() => void attachScreenshot(), 200) }]),
            ...(editing ? [{ label: 'Stick on the desktop', hint: 'This note', cue: null, run: () => stickOnDesktop('capture', editing.id) }] : []),
            { label: locked ? 'Unlock this note' : 'Lock this note', hint: locked ? 'You can write in it again' : 'Read only until you unlock it', cue: locked ? 'off' : 'on', run: () => (setLocked(!locked), toast(locked ? 'Note unlocked' : 'Note locked: read only', () => setLocked(locked))) },
            { label: secret ? 'Make it not private' : 'Make it private', hint: 'This note', cue: secret ? 'off' : 'on', run: () => {
              const set = (on: boolean): void => {
                setSecret(on)
                if (editing) void haligtree.setPrivate('captures', editing.id, on)
              }
              set(!secret)
              // The footer's “Private” lights or goes out in front of you: ⌘Z still takes it back.
              quietly(() => set(secret))
            } },
            { label: outline ? 'Hide the outline' : 'Show the outline', hint: 'The note’s headings, to jump between them', cue: outline ? 'off' : 'on', run: () => (setOutline(!outline), quietly(() => setOutline(outline))) },
            { label: 'Fold every heading', hint: 'In the note in front: only its headings show', cue: null, run: () => void (foldEverything(true) || chime('nope')) },
            { label: 'Unfold every heading', hint: 'In the note in front: everything under its headings shows again', cue: null, run: () => void (foldEverything(false) || chime('nope')) },
            { label: source ? 'Hide the source' : 'Show the source', hint: 'The note as JSON, for the technical', keys: '⌘E', cue: null, run: () => setSource(!source) },
            { label: vim ? 'Turn vim keys off' : 'Turn vim keys on', hint: vim ? 'Keys type as they usually do' : 'Move and edit with Vim’s keys: Esc, then h, j, k, l', cue: vim ? 'off' : 'on', run: () => (setVim(!vim), toast(vim ? 'Vim keys off' : 'Vim keys on', () => setVim(vim))) },
            { label: hideButtons ? 'Show the buttons again' : 'Hide the buttons', hint: hideButtons ? 'Every button shows all the time' : 'Until you point at them', keys: '⌥⌘,', cue: hideButtons ? 'off' : 'on', run: () => setHideButtons(!hideButtons) },
            ...(editing ? [] : [{ label: createMore ? 'Turn “Create more” off' : 'Turn “Create more” on', hint: 'Keep quick capture open after each save', keys: '⌥C', cue: (createMore ? 'off' : 'on') as 'off' | 'on', run: () => setCreateMore(!createMore) }]),
            { label: counting ? 'Hide the word count' : 'Show the word count', hint: 'Under the note', cue: counting ? 'off' : 'on', run: () => (setCounting(!counting), quietly(() => setCounting(counting))) },
            { label: appSettings?.sounds ? 'Turn sounds off' : 'Turn sounds on', hint: appSettings?.sounds ? 'Every action happens quietly' : 'A small sound answers each action', cue: null, run: () => {
              soundOn(!appSettings?.sounds)
              chime(appSettings?.sounds ? 'off' : 'on')
              void haligtree.setSettings({ sounds: !appSettings?.sounds })
              const was = !!appSettings?.sounds
              toast(was ? 'Sounds off' : 'Sounds on', () => (soundOn(was), void haligtree.setSettings({ sounds: was })))
            } },
            { label: appSettings?.safeMode ? 'Turn safe mode off' : 'Turn safe mode on', hint: appSettings?.safeMode ? 'Hints, pins, sticky notes and goal cards come back' : 'Nothing comes up unasked, for sharing your screen', keys: '⌥⌘S', cue: appSettings?.safeMode ? 'off' : 'on', run: () => {
              const on = !appSettings?.safeMode
              sayNow(haligtree.setSettings({ safeMode: on }), on ? 'Safe mode on' : 'Safe mode off', () => void haligtree.setSettings({ safeMode: !on }))
            } },
            { label: recordable ? 'Hide from recordings' : 'Show in recordings', hint: `${APP_NAME} in screen recordings and shares`, cue: recordable ? 'off' : 'on', icon: recordable ? CameraOffIcon : CameraIcon, run: () => setRecordable(!recordable) },
            // Away for a meeting or quiet hours: the way to have them out all the same.
            ...deskAwayAction(desk),
            { label: appSettings?.stickiesShown === false ? 'Show sticky notes' : 'Hide sticky notes', hint: appSettings?.stickiesShown === false ? 'Your sticky notes back on the desktop' : 'Off the desktop for now, kept as they are', keys: '⌃⌥⌘N', cue: null, run: () => {
              const show = appSettings?.stickiesShown === false
              void haligtree.setSettings({ stickiesShown: show }).then(() => (show ? quietly : (undo: () => void) => toast('Sticky notes hidden. ⌃⌥⌘N brings them back', undo))(() => void haligtree.setSettings({ stickiesShown: !show })))
            } },
            ...(desk?.hidden ? [] : [{ label: 'Bring sticky notes here', hint: 'Every sticky note, fanned out at the top right of this screen', cue: null, run: () => window.api.gatherStickies() }]),
            ...(stickiesOut > 0 && !appSettings?.safeMode ? [{ label: 'Tidy stickies', hint: 'Line the sticky notes up in a neat column', keys: '⌃⌥⌘T', cue: null, run: () => window.api.tidyStickies() }] : []),
            { label: reveal ? 'Blur private titles again' : 'Show private titles', hint: reveal ? 'Private titles blurred until you point at them' : 'For now', cue: reveal ? 'off' : 'on', run: () => (setReveal(!reveal), quietly(() => setReveal(reveal))) },
            { label: editing || reading || hasContent(body) ? 'Open in main window' : 'Open the main window', hint: editing || reading || hasContent(body) ? 'This note in the main window, kept first' : 'Every page of your book', keys: '⌘O', first: true, run: () => void promote() },
            ...(SMALL ? [] : [{ label: 'Open in a small window', hint: 'Keeps writing there while quick capture stays free', keys: '⌥⌘O', first: true, cue: null, run: () => void promote('small') }]),
            isCollecting()
              ? { label: 'Stop collecting what I copy', hint: 'What you copy stays on the clipboard only', keys: '⎋', cue: null, run: stopCollect }
              : { label: 'Collect what I copy', hint: 'Everything you copy on this Mac lands in this note', cue: null, run: () => void (startCollect() || refuse('Open a note to collect into')) },
            { label: "Open the week's page", hint: 'This week on one page: what you wrote, did and kept', cue: 'season', run: () => window.api.openInHome('view', 'weekpage') },
            { label: "Open the month's page", hint: 'This month on one page: what you wrote, did and kept', cue: 'season', run: () => window.api.openInHome('view', 'monthpage') },
            { label: "Open the year's page", hint: 'Your seasons of life, month by month', cue: 'season', run: () => window.api.openInHome('view', 'yearpage') },
            ...noteActions(),
            ...abandonAction,
            ...practiceActions,
            { label: 'Keyboard shortcuts', hint: 'Every key, by what it does', keys: '?', run: () => window.dispatchEvent(new CustomEvent('haligtree:shortcuts')) },
            { label: 'Import Obsidian or Notion…', hint: 'A vault or a Notion export', cue: null, run: () => void window.api.importFrom('vault') },
            { label: 'Import from Apple Notes…', hint: 'Folder by folder, into Writing, to sort', cue: null, run: () => void window.api.importFrom('apple-notes') },
            { label: 'Import highlights and files…', hint: 'Readwise, Kindle, Markdown, bookmarks, Anki decks (.apkg, .colpkg) or CSV', cue: null, run: () => void window.api.importFrom('files') },
            ...themeActions((text, undo) => toast(text, undo)),
            { label: appSettings?.blur === false ? 'Turn blurring on' : 'Turn blurring off', hint: appSettings?.blur === false ? 'Private notes blurred until you point at them' : 'Private notes shown plainly', cue: appSettings?.blur === false ? 'on' : 'off', run: () => {
              const on = appSettings?.blur === false
              sayNow(haligtree.setSettings({ blur: on }), on ? 'Blurring on' : 'Blurring off', () => void haligtree.setSettings({ blur: !on }))
            } },
            { label: 'Settings', hint: 'Look, sounds, keys, backups and your book', keys: '⌘,', run: () => window.api.openInHome('view', 'settings') },
            // The recap opens in the main window, over Stats.
            // The month's story, as Home's ⌘K has it: the month before until the 7th.
            { label: 'Your month in notes, wrapped', hint: 'What you captured most, your busiest day, the hour ideas came, focus hours, gems kept, what went well', run: () => window.api.openInHome('wrap', `month:${(dayjs().date() < 7 ? dayjs().subtract(1, 'month') : dayjs()).format('YYYY-MM')}`) },
            { label: 'Your year, wrapped', hint: 'Your year in notes, a card at a time', run: () => window.api.openInHome('recap', 'year') }
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
      <Header panel={panel} drawn={panelDrawn} onPanel={SMALL ? undefined : () => setPanel(!panelWanted.current)} onBrowse={SMALL ? () => (chime('tap'), setSearching('notes')) : undefined} onAutoSize={SMALL && small && !small.auto ? () => (chime('on'), setSmallSwitch({ auto: true })) : undefined} nav={trail.stack.length > 1 && (
        // Back and forward, joined in one pill as Safari and Raycast do it.
        <span className="mf-segs ml-3 self-center rounded-full shrink-0 border border-foreground/15 [&_svg]:size-3">
          {([['Back  ⌘[', -1, ChevronLeft], ['Forward  ⌘]', 1, ChevronRight]] as const).map(([label, by, Icon]) => (
            <Tip key={label} label={label}>
              <button type="button" tabIndex={-1} aria-label={label} disabled={!trail.stack[trail.at + by] && trail.stack[trail.at + by] !== null}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => travel(trail.at + by)}
                className="mf-seg flex size-[18px] items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:opacity-35">
                <Icon className="size-3.5" />
              </button>
            </Tip>
          ))}
        </span>
      )} onNew={() => {
        chime('tap')
        startOver()
      }} title={SMALL ? (editing ? first || 'Untitled' : topTitle) : appSettings?.topTitle === false ? null : topTitle}
      // Safe mode says so beside the pill, or the quiet looks like nothing happening.
      aside={appSettings?.safeMode ? <Tip label="Safe mode: no hints or pinned notes come up  ⌥⌘S"><span className={`flex items-center ${HEADER_SHAPE} px-2.5 text-key leading-none text-[color-mix(in_srgb,var(--tt-brand-color-400)_55%,var(--foreground))]`}>Safe</span></Tip>
        // Pinned notes live in the side panel's Inbox; with the panel shut, a
        // chip up here says they are there, and opens it on them. Kept with
        // the panel open too, so it never pops out as the panel slides in.
        : pinned.length > 0 && !lesson && !SMALL && !unloaded(pinned) ? (
          // Its name says what pressing it does, for the bar's word when Tab chooses it. From the pill too: the pill grows
          // into the box with the panel open on them.
          <Tip label={panel ? 'Show the Inbox in the side panel  ⌃1' : `Your ${plural(Math.min(BOX_PINS, pinned.length), 'pinned note')}, in the side panel  ⌘\\`}>
            <button type="button" data-waiting style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                // The panel out already: only a change of list, said as ⌃1 says it. Asked again, the panel ran the
                // whole move to the same shape, the frost off and on under it, with a slide for nothing.
                if (panel && tab !== 'inbox') chime('tap')
                setTab('inbox')
                if (!panel) setPanel(true)
              }}
              className={`group/waiting flex items-center gap-1 ${HEADER_SHAPE} pr-1.5 pl-2.5 text-key leading-none text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground`}>
              <span><Rolling text={Math.min(BOX_PINS, pinned.length)} /> pinned</span>
              {/* Says it opens something: a chevron that leans on hover. */}
              <ChevronRight aria-hidden className="size-3 transition-transform group-hover/waiting:translate-x-0.5" />
            </button>
          </Tip>
        ) : null}
      menu={(expanded, toggleExpanded) => (
        <OptionsMenu
          label="Options"
          icon={<AliveIcon icon={GearIcon} size={14} />}
          side="bottom"
          align="end"
          className="relative size-[22px] flex-none after:absolute after:-inset-0.5 after:rounded-full rounded-full hover:bg-accent/60"
          // One menu for every tweak, in four parts: the note, what it starts, quick capture's switches, the window.
          sections={[
            noteSection,
            newSection,
            // Every switch in plain sight, none folded into a submenu: a submenu hides them and runs off the small box's edge.
            { label: SMALL ? 'Small window' : 'Quick capture', items: [
              'sounds',
              'theme',
              { label: 'Hide buttons', hint: 'They show when you point at them', on: hideButtons, keys: '⌥⌘,', set: (on: boolean) => setHideButtons(on) },
              { label: 'Vim keys', on: vim, set: setVim },
              { label: 'Word count', hint: 'Under the note', on: counting, set: setCounting },
              // A small window's own two: it grows with the words (off once resized by hand), and it steps aside when
              // clicked past close by, as quick capture does kept open (main's stepAside).
              ...(SMALL && small ? [
                { label: 'Auto-size', hint: 'Grows as you write', on: small.auto, set: (auto: boolean) => setSmallSwitch({ auto }) },
                { label: 'Steps aside', hint: 'When you click past it, close by', on: small.aside, set: (aside: boolean) => setSmallSwitch({ aside }) },
                { label: 'Keep on top', hint: 'Over other apps, as quick capture is', on: small.top, set: (top: boolean) => setSmallSwitch({ top }) }
              ] : SMALL ? [] : [
                // Settings' "Auto-close quick capture", here too: off, the box stays open and steps aside (main's stepAside).
                { label: 'Close when you click away', hint: 'Off: it stays open and steps aside', on: appSettings?.boxAutoHide !== false, set: (boxAutoHide: boolean) => void haligtree.setSettings({ boxAutoHide }) }
              ]),
              { label: 'Show in screen recordings', on: recordable, set: setRecordable },
              { label: 'Show private titles', hint: SMALL ? 'Until this window closes' : 'Until quick capture closes', on: reveal, set: setReveal },
              // For the technical: the note open, as JSON.
              ...(hasNote ? [{ label: 'Raw data', hint: 'The note as JSON, for the technical', on: source, keys: '⌘E', set: setSource }] : [])
            ] },
            { label: 'Window', items: [
              { label: editing || reading || hasContent(body) ? 'Open in main window' : 'Open the main window', keys: '⌘O', run: () => void promote() },
              ...(SMALL ? [] : [
                { label: 'Open in a small window', hint: 'Keeps writing there while quick capture stays free', keys: '⌥⌘O', run: () => void promote('small') },
                { label: expanded ? 'Shrink the window' : 'Expand the window', keys: '⌃⇧F', run: toggleExpanded }
              ]),
              { label: 'Keyboard shortcuts', hint: 'Every key, by what it does', keys: '?', run: () => window.dispatchEvent(new CustomEvent('haligtree:shortcuts')) },
              { label: 'Settings', keys: '⌘,', run: () => window.api.openInHome('view', 'settings') }
            ] }
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
          {/* Behind a glance tab's line the writing waits, kept as it is and out of sight. */}
          <motion.div ref={column} className="h-full w-full flex flex-col" style={glance !== 'write' ? { visibility: 'hidden' } : undefined}>
            {reading ? (
              <motion.div key={reading.id} initial={byKeys() ? false : { opacity: 0, transform: shift(`translateX(${8 * cameBy.current}px)`) }} animate={{ opacity: 1, transform: shift('translateX(0px)') }} transition={{ duration: 0.1, ease: EASE }} className="flex min-h-0 flex-1 flex-col">
                {/* A small window holds this one page and no note behind it: nothing to go back to but its own Back. */}
                {!SMALL && (
                  <div data-chrome className="flex items-center gap-2 px-[4.25rem] pt-2 text-control text-muted-foreground">
                    <Button variant="ghost" size="sm" onClick={() => setReading(null)}>
                      <ArrowLeft className="size-4" /> Back to your note
                    </Button>
                    <Kbd>⌘[</Kbd>
                  </div>
                )}
                <div ref={setReadPane} data-reading-pane className="@container/page relative flex min-h-0 flex-1">
                  <Reader type={reading.type} id={reading.id} onOpen={openAny} onClose={() => setReading(null)} />
                  {/* The house rules for a long page: edges that fade where more is hidden (main.css), and Top. */}
                  {/* Above the page's own "Add a thought" bar, never on it. */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 bottom-20"><BackToTop target={readScroller} /></div>
                </div>
              </motion.div>
            ) : (
            <SmallHold note={SMALL ? editing : null} title={first} hidden={secret} onBack={() => editing && openCapture(editing.id, true)}>
            {/* Keyed like the editor, so each note that opens, old or fresh,
                eases in rather than snapping into place. */}
            <motion.div
              key={editing?.id ?? round}
              className="flex min-h-0 flex-1 flex-col"
              // A right click on the note away from its lines opens what the gear
              // menu has for this note. A field keeps the system's own menu.
              // Anything in the writing is the editor's own (its block menu):
              // a block drawn by React (a recording, a picture) hands React this
              // event before the editor hears it, so it is left alone by place,
              // not by whether the editor has taken it yet.
              onContextMenu={(event) => {
                if (event.defaultPrevented || !noteSection.items.length || (event.target as Element).closest('input, textarea, button, a, .tiptap-excalidraw-canvas, .ProseMirror')) return
                event.preventDefault()
                setNoteMenuAt({ x: event.clientX, y: event.clientY })
              }}
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
              pill={pill}
              locked={locked}
              outline={outline}
              autofocus={!quietOpen.current}
              // Named as its tab and lists name it: a vault note by its own title, not a first line that says something else.
              onTitleOut={(line) => setTopTitle(line && (captures.find((one) => one.id === editing?.id)?.label || line))}
              onReady={(editor) => {
                quietOpen.current = false
                editorRef.current = editor
                words.ready(editor)
                if (toEnd.current) (toEnd.current = false, requestAnimationFrame(() => editor.commands.focus('end')))
                box.guard(editor)
                // A second line typed, or words wrapping past the one: the pill grows into the box before this frame is
                // drawn (see measureWraps). Words wrapping count only with the card at the pill's own width: a change
                // can come while it is not yet (a draft put in as the box opens, the card 344px wide mid-resize), and
                // there a one-line draft ("Rosetta Stone") wrapped a letter to a line and grew into the box
                // (qa/hint-room.mjs). Measured at any other width, they wait for the box to draw (the layout effect above).
                editor.on('update', () => {
                  if (!oneLineNow.current || wrapsNow.current) return
                  const doc = column.current?.querySelector<HTMLElement>('.ProseMirror')
                  if (!doc) return
                  // A new block, or a line break in the one (⇧↩): both are a new line whatever the width.
                  if (doc.childElementCount > 1 || doc.querySelector('br:not(.ProseMirror-trailingBreak)')) return flushSync(() => setWraps(true))
                  const card = doc.closest<HTMLElement>('.app-container')
                  const settled = !!card && !!window.api.room.pill && Math.abs(card.getBoundingClientRect().width - window.api.room.pill) < 1
                  if (settled && measureWraps.current()) flushSync(() => setWraps(true))
                })
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
              quietSpelling={!!defining}
              after={editing ? <>
                {/* Made just now by a link to a name found nowhere: why it is empty, said under its name (captures-view.tsx says it over its words). */}
                {madeByLink(editing.id) && <p data-made-by-link className="mt-1 text-body text-foreground"><strong className="font-semibold">A new note:</strong> {madeByLink(editing.id)}</p>}
                <Mentions id={editing.id} compact onOpen={(type, id) => openAny(type, id)} />
              </> : definition && <DefineGhost definition={meaningWaits ? { ...definition, state: 'looking' } : definition} onKeep={keepDefinition} onHide={hideDefinition} picked={chosen} mode={meanings === 'off' ? 'one-word' : meanings} onFix={(fix) => definition && fixIn(editorRef.current, definition.word, fix)} />}
              onSource={() => setSource((open) => !open)}
              // A tag opens its page in the main window, as a note link opens there.
              onTag={(tag) => (chime('open'), window.api.openInHome('tag', tag))}
              onChange={(doc, editor) => {
                // The editor typed into is the one kept, even if it was made without a word to onReady.
                if (editorRef.current !== editor && editor !== retired.current && !editor.isDestroyed) editorRef.current = editor
                if (editing?.id !== editingNow.current) return words.save(doc, editor)
                setBody(doc)
                // The kind follows the wording of the first line until you
                // choose one; a link kept as plain text is a note. A quote's
                // "- Name" fills Who said it, from the plan (see above).
                const guess = (chosen ? kind : (planNow(editor)?.kind ?? boxGuess(firstLine(doc)) ?? 'note')) as CaptureType
                if (!chosen && !editing) setKind(guess)
                // Only a capture already kept is written as you type; a new note's
                // Markdown is made once, when it is saved, not on every pause.
                if (editing) words.save(doc, editor)
              }}
            />
            {/* A draft left an hour or more: a small chip, never the top of the box. */}
            {/* While it is the pill (in quick capture's room), the chip is drawn outside the writing's scroller, in the
                page's own layer, so it is never overflow there for the caret to scroll the words away to (main.css). */}
            {leftover && !editing && !started && glance === 'write' && (pill && window.api.room.left ? createPortal(<div data-leftover-row className="flex items-center px-[4.75rem] pt-1.5">
                {/* No tip: its own words say what it is and what a click does, and a tip over it was a second surface. */}
                  <button type="button" data-leftover onMouseDown={(event) => event.preventDefault()} onClick={leftoverBack}
                    className="inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full bg-accent/60 px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.97]">
                    {/* What it is, then what a click does, in words: "Still to keep" left a newcomer guessing at both. */}
                    <span className="shrink-0">Unsaved from earlier:</span>
                    <span className="truncate text-(--mf-muted-strong)">{leftoverName(leftover)}</span>
                    <span aria-hidden className="text-muted-foreground/60">·</span>
                    <span className="shrink-0 font-medium text-foreground">Bring it back</span>
                  </button>
                  <button type="button" data-leftover-drop aria-label="Not this one" onMouseDown={(event) => event.preventDefault()} onClick={dropLeftover}
                    className="ml-1 inline-flex size-6 cursor-pointer items-center justify-center rounded-full shrink-0 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.97]">
                    <X className="size-3.5" />
                  </button>
              </div>, document.body) : (
              <div data-leftover-row className="flex items-center px-[4.75rem] pt-1.5">
                {/* No tip: its own words say what it is and what a click does, and a tip over it was a second surface. */}
                  <button type="button" data-leftover onMouseDown={(event) => event.preventDefault()} onClick={leftoverBack}
                    className="inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full bg-accent/60 px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.97]">
                    {/* What it is, then what a click does, in words: "Still to keep" left a newcomer guessing at both. */}
                    <span className="shrink-0">Unsaved from earlier:</span>
                    <span className="truncate text-(--mf-muted-strong)">{leftoverName(leftover)}</span>
                    <span aria-hidden className="text-muted-foreground/60">·</span>
                    <span className="shrink-0 font-medium text-foreground">Bring it back</span>
                  </button>
                  <button type="button" data-leftover-drop aria-label="Not this one" onMouseDown={(event) => event.preventDefault()} onClick={dropLeftover}
                    className="ml-1 inline-flex size-6 cursor-pointer items-center justify-center rounded-full shrink-0 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.97]">
                    <X className="size-3.5" />
                  </button>
              </div>
            ))}
            {/* Reading another capture with a note half written: the way back
                to it stays in view, so a link followed never loses the draft. */}
            {waiting && (
              <div className="flex items-center gap-2 px-[4.75rem] pt-2 text-xs text-muted-foreground">
                {/* A sentence, so it types in; the key drawn as a key. */}
                <span className="truncate"><Typed text={`Your draft ${quoted(shownName(firstLine(waiting)) || 'unfinished', 33)} is waiting:`} /></span>
                <span className="flex shrink-0 items-center gap-1"><Pressed keys="⌘[" /> takes you back.</span>
              </div>
            )}
            {/* "start" (or "focus", "timer") alone, as Raycast's focus command is typed: how long, one press away. */}
            {!editing && /^(start|focus|timer)$/i.test(boxText.trim()) && (
              <div data-start-lengths className="flex flex-wrap items-center gap-1.5 px-[4.75rem] pt-1.5 text-xs text-muted-foreground animate-in fade-in-0 duration-150">
                <span className="mr-0.5">How long?</span>
                {[5, 10, 15, 25, 45, 60].map((minutes) => (
                  <button key={minutes} type="button" data-start-length={minutes}
                    className="rounded-md bg-accent/60 px-2 py-0.5 text-foreground tabular-nums transition-colors hover:bg-accent"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => (chime('tap'), editorRef.current?.chain().focus('end').insertContent({ type: 'text', text: `${/\s$/.test(boxText) ? '' : ' '}${minutes}m ` }).run())}>
                    {minutes} min
                  </button>
                ))}
              </div>
            )}
            {/* What sending it will do, read from the lit words, each with its ×. */}
            {!editing && !/^(start|focus|timer)$/i.test(boxText.trim()) && (
              <WillDo
                plan={plan}
                joins={twin}
                orQuestion={plan?.kind === 'todo' && askedLine(textOf(body)) ? () => keepAsQuestion(askedLine(textOf(body))!) : undefined}
                asks={!!loneQuestion(plan, boxText)}
                list={listed && !listed.mixed ? tasksSaid(listed.list) : null}
                // The same as Create: the page kept, then sorted line by line.
                onSort={listed?.mixed ? () => latestSubmit.current() : null}
                onKeep={(tokens) => {
                  const view = editorRef.current?.view
                  if (!view || !tokens.length) return
                  // Where they stand now: a list's lines move as the ones above them are typed in.
                  const now = planNow(editorRef.current)?.tokens.filter((one) => tokens.some((was) => was.id === one.id && was.effect === one.effect)) ?? tokens
                  const seqs = now.map((one) => keepPlain(view, one))
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
                onNewQuestion={(name) => void haligtree.newQuestion(name).then((id) => {
                  chime('hold')
                  toast(`Kept as a question: ${quoted(name, 36)}`, () => void haligtree.dropQuestion(id), 'success', undefined, { type: 'question', id, title: name })
                })}
              />
            )}
            <TokenHint hover={tokenHover} />
            {/* Under the writing: what it is, who said it and where you met it. */}
            {/* Wraps onto a second line rather than squeezing a field or a chip. */}
            <div data-chrome data-under-tall-toast className="flex min-h-12 flex-wrap items-center gap-1 px-[4.75rem] py-2">
              {/* Only what this kind asks for, unless it already holds something. */}
              {/* Who and where once there is something to say it about, and only
                  what this kind asks for, unless it already holds something. */}
              {((started && !editing && asks.who) || attribution || (askSource && (!!asks.who || !asks.where))) && (
                <ReadFrom tip={readWho ? readTip : ''}>
                <Remembered field="attribution" data-read-from={readWho || undefined} complete={!lesson} value={attribution} placeholder={asks.who ?? 'Who'} className={cn(FIELD, readWho && READ)} onChange={(value) => {
                  setAskSource(true)
                  setAttribution(value)
                  if (editing) void haligtree.setCapture(editing.id, 'attribution', value.trim() || null)
                }} />
                </ReadFrom>
              )}
              {((started && !editing && asks.where) || medium || askSource) && (
                <ReadFrom tip={readWhere ? readTip : ''}>
                <Remembered field="medium" data-box-where data-read-from={readWhere || undefined} complete={!lesson} value={medium} placeholder={asks.where ?? 'Where from'} className={cn(FIELD, readWhere && READ)} onChange={(value) => {
                  setAskSource(true)
                  setMedium(value)
                  if (editing) void haligtree.setCapture(editing.id, 'medium', value.trim() || null)
                }} />
                </ReadFrom>
              )}
              {/* Private shows only when it is on; it is switched in the gear menu. */}
              {secret && (
                <Tip label="Private: blurred in lists, never shown as a hint. Click to make it not private">
                  <Button variant="ghost" size="icon-sm" aria-label="Private" aria-pressed onClick={() => {
                    setSecret(false)
                    if (editing) void haligtree.setPrivate('captures', editing.id, false)
                  }}>
                    <EyeOff />
                  </Button>
                </Tip>
              )}
              {/* Where you were as the box came up: said before it is kept, left off with ×. */}
              {started && !editing && !lesson && fromKept() && (
                <span data-box-from={from!.app} className="flex min-h-6 min-w-0 max-w-full shrink items-center gap-1.5 rounded-full border border-border bg-muted py-0.5 pl-2.5 pr-0.5 text-xs text-muted-foreground animate-in fade-in-0 duration-200">
                  <AppWindow className="size-3.5 shrink-0" />
                  <span className="truncate">From <span className="text-foreground">{from!.app}</span>{from!.page || from!.title ? <>: {quoted(from!.page || from!.title, 48)}</> : null}</span>
                  {from!.ask === 'ask' && (
                    <Tip label={`Keeps the address of the page open in ${from!.browser}. Your Mac asks you once`}>
                      <button type="button" data-box-from-ask onClick={askPage} className="shrink-0 cursor-pointer rounded-full px-1.5 font-medium text-foreground hover:bg-accent">Add the page</button>
                    </Tip>
                  )}
                  {from!.ask === 'denied' && (
                    <Tip label={`Your Mac does not let Haligtree read ${from!.browser}'s page. Turn it on under Privacy & Security, Automation`}>
                      <button type="button" data-box-from-allow onClick={() => (chime('tap'), void window.api.haligtree('site-block:privacy'))} className="shrink-0 cursor-pointer rounded-full px-1.5 font-medium text-foreground hover:bg-accent">Allow the page…</button>
                    </Tip>
                  )}
                  <Tip label="Leave it off this note">
                    <button type="button" aria-label="Leave it off this note" data-box-from-off onClick={() => (chime('off'), setFromOff(true))} className="grid size-5 shrink-0 cursor-pointer place-items-center rounded-full hover:bg-accent hover:text-foreground"><X className="size-3" /></button>
                  </Tip>
                </span>
              )}
              {like && !plus && !lesson && !listed && !twin && (
                <Tip label={`Open it: ${like.title}`}>
                <button
                  type="button"
                  onClick={() => openCapture(like.id)}
                  // Hard to miss but not loud: a brand-tinted chip whose words
                  // roll in when a match arrives, and roll over when it changes.
                  className="group/like ml-auto flex min-h-6 max-w-full shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--tt-brand-color-400)_35%,transparent)] bg-[color-mix(in_srgb,var(--tt-brand-color-400)_12%,transparent)] px-2.5 py-0.5 text-xs text-foreground animate-in fade-in-0 zoom-in-95 duration-200 hover:bg-[color-mix(in_srgb,var(--tt-brand-color-400)_20%,transparent)]"
                >
                  {/* Still, not pulsing: it turns up while you write, and a beat that never stops pulls the eye off the words. */}
                  <span className="size-1.5 shrink-0 rounded-full bg-[var(--tt-brand-color-400)]" />
                  <span className="truncate"><Rolling by="word" text={`Similar to ${quoted(shownName(like.title), 48)}`} /></span>
                  {/* Says it goes somewhere: an arrow that leans further on hover. */}
                  <ArrowUpRight className="size-3.5 shrink-0 text-[var(--tt-brand-color-400)] transition-transform group-hover/like:translate-x-0.5 group-hover/like:-translate-y-0.5" />
                </button>
                </Tip>
              )}
              {/* In the welcome, what filled them, in the accent as the kind chip's guess is (main.css):
                  a line of its own under them, so it points the same way at any width and never meets Create. */}
              {lesson && (readWho || readWhere) && <span data-read-note className="basis-full px-1.5 text-xs font-medium text-primary animate-in fade-in-0 duration-200">↑ read from “- who, where” after the quote</span>}
            </div>
            {/* Where else it could go, the questions kept in view and the open goals, on
                one quiet line, and only once a few words are written: an empty box asks nothing. */}
            {started && !plus && !focus && !lesson && textOf(body).trim().split(/\s+/).length >= 3 && (
              <div data-under-tall-toast><BoxOffers quietAsk={plan?.kind === 'todo' || !!loneQuestion(plan, boxText)} words={textOf(body)} linked={JSON.stringify(body)} all={offersAll} onHidden={setOffersHidden} onClue={clueToPinned} onLog={logToGoal} onAsk={keepAsQuestion} /></div>
            )}
            {/* A hint: a glance at something you wrote once, while you are here to write. Usually empty. In a
                note's own window it sits at the foot of the card; in quick capture, in the room above it (below). */}
            {!window.api.room.left && (
              <div data-chrome data-under-tall-toast data-hint-foot className="px-[4.75rem]">
                {!focus && !lesson && <HintCard onOpen={openAny} />}
              </div>
            )}
            </motion.div>
            </SmallHold>
            )}
            {/* How quick capture moves, one way for every shape: a small grabber just above the card (a sheet's), shown
                with the pointer in. Held, the box follows; double-clicked, it goes back to its home (main's boxHome). */}
            {!!window.api.room.left && (
              <div data-grabber aria-label="Move quick capture" title=""
                onPointerDown={(event) => { if (event.button !== 0 || event.detail > 1) return; carryWindow(event.nativeEvent, event.currentTarget) }}
                onDoubleClick={() => (chime('slide'), window.api.boxHome())}>
                <span />
              </div>
            )}
            {/* Quick capture's hint, out of the card: above its top left edge, beside the round controls, never
                over them. Kept while it waits (the pill, a menu, ⌘K, recording, reading) and gone at the first word. */}
            {!!window.api.room.left && !focus && !lesson && (
              <HintRoom away={started || pill || recording || !!reading || !!searching}>
                <HintCard onOpen={openAny} />
              </HintRoom>
            )}
            {!reading && (
            <main ref={footer} data-chrome data-zen-row className="@container/row relative flex items-center gap-1 pt-2 pb-3 px-[4.75rem]">
              {/* While a voice note records (or you talk to type), the recorder bar takes this row: it grows out of the
                  mic over the row's own place, under the words, which stay in sight (recorder-bar.tsx). */}
              <div ref={recordSlot} data-recorder-slot className="absolute inset-x-[4.75rem] top-2 bottom-3 empty:hidden" />
              {/* What matters first is the writing and Create; every other
                  switch is in here, each keeping its own key. */}
              {/* A kind other than Note stays in sight while the rest fades as you type. */}
              <span data-under-toast data-zen-keep={kind !== 'note' || undefined} data-while-recording={listening ? 'dim' : undefined} inert={listening} className="inline-flex"><CaptureKindPicker
                suggested={!chosen && kind !== 'note' && !lesson}
                pill={pill}
                value={kind}
                onChange={pick}
              /></span>
              {kind === 'checkback' && (
                <span data-under-toast data-zen-keep className="inline-flex min-w-28">
                  {/* The one part of the row that gives way when it is short: its words cut, never Create. */}
                  <DatePicker key={backAsk} startOpen={backAsk > 0} value={backOn} placeholder="Which day?"
                    suggest={['tomorrow', 'in a week', 'in 2 weeks', 'in a month', 'in 3 months', 'in a year']}
                    lead={backOn ? 'Check back on' : undefined} className="h-8 min-w-28 rounded-full border"
                    onChange={(iso) => (setBackOn(iso), editing && void notes.setField('captures', editing.id, 'back', iso))} />
                </span>
              )}
              {/* The camera: a whole screen or just an area, as a picture in the note (shot-button.tsx). Out of the way of the first capture's lesson, whose word sits where it is. */}
              {!locked && <span data-lesson="hide" data-under-toast data-while-recording={listening ? 'dim' : undefined} inert={listening} className="inline-flex"><ShotButton onShot={(area) => void attachScreenshot(area)} /></span>}
              {/* The microphone, beside the camera and the camera's pair in its own: "Record" a voice note, kept in the
                  note where the caret is, or "Dictate", talk to type into the words. Only one runs: starting one
                  stops the other and keeps what it had. */}
              {!locked && (
                <span data-lesson="hide" data-under-toast data-while-recording={listening ? 'dim' : undefined} inert={listening} className="inline-flex">
                  <RoundPair label="Record or dictate" icon={<MicIcon className="size-[15px]" />} button={{ 'data-record-button': true }} choices={VOICE_CHOICES}
                    onPick={(id) => editorRef.current && void (id === 'record' ? recordInto(editorRef.current, recordSlot.current) : talkInto('tap', editorRef.current))} />
                </span>
              )}
              <span className="flex-1" />
              {/* In the sandbox, said here too: a practice box, not your own. */}
              <span data-under-toast data-while-recording={listening ? 'dim' : undefined} inert={listening} className="inline-flex"><SandboxChip /></span>
              {/* Beside Create, as in Linear: on, a save keeps the box open for the next one. */}
              {!editing && (
                <Tip label="Keep quick capture open after each save  ⌥C">
                <label data-lesson="hide" data-under-toast data-while-recording={listening ? 'dim' : undefined} inert={listening} className="mr-2 flex shrink-0 cursor-pointer items-center gap-2 text-control whitespace-nowrap text-muted-foreground">
                  <Switch size="sm" checked={createMore} onCheckedChange={setCreateMore} aria-label="Create more" />
                  {/* A short row (Check back's day beside it): the switch alone, its name in its tip, so Create is never cut off. */}
                  <span className="@max-[24rem]/row:sr-only">Create more</span>
                </label>
                </Tip>
              )}
              {/* Under the recorder bar while it records, whose red Stop sits where this is and answers ⌘↵ too. */}
              <span data-while-recording={listening ? 'dim' : undefined} inert={listening} className="relative inline-flex shrink-0">
              {/* The button shows its own words and ⌘↵: the tip says only what it does not. */}
              <Tip label={createMore && !editing ? 'Then empties quick capture for the next one' : (editing ? (SMALL ? 'Closes this window: changes already save as you make them' : 'Back to your draft: changes already save as you make them') : 'Then empties it for the next one:  ⌥⌘↵')}>
              <Button variant="secondary" data-create onClick={(event) => submit(event.altKey)} className="shrink-0 text-control">
                {/* Open on a saved note: closing it, since changes already save. */}
                <Rolling text={editing ? 'Close note' : saved ? 'Saved' : plan?.clue && !editing ? (plusGoal ? 'Add log' : 'Add clue') : 'Create'} /> <kbd className="font-sans text-key text-(--mf-muted-strong)">⌘↵</kbd>
              </Button>
              </Tip>
              </span>
            </main>
            )}
          </motion.div>
          <PointMenu at={noteMenuAt} onClose={() => setNoteMenuAt(null)} sections={[noteSection]} />
          <SourceDrawer open={source} doc={body} onOpenChange={setSource} />
          {editing && <DetailsDrawer open={details} id={editing.id} captures={captures} onOpenChange={setDetails} onOpen={openAny} />}
          {/* No list in sight (the pill, the box with its panel shut): F, off the writing, still opens the Inbox's Display, as a sheet over the box. */}
          {(focus || !panelDrawn) && !welcoming && <InboxDisplay captures={captures} onOpen={setSheetUp} />}
        </ResizablePanel>

        {!focus && panelDrawn && <ResizableHandle withHandle />}
        {!focus && panelDrawn && (
          <ResizablePanel defaultSize={`${PANEL_WIDTH - 1}px`} minSize="30%">
            <SidePanel tab={tab} setTab={setTab} captures={captures} editing={editing?.id} onOpen={(id, quiet) => openCapture(id, false, quiet)} onOpenAny={openAny} reading={reading?.id} onRead={(items, start) => setReadList({ items, start })} />
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
 * A quote that names who said it in its line ("- Name, Source", "said Tom",
 * "Tom said") with that name in Who said it: kept without those words, so the
 * name is said once, as its signature. Read by saidBy, as the box lit it.
 */
function withoutTail(doc: JSONContent | null, who: string): JSONContent | null {
  if (!doc?.content || !who) return doc
  const at = doc.content.findIndex((node) => node.content?.some((one) => one.text?.trim()))
  const block = doc.content[at]
  if (!block?.content) return doc
  const by = saidBy(block.content.map((one) => one.text ?? '').join(''))
  if (by.who !== who) return doc
  let offset = 0
  const content = block.content.flatMap((one) => {
    const start = offset
    offset += one.text?.length ?? 0
    if (one.text === undefined || offset <= by.from || start >= by.to) return [one]
    const text = one.text.slice(0, Math.max(0, by.from - start)) + one.text.slice(Math.max(0, by.to - start))
    return text ? [{ ...one, text }] : []
  })
  return { ...doc, content: doc.content.map((node, i) => (i === at ? { ...block, content } : node)) }
}

/** The note without its "@1y": taken off the first piece of words that has it, once; a block left empty goes. */
function laterOff(doc: JSONContent | null, word: string): JSONContent | null {
  let done = false
  const walk = (node: JSONContent): JSONContent | null => {
    if (done) return node
    if (node.text !== undefined) {
      const text = withoutWord(node.text, word)
      if (text === node.text) return node
      done = true
      return text ? { ...node, text } : null
    }
    if (!node.content) return node
    const content = node.content.map(walk).filter((one): one is JSONContent => one !== null)
    return { ...node, content }
  }
  return doc && walk(doc)
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
function useEscapeToHide(fold: { current: () => boolean }): void {
  useEffect(() => {
    // The editor marks every Escape as handled, so whether it was spent is
    // read before it gets there: in the editor, Escape hides the window only
    // when nothing else would take it (no menu open, no words selected). With
    // Vim on it never does: Escape stays in the note, as in vim and Obsidian
    // (18 Nov); the window's close dot puts it away.
    let free = false
    // A menu or picker open when Escape came: that Escape closes it, never the window.
    let layered = false
    const before = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      layered = layerOpen()
      const editor = (event.target as Element | null)?.closest?.('.ProseMirror')
      if (!editor) return void (free = false)
      free = !editor.hasAttribute('data-vim-mode') && (window.getSelection()?.isCollapsed ?? true) && !layerOpen() && !caretTakesEscape()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if ((event.defaultPrevented && !free) || layered) return void (layered = false)
      free = false
      if (fold.current()) return
      putWindowAway()
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

/**
 * A paste or a drop too long for the box (a whole note dragged out of
 * Obsidian) is kept at once as a note of its own in the Inbox, read a breath
 * at a time so the box answers every key meanwhile (extensions/big-paste.ts).
 * Said as it starts and when it is kept, with Undo and a way to open it;
 * never lost, and never drawn in the box.
 */
async function keepBigPaste(text: string, editor: Editor | null): Promise<void> {
  if (!editor) return
  toast('Keeping these words as a note of their own…', undefined, 'info')
  try {
    const doc = await markdownToDocumentGently(editor, text)
    // Handing it over is one more step of its own.
    await breath()
    const id = await window.api.captures.create({ kind: 'note', body: doc, markdown: text })
    // Its size as the note's bar will say it, counted the same way (lib/note-size.ts), never the pasted text's own.
    const size = await sizeOfStored(editor.schema, doc, breath)
    toast(`${plural(size.lines, 'line')}, ${plural(size.words, 'word')} kept as a note in your Inbox: too long for the box`, () => void window.api.captures.save(id, { status: 'discarded' }).then(() => chime('undo')), 'success',
      { label: 'Open', key: 'O', run: () => window.api.openInHome('capture', id) }, { type: 'capture', id })
  } catch {
    toast('Those words could not be kept. They are still on your clipboard: paste them into a note in the main window', undefined, 'error')
  }
}

const CapturePrompt = ({
  initial,
  pill = false,
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
  quietSpelling = false,
  tokens = TAGS,
  autofocus = true
}: {
  /** Whether the caret lands in the words, at their end (a draft or a send brought back carries on where it stopped): not for a capture clicked in the list, whose keys stay the list's. */
  autofocus?: boolean
  /** Under the words, inside their scroll: the note's mentions, for one already kept. */
  after?: React.ReactNode
  /** A line under the words already offers the word's fix (a Word being defined): the spelling pill stays away, so two suggestions never stack. */
  quietSpelling?: boolean
  onSource: () => void
  /** What the editor lights up: tags, and a todo's date and priority words. */
  tokens?: TokenPattern[]
  /** The first line went out of sight (its words), or came back (null). */
  onTitleOut: (title: string | null) => void
  onTag: (tag: string) => void
  /** The capture open in the box, if any: what a selection lifted out of it points back to. */
  from?: string
  initial?: JSONContent
  /** The one-line pill: nothing to find in one line, so ⌘F opens no Find bar over it. */
  pill?: boolean
  locked: boolean
  outline: boolean
  onChange: (doc: JSONContent, editor: Editor) => void
  onReady: (editor: Editor) => void
  onOpenNote: (id: string, heading?: string) => void
}): React.JSX.Element => {
  const [editor, setEditor] = useState<Editor | null>(null)
  const editorNow = useRef<Editor | null>(null)
  editorNow.current = editor
  const [bigPaste] = useState(() => [BigPaste.configure({ onBig: (text) => void keepBigPaste(text, editorNow.current) })])
  return (
    // mf-faded: the note fades out at its top and bottom edges as it scrolls,
    // the way Raycast Notes reads, instead of being cut by a hard line. No
    // card edge or shadow of its own: the box is one frosted sheet throughout.
    // data-caret-room: the Journal's caret, two pixels and the accent's colour, where the system's one pixel was hard to see.
    <div data-caret-room className="mf-faded relative flex min-h-0 w-full flex-1 flex-col overflow-hidden"
      style={{ transform: 'translate(0,0)' }}>

      {/* The same, spelled out. See `docs/components.md` for what each one
          does and what it is when you leave it out. */}
      <HaligtreeEditor
        shape="document"
        extensions={bigPaste}
        backToTop={!pill}
        // A small window's column (368px) wrapped the box's words onto a second line, cut off under each new row.
        placeholder={SMALL ? 'Write, or type / for more' : 'Write a thought, a quote, a link… or type / for more'}
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
        // A capture box, not a page: no line numbers.
        lineNumbers={false}
        slash={true}
        outline={outline}
        search={!pill}
        // vim is left out, so it follows the page switch.
        vimStart="insert"
        autofocus={autofocus ? 'end' : false}
        onReady={(one) => (setEditor(one), onReady(one))}
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
        quietSpelling={quietSpelling}
        // A focus session running, the time and the words written show at the foot.
        foot={(editor) => <SessionFooter editor={editor} note={from ? `capture-${from}` : 'box'} />}
      />
      <LivingCaret editor={editor} />
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
/** A who or where read from the words: the lit words' pink, as its edge and a faint fill. */
const READ = 'border-[color-mix(in_oklab,var(--tt-color-text-pink)_55%,transparent)] bg-[var(--tt-color-highlight-pink)] text-foreground hover:border-[var(--tt-color-text-pink)] focus:border-[var(--tt-color-text-pink)]'

/** A field filled from the words says where from on hover; with no tip it is only the field, and typing in it keeps its place. */
function ReadFrom({ tip, children }: { tip: string; children: React.ReactElement }): React.JSX.Element {
  return (
    <Tooltip open={tip ? undefined : false}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-xs">{tip}</TooltipContent>
    </Tooltip>
  )
}

const FIELD = 'field-sizing-content min-w-28 max-w-60 shrink-0 text-ellipsis rounded-full border border-foreground/10 px-2 py-0.5 text-meta placeholder:text-muted-foreground hover:border-foreground/20 focus:border-foreground/20'

/**
 * The Inbox's Display with no button of its own, for when the side panel is
 * shut: the same view the panel's Inbox keeps, so a filter picked here is the
 * one the list shows once the panel opens. Opened by F, it comes as a sheet.
 */
function InboxDisplay({ captures, onOpen }: { captures: CaptureMeta[]; onOpen: (open: boolean) => void }): React.JSX.Element {
  const days = useInboxDays()
  const { display } = useCaptureDisplay('prompt:captures', captures.filter((capture) => capture.status !== 'open' || !!capture.archivedAt || inInboxWindow(capture, days)), { status: ['open'] })
  return React.cloneElement(display, { hidden: true, onOpen })
}

/**
 * What the side panel's tabs count, and its pins: the panel is drawn only once all are in (useReadsIn), so they are
 * read ahead (warmPanel) and the panel shows whole in the first frame ⌘\ grows the box, never 100 to 150 ms after it
 * has landed. Each tab counts what it holds, so a thing sent there visibly arrives: every open task, dated or not (a
 * list of fourteen made at once reads as fourteen, never as the one due today), every nugget and article; archived
 * ones are out of sight, so not counted; questions held open count as kept too, settled ones do not.
 */
const panelReads = {
  due: () => window.api.haligtree<number>('review:counts'),
  open: () => haligtree.tasks().then((tasks) => tasks.filter((task) => task.status === 'open').length),
  kept: () => Promise.all([haligtree.items('nugget'), haligtree.items('article'), haligtree.items('question')]).then((all) => all.flat().filter((one) => !one.archivedAt && !one.closedAt).length)
}
const warmPanel = (): void => [panelReads.due, panelReads.open, panelReads.kept, haligtree.pins].forEach((read) => warmLive<unknown>(read))

function SidePanel({ captures, editing, onOpen, onOpenAny, reading, onRead, tab, setTab }: {
  tab: Tab
  setTab: (tab: Tab) => void
  /** Read through a list, from a place in it. */
  onRead: (items: Readable[], start: number) => void
  captures: CaptureMeta[]
  editing?: string
  /** `quiet`: clicked in the list, so the keys stay there. */
  onOpen: (id: string, quiet?: boolean) => void
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
  const dueRead = useLive(panelReads.due, null as number | null, [], ['item'])
  const due = dueRead ?? 0
  const openRead = useLive(panelReads.open, null as number | null)
  const openTasks = openRead ?? 0
  const keptRead = useLive(panelReads.kept, null as number | null, [], ['item'])
  const kept = keptRead ?? 0
  // The panel is drawn once, with its tabs' counts and what the tab shows (lib/reads-in.tsx): never the counts one by one,
  // or the pins arriving over the Inbox a beat after it.
  const { provide, style: readsStyle } = useReadsIn(dueRead === null || openRead === null || keptRead === null || unloaded(captures))
  // The inbox is what has no exit yet; what is handled lives in Everything.
  const open = captures.filter((capture) => capture.status === 'open' && !capture.archivedAt)
  // The Inbox emptied here, in front of you: its moment (inbox-zero.tsx).
  const cleared = useJustCleared(open, captures, !unloaded(captures))
  // The same Display menu as the main window's inbox: filter, sort, group.
  // Every capture, starting on those with no exit: Display's Status reaches
  // the handled and discarded ones without leaving the prompt.
  // The same days as the Inbox page (Settings' “Inbox shows”): older open ones wait there, behind its line.
  const days = useInboxDays()
  const recent = open.filter((capture) => inInboxWindow(capture, days))
  const older = open.length - recent.length
  const { groups: grouped, display, chips, density, island } = useCaptureDisplay('prompt:captures', captures.filter((capture) => capture.status !== 'open' || !!capture.archivedAt || inInboxWindow(capture, days)), { status: ['open'] })
  // Grouped by kind, each kind its own island: a few rows each, folding (islands.tsx).
  const { groups, islands } = island(grouped)
  // Counted whole: a folded island still holds its captures.
  const listed = grouped.reduce((sum, [, list]) => sum + list.length, 0)
  // Graph, beside the kinds: the Inbox as a map of what you have been capturing.
  const [graphed, setGraphed] = useGraphShown('prompt')
  const shown = groups.flatMap(([, list]) => list)
  // The whole list, rows behind "Show N more" and in a folded island too: what ⌘A and "Select all" pick.
  const every = grouped.flatMap(([, list]) => list)
  // The capture open in the box shows in the list beside it: its island unfolded, past "Show more", quietly.
  useShowOpen(editing, grouped, shown, islands)
  // x picks several, the way it does in the main window, for one exit on all.
  const [chosen, setChosen] = useState<string[]>([])
  // Several made one task, from the bar or ⌘K: its name starts as the first one's title.
  const makeOne = (): void => {
    const ids = chosen
    void oneTask(ids, captures.find((capture) => capture.id === ids[0])?.label ?? '').then((made) => made && setChosen([]))
  }
  // ⌘A picks every capture in the list, outside the writing, even those an island keeps out of sight; Escape lets them go.
  // ⌫ on what is picked (or the row under the cursor): to the Bin at once, with Undo.
  const binRefs = (ids: string[]): { type: string; id: string; status?: string }[] =>
    ids.map((id) => ({ type: 'capture', id, status: captures.find((one) => one.id === id)?.status }))
  const toBin = (ids: string[]): void => void moveToBin(binRefs(ids)).then((n) => n && setChosen([]))
  const cursorAt = useRef(-1)
  // Only while the list is the one in front, on screen, and the pointer or the keys were last in it: with the keys
  // anywhere else in the box (the writing, a definition Tab moved to, the pill with the panel put away), ⌘A picked the
  // whole Inbox out of sight, "48 selected", and ⌫ then sent them all to the Bin with the tearing sound (the tracker).
  const panelRoot = useRef<HTMLDivElement>(null)
  useListScope(panelRoot)
  const panelInFront = (): boolean => {
    const at = panelRoot.current
    const r = at?.getBoundingClientRect()
    return !!at && !!r && r.width > 40 && r.left < innerWidth - 40 && listInFront() === at
  }
  const selectAll = useSelectAll(() => every.map((one) => one.id), chosen, setChosen, { enabled: tab === 'inbox', scoped: true, here: panelInFront, onDelete: toBin, current: () => shownNow.current[cursorAt.current]?.id, titleOf: (id) => captures.find((one) => one.id === id)?.label })
  const allPicked = every.length > 0 && every.every((one) => chosen.includes(one.id))
  // ⌘-click, ⇧-click, ⇧↑ and ⇧↓ pick as Finder does.
  const picking = usePicking(shown.map((one) => one.id), chosen, setChosen)
  const choose = picking.toggle
  // A task for each one picked, made as "Make it a task" makes one.
  const makeEach = (): void =>
    void makeTasks(chosen.flatMap((id) => {
      const capture = captures.find((one) => one.id === id)
      return capture ? [{ id, title: capture.label, private: !!capture.private, capture: true as const, open: capture.status === 'open' }] : []
    })).then((made) => made && setChosen([]))
  // Every picked capture still in the Inbox takes a way out together (a key, the selection's menu, ⌘K): the one
  // function the main window's Inbox uses (lib/capture-links.tsx), with one notice that counts them and one Undo.
  const inboxPicked = chosen.filter((id) => captures.find((one) => one.id === id)?.status === 'open')
  const exitPicked = (status: string): void => {
    if (!inboxPicked.length) return refuse('Nothing changed: none of the picked captures is still in the Inbox')
    void exitMany(inboxPicked, status).then((went) => went && setChosen([]))
  }
  const manyWays = selectionWays(inboxPicked, () => setChosen([]))
  useEffect(() => {
    picked.ids = chosen
    picked.inbox = inboxPicked
    // The capture the keys are on, in the Inbox's tab: ⌘K offers its ways out.
    const lit = tab === 'inbox' ? shown[cursorAt.current] : undefined
    picked.lit = lit ? { id: lit.id, kind: lit.kind, status: lit.status } : null
    const onAsk = (): void => void (chosen.length > 1 && makeOne())
    const onExit = (event: Event): void => exitPicked((event as CustomEvent<string>).detail)
    window.addEventListener('haligtree:one-task', onAsk)
    window.addEventListener('haligtree:exit-picked', onExit)
    return () => {
      window.removeEventListener('haligtree:one-task', onAsk)
      window.removeEventListener('haligtree:exit-picked', onExit)
      picked.ids = []
      picked.inbox = []
      picked.lit = null
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
  const [cursor, setCursor] = useListKeys(shown.length, {
    // ↵ on the one open already moves the keys into its words.
    onOpen: (index) => (shown[index].id === editing ? document.querySelector<HTMLElement>('.tiptap.ProseMirror')?.focus() : onOpen(shown[index].id)),
    enabled: tab === 'inbox',
    opened: shown.findIndex((one) => one.id === editing),
    onExtend: (from, to) => picking.extend(shown[from]?.id, shown[to].id)
  })
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
      if (event.key === 'Escape' && chosen.length && !menuOpen()) {
        event.preventDefault()
        chime('off')
        return setChosen([])
      }
      // An open menu takes the keys its own lines show: the list under it stands down.
      if (menuOpen()) return
      const row = shownNow.current[cursor]
      const one = EXITS.find((e) => e.key === event.key)
      // With rows picked, the key is the selection's, never the cursor's row, as in the main window's Inbox. D is ⌫.
      if (one && chosen.length) {
        event.preventDefault()
        return one.status === 'discarded' ? toBin(chosen) : exitPicked(one.status)
      }
      if (!row) return
      if (event.key === 'x') return picking.toggle(row.id)
      if (one && row.status === 'open') void exit(row.id, one.status)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [tab, cursor, chosen]) // eslint-disable-line react-hooks/exhaustive-deps
  // ⇧⌘R reads through the inbox as it is shown, from the row under the cursor.
  useReadKey(() => onRead(shownNow.current.map((one) => ({ type: 'capture', id: one.id })), startAt(shownNow.current, editing, cursor)), shown.length, tab === 'inbox')
  return provide(
    <div ref={panelRoot} data-box-panel className="relative flex h-full w-full flex-col p-2" style={readsStyle}>
      <div data-hover-quiet role="tablist" aria-label="Side panel" className="isolate mb-2 flex gap-1 rounded-lg border border-foreground/10 bg-foreground/[0.045] p-0.5 text-sm">
        {/* Drag a tab along the row into your own order. Right click one to move it a step, or to show or hide a tab; the last one stays. */}
        <SortableList axis="x" items={tabs} keyOf={(one) => one.id} onMove={dropOrder('boxTabsOrder', BOX_TABS.map((one) => one.id), (id) => BOX_TABS.find((one) => one.id === id)?.label)}>
        {(row) => row.map((one) => (
          <SortableRow key={one.id} id={one.id} glide={`box-tab-${one.id}`} className="flex min-w-0 flex-1">
          <RowMenu items={[
            ...orderItems({ setting: 'boxTabsOrder', usual: BOX_TABS.map((each) => each.id), id: one.id, among: row.map((each) => each.id), what: 'The tabs', name: one.label, sideways: true }, tabSaved.length > 0),
            'separator',
            ...BOX_TABS.filter((each) => !(shownTabs.length === 1 && shownTabs[0] === each.id)).map((each) => {
              const on = shownTabs.includes(each.id)
              return { label: `${on ? 'Hide' : 'Show'} ${each.label}`, run: () => void haligtree.setSettings({ boxTabs: on ? shownTabs.filter((id) => id !== each.id) : [...shownTabs, each.id] }).then(() => chime(on ? 'off' : 'on')) }
            })
          ]}>
          <span className="flex min-w-0 flex-1">
          <Tip label={`${one.id === 'today' && counts.today ? `${num(counts.today)} open ${counts.today === 1 ? 'task' : 'tasks'}, dated or not  ` : counts[one.id] && brief(counts[one.id]!) !== num(counts[one.id]!) ? `${num(counts[one.id]!)}  ` : ''}⌃${TABS.indexOf(one.id) + 1}`}>
          <button
            type="button"
            // Where a promoted capture or a new task flies to.
            data-home={one.id === 'kept' ? 'nugget question' : one.id === 'today' ? 'task' : one.id === 'inbox' ? 'capture' : undefined}
            role="tab"
            data-box-tab-id={one.id}
            aria-selected={tab === one.id}
            onClick={() => {
              if (tab !== one.id) chime('tap')
              setTab(one.id)
            }}
            className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-md py-1 transition-colors ${tab === one.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {/* One pill that slides between tabs rather than three that blink. */}
            {tab === one.id && (
              <motion.span layoutId="prompt-tab" className="absolute inset-0 -z-10 rounded-md border border-foreground/15 bg-foreground/[0.08]" transition={byKeys() ? { duration: 0 } : spring.moderate} />
            )}
            {one.label}
            {counts[one.id] ? <Count tip={false} n={counts[one.id]!} className="text-xs text-muted-foreground" /> : null}
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
        data-box-tab={tab}
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
        className="flex min-h-0 flex-1 flex-col [container-type:size]"
      >
        {/* Two kinds of thing, two places: what is waiting on you stays put,
            and only your captures scroll under it. A rule between them, not a
            shadow: a shadow on paper read as a smudge. */}
        {/* Kept to about 45% of the tab, so the Inbox under it always shows rows. */}
        {tab === 'inbox' && <Waiting onOpenAny={onOpenAny} />}
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
                      <Button variant="ghost" size="sm" onClick={() => exitPicked('resolved')}>Resolve</Button>
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
                      <Tip label="Every capture still waiting for you; the “Display” menu (F) shows the rest under “Status”. X selects several.">
                        <h3 className="w-fit whitespace-nowrap">{listed === recent.length ? 'Inbox' : `${num(listed)} shown`}</h3>
                      </Tip>
                      {/* Tidy, Decide and Read through, in the one menu the Inbox page has. */}
                      <GoThrough compact={false} className="ml-auto" canRead={shown.length > 0} onRead={() => onRead(shown.map((one) => ({ type: 'capture', id: one.id })), startAt(shown, editing, cursor))} />
                      <span>{display}</span>
                    </>
                  )}
                </Strip>
                {/* The kinds on one line that scrolls sideways (wrapped, they took two rows the Inbox needed);
                    at the very shortest they make way for a row, and F (Display) still filters. */}
                <div data-kind-chips className="px-2 pb-2 empty:hidden [@container(max-height:240px)]:hidden">{chips && React.cloneElement(chips, { wrap: false, extra: listed > 0 ? <GraphChip on={graphed} onChange={setGraphed} /> : undefined })}</div>
                {graphed && listed > 0 && <InboxGraph compact captures={grouped.flatMap(([, list]) => list)} onOpen={onOpenAny} />}
                {!(graphed && listed > 0) && (islands ? groups.length > 0 : shown.length > 0) && <CaptureList groups={groups} islands={islands} density={density} selected={editing} cursor={cursor} onCursor={setCursor} chosen={chosen} onPick={(id) => onOpen(id, true)} picking={picking}
                  // Right-clicked among several picked, the menu speaks for all of them.
                  menu={(capture, usual) => chosen.includes(capture.id) && chosen.length > 1 ? [
                    // The same lines, in the same order, as the selection's menu in the main window's Inbox (capture-list.tsx).
                    ...manyWays.filter((way) => way.id === 'promoted' || way.id === 'writing'),
                    { label: `Make ${num(chosen.length)} tasks`, run: makeEach },
                    { label: 'Make one task', hint: 'From all of them', run: makeOne },
                    ...manyWays.filter((way) => way.id === 'question'),
                    'separator',
                    ...manyWays.filter((way) => way.id === 'resolved'),
                    { label: `Add a tag to ${num(chosen.length)}…`, run: () => void tagCaptures(chosen) },
                    'separator',
                    binItem(binRefs(chosen), () => setChosen([])),
                    'separator',
                    !allPicked && { label: 'Select all', about: 'list', keys: '⌘A', run: selectAll },
                    { label: 'Clear the selection', keys: 'esc', run: () => (chime('off'), setChosen([])) }
                  ] : [...usual, 'separator', { label: chosen.includes(capture.id) ? 'Unselect' : 'Select', about: 'list', keys: 'X', run: () => choose(capture.id) }, !allPicked && { label: 'Select all', about: 'list', keys: '⌘A', run: selectAll }]} />}
                {/* The older open ones, never out of reach: one line under the list, to the Inbox page that lists them. */}
                {older > 0 && !unloaded(captures) && !(graphed && listed > 0) && (
                  <p data-inbox-older="box" className="px-2 py-2 text-body text-(--mf-muted-strong)">
                    {older === 1 ? '1 older capture waits' : `${num(older)} older captures wait`} in the Inbox{' · '}
                    <button type="button" className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60" onClick={() => (chime('tap'), window.api.openInHome('view', 'inbox'))}>Open it</button>
                  </p>
                )}
                {!listed && !unloaded(captures) && (
                  !captures.length ? (
                    <Example compact tryIt="write a thought on the left and send it with ⌘↵. It waits here.">
                      <CaptureList groups={[['', exampleInbox()]]} density={density} cursor={-1} onPick={() => undefined} />
                    </Example>
                  ) : recent.length ? (
                    <Empty compact title="Nothing matches">The filters hide everything here. Clear them with the × above, or press F to change them.</Empty>
                  ) : older ? (
                    <Empty compact title={`Nothing from the last ${days === 1 ? 'day' : `${days} days`}`}>Every newer capture has been dealt with. The older ones wait in the Inbox.</Empty>
                  ) : (
                    <Rest compact seed="inbox">{cleared?.how === 'binned' ? <InboxBinned compact left={cleared.left} /> : cleared ? <InboxZero compact onReview={() => setTab('review')} onRead={(row) => onOpenAny(row.type, row.itemId)} /> : <Empty compact title={captures.length ? 'Nothing waiting' : 'Nothing caught yet'}>{captures.length ? 'Every capture has been dealt with. Write the next thought on the left.' : 'Write a thought on the left and send it with ⌘↵: it waits here.'}</Empty>}</Rest>
                  )
                )}
              </>
            ) : tab === 'today' ? (
              <TodayPanel onOpen={(id) => onOpenAny('task', id)} open={reading} />
            ) : tab === 'kept' ? (
              <KeptPanel onOpen={onOpenAny} open={reading} onRead={onRead} inFront={panelInFront} />
            ) : tab === 'recent' ? (
              <RecentPanel className="flex-1 [&>header]:h-8 [&>header]:border-0 [&>header]:px-2" onOpen={onOpenAny} />
            ) : (
              // The page's own room at its foot (its padding, its last part's margin) is dropped here: with it the panel scrolled 73px of nothing.
              <div className="flex flex-1 [&_header]:hidden [&_.page-column]:pb-0 [&_.page-column>div>:last-child]:mb-0">
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
  ) as React.JSX.Element
}


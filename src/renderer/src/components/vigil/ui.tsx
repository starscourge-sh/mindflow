import { Children, cloneElement, createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { SlotText } from 'slot-text/react'
import { CircleX, type LucideIcon } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import ArrowNarrowDownIcon from '@/components/ui/arrow-narrow-down-icon'
import ArrowNarrowUpIcon from '@/components/ui/arrow-narrow-up-icon'
import { AnimatePresence, motion } from 'motion/react'
import { Coolshape, type shapeTypes } from 'coolshapes-react'
import Lenis from 'lenis'
import { useLive, vigil } from '@/lib/vigil'
import { chime, soundOn } from '@/lib/sound'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/cn'
import { useStoredFlag } from '@/lib/use-stored-flag'
import { keyFor, useKeyChanges, withKeys } from '@/lib/keys'
import { Kbd as ShadKbd, KbdGroup } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { KindAsker } from './note-extras'
import { QuestionAsker } from './questions-view'
import { num } from '../../../../main/dates'
import { AliveIcon } from '@/components/ui/alive-icon'
import type { OrbState } from 'thinking-orbs'
import { Orb } from './orb'
import type { AnimatedIconHandle, AnimatedIconProps } from '@/components/ui/types'
import Volume2Icon from '@/components/ui/volume-2-icon'
import VolumeXIcon from '@/components/ui/volume-x-icon'
import CheckedIcon from '@/components/ui/checked-icon'
import InfoCircleIcon from '@/components/ui/info-circle-icon'
import TriangleAlertIcon from '@/components/ui/triangle-alert-icon'

// itshover drawings in lucide's place, moving when their control is pointed at.
const ArrowDown = alive(ArrowNarrowDownIcon)
const ArrowUp = alive(ArrowNarrowUpIcon)

/**
 * The few parts every view is built from, so the views read as one app. The
 * look follows Linear and Todoist: a quiet header with a count, rows that are
 * one line of meaning and one of detail, properties down the right, and an
 * empty state that says what the view is for and how to fill it.
 */

/** A view's frame: title, a muted count, actions on the right, then the body. */
export function Page({ title, count, unit = ['item', 'items'], actions, children, aside = false }: {
  title: ReactNode
  /** What the count counts, one and many. */
  unit?: [string, string]
  /** A list beside an open item: in focus it goes, and the item has the window. */
  aside?: boolean
  count?: number
  actions?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  return (
    <section data-chrome={aside || undefined} className={cn('flex min-w-0 flex-1 flex-col', aside && 'hidden @[56rem]/page:flex')}>
      {/* The window's toolbar already names the section, so this line only
          carries the count and the actions, and goes when it has neither. */}
      {(count !== undefined || actions) && (
        <header data-chrome={aside || undefined} className="page-column flex h-10 shrink-0 items-center gap-2 border-b px-5 text-muted-foreground">
          {typeof title === 'string' && title.startsWith('#') ? <span className="font-medium text-foreground">{title}</span> : null}
          {count ? <span className="whitespace-nowrap tabular-nums"><Rolling text={count} /> {count === 1 ? unit[0] : unit[1]}</span> : null}
          <div className="ml-auto flex min-w-0 items-center gap-1">{actions}</div>
        </header>
      )}
      <SmoothScroll>{children}</SmoothScroll>
    </section>
  )
}

/**
 * What an empty view is for, and the one thing that fills it. A shape from
 * coolshapes, clean rather than grainy, in place of a grey icon: an empty view
 * is the first thing a new feature shows you, and it should not read as an error.
 */
/**
 * A sentence that tells you something, typed out a word at a time as it
 * arrives, a beat after the page paints so the motion is seen rather than
 * lost in the opening frame, so the app reads as if it is talking to you rather than showing a
 * label (textmotion.dev's word reveal). Typed again when the words change.
 * Plain text when Motion is off.
 */
export function Typed({ text, className, step = 40, delay = 700 }: { text: string; className?: string; step?: number; delay?: number }): React.JSX.Element {
  const words = text.split(/(\s+)/)
  return (
    <span key={text} className={className} aria-label={text}>
      {words.map((word, index) =>
        /^\s+$/.test(word) ? word : (
          <span key={index} aria-hidden className="mf-typed" // 1.4: each word a beat slower than first built, easier to follow.
          style={{ animationDelay: `${delay + (index / 2) * step * 1.4}ms` }}>
            {/* A shortcut in a sentence is drawn as keys, one cap each. */}
            {/[⌃⌥⇧⌘]/.test(word)
              ? (() => {
                  // "⌘↵," ends a clause: the comma is the sentence's, not a key. "⌘," stays a key.
                  const [, keys, mark = ''] = word.match(/^(.*[⌃⌥⇧⌘].*[^⌃⌥⇧⌘])([.,;:])$/) ?? [, word]
                  return <><KbdGroup className="translate-y-[-1px] align-middle">{Array.from(keys!).map((key, n) => <Kbd key={n}>{key}</Kbd>)}</KbdGroup>{mark}</>
                })()
              : word}
          </span>
        )
      )}
    </span>
  )
}

export function Empty({ shape, title, children, action, compact = false }: {
  shape: [shapeTypes, number]
  title: ReactNode
  children: ReactNode
  action?: ReactNode
  /** Sized for the prompt's narrow panel: less height above, a smaller shape. */
  compact?: boolean
}): React.JSX.Element {
  return (
    <div className={`flex max-w-sm flex-col items-start gap-3 ${compact ? 'px-2 py-10' : 'px-5 py-[16vh]'}`}>
      <Coolshape type={shape[0]} index={shape[1]} noise={false} size={compact ? 44 : 56} className="mb-3" />
      {/* A rest is a moment, not a missing list: its line at title size in the
          heading font, a step down in the prompt's narrow panel. */}
      <h2 className={compact ? 'text-heading font-semibold' : 'text-title font-medium'}>{title}</h2>
      <p className="leading-relaxed text-muted-foreground">{typeof children === 'string' ? <Typed text={children} step={30} /> : children}</p>
      {action}
    </div>
  )
}

/** A key, the way a menu shows a shortcut. */
/** A key, as shadcn draws one, with a hairline edge so it reads as a cap. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }): React.JSX.Element {
  return <ShadKbd className={cn('rounded border border-border/80 text-key', className)}>{children}</ShadKbd>
}

/**
 * A shortcut's keys as you press them now: changed in Settings, the new keys;
 * cleared, nothing. One cap per step (G I is two), or with `each` one per key
 * (⌘ and K apart).
 */
export function Pressed({ keys, each = false, className }: { keys: string; each?: boolean; className?: string }): React.JSX.Element | null {
  useKeyChanges()
  const now = keyFor(keys)
  if (!now) return null
  const caps = now.split(' ').flatMap((step) => (each ? (step.match(/[⌃⌥⇧⌘]|[^⌃⌥⇧⌘]+/g) ?? [step]) : [step]))
  return <>{caps.map((key, n) => <Kbd key={n} className={className}>{key}</Kbd>)}</>
}

/** A labelled run of properties, the right-hand column of an open item. */
export function Props({ children, className }: { children: ReactNode; className?: string }): React.JSX.Element {
  // One size for every row, whatever window it sits in: the prompt's larger
  // base made some rows grow and others not. A caller's classes are merged
  // over these, so the prompt's drawer can drop the width and the rule.
  return <aside data-chrome className={cn('flex w-full shrink-0 flex-col gap-px overflow-y-auto border-t p-3 pt-4 text-control text-muted-foreground @[40rem]/page:w-64 @[40rem]/page:border-t-0 @[40rem]/page:border-l', className)}>{children}</aside>
}
export function PropLabel({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="mt-3 mb-1 px-2 text-meta font-medium first:mt-0">{children}</div>
}
/** Where reading a list starts: the note open now, else the keyboard cursor, else the top. */
export const startAt = (list: { id: string }[], open: string | null | undefined, cursor: number): number => {
  const at = open ? list.findIndex((one) => one.id === open) : -1
  return at >= 0 ? at : Math.max(0, cursor)
}

/**
 * Where an open item sits in its list, and the way to the next and the one
 * before, the way Linear's issue view has it: "3 / 426 ↓ ↑". ↓ and ↑ step
 * through the list whenever you are not typing.
 */
export function Stepper({ at, total, onStep }: { at: number; total: number; onStep: (to: number) => void }): React.JSX.Element | null {
  const latest = useRef({ at, total, onStep })
  latest.current = { at, total, onStep }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing() || event.defaultPrevented) return
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      const { at, total, onStep } = latest.current
      const to = at + (event.key === 'ArrowDown' ? 1 : -1)
      if (to < 0 || to >= total) return
      event.preventDefault()
      event.stopPropagation()
      chime('tap')
      onStep(to)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  if (at < 0 || total < 2) return null
  const go = (by: 1 | -1): void => {
    chime('tap')
    onStep(at + by)
  }
  return (
    <div className="flex shrink-0 items-center gap-1 text-control text-muted-foreground">
      <span className="mr-1 shrink-0 whitespace-nowrap tabular-nums"><span className="text-foreground"><Rolling text={at + 1} /></span> / <Rolling text={total} /></span>
      <Tip label="Next  ↓"><button type="button" aria-label="Next" disabled={at >= total - 1} onClick={() => go(1)} className="flex size-7 items-center justify-center rounded-md hover:bg-accent hover:text-foreground disabled:opacity-35"><ArrowDown className="size-4" /></button></Tip>
      <Tip label="Previous  ↑"><button type="button" aria-label="Previous" disabled={at <= 0} onClick={() => go(-1)} className="flex size-7 items-center justify-center rounded-md hover:bg-accent hover:text-foreground disabled:opacity-35"><ArrowUp className="size-4" /></button></Tip>
    </div>
  )
}

/**
 * A property you type into, shaped exactly like a Prop row beside it: an
 * icon, the words, a hover. No boxes of different shapes down one column.
 * Enter or leaving keeps it.
 */
export function PropInput({ icon: Icon, value, placeholder, onSave, suffix, type = 'text' }: {
  icon: LucideIcon
  value: string
  placeholder: string
  onSave: (value: string) => void
  suffix?: string
  type?: 'text' | 'number'
}): React.JSX.Element {
  return (
    <label className="flex w-full cursor-text items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent focus-within:bg-accent">
      <Icon className="size-4 shrink-0" />
      <input
        type={type}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? 5 : undefined}
        defaultValue={value}
        placeholder={placeholder}
        onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        onBlur={(event) => onSave(event.target.value.trim())}
        className="min-w-0 flex-1 bg-transparent text-control text-foreground tabular-nums outline-none placeholder:text-foreground/70 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      {suffix && <span className="shrink-0 text-meta">{suffix}</span>}
    </label>
  )
}

export function Prop({ icon: Icon, alive, children, onClick, active, tint, secret }: {
  icon?: LucideIcon
  /** One of itshover's animated icons instead, for a Prop that is a button. */
  alive?: React.ComponentType<AnimatedIconProps & React.RefAttributes<AnimatedIconHandle>>
  /** Private: blurred at rest, as in any list. */
  secret?: boolean
  /** A theme colour for the icon, where the colour means something. */
  tint?: string
  children: ReactNode
  onClick?: () => void
  active?: boolean
}): React.JSX.Element {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      data-private={secret ? '' : undefined}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${onClick ? 'hover:bg-accent hover:text-foreground' : ''} ${active ? 'text-foreground' : ''}`}
    >
      {alive
        ? <AliveIcon icon={alive} size={16} style={tint ? { color: `var(--tt-color-text-${tint})` } : undefined} />
        : Icon && <Icon className="size-4 shrink-0" style={tint ? { color: `var(--tt-color-text-${tint})` } : undefined} />}
      <span className={`min-w-0 truncate ${secret ? 'private-text' : ''}`}>{children}</span>
    </Tag>
  )
}


/** Tags as Todoist draws them: a small tag glyph and the word, in a quiet colour. */
// A thought can carry six routes back to it: a row shows the first few and
// counts the rest, "+3", named in full on hover.
export function Tags({ tags, max = 3 }: { tags: string[]; max?: number }): React.JSX.Element | null {
  const colors = useTagColors()
  if (!tags.length) return null
  const rest = tags.slice(max)
  return (
    <span className="flex shrink-0 items-center gap-2 text-xs">
      {tags.slice(0, max).map((tag) => (
        <span key={tag} style={{ color: `var(--tt-color-text-${colors[tag] ?? 'blue'})` }}>#{tag}</span>
      ))}
      {rest.length > 0 && (
        <Tip label={rest.map((tag) => `#${tag}`).join('  ')}>
          <span className="rounded-full bg-accent px-1.5 tabular-nums text-muted-foreground">+{rest.length}</span>
        </Tip>
      )}
    </span>
  )
}

/** Each tag's chosen colour, read once and again whenever anything changes. */
function useTagColors(): Record<string, string> {
  const meta = useLive(vigil.tagMeta, [] as { tag: string; color: string | null }[])
  return Object.fromEntries(meta.filter((row) => row.color).map((row) => [row.tag, row.color!]))
}

/** Where the focus is: a text box, the editor, or nothing that takes letters. */
const focus = (): 'box' | 'editor' | null => {
  const active = document.activeElement as HTMLElement | null
  if (active?.isContentEditable) return 'editor'
  return active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) ? 'box' : null
}
/**
 * Whether a key is going into something you are writing in, not to the page:
 * a field, the editor, or anything held over the page (Read, Details, a
 * question), whose keys the lists underneath must not act on.
 */
export const typing = (): boolean => focus() !== null || !!document.querySelector('[role="dialog"]')

/** Pin or unpin, and say so when the three places are full. */
export const pin = (table: 'captures' | 'nuggets', id: string, on: boolean): void =>
  void vigil.pin(table, id, on).then((ok) => (ok ? chime(on ? 'pin' : 'unpin') : refuse('Three pins at most: unpin one first')))

/**
 * Moving through a list the way the editor moves through a document: j and k,
 * or the arrows; gg and G for the ends; Enter to open; Escape to go back. Inside
 * a text box only Ctrl-J and Ctrl-K move, so typing a j is still a j, and in
 * the editor none of it: the editor has its own vim. The same
 * keys in every list in the app, which is the whole point of having one hook.
 */
export function useListKeys(count: number, { onOpen, onBack, enabled = true }: {
  onOpen?: (index: number) => void
  onBack?: () => void
  enabled?: boolean
}): [number, (index: number) => void] {
  // -1 until a key is pressed: the ring belongs to the keyboard, so a list you
  // only ever click never shows one.
  const [at, setAt] = useState(-1)
  const last = useRef('')
  const latest = useRef({ count, onOpen, onBack, at })
  latest.current = { count, onOpen, onBack, at }
  useEffect(() => setAt((index) => Math.min(index, Math.max(0, count - 1))), [count])
  // The row the cursor is on stays in view. Rows mark themselves with
  // data-cursor, since a ref on an animated row is only read once.
  useEffect(() => {
    if (at >= 0) document.querySelector('[data-cursor]')?.scrollIntoView({ block: 'nearest' })
  }, [at])

  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent): void => {
      const { count, onOpen, onBack, at } = latest.current
      // A key something in front already took, like search over this list.
      if (event.defaultPrevented) return
      // The editor has its own vim, and its menus their own Ctrl-J and K.
      if (focus() === 'editor') return
      const inBox = focus() === 'box'
      const chord = event.ctrlKey && !event.metaKey
      const move = (to: number): void => {
        event.preventDefault()
        setAt(Math.max(0, Math.min(count - 1, to)))
      }
      if (event.metaKey || event.altKey) return
      if ((chord && event.key === 'j') || (!inBox && !chord && (event.key === 'j' || event.key === 'ArrowDown'))) return move(at + 1)
      if ((chord && event.key === 'k') || (!inBox && !chord && (event.key === 'k' || event.key === 'ArrowUp'))) return move(at - 1)
      if (inBox) return
      if (event.key === 'G') return move(count - 1)
      // A finished G G starts over, so a third g is the start of the next pair.
      if (event.key === 'g' && last.current === 'g') return void ((last.current = ''), move(0))
      last.current = event.key
      // Enter on a button or field reached with Tab is that control's own,
      // unless it is one of the rows.
      const held = document.activeElement
      const control = held instanceof HTMLElement && held.matches('button, a[href], input, textarea, select, [role="button"], [contenteditable="true"]') && !held.closest('[data-row], [data-cursor]')
      if (event.key === 'Enter' && onOpen && at >= 0 && at < count && !control) {
        event.preventDefault()
        onOpen(at)
      }
      if (event.key === 'Escape' && onBack) onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])

  return [at, setAt]
}


/**
 * A list's top bar, set above the scrolling area rather than in it: blur
 * behind a sticky bar does not reach through this window, so rows scrolled
 * under it showed through. A panel offers the place (StripSlot); without one
 * the bar sits where it is written.
 */
export const StripSlot = createContext<HTMLElement | null>(null)
export function Strip({ className, children }: { className?: string; children: ReactNode }): React.JSX.Element {
  const slot = useContext(StripSlot)
  const bar = <div className={className}>{children}</div>
  return slot ? createPortal(bar, slot) : bar
}

/**
 * Say what an action did, briefly, with a way back. The answer to "did that
 * work?" and the plan's undo-everywhere in one: three seconds, then gone.
 */
/** One next step a toast can offer beside its undo, with a key: Q, for a question. */
export type ToastAction = { label: string; key: string; run: () => void }
/** What a toast means, so its colour and mark say it too: done, only news, careful, or not done. */
export type ToastTone = 'success' | 'info' | 'warning' | 'error'
export const toast = (text: string, undo?: () => void, tone: ToastTone = 'success', action?: ToastAction): void => {
  beam(tone)
  window.dispatchEvent(new CustomEvent('vigil:toast', { detail: { text, undo, tone, action } }))
}

/** The toast up now goes: what it offered to take back was taken back another way. */
export const untoast = (): void => void window.dispatchEvent(new CustomEvent('vigil:untoast'))

/**
 * A real wait said in words: an orb chip where toasts come up, for as long as
 * the work takes. For work started from a menu, with no button to hold it.
 */
export async function waiting<T>(label: string, state: OrbState, work: Promise<T>): Promise<T> {
  window.dispatchEvent(new CustomEvent('vigil:wait', { detail: { label, state } }))
  try {
    return await work
  } finally {
    window.dispatchEvent(new CustomEvent('vigil:wait', { detail: null }))
  }
}

/** Give a nugget its question, so review can test it: asked in place. */
export const askQuestion = (id: string): Promise<void> =>
  ask('The question it answers, for review', 'e.g. What does MVCC stand for?').then((prompt) => {
    if (prompt) void vigil.saveItem(id, { prompt }).then(() => toast('Now tested: it will come up in review'))
  })

/**
 * Say why something was not done, with the "not allowed" sound: amber for a
 * request that cannot be done as asked, red only when something failed.
 */
export const refuse = (text: string, tone: ToastTone = 'warning'): void => {
  chime('nope')
  toast(text, undefined, tone)
}

/**
 * Why a save failed, in plain words, from the error the main process sent
 * back: the database's own wording means nothing to someone writing a note,
 * so the common ones say what to do instead.
 */
export const whyFailed = (error: unknown): string => {
  const raw = String((error as Error | undefined)?.message ?? error ?? '').replace(/^Error invoking remote method[^:]*:\s*(?:\w*Error:\s*)?/, '').split('\n')[0].trim()
  if (/full|SQLITE_FULL|ENOSPC/i.test(raw)) return 'your disk is full. Free up some space, then try again'
  if (/locked|busy/i.test(raw)) return 'your notes were busy for a moment. Try again'
  if (/readonly|read-only|EACCES|EPERM/i.test(raw)) return 'Vigil is not allowed to write to its folder. Check its permissions in Finder, then try again'
  return `${raw || 'something went wrong'}. Try again, and restart Vigil if it keeps happening`
}

export type BeamState = ToastTone | null
/**
 * The light along the window's top edge, the way Raycast's does it: a green
 * sweep when something worked, blue for news, amber for a careful-now, a red
 * flicker when it did not. Seen from the corner of the eye, without reading
 * a word. Only answers: a wait is the Orb's (see waiting), so the app has one
 * look for "on its way" rather than a light here and an orb there.
 */
export const beam = (state: BeamState): void => void window.dispatchEvent(new CustomEvent('vigil:beam', { detail: state }))
export function Beam(): React.JSX.Element | null {
  const [state, setState] = useState<{ tone: BeamState; key: number }>({ tone: null, key: 0 })
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const onBeam = (event: Event): void => {
      clearTimeout(timer)
      const tone = (event as CustomEvent<BeamState>).detail
      setState({ tone, key: Date.now() })
      // An answer fades on its own.
      if (tone) timer = setTimeout(() => setState({ tone: null, key: Date.now() }), 1400)
    }
    window.addEventListener('vigil:beam', onBeam)
    return () => window.removeEventListener('vigil:beam', onBeam)
  }, [])
  if (!state.tone) return null
  return <div key={state.key} aria-hidden className={`mf-beam mf-beam-${state.tone}`} />
}

/**
 * A question that needs a line from you before something can go on, asked in
 * place: Enter answers, Escape lets it go. Resolves to the words, or null.
 */
export const ask = (question: string, placeholder = '', field?: 'attribution' | 'medium', initial = ''): Promise<string | null> =>
  new Promise((answer) => void window.dispatchEvent(new CustomEvent('vigil:ask', { detail: { question, placeholder, field, initial, answer } })))

/** The names typed before in a field, offered as you type: the list behind `list=`. */
function Suggest({ field }: { field: 'attribution' | 'medium' }): React.JSX.Element {
  const values = useLive(() => vigil.values(field), [] as string[])
  return <datalist id={`remembered-${field}`}>{values.map((one) => <option key={one} value={one} />)}</datalist>
}

function Asker(): React.JSX.Element | null {
  const [asked, setAsked] = useState<{ question: string; placeholder: string; field?: 'attribution' | 'medium'; initial?: string; answer: (words: string | null) => void } | null>(null)
  useEffect(() => {
    const onAsk = (event: Event): void => {
      chime('open')
      setAsked((event as CustomEvent).detail)
    }
    window.addEventListener('vigil:ask', onAsk)
    return () => window.removeEventListener('vigil:ask', onAsk)
  }, [])
  if (!asked) return null
  const done = (words: string | null): void => {
    if (words?.trim()) chime('tap')
    asked.answer(words?.trim() || null)
    setAsked(null)
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-[22vh]" onMouseDown={() => done(null)}>
      {/* A click on its padding keeps the focus in the box, so Escape still answers it. */}
      <div role="dialog" aria-modal="true" aria-label={asked.question} className="w-[min(32rem,90vw)] rounded-xl bg-popover p-4 shadow-(--mf-panel-shadow)"
        onMouseDown={(event) => {
          event.stopPropagation()
          if (!(event.target instanceof HTMLInputElement)) event.preventDefault()
        }}>
        <p className="mb-2 text-sm">{asked.question}</p>
        <Input
          autoFocus
          // Again a beat later: a right-click menu hands the focus back to
          // its row as it closes, after autofocus has already run.
          ref={(input) => void (input && setTimeout(() => input.focus(), 30))}
          placeholder={asked.placeholder}
          // A guess (a name already in the words) is offered, never kept unasked.
          defaultValue={asked.initial}
          // Who said it before, offered as you type: it gets quicker with use.
          list={asked.field ? `remembered-${asked.field}` : undefined}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Enter') done(event.currentTarget.value)
            if (event.key === 'Escape') done(null)
          }}
        />
        {asked.field && <Suggest field={asked.field} />}
        <p className="mt-2 text-xs text-muted-foreground">Enter to keep · Escape to leave it</p>
      </div>
    </div>
  )
}

/** When anything was last typed into a field or the editor. */
let lastEdit = 0

// What a toast must never cover: an open dialog, sheet or menu, and the
// footer (and its Keys panel) of a view that fills the window, like Read through.
const PANELS = '[role="dialog"],[role="alertdialog"],[role="menu"],[data-slot="sheet-content"],[data-slot="popover-content"]'

/**
 * Where the toast goes, clear of open panels: its usual place at the bottom
 * when that is free, else just under them, else just above them, else at the top.
 * Checked while something is shown, so a panel opening under it moves it.
 */
function useClearSpot(on: boolean, lane: React.RefObject<HTMLDivElement | null>): React.CSSProperties | undefined {
  const [spot, setSpot] = useState<React.CSSProperties>()
  useEffect(() => {
    if (!on) return setSpot(undefined)
    const check = (): void => {
      const { innerWidth: width, innerHeight: height } = window
      const boxes: DOMRect[] = []
      for (const one of document.querySelectorAll<HTMLElement>(PANELS)) {
        const at = one.getBoundingClientRect()
        if (!at.width || !at.height) continue
        // Read through is the page itself while it is up: only its footer and Keys count.
        if (one.getAttribute('aria-label') === 'Reading') {
          for (const part of one.querySelectorAll<HTMLElement>('footer, [aria-label="Keys"]')) boxes.push(part.getBoundingClientRect())
        } else boxes.push(at)
      }
      // The toast's lane: the middle of the window, as wide as a toast gets.
      const strip = lane.current?.getBoundingClientRect()
      const middle = strip ? (strip.left + strip.right) / 2 : width / 2
      const half = Math.min(576, (strip?.width ?? width) - 32) / 2
      const hit = boxes.filter((at) => at.height && at.right > middle - half && at.left < middle + half)
      // Its usual height off the bottom, as the window sets it (the box lifts it over its own footer).
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
      const given = lane.current ? getComputedStyle(lane.current).getPropertyValue('--toast-bottom').trim() : ''
      const usual = given ? parseFloat(given) * (given.endsWith('rem') ? rem : 1) : rem * 1.25
      const tall = 48
      const free = (bottom: number): boolean => hit.every((at) => height - bottom < at.top - 4 || height - bottom - tall > at.bottom + 4)
      const below = hit.length ? height - Math.max(...hit.map((at) => at.bottom)) : height
      const above = hit.length ? Math.min(...hit.map((at) => at.top)) : 0
      const next: React.CSSProperties | undefined = free(usual) ? undefined
        : below >= tall + 16 ? { bottom: Math.min(usual, below - tall - 8) }
        : above >= tall + 16 ? { bottom: height - above + 8 }
        : { top: 12, bottom: 'auto' }
      setSpot((was) => (JSON.stringify(was) === JSON.stringify(next) ? was : next))
    }
    check()
    const timer = setInterval(check, 150)
    return () => clearInterval(timer)
  }, [on])
  return spot
}

export function Toaster(): React.JSX.Element | null {
  const [shown, setShown] = useState<{ text: string; undo?: () => void; tone?: ToastTone; action?: ToastAction; key: number } | null>(null)
  const [wait, setWait] = useState<{ label: string; state: OrbState } | null>(null)
  useEffect(() => {
    const onWait = (event: Event): void => setWait((event as CustomEvent).detail)
    window.addEventListener('vigil:wait', onWait)
    return () => window.removeEventListener('vigil:wait', onWait)
  }, [])
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const onToast = (event: Event): void => {
      clearTimeout(timer)
      const detail = (event as CustomEvent).detail
      setShown({ ...detail, key: Date.now() })
      // Longer when it can be taken back, so the undo is there to reach.
      // A problem stays as long, so what to do about it can be read.
      timer = setTimeout(() => setShown(null), detail.undo || detail.action || detail.tone === 'error' || detail.tone === 'warning' ? 6000 : 3200)
    }
    // A save that failed on the way to the database says so, rather than the
    // success toast just never coming.
    const onFail = (event: PromiseRejectionEvent): void => {
      const message = String(event.reason?.message ?? event.reason ?? '')
      if (message.includes('Error invoking remote method')) refuse(`Not saved: ${whyFailed(event.reason)}.`, 'error')
    }
    const onGone = (): void => (clearTimeout(timer), setShown(null))
    window.addEventListener('vigil:toast', onToast)
    window.addEventListener('vigil:untoast', onGone)
    window.addEventListener('unhandledrejection', onFail)
    return () => {
      window.removeEventListener('vigil:untoast', onGone)
      window.removeEventListener('vigil:toast', onToast)
      window.removeEventListener('unhandledrejection', onFail)
    }
  }, [])
  // ⌘Z takes back what the toast offers, outside a field or the editor, which
  // keep their own undo.
  useEffect(() => {
    if (!shown?.undo && !shown?.action) return
    const onKey = (event: KeyboardEvent): void => {
      // The toast's next step on its own key, while it is up and you are not writing.
      if (shown.action && !event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === shown.action.key.toLowerCase() && !typing()) {
        event.preventDefault()
        setShown(null)
        return shown.action.run()
      }
      // Reading full screen counts as a list, not as typing, unless writing in it.
      const reading = !!document.activeElement?.closest?.('[aria-label="Reading"]') && !document.activeElement?.closest?.('[contenteditable="true"]')
      if (!shown.undo || !event.metaKey || event.key !== 'z' || event.shiftKey || (typing() && !reading)) return
      event.preventDefault()
      chime('undo')
      shown.undo?.()
      setShown(null)
    }
    // Writing, ⌘Z is the toast's when nothing was typed since it came up: the
    // note has nothing newer of its own to take back. Heard first, before the
    // editor spends the key on an older edit.
    const onWritingUndo = (event: KeyboardEvent): void => {
      if (!shown.undo || !event.metaKey || event.key !== 'z' || event.shiftKey || event.altKey) return
      if (focus() === null || lastEdit > shown.key) return
      event.preventDefault()
      event.stopPropagation()
      chime('undo')
      shown.undo()
      setShown(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keydown', onWritingUndo, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keydown', onWritingUndo, true)
    }
  }, [shown])
  // When anything was last typed, so ⌘Z knows whose undo it is. Any key in a
  // field counts, not only ones that change it: guessing "edited" when it was
  // not only leaves ⌘Z with the note, which is the safe way to be wrong.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (['Meta', 'Shift', 'Alt', 'Control'].includes(event.key) || (event.metaKey && event.key.toLowerCase() === 'z')) return
      if (focus() !== null) lastEdit = Date.now()
    }
    const onEdit = (): void => void (lastEdit = Date.now())
    window.addEventListener('keydown', onKey, true)
    for (const kind of ['input', 'paste', 'drop']) window.addEventListener(kind, onEdit, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      for (const kind of ['input', 'paste', 'drop']) window.removeEventListener(kind, onEdit, true)
    }
  }, [])
  const lane = useRef<HTMLDivElement>(null)
  const spot = useClearSpot(!!shown || !!wait, lane)
  // Asker always in the same place, so a toast coming or going never
  // remounts it and loses a question being answered.
  return (
    <>
    <Asker />
    <KindAsker />
    <QuestionAsker />
    <Beam />
    {wait && !shown && <div style={spot} className="pointer-events-none fixed right-[var(--toast-right,0px)] bottom-[var(--toast-bottom,1.25rem)] left-[var(--toast-left,0px)] z-[60] flex justify-center">
      <Orb state={wait.state} label={wait.label} className="bg-popover shadow-(--mf-panel-shadow) animate-in fade-in-0 slide-in-from-bottom-2 duration-200" />
    </div>}
    {/* Centred along the bottom, where the eye drops after acting. It
        leaves the way it came, and a new one takes its place at once. */}
    <div ref={lane} style={spot} className="pointer-events-none fixed right-[var(--toast-right,0px)] bottom-[var(--toast-bottom,1.25rem)] left-[var(--toast-left,0px)] z-[60] flex justify-center">
    <AnimatePresence mode="popLayout" initial={false}>
    {shown && <motion.div
      key={shown.key}
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, transform: 'translateY(8px)' }}
      animate={{ opacity: 1, transform: 'translateY(0px)' }}
      exit={{ opacity: 0, transform: 'translateY(8px)', transition: { duration: 0.15 } }}
      // An edge and a mark, with the buttons' corners: it has to be seen
      // from the corner of the eye, on any theme.
      className="pointer-events-auto mx-4 flex max-w-[min(36rem,calc(100%-2rem))] min-w-0 items-center gap-2 rounded-md border border-border bg-popover py-1.5 pr-3.5 pl-2.5 text-sm font-medium shadow-(--mf-panel-shadow)"
    >
      {/* The mark says what kind of news it is: a tick only for something done. It
          moves once as it lands; an error's cross keeps still. */}
      {shown.tone === 'error'
        ? <CircleX className="size-4 shrink-0 text-[var(--tt-color-text-red)]" />
        : shown.tone === 'warning'
          ? <AliveIcon play icon={TriangleAlertIcon} size={16} className="text-[var(--tt-color-text-orange)]" />
          : shown.tone === 'info'
            ? <AliveIcon play icon={InfoCircleIcon} size={16} className="text-[var(--tt-color-text-blue)]" />
            : <AliveIcon play icon={CheckedIcon} size={16} className="text-[var(--tt-color-text-green)]" />}
      {/* With a button beside it, one line: a long quoted title ends in an ellipsis rather than pushing Undo onto two lines. */}
      <span className={`min-w-0 ${shown.undo || shown.action ? 'truncate' : 'text-pretty wrap-break-word'}`} title={shown.undo || shown.action ? shown.text : undefined}>{shown.text}</span>
      {shown.action && (
        <button
          type="button"
          className="shrink-0 font-medium whitespace-nowrap text-foreground underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground"
          onClick={() => {
            setShown(null)
            shown.action?.run()
          }}
        >
          {shown.action.label} <kbd className="ml-0.5 font-sans text-key opacity-70">{shown.action.key}</kbd>
        </button>
      )}
      {shown.undo && (
        <button
          type="button"
          className="shrink-0 font-medium whitespace-nowrap text-[var(--tt-brand-color-400)] hover:underline"
          onClick={() => {
            chime('undo')
            shown.undo?.()
            setShown(null)
          }}
        >
          Undo <kbd className="ml-0.5 font-sans text-key opacity-70">⌘Z</kbd>
        </button>
      )}
    </motion.div>}
    </AnimatePresence>
    </div>
    </>
  )
}

/**
 * A scrolling area that eases, as Lenis does it: the wheel and trackpad move
 * toward where you sent them over a few frames instead of in fixed jumps. The
 * editor scrolls itself and is left alone; this is the lists and pages.
 */
export function SmoothScroll({ children }: { children: ReactNode }): React.JSX.Element {
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  useSmooth(box)
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={setBox} className="min-h-0 flex-1 overflow-y-auto">
        <div className="page-column">{children}</div>
      </div>
      <BackToTop target={box} />
    </div>
  )
}

/** The same easing on any scrolling box, whose first child is what scrolls. */
export function useSmooth(box: HTMLElement | null): void {
  useEffect(() => {
    const wrapper = box
    if (!wrapper || document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const lenis = new Lenis({ wrapper, content: wrapper.firstElementChild as HTMLElement, lerp: 0.14, smoothWheel: true })
    // Anything that moves this box itself goes through Lenis, or the two fight.
    smooth.set(wrapper, lenis)
    // Ticks only while a glide is under way. The box and the glow keep running
    // while hidden (they never throttle), so a loop that never stops would
    // spend every frame of the day on a window nobody can see.
    let frame = 0
    let idle = 0
    const loop = (time: number): void => {
      lenis.raf(time)
      idle = lenis.isScrolling ? 0 : idle + 1
      frame = idle > 2 ? 0 : requestAnimationFrame(loop)
    }
    const wake = (): void => {
      idle = 0
      if (!frame) frame = requestAnimationFrame(loop)
    }
    const off = lenis.on('virtual-scroll', wake)
    const scrollTo = lenis.scrollTo.bind(lenis)
    lenis.scrollTo = (...args) => {
      scrollTo(...args)
      wake()
    }
    return () => {
      off()
      cancelAnimationFrame(frame)
      smooth.delete(wrapper)
      lenis.destroy()
    }
  }, [box])
}
const smooth = new WeakMap<HTMLElement, Lenis>()

/**
 * Back to the top, once you are far enough down for it to be a trip: a small
 * button that rises in at the bottom right of the scrolling area it watches,
 * and glides you back. Gone again at the top.
 */
export function BackToTop({ target }: { target: HTMLElement | null }): React.JSX.Element {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const box = target
    setShown(false)
    if (!box) return
    const check = (): void => setShown(box.scrollTop > box.clientHeight * 1.5)
    box.addEventListener('scroll', check, { passive: true })
    return () => box.removeEventListener('scroll', check)
  }, [target])
  return (
    // Bottom right, in a strip of its own, so the spring can own the button's transform.
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-end pr-5">
    <AnimatePresence>
      {shown && (
        <motion.button
          type="button"
          aria-label="Back to top"
        
          initial={{ opacity: 0, y: 8, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          onClick={() => {
            // From far down, jump most of the way and glide the last stretch:
            // a glide over a few hundred rows is a wait, not a motion.
            if (!target) return
            const lenis = smooth.get(target)
            if (target.scrollTop > target.clientHeight * 2) {
              if (lenis) lenis.scrollTo(target.clientHeight, { immediate: true })
              else target.scrollTop = target.clientHeight
            }
            if (lenis) lenis.scrollTo(0, { duration: 0.6 })
            else target.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          // Dressed like the app's other floating controls: the popover surface, a
          // hairline edge, the shared panel shadow, the text size of every control.
          className="pointer-events-auto flex items-center gap-1.5 rounded-full border bg-popover py-1 pr-3 pl-2.5 text-control text-muted-foreground shadow-(--mf-panel-shadow) transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowUp className="size-3.5" /> Top
        </motion.button>
      )}
    </AnimatePresence>
    </div>
  )
}

/** What you have typed before in a field, most used first, for its autocomplete. */
export function Remembered({ field, value, onChange, placeholder, className = 'field-sizing-content min-w-16 max-w-48 px-1.5 py-0.5', ...rest }: {
  field: 'attribution' | 'medium'
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>): React.JSX.Element {
  const values = useLive(() => vigil.values(field), [] as string[])
  return (
    <>
      <input
        {...rest}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        list={`remembered-${field}`}
        placeholder={placeholder}
        className={cn('rounded-md bg-transparent text-muted-foreground outline-none placeholder:text-foreground/70/60 hover:bg-accent/50 focus:bg-accent/50 focus:text-foreground', className)}
      />
      <datalist id={`remembered-${field}`}>
        {values.map((one) => <option key={one} value={one} />)}
      </datalist>
    </>
  )
}

/**
 * Who said it, asked in place: one key from a rot card or a search result
 * opens it, Enter keeps it, Escape leaves it as it was.
 */
export function AskWho({ id, initial = '', onDone }: { id: string; initial?: string; onDone: (who?: string) => void }): React.JSX.Element {
  // Starts from the name it has, so a fix is an edit rather than a retype.
  const [who, setWho] = useState(initial)
  return (
    <Remembered
      autoFocus
      field="attribution"
      value={who}
      onChange={setWho}
      placeholder="Who said it?  ↵"
      className="w-full px-1.5 py-0.5 text-control"
      onBlur={() => onDone()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape') onDone()
        if (event.key !== 'Enter') return
        event.preventDefault()
        // Emptied and Enter clears it: a wrong name can be taken off.
        void vigil.setCapture(id, 'attribution', who.trim() || null).then(() => toast(who.trim() ? `Said by ${who.trim()}` : 'Who said it: cleared'))
        onDone(who.trim())
      }}
    />
  )
}

/**
 * A label on hover, shadcn's tooltip rather than the system's: says what a
 * button does, and its key if it has one.
 */
export function Tip({ label: given, offset, children }: { label: ReactNode; /** Space between the tip and its control, for a control that grows on hover. */ offset?: number; children: React.ReactElement<{ 'aria-label'?: string; children?: ReactNode }> }): React.JSX.Element {
  // Its keys as you press them now, if you changed them in Settings.
  useKeyChanges()
  const label = typeof given === 'string' ? withKeys(given) : given
  if (!label) return children
  // A plain-text tip names an icon-only button, so it can be read out, not
  // only hovered. A button with words of its own keeps them as its name.
  const worded = Children.toArray(children.props.children).some((child) => typeof child === 'string' || typeof child === 'number')
  const named = typeof label === 'string' && !worded && !children.props['aria-label'] ? cloneElement(children, { 'aria-label': label }) : children
  return <Tipped label={label} offset={offset}>{named}</Tipped>
}

/**
 * A tip never repeats what the control already shows: worded the same as its
 * visible words it stays shut, and "Settings  ⌘," over a row that says
 * Settings shows only ⌘,. Checked on opening, so a row that is an icon at one
 * width and words at another gets its tip only when it needs one.
 */
function Tipped({ label, offset, children }: { label: ReactNode; offset?: number; children: React.ReactElement }): React.JSX.Element {
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  // Kept as it closes, so the tip fades out with its words still in it.
  const [shown, setShown] = useState<ReactNode>(label)
  const onOpenChange = (next: boolean): void => {
    if (!next || typeof label !== 'string') return (setShown(next ? label : shown), setOpen(next))
    const seen = (trigger.current?.innerText ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
    const said = label.toLowerCase()
    if (seen && said === seen) return setOpen(false)
    // Two spaces part a name from its keys, so what is left after them is only keys.
    setShown(seen && said.startsWith(`${seen}  `) ? label.slice(seen.length).trim() : label)
    setOpen(true)
  }
  return (
    <Tooltip open={open} onOpenChange={onOpenChange}>
      <TooltipTrigger asChild ref={trigger}>{children}</TooltipTrigger>
      <TooltipContent sideOffset={offset}>{shown}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Focus: everything but the thing you are on goes, until ⇧⌘F again. Each
 * window keeps its own; the parts that go are marked data-chrome.
 */
export function useFocusMode(name: string): boolean {
  const [on, setOn] = useStoredFlag(`focus:${name}`)
  const now = useRef(on)
  now.current = on
  useEffect(() => void (document.documentElement.dataset.focus = on ? 'on' : 'off'), [on])
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || !event.shiftKey || event.code !== 'KeyF') return
      event.preventDefault()
      // Heard as a switch, the way safe mode is.
      chime(now.current ? 'off' : 'on')
      setOn(!now.current)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  return on
}

/** The way out of focus, small, in a corner. */
export function FocusNote(): React.JSX.Element {
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-30 hidden rounded-full bg-popover px-3 py-1 font-sans text-xs text-muted-foreground shadow [[data-focus=on]_&]:block">
      Focus · ⇧⌘F to come back
    </div>
  )
}

/**
 * A long list that draws only the rows in view, with TanStack Virtual. It
 * scrolls with whatever box holds it, from where it sits in that box, so it can
 * sit under cards or headings; the keyboard's row is scrolled to even before it
 * is drawn, so gg and G land.
 */
export function VirtualList<T>({ items, keyOf, cursor, estimate = 48, className = '', children }: {
  items: T[]
  keyOf: (item: T) => string
  /** The row the keyboard is on, scrolled into view when it moves. */
  cursor?: number
  estimate?: number
  className?: string
  children: (item: T, index: number) => ReactNode
}): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  const [margin, setMargin] = useState(0)
  useLayoutEffect(() => {
    let parent = box.current?.parentElement ?? null
    while (parent && !/auto|scroll/.test(getComputedStyle(parent).overflowY)) parent = parent.parentElement
    setScroller(parent)
  }, [])
  useLayoutEffect(() => {
    if (!box.current || !scroller) return
    const at = Math.round(box.current.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop)
    if (at !== margin) setMargin(at)
  })
  const rows = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller,
    estimateSize: () => estimate,
    overscan: 10,
    scrollMargin: margin,
    getItemKey: (index) => keyOf(items[index])
  })
  useEffect(() => {
    if (cursor !== undefined && cursor >= 0 && cursor < items.length) rows.scrollToIndex(cursor)
  }, [cursor]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={box} className={`relative ${className}`} style={{ height: rows.getTotalSize() }}>
      {rows.getVirtualItems().map(({ index, key, start }) => (
        // A sliver of room under each row, so two lit rows (the open one and the
        // cursor) never touch. Padding, not margin: the measure counts padding.
        <div key={key} data-index={index} ref={rows.measureElement} className="absolute top-0 left-0 w-full pb-0.5" style={{ transform: `translateY(${start - margin}px)` }}>
          {children(items[index], index)}
        </div>
      ))}
    </div>
  )
}

/** Sounds on or off in one click, from the top of either window. */
export function SoundToggle({ className = '' }: { className?: string }): React.JSX.Element | null {
  const settings = useLive(vigil.settings, null as Awaited<ReturnType<typeof vigil.settings>> | null)
  if (!settings) return null
  const on = settings.sounds
  return (
    <Tip label={on ? 'Sounds on: click for quiet' : 'Sounds off: click to hear them'}>
      <button
        type="button"
        // Never where the focus lands: opening the window is for typing.
        tabIndex={-1}
        aria-label={on ? 'Turn sounds off' : 'Turn sounds on'}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onClick={() => {
          // Set first, so the sound of turning it on is heard.
          soundOn(!on)
          chime(!on ? 'on' : 'off')
          void vigil.setSettings({ sounds: !on })
        }}
        className={className}
      >
        <AliveIcon icon={on ? Volume2Icon : VolumeXIcon} size={16} />
      </button>
    </Tip>
  )
}

/**
 * Text that rolls into place when it changes, slot-text's way: a count that
 * goes up rolls up, one that goes down rolls down, and only the digits that
 * moved turn over. Still when motion is off, so it is plain text then.
 */
export function Rolling({ text, className = '', by = 'character' }: { text: string | number; className?: string; by?: 'character' | 'word' }): React.JSX.Element {
  const last = useRef(text)
  const up = typeof text === 'number' && typeof last.current === 'number' ? text >= last.current : true
  useEffect(() => void (last.current = text), [text])
  const still = document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
  return (
    <SlotText
      text={typeof text === 'number' ? num(text) : text}
      className={className}
      options={{ direction: up ? 'up' : 'down', rollBy: by, duration: still ? 0 : 260, stagger: still ? 0 : by === 'word' ? 22 : 35, exitOffset: still ? 0 : 40 }}
    />
  )
}

/**
 * ⇧⌘R: read through the list on screen, one note at a time. One handler for
 * every list that offers it; `read` is called only when it has rows.
 */
export function useReadKey(read: () => void, rows: number, enabled = true): void {
  const latest = useRef(read)
  latest.current = read
  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || !event.shiftKey || event.key.toLowerCase() !== 'r' || !rows) return
      event.preventDefault()
      latest.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [rows, enabled])
}

/**
 * The open note's first line once it has scrolled out of sight, for the main
 * window's top bar to show faintly: the box keeps its own.
 */
let topTitle: string | null = null
const topTitleListeners = new Set<(title: string | null) => void>()
export function showTopTitle(title: string | null): void {
  topTitle = title
  for (const listen of topTitleListeners) listen(title)
}
export function useTopTitle(): string | null {
  const [title, setTitle] = useState(topTitle)
  useEffect(() => {
    topTitleListeners.add(setTitle)
    return () => void topTitleListeners.delete(setTitle)
  }, [])
  return title
}

/**
 * Things that belong together, in one rounded island under an optional
 * heading, rows divided by hairlines: the macOS settings look, used for
 * every grouped panel so they all read the same.
 */
export function Island({ title, actions, children, className, compact }: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  /**
   * For a narrow column beside an open note: tighter spacing, a smaller
   * heading, each child a square row (fields lose their own box), and the
   * island gone while nothing in it is shown.
   */
  compact?: boolean
}): React.JSX.Element {
  return (
    <section className={cn(compact ? 'mt-3 first:mt-0 has-[>div:last-child:empty]:hidden' : 'mt-6 first:mt-0', className)}>
      {(title || actions) && (
        <div className={cn('flex items-center gap-2 px-1', compact ? 'mb-1' : 'mb-2')}>
          {title && <h2 className={cn('font-semibold text-foreground', compact ? 'text-meta' : 'text-body')}>{title}</h2>}
          {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
        </div>
      )}
      <div className={cn('mf-island divide-y divide-border/60 overflow-hidden border bg-accent/25', compact
        ? 'rounded-lg [&>*]:rounded-none [&>button]:w-full [&>textarea]:border-0 [&>textarea]:bg-transparent [&>textarea]:shadow-none [&>textarea]:focus-visible:ring-0 [&>input]:border-0 [&>input]:bg-transparent [&>input]:shadow-none [&>input]:focus-visible:ring-0'
        : 'rounded-xl')}>{children}</div>
    </section>
  )
}

/** One row of an island: a label on the left, its value or control on the right. */
export function IslandRow({ label, note, children, className }: { label?: ReactNode; note?: ReactNode; children?: ReactNode; className?: string }): React.JSX.Element {
  return (
    <div className={cn('flex items-center justify-between gap-4 px-4 py-2.5', className)}>
      {(label || note) && (
        <div className="min-w-0">
          {label && <div className="text-body text-foreground">{label}</div>}
          {note && <p className="mt-0.5 text-meta leading-relaxed text-muted-foreground">{note}</p>}
        </div>
      )}
      {children !== undefined && <div className="flex min-w-0 shrink-0 items-center gap-2 text-control">{children}</div>}
    </div>
  )
}

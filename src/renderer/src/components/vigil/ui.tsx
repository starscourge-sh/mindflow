import { Children, cloneElement, createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { SlotText } from 'slot-text/react'
import { ArrowUp, CircleCheck, CircleX, Volume2, VolumeX, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Coolshape, type shapeTypes } from 'coolshapes-react'
import Lenis from 'lenis'
import { useLive, vigil } from '@/lib/vigil'
import { chime, soundOn } from '@/lib/sound'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/cn'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * The few parts every view is built from, so the views read as one app. The
 * look follows Linear and Todoist: a quiet header with a count, rows that are
 * one line of meaning and one of detail, properties down the right, and an
 * empty state that says what the view is for and how to fill it.
 */

/** A view's frame: title, a muted count, actions on the right, then the body. */
export function Page({ title, count, actions, children, aside = false }: {
  title: ReactNode
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
          {count ? <span className="whitespace-nowrap tabular-nums"><Rolling text={count} /> {count === 1 ? 'item' : 'items'}</span> : null}
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
export function Typed({ text, className, step = 40, delay = 400 }: { text: string; className?: string; step?: number; delay?: number }): React.JSX.Element {
  const words = text.split(/(\s+)/)
  return (
    <span key={text} className={className} aria-label={text}>
      {words.map((word, index) =>
        /^\s+$/.test(word) ? word : (
          <span key={index} aria-hidden className="mf-typed" style={{ animationDelay: `${delay + (index / 2) * step}ms` }}>{word}</span>
        )
      )}
    </span>
  )
}

export function Empty({ shape, title, children, action, compact = false }: {
  shape: [shapeTypes, number]
  title: string
  children: ReactNode
  action?: ReactNode
  /** Sized for the prompt's narrow panel: less height above, a smaller shape. */
  compact?: boolean
}): React.JSX.Element {
  return (
    <div className={`flex max-w-sm flex-col items-start gap-3 ${compact ? 'px-2 py-10' : 'px-5 py-[16vh]'}`}>
      <Coolshape type={shape[0]} index={shape[1]} noise={false} size={compact ? 44 : 56} className="mb-3" />
      <h2 className="text-heading font-semibold">{title}</h2>
      <p className="leading-relaxed text-muted-foreground">{typeof children === 'string' ? <Typed text={children} step={30} /> : children}</p>
      {action}
    </div>
  )
}

/** A key, the way a menu shows a shortcut. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }): React.JSX.Element {
  return (
    <kbd className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/80 px-1 font-sans text-key text-muted-foreground', className)}>
      {children}
    </kbd>
  )
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
export function Prop({ icon: Icon, children, onClick, active, tint, secret }: {
  icon: LucideIcon
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
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left ${onClick ? 'hover:bg-accent hover:text-foreground' : ''} ${active ? 'text-foreground' : ''}`}
    >
      <Icon className="size-4 shrink-0" style={tint ? { color: `var(--tt-color-text-${tint})` } : undefined} />
      <span className={`min-w-0 truncate ${secret ? 'private-text' : ''}`}>{children}</span>
    </Tag>
  )
}


/** Tags as Todoist draws them: a small tag glyph and the word, in a quiet colour. */
export function Tags({ tags }: { tags: string[] }): React.JSX.Element | null {
  const colors = useTagColors()
  if (!tags.length) return null
  return (
    <span className="flex shrink-0 items-center gap-2 text-xs">
      {tags.map((tag) => (
        <span key={tag} style={{ color: `var(--tt-color-text-${colors[tag] ?? 'blue'})` }}>#{tag}</span>
      ))}
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
  void vigil.pin(table, id, on).then((ok) => (ok ? on && chime('pin') : refuse('Three pins at most: unpin one first')))

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
      if (event.key === 'g' && last.current === 'g') return move(0)
      last.current = event.key
      if (event.key === 'Enter' && onOpen && at >= 0 && at < count) {
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
export const toast = (text: string, undo?: () => void, tone: 'success' | 'error' = 'success', action?: ToastAction): void => {
  beam(tone)
  window.dispatchEvent(new CustomEvent('vigil:toast', { detail: { text, undo, tone, action } }))
}

/** Give a nugget its question, so review can test it: asked in place. */
export const askQuestion = (id: string): Promise<void> =>
  ask('The question it answers, for review', 'e.g. What does MVCC stand for?').then((prompt) => {
    if (prompt) void vigil.saveItem(id, { prompt }).then(() => toast('Now tested: it will come up in review'))
  })

/** Say why something was not done, with the "not allowed" sound. */
export const refuse = (text: string): void => {
  chime('nope')
  toast(text, undefined, 'error')
}

export type BeamState = 'success' | 'error' | 'loading' | null
/**
 * The light along the window's top edge, the way Raycast's does it: a green
 * sweep when something worked, a red flicker when it did not, a travelling
 * shimmer while something is on its way. Seen from the corner of the eye,
 * without reading a word.
 */
export const beam = (state: BeamState): void => void window.dispatchEvent(new CustomEvent('vigil:beam', { detail: state }))
/** The shimmer for as long as the work takes, then the answer it gave. */
export async function beaming<T>(work: Promise<T>): Promise<T> {
  beam('loading')
  try {
    const done = await work
    beam(null)
    return done
  } catch (error) {
    beam('error')
    throw error
  }
}

export function Beam(): React.JSX.Element | null {
  const [state, setState] = useState<{ tone: BeamState; key: number }>({ tone: null, key: 0 })
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const onBeam = (event: Event): void => {
      clearTimeout(timer)
      const tone = (event as CustomEvent<BeamState>).detail
      setState({ tone, key: Date.now() })
      // Loading stays until it is answered; an answer fades on its own.
      if (tone && tone !== 'loading') timer = setTimeout(() => setState({ tone: null, key: Date.now() }), 1400)
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
export const ask = (question: string, placeholder = '', field?: 'attribution' | 'medium'): Promise<string | null> =>
  new Promise((answer) => void window.dispatchEvent(new CustomEvent('vigil:ask', { detail: { question, placeholder, field, answer } })))

/** The names typed before in a field, offered as you type: the list behind `list=`. */
function Suggest({ field }: { field: 'attribution' | 'medium' }): React.JSX.Element {
  const values = useLive(() => vigil.values(field), [] as string[])
  return <datalist id={`remembered-${field}`}>{values.map((one) => <option key={one} value={one} />)}</datalist>
}

function Asker(): React.JSX.Element | null {
  const [asked, setAsked] = useState<{ question: string; placeholder: string; field?: 'attribution' | 'medium'; answer: (words: string | null) => void } | null>(null)
  useEffect(() => {
    const onAsk = (event: Event): void => setAsked((event as CustomEvent).detail)
    window.addEventListener('vigil:ask', onAsk)
    return () => window.removeEventListener('vigil:ask', onAsk)
  }, [])
  if (!asked) return null
  const done = (words: string | null): void => {
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

export function Toaster(): React.JSX.Element | null {
  const [shown, setShown] = useState<{ text: string; undo?: () => void; tone?: 'success' | 'error'; action?: ToastAction; key: number } | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const onToast = (event: Event): void => {
      clearTimeout(timer)
      const detail = (event as CustomEvent).detail
      setShown({ ...detail, key: Date.now() })
      // Longer when it can be taken back, so the undo is there to reach.
      timer = setTimeout(() => setShown(null), detail.undo || detail.action ? 6000 : 3200)
    }
    // A save that failed on the way to the database says so, rather than the
    // success toast just never coming.
    const onFail = (event: PromiseRejectionEvent): void => {
      const message = String(event.reason?.message ?? event.reason ?? '')
      if (message.includes('Error invoking remote method')) refuse(`Not saved: ${message.replace(/^.*?Error: /, '').split('\n')[0].replace(/^Error invoking remote method.*$/, 'it was not accepted')}`)
    }
    window.addEventListener('vigil:toast', onToast)
    window.addEventListener('unhandledrejection', onFail)
    return () => {
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
      if (!shown.undo || !event.metaKey || event.key !== 'z' || event.shiftKey || typing()) return
      event.preventDefault()
      chime('undo')
      shown.undo?.()
      setShown(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shown])
  // Asker always in the same place, so a toast coming or going never
  // remounts it and loses a question being answered.
  return (
    <>
    <Asker />
    <Beam />
    {/* Centred along the bottom, where the eye drops after acting. */}
    {shown && <div className="pointer-events-none fixed right-[var(--toast-right,0px)] bottom-[var(--toast-bottom,1.25rem)] left-[var(--toast-left,0px)] z-50 flex justify-center"><div
      key={shown.key}
      role="status"
      aria-live="polite"
      // An edge and a mark, with the buttons' corners: it has to be seen
      // from the corner of the eye, on any theme.
      className="pointer-events-auto flex items-center gap-2 rounded-md border border-border bg-popover py-1.5 pr-3.5 pl-2.5 text-sm font-medium shadow-[0_8px_24px_-6px_rgb(0_0_0/0.5)] animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
    >
      {shown.tone === 'error'
        ? <CircleX className="size-4 shrink-0 text-[var(--tt-color-text-red)]" />
        : <CircleCheck className="size-4 shrink-0 text-[var(--tt-brand-color-400)]" />}
      <span>{shown.text}</span>
      {shown.action && (
        <button
          type="button"
          className="font-medium text-foreground underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground"
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
          className="font-medium text-[var(--tt-brand-color-400)] hover:underline"
          onClick={() => {
            chime('undo')
            shown.undo?.()
            setShown(null)
          }}
        >
          Undo <kbd className="ml-0.5 font-sans text-key opacity-70">⌘Z</kbd>
        </button>
      )}
    </div></div>}
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
    if (!wrapper || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const lenis = new Lenis({ wrapper, content: wrapper.firstElementChild as HTMLElement, lerp: 0.14, smoothWheel: true })
    // Anything that moves this box itself goes through Lenis, or the two fight.
    smooth.set(wrapper, lenis)
    let frame = requestAnimationFrame(function loop(time) {
      lenis.raf(time)
      frame = requestAnimationFrame(loop)
    })
    return () => {
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
          className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--tt-brand-color-400)_22%,var(--popover))] py-1.5 pr-3.5 pl-2.5 font-sans text-xs font-medium text-[var(--tt-brand-color-400)] border border-dashed border-[color-mix(in_srgb,var(--tt-brand-color-400)_60%,transparent)] shadow-[0_10px_24px_-8px_rgb(0_0_0/0.6)] transition-colors hover:bg-[color-mix(in_srgb,var(--tt-brand-color-400)_32%,var(--popover))]"
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
        className={cn('rounded-md bg-transparent text-muted-foreground outline-none placeholder:text-muted-foreground/60 hover:bg-accent/50 focus:bg-accent/50 focus:text-foreground', className)}
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
export function Tip({ label, children }: { label: ReactNode; children: React.ReactElement<{ 'aria-label'?: string; children?: ReactNode }> }): React.JSX.Element {
  if (!label) return children
  // A plain-text tip names an icon-only button, so it can be read out, not
  // only hovered. A button with words of its own keeps them as its name.
  const worded = Children.toArray(children.props.children).some((child) => typeof child === 'string' || typeof child === 'number')
  const named = typeof label === 'string' && !worded && !children.props['aria-label'] ? cloneElement(children, { 'aria-label': label }) : children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{named}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Focus: everything but the thing you are on goes, until ⇧⌘F again. Each
 * window keeps its own; the parts that go are marked data-chrome.
 */
export function useFocusMode(name: string): boolean {
  const key = `focus:${name}`
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(key) === 'on'
    } catch {
      return false
    }
  })
  useEffect(() => {
    document.documentElement.dataset.focus = on ? 'on' : 'off'
    try {
      localStorage.setItem(key, on ? 'on' : 'off')
    } catch {
      // Kept for this window only.
    }
  }, [on, key])
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || !event.shiftKey || event.code !== 'KeyF') return
      event.preventDefault()
      setOn((was) => !was)
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
        <div key={key} data-index={index} ref={rows.measureElement} className="absolute top-0 left-0 w-full" style={{ transform: `translateY(${start - margin}px)` }}>
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
        {on ? <Volume2 /> : <VolumeX />}
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
      text={String(text)}
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

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Coolshape, type shapeTypes } from 'coolshapes-react'
import Lenis from 'lenis'
import { useLive, vigil } from '@/lib/vigil'

/**
 * The few parts every view is built from, so the views read as one app. The
 * look follows Linear and Todoist: a quiet header with a count, rows that are
 * one line of meaning and one of detail, properties down the right, and an
 * empty state that says what the view is for and how to fill it.
 */

/** A view's frame: title, a muted count, actions on the right, then the body. */
export function Page({ title, count, actions, children }: {
  title: ReactNode
  count?: number
  actions?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  return (
    <section className="flex min-w-0 flex-1 flex-col">
      {/* The window's toolbar already names the section, so this line only
          carries the count and the actions, and goes when it has neither. */}
      {(count !== undefined || actions) && (
        <header className="page-column flex h-10 shrink-0 items-center gap-2 border-b px-5 text-muted-foreground">
          {typeof title === 'string' && title.startsWith('#') ? <span className="font-medium text-foreground">{title}</span> : null}
          {count !== undefined && <span className="tabular-nums">{count} {count === 1 ? 'item' : 'items'}</span>}
          <div className="ml-auto flex items-center gap-1">{actions}</div>
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
export function Empty({ shape, title, children, action }: {
  shape: [shapeTypes, number]
  title: string
  children: ReactNode
  action?: ReactNode
}): React.JSX.Element {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-start gap-3 px-6 py-[16vh]">
      <Coolshape type={shape[0]} index={shape[1]} noise={false} size={56} className="mb-3" />
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <p className="leading-relaxed text-muted-foreground">{children}</p>
      {action}
    </div>
  )
}

/** A key, the way a menu shows a shortcut. */
export function Kbd({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/80 px-1 font-sans text-[11px] text-muted-foreground">
      {children}
    </kbd>
  )
}

/** A labelled run of properties, the right-hand column of an open item. */
export function Props({ children }: { children: ReactNode }): React.JSX.Element {
  return <aside className="flex w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-l p-3 pt-4 text-muted-foreground">{children}</aside>
}
export function PropLabel({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="mt-3 mb-1 px-2 text-xs first:mt-0">{children}</div>
}
export function Prop({ icon: Icon, children, onClick, active }: {
  icon: LucideIcon
  children: ReactNode
  onClick?: () => void
  active?: boolean
}): React.JSX.Element {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left ${onClick ? 'hover:bg-accent hover:text-foreground' : ''} ${active ? 'text-foreground' : ''}`}
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 truncate">{children}</span>
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

  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent): void => {
      const { count, onOpen, onBack, at } = latest.current
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
      if (event.key === 'Enter' && onOpen && at >= 0) {
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
 * Say what an action did, briefly, with a way back. The answer to "did that
 * work?" and the plan's undo-everywhere in one: three seconds, then gone.
 */
export const toast = (text: string, undo?: () => void): void =>
  void window.dispatchEvent(new CustomEvent('vigil:toast', { detail: { text, undo } }))

export function Toaster(): React.JSX.Element | null {
  const [shown, setShown] = useState<{ text: string; undo?: () => void; key: number } | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const onToast = (event: Event): void => {
      clearTimeout(timer)
      setShown({ ...(event as CustomEvent).detail, key: Date.now() })
      timer = setTimeout(() => setShown(null), 3200)
    }
    window.addEventListener('vigil:toast', onToast)
    return () => window.removeEventListener('vigil:toast', onToast)
  }, [])
  if (!shown) return null
  return (
    <div
      key={shown.key}
      className="fixed right-5 bottom-5 z-50 flex items-center gap-3 rounded-lg bg-popover px-3.5 py-2 text-sm shadow-[0_8px_24px_-6px_rgb(0_0_0/0.45)] animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
    >
      <span>{shown.text}</span>
      {shown.undo && (
        <button
          type="button"
          className="font-medium text-[var(--tt-brand-color-400)] hover:underline"
          onClick={() => {
            shown.undo?.()
            setShown(null)
          }}
        >
          Undo
        </button>
      )}
    </div>
  )
}

/**
 * A scrolling area that eases, as Lenis does it: the wheel and trackpad move
 * toward where you sent them over a few frames instead of in fixed jumps. The
 * editor scrolls itself and is left alone; this is the lists and pages.
 */
export function SmoothScroll({ children }: { children: ReactNode }): React.JSX.Element {
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    const wrapper = box
    if (!wrapper || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const lenis = new Lenis({ wrapper, content: wrapper.firstElementChild as HTMLElement, lerp: 0.14, smoothWheel: true })
    let frame = requestAnimationFrame(function loop(time) {
      lenis.raf(time)
      frame = requestAnimationFrame(loop)
    })
    return () => {
      cancelAnimationFrame(frame)
      lenis.destroy()
    }
  }, [box])
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={setBox} className="min-h-0 flex-1 overflow-y-auto">
        <div className="page-column">{children}</div>
      </div>
      <BackToTop target={box} />
    </div>
  )
}

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
    <AnimatePresence>
      {shown && (
        <motion.button
          type="button"
          title="Back to top"
          initial={{ opacity: 0, y: 8, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          onClick={() => {
            // From far down, jump most of the way and glide the last stretch:
            // a glide over a few hundred rows is a wait, not a motion.
            if (!target) return
            if (target.scrollTop > target.clientHeight * 2) target.scrollTop = target.clientHeight
            target.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          className="absolute right-4 bottom-4 z-20 flex items-center gap-1.5 rounded-full bg-popover px-3 py-1.5 text-xs text-muted-foreground shadow-[0_6px_20px_-6px_rgb(0_0_0/0.5)] hover:text-foreground"
        >
          <ArrowUp className="size-3.5" /> Top
        </motion.button>
      )}
    </AnimatePresence>
  )
}

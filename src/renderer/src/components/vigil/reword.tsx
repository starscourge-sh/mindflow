import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import type { Editor } from '@tiptap/core'
import { alive } from '@/components/ui/alive-icon'
import LibraryIcon from '@/components/ui/library-icon'
import StackIcon from '@/components/ui/stack-icon'
import { Button } from '@/components/ui/button'
import { chime } from '@/lib/sound'
import { vigil } from '@/lib/vigil'
import { comboOf } from '@/lib/keys'
import { EASE, shift } from '@/lib/motion'
import { liftFrom } from '@/lib/fly-home'
import { Kbd, refuse, toast, whyFailed } from './ui'

/**
 * Reword before it is kept: selected words are rarely exactly the thought, so
 * Capture or Idea on the selection bar opens a small card by the words, filled
 * with them, to trim or rephrase before they go. Nothing waits on it: the note
 * still scrolls and takes typing behind it, a click elsewhere tucks it into a
 * stack in the corner with its words kept, and several can wait there at once.
 */

export type Kind = 'capture' | 'nugget'
export type Origin = { captureId?: string; attribution?: string | null; from?: string; onLifted?: (id: string) => void; said?: string }

const Gem = alive(LibraryIcon)
const Inbox = alive(StackIcon)
const KINDS: Record<Kind, { label: string; icon: typeof Gem; hue: string; home: 'capture' | 'nugget' }> = {
  capture: { label: 'Capture', icon: Inbox, hue: 'var(--tt-color-text-blue)', home: 'capture' },
  nugget: { label: 'Gem', icon: Gem, hue: 'var(--tt-color-text-purple)', home: 'nugget' }
}

// --- keeping it ----------------------------------------------------------------

/**
 * What has already been lifted, by kind and words, so the same words twice
 * say so instead of making a duplicate. For this session only.
 */
const lifted = new Set<string>()
export const once = (kind: Kind | 'task', text: string): boolean => {
  const key = `${kind}\n${text}`
  if (!lifted.has(key)) return !!lifted.add(key)
  refuse({ capture: 'Already in your inbox', nugget: 'Already a gem', task: 'Already a task' }[kind], 'info')
  return false
}
const forget = (kind: Kind, text: string): void => void lifted.delete(`${kind}\n${text}`)

/**
 * Keep the words as a capture or an idea, linked back to the note they came
 * from, and show them going home from `from` (the card, when there is one).
 * False when nothing was kept, so a card can come back with its words.
 */
export async function keep(kind: Kind, text: string, question: string, origin: Origin, from?: HTMLElement | null): Promise<boolean> {
  const words = text.trim()
  if (!words) return (refuse('Nothing to keep yet: write a few words first'), false)
  if (!once(kind, words)) return false
  // The picture is taken now, while the card is still on screen.
  const land = liftFrom(from ?? null, KINDS[kind].home)
  try {
    if (kind === 'capture') {
      chime('send')
      const id = await window.api.captures.create({ body: words, ...(origin.from ? { origin: origin.from } : {}) })
      // From a note not saved yet: it is linked back once that note is.
      if (!origin.from) origin.onLifted?.(id)
      land?.()
      toast(origin.said ?? (origin.from ? 'In your inbox, linked back to here' : 'In your inbox, linked once this note is saved'),
        () => void vigil.unlift('capture', id).then(() => forget(kind, words)),
        'success', { label: 'Open', key: 'O', run: () => window.api.openInHome('capture', id) })
      return true
    }
    // Only what can cross to the main process: not the callbacks.
    const id = await vigil.nuggetFrom(words, { captureId: origin.captureId, attribution: origin.attribution })
    const asked = question.trim()
    if (asked) await vigil.saveItem(id, { prompt: asked })
    chime('promote')
    land?.()
    toast(asked ? 'Saved as a gem, with its question for review' : 'Saved as a gem',
      () => void vigil.unlift('nugget', id).then(() => forget(kind, words)),
      'success', { label: 'Open', key: 'O', run: () => window.api.openInHome('nugget', id) })
    return true
  } catch (error) {
    forget(kind, words)
    refuse(`Not kept: ${whyFailed(error)}`, 'error')
    return false
  }
}

// --- the cards in flight ---------------------------------------------------------

type Draft = {
  key: string
  kind: Kind
  text: string
  question: string
  /** The words as they were selected: put away unchanged, nothing is lost. */
  first: string
  origin: Origin
  /** Where it opened, while it sits by the words; null once in the corner. */
  anchor: { editor: Editor; from: number; to: number } | null
  open: boolean
}

let drafts: Draft[] = []
const told = new Set<() => void>()
// Kept per window, so a window closed or reloaded with cards waiting finds them again.
const STORE = `reword:${location.search}`
const set = (next: Draft[]): void => {
  drafts = next
  told.forEach((tell) => tell())
  try {
    if (next.length) localStorage.setItem(STORE, JSON.stringify(next.map(({ anchor: _, origin: { onLifted: __, ...origin }, ...rest }) => ({ ...rest, origin, open: false }))))
    else localStorage.removeItem(STORE)
  } catch { /* nothing to remember them in: they stay for this session */ }
}
const change = (key: string, patch: Partial<Draft>): void => set(drafts.map((one) => (one.key === key ? { ...one, ...patch } : one)))
/**
 * The words a card opened on stop being selected once it leaves them: left
 * selected, the editor selects them again as you click back in, and the next
 * key typed would replace them. With `back`, the caret returns to the note,
 * after the words, as from a card closed by its keys.
 */
const release = (draft: Draft, back = false): void => {
  const at = draft.anchor
  if (!at || at.editor.isDestroyed) return
  const { from, to } = at.editor.state.selection
  if (from !== at.from || to !== at.to) return
  if (back) at.editor.chain().focus().setTextSelection(to).run()
  else at.editor.commands.setTextSelection(to)
}
/** Every open card goes to the corner, words and all. */
const tuckAll = (): void => {
  if (!drafts.some((one) => one.open || one.anchor)) return
  drafts.forEach((one) => release(one))
  set(drafts.map((one) => ({ ...one, open: false, anchor: null })))
}
/** Put away: unchanged words are still in the note, so they simply go; anything changed waits in the corner. */
const putAway = (draft: Draft): void => {
  release(draft, true)
  if (draft.text.trim() === draft.first.trim() && !draft.question.trim()) set(drafts.filter((one) => one.key !== draft.key))
  else change(draft.key, { open: false, anchor: null })
  chime('fold')
}
const discard = (draft: Draft): void => {
  const at = drafts.indexOf(draft)
  set(drafts.filter((one) => one !== draft))
  chime('away')
  // Undone: back in its place, and open by its words again while the note they sit in is still there.
  toast('Draft let go', () => {
    const live = !!draft.anchor && !draft.anchor.editor.isDestroyed
    set([...drafts.slice(0, at), { ...draft, open: draft.open && live, anchor: live ? draft.anchor : null }, ...drafts.slice(at)])
  })
}
/** Save it; if nothing was kept, it comes back as it was. */
const save = async (draft: Draft, card: HTMLElement | null): Promise<void> => {
  release(draft, true)
  set(drafts.filter((one) => one.key !== draft.key))
  if (!(await keep(draft.kind, draft.text, draft.question, draft.origin, card))) set([...drafts, { ...draft, anchor: null }])
}

/** Open a card on the selected words, by them, as `kind`. */
export function reword(kind: Kind, editor: Editor, origin: Origin): void {
  const { from, to } = editor.state.selection
  const text = editor.state.doc.textBetween(from, to, '\n').trim()
  if (!text) return
  mount()
  chime('open')
  drafts.forEach((one) => one.anchor?.editor !== editor && release(one))
  set([...drafts.map((one) => ({ ...one, open: false, anchor: null })), { key: crypto.randomUUID(), kind, text, question: '', first: text, origin, anchor: { editor, from, to }, open: true }])
}

/**
 * A card on words that are not in an editor (a session's logged thought):
 * open in the corner, as a card reopened from the stack is.
 */
export function rewordText(kind: Kind, text: string, origin: Origin = {}): void {
  const words = text.trim()
  if (!words) return
  mount()
  chime('open')
  drafts.forEach((one) => release(one))
  set([...drafts.map((one) => ({ ...one, open: false, anchor: null })), { key: crypto.randomUUID(), kind, text: words, question: '', first: words, origin, anchor: null, open: true }])
}

/** The selection kept just as it is, no card: for when it is already right. */
export function keepAsIs(kind: Kind, editor: Editor, origin: Origin): void {
  const { from, to } = editor.state.selection
  const text = editor.state.doc.textBetween(from, to, '\n').trim()
  if (text) void keep(kind, text, '', origin)
}

// --- keys ----------------------------------------------------------------------

/** Each editor showing the selection bar, with what its words would be lifted out of. */
const hosts = new Map<Editor, Origin>()
export const host = (editor: Editor, origin: Origin): void => {
  hosts.set(editor, origin)
  for (const one of hosts.keys()) if (one.isDestroyed) hosts.delete(one)
}

/**
 * ⌃⌘C and ⌃⌘I on selected words open a card as a capture or an idea; ⌘↵ keeps
 * them as a capture at once. In a card: ⌘↵ saves, Esc puts away this card
 * only, and ⌃⌘C or ⌃⌘I switch its kind. Taken before the window's own keys,
 * so the box neither sends its note nor hides.
 */
function onKey(event: KeyboardEvent): void {
  const combo = comboOf(event)
  if (!combo) return
  const target = event.target as HTMLElement | null
  const take = (): void => (event.preventDefault(), event.stopImmediatePropagation())
  const card = target?.closest?.<HTMLElement>('[data-reword]')
  if (card) {
    const draft = drafts.find((one) => one.key === card.dataset.reword)
    if (!draft) return
    if (combo === '⌘↵') return (take(), void save(draft, card))
    if (combo === 'Esc') return (take(), putAway(draft))
    if (combo === '⌃⌘C' || combo === '⌃⌘I') return (take(), chime('settled'), change(draft.key, { kind: combo === '⌃⌘C' ? 'capture' : 'nugget' }))
    return
  }
  if (combo !== '⌘↵' && combo !== '⌃⌘C' && combo !== '⌃⌘I') return
  const dom = target?.closest?.('.ProseMirror')
  const editor = dom && [...hosts.keys()].find((one) => !one.isDestroyed && one.view.dom === dom)
  if (!editor || editor.state.selection.empty) return
  const origin = hosts.get(editor)!
  if (combo === '⌘↵') {
    // In the box, ⌘↵ on the whole note still sends the note.
    const box = !/[?&](view|note|drawing)=/.test(location.search)
    const { from, to } = editor.state.selection
    if (box && editor.state.doc.textBetween(from, to, '\n').trim() === editor.state.doc.textContent.trim()) return
    take()
    return keepAsIs('capture', editor, origin)
  }
  take()
  reword(combo === '⌃⌘C' ? 'capture' : 'nugget', editor, origin)
}
addEventListener('keydown', onKey, true)

// A click outside every card tucks the open one into the corner, its words kept.
addEventListener('pointerdown', (event) => {
  if (!(event.target as HTMLElement | null)?.closest?.('[data-reword], [data-reword-stack]')) tuckAll()
}, true)

// --- drawing them ------------------------------------------------------------------

const still = (): boolean => document.documentElement.dataset.motion === 'off'

function Chip({ kind, onClick }: { kind: Kind; onClick?: () => void }): React.JSX.Element {
  const { label, icon: Icon, hue } = KINDS[kind]
  return (
    <button type="button" onClick={onClick} title="Switch between Capture and Gem  ⌃⌘C ⌃⌘I" aria-label={`Kind: ${label}. Switch`}
      className="inline-flex h-6 items-center gap-1 rounded-full border px-2 text-meta font-medium transition-colors duration-150 [&_svg]:size-3.5"
      style={{ color: hue, borderColor: `color-mix(in srgb, ${hue} 30%, transparent)`, background: `color-mix(in srgb, ${hue} 10%, transparent)` }}>
      <Icon /> {label}
    </button>
  )
}

/** Where a card sits by its words: under their paragraph, or over it when there is no room below, always inside the window. */
function place(draft: Draft, height: number): { left: number; top: number; origin: string } | null {
  const anchor = draft.anchor
  if (!anchor || anchor.editor.isDestroyed) return null
  const { view } = anchor.editor
  const size = view.state.doc.content.size
  const start = view.coordsAtPos(Math.min(anchor.from, size))
  const end = view.coordsAtPos(Math.min(anchor.to, size))
  const width = Math.min(360, innerWidth - 24)
  const x = start.top === end.top ? (start.left + end.left) / 2 : start.left
  const left = Math.max(12, Math.min(innerWidth - width - 12, x - 40))
  // Clear of the whole paragraph the words are in, so the words around them stay readable.
  const block = (pos: number): DOMRect | null => {
    const at = view.state.doc.resolve(pos)
    const dom = at.depth ? view.nodeDOM(at.before(at.depth)) : null
    return dom instanceof HTMLElement ? dom.getBoundingClientRect() : null
  }
  const below = Math.max(end.bottom, block(Math.min(anchor.to, size))?.bottom ?? 0) + 8
  const above = Math.min(start.top, block(Math.min(anchor.from, size))?.top ?? Infinity) - 8 - height
  const under = below + height <= innerHeight - 12 || above < 12
  const top = Math.max(12, Math.min(innerHeight - height - 12, under ? below : above))
  return { left, top, origin: `${Math.round(Math.max(0, Math.min(width, x - left)))}px ${under ? '0px' : '100%'}` }
}

function Card({ draft, by }: { draft: Draft; by: boolean }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const [, redraw] = useState(0)
  const [height, setHeight] = useState(150)
  const spot = by ? place(draft, height) : null
  // Measured once drawn, so a card that would run off the bottom opens above the words instead.
  useLayoutEffect(() => {
    const now = ref.current?.offsetHeight
    if (now && Math.abs(now - height) > 1) setHeight(now)
  })
  // By the words, it follows them as the note scrolls.
  useEffect(() => {
    if (!by) return
    const follow = (): void => redraw((n) => n + 1)
    addEventListener('scroll', follow, true)
    addEventListener('resize', follow)
    return () => (removeEventListener('scroll', follow, true), removeEventListener('resize', follow))
  }, [by])
  // The caret comes in once, as it opens: at the end of the words, ready to add or trim.
  useEffect(() => {
    const input = field.current
    if (!input) return
    input.focus({ preventScroll: true })
    input.setSelectionRange(input.value.length, input.value.length)
    // The editor clears the page's selection as it lets go, a moment later,
    // and that drops the caret from here to nowhere (in the box, for a few
    // frames it will not even take it back): put back, while it opens.
    const until = performance.now() + 400
    let frame = 0
    const back = (): void => {
      const active = document.activeElement
      if (input.isConnected && (!active || active === document.body)) input.focus({ preventScroll: true })
      if (performance.now() < until) frame = requestAnimationFrame(back)
    }
    frame = requestAnimationFrame(back)
    return () => cancelAnimationFrame(frame)
  }, [])
  const quick = still()
  return (
    <motion.div
      ref={ref}
      data-reword={draft.key}
      role="dialog"
      aria-label={draft.kind === 'nugget' ? 'Reword as a gem' : 'Reword as a capture'}
      initial={{ opacity: 0, transform: shift('scale(0.96)') }}
      animate={{ opacity: 1, transform: 'scale(1)' }}
      exit={{ opacity: 0, transform: shift('scale(0.97)'), transition: { duration: quick ? 0 : 0.12, ease: EASE } }}
      transition={{ duration: quick ? 0 : 0.16, ease: EASE }}
      className={`${by ? 'fixed' : 'relative'} z-[56] flex w-[min(360px,calc(100vw-24px))] flex-col gap-2 rounded-xl border bg-popover p-3 text-popover-foreground shadow-(--mf-panel-shadow)`}
      style={{ ...(spot ? { left: spot.left, top: spot.top } : {}), transformOrigin: spot?.origin ?? '0% 100%' }}
    >
      <div className="flex items-center gap-2">
        <Chip kind={draft.kind} onClick={() => (chime('settled'), change(draft.key, { kind: draft.kind === 'capture' ? 'nugget' : 'capture' }))} />
        <span className="text-meta text-muted-foreground">{draft.text.trim() === draft.first.trim() ? 'As selected: change it if you like' : 'In your words'}</span>
      </div>
      <textarea
        ref={field}
        rows={1}
        value={draft.text}
        aria-label="The words to keep"
        onChange={(event) => change(draft.key, { text: event.target.value })}
        className="block max-h-[40vh] min-h-5 w-full resize-none overflow-y-auto bg-transparent text-body outline-none [field-sizing:content] placeholder:text-muted-foreground"
        placeholder="What you want to keep"
      />
      {draft.kind === 'nugget' && (
        <input
          value={draft.question}
          aria-label="The question it answers, for review"
          onChange={(event) => change(draft.key, { question: event.target.value })}
          placeholder="The question it answers, for review (optional)"
          className="h-8 w-full rounded-md border border-foreground/10 bg-transparent px-2 text-control outline-none placeholder:text-muted-foreground hover:border-foreground/20 focus:border-foreground/25"
        />
      )}
      <div className="flex items-center justify-end gap-1">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => putAway(draft)}>
          Cancel <Kbd className="ml-1">Esc</Kbd>
        </Button>
        <Button size="sm" onClick={() => void save(draft, ref.current)}>
          Save <Kbd className="ml-1 border-primary-foreground/30 bg-transparent text-primary-foreground/80">⌘↵</Kbd>
        </Button>
      </div>
    </motion.div>
  )
}

/** A card put away, waiting in the corner: its kind and first words. A click opens it again. */
function Waiting({ draft }: { draft: Draft }): React.JSX.Element {
  const { icon: Icon, hue, label } = KINDS[draft.kind]
  const quick = still()
  return (
    <motion.div
      layout={quick ? false : 'position'}
      initial={{ opacity: 0, transform: shift('translateY(6px) scale(0.96)') }}
      animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
      exit={{ opacity: 0, transform: shift('scale(0.96)'), transition: { duration: quick ? 0 : 0.12 } }}
      transition={{ duration: quick ? 0 : 0.16, ease: EASE }}
      data-reword-draft={draft.key}
      className="group flex h-8 max-w-[min(280px,calc(100vw-32px))] items-center rounded-lg border bg-popover text-control shadow-(--mf-panel-shadow)"
      style={{ transformOrigin: '0% 100%' }}
    >
      <button type="button" aria-label={`Open the ${label.toLowerCase()} draft`} onClick={() => (chime('open'), drafts.forEach((one) => release(one)), set(drafts.map((one) => ({ ...one, open: one.key === draft.key, anchor: null }))))}
        className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-l-lg pl-2 pr-1 text-left hover:bg-accent/60 [&_svg]:size-3.5 [&_svg]:shrink-0">
        <span style={{ color: hue }}><Icon /></span>
        <span className="truncate">{draft.text.trim() || 'Empty draft'}</span>
      </button>
      <button type="button" aria-label="Let this draft go" onClick={() => discard(draft)}
        className="flex h-full w-7 shrink-0 items-center justify-center rounded-r-lg text-muted-foreground hover:bg-accent/60 hover:text-foreground">
        <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l6 6M9 3l-6 6" /></svg>
      </button>
    </motion.div>
  )
}

/** Inside the bottom left corner of the note on screen; the window's corner when there is none. */
function stackSpot(): React.CSSProperties | undefined {
  // Split, the note in the front pane.
  const note = [...document.querySelectorAll<HTMLElement>('[data-pane-front] .mindflow-editor-content'), ...document.querySelectorAll<HTMLElement>('.mindflow-editor-content')].map((one) => one.getBoundingClientRect()).find((at) => at.width > 200 && at.height > 120)
  if (!note) return undefined
  return { left: Math.max(16, note.left + 12), bottom: Math.max(16, innerHeight - Math.min(note.bottom, innerHeight) + 12) }
}

function Layer(): React.JSX.Element {
  // Placed again as the window changes size.
  const [, redraw] = useState(0)
  useEffect(() => {
    const again = (): void => redraw((n) => n + 1)
    addEventListener('resize', again)
    return () => removeEventListener('resize', again)
  }, [])
  const all = useSyncExternalStore((tell) => (told.add(tell), () => void told.delete(tell)), () => drafts)
  const by = all.find((one) => one.open && one.anchor)
  const corner = all.filter((one) => one !== by)
  return (
    <MotionConfig reducedMotion="user">
      {/* The selection bar steps aside while a card sits by the words; the words stay highlighted. */}
      {by && <style>{'.tiptap-toolbar[data-variant="floating"] { visibility: hidden; }'}</style>}
      <AnimatePresence>{by && <Card key={by.key} draft={by} by />}</AnimatePresence>
      {/* The stack: the bottom left of the note on screen, clear of the toasts in the middle and the window's own footer. */}
      {/* Counted as a panel (data-slot), so a toast comes up clear of it rather than under it. */}
      <div data-reword-stack="" data-slot="popover-content" aria-label="Drafts waiting" style={corner.length ? stackSpot() : undefined} className="pointer-events-none fixed bottom-4 left-4 z-[55] flex flex-col-reverse items-start gap-1.5 *:pointer-events-auto">
        <AnimatePresence initial={false}>
          {corner.map((one) => (one.open ? <Card key={one.key} draft={one} by={false} /> : <Waiting key={one.key} draft={one} />))}
        </AnimatePresence>
      </div>
    </MotionConfig>
  )
}

let mounted = false
/** Drawn in a layer of its own, the same in every window. */
function mount(): void {
  if (mounted) return
  mounted = true
  const root = document.createElement('div')
  root.id = 'vigil-reword'
  document.body.append(root)
  createRoot(root).render(<Layer />)
}

// Cards left waiting when this window last closed.
try {
  const kept = JSON.parse(localStorage.getItem(STORE) ?? '[]') as Draft[]
  if (kept.length) {
    drafts = kept.map((one) => ({ ...one, anchor: null, open: false }))
    if (document.body) mount()
    else addEventListener('DOMContentLoaded', mount, { once: true })
  }
} catch { /* nothing kept */ }

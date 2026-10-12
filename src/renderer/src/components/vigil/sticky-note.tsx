import { Tape } from './tape'
import { currentVim, onVimChange } from '@/lib/vim'
import { Suspense, createContext, lazy, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import type { JSONContent } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { alive } from '@/components/ui/alive-icon'
import XIcon from '@/components/ui/x-icon'
import { AliveIcon } from '@/components/ui/alive-icon'
import ExternalLinkIcon from '@/components/ui/external-link-icon'
import { Minus } from 'lucide-react'

import '@/assets/styles/_variables.scss'
// The checkbox a to-do has in a note, so a ticked box looks the same here.
import '@/components/tiptap-node/list-node/list-node.scss'
import './sticky-note.scss'
import { glance } from './note-preview'
import { captionOf } from '@/components/image/image-look'
import { Rolling, toast } from './ui'
import { chime, paper } from '@/lib/sound'
import { useAppearance, useLive, vigil } from '@/lib/vigil'
import { toMarkdown } from '@/lib/export'
import { useSameWords } from '@/lib/same-words'
import { StickyCelebration, type Moment } from './celebrate'
import { SandboxStamp } from '@/components/vigil/sandbox'
import { Frost } from './frost'
import { Signed } from './signature'

// The editor only once you edit: at rest a sticky is just the light drawing below.
const MindflowEditor = lazy(() => import('@/components/mindflow').then((one) => ({ default: one.MindflowEditor })))

// itshover drawings in lucide's place, moving when their control is pointed at.
const X = alive(XIcon)

export const DRAG = { WebkitAppRegion: 'drag' } as CSSProperties
export const STILL = { WebkitAppRegion: 'no-drag' } as CSSProperties
const LIST: CSSProperties = { marginBlock: '0.25rem', paddingLeft: '1rem' }

/** Made as real glass (the setting): the Mac's blur behind, the note sitting straight. */
export const GLASS = new URLSearchParams(location.search).has('glass')
/**
 * Each note's own lean, 1.2 to 3 degrees, sized from its id so it is the same
 * every launch; which way goes by its place in line, so neighbours lean apart.
 */
export const tiltOf = (id: string, nth: number): number => {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0
  const lean = 1.2 + (Math.abs(hash) % 19) / 10
  return nth % 2 ? lean : -lean
}

type Node = { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string }[]; content?: Node[] }
/** A to-do in the note: whether it is done, its words, and where it sits (a path in the doc, or a line of Markdown). */
type Todo = { done: boolean; text: string; at: number[] }

const words = (node: Node): string => node.text ?? (node.content ?? []).map(words).join('')

/**
 * A note never opened in the editor is still Markdown: read just enough of it
 * to draw (headings, lists, to-dos, paragraphs), each to-do remembering its line.
 */
const fromMarkdown = (markdown: string): Node => {
  const para = (text: string): Node => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })
  const content: Node[] = []
  markdown.split('\n').forEach((line, at) => {
    const task = /^\s*[-*+]\s+\[([ xX])\]\s?(.*)$/.exec(line)
    const bullet = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line)
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    const kind = task ? 'taskList' : bullet ? (/\d/.test(bullet[1]) ? 'orderedList' : 'bulletList') : null
    const item: Node | null = task
      ? { type: 'taskItem', attrs: { checked: task[1] !== ' ', line: at }, content: [para(task[2])] }
      : bullet ? { type: 'listItem', content: [para(bullet[2])] } : null
    const last = content[content.length - 1]
    if (item && last?.type === kind) last.content!.push(item)
    else if (item) content.push({ type: kind!, content: [item] })
    else if (heading) content.push({ type: 'heading', content: [{ type: 'text', text: heading[2] }] })
    else if (line.trim()) content.push(para(line.trim()))
  })
  return { type: 'doc', content }
}

/** Every to-do in the doc, in reading order. */
const todosOf = (doc: Node, path: number[] = []): Todo[] =>
  (doc.content ?? []).flatMap((child, at) => [
    ...(child.type === 'taskItem' ? [{ done: !!child.attrs?.checked, text: words(child.content?.[0] ?? {}), at: [...path, at] }] : []),
    ...todosOf(child, [...path, at])
  ])

/**
 * The body with one to-do set done or not. Found by its place, or by its words
 * when the note has moved on around it; null when it is gone.
 */
const withTodo = (body: unknown, todo: Todo, done: boolean): unknown => {
  if (typeof body === 'string') {
    const lines = body.split('\n')
    const doc = fromMarkdown(body)
    const all = todosOf(doc)
    const same = all.find((one) => one.at.join() === todo.at.join() && one.text === todo.text) ?? all.find((one) => one.text === todo.text)
    if (!same) return null
    let node: Node = doc
    for (const at of same.at) node = node.content![at]
    const line = node.attrs!.line as number
    lines[line] = lines[line].replace(/\[[ xX]\]/, done ? '[x]' : '[ ]')
    return lines.join('\n')
  }
  const doc = structuredClone(body) as Node
  const all = todosOf(doc)
  const same = all.find((one) => one.at.join() === todo.at.join() && one.text === todo.text) ?? all.find((one) => one.text === todo.text)
  if (!same) return null
  let node: Node = doc
  for (const at of same.at) node = node.content![at]
  node.attrs = { ...node.attrs, checked: done }
  return doc
}

/** Words with their bold, italics, strike and code. */
const inline = (node: Node, key: number): ReactNode => {
  if (node.type === 'hardBreak') return <br key={key} />
  if (node.text === undefined) return <span key={key}>{node.type === 'noteLink' ? `@${node.attrs?.label ?? ''}` : (node.content ?? []).map(inline)}</span>
  return (node.marks ?? []).reduce<ReactNode>((inner, mark) =>
    mark.type === 'bold' ? <strong className="font-semibold">{inner}</strong>
      : mark.type === 'italic' ? <em>{inner}</em>
        : mark.type === 'strike' ? <s>{inner}</s>
          : mark.type === 'code' ? <code className="rounded bg-accent px-1 font-mono text-[0.92em]">{inner}</code>
            : inner, <span key={key}>{node.text}</span>)
}

/**
 * The note drawn small: headings, paragraphs, lists, and its to-dos as the
 * editor's own checkboxes, which tick here and save. Not the editor itself:
 * a card that sits on the desktop all day should cost next to nothing.
 */
/** Tasks by id, done or not: a to-do linked to a task (extensions/linked-tasks.ts) shows as its task is. */
const LinkedDone = createContext<Map<string, boolean>>(new Map())

function Body({ node, path, tick }: { node: Node; path: number[]; tick: (at: number[], done: boolean) => void }): ReactNode {
  const linked = useContext(LinkedDone)
  const kids = (node.content ?? []).map((child, at) => <Body key={at} node={child} path={[...path, at]} tick={tick} />)
  switch (node.type) {
    case 'doc': return kids
    // Divs, not <p>: the editor's own paragraph sizes would reach in under its class.
    case 'paragraph': return node.content?.length ? <div data-line className="my-1">{node.content.map(inline)}</div> : null
    case 'heading': return <div className="mt-2.5 mb-1 font-medium text-foreground first:mt-0">{(node.content ?? []).map(inline)}</div>
    // Spacing inline: under a to-do these sit inside the editor's class, whose list margins would otherwise win.
    case 'bulletList': return <ul style={LIST} className="list-disc marker:text-muted-foreground/60">{kids}</ul>
    case 'orderedList': return <ol style={LIST} start={Number(node.attrs?.start) || 1} className="list-decimal marker:text-muted-foreground/60">{kids}</ol>
    // A plain item again, under a to-do: the checklist's own rules make every item below it a flex row with no marker.
    case 'listItem': return <li style={{ display: 'list-item', listStyleType: 'inherit' }} className="[&>[data-line]]:my-0">{kids}</li>
    case 'blockquote': return <blockquote className="my-1 border-l-2 pl-2">{kids}</blockquote>
    case 'codeBlock': return <pre className="my-1 overflow-x-auto rounded bg-accent px-2 py-1 font-mono text-xs">{words(node)}</pre>
    case 'horizontalRule': return <hr className="my-2" />
    // Clicked, it opens in Quick Look (see the scroller's click).
    case 'image': return typeof node.attrs?.src === 'string' ? <img src={node.attrs.src} alt={String(node.attrs.alt ?? '')} draggable={false} /> : null
    // The class the editor's checkbox styles hang from; nothing else of the editor comes with it.
    case 'taskList': return <div className="tiptap ProseMirror my-1"><ul data-type="taskList">{kids}</ul></div>
    case 'taskItem': {
      const task = typeof node.attrs?.taskId === 'string' ? node.attrs.taskId : null
      const done = task && linked.has(task) ? linked.get(task)! : !!node.attrs?.checked
      return (
        <li data-type="taskItem" data-checked={done}>
          {/* Lined up with the first line of the words, at this smaller size. */}
          <label style={{ paddingTop: '0.2em', paddingRight: '0.45em' }}>
            <input type="checkbox" checked={done} onChange={(event) => tick(path, event.target.checked)} aria-label={words(node.content?.[0] ?? {}) || 'To-do'} />
          </label>
          {/* Done stays in place, struck through and dimmed: the strike draws in rather than snapping. */}
          <div className={`[&>[data-line]]:my-0 [&>[data-line]]:line-through [&>[data-line]]:transition-[opacity,text-decoration-color] [&>[data-line]]:duration-300 ${done ? '[&>[data-line]]:decoration-current [&>[data-line]]:opacity-50' : '[&>[data-line]]:decoration-transparent'}`}>{kids}</div>
        </li>
      )
    }
    default: return node.text !== undefined ? inline(node, 0) : kids
  }
}

/** Where a double-click landed in the drawing: the words of its line, and how far into them. */
const spot = (left: number, top: number): { left: number; top: number; line: string; offset: number } => {
  const range = document.caretRangeFromPoint(left, top)
  const line = range?.startContainer.parentElement?.closest('[data-line], li > div, div') as HTMLElement | null
  if (!range || !line) return { left, top, line: '', offset: 0 }
  const before = document.createRange()
  before.setStart(line, 0)
  before.setEnd(range.startContainer, range.startOffset)
  return { left, top, line: line.textContent ?? '', offset: before.toString().length }
}

/** The line a text node sits in: a drawn line or heading, or the editor's paragraph or heading. */
const blockOf = (text: globalThis.Node): Element | null => text.parentElement?.closest('p, h1, h2, h3, h4, h5, h6, div') ?? null
/** Every line with words in the card, in reading order, as [line, its first text]. */
const linesIn = (box: HTMLElement): Element[] => {
  const walk = document.createTreeWalker(box, NodeFilter.SHOW_TEXT)
  const found: Element[] = []
  while (walk.nextNode()) {
    const line = blockOf(walk.currentNode)
    if (line && walk.currentNode.textContent?.trim() && line.getClientRects().length && found.at(-1) !== line) found.push(line)
  }
  return found
}
/** The first line whose bottom is in sight, with how far below the card's top it starts. */
const firstInSight = (box: HTMLElement | null): { text: string; top: number } | null => {
  if (!box) return null
  const top = box.getBoundingClientRect().top
  const line = linesIn(box).find((one) => one.getBoundingClientRect().bottom > top + 1)
  return line ? { text: line.textContent ?? '', top: line.getBoundingClientRect().top - top } : null
}
const lineOf = (box: HTMLElement, text: string): Element | undefined => linesIn(box).find((one) => one.textContent === text)

/** Real glass: the Mac's blur shows through a thin wash of the theme's paper, enough to read on. */
export const PAPER: CSSProperties = GLASS
  ? { backgroundImage: 'linear-gradient(rgb(255 255 255 / 0.05), transparent 40%), linear-gradient(var(--mf-paper-tint), var(--mf-paper-tint)), linear-gradient(color-mix(in oklab, var(--mf-paper) 90%, transparent), color-mix(in oklab, var(--mf-paper) 90%, transparent))' }
  : { backgroundImage: 'linear-gradient(rgb(255 255 255 / 0.05), transparent 40%), linear-gradient(var(--mf-paper-tint), var(--mf-paper-tint)), linear-gradient(var(--mf-paper), var(--mf-paper)), linear-gradient(var(--background), var(--background))', backgroundColor: 'Canvas' }
/**
 * The card itself: on glass, straight with its words lifting on hover; as paper, leaning, and straightening as it lifts.
 * One lift for both, 240ms on one curve, the same as a glass window's own rise (LIFT_MS in main/sticky-place.ts).
 * Picked up by your hand (data-held), it lifts further: paper straightens with a deeper shadow, glass's words rise a little more.
 */
export const CARD = GLASS ? 'group relative flex h-full flex-col rounded-[10px] text-control text-foreground [&>*]:transition-transform [&>*]:duration-240 [&>*]:ease-[cubic-bezier(0.22,1,0.36,1)] hover:[&>*]:-translate-y-0.5 data-held:[&>*]:-translate-y-1! motion-reduce:[&>*]:transition-none' : 'group relative flex h-full rotate-(--tilt) flex-col rounded-lg border text-control text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.14),0_4px_10px_-2px_rgb(0_0_0/0.16)] transition-[rotate,scale,box-shadow] duration-240 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-102 hover:rotate-0 hover:shadow-[0_2px_4px_rgb(0_0_0/0.12),0_10px_18px_-4px_rgb(0_0_0/0.24)] data-held:scale-103! data-held:rotate-0! data-held:shadow-[0_4px_8px_rgb(0_0_0/0.14),0_18px_30px_-6px_rgb(0_0_0/0.3)]! motion-reduce:transition-none'

/**
 * Told now and then to stir (see main), the card lifts a little and settles,
 * as paper does in a draught, so it is seen again. Not while you write in it
 * (a key in the last 15 seconds), nor with Motion off; added to its own lean.
 */
export function stir(card: HTMLElement | null, lastKey: number): void {
  if (!card || Date.now() - lastKey < 15_000 || document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  // The window itself stirs too, as well as what is drawn in it.
  window.api.wiggle()
  // On glass the note is the window, so the paper stays and its words and tape lift instead.
  const moving = GLASS ? [...card.children] : [card]
  for (const one of moving)
    one.animate(
      GLASS
        ? [{ transform: 'translateY(0)' }, { transform: 'translateY(-3px)', offset: 0.3 }, { transform: 'translateY(-1px)', offset: 0.62 }, { transform: 'translateY(0)' }]
        : [{ transform: 'translateY(0) rotate(0deg)' }, { transform: 'translateY(-4px) rotate(1.6deg)', offset: 0.3 }, { transform: 'translateY(-1px) rotate(-0.9deg)', offset: 0.62 }, { transform: 'translateY(0) rotate(0deg)' }],
      { duration: 1200, easing: 'cubic-bezier(0.37, 0, 0.63, 1)', composite: 'add' }
    )
}

/** How long a list stays all ticked before it is celebrated, so an untick straight after takes it back unseen. */
export const GRACE = 2500

/** A sticky's small controls: the theme's ink washed over its own paper on hover, never a grey patch of another material. */
export const STICKY_BUTTON = 'flex h-6 min-w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground'

/** Motion off in Settings, or Reduce motion on: things change at once. */
const stillNow = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The paper colours a sticky can have (its right-click menu; STICKY_TINTS in
 * main): the theme's own colour, made into a pastel and laid over its paper on
 * a light theme, washed thinly into it on a dark one (sticky-note.scss), so
 * each reads as tinted paper, never a printed swatch. Plain is the paper alone.
 */
export const TINT_HUE: Record<string, string> = {
  // The theme's yellow is an ochre, which pales to beige: brightened toward butter first.
  butter: 'color-mix(in oklab, var(--tt-color-text-yellow) 40%, #ffd23f)',
  rose: 'var(--tt-color-text-pink)',
  sage: 'var(--tt-color-text-green)',
  sky: 'var(--tt-color-text-blue)'
}
/** The colour laid over the paper, on the page's root, where the frost reads it too. */
const paintTint = (tint: string | null): void => {
  const root = document.documentElement
  const hue = tint ? TINT_HUE[tint] : undefined
  root.toggleAttribute('data-tint', !!hue)
  if (hue) root.style.setProperty('--mf-tint-hue', hue)
}

/**
 * A sticky's page moving with its window (main): coming in, paper's lean
 * swings a degree past and settles; taken down, the card lifts and turns as it
 * peels; picked up by your hand it lifts (data-held, see CARD), and let go it
 * settles with a soft paper tap; given a colour, the paper changes over 360ms
 * with a paper sound. Nothing moves with Motion off; the sounds still play.
 */
export function useStickyMotion(card: RefObject<HTMLElement | null>, tilt: number): void {
  useEffect(() => {
    // Registered as a colour so a change of tint can glide rather than switch.
    try {
      CSS.registerProperty({ name: '--mf-paper-tint', syntax: '<color>', inherits: true, initialValue: 'transparent' })
    } catch {
      // Already registered.
    }
    paintTint(new URLSearchParams(location.search).get('tint'))
    // As kept now, in case it changed since the window was made (a reload).
    void window.api.stickyTint().then(paintTint)
    document.documentElement.style.transition = stillNow() ? '' : '--mf-paper-tint 360ms cubic-bezier(0.22, 1, 0.36, 1)'
    return window.api.onStickyMotion((what, value) => {
      const el = card.current
      if (what === 'tint') return (paper('slide'), paintTint(String(value)))
      if (!el) return
      const lean = GLASS ? 0 : Math.sign(tilt) || 1
      if (what === 'held') {
        el.toggleAttribute('data-held', Boolean(value))
        if (value) return
        paper('tap')
        if (!stillNow()) el.animate([{ transform: 'scale(0.985)' }, { transform: 'none' }], { duration: 120, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', composite: 'add' })
        return
      }
      if (stillNow()) return
      if (what === 'arrive' && lean)
        el.animate([{ transform: `rotate(${-lean * 1.5}deg)` }, { transform: `rotate(${lean}deg)`, offset: 0.55 }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)', composite: 'add' })
      if (what === 'peel')
        el.animate([{ transform: 'none' }, { transform: `translateY(-10px) rotate(${lean * 3}deg)` }], { duration: 200, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards', composite: 'add' })
    })
  }, [card, tilt])
}

/**
 * A sticky's top line: its title, and at the right its count at rest. Pointed
 * at (or asking "Take down?"), its controls slide in over the count rather
 * than beside it, so the title keeps its room and is the last thing cut
 * short. `slot` sizes the count's place where it gives way first (All done to ✓).
 */
export function StickyHead({ title, count, controls, open, slot = '', titleClass = '' }: { title: ReactNode; count?: ReactNode; controls: ReactNode; open: boolean; slot?: string; titleClass?: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-1 px-3 pt-2">
      <p className={`min-w-0 grow truncate font-medium ${titleClass}`}>{title}</p>
      <SandboxStamp inline />
      <span className={`grid min-w-4 grid-cols-[100%] items-center justify-items-end [grid-template-areas:'slot'] ${open ? 'shrink-0' : `shrink-[1000] group-hover:shrink-0 group-hover:basis-auto ${slot}`}`} style={STILL}>
        {count && <span className={`flex min-w-0 justify-end justify-self-stretch pl-1 transition-opacity duration-200 ease-out [grid-area:slot] group-hover:opacity-0 ${open ? 'opacity-0' : ''}`}>{count}</span>}
        <span className={`grid transition-[grid-template-columns] duration-300 ease-(--mf-ease) [grid-area:slot] group-hover:grid-cols-[1fr] motion-reduce:transition-none ${open ? 'grid-cols-[1fr]' : 'grid-cols-[0fr]'}`}>
          <span className={`flex min-w-0 items-center justify-end overflow-hidden transition-[opacity,translate] duration-300 ease-(--mf-ease) group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none ${open ? 'translate-x-0 opacity-100' : 'translate-x-2 opacity-0'}`}>{controls}</span>
        </span>
      </span>
    </div>
  )
}

/**
 * Its corner grip: the window is not resizable by the system (see stick in
 * main), so the size is sent, once a frame at most; past its limits the
 * window gives a little and springs back when let go (main's sticky:resize).
 */
export function Grip(): React.JSX.Element {
  return (
    <span aria-hidden style={STILL} onPointerDown={(event) => {
      const from = { x: event.clientX, y: event.clientY, width: window.innerWidth, height: window.innerHeight }
      const grip = event.currentTarget
      grip.setPointerCapture(event.pointerId)
      let frame = 0
      let want = { width: from.width, height: from.height }
      grip.onpointermove = (move) => {
        want = { width: from.width + move.screenX - (event.screenX), height: from.height + move.screenY - event.screenY }
        frame ||= requestAnimationFrame(() => ((frame = 0), window.api.resizeSticky(want.width, want.height)))
      }
      grip.onpointerup = grip.onpointercancel = () => {
        cancelAnimationFrame(frame)
        grip.onpointermove = grip.onpointerup = grip.onpointercancel = null
        window.api.resizeSticky(want.width, want.height, true)
      }
    }}
      className="absolute right-0.5 bottom-0.5 flex size-4 cursor-nwse-resize items-end justify-end p-0.5 text-muted-foreground/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
      <svg viewBox="0 0 8 8" className="size-2"><path d="M7 1 1 7M7 4 4 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" /></svg>
    </span>
  )
}

/** Stick a note on the desktop, or take it down, with its own sound; undoable. */
export const stickOnDesktop = (type: string, id: string, on = true): void => {
  chime(on ? 'stick' : 'unstick')
  window.api.stick(type, id, on)
  toast(on ? 'Stuck on the desktop' : 'Taken off the desktop', () => window.api.stick(type, id, !on))
}

/**
 * One note stuck on the desktop: a small card in a window of its own, over
 * everything, in the theme's colours. The card drags anywhere; its words
 * follow every edit, since it reads the note live.
 */
export function StickyNote({ type, id }: { type: string; id: string }): React.JSX.Element | null {
  // Vim keys while editing, when they are on everywhere else.
  const [vimOn, setVimOn] = useState(currentVim)
  useEffect(() => onVimChange(setVimOn), [])
  // Sounds, Motion and tag colours obey Settings here as in any window.
  useAppearance()
  const note = useLive(
    () => (type === 'capture'
      ? window.api.captures.get(id).then((found) => found && { title: found.title || '', body: found.body, private: !!found.private, tier: 'capture', who: found.kind === 'quote' ? found.attribution : null, binned: found.status === 'discarded' })
      : vigil.item(id).then((found) => found && { title: found.title, body: found.body, private: !!found.private, tier: found.tier as string, who: found.kind === 'quote' ? found.attribution : null, binned: !!(found as { binnedAt?: string | null }).binnedAt })),
    undefined as { title: string; body: unknown; private: boolean; tier: string; who: string | null; binned: boolean } | null | undefined,
    [type, id]
  )
  // A see-through window: only the card is drawn.
  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    // For the styles that keep the editor's picture controls out of a card this small.
    document.body.dataset.sticky = GLASS ? 'glass' : 'paper'
  }, [])
  // Taking it down: the first press asks, the second peels it off, and the
  // window in sight offers "Put it back". Moving away, or Esc, lets the question go.
  const [asking, setAsking] = useState(false)
  const titleNow = useRef('')
  const takeDown = (): void => {
    if (!asking) return (chime('tap'), setAsking(true))
    chime('unstick')
    window.api.takeDownSticky(titleNow.current)
  }
  // ⌘W does just what its X does (the window has no close of its own, so macOS would not).
  const keyDown = useRef(takeDown)
  keyDown.current = takeDown
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && asking) return (event.preventDefault(), setAsking(false))
      if (!event.metaKey || event.key.toLowerCase() !== 'w') return
      event.preventDefault()
      keyDown.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [asking])
  // Its note put in the Bin (or deleted for good) since it was stuck: the card
  // greys over 300ms and says so, with the way back while it can be had; four
  // seconds on, it peels off the desktop. Brought back in time, it stays.
  const gone = note === null ? 'deleted' : note?.binned ? 'bin' : null
  useEffect(() => {
    if (!gone) return
    const timer = setTimeout(() => window.api.stick(type, id, false), gone === 'bin' ? 4000 : 2500)
    return () => clearTimeout(timer)
  }, [gone, type, id])
  const card = useRef<HTMLDivElement>(null)
  const tilt = tiltOf(id, Number(new URLSearchParams(location.search).get('nth')) || 0)
  useStickyMotion(card, GLASS ? 0 : tilt)
  // A box ticked here shows at once; the stored note takes over when it comes back.
  // Kept with the words it was ticked on, so any newer read drops it.
  const [ticked, setTicked] = useState<{ on: unknown; body: unknown }>()
  const body = ticked && ticked.on === note?.body ? ticked.body : note?.body
  const doc: Node = typeof body === 'string' ? fromMarkdown(body) : ((body as Node) ?? { type: 'doc' })
  // Double-click or E edits it in place; Esc or clicking away puts it back.
  // The words it opened on, held, so a save elsewhere does not rebuild the editor under the caret.
  const [editing, setEditing] = useState<{ body: unknown; at?: { left: number; top: number; line: string; offset: number } } | null>(null)
  const area = useRef<HTMLDivElement>(null)
  // The picture out in the look window: its place here stands empty till it comes back.
  const out = useRef<HTMLImageElement | null>(null)
  // Told now and then to stir (see main): it lifts a little and settles, as
  // paper does in a draught, so it is seen again. Not while you write in it,
  // nor with Motion off; added to its own lean, never instead of it.
  const lastKey = useRef(0)
  useEffect(() => {
    const note = (): void => void (lastKey.current = Date.now())
    window.addEventListener('keydown', note, true)
    return () => window.removeEventListener('keydown', note, true)
  }, [])
  useEffect(() => window.api.onStir(() => stir(card.current, lastKey.current)), [])
  useEffect(() => window.api.onLookOver(() => {
    if (out.current) out.current.style.visibility = ''
    out.current = null
  }), [])
  /** The note's pictures to the look window, each with its place on screen when all of it is in view. */
  const lookFrom = (img: HTMLImageElement): void => {
    const box = area.current
    if (!box || out.current) return
    const all = [...box.querySelectorAll('img')].filter((one) => one.naturalWidth > 0 && !one.dataset.missing && !one.closest("[data-type='emoji'], .tiptap-bookmark-image"))
    const at = all.indexOf(img)
    if (at < 0) return
    const view = box.getBoundingClientRect()
    const pictures = all.map((one) => {
      const r = one.getBoundingClientRect()
      const seen = r.width > 0 && r.top >= view.top - 1 && r.bottom <= view.bottom + 1
      return { src: one.currentSrc || one.src, width: one.naturalWidth, height: one.naturalHeight, caption: captionOf(one),
        rect: seen ? { x: window.screenX + r.left, y: window.screenY + r.top, width: r.width, height: r.height } : undefined }
    })
    out.current = img
    img.style.visibility = 'hidden'
    window.api.look(pictures, at)
  }
  // The first line in sight as editing starts or ends, so the same words stay at the top after the swap.
  const held = useRef<{ text: string; top: number } | null>(null)
  const hold = (): void => void (held.current = firstInSight(area.current))
  // Drawn from the editor's words at once: the store has them only once the save lands.
  const writing = useRef<{ destroyed: boolean; doc: () => unknown } | null>(null)
  const leave = (): void => {
    hold()
    if (writing.current && !writing.current.destroyed && note) setTicked({ on: note.body, body: writing.current.doc() })
    setEditing(null)
  }
  useLayoutEffect(() => {
    const box = area.current
    const was = held.current
    held.current = null
    const now = was && box && lineOf(box, was.text)
    if (now) box.scrollTop += now.getBoundingClientRect().top - box.getBoundingClientRect().top - was.top
  }, [editing])
  // While editing, the first line stays hidden as long as it only repeats the title and the caret is elsewhere.
  const [hideFirst, setHideFirst] = useState(false)
  const titled = useRef('')
  const typed = useSameWords(type === 'capture' ? 'captures' : 'nuggets', editing ? id : undefined, editing?.body, (at, next, base, editor) =>
    type === 'capture'
      ? window.api.captures.save(at, { body: next as never, base, ...(editor ? { markdown: toMarkdown(editor) } : {}) })
      : vigil.saveItem(at, { body: next, base }))
  // A double-click says where: the caret goes there. E starts at the end.
  const edit = (at?: { left: number; top: number; line: string; offset: number }): void => {
    if (!note || editing) return
    setHideFirst(twice)
    hold()
    setEditing({ body: note.body, at })
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (editing && event.key === 'Escape') {
        // With Vim keys, the first Escape is Vim's (back to normal mode); one
        // more from normal mode leaves editing, as Escape does without Vim.
        const mode = document.querySelector('.tiptap.ProseMirror[data-vim-mode]')?.getAttribute('data-vim-mode')
        if (mode && mode !== 'normal') return
        return (event.preventDefault(), leave())
      }
      if (!editing && event.key.toLowerCase() === 'e' && !(event.target as Element | null)?.closest?.('textarea, input:not([type=checkbox]), [contenteditable="true"]'))
        return (event.preventDefault(), edit())
    }
    const onDown = (event: PointerEvent): void => void (editing && !area.current?.contains(event.target as globalThis.Node) && leave())
    const away = (): void => void (editing && leave())
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('blur', away)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('blur', away)
    }
  })
  const todos = todosOf(doc)
  // Linked to-dos as their tasks are, ticked anywhere.
  const tasks = useLive(vigil.tasks, [] as Awaited<ReturnType<typeof vigil.tasks>>)
  const linkedDone = new Map(tasks.filter((one) => one.status !== 'dropped').map((one) => [one.id, one.status === 'done']))
  const left = todos.filter((todo) => !todo.done).length
  // A list of two or more going from not all ticked to all ticked, here or in
  // the note elsewhere, is celebrated once it has stayed so a moment. One all
  // ticked when the sticky opens is not; main says whether one may show now.
  const allDone = todos.length >= 2 && !left
  const wasDone = useRef<boolean | undefined>(undefined)
  const [cheer, setCheer] = useState<Moment | null>(null)
  const loaded = note !== undefined
  useEffect(() => {
    if (!loaded) return
    const before = wasDone.current
    wasDone.current = allDone
    if (before !== false || !allDone) return
    const timer = setTimeout(() => void vigil.stickyDone(id).then((moment) => moment && setCheer(moment)), GRACE)
    return () => clearTimeout(timer)
  }, [allDone, loaded, id])
  // A single to-do ticked here or elsewhere gets a small "Done" of its own: its
  // sound, and the word in green with a glint, not the whole celebration.
  // One already ticked when the sticky opens is not news.
  const oneDone = todos.length === 1 && !left
  const wasOne = useRef<boolean | undefined>(undefined)
  const [glint, setGlint] = useState(0)
  useEffect(() => {
    if (!loaded) return
    const before = wasOne.current
    wasOne.current = oneDone
    if (before === false && oneDone) (chime('done'), setGlint(Date.now()))
  }, [oneDone, loaded])
  if (note === undefined) return null
  // The note's own title, or else its first line alone: never the whole note run together.
  const first = doc.content?.[0]
  const opening = first ? glance(first).trim() : ''
  const title = note?.title || opening.slice(0, 80) || 'Untitled'
  // The title is not said twice: a first line that is the title is left out below it.
  const twice = !!opening && opening === title
  titled.current = title
  titleNow.current = title
  // Nothing written yet below its title: where to start.
  const empty = !(doc.content ?? []).some((child, at) => (at || !twice) && (child.type !== 'paragraph' || !!child.content?.length))

  // Saved as the main window saves: only over the words it was drawn from.
  // Changed elsewhere first, the tick is made again on what is there now.
  const tick = (at: number[], done: boolean): void => {
    const todo = todos.find((one) => one.at.join() === at.join())
    if (!todo) return
    // A line that is a task too: the task ticks with it.
    let item: Node | undefined = doc
    for (const step of at) item = item?.content?.[step]
    const task = typeof item?.attrs?.taskId === 'string' ? item.attrs.taskId : null
    if (task) {
      if (done) void vigil.doneTask(task)
      else void vigil.task(task).then((one) => one?.status === 'done' && vigil.undoneTask(task, { dueAt: one.dueAt, doneAt: one.completedAt ?? new Date().toISOString(), notifiedAt: new Date().toISOString(), deadlineAt: one.deadline }))
    }
    const save = (base: unknown, next: unknown): Promise<{ conflict?: boolean; body?: unknown } | undefined> =>
      (type === 'capture'
        ? window.api.captures.save(id, { body: next as never, base, ...(typeof next === 'string' ? { markdown: next } : {}) })
        : vigil.saveItem(id, { body: next, base })) as Promise<{ conflict?: boolean; body?: unknown } | undefined>
    const next = withTodo(body, todo, done)
    if (next === null) return
    setTicked({ on: note?.body, body: next })
    void save(body, next).then((answer) => {
      if (!answer?.conflict) return
      const again = withTodo(answer.body, todo, done)
      if (again === null) return void setTicked(undefined)
      setTicked({ on: note?.body, body: again })
      void save(answer.body, again)
    })
  }

  const drawn = <LinkedDone.Provider value={linkedDone}>{(doc.content ?? []).map((child, at) => (at || !twice) && <Body key={at} node={child} path={[at]} tick={tick} />)}</LinkedDone.Provider>

  return (
    // Room all round for the lean, the lift and the shadow, so none of it is cut off at the window's edge.
    <div className={GLASS ? 'h-screen' : 'h-screen p-5'}>
      <div
        ref={card}
        // Pointed at, a glass note's window rises a little (main sets it down); paper lifts in its own window.
        onPointerEnter={() => GLASS && window.api.lift()}
        data-private={note?.private ? '' : undefined}
        // Paper: solid, as the timer pill is (a glass theme's colours would let the desktop show through),
        // the theme's own paper (--mf-paper, sticky-note.scss), warmed a little by its own yellow (or the colour you gave it) and lit from the top. Frosted (the setting), <Frost> lays the blurred desktop under it. Leans its own way; pointed at, it straightens and lifts.
        style={{
          ...DRAG,
          '--tilt': GLASS ? '0deg' : `${tilt}deg`,
          ...PAPER
        } as unknown as CSSProperties}
        onMouseLeave={() => setAsking(false)}
        className={CARD}
      >
        {/* Frosted: the desktop picture behind it, blurred, under the same paper. */}
        {!GLASS && <Frost tint="--mf-paper-tint" lift />}
        <SandboxStamp />
        {/* The strip of tape that holds it up. */}
        <Tape inside={GLASS} />
        <StickyHead title={title} titleClass="private-text" open={asking}
          // "All done" gives way first when the title needs the room, down to a ✓.
          slot={todos.length > 0 && !left ? 'basis-15' : ''}
          count={todos.length > 0 && (left ? (
            // How far through its to-dos: green once all are done, settling rather than celebrating.
            <span className="text-xs text-muted-foreground tabular-nums" aria-label={`${todos.length - left} of ${todos.length} done`}>
              <Rolling text={`${todos.length - left}/${todos.length}`} by="word" />
            </span>
          ) : (
            <span key={glint} className={`@container flex w-full justify-end text-xs whitespace-nowrap text-(--tt-color-text-green) ${glint ? 'mf-sticky-glint' : ''}`} aria-label={todos.length === 1 ? 'Done' : 'All done'}>
              <span className="hidden @min-[3.25rem]:inline"><Rolling text={todos.length === 1 ? 'Done' : 'All done'} by="word" /></span>
              <span className="@min-[3.25rem]:hidden">✓</span>
            </span>
          ))}
          controls={<>
            <button type="button" title="Open it in Vigil (⌥-click: and take it down)" aria-label="Open it"
              onClick={(event) => (chime('open'), window.api.openSticky(note?.tier ?? type, id, title, event.altKey))} className={STICKY_BUTTON}>
              <AliveIcon icon={ExternalLinkIcon} size={14} />
            </button>
            <button type="button" title="Hide this one till sticky notes are next shown  ⌃⌥⌘N" aria-label="Hide this one"
              onClick={() => (chime('tuck'), window.api.hideSticky(type, id))} className={STICKY_BUTTON}>
              <Minus className="size-3.5" strokeWidth={2.25} />
            </button>
            <button type="button" title="Take it off the desktop  ⌘W" aria-label="Take it off the desktop" onClick={takeDown}
              className={`${STICKY_BUTTON} gap-1 ${asking ? 'w-auto px-1.5 text-xs text-foreground' : ''}`}>
              {asking && <Rolling by="word" text="Take down?" />}
              <X className="size-3.5" />
            </button>
          </>} />
        {/* A long note scrolls, and fades out at the bottom as the box does, instead of stopping hard at the edge. */}
        <div ref={area} data-hide-first={(editing && hideFirst) || undefined}
          // Scrolled down, the top fades as the bottom does (see sticky-note.scss), so nothing is cut flat.
          onScroll={(event) => event.currentTarget.toggleAttribute('data-scrolled', event.currentTarget.scrollTop > 0)}
          onDoubleClick={(event) => !(event.target as Element).closest('input, img') && edit(spot(event.clientX, event.clientY))}
          // A picture opens in Vigil's Quick Look, over the whole screen, edited or not.
          onClick={(event) => event.target instanceof HTMLImageElement && lookFrom(event.target)}
          // The editor's own double-click and Space would open its viewer inside this small window instead.
          onDoubleClickCapture={(event) => event.target instanceof HTMLImageElement && event.stopPropagation()}
          onKeyDownCapture={(event) => {
            const picked = area.current?.querySelector('img.ProseMirror-selectednode')
            if (event.key !== ' ' || !(picked instanceof HTMLImageElement)) return
            event.preventDefault()
            event.stopPropagation()
            lookFrom(picked)
          }}
          className="sticky-text private-text min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-6 text-muted-foreground [mask-image:linear-gradient(to_bottom,#000_calc(100%-1.75rem),transparent)]" style={STILL}>
          {editing ? (
            // The note's own editor, small and bare: no handles, toolbar or slash menu, saving as you type.
            <Suspense fallback={drawn}>
              <div className="[&_.tiptap-word-count]:hidden">
                <MindflowEditor defaultContent={(editing.body as JSONContent | string | null) ?? ''} host={window.api} placeholder="Write…"
                  toolbar={false} handles={false} slash={false} outline={false} search={false} vim={vimOn} smoothScroll={false} autofocus={editing.at ? false : 'end'}
                  onReady={(editor) => {
                    typed.ready(editor)
                    writing.current = { get destroyed() { return editor.isDestroyed }, doc: () => editor.getJSON() }
                    // The page keeps a third of the window clear round the caret, more than this card has:
                    // every key scrolled it one way, then the other. Here it moves only as far as keeps the caret in sight, above the fade.
                    editor.registerPlugin(new Plugin({ props: { handleScrollToSelection: (view) => {
                      const box = area.current
                      if (!box) return false
                      const caret = view.coordsAtPos(view.state.selection.head)
                      const { top, bottom } = box.getBoundingClientRect()
                      if (caret.top < top + 8) box.scrollTop -= top + 8 - caret.top
                      else if (caret.bottom > bottom - 32) box.scrollTop += caret.bottom - bottom + 32
                      return true
                    } } }))
                    const hide = (): void => {
                      const { doc, selection } = editor.state
                      setHideFirst(doc.childCount > 1 && doc.firstChild!.textContent.trim() === titled.current && selection.$from.index(0) > 0)
                    }
                    hide()
                    editor.on('transaction', hide)
                    const at = editing.at
                    // Once laid out, the spot clicked on the drawing, in the editor; the end when it lands on nothing.
                    // The drawing hides a first line that repeats the title, so the same words are looked for
                    // before the point is: the line clicked, then that many letters in.
                    if (at) requestAnimationFrame(() => {
                      if (editor.isDestroyed) return
                      let pos: number | undefined
                      editor.state.doc.descendants((node, start) => {
                        if (pos === undefined && node.isTextblock && node.textContent === at.line) pos = start + 1 + Math.min(at.offset, node.content.size)
                        return pos === undefined
                      })
                      editor.chain().focus(pos ?? editor.view.posAtCoords(at)?.pos ?? 'end').run()
                    })
                  }} onChange={typed.save} />
              </div>
            </Suspense>
          ) : <>
            {drawn}
            {/* Nothing written yet: where to start, in the card's own dimmed words. */}
            {empty && !gone && <p className="my-1 text-muted-foreground/80">Double-click to write here.</p>}
            {/* A quote signed under its words, in a pen's hand. */}
            {note?.who && <p className="mt-1.5"><Signed who={note.who} /></p>}
          </>}
        </div>
        {/* Its note gone to the Bin (or for good): the card greys, says so with the way back, then peels off. */}
        <div aria-live="polite"
          className={`absolute inset-0 z-10 flex flex-col items-start justify-end gap-1.5 rounded-[inherit] px-3 pb-3 transition-opacity duration-300 ease-out motion-reduce:transition-none ${gone ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          // The paper itself, washed grey over its words: the same material, faded, not a panel laid over it.
          style={{ ...STILL, backgroundImage: 'linear-gradient(color-mix(in oklab, color-mix(in oklab, var(--mf-paper) 86%, var(--muted-foreground)) 84%, transparent), color-mix(in oklab, color-mix(in oklab, var(--mf-paper) 86%, var(--muted-foreground)) 84%, transparent))' }}>
          {gone && <>
            <p className="text-control leading-snug font-medium text-foreground">{gone === 'bin' ? 'This note went to the Bin' : 'This note was deleted'}</p>
            {gone === 'bin' && (
              <button type="button" onClick={() => (chime('back'), void vigil.restore(note?.tier ?? type, id))}
                className="rounded-md px-1.5 py-0.5 -ml-1.5 text-control font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:bg-foreground/8 hover:decoration-foreground/60">
                Bring it back
              </button>
            )}
          </>}
        </div>
        {/* Its size, from the corner: shown on hover. */}
        <Grip />
        {cheer && <StickyCelebration moment={cheer} onDone={() => setCheer(null)} />}
      </div>
    </div>
  )
}

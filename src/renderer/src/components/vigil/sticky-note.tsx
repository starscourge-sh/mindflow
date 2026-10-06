import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { alive } from '@/components/ui/alive-icon'
import XIcon from '@/components/ui/x-icon'
import { AliveIcon } from '@/components/ui/alive-icon'
import ExternalLinkIcon from '@/components/ui/external-link-icon'

import '@/assets/styles/_variables.scss'
// The checkbox a to-do has in a note, so a ticked box looks the same here.
import '@/components/tiptap-node/list-node/list-node.scss'
import { glance } from './note-preview'
import { Rolling, toast } from './ui'
import { chime } from '@/lib/sound'
import { useAppearance, useLive, vigil } from '@/lib/vigil'

// itshover drawings in lucide's place, moving when their control is pointed at.
const X = alive(XIcon)

const DRAG = { WebkitAppRegion: 'drag' } as CSSProperties
const STILL = { WebkitAppRegion: 'no-drag' } as CSSProperties

/**
 * Each note's own lean, 1.2 to 3 degrees, sized from its id so it is the same
 * every launch; which way goes by its place in line, so neighbours lean apart.
 */
const tiltOf = (id: string, nth: number): number => {
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
function Body({ node, path, tick }: { node: Node; path: number[]; tick: (at: number[], done: boolean) => void }): ReactNode {
  const kids = (node.content ?? []).map((child, at) => <Body key={at} node={child} path={[...path, at]} tick={tick} />)
  switch (node.type) {
    case 'doc': return kids
    // Divs, not <p>: the editor's own paragraph sizes would reach in under its class.
    case 'paragraph': return node.content?.length ? <div data-line className="my-1">{node.content.map(inline)}</div> : null
    case 'heading': return <div className="mt-2.5 mb-1 font-medium text-foreground first:mt-0">{(node.content ?? []).map(inline)}</div>
    case 'bulletList': return <ul className="my-1 list-disc pl-4 marker:text-muted-foreground/60">{kids}</ul>
    case 'orderedList': return <ol start={Number(node.attrs?.start) || 1} className="my-1 list-decimal pl-4 marker:text-muted-foreground/60">{kids}</ol>
    case 'listItem': return <li className="[&>[data-line]]:my-0">{kids}</li>
    case 'blockquote': return <blockquote className="my-1 border-l-2 pl-2">{kids}</blockquote>
    case 'codeBlock': return <pre className="my-1 overflow-x-auto rounded bg-accent px-2 py-1 font-mono text-xs">{words(node)}</pre>
    case 'horizontalRule': return <hr className="my-2" />
    case 'image': return null
    // The class the editor's checkbox styles hang from; nothing else of the editor comes with it.
    case 'taskList': return <div className="tiptap ProseMirror my-1"><ul data-type="taskList">{kids}</ul></div>
    case 'taskItem': {
      const done = !!node.attrs?.checked
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
  // Sounds, Motion and tag colours obey Settings here as in any window.
  useAppearance()
  const note = useLive(
    () => (type === 'capture'
      ? window.api.captures.get(id).then((found) => found && { title: found.title || '', body: found.body, private: !!found.private, tier: 'capture' })
      : vigil.item(id).then((found) => found && { title: found.title, body: found.body, private: !!found.private, tier: found.tier as string })),
    undefined as { title: string; body: unknown; private: boolean; tier: string } | null | undefined,
    [type, id]
  )
  // A see-through window: only the card is drawn.
  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [])
  // Taking it down closes this window, so no toast here could undo it: the
  // first press asks, the second takes it down. Moving away lets the question go.
  const [asking, setAsking] = useState(false)
  // ⌘W takes it down as its X does: the window has no close of its own, so macOS would not.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || event.key.toLowerCase() !== 'w') return
      event.preventDefault()
      chime('unstick')
      window.api.stick(type, id, false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [type, id])
  // Deleted since it was stuck: nothing left to show, so it comes down.
  useEffect(() => void (note === null && window.api.stick(type, id, false)), [note, type, id])
  // A box ticked here shows at once; the stored note takes over when it comes back.
  // Kept with the words it was ticked on, so any newer read drops it.
  const [ticked, setTicked] = useState<{ on: unknown; body: unknown }>()
  const body = ticked && ticked.on === note?.body ? ticked.body : note?.body
  const doc: Node = typeof body === 'string' ? fromMarkdown(body) : ((body as Node) ?? { type: 'doc' })
  const todos = todosOf(doc)
  const left = todos.filter((todo) => !todo.done).length
  if (!note) return null
  const text = glance(note.body).trim()
  const title = note.title || text.split('\n')[0].slice(0, 80) || 'Untitled'
  // The title is not said twice: a first line that is the title is left out below it.
  const first = doc.content?.[0]
  const twice = !!first && words(first).trim() === title

  // Saved as the main window saves: only over the words it was drawn from.
  // Changed elsewhere first, the tick is made again on what is there now.
  const tick = (at: number[], done: boolean): void => {
    const todo = todos.find((one) => one.at.join() === at.join())
    if (!todo) return
    const save = (base: unknown, next: unknown): Promise<{ conflict?: boolean; body?: unknown } | undefined> =>
      (type === 'capture'
        ? window.api.captures.save(id, { body: next as never, base, ...(typeof next === 'string' ? { markdown: next } : {}) })
        : vigil.saveItem(id, { body: next, base })) as Promise<{ conflict?: boolean; body?: unknown } | undefined>
    const next = withTodo(body, todo, done)
    if (next === null) return
    setTicked({ on: note.body, body: next })
    void save(body, next).then((answer) => {
      if (!answer?.conflict) return
      const again = withTodo(answer.body, todo, done)
      if (again === null) return void setTicked(undefined)
      setTicked({ on: note.body, body: again })
      void save(answer.body, again)
    })
  }

  return (
    // Room all round for the lean, the lift and the shadow, so none of it is cut off at the window's edge.
    <div className="h-screen p-5">
      <div
        data-private={note.private ? '' : undefined}
        // Paper: solid, as the timer pill is (a glass theme's colours would let the desktop show through),
        // warmed a little and lit from the top. Leans its own way; pointed at, it straightens and lifts.
        style={{
          ...DRAG,
          '--tilt': `${tiltOf(id, Number(new URLSearchParams(location.search).get('nth')) || 0)}deg`,
          backgroundImage: 'linear-gradient(rgb(255 255 255 / 0.05), transparent 40%), linear-gradient(rgb(240 190 80 / 0.09), rgb(240 190 80 / 0.09)), linear-gradient(var(--popover), var(--popover)), linear-gradient(var(--background), var(--background))',
          backgroundColor: 'Canvas'
        } as CSSProperties}
        onMouseLeave={() => setAsking(false)}
        className="group relative flex h-full rotate-(--tilt) flex-col rounded-lg border text-control text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.14),0_4px_10px_-2px_rgb(0_0_0/0.16)] transition-[rotate,scale,box-shadow] duration-500 ease-[cubic-bezier(0.34,1.36,0.64,1)] hover:scale-102 hover:rotate-0 hover:shadow-[0_2px_4px_rgb(0_0_0/0.12),0_10px_18px_-4px_rgb(0_0_0/0.24)] motion-reduce:transition-none"
      >
        {/* A strip of tape holding it up. */}
        <span aria-hidden className="pointer-events-none absolute -top-2 left-1/2 h-4 w-14 -translate-x-1/2 -rotate-2 rounded-[2px] bg-[color-mix(in_oklab,var(--foreground)_10%,transparent)] backdrop-blur-[1px]" />
        <div className="flex items-center gap-1 px-3 pt-2">
          <p className="private-text min-w-0 flex-1 truncate font-medium">{title}</p>
          {/* How far through its to-dos: green once all are done, settling rather than celebrating. */}
          {todos.length > 0 && (
            <span className={`shrink-0 text-xs tabular-nums transition-colors duration-500 ${left ? 'text-muted-foreground' : 'text-(--tt-color-text-green)'}`}
              aria-label={left ? `${todos.length - left} of ${todos.length} done` : 'All done'}>
              <Rolling text={left ? `${todos.length - left}/${todos.length}` : 'All done'} by="word" />
            </span>
          )}
          {/* Shown on hover, so at rest it is only the note; folded away till then, so the count sits at the edge. */}
          <span className={`grid transition-[grid-template-columns,opacity] duration-300 ease-(--mf-ease) group-hover:grid-cols-[1fr] group-hover:opacity-100 ${asking ? 'grid-cols-[1fr] opacity-100' : 'grid-cols-[0fr] opacity-0'}`} style={STILL}>
          <span className="flex min-w-0 items-center justify-end overflow-hidden">
            <button type="button" title="Open it" aria-label="Open it" onClick={() => window.api.openInHome(note.tier, id)} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
              <AliveIcon icon={ExternalLinkIcon} size={14} />
            </button>
            <button type="button" title="Take it off the desktop" aria-label="Take it off the desktop"
              onClick={() => {
                if (!asking) return (chime('tap'), setAsking(true))
                chime('unstick')
                window.api.stick(type, id, false)
              }}
              className={`flex h-6 items-center justify-center gap-1 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground ${asking ? 'px-1.5 text-xs text-foreground' : 'w-6'}`}>
              {asking && <Rolling by="word" text="Take down?" />}
              <X className="size-3.5" />
            </button>
          </span>
          </span>
        </div>
        {/* A long note scrolls, and fades out at the bottom as the box does, instead of stopping hard at the edge. */}
        <div className="private-text min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-6 text-muted-foreground [mask-image:linear-gradient(to_bottom,#000_calc(100%-1.75rem),transparent)]" style={STILL}>
          {(doc.content ?? []).map((child, at) => (at || !twice) && <Body key={at} node={child} path={[at]} tick={tick} />)}
        </div>
      </div>
    </div>
  )
}

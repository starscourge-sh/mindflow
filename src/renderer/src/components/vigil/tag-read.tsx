import { useEffect, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { FileText, Gem, Inbox, Orbit } from 'lucide-react'

import { MindflowEditor, TAGS } from '../mindflow'
import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { useLive, vigil, type TagRead } from '@/lib/vigil'
import { openWindow } from '@/lib/notes'
import { Empty, Tags, Typed } from './ui'

const ICON = { nugget: Gem, article: FileText, question: Orbit }
const NAME: Record<string, string> = { capture: 'Capture', nugget: 'Nugget', article: 'Article', question: 'Question' }

/** A day as you would say it: "Friday 4 September", with the year once it is not this one. */
const named = (day: string): string =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: day.slice(0, 4) === String(new Date().getFullYear()) ? undefined : 'numeric' })

/** How many are drawn at a time: each is a whole note, and the rest arrive as you scroll. */
const BATCH = 12

/**
 * A tag read as a page: the whole of everything carrying it, captures and
 * kept things together, newest first under the day each was written. It puts
 * one subject together out of things caught for other reasons. Read only;
 * a click opens the one you want to change.
 */
export function TagStream({ tag, onOpen }: { tag: string; onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const items = useLive(() => vigil.tagRead(tag), null as TagRead[] | null, [tag])
  const [count, setCount] = useState(BATCH)
  useEffect(() => setCount(BATCH), [tag])
  // More come in as the end comes into view.
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const mark = end.current
    if (!mark) return
    const watch = new IntersectionObserver((seen) => seen.some((one) => one.isIntersecting) && setCount((n) => n + BATCH), { rootMargin: '600px' })
    watch.observe(mark)
    return () => watch.disconnect()
  }, [items === null])
  if (!items) return <div className="flex-1" />
  if (!items.length)
    return <Empty shape={['polygon', 3]} title={`Nothing carries #${tag} now`}>Whatever had it was let go or archived, or the tag was taken off. Write it into anything and it reads here.</Empty>
  const days: [string, TagRead[]][] = []
  for (const item of items.slice(0, count)) {
    const day = new Date(item.at).toLocaleDateString('en-CA')
    const last = days[days.length - 1]
    if (last?.[0] === day) last[1].push(item)
    else days.push([day, [item]])
  }
  return (
    <div className="page-narrow mx-auto w-full px-5 pt-4 pb-16 [--mf-padding:0]">
      <p className="mb-2 text-meta text-muted-foreground"><Typed text={`Everything tagged #${tag}, whole, newest first.`} step={28} delay={200} /></p>
      {days.map(([day, list]) => (
        <section key={day}>
          {/* The day stays in view while its notes scroll under it. */}
          <h2 className="sticky top-0 z-10 -mx-1 bg-background/90 px-1 pt-4 pb-1.5 text-meta font-semibold text-muted-foreground backdrop-blur-sm">{named(day)}</h2>
          {list.map((item) => <Entry key={`${item.type}-${item.id}`} item={item} onOpen={onOpen} />)}
        </section>
      ))}
      <div ref={end} className="h-px" />
    </div>
  )
}

function Entry({ item, onOpen }: { item: TagRead; onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const kind = CAPTURE_TYPES.find((one) => one.id === item.kind)
  const Icon = item.type === 'capture' ? kind?.icon ?? Inbox : ICON[item.type as keyof typeof ICON] ?? Gem
  // ⌘-click: in a window of its own, as in every list.
  const open = (event: React.MouseEvent | React.KeyboardEvent): void => (event.metaKey ? openWindow(item.type, item.id) : onOpen(item.type, item.id))
  return (
    <article data-private={item.private ? '' : undefined} className="group/entry flex flex-col gap-1.5 border-b border-border/50 py-3 last:border-b-0 @[44rem]/page:flex-row @[44rem]/page:gap-4">
      <div
        role="link"
        tabIndex={0}
        aria-label={`Open ${item.label || 'it'}`}
        // A toggle or a link inside the words does its own thing; anywhere else opens it.
        onClick={(event) => !(event.target as HTMLElement).closest('a, button, input, summary') && open(event)}
        onKeyDown={(event) => event.key === 'Enter' && event.target === event.currentTarget && open(event)}
        className="private-text min-w-0 flex-1 cursor-pointer rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 [&_.tiptap.ProseMirror]:cursor-pointer [&_.mindflow-editor-content]:p-0 [&_.ProseMirror>p:last-child:has(>br:only-child)]:hidden"
      >
        {item.title && item.type !== 'capture' && <h3 className="mb-1 font-semibold">{item.title}</h3>}
        <MindflowEditor
          host={window.api}
          tokens={TAGS}
          readOnly
          defaultContent={(item.body as JSONContent | string | null) ?? ''}
          toolbar={false}
          handles={false}
          slash={false}
          outline={false}
          search={false}
          vim={false}
          autofocus={false}
        />
      </div>
      {/* Its other routes back, then what it is: on the right, out of the words' way. */}
      <aside className="flex shrink-0 flex-row flex-wrap items-center gap-x-3 gap-y-1.5 text-xs whitespace-nowrap text-muted-foreground @[44rem]/page:max-w-[38%] @[44rem]/page:flex-col @[44rem]/page:items-end @[44rem]/page:pt-1">
        <Tags tags={item.tags} />
        <span className="flex items-center gap-1 opacity-70 transition-opacity group-hover/entry:opacity-100">
          <Icon className="size-3.5" style={kind && item.type === 'capture' ? { color: kind.tint } : undefined} />
          {item.type === 'capture' ? kind?.label ?? NAME.capture : NAME[item.type] ?? item.type}
          {item.status !== 'open' && item.type === 'capture' && <span>· {item.status}</span>}
        </span>
      </aside>
    </article>
  )
}

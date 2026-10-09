import { useEffect, useState } from 'react'

import { vigil } from '@/lib/vigil'
import { linkKind, kindOfLink } from '@/extensions/note-link'

/** The words of a stored body, for a glance: no markup, first lines only. */
export const glance = (body: unknown): string => {
  if (typeof body === 'string') return body.replace(/\[\[@[^|\]]+\|([^\]]+)\]\]/g, '$1')
  const walk = (node: { type?: string; text?: string; attrs?: { label?: string }; content?: unknown[] }): string =>
    node.type === 'noteLink' ? `@${node.attrs?.label ?? ''}` :
    node.text ?? (node.content ?? []).map((child) => walk(child as typeof node)).join(node.content?.some((child) => (child as { text?: string }).text !== undefined) ? '' : ' ')
  return body ? walk(body as { content?: unknown[] }) : ''
}

/**
 * Point at an @ link and the note it leads to shows beside it, as Obsidian's
 * page preview does: its name and its first lines, without leaving where you
 * are. Once per window, for every editor in it.
 */
export function NotePreview(): React.JSX.Element | null {
  const [shown, setShown] = useState<{ x: number; y: number; above: boolean; private: boolean; title: string; text: string; kind: string; aside: boolean } | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let over: Element | null = null
    const onOver = (event: MouseEvent): void => {
      const link = (event.target as Element | null)?.closest?.('a.tiptap-note-link[data-note]') ?? null
      if (link === over) return
      over = link
      clearTimeout(timer)
      setShown(null)
      if (!link) return
      // A pause first: a pointer passing over a link is not asking.
      timer = setTimeout(() => {
        const raw = link.getAttribute('data-note') ?? ''
        const [type, id] = raw.includes(':') ? [raw.slice(0, raw.indexOf(':')), raw.slice(raw.indexOf(':') + 1)] : ['capture', raw]
        const kind = kindOfLink(raw, link.getAttribute('data-kind'))
        // A person or a tag is a place to go, not a note with words to show.
        const load: Promise<{ title: string; body: unknown; private: boolean } | null> =
          type === 'person' ? Promise.resolve({ title: id, body: 'Every note with their words.', private: false })
          : type === 'tag' ? Promise.resolve({ title: `#${id}`, body: 'Every note tagged with it.', private: false })
          : type === 'task' ? vigil.task(id).then((found) => found && { title: found.title, body: found.notes, private: false })
          : type === 'capture'
          ? window.api.captures.get(id).then((found) => found && { title: found.title || '', body: found.body, private: !!found.private })
          : vigil.item(id).then((found) => found && { title: found.title, body: found.body, private: !!found.private })
        void load.then((found) => {
          if (!found || over !== link) return
          const box = link.getBoundingClientRect()
          const text = glance(found.body).trim()
          const above = box.bottom + 260 > window.innerHeight
          setShown({
            x: Math.min(box.left, window.innerWidth - 336),
            y: above ? box.top - 8 : box.bottom + 8,
            above,
            private: found.private,
            title: found.title || text.split('\n')[0].slice(0, 80) || 'Untitled',
            text: text.slice(0, 420),
            kind,
            aside: !['task', 'person', 'tag'].includes(type)
          })
        })
      }, 350)
    }
    document.addEventListener('mouseover', onOver)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mouseover', onOver)
    }
  }, [])
  if (!shown) return null
  const look = linkKind(shown.kind)
  return (
    <div
      // Private words stay blurred here as in any list, unless shown on purpose.
      data-private={shown.private ? '' : undefined}
      role="tooltip"
      className="pointer-events-none fixed z-[70] w-80 rounded-lg border bg-popover p-3 text-control shadow-(--mf-panel-shadow) animate-in fade-in-0 duration-150"
      style={{ left: Math.max(12, shown.x), top: shown.y, transform: shown.above ? 'translateY(-100%)' : undefined }}
    >
      {look && (
        <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <look.icon className="size-3.5 shrink-0" style={{ color: `var(--tt-color-text-${look.color})` }} />
          {look.label}
        </p>
      )}
      <p className="private-text mb-1 truncate font-medium text-foreground">{shown.title}</p>
      {shown.text && <p className="private-text line-clamp-6 whitespace-pre-line text-muted-foreground">{shown.text}</p>}
      <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
        Click to open{shown.aside ? ', ⌘-click for a new window' : ''}
      </p>
    </div>
  )
}

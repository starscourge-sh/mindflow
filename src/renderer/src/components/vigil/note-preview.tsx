import { useEffect, useState } from 'react'

import { vigil } from '@/lib/vigil'

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
  const [shown, setShown] = useState<{ x: number; y: number; above: boolean; private: boolean; title: string; text: string } | null>(null)
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
        const [type, id] = raw.includes(':') ? raw.split(':') : ['capture', raw]
        const load = type === 'capture'
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
            text: text.slice(0, 420)
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
  return (
    <div
      // Private words stay blurred here as in any list, unless shown on purpose.
      data-private={shown.private ? '' : undefined}
      role="tooltip"
      className="pointer-events-none fixed z-[70] w-80 rounded-lg border bg-popover p-3 text-control shadow-(--mf-panel-shadow) animate-in fade-in-0 duration-150"
      style={{ left: Math.max(12, shown.x), top: shown.y, transform: shown.above ? 'translateY(-100%)' : undefined }}
    >
      <p className="private-text mb-1 truncate font-medium text-foreground">{shown.title}</p>
      <p className="private-text line-clamp-6 whitespace-pre-line text-muted-foreground">{shown.text}</p>
    </div>
  )
}

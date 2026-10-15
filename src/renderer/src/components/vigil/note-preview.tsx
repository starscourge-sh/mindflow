import { useEffect, useState } from 'react'

import { vigil } from '@/lib/vigil'
import { backIn } from '@/lib/back-in'
import { Gem } from 'lucide-react'
import { canSplit, openAside } from '@/lib/split'
import { EASE } from '@/lib/motion'
import { enqueue } from '@/lib/reading-queue'
import { linkKind, kindOfLink } from '@/extensions/note-link'
import { cut } from '../../../../main/clip'

/** The words of a stored body, for a glance: no markup, first lines only. */
export const glance = (body: unknown): string => {
  if (typeof body === 'string') return body.replace(/\[\[@[^|\]]+\|([^\]]+)\]\]/g, '$1')
  const walk = (node: { type?: string; text?: string; attrs?: { label?: string }; content?: unknown[] }): string =>
    node.type === 'noteLink' ? `@${node.attrs?.label ?? ''}` :
    node.text ?? (node.content ?? []).map((child) => walk(child as typeof node)).join(node.content?.some((child) => (child as { text?: string }).text !== undefined) ? '' : ' ')
  return body ? walk(body as { content?: unknown[] }) : ''
}

/** How a gem comes back, for its preview: the question Review asks it by, and when. */
type Gemmed = { asks: string | null; tested: boolean; when: string }
const plainly = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const gemmed = (item: { title: string; prompt: string | null; dueAt: string | null; suspended: number }): Gemmed => ({
  // A gem written as its own question is not asked twice over.
  asks: item.prompt && plainly(item.prompt) !== plainly(item.title) ? item.prompt : null,
  tested: !!item.prompt,
  when: item.suspended ? 'Resting: it does not come back until you choose' : !item.dueAt ? 'A new card: it joins Review soon' : new Date(item.dueAt) <= new Date() ? 'Due for review now' : `Back in Review ${backIn(item.dueAt)}`
})

/**
 * Point at an @ link and the note it leads to shows beside it, as Obsidian's
 * page preview does: its name and its first lines, without leaving where you
 * are. Once per window, for every editor in it.
 */
export function NotePreview(): React.JSX.Element | null {
  const [shown, setShown] = useState<{ x: number; y: number; above: boolean; private: boolean; title: string; text: string; kind: string; aside: boolean; type: string; id: string; queue: boolean; gem?: Gemmed } | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let leaving: ReturnType<typeof setTimeout> | undefined
    let over: Element | null = null
    const onOver = (event: MouseEvent): void => {
      // On the card itself: it stays, so its buttons can be reached.
      if ((event.target as Element | null)?.closest?.('[data-note-preview]')) return void clearTimeout(leaving)
      const link = (event.target as Element | null)?.closest?.('a.tiptap-note-link[data-note]') ?? null
      if (link === over) return void clearTimeout(leaving)
      over = link
      clearTimeout(timer)
      clearTimeout(leaving)
      // Off the link: a moment to reach the card before it goes.
      if (!link) return void (leaving = setTimeout(() => setShown(null), 260))
      setShown(null)
      // A pause first: a pointer passing over a link is not asking.
      timer = setTimeout(() => {
        const raw = link.getAttribute('data-note') ?? ''
        const [type, id] = raw.includes(':') ? [raw.slice(0, raw.indexOf(':')), raw.slice(raw.indexOf(':') + 1)] : ['capture', raw]
        const kind = kindOfLink(raw, link.getAttribute('data-kind'))
        // A person or a tag is a place to go, not a note with words to show.
        const load: Promise<{ title: string; body: unknown; private: boolean; gem?: Gemmed } | null> =
          type === 'person' ? Promise.resolve({ title: id, body: 'Every note with their words.', private: false })
          : type === 'tag' ? Promise.resolve({ title: `#${id}`, body: 'Every note tagged with it.', private: false })
          : type === 'task' ? vigil.task(id).then((found) => found && { title: found.title, body: found.notes, private: false })
          : type === 'capture'
          ? window.api.captures.get(id).then((found) => found && { title: found.title || '', body: found.body, private: !!found.private })
          : vigil.item(id).then((found) => found && { title: found.title, body: found.body, private: !!found.private, gem: found.tier === 'nugget' ? gemmed(found) : undefined })
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
            title: found.title || cut(text.split('\n')[0], 80) || 'Untitled',
            text: cut(text, 420),
            kind,
            aside: !['task', 'person', 'tag'].includes(type),
            type,
            id,
            queue: !['task', 'person', 'tag', 'goal'].includes(type),
            gem: found.gem
          })
        })
      }, 350)
    }
    document.addEventListener('mouseover', onOver)
    return () => {
      clearTimeout(timer)
      clearTimeout(leaving)
      document.removeEventListener('mouseover', onOver)
    }
  }, [])
  if (!shown) return null
  const look = linkKind(shown.kind)
  /**
   * Arc's Peek, kept: the card grows into the pane the note opens in beside
   * the one in front, and the pane slides in under it as it fades.
   */
  const openBeside = (): void => {
    const card = document.querySelector<HTMLElement>('[data-note-preview]')
    const area = document.querySelector('[data-split-area]')?.getBoundingClientRect()
    const still = document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
    if (card && area && !still) {
      const from = card.getBoundingClientRect()
      const panes = Math.min(3, document.querySelectorAll('[data-split-area] [data-pane]').length + 1)
      const width = (area.width - 8 * (panes - 1)) / panes
      const ghost = card.cloneNode(true) as HTMLElement
      ghost.removeAttribute('data-note-preview')
      ghost.removeAttribute('role')
      ghost.setAttribute('aria-hidden', 'true')
      Object.assign(ghost.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, transform: 'none', pointerEvents: 'none', overflow: 'hidden' })
      document.body.append(ghost)
      ghost.animate([
        { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, opacity: 1, borderRadius: '8px' },
        { opacity: 1, offset: 0.55 },
        { left: `${area.right - width}px`, top: `${area.top + 36}px`, width: `${width}px`, height: `${area.height - 36}px`, opacity: 0, borderRadius: '12px' }
      ], { duration: 300, easing: `cubic-bezier(${EASE.join(',')})`, fill: 'forwards' }).finished.then(() => ghost.remove(), () => ghost.remove())
    }
    setShown(null)
    openAside(shown.type, shown.id)
  }
  return (
    <div
      // Private words stay blurred here as in any list, unless shown on purpose.
      data-private={shown.private ? '' : undefined}
      role="tooltip"
      data-note-preview
      onMouseLeave={() => setShown(null)}
      className="fixed z-[70] w-80 rounded-lg border bg-popover p-3 text-control shadow-(--mf-panel-shadow) animate-in fade-in-0 duration-150"
      style={{ left: Math.max(12, shown.x), top: shown.y, transform: shown.above ? 'translateY(-100%)' : undefined }}
    >
      {shown.gem ? (
        <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Gem className="size-3.5 shrink-0" style={{ color: 'var(--tt-color-text-pink)' }} />
          A gem: an idea you kept, in your own words
        </p>
      ) : look && (
        <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <look.icon className="size-3.5 shrink-0" style={{ color: `var(--tt-color-text-${look.color})` }} />
          {look.label}
        </p>
      )}
      <p className="private-text mb-1 truncate font-medium text-foreground">{shown.title}</p>
      {shown.text && <p className="private-text line-clamp-6 whitespace-pre-line text-muted-foreground">{shown.text}</p>}
      {/* A gem says how it comes back: the question Review asks, and when; or that it has none yet. */}
      {shown.gem && (
        <div data-gem-back className="mt-2 rounded-md bg-foreground/[0.04] px-2.5 py-2">
          {shown.gem.tested ? (
            <>
              {shown.gem.asks
                ? <p className="private-text"><span className="font-semibold text-[var(--tt-color-text-purple)]">Review asks:</span> <span className="text-foreground">{shown.gem.asks}</span></p>
                : <p><span className="font-semibold text-[var(--tt-color-text-purple)]">In Review,</span> <span className="text-foreground">asked as it is written.</span></p>}
              <p className="mt-0.5 text-xs text-muted-foreground">{shown.gem.when}</p>
            </>
          ) : (
            <p className="text-muted-foreground"><span className="font-semibold text-foreground">No question yet.</span> It comes back now and then as a hint; give it a question and Review asks it.</p>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
        <span className="basis-full">Click to open{shown.aside ? ', ⌘-click for its own window' : ''}</span>
        {/* Kept beside what you are reading, in a pane of its own. */}
        {shown.aside && canSplit() && (
          <button type="button" data-open-beside onClick={openBeside} className="shrink-0 rounded px-1.5 py-0.5 font-medium text-foreground hover:bg-accent">Open beside</button>
        )}
        {/* Spotify's two verbs, for the note it leads to. */}
        {shown.queue && (
          <span className="flex shrink-0 gap-1">
            <button type="button" onClick={() => (void enqueue([shown.id]), setShown(null))} className="rounded px-1.5 py-0.5 text-foreground/80 hover:bg-accent hover:text-foreground">Add to queue</button>
            <button type="button" onClick={() => (void enqueue([shown.id], true), setShown(null))} className="rounded px-1.5 py-0.5 text-foreground/80 hover:bg-accent hover:text-foreground">Read next</button>
          </span>
        )}
      </div>
    </div>
  )
}

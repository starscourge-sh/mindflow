import { useEffect, useState } from 'react'
import { onScrollAway } from '@/lib/scroll-away'

import { haligtree } from '@/lib/haligtree'
import { backIn } from '@/lib/back-in'
import { Gem } from 'lucide-react'
import { canSplit, openAside } from '@/lib/split'
import { byKeys, EASE, still } from '@/lib/motion'
import { realMove } from '@/lib/real-move'
import { enqueue } from '@/lib/reading-queue'
import { linkKind, kindOfLink } from '@/extensions/note-link'
import { blockIn, wordsOf } from '../../../../main/blocks'
import type { Editor } from '@tiptap/core'
import { chime } from '@/lib/sound'
import { cut } from '../../../../main/clip'

/** The words of a stored body, for a glance: no markup, first lines only. */
export const glance = (body: unknown): string => {
  if (typeof body === 'string') return body.replace(/\[\[@[^|\]]+\|([^\]]+)\]\]/g, '$1')
  const walk = (node: { type?: string; text?: string; attrs?: { label?: string }; content?: unknown[] }): string =>
    node.type === 'noteLink' ? `@${node.attrs?.label ?? ''}` :
    node.text ?? (node.content ?? []).map((child) => walk(child as typeof node)).join(node.content?.some((child) => (child as { text?: string }).text !== undefined) ? '' : ' ')
  return body ? walk(body as { content?: unknown[] }) : ''
}

/**
 * A link to one line made the line itself, shown in place and live (a block
 * reference), in one undoable step. A link alone on its line takes the line's
 * place; one among words leaves them, the line shown under them.
 */
function showLineHere(link: Element): void {
  const editor = (link.closest('.ProseMirror') as (Element & { editor?: Editor }) | null)?.editor
  if (!editor || editor.isDestroyed || !editor.isEditable) return
  const pos = editor.view.posAtDOM(link, 0)
  const node = editor.state.doc.nodeAt(pos)
  if (node?.type.name !== 'noteLink' || !node.attrs.block) return
  const $pos = editor.state.doc.resolve(pos)
  const line = $pos.parent
  const embed = { type: 'noteEmbed', attrs: { id: node.attrs.id, label: node.attrs.label, block: node.attrs.block } }
  const alone = line.textContent.trim() === '' && line.childCount <= 2
  chime('open')
  if (alone && $pos.depth > 0) editor.chain().focus().insertContentAt({ from: $pos.before(), to: $pos.after() }, embed).run()
  else if ($pos.depth > 0) editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).insertContentAt($pos.after() - node.nodeSize, embed).run()
}

/** The card's own actions: small buttons with a resting fill, so they read as buttons, not words. */
const ACT = 'inline-flex min-h-6 shrink-0 items-center rounded-md bg-foreground/[0.06] px-2 font-medium text-foreground transition-colors hover:bg-accent'

/**
 * The attributes that give any row's title the card an @ link shows, so what
 * is inside can be seen before acting on it (the Bin, a picker, a pass).
 * `binned`: read as the Bin keeps it, with nothing on the card to open it.
 */
export const hoverNote = (type: string, id: string, { kind, binned = false }: { kind?: string | null; binned?: boolean } = {}): Record<string, string> => ({
  'data-note-hover': '',
  'data-note': `${type}:${id}`,
  ...(kind ? { 'data-kind': kind } : {}),
  ...(binned ? { 'data-note-binned': '' } : {})
})

/** How a gem comes back, for its preview: the question Review asks it by, and when. */
type Gemmed = { asks: string | null; tested: boolean; when: string }
const plainly = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const gemmed = (item: { title: string; prompt: string | null; dueAt: string | null; suspended: number }): Gemmed => ({
  // A gem written as its own question is not asked twice over.
  asks: item.prompt && plainly(item.prompt) !== plainly(item.title) ? item.prompt : null,
  tested: !!item.prompt,
  when: item.suspended ? 'Paused: it does not come back until you choose' : !item.dueAt ? 'A new card: it joins Review soon' : new Date(item.dueAt) <= new Date() ? 'Due for review now' : `Back in Review ${backIn(item.dueAt)}`
})

/**
 * Point at an @ link and the note it leads to shows beside it, as Obsidian's
 * page preview does: its name and its first lines, without leaving where you
 * are. Once per window, for every editor in it.
 */
export function NotePreview(): React.JSX.Element | null {
  const [shown, setShown] = useState<{ x: number; y: number; above: boolean; private: boolean; title: string; text: string; line?: boolean; lost?: boolean; el?: Element; kind: string; aside: boolean; type: string; id: string; queue: boolean; gem?: Gemmed; binned?: boolean; row?: boolean; anchor: Element } | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let leaving: ReturnType<typeof setTimeout> | undefined
    let over: Element | null = null
    const onOver = (event: MouseEvent): void => {
      // On the card itself: it stays, so its buttons can be reached.
      if ((event.target as Element | null)?.closest?.('[data-note-preview]')) return void clearTimeout(leaving)
      // An @ link in a note, or a row's title that offers the same card (the Bin's: data-note-hover).
      const link = (event.target as Element | null)?.closest?.('a.tiptap-note-link[data-note], [data-note-hover][data-note]') ?? null
      if (link === over) return void clearTimeout(leaving)
      // A link brought under a resting pointer (a scroll, a note opening) is
      // not being pointed at: only a real move shows its card. Off a link, it goes either way.
      if (link && !realMove(event)) return
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
        // A link to one line shows that line, not the note's start (block-ids.ts).
        const block = link.getAttribute('data-block')
        // In the Bin: read as the Bin keeps it, and nothing on the card offers to open it.
        const binned = link.hasAttribute('data-note-binned')
        // A row's title, not an @ link: its own click does what it always did, so the card does not say "Click to open".
        const row = link.hasAttribute('data-note-hover')
        // A person or a tag is a place to go, not a note with words to show.
        const load: Promise<{ title: string; body: unknown; private: boolean; gem?: Gemmed } | null> =
          binned ? haligtree.binPeek(type, id).then((found) => found && { title: found.title, body: found.body, private: found.private })
          : type === 'person' ? Promise.resolve({ title: id, body: 'Every note with their words.', private: false })
          : type === 'tag' ? Promise.resolve({ title: `#${id}`, body: 'Every note tagged with it.', private: false })
          : type === 'task' ? haligtree.task(id).then((found) => found && { title: found.title, body: found.notes, private: false })
          : type === 'capture'
          ? window.api.captures.get(id).then((found) => found && { title: found.label || found.title || '', body: found.body, private: !!found.private })
          : haligtree.item(id).then((found) => found && { title: found.title, body: found.body, private: !!found.private, gem: found.tier === 'nugget' ? gemmed(found) : undefined })
        void load.then((found) => {
          if (!found || over !== link) return
          const box = link.getBoundingClientRect()
          const line = block ? blockIn(found.body, block) : null
          const read = (line ? wordsOf(line) : glance(found.body)).trim()
          // A note whose first line is its title says it once, in bold, not again as the start of its words.
          const lead = found.title ? read.slice(0, found.title.length) : ''
          const titled = !line && !!found.title && lead.toLowerCase() === found.title.toLowerCase() && !/[\p{L}\p{N}]/u.test(read[found.title.length] ?? '')
          const text = titled ? read.slice(found.title.length).trim() : read
          // In a menu or a picker (data-note-side on the list), beside the list
          // rather than over the rows under the pointer, where there is room.
          const list = link.closest('[data-note-side]')?.getBoundingClientRect()
          const side = !list ? null : list.right + 336 <= window.innerWidth ? list.right + 8 : list.left >= 336 ? list.left - 328 : null
          const above = side === null && box.bottom + 260 > window.innerHeight
          setShown({
            x: side ?? Math.min(box.left, window.innerWidth - 336),
            y: side !== null ? Math.max(8, Math.min(box.top, window.innerHeight - 280)) : above ? box.top - 8 : box.bottom + 8,
            above,
            private: found.private,
            title: found.title || cut(read.split('\n')[0], 80) || 'Untitled',
            line: !!block,
            el: block && line ? link : undefined,
            lost: !!block && !line,
            text: cut(text, 420),
            kind,
            aside: !binned && !['task', 'person', 'tag'].includes(type),
            type,
            id,
            queue: !binned && !['task', 'person', 'tag', 'goal'].includes(type),
            gem: found.gem,
            binned,
            row,
            anchor: link
          })
        })
      }, 350)
    }
    document.addEventListener('mousemove', onOver)
    return () => {
      clearTimeout(timer)
      clearTimeout(leaving)
      document.removeEventListener('mousemove', onOver)
    }
  }, [])
  // The link it hangs from gone from the page (another page opened, the row
  // restored out of the Bin under a resting pointer): the card goes with it,
  // never left floating over the next page, in the way of what is clicked.
  useEffect(() => {
    if (!shown) return
    const watch = new MutationObserver(() => void (!shown.anchor.isConnected && setShown(null)))
    watch.observe(document.body, { childList: true, subtree: true })
    return () => watch.disconnect()
  }, [shown])
  // Its link scrolled away under a resting pointer: the card goes, never left floating over the page.
  useEffect(() => {
    if (!shown) return
    return onScrollAway(() => shown.anchor, () => setShown(null), () => document.querySelector('[data-note-preview]'))
  }, [shown])
  // Esc puts the card away, and only the card: the note under it keeps the
  // keys. The pointer still on the link, it stays away until the pointer leaves.
  useEffect(() => {
    if (!shown) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      event.stopPropagation()
      setShown(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [shown])
  if (!shown) return null
  const look = linkKind(shown.kind)
  /**
   * Arc's Peek, kept: the card grows into the pane the note opens in beside
   * the one in front, and the pane slides in under it as it fades.
   */
  const openBeside = (): void => {
    const card = document.querySelector<HTMLElement>('[data-note-preview]')
    const area = document.querySelector('[data-split-area]')?.getBoundingClientRect()
    const calm = still()
    // Opened beside by a key, the pane is simply there; by a click the card grows into it.
    if (card && area && !calm && !byKeys()) {
      const from = card.getBoundingClientRect()
      const panes = Math.min(3, document.querySelectorAll('[data-split-area] [data-pane]').length + 1)
      const width = (area.width - 8 * (panes - 1)) / panes
      const ghost = card.cloneNode(true) as HTMLElement
      ghost.removeAttribute('data-note-preview')
      ghost.removeAttribute('role')
      ghost.setAttribute('aria-hidden', 'true')
      Object.assign(ghost.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, transform: 'none', transformOrigin: '0 0', pointerEvents: 'none', overflow: 'hidden' })
      document.body.append(ghost)
      // On a transform alone (FLIP): from where the card is to the pane's box, fading as it gets there.
      const [sx, sy] = [width / from.width, (area.height - 36) / from.height]
      ghost.animate([
        { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1, borderRadius: '8px' },
        { opacity: 1, offset: 0.55 },
        { transform: `translate(${area.right - width - from.left}px, ${area.top + 36 - from.top}px) scale(${sx}, ${sy})`, opacity: 0, borderRadius: `${12 / sx}px / ${12 / sy}px` }
      ], { duration: 280, easing: `cubic-bezier(${EASE.join(',')})`, fill: 'forwards' }).finished.then(() => ghost.remove(), () => ghost.remove())
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
      <p className="private-text mb-1 line-clamp-3 font-medium [overflow-wrap:anywhere] text-foreground">{shown.title}</p>
      {/* One line linked: that line, as it reads now, in full ink, marked as a quote of the note. */}
      {shown.line ? (
        shown.lost
          ? <p data-preview-line className="text-foreground">That line is not in the note any more.</p>
          : <p data-preview-line className="private-text line-clamp-6 whitespace-pre-line rounded-md bg-foreground/[0.04] px-2.5 py-2 text-foreground">{shown.text}</p>
      ) : shown.text && <p className="private-text line-clamp-6 whitespace-pre-line text-muted-foreground">{shown.text}</p>}
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
        {(shown.binned || !shown.row) && <span className="basis-full">{shown.binned ? 'In the Bin. Click the row to look inside, or Space to see it large.' : `Click to open${shown.aside ? ', ⌘-click for its own window' : ''}`}</span>}
        {/* A link to one line: the line itself shown here instead, live. */}
        {shown.el && (
          <button type="button" data-show-line-here onClick={() => (showLineHere(shown.el!), setShown(null))} className={ACT}>Show the line here</button>
        )}
        {/* Kept beside what you are reading, in a pane of its own. */}
        {shown.aside && canSplit() && (
          <button type="button" data-open-beside onClick={openBeside} className={ACT}>Open beside</button>
        )}
        {/* Spotify's two verbs, for the note it leads to. */}
        {shown.queue && (
          <span className="flex shrink-0 gap-1">
            <button type="button" onClick={() => (void enqueue([shown.id]), setShown(null))} className={ACT}>Add to queue</button>
            <button type="button" onClick={() => (void enqueue([shown.id], true), setShown(null))} className={ACT}>Read next</button>
          </span>
        )}
      </div>
    </div>
  )
}

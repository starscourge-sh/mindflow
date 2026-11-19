import { keptAs } from '@/lib/capture-links'
import { small } from '@/lib/small-picture'
import { mdWords } from '../../../../main/md-words'
import { typedAsGaps } from '@/lib/blanks'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { onScrollAway } from '@/lib/scroll-away'

import { haligtree, when } from '@/lib/haligtree'
import { backIn } from '@/lib/back-in'
import { Gem, Superscript as FootnoteIcon, UserRound, VenetianMask } from 'lucide-react'
import { CARD } from '@/lib/float'
import { Quote as MessageSquareText } from '@/components/ui/icons'
import { canSplit } from '@/lib/split'
import { realMove } from '@/lib/real-move'
import { linkKind, kindOfLink } from '@/extensions/note-link'
import { blockIn, wordsOf } from '../../../../main/blocks'
import { cut } from '../../../../main/clip'
import { withoutTags } from '../../../../main/tag-words'
import { sources } from '@/lib/sources'
import { avatarOf } from '@/lib/people'
import { hideForMenus, menuShowing } from '@/lib/menu-showing'
import { plural } from '../../../../main/dates'

/** The first picture in a stored body, for its card: an image node, or Markdown's ![](src). */
const pictureIn = (body: unknown): string | null => {
  if (typeof body === 'string') return /!\[[^\]]*\]\(([^)\s]+)/.exec(body)?.[1] ?? null
  const walk = (node: { type?: string; attrs?: { src?: unknown }; content?: unknown[] }): string | null =>
    node.type === 'image' && typeof node.attrs?.src === 'string' ? node.attrs.src : (node.content ?? []).reduce<string | null>((found, child) => found ?? walk(child as typeof node), null)
  return body && typeof body === 'object' ? walk(body as { content?: unknown[] }) : null
}

/**
 * The narrow scrolling list a row sits in, if it is one (under three fifths of the window wide). A page is not a list,
 * however narrow the window's split makes it: the scroller that fills its own pane is that pane's page, and a card for
 * a name on it comes up at the name. The Feed in half a split counted as a narrow list, so a name's card came up
 * beside it, over the page in the other half (12 Nov).
 */
const sideList = (el: Element): Element | null => {
  for (let at = el.parentElement; at && at !== document.body; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at)
    if ((overflowY === 'auto' || overflowY === 'scroll') && at.scrollHeight > at.clientHeight) {
      const wide = at.getBoundingClientRect().width
      if (wide >= window.innerWidth * 0.6) return null
      // A note's own page beside its list (Writing with a page open) is a page as well: the scroller that fills the
      // note's pane. Taken for a list, a tag's card on the page came up beside it, over the list (the user, 15 Nov).
      const note = at.closest('.note-pane')
      if (note && wide >= note.getBoundingClientRect().width * 0.8) return null
      const pane = at.closest('[data-pane]')
      return pane && wide >= pane.getBoundingClientRect().width * 0.8 ? null : at
    }
  }
  return null
}

/** Blocks whose children are words on one line: every other block's children are lines of their own. */
const INLINE = new Set(['paragraph', 'heading', 'codeBlock', 'text'])

/** The words of a stored body, for a glance: no markup, each heading and paragraph on its own line. */
export const glance = (body: unknown): string => {
  // Markdown kept as text (an import, a gem made from a PDF): a picture says nothing here (it shows as the card's
  // own picture), a link reads as its words, never as its address, a task without its box.
  if (typeof body === 'string')
    return mdWords(body)
  const walk = (node: { type?: string; text?: string; attrs?: { label?: string }; content?: unknown[] }): string =>
    node.type === 'noteLink' ? `@${node.attrs?.label ?? ''}` :
    node.type === 'hardBreak' ? '\n' :
    node.text ?? (node.content ?? []).map((child) => walk(child as typeof node)).join(INLINE.has(node.type ?? '') ? '' : '\n')
  return body ? walk(body as { content?: unknown[] }) : ''
}

/**
 * A card's words without its title said again: a first line that is the
 * title, or holds it whole ("PER - On discipline" under "On discipline"), is
 * left out, so the bold title is the only place it reads.
 */
export const pastTitle = (read: string, title: string): string => {
  const plain = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const [first, ...rest] = read.split('\n')
  const named = plain(title)
  if (!named || !first) return read
  const opening = plain(first)
  if (opening === named || (` ${opening} `.includes(` ${named} `) && opening.length <= named.length + 24)) return rest.join('\n').trim()
  // Run together on one line with the words after it: the title cut off the front.
  if (opening.startsWith(`${named} `) && plain(read.slice(0, title.length)) === named) return read.slice(title.length).trim()
  return read
}

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

/**
 * A thought shown on a row (the Feed's latest under a post): the same card,
 * "Thought" with its date, its words, and the note it is on.
 */
export const hoverThought = (itemId: string, glossId: string, on: string): Record<string, string> => ({
  'data-note-hover': '',
  'data-note': `thought:${itemId}`,
  'data-thought': glossId,
  'data-thought-on': on
})

/** A footnote mark's card: "Footnote 2", and its note's words as the foot of the page has them now. */
const footnoteCard = (mark: Element, id: string): { title: string; body: string; private: boolean; picture: null; thought: Thought } => {
  const words = mark.closest('.ProseMirror')?.querySelector(`li[data-footnote="${CSS.escape(id)}"] .mf-footnote-words`)?.textContent?.trim()
  return { title: '', body: words || 'No words in this footnote yet.', private: false, picture: null, thought: { when: '', on: '', kind: `Footnote ${mark.textContent ?? ''}` } }
}

/** How a gem comes back, for its preview: the question Review asks it by, and when. */
/** A thought's card: when it was written, and the title of the note it is on. */
type Thought = { when: string; on: string; kind?: string }
type Gemmed = { asks: string | null; tested: boolean; when: string }
const plainly = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const gemmed = (item: { title: string; prompt: string | null; dueAt: string | null; suspended: number }): Gemmed => ({
  // A gem written as its own question is not asked twice over.
  asks: item.prompt && plainly(item.prompt) !== plainly(item.title) ? typedAsGaps(item.prompt) : null,
  tested: !!item.prompt,
  when: item.suspended ? 'Paused: it does not come back until you choose' : !item.dueAt ? 'A new card: it joins Review soon' : new Date(item.dueAt) <= new Date() ? 'Due for review now' : `Back in Review ${backIn(item.dueAt)}`
})

/**
 * Point at an @ link and the note it leads to shows beside it, as Obsidian's
 * page preview does: its name and its first lines, without leaving where you
 * are. Once per window, for every editor in it.
 */
/**
 * What each click on a link does, said as it is: in the main window ⌥ opens it to the side and ⌘ in a new
 * tab, for every kind; elsewhere ⌘ gives a note a window of its own (`apart`), and a person, a tag or a task
 * has none, so nothing is said of ⌘.
 */
const clicks = (apart: boolean): string =>
  canSplit() ? 'Click to open, ⌥-click to the side, ⌘-click in a new tab' : `Click to open${apart ? ', ⌘-click for its own window' : ''}`

export function NotePreview(): React.JSX.Element | null {
  const [shown, setShown] = useState<{ x: number; y: number; above: boolean; private: boolean; title: string; text: string; line?: boolean; lost?: boolean; el?: Element; kind: string; aside: boolean; type: string; id: string; queue: boolean; gem?: Gemmed; binned?: boolean; row?: boolean; anchor: Element; picture?: string | null; lead?: string; cast?: boolean; tally?: string; latest?: string[]; foot?: string; thought?: Thought } | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let leaving: ReturnType<typeof setTimeout> | undefined
    let over: Element | null = null
    // A footnote mark just clicked: no card from it until the pointer has left it.
    let pressed: Element | null = null
    // A card showing, or put away less than a moment ago: the next link's comes at once, as Wikipedia's do, with no new wait.
    let warmTill = 0
    const onOver = (event: MouseEvent): void => {
      // On the card itself: it stays, so its buttons can be reached.
      if ((event.target as Element | null)?.closest?.('[data-note-preview]')) return void clearTimeout(leaving)
      // An @ link in a note, or a row's title that offers the same card (the Bin's: data-note-hover).
      const found = (event.target as Element | null)?.closest?.('a.tiptap-note-link[data-note], [data-note-hover][data-note]') ?? null
      // Never over a menu: one open is what is being read (lib/menu-showing.ts). Asked only with a link under the
      // pointer or one's card on its way: it looks through the whole page, and a long note scrolled under a still
      // pointer sends an "over" every frame.
      if ((found || over) && menuShowing()) return void (clearTimeout(timer), (over = null))
      if (found !== pressed) pressed = null
      const link = found === pressed ? null : found
      // Still on the same link: the card stays. Still off every link: its leaving keeps running (a move here once put
      // it off, so a card left open while the pointer kept moving elsewhere).
      if (link === over) return void (link && clearTimeout(leaving))
      // A link brought under a resting pointer (a scroll, a note opening) is
      // not being pointed at: only a real move shows its card. Off a link, it goes either way.
      if (link && !realMove(event)) return
      over = link
      clearTimeout(timer)
      clearTimeout(leaving)
      // Off the link: a moment to reach the card before it goes.
      if (!link) return void (leaving = setTimeout(() => (setShown(null), (warmTill = Math.min(warmTill, Date.now() + 600))), 260))
      // The card of the link before stays until this one's words are read, then
      // gives way to it in one step: put away at once, each pill along a line of
      // them blinked out for a frame and back, over and over.
      // A pause first: a pointer passing over a link is not asking.
      timer = setTimeout(() => {
        const raw = link.getAttribute('data-note') ?? ''
        const [said, id] = raw.includes(':') ? [raw.slice(0, raw.indexOf(':')), raw.slice(raw.indexOf(':') + 1)] : ['capture', raw]
        // A character's card is a person's: their page in People, which says the work they are in.
        const type = said === 'character' ? 'person' : said
        // In Review a #tag on a card is the deck it sits in: Review names its decks itself, so no tag card comes up over one.
        if (type === 'tag' && link.closest('[data-review-page], [data-review-card], [data-answer-side]')) return
        const kind = kindOfLink(raw, link.getAttribute('data-kind'))
        // A link to one line shows that line, not the note's start (block-ids.ts).
        const block = link.getAttribute('data-block')
        // In the Bin: read as the Bin keeps it, and nothing on the card offers to open it.
        const binned = link.hasAttribute('data-note-binned')
        // A row's title, not an @ link: its own click does what it always did, so the card does not say "Click to open".
        const row = link.hasAttribute('data-note-hover')
        // A person or a tag is a place to go, not a note with words to show.
        const load: Promise<{ title: string; lead?: string; cast?: boolean; body: unknown; private: boolean; gem?: Gemmed; picture?: string | null; tally?: string; latest?: string[]; thought?: Thought; /** What a capture became, which is what its link opens and its card shows. */ became?: { type: string; id: string } } | null> =
          // A footnote's mark: its note's words, read off the page it is on.
          type === 'footnote' ? Promise.resolve(footnoteCard(link, id))
          // A thought: its words whole, dated, and the note it is on.
          : type === 'thought' ? haligtree.glosses(id).then((all) => {
            const one = all.find((gloss) => gloss.id === link.getAttribute('data-thought'))
            return one ? { title: '', body: one.body, private: false, picture: null, thought: { when: `${one.author === 'ai' ? 'Written by AI, ' : ''}${when(one.createdAt)}`, on: link.getAttribute('data-thought-on') ?? '' } } : null
          })
          : binned ? haligtree.binPeek(type, id).then((found) => found && { title: found.title, body: found.body, private: found.private })
          // A person reads as Wikipedia's card does: who they were, their years, your thoughts, their picture.
          : type === 'person' ? sources.page('attribution', id).then((page) => {
            // "(born 1973) is an American comedian and actor.", after the name in bold, as Wikipedia's lead reads.
            const years = page?.died ? `(${[page.born, page.died].filter(Boolean).join(' to ')})` : page?.born ? `(born ${page.born})` : ''
            const what = page?.what?.trim().replace(/\.$/, '')
            const is = what ? `${page?.died ? 'was' : 'is'} ${/^(a|an|the)\b/i.test(what) ? '' : /^[aeiou]/i.test(what) ? 'an ' : 'a '}${what}.` : ''
            const cast = page?.character
            // "Gandalf, in J.R.R. Tolkien" kept as a person: Gandalf, a character by Tolkien (main's characterOf).
            return {
              title: cast?.called ?? page?.name ?? id,
              lead: cast ? `is a character ${cast.from === 'author' ? 'by' : 'in'} ${cast.work}${cast.played ? `, played by ${cast.played}` : ''}.` : [years, is].filter(Boolean).join(' '),
              body: page?.thoughts ?? '',
              // How many, as a tag's card says it: what a tip on their face said, said here instead.
              tally: page?.items.length ? `${plural(page.items.length, 'note')} with their words` : undefined,
              private: false,
              // Linked as a character, it is one, whether or not their page has its work yet.
              cast: !!cast || said === 'character',
              picture: avatarOf(id)
            }
          })
          // A tag says how many carry it, the way its page counts them, and its three newest.
          : type === 'tag' ? Promise.all([haligtree.tags(), haligtree.tagRead(id.toLowerCase())]).then(([all, read]) => {
            const one = all.find((tag) => tag.tag.toLowerCase() === id.toLowerCase())
            const count = one?.count ?? 0
            const later = one?.later ?? 0
            const notes = (n: number): string => `${plural(n, 'note')}`
            return {
              title: `#${id}`, body: '', private: false, picture: null,
              tally: count || !later ? `${notes(count)}${later ? `, and ${later} done` : ''}` : `${notes(later)}, all done`,
              latest: read.slice(0, 3).map((note) => withoutTags(note.title || note.label || '').replace(/\s+/g, ' ').trim() || 'New note')
            }
          })
          // A PDF or a kept article: its title, and what a click does.
          : type === 'pdf' || type === 'web' ? haligtree.linkTitle(raw).then((found) => found && { title: found.title, body: type === 'pdf' ? 'A PDF, read in the reader.' : 'A web article you kept, read in the reader.', private: false, picture: null })
          : type === 'task' ? haligtree.task(id).then((found) => found && { title: found.title, body: found.notes, private: false })
          // A capture that became a page, a gem or a question is that now (`keptAs`): its card shows what a click on the
          // link opens, in the words it has there, never the capture kept behind it as it was the day it left the Inbox.
          : type === 'capture'
          ? keptAs(id).then((to) => to.type === 'capture'
            ? window.api.captures.get(id).then((found) => found && { title: found.label || found.title || '', body: found.body, private: !!found.private })
            : haligtree.item(to.id).then((found) => found && { title: found.title, body: found.body, private: !!found.private, gem: found.tier === 'nugget' ? gemmed(found) : undefined, became: to }))
          : haligtree.item(id).then((found) => found && { title: found.title, body: found.body, private: !!found.private, gem: found.tier === 'nugget' ? gemmed(found) : undefined })
        void load.then((found) => {
          if (over !== link) return
          // Nothing to show for it: the last link's card must not stay on as if it were this one's.
          if (!found) return void setShown(null)
          const box = link.getBoundingClientRect()
          const line = block ? blockIn(found.body, block) : null
          const read = (line ? wordsOf(line) : glance(found.body)).replace(/\n\s*\n+/g, '\n').trim()
          // A note whose first line is its title says it once, in bold, not again as the start of its words.
          const text = line || !found.title ? read : pastTitle(read, found.title)
          // In a menu or a picker (data-note-side on the list), beside the list
          // rather than over the rows under the pointer, where there is room.
          // Also any narrow list that scrolls up and down (a reader's side panel, the Inbox list): a card over its
          // rows would hide the very rows the pointer is running down.
          const list = (link.closest('[data-note-side]') ?? sideList(link))?.getBoundingClientRect()
          // The card is 20rem wide, so its width follows the text size chosen in Settings.
          const wide = 20 * parseFloat(getComputedStyle(document.documentElement).fontSize) + 8
          const side = !list ? null : list.right + wide <= window.innerWidth ? list.right + 8 : list.left >= wide ? list.left - wide : null
          const above = side === null && box.bottom + 260 > window.innerHeight
          setShown({
            x: side ?? Math.min(box.left, window.innerWidth - wide - 4),
            y: side !== null ? Math.max(8, Math.min(box.top, window.innerHeight - 280)) : above ? box.top - 8 : box.bottom + 8,
            above,
            private: found.private,
            title: found.thought ? '' : found.title || cut(read.split('\n')[0], 80) || 'New note',
            thought: found.thought,
            line: !!block,
            el: block && line ? link : undefined,
            lost: !!block && !line,
            text: found.thought ? cut(found.body as string, 900) : cut(text, 420),
            kind: found.became ? (found.became.type === 'nugget' ? 'idea' : found.became.type) : kind,
            aside: !binned && !['task', 'person', 'tag', 'pdf', 'web', 'thought', 'footnote'].includes(type),
            type: found.became?.type ?? type,
            id: found.became?.id ?? id,
            queue: !binned && !['task', 'person', 'tag', 'goal', 'pdf', 'web', 'thought', 'footnote'].includes(type),
            gem: found.gem,
            binned,
            row,
            anchor: link,
            picture: found.picture !== undefined ? found.picture : binned ? null : pictureIn(found.body),
            lead: found.lead,
            cast: found.cast,
            // A name that opens its own way (an offer's, beside the note) says so; a tag, anywhere, opens as a link does.
            foot: link.getAttribute('data-note-foot') ?? (type === 'tag' ? `${clicks(false)}.` : undefined),
            tally: found.tally,
            latest: found.latest
          })
          warmTill = Infinity
        })
      }, Date.now() < warmTill ? 0 : 500)
    }
    document.addEventListener('mousemove', onOver)
    // A footnote's mark clicked goes to its note, its words now under the caret: no card, nor one on its way.
    const onPress = (event: PointerEvent): void => {
      if (!(event.target as Element | null)?.closest?.('[data-note^="footnote:"]')) return
      clearTimeout(timer)
      pressed = (event.target as Element).closest('[data-note^="footnote:"]')
      over = null
      setShown(null)
    }
    document.addEventListener('pointerdown', onPress, true)
    // Not on a key: the card has keys of its own (Esc puts it away).
    const stop = hideForMenus(() => (clearTimeout(timer), (over = null), setShown(null)), { keys: false })
    return () => {
      stop()
      clearTimeout(timer)
      clearTimeout(leaving)
      document.removeEventListener('mousemove', onOver)
      document.removeEventListener('pointerdown', onPress, true)
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
  // Kept whole in the window: moved in from any edge it would cross, 12px clear, as menus are.
  const place = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const card = place.current
    if (!shown || !card) return
    const fit = (): void => {
      const box = card.getBoundingClientRect()
      if (box.right > window.innerWidth - 12) card.style.left = `${Math.max(12, window.innerWidth - 12 - box.width)}px`
      if (box.bottom > window.innerHeight - 12) Object.assign(card.style, { top: `${Math.max(12, window.innerHeight - 12 - box.height)}px`, bottom: '' })
      if (box.top < 12) Object.assign(card.style, { top: '12px', bottom: '' })
    }
    fit()
    // Again whenever it grows: a person's summary and picture come in after it opens, and the card must stay inside then too.
    const sizes = new ResizeObserver(fit)
    sizes.observe(card)
    return () => sizes.disconnect()
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
  // A face round, any other picture with soft corners: small, beside the title, as a contact card shows one.
  const picture = shown.picture ? (
    <img data-preview-image src={small(shown.picture)} alt="" draggable={false} onError={(event) => (event.currentTarget.style.display = 'none')}
      className={`size-10 shrink-0 border object-cover ${shown.type === 'person' ? 'rounded-full' : 'rounded-md'}`} style={{ objectPosition: 'center 22%' }} />
  ) : null
  return (
    <div
      // Private words stay blurred here as in any list, unless shown on purpose.
      data-private={shown.private ? '' : undefined}
      role="tooltip"
      data-note-preview
      data-preview-picture={shown.picture ? '' : undefined}
      onMouseLeave={() => setShown(null)}
      ref={place}
      // One size and shape for every card, a picture or not: a picture is a small one beside the title, never a tall panel.
      className={`fixed z-[70] w-80 max-w-[calc(100vw-1.5rem)] p-3 text-control ${CARD} animate-in fade-in-0 duration-150 motion-reduce:animate-none`}
      // Above its link it hangs from its bottom edge, not lifted by a transform: the
      // fade-in's own transform replaced that lift while it ran, so the card first
      // landed on the pointer, then jumped off it and shut as the pointer "left" it, over and over.
      style={{ left: Math.max(12, shown.x), ...(shown.above ? { bottom: window.innerHeight - shown.y } : { top: shown.y }) }}
    >
      {shown.thought ? (
        <p data-preview-kind className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {shown.thought.kind ? <FootnoteIcon className="size-3.5 shrink-0" /> : <MessageSquareText className="size-3.5 shrink-0" />}
          <span>{shown.thought.kind ?? 'Thought'}</span>
          {shown.thought.when && <><span aria-hidden>·</span>
          <span className="tabular-nums">{shown.thought.when}</span></>}
        </p>
      ) : shown.gem ? (
        <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Gem className="size-3.5 shrink-0" style={{ color: 'var(--tt-color-text-pink)' }} />
          A gem: an idea you kept, in your own words
        </p>
      ) : shown.type === 'person' ? (
        <p data-preview-kind className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {/* One picture per person: with a portrait beside the name, the kind's own figure would be a second face (17 Nov, "why 2 avatars"). */}
          {!shown.picture && (shown.cast ? <VenetianMask className="size-3.5 shrink-0" /> : <UserRound className="size-3.5 shrink-0" />)}
          {shown.cast ? 'Character' : 'Person'}
        </p>
      ) : look && !shown.lead && (
        <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <look.icon className="size-3.5 shrink-0" style={{ color: `var(--tt-color-text-${look.color})` }} />
          {look.label}
        </p>
      )}
      {/* A person: one lead sentence, the name in bold, as an encyclopedia opens. */}
      {shown.thought ? null : shown.lead !== undefined ? (
        <div className="mb-1.5 flex items-start gap-2.5">
          <p data-preview-title className="private-text min-w-0 flex-1 text-foreground"><span className="font-semibold">{shown.title}</span>{shown.lead && <span> {shown.lead}</span>}</p>
          {picture}
        </div>
      ) : (
        <div className="mb-1 flex items-start gap-2.5">
          <p data-preview-title className="private-text line-clamp-3 min-w-0 flex-1 font-semibold hyphens-auto [overflow-wrap:break-word] text-foreground">{shown.title}</p>
          {picture}
        </div>
      )}
      {/* One line linked: that line, as it reads now, in full ink, marked as a quote of the note. */}
      {shown.line ? (
        shown.lost
          ? <p data-preview-line className="text-foreground">That line is not in the note any more.</p>
          : <p data-preview-line className="private-text line-clamp-6 whitespace-pre-line rounded-md bg-foreground/[0.04] px-2.5 py-2 text-foreground">{shown.text}</p>
      ) : shown.thought ? (
        // Its words in full ink: a thought is read, not glanced at.
        <p data-preview-text className="private-text max-h-[10lh] overflow-hidden whitespace-pre-line hyphens-auto [overflow-wrap:break-word] text-foreground [mask-image:linear-gradient(to_bottom,black_8lh,transparent_10lh)]">{shown.text}</p>
      ) : shown.text && (
        // A few lines that fade out where they are cut, not a hard stop mid-word.
        <p data-preview-text className="private-text max-h-[7.5lh] overflow-hidden whitespace-pre-line text-muted-foreground [mask-image:linear-gradient(to_bottom,black_5.5lh,transparent_7.5lh)]">{shown.text}</p>
      )}
      {shown.tally && <p data-preview-count className={`${shown.text ? 'mt-1.5 ' : ''}text-body text-foreground`}>{shown.tally}</p>}
      {!!shown.latest?.length && (
        <ul data-preview-latest className="private-text mt-1.5 flex flex-col gap-0.5 text-foreground">
          {shown.latest.map((title, at) => <li key={at} className="truncate">{title}</li>)}
        </ul>
      )}
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
      {/* The foot only when it has something to say: a row's own title has no "Click to open" and no actions. */}
      {/* A thought's foot: the note it is on. */}
      {shown.thought?.on && (
        <div data-preview-on className="mt-2 flex min-w-0 items-center gap-1.5 border-t pt-2 text-xs text-muted-foreground">
          <span className="shrink-0">On</span>
          <span className="private-text truncate font-medium text-foreground">{shown.thought.on}</span>
        </div>
      )}
      {/* A preview only: what can be done with it is in its right-click menu (Open to the side, Add to queue, Read next, Show the line here). */}
      {!shown.thought && (shown.binned || !shown.row || shown.foot) && (
      <p data-preview-foot className="mt-2 border-t pt-2 text-xs text-muted-foreground">
        {shown.binned ? 'In the Bin. Click the row to look inside, or Space to see it large.' : shown.foot ? shown.foot : `${clicks(shown.aside)}. Right-click for more.`}
      </p>
      )}
    </div>
  )
}

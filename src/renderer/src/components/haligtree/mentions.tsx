import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useReading } from '@/lib/reads-in'
import { enqueue } from '@/lib/reading-queue'
import { AliveIcon } from '@/components/ui/alive-icon'
import LinkIcon from '@/components/ui/link-icon'
import DotsHorizontalIcon from '@/components/ui/dots-horizontal-icon'
import { tagHue } from '@/extensions/tokens'

import { chime } from '@/lib/sound'
import { useThumb } from '@/lib/notes'
import { openApart, openSmall, smallHolds } from '@/lib/apart'
import { canSplit, openItems } from '@/lib/split'
import { RowMenu, copyLinkItem, openFromGrip, type RowItem } from './row-menu'
import { unloaded, unread, haligtree } from '@/lib/haligtree'
import { Thumb } from './note-extras'
import { Count, Tags, Tip, VirtualList, quietly, refuse, toast } from './ui'
import { taskName } from '@/lib/tasks'
import { Tilt } from './tilt'
import { ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { glideWay } from '@/lib/motion'
import { num, plural } from '../../../../main/dates'
import { hoverNote } from './note-preview'
import { canLink, dismissed, linkMany } from './note-offers'
import type { Editor } from '@tiptap/core'
import { quoted } from '../../../../main/clip'

type Found = Awaited<ReturnType<typeof haligtree.mentions>>
type Related = Awaited<ReturnType<typeof haligtree.related>>

/**
 * Under the note, as Obsidian keeps them: every note that links here, with
 * the line it does it in, and every note that names this one without a link
 * yet. One press makes that mention a link. Unlinked ones start folded.
 */
export function Mentions({ id, onOpen, compact = false, editor }: {
  id: string
  onOpen?: (type: string, id: string) => void
  /** Under the box's editor: a single folded line until it is opened, so the writing keeps the room. */
  compact?: boolean
  /** The open note's editor: with it, a note this one names can be linked from its row, in the words that name it. */
  editor?: Editor | null
}): React.JSX.Element | null {
  const [found, setFound] = useState<Found | null>(null)
  // Names linked from here a moment ago: out of the list at once, before the note's next save has it read again.
  const [linkedNow, setLinkedNow] = useState<string[]>([])
  const [unfolded, setUnfolded] = useState(false)
  const [namedOpen, setNamedOpen] = useState(false)
  const [related, setRelated] = useState<Related>(() => unread([]))
  const [shown, setShown] = useState(() => {
    try {
      return localStorage.getItem('mf-box-mentions') === 'open'
    } catch {
      return false
    }
  })
  const show = (open: boolean): void => {
    chime(open ? 'slide' : 'fold')
    setShown(open)
    try {
      localStorage.setItem('mf-box-mentions', open ? 'open' : 'shut')
    } catch {
      // Folded again next time; it still opens now.
    }
  }
  useEffect(() => {
    const load = (): void => {
      void haligtree.mentions(id).then((now) => (setFound(now), setLinkedNow([])))
      void haligtree.related(id).then(setRelated)
    }
    load()
    // Again once things settle, not on every keystroke of an autosave.
    let timer: ReturnType<typeof setTimeout> | undefined
    // Its own autosaves change what it links to and names, so they count
    // too, once the typing has paused a little longer.
    const stop = window.api.captures.onChange((what) => {
      clearTimeout(timer)
      timer = setTimeout(load, what?.every((one) => one.id === id) ? 2500 : 1500)
    })
    return () => {
      clearTimeout(timer)
      stop()
    }
  }, [id])
  // Whatever it sits in waits for both (lib/reads-in.tsx): the links, then the related a beat later, moved what was under them.
  useReading(!found || unloaded(related))
  // A link put away with the offer's × ("Not for this note") is not asked again here: the same pair, the same answer.
  const keyOf = (type: string, one: string): string => (type === 'capture' ? one : `${type}:${one}`)
  const away = dismissed()
  const named = (found?.named ?? []).filter((one) => !linkedNow.includes(keyOf(one.type, one.id)) && !away.has(`${keyOf(found?.me ?? 'capture', id)}|link:${keyOf(one.type, one.id)}`))
  // Those whose words stand plain in the open note, where a link can go: each gets "Link", and "Link all" counts them.
  // Looked for only while the list is unfolded, and once for each list read (never on every draw: a long note is long to walk).
  const linkable = useMemo(
    () => (namedOpen && editor ? named.filter((one) => one.words && canLink(editor, one.words)) : []),
    [namedOpen, editor, found, linkedNow] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const linkHere = (list: typeof named): void => {
    if (!editor || !list.length) return
    const made = linkMany(editor, list.map((one) => ({ words: one.words ?? '', id: keyOf(one.type, one.id), label: taskName(one.title).text || 'New note' })))
    if (!made) return refuse('Could not link it here: the name is split by formatting, or already a link. Use @ to link it by hand')
    chime('noted')
    const keys = list.map((one) => keyOf(one.type, one.id))
    setLinkedNow((was) => [...was, ...keys])
    // One notice and one Undo, for one name or for the lot: they went in as one step.
    toast(made === 1 ? `Linked ${quoted(taskName(list[0].title).text || 'New note', 80)}` : `Linked ${plural(made, 'note')}`, () => (editor.commands.undo(), setLinkedNow((was) => was.filter((one) => !keys.includes(one)))))
  }
  // The lists show twenty: past that the heading says "20+", never a count of what it does not list.
  const more = (found as { more?: { unlinked: boolean; named: boolean } } | null)?.more
  if (!found || !(found.linked.length || found.unlinked.length || found.out.length || named.length || related.length)) return null

  // `link` makes the plain mention a link: in the other note, or in this one.
  const row = (one: Found['linked'][number], link?: () => Promise<{ was: string; linked: string } | false>, here?: () => void): React.JSX.Element => {
    const linkIt = here ?? ((): void => void link?.().then((done) => {
      if (!done) return refuse('Could not link it there: the name is split by formatting, or already a link. Use @ to link it by hand')
      chime('pin')
      // The row moves to the linked list in front of you; ⌘Z puts the other note's words back.
      quietly(() => void haligtree.unlinkMention(one.type, one.id, done.was, done.linked))
    }))
    // Right-click, as on every row: open it where you like, link it, copy a link to it.
    const items: RowItem[] = [
      { label: 'Open', run: () => onOpen?.(one.type, one.id) },
      ...openItems(one.type, one.id),
      { label: 'Open in a new window', run: () => openApart(one.type, one.id) },
      ...(smallHolds(one.type) ? [{ label: 'Open in a small window', hint: 'Keeps writing there while quick capture stays free', run: () => openSmall(one.type, one.id) }] : []),
      'separator',
      (!!link || !!here) && { label: here ? 'Link it' : 'Link this mention', run: linkIt },
      copyLinkItem(one.type === 'capture' ? one.id : `${one.type}:${one.id}`, one.title)
    ]
    return (
    <RowMenu key={one.id} items={items}>
    <div data-private={one.private ? '' : undefined} className="group flex items-start gap-2 rounded-md px-2 hover:bg-accent/50">
      {/* The row's height is the button's own: a press anywhere on the row opens it. */}
      <button type="button" data-row className="min-w-0 flex-1 py-1.5 text-left" onClick={() => onOpen?.(one.type, one.id)}>
        <span className="flex min-w-0 items-center gap-1.5"><span dir="auto" {...hoverNote(one.type, one.id)} className="private-text min-w-0 truncate font-medium text-foreground">{taskName(one.title).text || 'New note'}</span><Tags tags={taskName(one.title).tags} /></span>
        {one.snippet && <span className="private-text line-clamp-2 text-control text-muted-foreground">{one.snippet}</span>}
      </button>
      {(link || here) && (
        <Tip label={here ? 'Make its name here a link to it' : 'Make this mention a link'}>
          <button
            type="button"
            aria-label="Link it"
            className="mt-1.5 flex min-h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-control text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
            onClick={linkIt}
          >
            <AliveIcon icon={LinkIcon} size={14} /> Link
          </button>
        </Tip>
      )}
    </div>
    </RowMenu>
    )
  }

  // What is here, in a few words, for the folded line.
  const counts = [
    found.linked.length && `${num(found.linked.length)} linked`,
    found.out.length && `${num(found.out.length)} out`,
    found.unlinked.length && `${num(found.unlinked.length)} unlinked`,
    related.length && `${num(related.length)} related`,
  ].filter(Boolean).join(' · ')
  if (compact && !shown) {
    return (
      <section data-chrome data-mentions className="page-narrow mx-auto mt-10 mb-6 w-full border-t px-[4.5rem] pt-3 text-body">
        <button type="button" onClick={() => show(true)} className="flex items-center gap-1 rounded-md px-2 py-1 text-meta text-muted-foreground hover:bg-accent/50 hover:text-foreground">
          <ChevronRight className="size-3" />
          Mentions <span className="tabular-nums text-muted-foreground">{counts}</span>
        </button>
      </section>
    )
  }

  return (
    <section data-chrome data-mentions className={`page-narrow mx-auto w-full border-t text-body ${compact ? 'mt-10 mb-6 px-[4.5rem] pt-3' : 'mt-16 mb-16 px-10 pt-6'}`}>
      {compact && (
        <button type="button" onClick={() => show(false)} className="mb-1 flex items-center gap-1 rounded-md px-2 py-1 text-meta text-muted-foreground hover:bg-accent/50 hover:text-foreground">
          <ChevronRight className="size-3 rotate-90" />
          Mentions <span className="tabular-nums text-muted-foreground">{counts}</span>
        </button>
      )}
      {found.linked.length > 0 && (
        <>
          <h3 className="mb-1 px-2 text-meta text-muted-foreground">{num(found.linked.length)} linked {found.linked.length === 1 ? "mention" : "mentions"}</h3>
          <Rows list={found.linked} row={row} />
        </>
      )}
      {found.unlinked.length > 0 && (
        <>
          <button type="button" onClick={() => (chime(unfolded ? 'fold' : 'slide'), setUnfolded(!unfolded))} className="mt-2 mb-0.5 flex min-h-6 items-center gap-1 rounded-md px-2 text-meta text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <ChevronRight className={`size-3 transition-transform ${unfolded ? 'rotate-90' : ''}`} />
            {num(found.unlinked.length)}{more?.unlinked ? '+' : ''} unlinked {found.unlinked.length === 1 ? 'mention' : 'mentions'}
          </button>
          {unfolded && <Rows list={found.unlinked} row={(one) => row(one, () => haligtree.linkMention(one.type, one.id, id))} />}
        </>
      )}
      {/* The other way: what this note links to, and the notes it names
          without a link yet, folded like the unlinked mentions above. */}
      {found.out.length > 0 && (
        <>
          <h3 className="mt-3 mb-1 px-2 text-meta text-muted-foreground">{plural(found.out.length, "link")} out</h3>
          <Rows list={found.out} row={row} />
        </>
      )}
      {named.length > 0 && (
        <>
          {/* The heading that folds the list, and at the row's far end what can be done to the whole list. */}
          <div className="mt-2 mb-0.5 flex items-center gap-2">
          <button type="button" data-named-fold onClick={() => (chime(namedOpen ? 'fold' : 'slide'), setNamedOpen(!namedOpen))} className="flex min-h-6 items-center gap-1 rounded-md px-2 text-meta text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <ChevronRight className={`size-3 transition-transform ${namedOpen ? 'rotate-90' : ''}`} />
            Names {num(named.length)}{more?.named ? '+' : ''} other {named.length === 1 ? 'note' : 'notes'} without a link
          </button>
          {namedOpen && linkable.length > 1 && (
            <button type="button" data-link-all onClick={() => linkHere(linkable)}
              className="mr-2 ml-auto flex min-h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-control text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <AliveIcon icon={LinkIcon} size={14} /> Link all {num(linkable.length)}
            </button>
          )}
          </div>
          {/* Each name can be linked where it stands, in the open note's own editor (so ⌘Z takes it back as any
              edit); "Link all" does every one listed in one step, with one notice and one Undo. */}
          {namedOpen && <Rows list={named} row={(one) => row(one, undefined, linkable.includes(one) ? () => linkHere([one]) : undefined)} />}
        </>
      )}
      {related.length > 0 && <RelatedRow cards={related} onOpen={onOpen} />}
    </section>
  )
}

/** One kind of mention, drawn only where it is in view: a note named by hundreds stays quick to open. */
function Rows({ list, row }: { list: Found['linked']; row: (one: Found['linked'][number]) => React.JSX.Element }): React.JSX.Element {
  return <VirtualList items={list} keyOf={(one) => `${one.type}:${one.id}`} estimate={52} rowClass="">{(one) => row(one)}</VirtualList>
}

/**
 * Notes that share tags with this one, as a row of small cards: its first
 * picture or a few of its words, its name, and the tags they share. The row
 * scrolls sideways; the round arrows page it when it runs past the edge.
 */
function RelatedRow({ cards, onOpen }: { cards: Related; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const strip = useRef<HTMLDivElement>(null)
  const [ends, setEnds] = useState({ start: true, end: true })
  useLayoutEffect(() => {
    const element = strip.current
    if (!element) return
    // The same ends as before draw nothing again: the row is not drawn afresh on every frame it scrolls.
    const measure = (): void => {
      const start = element.scrollLeft < 2
      const end = element.scrollLeft + element.clientWidth > element.scrollWidth - 2
      setEnds((was) => (was.start === start && was.end === end ? was : { start, end }))
    }
    measure()
    element.addEventListener('scroll', measure, { passive: true })
    const watch = new ResizeObserver(measure)
    watch.observe(element)
    return () => (element.removeEventListener('scroll', measure), watch.disconnect())
  }, [cards])
  const page = (way: 1 | -1): void => {
    const element = strip.current
    if (!element) return
    chime('slide')
    element.scrollBy({ left: way * element.clientWidth * 0.8, behavior: glideWay() })
  }
  // Faded only on a side with more past it, so a row that fits has hard edges.
  const fade = `linear-gradient(to right, ${ends.start ? '#000' : 'transparent'}, #000 2rem, #000 calc(100% - 2rem), ${ends.end ? '#000' : 'transparent'})`
  const arrow = (way: 1 | -1, hidden: boolean): React.JSX.Element => (
    <Tip label={way > 0 ? 'More' : 'Back'}>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => page(way)}
        className={`absolute top-12 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-full border bg-popover text-foreground shadow-sm transition-[opacity,scale] duration-150 ease-out hover:bg-accent active:scale-95 ${way > 0 ? '-right-3' : '-left-3'} ${hidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      >
        {way > 0 ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
      </button>
    </Tip>
  )
  return (
    <div className="mt-5">
      <h3 className="mb-1.5 px-2 text-meta text-muted-foreground">
        Related, by shared tags <Count n={cards.length} className="ml-1" />
      </h3>
      <div className="relative">
        {arrow(-1, ends.start)}
        <div
          ref={strip}
          className="flex snap-x snap-proximity scroll-px-2 gap-3 overflow-x-auto px-2 pt-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ maskImage: fade }}
        >
          {cards.map((card) => <RelatedCard key={card.id} card={card} onOpen={onOpen} />)}
        </div>
        {arrow(1, ends.end)}
      </div>
    </div>
  )
}

function RelatedCard({ card, onOpen }: { card: Related[number]; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const picture = useThumb(card.id)
  // A picture tips toward the pointer; a card of words stays put.
  const Frame = picture ? Tilt : 'span'
  // One menu, from its ⋯ and from a right click, as every row's: where to open it, the queue, a link to it.
  const items: RowItem[] = [
    { label: 'Open', run: () => onOpen?.(card.type, card.id) },
    ...openItems(card.type, card.id),
    { label: 'Open in a new window', run: () => openApart(card.type, card.id) },
    ...(smallHolds(card.type) ? [{ label: 'Open in a small window', hint: 'Keeps writing there while quick capture stays free', run: () => openSmall(card.type, card.id) }] : []),
    'separator',
    { label: 'Add to queue', run: () => void enqueue([card.id]) },
    { label: 'Read next', run: () => void enqueue([card.id], true) },
    'separator',
    copyLinkItem(card.type === 'capture' ? card.id : `${card.type}:${card.id}`, card.title)
  ]
  return (
    <RowMenu items={items}>
    <div data-private={card.private ? '' : undefined} className="group/card relative w-40 shrink-0 snap-start transition-transform duration-200 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:focus-within:-translate-y-0.5">
      <button
        type="button"
        data-row
        onClick={(event) => (event.metaKey && !canSplit() ? openApart(card.type, card.id) : onOpen?.(card.type, card.id))}
        className="block w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] transition-transform duration-150 ease-out"
      >
        <Frame className="block h-24 overflow-hidden rounded-lg border bg-muted/50 transition-colors group-hover/card:border-foreground/20">
          {picture ? (
            <Thumb id={card.id} className="size-full rounded-none border-0" />
          ) : (
            <span className="private-text line-clamp-4 pt-2 pr-8 pl-2.5 text-xs leading-relaxed text-muted-foreground">{card.excerpt || ' '}</span>
          )}
        </Frame>
        <span dir="auto" {...hoverNote(card.type, card.id)} className="private-text mt-1.5 block truncate px-0.5 text-sm font-medium text-foreground">{taskName(card.title).text || 'New note'}</span>
        <span className="private-text block truncate px-0.5 text-xs">
          {card.shared.map((tag, at) => (
            <span key={tag}>
              {at > 0 && <span className="text-muted-foreground"> · </span>}
              <span style={{ color: `var(--tt-color-text-${tagHue(tag)})` }}>#{tag}</span>
            </span>
          ))}
        </span>
      </button>
      {/* Its right-click menu, opened under it: one menu, two ways in. No tip: the card is itself a surface. */}
      <button
        type="button"
        aria-label="More"
        data-related-dots
        onClick={openFromGrip}
        className="absolute top-1.5 right-1.5 flex size-6 cursor-pointer items-center justify-center rounded-full shrink-0 border bg-popover text-muted-foreground opacity-0 shadow-sm transition-opacity duration-150 group-hover/card:opacity-100 hover:text-foreground focus-visible:opacity-100 active:scale-[0.97] motion-reduce:active:scale-100"
      >
        <AliveIcon icon={DotsHorizontalIcon} size={14} />
      </button>
    </div>
    </RowMenu>
  )
}

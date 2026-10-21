import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { enqueue } from '@/lib/reading-queue'
import { AliveIcon } from '@/components/ui/alive-icon'
import LinkIcon from '@/components/ui/link-icon'
import DotsHorizontalIcon from '@/components/ui/dots-horizontal-icon'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { tagHue } from '@/extensions/tokens'

import { chime } from '@/lib/sound'
import { useThumb } from '@/lib/notes'
import { openApart } from '@/lib/apart'
import { asideItem, canSplit, openAside } from '@/lib/split'
import { noteLinkText } from '@/lib/capture-links'
import { RowMenu, copy, type RowItem } from './row-menu'
import { vigil } from '@/lib/vigil'
import { Thumb } from './note-extras'
import { Tags, Tip, quietly, refuse } from './ui'
import { taskName } from '@/lib/tasks'
import { Tilt } from './tilt'
import { ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { still } from '@/lib/motion'

type Found = Awaited<ReturnType<typeof vigil.mentions>>
type Related = Awaited<ReturnType<typeof vigil.related>>

/**
 * Under the note, as Obsidian keeps them: every note that links here, with
 * the line it does it in, and every note that names this one without a link
 * yet. One press makes that mention a link. Unlinked ones start folded.
 */
export function Mentions({ id, onOpen, compact = false }: {
  id: string
  onOpen?: (type: string, id: string) => void
  /** Under the box's editor: a single folded line until it is opened, so the writing keeps the room. */
  compact?: boolean
}): React.JSX.Element | null {
  const [found, setFound] = useState<Found | null>(null)
  const [unfolded, setUnfolded] = useState(false)
  const [namedOpen, setNamedOpen] = useState(false)
  const [related, setRelated] = useState<Related>([])
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
      void vigil.mentions(id).then(setFound)
      void vigil.related(id).then(setRelated)
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
  if (!found || !(found.linked.length || found.unlinked.length || found.out.length || found.named.length || related.length)) return null

  // `link` makes the plain mention a link: in the other note, or in this one.
  const row = (one: Found['linked'][number], link?: () => Promise<{ was: string; linked: string } | false>): React.JSX.Element => {
    const linkIt = (): void => void link?.().then((done) => {
      if (!done) return refuse('Could not link it there: the name is split by formatting, or already a link. Use @ to link it by hand')
      chime('pin')
      // The row moves to the linked list in front of you; ⌘Z puts the other note's words back.
      quietly(() => void vigil.unlinkMention(one.type, one.id, done.was, done.linked))
    })
    // Right-click, as on every row: open it where you like, link it, copy a link to it.
    const items: RowItem[] = [
      { label: 'Open', run: () => onOpen?.(one.type, one.id) },
      asideItem(one.type, one.id),
      { label: 'Open in a new window', run: () => openApart(one.type, one.id) },
      'separator',
      !!link && { label: 'Link this mention', run: linkIt },
      { label: 'Copy link', hint: 'Paste it into any note to link here', run: () => copy(noteLinkText(one.type === 'capture' ? one.id : `${one.type}:${one.id}`, one.title), 'Copied a link: paste it into any note') }
    ]
    return (
    <RowMenu key={one.id} items={items}>
    <div data-private={one.private ? '' : undefined} className="group flex items-start gap-2 rounded-md px-2 hover:bg-accent/50">
      {/* The row's height is the button's own: a press anywhere on the row opens it. */}
      <button type="button" data-row className="min-w-0 flex-1 py-1.5 text-left" onClick={() => onOpen?.(one.type, one.id)}>
        <span className="flex min-w-0 items-center gap-1.5"><span className="private-text min-w-0 truncate font-medium text-foreground">{taskName(one.title).text || 'Untitled'}</span><Tags tags={taskName(one.title).tags} /></span>
        {one.snippet && <span className="private-text line-clamp-2 text-control text-muted-foreground">{one.snippet}</span>}
      </button>
      {link && (
        <Tip label="Make this mention a link">
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
    found.linked.length && `${found.linked.length} linked`,
    found.out.length && `${found.out.length} out`,
    found.unlinked.length && `${found.unlinked.length} unlinked`,
    related.length && `${related.length} related`,
  ].filter(Boolean).join(' · ')
  if (compact && !shown) {
    return (
      <section data-chrome className="page-narrow mx-auto mt-4 mb-6 w-full border-t px-[4.5rem] pt-2 text-body">
        <button type="button" onClick={() => show(true)} className="flex items-center gap-1 rounded-md px-2 py-1 text-meta text-muted-foreground hover:bg-accent/50 hover:text-foreground">
          <ChevronRight className="size-3" />
          Mentions <span className="tabular-nums opacity-70">{counts}</span>
        </button>
      </section>
    )
  }

  return (
    <section data-chrome className={`page-narrow mx-auto w-full border-t text-body ${compact ? 'mt-4 mb-6 px-[4.5rem] pt-2' : 'mt-6 mb-16 px-10 pt-4'}`}>
      {compact && (
        <button type="button" onClick={() => show(false)} className="mb-1 flex items-center gap-1 rounded-md px-2 py-1 text-meta text-muted-foreground hover:bg-accent/50 hover:text-foreground">
          <ChevronRight className="size-3 rotate-90" />
          Mentions <span className="tabular-nums opacity-70">{counts}</span>
        </button>
      )}
      {found.linked.length > 0 && (
        <>
          <h3 className="mb-1 px-2 text-meta text-muted-foreground">{found.linked.length} linked {found.linked.length === 1 ? 'mention' : 'mentions'}</h3>
          {found.linked.map((one) => row(one))}
        </>
      )}
      {found.unlinked.length > 0 && (
        <>
          <button type="button" onClick={() => (chime(unfolded ? 'fold' : 'slide'), setUnfolded(!unfolded))} className="mt-2 mb-0.5 flex min-h-6 items-center gap-1 rounded-md px-2 text-meta text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <ChevronRight className={`size-3 transition-transform ${unfolded ? 'rotate-90' : ''}`} />
            {found.unlinked.length} unlinked {found.unlinked.length === 1 ? 'mention' : 'mentions'}
          </button>
          {unfolded && found.unlinked.map((one) => row(one, () => vigil.linkMention(one.type, one.id, id)))}
        </>
      )}
      {/* The other way: what this note links to, and the notes it names
          without a link yet, folded like the unlinked mentions above. */}
      {found.out.length > 0 && (
        <>
          <h3 className="mt-3 mb-1 px-2 text-meta text-muted-foreground">{found.out.length} {found.out.length === 1 ? 'link' : 'links'} out</h3>
          {found.out.map((one) => row(one))}
        </>
      )}
      {found.named.length > 0 && (
        <>
          <button type="button" onClick={() => (chime(namedOpen ? 'fold' : 'slide'), setNamedOpen(!namedOpen))} className="mt-2 mb-0.5 flex min-h-6 items-center gap-1 rounded-md px-2 text-meta text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <ChevronRight className={`size-3 transition-transform ${namedOpen ? 'rotate-90' : ''}`} />
            Names {found.named.length} other {found.named.length === 1 ? 'note' : 'notes'} without a link
          </button>
          {/* No Link button here: this note is open and being written, so its words
              change under the editor's feet. @ links them in place. */}
          {namedOpen && found.named.map((one) => row(one))}
        </>
      )}
      {related.length > 0 && <RelatedRow cards={related} onOpen={onOpen} />}
    </section>
  )
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
    const measure = (): void => setEnds({ start: element.scrollLeft < 2, end: element.scrollLeft + element.clientWidth > element.scrollWidth - 2 })
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
    const calm = still()
    element.scrollBy({ left: way * element.clientWidth * 0.8, behavior: calm ? 'auto' : 'smooth' })
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
        Related, by shared tags <span className="ml-1 tabular-nums opacity-60">{cards.length}</span>
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
  return (
    <div data-private={card.private ? '' : undefined} className="group/card relative w-40 shrink-0 snap-start transition-transform duration-200 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:focus-within:-translate-y-0.5">
      <button
        type="button"
        data-row
        onClick={(event) => (event.metaKey ? openApart(card.type, card.id) : onOpen?.(card.type, card.id))}
        className="block w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] transition-transform duration-150 ease-out"
      >
        <Frame className="block h-24 overflow-hidden rounded-lg border bg-muted/50 transition-colors group-hover/card:border-foreground/20">
          {picture ? (
            <Thumb id={card.id} className="size-full rounded-none border-0" />
          ) : (
            <span className="private-text line-clamp-4 pt-2 pr-8 pl-2.5 text-xs leading-relaxed text-muted-foreground">{card.excerpt || ' '}</span>
          )}
        </Frame>
        <span className="private-text mt-1.5 block truncate px-0.5 text-sm font-medium text-foreground">{taskName(card.title).text || 'Untitled'}</span>
        <span className="private-text block truncate px-0.5 text-xs">
          {card.shared.map((tag, at) => (
            <span key={tag}>
              {at > 0 && <span className="text-muted-foreground"> · </span>}
              <span style={{ color: `var(--tt-color-text-${tagHue(tag)})` }}>#{tag}</span>
            </span>
          ))}
        </span>
      </button>
      <DropdownMenu modal={false}>
        <Tip label="More">
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More"
              className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full border bg-popover text-muted-foreground opacity-0 shadow-sm transition-opacity duration-150 group-hover/card:opacity-100 hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100"
            >
              <AliveIcon icon={DotsHorizontalIcon} size={14} />
            </button>
          </DropdownMenuTrigger>
        </Tip>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => onOpen?.(card.type, card.id)}>Open</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openApart(card.type, card.id)}>Open in a new window</DropdownMenuItem>
          {canSplit() && <DropdownMenuItem onSelect={() => openAside(card.type, card.id)}>Open to the side<DropdownMenuShortcut>⌥-click</DropdownMenuShortcut></DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => void enqueue([card.id])}>Add to queue</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void enqueue([card.id], true)}>Read next</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

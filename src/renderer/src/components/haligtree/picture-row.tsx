import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useInView } from 'motion/react'
import { useStill } from '@/lib/motion'
import { num } from '../../../../main/dates'
import type { FlexCarouselItem } from './flex-carousel'
import { RowMenu, type RowItem } from './row-menu'

const FlexCarousel = lazy(() => import('./flex-carousel'))

/**
 * A row of pictures flowing through glass at its edges (React Bits' Flex
 * Carousel, flex-carousel.tsx), in a box of its own height so nothing on the
 * page moves as it comes in. Its WebGL starts only once the row is on screen.
 * With Motion off or Reduce motion it is a still row of the same height,
 * scrolled sideways, drawing only the pictures in view.
 */
export function PictureRow({ items, onOpen, menuFor, direct = false, counter = 'of', label = 'Pictures', cardHeight = 0.52, height, className = '' }: {
  items: FlexCarouselItem[]
  onOpen: (index: number) => void
  /** A card's right-click menu: the one that thing has everywhere else. Off a card, the middle one's. */
  menuFor?: (index: number) => RowItem[]
  /** A click opens at once (and ← → ↵ work), rather than first bringing the picture close. */
  direct?: boolean
  counter?: 'of' | 'slash'
  label?: string
  cardHeight?: number
  /** The row's height in px: the room it keeps, moving or still. */
  height: number
  className?: string
}): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const seen = useInView(box, { once: true, margin: '200px' })
  const quiet = useStill()
  // A row that fits whole is a still row, like Home's other shelves: nothing to move through, so nothing moves.
  // Only once there are more pictures than fit does it become the flowing row.
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const sized = new ResizeObserver(() => setWidth(el.clientWidth))
    sized.observe(el)
    setWidth(el.clientWidth)
    return () => sized.disconnect()
  }, [])
  const fits = width > 0 && items.length * (stillCardWidth(items, height) + GAP) - GAP <= width
  const still = quiet || fits
  // The card under the pointer, read as the menu opens.
  const under = useRef(-1)
  const menu = menuFor && ((): RowItem[] => {
    const active = Number(box.current?.querySelector<HTMLElement>('[data-flex-carousel]')?.dataset.active ?? 0)
    return menuFor(under.current >= 0 ? under.current : active)
  })
  // Grown past fitting, the still row stays up until the moving row has its pictures, so the place is never empty.
  const wasStill = useRef(false)
  const [drawn, setDrawn] = useState(false)
  if (still) wasStill.current = true
  const bridging = !still && wasStill.current && !drawn
  const carousel = (
    <FlexCarousel onReady={() => setDrawn(true)} items={items} cardHeight={cardHeight} onOpen={onOpen} onUnder={(at) => (under.current = at)} direct={direct} counter={counter} label={label} />
  )
  return (
    // Its own clicks and drags stay its own. (The moving row fades out at its sides itself, inside its turn buttons.)
    <div ref={box} data-picture-row={still ? 'still' : 'moving'} onClick={(event) => event.stopPropagation()} style={{ height }}
      className={`relative ${className}`}>
      {still ? (
        <StillRow items={items} onOpen={onOpen} menuFor={menuFor} counter={counter} label={label} height={height} whole={fits} />
      ) : (
        seen && (
          // Coming in, it arrives once, as it will stay: its room kept empty while its code and pictures load, then the
          // moving row faded in whole with the right picture in the middle. Never the still row first, then a swap.
          <Suspense fallback={bridging ? <StillRow items={items} onOpen={onOpen} menuFor={menuFor} counter={counter} label={label} height={height} whole={false} /> : null}>
            {bridging && <div className="absolute inset-0 z-10"><StillRow items={items} onOpen={onOpen} menuFor={menuFor} counter={counter} label={label} height={height} whole={false} /></div>}
            <div data-picture-row-shown={drawn || undefined} className={`size-full transition-opacity duration-200 ease-(--mf-ease) ${drawn || wasStill.current ? 'opacity-100' : 'opacity-0'}`}>
              {menu ? <RowMenu items={menu}><div className="size-full">{carousel}</div></RowMenu> : carousel}
            </div>
          </Suspense>
        )
      )}
    </div>
  )
}

const GAP = 12
/** Under each picture: its title and its line. */
const WORDS = 44
/** The room under the pictures: a line more when a note has two (a book's page, then the day you finish it), the pictures a little shorter for it. */
const wordsRoom = (items: FlexCarouselItem[]): number => WORDS + (items.some((item) => item.note?.includes('\n')) ? 17 : 0)
/** One width for every still picture, from the first one's shape. */
const stillCardWidth = (items: FlexCarouselItem[], height: number): number =>
  Math.round(Math.max(40, height - wordsRoom(items) - 12) * Math.min(Math.max(items[0]?.aspect ?? 0.8, 0.6), 1.5))

/** The still row: one shape for every picture, so only those in view are drawn, however many there are. */
function StillRow({ items, onOpen, menuFor, counter, label, height, whole = false }: { items: FlexCarouselItem[]; onOpen: (index: number) => void; menuFor?: (index: number) => RowItem[]; counter: 'of' | 'slash'; label: string; height: number; /** All of it fits: no fade at its end. */ whole?: boolean }): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null)
  const picH = Math.max(40, height - wordsRoom(items) - 12)
  const cardW = stillCardWidth(items, height)
  const [range, setRange] = useState<[number, number]>([0, 12])
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = (): void => {
      const from = Math.max(0, Math.floor(el.scrollLeft / (cardW + GAP)) - 2)
      const to = Math.min(items.length, Math.ceil((el.scrollLeft + el.clientWidth) / (cardW + GAP)) + 2)
      setRange((was) => (was[0] === from && was[1] === to ? was : [from, to]))
    }
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const sized = new ResizeObserver(measure)
    sized.observe(el)
    return () => (el.removeEventListener('scroll', measure), sized.disconnect())
  }, [cardW, items.length])
  return (
    <div ref={scroller} role="list" aria-label={label} className={`h-full overflow-x-auto overflow-y-hidden pb-2 ${whole ? '' : '[mask-image:linear-gradient(to_right,#000_94%,transparent)]'}`}>
      <div className="relative h-full" style={{ width: items.length * (cardW + GAP) - GAP }}>
        {items.slice(range[0], range[1]).map((item, i) => {
          const at = range[0] + i
          const place = counter === 'slash' ? `${num(at + 1).padStart(2, '0')} / ${num(items.length).padStart(2, '0')}` : `${num(at + 1)} of ${num(items.length)}`
          const card = (
            <button key={at} type="button" role="listitem" onClick={() => onOpen(at)} data-still-picture={at}
              className="group absolute top-0 flex cursor-pointer flex-col gap-1.5 rounded-lg text-left outline-none transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
              style={{ left: at * (cardW + GAP), width: cardW }}>
              <StillPicture src={item.src} height={picH} pdf={item.pdf} />
              <span className="truncate text-control font-medium text-foreground">{item.title || 'Untitled'}</span>
              {/* A note of two lines (a book's page, then the day you finish it) keeps both, each whole. */}
              <span className={`-mt-1 text-meta text-muted-foreground tabular-nums group-hover:text-foreground ${item.note?.includes('\n') ? 'line-clamp-2 whitespace-pre-line' : 'truncate'}`}>{item.note ?? place}</span>
            </button>
          )
          return menuFor ? <RowMenu key={at} items={menuFor(at)}>{card}</RowMenu> : card
        })}
      </div>
    </div>
  )
}

function StillPicture({ src, height, pdf }: { src: FlexCarouselItem['src']; height: number; pdf?: FlexCarouselItem['pdf'] }): React.JSX.Element {
  const [url, setUrl] = useState(typeof src === 'string' ? src : null)
  useEffect(() => {
    if (typeof src === 'string') return setUrl(src)
    let live = true
    void src().then((made) => live && setUrl(made ?? null), () => undefined)
    return () => void (live = false)
  }, [src])
  return (
    // A book's cover pages through under the pointer in its own box (pdf-peek.tsx draws the page over it): nothing moves.
    <span className={`relative block w-full overflow-hidden rounded-[10px] bg-accent${pdf ? ' pdf-face-cover' : ''}`} style={{ height }}
      data-pdf-peek={pdf?.src} data-pdf-peek-name={pdf?.name} data-pdf-peek-scrub={pdf ? '' : undefined}>
      {url && <img src={url} alt="" draggable={false} decoding="async" className="size-full object-cover" />}
    </span>
  )
}

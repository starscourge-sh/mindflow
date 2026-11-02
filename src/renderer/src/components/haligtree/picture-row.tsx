import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useInView } from 'motion/react'
import { useStill } from '@/lib/motion'
import { num } from '../../../../main/dates'
import type { FlexCarouselItem } from './flex-carousel'

const FlexCarousel = lazy(() => import('./flex-carousel'))

/**
 * A row of pictures flowing through glass at its edges (React Bits' Flex
 * Carousel, flex-carousel.tsx), in a box of its own height so nothing on the
 * page moves as it comes in. Its WebGL starts only once the row is on screen.
 * With Motion off or Reduce motion it is a still row of the same height,
 * scrolled sideways, drawing only the pictures in view.
 */
export function PictureRow({ items, onOpen, direct = false, counter = 'of', label = 'Pictures', cardHeight = 0.52, height, className = '' }: {
  items: FlexCarouselItem[]
  onOpen: (index: number) => void
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
  const still = useStill()
  return (
    // Its own clicks and drags stay its own. Its sides fade out, so a picture leaves the row rather than being cut off.
    <div ref={box} data-picture-row={still ? 'still' : 'moving'} onClick={(event) => event.stopPropagation()} style={{ height }}
      className={`relative ${still ? '' : '[mask-image:linear-gradient(to_right,transparent,#000_7%,#000_93%,transparent)]'} ${className}`}>
      {still ? (
        <StillRow items={items} onOpen={onOpen} counter={counter} label={label} height={height} />
      ) : (
        seen && (
          <Suspense fallback={null}>
            <FlexCarousel key={items.length} items={items} cardHeight={cardHeight} onOpen={onOpen} direct={direct} counter={counter} label={label} />
          </Suspense>
        )
      )}
    </div>
  )
}

const GAP = 12
/** Under each picture: its title and its line. */
const WORDS = 44

/** The still row: one shape for every picture, so only those in view are drawn, however many there are. */
function StillRow({ items, onOpen, counter, label, height }: { items: FlexCarouselItem[]; onOpen: (index: number) => void; counter: 'of' | 'slash'; label: string; height: number }): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null)
  const picH = Math.max(40, height - WORDS - 12)
  const shape = items[0]?.aspect ?? 0.8
  const cardW = Math.round(picH * Math.min(Math.max(shape, 0.6), 1.5))
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
    <div ref={scroller} role="list" aria-label={label} className="h-full overflow-x-auto overflow-y-hidden pb-2 [mask-image:linear-gradient(to_right,#000_94%,transparent)]">
      <div className="relative h-full" style={{ width: items.length * (cardW + GAP) - GAP }}>
        {items.slice(range[0], range[1]).map((item, i) => {
          const at = range[0] + i
          const place = counter === 'slash' ? `${num(at + 1).padStart(2, '0')} / ${num(items.length).padStart(2, '0')}` : `${num(at + 1)} of ${num(items.length)}`
          return (
            <button key={at} type="button" role="listitem" onClick={() => onOpen(at)} data-still-picture={at}
              className="group absolute top-0 flex cursor-pointer flex-col gap-1.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ left: at * (cardW + GAP), width: cardW }}>
              <StillPicture src={item.src} height={picH} />
              <span className="truncate text-control font-medium text-foreground">{item.title || 'Untitled'}</span>
              <span className="-mt-1 truncate text-meta text-muted-foreground tabular-nums group-hover:text-foreground">{item.note ?? place}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StillPicture({ src, height }: { src: FlexCarouselItem['src']; height: number }): React.JSX.Element {
  const [url, setUrl] = useState(typeof src === 'string' ? src : null)
  useEffect(() => {
    if (typeof src === 'string') return setUrl(src)
    let live = true
    void src().then((made) => live && setUrl(made ?? null), () => undefined)
    return () => void (live = false)
  }, [src])
  return (
    <span className="block w-full overflow-hidden rounded-[10px] bg-accent" style={{ height }}>
      {url && <img src={url} alt="" draggable={false} decoding="async" className="size-full object-cover" />}
    </span>
  )
}

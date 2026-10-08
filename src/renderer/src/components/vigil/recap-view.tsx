import { lazy, Suspense, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { AnimatePresence, animate, motion, MotionGlobalConfig, useInView, useMotionValue, useReducedMotion, useTransform, type Variants } from 'motion/react'
import { alive } from '@/components/ui/alive-icon'
import XIcon from '@/components/ui/x-icon'

import { chime } from '@/lib/sound'
import { vigil, type Mood, type Recap as Data, splitTags } from '@/lib/vigil'
import { notes, smallPicture } from '@/lib/notes'
import { Kbd, Rolling, Typed } from './ui'
import { Button } from '@/components/ui/button'
import { Scenery } from './scenery'
import { RecapRadar, readShape } from './recap-radar'
import { EASE, shift } from '@/lib/motion'
import { dayjs, dayName, noon, num } from '../../../../main/dates'

// WebGL and its library, fetched only when a strip of pictures is first shown.
const FlexCarousel = lazy(() => import('./flex-carousel'))

// itshover drawings in lucide's place, moving when their control is pointed at.
const X = alive(XIcon)

/** The light each page sits in: the year opens at dawn and closes at night. */
const RECAP_MOODS: Record<string, Mood> = { intro: 'day', captures: 'day', shape: 'day', busiest: 'day', tags: 'dusk', sources: 'dusk', pictures: 'dusk', exits: 'interior', reviewed: 'night', outro: 'night', none: 'night' }

const PAGE_MOTION: Variants = {
  // Whole transforms: each page counts and types as it lands, and a slide
  // left to the main thread would stutter under that.
  enter: (dir: number) => ({ opacity: 0, transform: shift(`translateX(${28 * dir}px)`) }),
  show: () => ({ opacity: 1, transform: shift('translateX(0px)'), transition: { duration: 0.35, ease: EASE } }),
  // Out on the same quick-to-answer curve: an ease-in held the old page back
  // at the very moment the arrow was pressed.
  leave: (dir: number) => ({ opacity: 0, transform: shift(`translateX(${-20 * dir}px)`), transition: { duration: 0.14, ease: EASE } })
}

const plural = (n: number, one: string, many: string): string => `${num(n)} ${n === 1 ? one : many}`

/** How long a count takes, in seconds after its 0.25s wait. */
const counting = (n: number): number => Math.min(1.6, 0.6 + Math.log10(n + 1) * 0.3)

/**
 * A number counted up from nothing as its page arrives, fast at first and
 * easing into its place, the way a total is added up in front of you. Figures
 * of one width, so the line holds still as it climbs. With Motion off, motion
 * skips straight to the total.
 */
function CountUp({ n }: { n: number }): React.JSX.Element {
  const value = useMotionValue(0)
  const shown = useTransform(value, (at) => num(Math.round(at)))
  useEffect(() => {
    const run = animate(value, n, { duration: counting(n), delay: 0.25, ease: [0.16, 1, 0.3, 1] })
    return () => run.stop()
  }, [n, value])
  return <motion.span aria-label={num(n)}>{shown}</motion.span>
}

/** A big number that counts up into place, with what it counts under it. */
function Big({ n, children }: { n: number; children: ReactNode }): React.JSX.Element {
  return (
    <div>
      <div className="text-[clamp(3rem,12vw,6rem)] leading-none font-semibold tabular-nums text-foreground"><CountUp n={n} /></div>
      <div className="mt-2 text-heading text-muted-foreground">{children}</div>
    </div>
  )
}

/** A short ranked list, each row arriving a beat after the one above. */
function Ranked({ rows, prefix = '' }: { rows: { name: string; n: number }[]; prefix?: string }): React.JSX.Element {
  return (
    <ol className="space-y-2">
      {rows.map((row, index) => (
        <motion.li key={row.name} initial={{ opacity: 0, transform: shift('translateX(-12px)') }} animate={{ opacity: 1, transform: shift('translateX(0px)') }} transition={{ delay: 0.4 + index * 0.05, ease: EASE }}
          className="flex items-baseline gap-3 text-heading">
          <span className="w-6 text-muted-foreground tabular-nums">{index + 1}</span>
          <span className="flex-1 truncate text-foreground">{prefix}{row.name}</span>
          <span className="text-muted-foreground tabular-nums"><Rolling text={row.n} /></span>
        </motion.li>
      ))}
    </ol>
  )
}

type Picture = { src: string; title: string; type: string; id: string }

/** Fewer than this, and a strip of them would only look empty. */
export const FEW_PICTURES = 5
/** More than this are thinned out evenly: each one is a picture held in memory. */
const MOST_PICTURES = 36

/**
 * The pictures in the captures and notes made between two times, oldest
 * first, each with its note's name. Private notes are left out, as the recap
 * never names them, and so is everything when list pictures are turned off.
 */
export function usePicturesFrom(since: string | null, until: string | null): Picture[] | null {
  const [pictures, setPictures] = useState<Picture[] | null>(null)
  useEffect(() => {
    if (!since || !until) return
    let live = true
    setPictures(null)
    void (async () => {
      // A month at a time: one ask stops at 400 things, and a year can hold more.
      const asks: Promise<Awaited<ReturnType<typeof vigil.recent>>>[] = []
      for (let end = dayjs(until); end.isAfter(since); end = end.subtract(31, 'day')) asks.push(vigil.recent(31, end.toISOString()))
      const [months, thumbs, settings] = await Promise.all([Promise.all(asks), notes.thumbs(), vigil.settings()])
      if ((settings as { thumbnails?: boolean }).thumbnails === false) return live && setPictures([])
      const seen = new Set<string>()
      const found = months.flat()
        .filter((one) => one.type !== 'task' && !one.private && thumbs[one.id] && one.at >= since && one.at < until && !seen.has(one.id) && seen.add(one.id))
        .sort((a, b) => a.at.localeCompare(b.at))
      const kept = found.length > MOST_PICTURES ? Array.from({ length: MOST_PICTURES }, (_, at) => found[Math.floor((at * found.length) / MOST_PICTURES)]) : found
      // Made small by the main process. Only a picture it could read is kept:
      // the strip draws with WebGL, which takes a picture's pixels only from here.
      const made = await Promise.all(kept.map((one) => smallPicture(thumbs[one.id], true).catch(() => '')))
      if (live) setPictures(kept.flatMap((one, at) => made[at].startsWith('data:image/') ? [{ src: made[at], title: splitTags(one.title).text, type: one.type, id: one.id }] : []))
    })()
    return () => void (live = false)
  }, [since, until])
  return pictures
}

/** Opens the note a picture came from, in its own section here. */
const openPicture = (picture: Picture): void => (chime('open'), window.api.openInHome(picture.type, picture.id))

/**
 * A strip of the pictures, flowing through glass at its edges (React Bits'
 * Flex Carousel). Its WebGL is only started once the strip is on screen.
 * With Motion off or Reduce motion it is a still row instead, scrolled
 * sideways. A click on a picture brings it close; a second opens its note.
 * Nothing at all with fewer than five.
 */
export function PictureStrip({ pictures, className = '' }: { pictures: Picture[] | null; className?: string }): React.JSX.Element | null {
  const box = useRef<HTMLDivElement>(null)
  const seen = useInView(box, { once: true })
  const reduced = useReducedMotion()
  if (!pictures || pictures.length < FEW_PICTURES) return null
  if (reduced || MotionGlobalConfig.skipAnimations)
    return (
      <div className={`-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 ${className}`}>
        {pictures.map((picture) => (
          <button key={picture.id} type="button" onClick={() => openPicture(picture)} className="group flex w-max shrink-0 flex-col gap-1.5 text-left">
            <img src={picture.src} alt="" draggable={false} className="h-40 w-auto rounded-[10px] bg-accent object-cover" />
            <span className="max-w-48 truncate text-meta text-muted-foreground group-hover:text-foreground">{picture.title || 'Untitled'}</span>
          </button>
        ))}
      </div>
    )
  return (
    // Its own clicks and drags stay its own: the recap's click turns the page.
    // Its sides fade out, so a picture leaves the row rather than being cut off.
    <div ref={box} onClick={(event) => event.stopPropagation()} className={`h-[25rem] [mask-image:linear-gradient(to_right,transparent,#000_7%,#000_93%,transparent)] ${className}`}>
      {seen && (
        <Suspense fallback={null}>
          <FlexCarousel key={pictures.map((picture) => picture.id).join()} items={pictures} cardHeight={0.52} onOpen={(at) => openPicture(pictures[at])} />
        </Suspense>
      )}
    </div>
  )
}

/**
 * A month or a year here, Wrapped's way (Notesnook's, for notes): a few
 * pages, one thing each, stepped through with the arrow keys. Only pages
 * with something to say are shown.
 */
export function Recap({ period, onClose }: { period: 'month' | 'year'; onClose: () => void }): React.JSX.Element {
  const [data, setData] = useState<Data | null>(null)
  const [at, setAt] = useState(0)
  // Which way the last step went, so a page slides in from the side you are heading to.
  const [dir, setDir] = useState(1)
  useEffect(() => void vigil.recap(period).then(setData), [period])
  // The same span the recap counts: a month already over when it says so.
  const opened = dayjs().startOf(period)
  const pictures = usePicturesFrom(
    data ? (data.finished ? opened.subtract(1, period) : opened).toISOString() : null,
    data ? (data.finished ? opened.toISOString() : dayjs().endOf('day').toISOString()) : null
  )
  // The pages are settled once, so none slips in under you: the pictures if
  // they are ready within a moment, and otherwise the recap goes on without.
  const [strip, setStrip] = useState<Picture[] | null | undefined>(undefined)
  useEffect(() => {
    if (pictures) setStrip((was) => (was === undefined ? pictures : was))
  }, [pictures])
  useEffect(() => {
    if (!data) return
    const late = setTimeout(() => setStrip((was) => (was === undefined ? null : was)), 1500)
    return () => clearTimeout(late)
  }, [data])

  const pages: ReactNode[] = !data || strip === undefined ? [] : data.captures === 0 ? [
    <p key="none" className="text-title"><Typed story text={data.finished ? `Nothing was captured in ${data.label}.` : `Nothing was captured in ${data.label} yet. Come back when there is.`} /></p>
  ] : [
    <div key="intro" className="space-y-3">
      <p className="text-heading text-muted-foreground">Your recap</p>
      <h2 className="text-[clamp(2.5rem,9vw,4.5rem)] leading-none font-semibold text-foreground">{data.label}</h2>
      <p className="text-muted-foreground"><Typed story text="What you caught, kept and came back to. → to go on." /></p>
    </div>,
    <div key="captures" className="space-y-8">
      <Big n={data.captures}>{data.captures === 1 ? 'thing caught' : 'things caught'}</Big>
      {data.words > 0 && <Big n={data.words}>{data.words === 1 ? 'word in them' : 'words in them'}</Big>}
    </div>,
    // The shape of it: what kinds of thing, read back in a line.
    (data.kinds ?? []).length > 0 && (
      <div key="shape" className="grid items-center gap-x-12 gap-y-4 sm:grid-cols-[minmax(0,1fr)_min(30rem,60vh)]">
        <p className="text-title"><Typed story text={readShape(data.kinds)} /></p>
        <RecapRadar kinds={data.kinds} before={data.before} />
      </div>
    ),
    data.busiestDay && (
      <div key="busiest" className="space-y-4 text-title">
        {data.busiestMonth && <p><Typed story text={`Your busiest month was ${data.busiestMonth.name}, with ${plural(data.busiestMonth.n, 'capture', 'captures')}.`} /></p>}
        <p><Typed story delay={data.busiestMonth ? 1800 : 700} text={`Your busiest day was ${dayName(noon(data.busiestDay.name), 'never')}: ${plural(data.busiestDay.n, 'capture', 'captures')}.`} /></p>
      </div>
    ),
    // What you read, and what you kept from it: the books, most lines first.
    (data.books ?? []).some((book) => book.finished) && (
      <div key="books" className="space-y-5">
        <p className="text-title"><Typed story text={`You read ${plural(data.books.filter((book) => book.finished).length, 'book', 'books')} and kept ${plural(data.books.reduce((sum, book) => sum + book.lines, 0), 'line', 'lines')} from them.`} /></p>
        <Ranked rows={[...data.books].sort((a, b) => b.lines - a.lines).slice(0, 5).map((book) => ({ name: book.by ? `${book.title}, ${book.by}` : book.title, n: book.lines }))} />
      </div>
    ),
    data.tags.length > 0 && (
      <div key="tags" className="space-y-5">
        <p className="text-title"><Typed story text="What it gathered around" /></p>
        <Ranked rows={data.tags} prefix="#" />
      </div>
    ),
    data.sources.length > 0 && (
      <div key="sources" className="space-y-5">
        <p className="text-title"><Typed story text="Who you listened to" /></p>
        <Ranked rows={data.sources} />
      </div>
    ),
    strip && strip.length >= FEW_PICTURES && (
      <div key="pictures" className="space-y-2">
        <p className="text-title"><Typed story text={`What you saw in ${data.label}`} /></p>
        <PictureStrip pictures={strip} className="-mx-4" />
      </div>
    ),
    data.kept + data.resolved + data.discarded > 0 && (
      <div key="exits" className="space-y-6">
        <p className="text-title"><Typed story text={`You kept ${data.kept}, dealt with ${data.resolved} elsewhere and let go of ${data.discarded}.`} /></p>
        {/* Drawn at its widths and wiped in from the left: a clip, not widths, so nothing is laid out again. */}
        <motion.div initial={{ clipPath: 'inset(0 100% 0 0)' }} animate={{ clipPath: 'inset(0 0% 0 0)' }} transition={{ delay: 0.6, duration: 0.7, ease: EASE }} className="flex h-3 overflow-hidden rounded-full">
          {[[data.kept, 'var(--tt-color-text-purple)'], [data.resolved, 'var(--tt-color-text-green)'], [data.discarded, 'var(--tt-color-text-gray)']].map(([n, color], index) => Number(n) > 0 && (
            <div key={index} style={{ width: `${(Number(n) / (data.kept + data.resolved + data.discarded)) * 100}%`, background: String(color) }} />
          ))}
        </motion.div>
        <p className="text-muted-foreground">A discard keeps the promise as well as a keep does.</p>
      </div>
    ),
    data.mostReviewed && (
      <div key="reviewed" className="space-y-6">
        <Big n={data.reviews}>{data.reviews === 1 ? 'review' : 'reviews'}</Big>
        <p className="text-title">{/* Its turn once the count above has landed: one thing moving at a time. */}
        <Typed story delay={Math.round((0.25 + counting(data.reviews)) * 1000) + 100} text={`${data.reviewDays > 1 ? `On ${plural(data.reviewDays, 'day', 'different days')}. ` : ''}The one you came back to most: “${data.mostReviewed.title}”, ${plural(data.mostReviewed.n, 'time', 'times')}.`} /></p>
      </div>
    ),
    <div key="outro" className="space-y-3">
      <p className="text-title"><Typed story text={`That was ${data.label}.`} /></p>
      <p className="text-muted-foreground"><Typed story delay={1400} text="Nothing here is a score. It is only what happened." /></p>
    </div>
  ].filter(Boolean)

  const last = pages.length - 1
  const pageKey = String((pages[at] as ReactElement | undefined)?.key ?? 'none')
  const go = (to: number): void => {
    const next = Math.max(0, Math.min(last, to))
    if (next === at) return
    chime(next === last ? 'wrapped' : 'page')
    setDir(next > at ? 1 : -1)
    setAt(next)
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Escape') onClose()
      else if (['ArrowRight', ' ', 'Enter', 'l', 'j'].includes(event.key)) go(at + 1)
      else if (['ArrowLeft', 'h', 'k'].includes(event.key)) go(at - 1)
      else return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-40 flex flex-col bg-[color-mix(in_srgb,var(--tt-brand-color-400)_8%,var(--background))]"
      aria-label="Recap"
    >
      {/* Each page over a scene of its own mood: morning for the opening, night for the close. */}
      <Scenery place="recap" seed={`recap:${period}:${data?.label}:${pageKey}`} mood={[RECAP_MOODS[pageKey] ?? 'day']} text="left" className="absolute inset-0" />
      <div className="relative flex items-center gap-3 px-5 pt-4">
        {/* Where you are, as dots: nothing to fill before you have begun. */}
        <div className="flex flex-1 gap-1.5">
          {pages.map((_, index) => (
            <button key={index} type="button" aria-label={`Page ${index + 1}`} onClick={() => go(index)}
              className={`size-1.5 rounded-full transition-colors ${index === at ? 'bg-foreground' : 'bg-muted-foreground/30'}`} />
          ))}
        </div>
        <span className="text-xs text-muted-foreground"><Kbd>←</Kbd> <Kbd>→</Kbd></span>
        <Button variant="ghost" size="icon-sm" aria-label="Close the recap" onClick={onClose}><X /></Button>
      </div>
      {/* A click on the right half goes on, on the left goes back, as in a story. */}
      <div className="relative flex min-h-0 flex-1 items-center px-[8%]" onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect()
        go(event.clientX - box.left > box.width / 3 ? at + 1 : at - 1)
      }}>
        {/* Sideways, the way the arrows point: forward slides in from the right
            and leaves to the left, back the other way. The old page goes
            quickly, so the next one is never waited for. */}
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={at}
            custom={dir}
            variants={PAGE_MOTION}
            initial="enter"
            animate="show"
            exit="leave"
            // The recap's every line in the heading font: the one place the app
            // speaks at length, so it speaks in its own voice.
            className={`w-full font-heading ${pageKey === 'shape' ? 'max-w-5xl' : 'max-w-2xl'}`}
          >
            {pages[at]}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

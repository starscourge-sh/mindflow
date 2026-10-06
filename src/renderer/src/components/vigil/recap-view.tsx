import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type Variants } from 'motion/react'
import { alive } from '@/components/ui/alive-icon'
import XIcon from '@/components/ui/x-icon'

import { chime } from '@/lib/sound'
import { vigil, type Mood, type Recap as Data } from '@/lib/vigil'
import { Kbd, Rolling, Typed } from './ui'
import { Button } from '@/components/ui/button'
import { Scenery } from './scenery'
import { dayName, noon, num } from '../../../../main/dates'

// itshover drawings in lucide's place, moving when their control is pointed at.
const X = alive(XIcon)

/** The light each page sits in: the year opens at dawn and closes at night. */
const RECAP_MOODS: Record<string, Mood> = { intro: 'day', captures: 'day', busiest: 'day', tags: 'dusk', sources: 'dusk', exits: 'interior', reviewed: 'night', outro: 'night', none: 'night' }

const PAGE_MOTION: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: 28 * dir }),
  show: { opacity: 1, x: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
  leave: (dir: number) => ({ opacity: 0, x: -20 * dir, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] } })
}

const plural = (n: number, one: string, many: string): string => `${num(n)} ${n === 1 ? one : many}`

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
    const run = animate(value, n, { duration: Math.min(1.6, 0.6 + Math.log10(n + 1) * 0.3), delay: 0.25, ease: [0.16, 1, 0.3, 1] })
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
        <motion.li key={row.name} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + index * 0.05 }}
          className="flex items-baseline gap-3 text-heading">
          <span className="w-6 text-muted-foreground tabular-nums">{index + 1}</span>
          <span className="flex-1 truncate text-foreground">{prefix}{row.name}</span>
          <span className="text-muted-foreground tabular-nums"><Rolling text={row.n} /></span>
        </motion.li>
      ))}
    </ol>
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

  const pages: ReactNode[] = !data ? [] : data.captures === 0 ? [
    <p key="none" className="text-title"><Typed text={data.finished ? `Nothing was captured in ${data.label}.` : `Nothing was captured in ${data.label} yet. Come back when there is.`} /></p>
  ] : [
    <div key="intro" className="space-y-3">
      <p className="text-heading text-muted-foreground">Your recap</p>
      <h2 className="text-[clamp(2.5rem,9vw,4.5rem)] leading-none font-semibold text-foreground">{data.label}</h2>
      <p className="text-muted-foreground"><Typed text="What you caught, kept and came back to. → to go on." /></p>
    </div>,
    <div key="captures" className="space-y-8">
      <Big n={data.captures}>{data.captures === 1 ? 'thing caught' : 'things caught'}</Big>
      {data.words > 0 && <Big n={data.words}>{data.words === 1 ? 'word in them' : 'words in them'}</Big>}
    </div>,
    data.busiestDay && (
      <div key="busiest" className="space-y-4 text-title">
        {data.busiestMonth && <p><Typed text={`Your busiest month was ${data.busiestMonth.name}, with ${plural(data.busiestMonth.n, 'capture', 'captures')}.`} /></p>}
        <p><Typed delay={data.busiestMonth ? 1800 : 700} text={`Your busiest day was ${dayName(noon(data.busiestDay.name), 'never')}: ${plural(data.busiestDay.n, 'capture', 'captures')}.`} /></p>
      </div>
    ),
    data.tags.length > 0 && (
      <div key="tags" className="space-y-5">
        <p className="text-title"><Typed text="What it gathered around" /></p>
        <Ranked rows={data.tags} prefix="#" />
      </div>
    ),
    data.sources.length > 0 && (
      <div key="sources" className="space-y-5">
        <p className="text-title"><Typed text="Who you listened to" /></p>
        <Ranked rows={data.sources} />
      </div>
    ),
    data.kept + data.resolved + data.discarded > 0 && (
      <div key="exits" className="space-y-6">
        <p className="text-title"><Typed text={`You kept ${data.kept}, dealt with ${data.resolved} elsewhere and let go of ${data.discarded}.`} /></p>
        <div className="flex h-3 overflow-hidden rounded-full">
          {[[data.kept, 'var(--tt-color-text-purple)'], [data.resolved, 'var(--tt-color-text-green)'], [data.discarded, 'var(--tt-color-text-gray)']].map(([n, color], index) => Number(n) > 0 && (
            <motion.div key={index} initial={{ width: 0 }} animate={{ width: `${(Number(n) / (data.kept + data.resolved + data.discarded)) * 100}%` }} transition={{ delay: 0.6, duration: 0.7, ease: [0.16, 1, 0.3, 1] }} style={{ background: String(color) }} />
          ))}
        </div>
        <p className="text-muted-foreground">A discard keeps the promise as well as a keep does.</p>
      </div>
    ),
    data.mostReviewed && (
      <div key="reviewed" className="space-y-6">
        <Big n={data.reviews}>{data.reviews === 1 ? 'review' : 'reviews'}</Big>
        <p className="text-title"><Typed delay={1200} text={`The one you came back to most: “${data.mostReviewed.title}”, ${plural(data.mostReviewed.n, 'time', 'times')}.`} /></p>
      </div>
    ),
    <div key="outro" className="space-y-3">
      <p className="text-title"><Typed text={`That was ${data.label}.`} /></p>
      <p className="text-muted-foreground"><Typed delay={1400} text="Nothing here is a score. It is only what happened." /></p>
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
            className="w-full max-w-2xl font-heading"
          >
            {pages[at]}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

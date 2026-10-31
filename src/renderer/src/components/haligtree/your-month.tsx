import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, animate, motion, MotionGlobalConfig, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { haligtree, type Recap } from '@/lib/haligtree'
import { pdfCover } from '@/components/pdf/pdf-cover'
import { shareAsCard } from '@/lib/share-card'
import { chime } from '@/lib/sound'
import { Button } from '@/components/ui/button'
import { Kbd } from './ui'
import { Arc, DotMatrix } from './mono-card'
import { dayjs, num, plural } from '../../../../main/dates'

const EASE = [0.16, 1, 0.3, 1] as const

/** A number that rolls up from nothing as its card lands; with motion off, the number at once. */
function RollUp({ n, still }: { n: number; still: boolean }): React.JSX.Element {
  const value = useMotionValue(still ? n : 0)
  const shown = useTransform(value, (at) => num(Math.round(at)))
  useEffect(() => {
    if (still) return void value.set(n)
    const run = animate(value, n, { duration: Math.min(1.4, 0.5 + Math.log10(n + 1) * 0.3), delay: 0.15, ease: EASE })
    return () => run.stop()
  }, [n, still, value])
  return <motion.span data-month-number={n} aria-label={num(n)}>{shown}</motion.span>
}

/** Days studied, said kindly: never a streak to lose, only what was done. */
const daysSaid = (days: number, of: number): string =>
  days === 0 ? 'A month of other things. The cards will wait.' : days >= of - 1 ? 'Nearly every day. That is a habit now.' : days >= of / 2 ? 'More days than not.' : days >= 8 ? 'A few days most weeks, and it adds up.' : days >= 4 ? 'About once a week, and it adds up.' : 'A few days, and each one counts.'

type Card = { id: string; picture: ReactNode; line: string }

/**
 * "Your month", Wrapped's way: one card a screen, a big number or a picture
 * with one line, moved with ← and → or a click. It ends with Share (the card
 * sheet, made into an image) and "Next month starts now".
 */
export function YourMonth({ onClose }: { onClose: () => void }): React.JSX.Element | null {
  const [data, setData] = useState<Recap | null>(null)
  const [cover, setCover] = useState<string | null>(null)
  const [at, setAt] = useState(0)
  const still = !!useReducedMotion() || !!MotionGlobalConfig.skipAnimations
  const [onDay, sayDay] = useState<string | null>(null)
  useEffect(() => void haligtree.recap('month').then(setData), [])
  useEffect(() => void (data?.study?.book && pdfCover(data.study.book.src).then((one) => setCover(one?.image ?? null))), [data])
  const study = data?.study
  const name = data ? dayjs(data.label, 'MMMM YYYY').isValid() ? data.label.split(' ')[0] : data.label : ''
  const big = (n: number, what: string): ReactNode => (
    <div>
      <div className="font-serif text-[clamp(4rem,14vw,8rem)] leading-none font-semibold text-foreground tabular-nums"><RollUp n={n} still={still} /></div>
      <div className="mt-3 text-heading text-muted-foreground">{what}</div>
    </div>
  )
  const cards: Card[] = !data || !study ? [] : [
    { id: 'reviews', picture: big(data.reviews, data.reviews === 1 ? 'card reviewed' : 'cards reviewed'), line: data.reviews ? `That is ${plural(data.reviews, 'card', 'cards')} turned over in ${name}.` : 'No reviews this month. Your cards kept their place.' },
    { id: 'days', picture: <div className="w-[min(36rem,80vw)]"><div className="mb-6">{big(data.reviewDays, data.reviewDays === 1 ? 'day you studied' : 'days you studied')}</div><DotMatrix days={study.days} columns={2} dot={28} say={(one) => `${plural(one.n, 'review', 'reviews')}, ${dayjs(one.day).format('ddd D MMM')}`} onHover={sayDay} /><p className="mt-2 h-5 text-sm text-muted-foreground">{onDay}</p></div>, line: daysSaid(data.reviewDays, study.days.length) },
    { id: 'hours', picture: big(study.seconds >= 3600 ? Math.round(study.seconds / 3600) : Math.round(study.seconds / 60), study.seconds >= 3600 ? 'hours with your cards' : 'minutes with your cards'), line: 'Time well spent, a few minutes at a time.' },
    { id: 'retention', picture: <div className="w-[min(26rem,70vw)]"><Arc percent={study.checked ? Math.round((study.recalled / study.checked) * 100) : 0} label="" className="max-w-none" /><div className="-mt-[22%] font-serif text-[clamp(3rem,10vw,5.5rem)] leading-none font-semibold text-foreground tabular-nums"><RollUp n={study.checked ? Math.round((study.recalled / study.checked) * 100) : 0} still={still} />%</div><div className="mt-3 text-heading text-muted-foreground">remembered</div></div>, line: study.checked ? `You remembered ${num(study.recalled)} of ${num(study.checked)} cards you had seen before.` : 'Once a card comes back, this says how well it stayed.' },
    { id: 'new', picture: big(study.newCards, study.newCards === 1 ? 'new card' : 'new cards'), line: study.newCards ? 'New things you chose to keep.' : 'No new cards: a month for what you already have.' },
    ...(study.book ? [{ id: 'book', picture: cover ? <img src={cover} alt="" className="max-h-[42vh] rounded-md shadow-lg" /> : <div className="font-serif text-4xl text-foreground">{study.book.title}</div>, line: `The book you read most: ${study.book.title}.` }] : []),
    ...(data.tags[0] ? [{ id: 'tag', picture: <div className="font-serif text-[clamp(3rem,10vw,6rem)] leading-none font-semibold text-foreground">#{data.tags[0].name}</div>, line: `The tag you kept most, on ${plural(data.tags[0].n, 'note', 'notes')}.` }] : []),
    ...(study.longest ? [{ id: 'longest', picture: big(study.longest.days, study.longest.days === 1 ? 'day away' : 'days away'), line: `You still knew “${study.longest.title.length > 80 ? `${study.longest.title.slice(0, 80).replace(/\s+\S*$/, '')}…` : study.longest.title}” after ${plural(study.longest.days, 'day', 'days')}.` }] : []),
    ...(data.mostReviewed ? [{ id: 'idea', picture: <div className="max-w-xl font-serif text-[clamp(2rem,6vw,3.5rem)] leading-tight text-foreground text-balance">{data.mostReviewed.title}</div>, line: `The idea that came back most, ${plural(data.mostReviewed.n, 'time', 'times')}.` }] : []),
    ...(data.sources[0] ? [{ id: 'source', picture: <div className="max-w-xl font-serif text-[clamp(2rem,6vw,3.5rem)] leading-tight text-foreground text-balance">{data.sources[0].name}</div>, line: `The source you quoted most, ${plural(data.sources[0].n, 'time', 'times')}.` }] : []),
    ...(study.line ? [{ id: 'line', picture: <blockquote className="max-w-xl font-serif text-[clamp(1.6rem,4.5vw,2.6rem)] leading-snug text-foreground italic text-balance">“{study.line}”</blockquote>, line: `In your own words, in ${name}.` }] : []),
    { id: 'end', picture: <div className="font-serif text-[clamp(2.5rem,8vw,4.5rem)] leading-tight font-semibold text-foreground">That was {name}.</div>, line: 'Keep it, share it, or simply carry on.' }
  ]
  const last = cards.length - 1
  const go = (next: number): void => {
    if (next < 0 || next > last || next === at) return
    chime(next === last ? 'wrapped' : 'page')
    setAt(next)
  }
  useEffect(() => {
    const keys = (event: KeyboardEvent): void => {
      if (document.querySelector('[data-share-card]')) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
      else if (event.key === 'ArrowRight') { event.preventDefault(); go(at + 1) }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); go(at - 1) }
    }
    window.addEventListener('keydown', keys, true)
    return () => window.removeEventListener('keydown', keys, true)
  })
  if (!data || !study) return null
  const card = cards[Math.min(at, last)]
  const share = (): void => shareAsCard({
    words: `${name} in Haligtree: ${plural(data.reviews, 'card', 'cards')} reviewed on ${plural(data.reviewDays, 'day', 'days')}, ${plural(study.newCards, 'new card', 'new cards')}${study.checked ? `, ${Math.round((study.recalled / study.checked) * 100)}% remembered` : ''}.`,
    who: 'Your month', from: data.label
  })
  return (
    <div data-your-month data-card={card.id} data-at={at} className="fixed inset-0 z-[60] flex flex-col bg-background" onClick={(event) => event.target === event.currentTarget && go(at + 1)}>
      <div className="flex items-center gap-1.5 px-6 pt-14">
        {cards.map((one, index) => <button key={one.id} type="button" aria-label={`Card ${index + 1}`} onClick={() => go(index)} className={`h-1 flex-1 cursor-pointer rounded-full transition-colors ${index <= at ? 'bg-foreground' : 'bg-foreground/15'}`} />)}
      </div>
      <p className="px-6 pt-3 text-sm text-muted-foreground">Your {name}</p>
      <div className="relative flex flex-1 cursor-pointer items-center justify-center px-8" onClick={(event) => go(event.clientX < window.innerWidth / 3 ? at - 1 : at + 1)}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={card.id} data-month-card={card.id} className="flex cursor-default flex-col items-center gap-6 text-center" onClick={(event) => event.stopPropagation()}
            initial={still ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={still ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -8, transition: { duration: 0.12 } }} transition={{ duration: 0.3, ease: EASE }}>
            {card.picture}
            <p data-month-line className="max-w-lg text-body text-foreground/80 text-pretty">{card.line}</p>
            {card.id === 'end' && (
              <div className="flex gap-2">
                <Button variant="secondary" data-month-share onClick={share}>Share</Button>
                <Button data-month-done onClick={() => (chime('fold'), onClose())}>Next month starts now</Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <p className="flex justify-center gap-3 pb-6 text-xs text-muted-foreground"><span><Kbd>←</Kbd> <Kbd>→</Kbd> to move</span><span><Kbd>Esc</Kbd> to close</span></p>
    </div>
  )
}

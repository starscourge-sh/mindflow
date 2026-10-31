import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { EASE, shift, spring } from '@/lib/motion'
import { call } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { num } from '../../../../main/dates'

/** What main asks before a deck comes in (index.ts askApkg). */
type Ask = { id: string; reviewed: number; cards: number; names: string[]; topics: number; own: boolean; holdOver: number }

/** Two answers side by side, in the look of Review's tabs: the picked one raised. */
function Pick<T extends string>({ value, options, onPick, name }: { value: T; options: { id: T; label: string }[]; onPick: (id: T) => void; name: string }): React.JSX.Element {
  return (
    <span role="radiogroup" data-apkg-pick={name} className="flex h-9 w-full items-center rounded-lg border border-foreground/10 bg-accent/40 p-0.5 text-control">
      {options.map((one) => (
        <button key={one.id} type="button" role="radio" aria-checked={value === one.id} data-apkg-option={one.id}
          onClick={() => void (value !== one.id && (chime('tap'), onPick(one.id)))}
          className={`relative h-8 flex-1 cursor-pointer rounded-md px-3 transition-colors ${value === one.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          {value === one.id && <motion.span layoutId={`apkg-${name}`} className="absolute inset-0 -z-10 rounded-md border border-foreground/15 bg-background shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          {one.label}
        </button>
      ))}
    </span>
  )
}

/**
 * Before a shared deck comes in, in the app rather than a system dialog: its
 * maker's past reviews kept or started fresh (fresh for a downloaded deck,
 * kept for your own collection), and a big deck started whole or held until
 * you study each topic (held). Enter brings it in as picked; Esc as suggested.
 */
export function ApkgAskSheet(): React.JSX.Element {
  const [ask, setAsk] = useState<Ask | null>(null)
  const [reviews, setReviews] = useState<'fresh' | 'keep'>('fresh')
  const [start, setStart] = useState<'hold' | 'all'>('hold')
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onAsk = (event: Event): void => {
      const detail = (event as CustomEvent<Ask>).detail
      setReviews(detail.own ? 'keep' : 'fresh')
      setStart('hold')
      setAsk(detail)
      chime('open')
    }
    window.addEventListener('haligtree:apkg-ask', onAsk)
    return () => window.removeEventListener('haligtree:apkg-ask', onAsk)
  }, [])
  useEffect(() => void (ask && card.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()), [ask])
  if (!ask) return <AnimatePresence />
  const fresh = reviews === 'keep' ? ask.cards - Math.min(ask.reviewed, ask.cards) : ask.cards
  // One topic (a times table) is never held whole: it comes in at the new-card pace.
  const big = fresh > ask.holdOver && ask.topics > 1
  const answer = (keepReviews: boolean, hold: boolean): void => {
    chime('tap')
    void call('apkg:answer', ask.id, { keepReviews, hold })
    setAsk(null)
  }
  const suggested = (): void => answer(ask.own, big)
  const name = ask.names.join('; ') || 'This deck'
  return (
    <AnimatePresence>
      <motion.div key="apkg-ask" data-apkg-ask="" className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 pt-[16vh]"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.14 } }} transition={{ duration: 0.16 }}>
        <motion.div ref={card} role="dialog" aria-modal="true" aria-label={`Before ${name} comes in`}
          initial={{ opacity: 0, transform: shift('translateY(8px) scale(0.98)') }}
          animate={{ opacity: 1, transform: shift('translateY(0px) scale(1)') }}
          exit={{ opacity: 0, transform: shift('translateY(6px) scale(0.98)'), transition: { duration: 0.14, ease: EASE } }}
          transition={spring.slow}
          className="flex w-[min(32rem,92vw)] flex-col gap-4 rounded-xl bg-popover p-5 shadow-(--mf-panel-shadow)"
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape') (event.preventDefault(), suggested())
            if (event.key === 'Enter') (event.preventDefault(), answer(reviews === 'keep', big && start === 'hold'))
          }}>
          <div>
            <h2 className="font-serif text-2xl leading-tight text-foreground">{name}</h2>
            <p className="mt-1.5 text-body text-foreground/85">{num(ask.cards)} {ask.cards === 1 ? 'card' : 'cards'} to bring in, onto Review’s Decks shelf.</p>
          </div>
          {ask.reviewed > 0 && (
            <div className="grid gap-2">
              <p className="text-body text-foreground">
                <b className="font-semibold">It comes with past reviews for {num(ask.reviewed)} {ask.reviewed === 1 ? 'card' : 'cards'}.</b>{' '}
                {ask.own ? 'This is a whole Anki collection, so they are yours.' : 'A downloaded deck carries whoever made it’s reviews; keep them only if this is your own export.'}
              </p>
              <Pick name="reviews" value={reviews} onPick={setReviews} options={[{ id: 'fresh', label: 'Start these fresh' }, { id: 'keep', label: 'Keep the reviews' }]} />
            </div>
          )}
          {big && (
            <div className="grid gap-2">
              <p className="text-body text-foreground">
                <b className="font-semibold">{num(fresh)} new cards.</b> Start them all, or hold until you study each topic? Held cards wait on the shelf; start a topic when you read or watch it, and its cards will make sense.
              </p>
              <Pick name="start" value={start} onPick={setStart} options={[{ id: 'hold', label: 'Hold until I study each topic' }, { id: 'all', label: 'Start them all' }]} />
            </div>
          )}
          <div className="flex justify-end">
            <Button size="lg" data-autofocus="" data-apkg-go="" className="cursor-pointer" onClick={() => answer(reviews === 'keep', big && start === 'hold')}>Bring them in</Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

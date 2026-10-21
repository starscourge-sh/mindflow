import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Check } from 'lucide-react'

import { chime } from '@/lib/sound'
import { EASE, shift } from '@/lib/motion'
import { vigil, useLive, type Item, type TagRead } from '@/lib/vigil'
import { BUCKETS, keyWords, mentions, type Bucket } from '../../../../main/study'
import { num } from '../../../../main/dates'
import { textOf } from '../rot-cards'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Chips } from './display'
import { Rolling, Typed, refuse, toast } from './ui'
import { APP_NAME } from '../../../../main/name'

/**
 * Studying beyond the day's queue: the practice rounds above Review, the
 * card that keeps slipping and what to do with it, the shelf of the ones that
 * have slipped, a blurt on a tag's page, and the deck that teaches Vigil.
 * The rules behind them (the threshold, the buckets, the word match) are in
 * src/main/study.ts, shared with the main process and the tests.
 */

/** A card's question, or its name when it has none. */
const asked = (item: Pick<Item, 'prompt' | 'title'>): string => item.prompt || item.title || 'Untitled'

/**
 * The five practice rounds, a chip each with how many cards it holds: a
 * short extra round from all your gems. Choosing one moves no due date;
 * only grading a card does.
 */
export function FocusChips({ round, onPick, onLearn }: { round: Round | null; onPick: (bucket: Round) => void; onLearn?: () => void }): React.JSX.Element | null {
  const counts = useLive(vigil.buckets, null as Record<Round, number> | null, [], ['item'])
  if (!counts) return null
  // Only the rounds with cards in them (and the one you are in): a chip that can only say "nothing here" is not a choice.
  const rounds = [...BUCKETS, { id: 'starred' as const, label: 'Starred' }].filter((one) => counts[one.id] > 0 || one.id === round)
  return (
    <>
    {rounds.length > 0 && (
    <div data-focus-chips className="flex flex-wrap items-center gap-x-2 gap-y-1 px-5 pt-5 text-xs text-muted-foreground">
      {/* The row's name, a lead-in with a colon, so it never reads as a chip already chosen. */}
      <span data-focus-lead className="font-semibold text-foreground">Practise a round:</span>
      <Chips
        options={rounds.map((one) => ({ id: one.id, label: `${one.label} ${num(counts[one.id])}` }))}
        on={(id) => id === round}
        pick={(id) => {
          const bucket = id as Round
          if (!counts[bucket]) return refuse(bucket === 'starred' ? 'No starred cards yet: press S on a card in Review' : `Nothing in “${BUCKETS.find((one) => one.id === bucket)?.label}” right now`, 'info')
          onPick(bucket)
        }}
      />
    </div>
    )}
    {/* A line of its own under the chips: the new cards learnt in a guided round, rather than met a few a day. */}
    {onLearn && counts.new > 0 && (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-5 pt-2 text-sm">
        <span><strong className="font-semibold">{num(counts.new)} new {counts.new === 1 ? 'card' : 'cards'}.</strong> <span className="text-muted-foreground">Learn them in a guided round before they join the schedule.</span></span>
        <button type="button" data-learn-new onClick={() => (chime('open'), onLearn())}
          className="flex h-6 items-center rounded-md border px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent/60">
          Learn {counts.new > 8 ? 'the first 8' : counts.new === 1 ? 'it' : `the ${num(counts.new)}`}
        </button>
      </p>
    )}
    </>
  )
}

/** A practice round: one of the five buckets, or the cards you starred. */
export type Round = Bucket | 'starred'

/** Days as you would say them: "9 days", "3 hours", "20 minutes". */
const span = (days: number): string =>
  days >= 1.5 ? `${num(Math.round(days))} days` : days >= 1 ? 'a day' : days * 24 >= 1.5 ? `${num(Math.round(days * 24))} hours` : days * 1440 >= 1.5 ? `${num(Math.round(days * 1440))} minutes` : 'a minute'

/**
 * How it decides, said plainly, folded under the grades: the target you set,
 * how long this card holds, how sure you would be of it now, and why Good
 * brings it back when it does.
 */
export function HowItDecides({ id, back }: { id: string; back: { again: string; hard: string; good: string; easy: string } }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const why = useLive(() => (open ? vigil.why(id) : Promise.resolve(null)), null as Awaited<ReturnType<typeof vigil.why>>, [id, open])
  const target = why ? Math.round(why.retention * 100) : 90
  return (
    <details data-how open={open} onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)} className="-mt-2 text-sm text-muted-foreground">
      <summary className="cursor-pointer select-none text-xs hover:text-foreground">How it decides</summary>
      {why && (
        <div className="mt-2 flex flex-col gap-1.5 leading-relaxed">
          <p><strong className="font-semibold text-foreground">{APP_NAME} aims for you to still know {target}% of what comes back.</strong> You set that in Settings, Review: higher means more reviews.</p>
          {why.seen && why.stability !== null && why.recall !== null ? (
            <p>
              You have seen this card {num(why.reviews)} {why.reviews === 1 ? 'time' : 'times'}. It holds about {span(why.stability)} now: that long after a review you would still know it 9 times in 10.
              {why.lastDays !== null && ` You last saw it ${span(why.lastDays)} ago, so you would know it now about ${Math.round(why.recall * 100)}% of the time.`}
              {' '}Good brings it back {back.good}, when it would have faded to about {target}%. Hard brings it back {back.hard}, Easy {back.easy}, and Again {back.again}.
            </p>
          ) : (
            <p>A new card: its first grade sets how long it lasts. Good brings it back {back.good}, Hard {back.hard}, Easy {back.easy} and Again {back.again}.</p>
          )}
          {why.fitted && <p>How long a new card lasts is fitted to your own reviews (Settings, Review).</p>}
        </div>
      )}
    </details>
  )
}

/**
 * Fit the scheduler to you: after a thousand reviews, how long a new card
 * lasts after each first grade is worked out from your own next reviews,
 * and can be put back to the defaults.
 */
export function FitToMe(): React.JSX.Element | null {
  const state = useLive(vigil.fitState, null as Awaited<ReturnType<typeof vigil.fitState>> | null, [], ['item'])
  if (!state) return null
  const ready = state.reviews >= state.after
  const good = state.fitted?.[2]
  return (
    <span className="flex items-center gap-2" data-fit>
      <span className="text-muted-foreground tabular-nums">
        {state.fitted ? `Fitted: Good lasts ${good !== undefined ? span(good) : 'its own time'}` : ready ? `${num(state.reviews)} reviews` : `${num(state.reviews)} of ${num(state.after)} reviews`}
      </span>
      {state.fitted ? (
        <Button variant="ghost" size="sm" onClick={() => { const was = state.fitted; void vigil.setSettings({ fsrsFirst: null }).then(() => (chime('undo'), toast('Back to the defaults', () => void vigil.setSettings({ fsrsFirst: was })))) }}>Use the defaults</Button>
      ) : (
        <Button variant="outline" size="sm" disabled={!ready} onClick={() => void vigil.fit().then((made) => {
          if (!made) return refuse('Not yet: it needs a thousand reviews')
          chime('settled')
          toast(`Fitted from ${num(made.pairs)} cards: a new card graded “Good” now lasts about ${span(made.fitted[2])}, where the default is ${span(made.defaults[2])}`)
        })}>Fit now</Button>
      )}
    </span>
  )
}

/** What a practice round is, said once at its top. */
export function RoundLine({ round, onLeave }: { round: Round; onLeave: () => void }): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 px-5 pt-4 text-sm">
      <p className="flex-1">
        <strong className="font-semibold">{round === 'starred' ? 'Starred' : BUCKETS.find((one) => one.id === round)?.label}.</strong>{' '}
        <span className="text-muted-foreground">An extra round. Nothing moves unless you grade it.</span>
      </p>
      <Button variant="ghost" size="sm" onClick={onLeave}>Back to today’s cards</Button>
    </div>
  )
}

/**
 * The card that keeps slipping, on its fourth miss and after: three ways on.
 * Rewrite it (ask it better), split it (two smaller cards), or pause it
 * (out of Review until it is brought back). 1, 2 and 3 choose; Esc keeps going.
 */
export function Slipping({ card, splitting, onRewrite, onSplit, onAside, onKeep, onSplitDone }: {
  card: Item
  splitting: boolean
  onRewrite: () => void
  onSplit: () => void
  onAside: () => void
  onKeep: () => void
  onSplitDone: () => void
}): React.JSX.Element {
  const ways = [
    { key: '1', name: 'Rewrite it', line: 'Ask it a better way.', run: onRewrite },
    { key: '2', name: 'Split it', line: 'Two smaller cards.', run: onSplit },
    { key: '3', name: 'Pause it', line: 'Out of Review until you bring it back.', run: onAside }
  ]
  return (
    <motion.section aria-label="This one keeps slipping" data-slipping
      initial={{ opacity: 0, transform: shift('translateY(8px)') }} animate={{ opacity: 1, transform: shift('translateY(0px)') }} transition={{ duration: 0.24, ease: EASE }}
      className="flex flex-col gap-4 px-5 pt-6 pb-8">
      <div className="rounded-lg border border-[color-mix(in_srgb,var(--tt-color-text-orange)_35%,var(--border))] bg-[color-mix(in_srgb,var(--tt-color-text-orange)_7%,var(--background))] px-5 py-5">
        <h2 className="font-heading text-title font-semibold tracking-[-0.018em] text-[var(--tt-color-text-orange)]">
          <Typed text="This one keeps slipping" step={28} delay={60} />
        </h2>
        <p className="mt-2 text-base leading-relaxed">“{asked(card)}”</p>
        <p className="mt-1 text-sm text-muted-foreground">
          <strong className="font-semibold text-foreground">Missed {num(card.lapses)} times.</strong> A card missed again and again is usually asking too much at once, or the wrong thing.
        </p>
      </div>
      {splitting ? <SplitForm card={card} onDone={onSplitDone} onCancel={onKeep} /> : (
        <>
          <div className="@container grid grid-cols-1 gap-2 @md:grid-cols-3">
            {ways.map((way) => (
              <button key={way.key} type="button" onClick={way.run}
                className="relative flex min-h-16 flex-col items-start justify-start rounded-md border bg-background py-2.5 pr-9 pl-3 text-left transition-colors hover:bg-accent/50">
                <span className="text-control font-semibold">{way.name}</span>
                <span className="text-xs text-muted-foreground">{way.line}</span>
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={onKeep} className="self-start text-muted-foreground">Keep going</Button>
        </>
      )}
    </motion.section>
  )
}

/** Split: this card asks something narrower, and the rest becomes a new card with its own answer. */
function SplitForm({ card, onDone, onCancel }: { card: Item; onDone: () => void; onCancel: () => void }): React.JSX.Element {
  const [narrower, setNarrower] = useState(card.prompt ?? '')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => first.current?.select(), [])
  const save = (): void => {
    if (!narrower.trim() || !question.trim() || !answer.trim()) return refuse('Write both questions and the new card’s answer first')
    void vigil.split(card.id, narrower, question, answer).then((made) => {
      if (!made) return refuse('Not split: the card is gone')
      chime('separate')
      card.prompt = narrower.trim()
      toast('Split in two: the new card joins Review as a new one', () => void vigil.unsplit(card.id, made.fresh, made.was).then(() => {
        card.prompt = made.was
        chime('undo')
      }))
      onDone()
    })
  }
  const keys = (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter' && event.metaKey) {
      event.preventDefault()
      save()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }
  }
  return (
    <div data-split className="flex flex-col gap-3" onKeyDown={keys}>
      <label className="flex flex-col gap-1 text-sm">
        <span><strong className="font-semibold">This card asks</strong> <span className="text-muted-foreground">something narrower; its answer stays as it is.</span></span>
        <Input ref={first} value={narrower} onChange={(event) => setNarrower(event.target.value)} className="text-base" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span><strong className="font-semibold">A new card asks</strong> <span className="text-muted-foreground">the rest.</span></span>
        <Input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="The other half of the question" className="text-base" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span><strong className="font-semibold">Its answer</strong></span>
        <Textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={3} className="resize-none text-base" />
      </label>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save}>Split in two</Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

/** Paused in Review (out of it until brought back), with an Undo, said once whichever place asked. */
export function setAside(item: Pick<Item, 'id'>, on: boolean, then?: () => void): void {
  void vigil.saveItem(item.id, { suspended: on }).then(() => {
    chime(on ? 'shelve' : 'unshelve')
    toast(on ? 'Paused: out of Review until you bring it back' : 'Back in Review', () => void vigil.saveItem(item.id, { suspended: !on }).then(() => chime('undo')))
    then?.()
  })
}

/** The note a card written in a note lives in: `capture:…`, `nugget:…` or `day:…`, opened at the card's line. */
export function openLine(lineOf: string, question: string | null): void {
  void vigil.linkTitle(lineOf).then((found) => {
    if (!found) return refuse('Its note is gone')
    chime('open')
    window.api.openInHome(found.type, found.id, question ?? undefined)
  })
}

/**
 * Struggling: every card missed four times or more, paused or not, each
 * with a way to open it and to pause it or bring it back.
 */
export function StrugglingShelf(): React.JSX.Element | null {
  const rows = useLive(vigil.slipping, [] as Item[], [], ['item'])
  if (!rows.length) return null
  const open = (item: Item): void => {
    if (item.lineOf) return openLine(item.lineOf, item.prompt)
    chime('open')
    window.api.openInHome(item.tier, item.id)
  }
  return (
    <section aria-label="Struggling" data-struggling className="mx-5 mt-8 mb-6 flex flex-col gap-2 border-t pt-5">
      <h3 className="text-base font-semibold">Struggling</h3>
      <p className="text-sm text-muted-foreground">Missed four times or more. Rewrite or split each to make it stick, or pause it for now.</p>
      <ul className="flex flex-col">
        {rows.map((item) => (
          <li key={item.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent/40" data-private={item.private ? '' : undefined}>
            <button type="button" onClick={() => open(item)} className="private-text -my-0.5 min-w-0 flex-1 truncate py-0.5 text-left text-sm">{asked(item)}</button>
            <span className={`shrink-0 text-sm tabular-nums ${item.suspended ? 'text-muted-foreground' : 'text-[var(--tt-color-text-orange)]'}`}>
              {item.suspended ? 'Paused' : `Missed ${num(item.lapses)} times`}
            </span>
            <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setAside(item, !item.suspended)}>{item.suspended ? 'Back in Review' : 'Pause'}</Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

const BLURT_MINUTES = 5
const clock = (ms: number): string => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`

/**
 * Blurting: a blank page and a few minutes to write everything you remember
 * about a tag, without looking. Then its gems, the ones you left out lit
 * (by the words they share with what you wrote), brought forward in Review,
 * and the blurt kept on today's page.
 */
/** A blurt left before it was checked, per tag: there again when it is opened again, never lost to a Cancel. */
const blurtDrafts = new Map<string, string>()

export function Blurt({ tag, onClose }: { tag: string; onClose: () => void }): React.JSX.Element {
  const [text, setText] = useState(() => blurtDrafts.get(tag) ?? '')
  // Left with words written: kept for next time, and said so.
  const leave = (): void => {
    if (text.trim() && !checked) {
      blurtDrafts.set(tag, text)
      toast('What you wrote is kept: start the blurt again to carry on')
    }
    onClose()
  }
  const [left, setLeft] = useState(BLURT_MINUTES * 60000)
  const [gems, setGems] = useState<TagRead[] | null>(null)
  const [checked, setChecked] = useState<{ missed: TagRead[]; said: TagRead[]; sooner: number } | null>(null)
  const end = useRef(Date.now() + BLURT_MINUTES * 60000)
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => void vigil.tagRead(tag).then((rows) => setGems(rows.filter((one) => one.type === 'nugget'))), [tag])
  useEffect(() => box.current?.focus(), [])
  const finish = (): void => {
    if (checked) return
    const words = keyWords(text)
    const all = gems ?? []
    const said = all.filter((one) => mentions(words, `${one.title} ${textOf(one.body)}`))
    const missed = all.filter((one) => !said.includes(one))
    chime('finish')
    blurtDrafts.delete(tag)
    void Promise.all([
      vigil.blurtSooner(missed.map((one) => one.id)),
      text.trim() ? vigil.blurtKeep(tag, text, missed.map((one) => one.title || one.label)) : Promise.resolve(null)
    ]).then(([sooner, day]) => {
      setChecked({ missed, said, sooner })
      if (day) toast('Your blurt is kept on today’s page', undefined, 'success', { label: 'Open', key: 'O', run: () => window.api.openInHome('day', day) })
    })
  }
  // The clock runs down; at nought the page is checked as it stands.
  useEffect(() => {
    if (checked) return
    const timer = setInterval(() => {
      const now = end.current - Date.now()
      setLeft(Math.max(0, now))
      if (now <= 0) {
        clearInterval(timer)
        finish()
      }
    }, 250)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, gems, text])
  const lit = useMemo(() => new Set(checked?.missed.map((one) => one.id)), [checked])

  if (checked) {
    const total = checked.missed.length + checked.said.length
    return (
      <section aria-label="Blurt" data-blurt="checked" className="flex flex-col gap-4 px-5 py-6">
        <h2 className="font-heading text-title font-semibold tracking-[-0.018em]">
          {total ? <>You mentioned <Rolling text={checked.said.length} /> of {num(total)}</> : 'Kept'}
        </h2>
        <p className="text-sm text-muted-foreground">
          {!total ? `No gems carry #${tag} yet, so there is nothing to check your blurt against.`
            : !checked.missed.length ? 'Nothing left out, by the words you used.'
              : <><strong className="font-semibold text-foreground">The {num(checked.missed.length)} you left out are lit.</strong> {checked.sooner ? `${num(checked.sooner)} of them now come up in Review today.` : 'Any with a question were due already; the rest need a question to be asked.'}</>}
          {' '}A match is by shared words, so it is a nudge, not a mark.
        </p>
        <ul className="flex flex-col gap-1">
          {[...checked.missed, ...checked.said].map((one) => (
            <li key={one.id} data-missed={lit.has(one.id) || undefined} data-private={one.private ? '' : undefined}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${lit.has(one.id) ? 'bg-[color-mix(in_srgb,var(--tt-color-text-orange)_12%,var(--background))] text-foreground' : 'text-muted-foreground'}`}>
              {lit.has(one.id) ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[var(--tt-color-text-orange)]" /> : <Check className="size-3.5 shrink-0" />}
              <button type="button" className="private-text -my-0.5 min-w-0 flex-1 truncate py-0.5 text-left" onClick={() => (chime('open'), window.api.openInHome('nugget', one.id))}>{one.title || one.label || 'Untitled'}</button>
            </li>
          ))}
        </ul>
        <Button variant="outline" size="sm" className="self-start" onClick={onClose}>Done</Button>
      </section>
    )
  }
  return (
    <section aria-label="Blurt" data-blurt="writing" className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-6">
      <div className="flex items-baseline gap-3">
        <h2 className="flex-1 font-heading text-title font-semibold tracking-[-0.018em]">Write everything you remember about #{tag}</h2>
        <span className={`text-lg font-medium tabular-nums ${left < 30000 ? 'text-[var(--tt-color-text-orange)]' : 'text-foreground'}`} aria-label="Time left">{clock(left)}</span>
      </div>
      <p className="text-sm text-muted-foreground">Without looking. Anything at all: names, numbers, half a sentence. When the time is up, or you are done, it shows what you left out.</p>
      <Textarea ref={box} value={text} onChange={(event) => setText(event.target.value)} placeholder="Start anywhere…"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && event.metaKey) (event.preventDefault(), finish())
          else if (event.key === 'Escape') (event.preventDefault(), event.stopPropagation(), leave())
        }}
        className="min-h-[16rem] flex-1 resize-none text-base leading-relaxed" />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={finish} disabled={!gems}>Done</Button>
        <Button variant="ghost" size="sm" onClick={leave}>Cancel</Button>
      </div>
    </section>
  )
}

/**
 * Learn Vigil in Review: one click adds about twenty cards about what
 * the app does without showing it, tagged #learn-vigil. Never added on its
 * own; once they are there it says where they are.
 */
export function LearnOffer({ className = '' }: { className?: string }): React.JSX.Element | null {
  const have = useLive(vigil.learnCount, null as number | null, [], ['item'])
  if (have === null) return null
  if (have)
    return (
      <button type="button" data-learn="have" onClick={() => (chime('open'), window.api.openInHome('tag', 'learn-vigil'))}
        className={`inline-flex min-h-6 items-center self-start rounded-md px-2 text-control text-muted-foreground underline decoration-foreground/20 underline-offset-4 transition-colors hover:text-foreground ${className}`}>
        Learn {APP_NAME}: {num(have)} cards, tagged #learn-vigil
      </button>
    )
  return (
    <button type="button" data-learn="offer"
      onClick={() => void vigil.learnAdd().then((added) => {
        chime('promote')
        toast(`${num(added)} cards about ${APP_NAME} are in Review, a few new ones a day`, () => void vigil.learnUndo(), 'success', { label: 'Review', key: 'R', run: () => window.api.openInHome('view', 'review') })
      })}
      className={`inline-flex min-h-6 items-center self-start rounded-md px-2 text-control text-foreground underline decoration-foreground/25 underline-offset-4 transition-colors hover:decoration-foreground/60 ${className}`}>
      Learn {APP_NAME} in Review
    </button>
  )
}

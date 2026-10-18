import { useEffect, useRef, useState } from 'react'
import { quoted } from '../../../../main/clip'
import { RecallScore } from './recall-score'
import type { JSONContent } from '@tiptap/core'

import { AnimatePresence, animate, motion, useMotionValue, type AnimationPlaybackControls } from 'motion/react'
import { byKeys, EASE, shift, spring, still } from '@/lib/motion'
import { Unfold } from './glide'

import { MindflowEditor } from '../mindflow'
import { textOf } from '../rot-cards'
import { chime, fold } from '@/lib/sound'
import { interval, unloaded, vigil, when, whenInLine, type Due, type Exam, type Item, useLive } from '@/lib/vigil'
import { exampleCard } from '@/lib/examples'
import { Example } from './example'
import { Book, Empty, Kbd, Page, Rolling, toast, Typed, typing, Pressed, refuse, quietly } from './ui'
import { ProgressBar } from './progress-bar'
import { working } from './beam'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tip } from '@/components/vigil/ui'
import { Button } from '@/components/ui/button'
import { Rest } from './scenery'
import { GlossLine, keepGloss, openGloss } from './gloss-line'
import { BorderBeam } from 'border-beam'
import { useAlive, useSurface } from '@/lib/use-alive'
import { num } from '../../../../main/dates'
import { Avatar } from './avatar'
import { Signed } from './signature'
import { canSplit, openAside, useHere } from '@/lib/split'
import { FocusChips, HowItDecides, RoundLine, Slipping, StrugglingShelf, openLine, setAside, type Round } from './study'
import { onboarding } from '@/lib/onboarding'
import { LearnMode } from './learn-mode'
import { closeness, isLeech, suggestGrade } from '../../../../main/study'
import { Star } from 'lucide-react'
import { InkLine } from './ink-line'
import { backIn } from '@/lib/back-in'

/** The four grades, as the plan defines them: how the retrieval felt, not whether it was right. */
const GRADES = [
  { grade: 1, label: 'Again', hint: 'Could not recall it', tone: 'var(--tt-color-text-red)' },
  { grade: 2, label: 'Hard', hint: 'Got it, barely', tone: 'var(--tt-color-text-orange)' },
  { grade: 3, label: 'Good', hint: 'Normal effort', tone: 'var(--tt-color-text-green)' },
  { grade: 4, label: 'Easy', hint: 'Instant', tone: 'var(--tt-color-text-blue)' }
] as const

/**
 * The review session, the one surface allowed a definition of done. One card:
 * the prompt, then Space for the answer, then a grade. The queue is taken once
 * when the session starts and capped by the day's limits, so it can always be
 * finished, and an item stays in front of you until you grade it.
 */
export function ReviewView({ compact = false }: { compact?: boolean }): React.JSX.Element {
  const [queue, setQueue] = useState<Due[] | null>(null)
  const [reviewed, setReviewed] = useState<Set<string>>(new Set())
  const [at, setAt] = useState(0)
  const [shown, setShown] = useState(false)
  // Which face of the card is up: once the answer is shown you may turn
  // back to the question and over again, and the grades stay out.
  const [over, setOver] = useState(false)
  // Explain it back: your own words first, then the answer beside them.
  const [said, setSaid] = useState('')
  const started = useRef(Date.now())
  // The beam turns while the day's cards are worked out, should that be slow.
  useEffect(() => void working(vigil.queue()).then(setQueue), [])
  // A practice round from the chips above: its own short queue, then back to today's.
  const [round, setRound] = useState<Round | null>(null)
  // Learn mode over the new cards, in place of the queue until it is left.
  const [learning, setLearning] = useState(false)
  // A star put on or taken off the card in front, drawn at once.
  const [, setStars] = useState(0)
  // The card that keeps slipping, held up after its miss until you say what to do with it.
  const [slipping, setSlipping] = useState<{ card: Due; splitting: boolean } | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const fresh = (cards: Due[], bucket: Round | null): void => {
    setQueue(cards)
    setRound(bucket)
    setAt(0)
    setReviewed(new Set())
    setShown(false)
    setOver(false)
    setSaid('')
    setMissed(null)
    setSlipping(null)
    setCameBack(false)
    setLast(null)
    started.current = Date.now()
  }
  const startRound = (bucket: Round): void => void working(vigil.round(bucket)).then((cards) => (chime('riffle'), fresh(cards, bucket)))
  const leaveRound = (): void => void working(vigil.queue()).then((cards) => (chime('fold'), fresh(cards, null)))
  // Nothing has a question to be tested on yet: an example card shows what Review does with one.
  const ideas = useLive(() => vigil.items('nugget'), [] as Item[], [], ['item'])
  const card = queue?.[at]
  // Exams ahead, nearest first, each with how ready it is.
  const exams = useLive(vigil.exams, [] as Exam[])
  // The card you just missed, its source open to reread.
  const [source, setSource] = useState<Source | null>(null)
  // The source of the card just missed, there for R until the next grade.
  const [missed, setMissed] = useState<Source | null>(null)
  // The question shows unmasked while you edit it, so the mask is never saved.
  const [editing, setEditing] = useState(false)
  const [rewrites, setRewrites] = useState(0)
  // A cloze's answer, and the question with every other place it appears
  // blanked too: a title or a line that repeats it gives it away.
  const answer = card ? answerOf(card.prompt, card.body) : null
  // Back from rereading a source, the card comes in from the left: the way
  // you came. Every grade moves on, to the right.
  const [cameBack, setCameBack] = useState(false)
  const leaveSource = (): void => {
    chime('unread')
    setCameBack(true)
    setSource(null)
  }
  const alive = useAlive()
  const surface = useSurface()
  const asked = card ? masked(card.prompt ?? '', answer) : ''

  const reveal = (): void => {
    setOver(true)
    if (shown) return
    fold()
    setShown(true)
    // Out of the box, so 1 to 4 grade straight away.
    ;(document.activeElement as HTMLElement | null)?.blur()
  }
  // The last grade or Not today, for ⌘Z: the card, where it stood, and what it changed here.
  const [last, setLast] = useState<{ card: Due; at: number; said: string; grade: 1 | 2 | 3 | 4 | null; reviewed: boolean; lapses: number; counted: boolean } | null>(null)
  const undoLast = (): void => {
    if (!last) return
    const was = last
    setLast(null)
    void vigil.ungrade(was.card.id).then((ok) => {
      if (!ok) return refuse('That card was graded somewhere else since, so it stays as it is')
      chime('undo')
      was.card.reviewed = was.reviewed ? 1 : 0
      was.card.lapses = was.lapses
      // Again had put a second showing at the end: it goes with the grade.
      if (was.grade === 1) setQueue((cards) => { if (!cards) return cards; const copy = cards.findLastIndex((one) => one.id === was.card.id); return copy > was.at ? cards.filter((_, n) => n !== copy) : cards })
      if (!was.counted) setReviewed((ids) => { const next = new Set(ids); next.delete(was.card.id); return next })
      setSlipping(null)
      setMissed(null)
      setShown(false)
      setOver(false)
      setSaid(was.said)
      setAt(was.at)
      started.current = Date.now()
    })
  }
  const grade = (value: 1 | 2 | 3 | 4): void => {
    if (!card || !shown) return
    if (!round) setLast({ card, at, said, grade: value, reviewed: !!card.reviewed, lapses: card.lapses, counted: reviewed.has(card.id) })
    setMissed(null)
    // What you typed before turning it over is kept, as a dated thought on the card.
    if (said.trim()) void keepGloss(card.id, said)
    void vigil.grade(card.id, value, Date.now() - started.current)
    // Counted by card, so one seen twice after Again counts once, and a
    // buried one not at all.
    setReviewed((ids) => new Set(ids).add(card.id))
    chime((['again', 'hard', 'good', 'easy'] as const)[value - 1])
    // The last card of the day answered: once the grade's own note has
    // sounded, the queue closes with one of its own.
    if (value !== 1 && queue && at + 1 === queue.length) setTimeout(() => chime('reviewed'), 380)
    // Again is not failure, it is a short gap: the card comes round once more
    // before the session ends.
    // A miss on a card already seen counts; its fourth and after, it is slipping.
    if (value === 1 && card.reviewed) card.lapses += 1
    card.reviewed = 1
    if (value === 1 && isLeech(card.lapses) && !card.suspended) setSlipping({ card, splitting: false })
    if (value === 1) {
      setQueue((cards) => [...(cards ?? []), card])
      // Missed: the place it came from is offered, to read it again in context.
      const needles = [answer, textOf(card.body).trim().split('\n')[0].slice(0, 40)].filter(Boolean) as string[]
      toast('This card comes back once more before you finish', undefined, 'info')
      void vigil.source(card.id).then((found) => found && setMissed({ ...found, needles }))
    }
    setShown(false)
    setOver(false)
    setSaid('')
    setCameBack(false)
    setAt((index) => index + 1)
    started.current = Date.now()
  }
  // The card turned by a click or a drag: the first time over is the reveal.
  const turnTo = (next: boolean): void => {
    if (next && !shown) return reveal()
    fold()
    setOver(next)
  }
  // Bury: not today. The schedule is untouched; it is back tomorrow.
  const bury = (): void => {
    if (!card) return
    setMissed(null)
    // In a practice round, Not today only skips: an extra round moves nothing you did not grade.
    if (round) chime('later')
    else {
      setLast({ card, at, said, grade: null, reviewed: !!card.reviewed, lapses: card.lapses, counted: reviewed.has(card.id) })
      void vigil.bury(card.id).then(() => (chime('later'), toast('Back tomorrow')))
    }
    setShown(false)
    setOver(false)
    setSaid('')
    setCameBack(false)
    setAt((index) => index + 1)
  }
  // The slipping card's three ways on. Its second showing is already at the
  // end of the queue (Again put it there).
  const lastCopy = (cards: Due[], id: string): number => cards.findLastIndex((one, n) => n >= at && one.id === id)
  const rewrite = (): void => {
    if (!slipping) return
    const { card: slipped } = slipping
    setSlipping(null)
    // The card back in front now, its question ready to rewrite.
    setQueue((cards) => {
      if (!cards) return cards
      const last = lastCopy(cards, slipped.id)
      const rest = last >= 0 ? cards.filter((_, n) => n !== last) : cards
      return [...rest.slice(0, at), slipped, ...rest.slice(at)]
    })
    chime('tap')
    setTimeout(() => {
      const h = heading.current
      if (!h) return
      h.focus()
      getSelection()?.selectAllChildren(h)
    }, 80)
  }
  const aside = (): void => {
    if (!slipping) return
    const { card: slipped } = slipping
    setSlipping(null)
    slipped.suspended = 1
    setQueue((cards) => {
      const last = cards ? lastCopy(cards, slipped.id) : -1
      return cards && last >= 0 ? cards.filter((_, n) => n !== last) : cards
    })
    setAside(slipped, true)
  }
  // A card written in a note: R opens the note at its line.
  const lineCard = card?.lineOf ? card : null
  const lineFrom = useLive(() => (lineCard?.lineOf ? vigil.linkTitle(lineCard.lineOf) : Promise.resolve(null)), null as Awaited<ReturnType<typeof vigil.linkTitle>> | null, [lineCard?.lineOf])
  // S: a star on the card, for a round of its own.
  const star = (): void => {
    if (!card) return
    const on = !card.starredAt
    card.starredAt = on ? new Date().toISOString() : null
    setStars((n) => n + 1)
    chime(on ? 'pin' : 'unpin')
    void vigil.star(card.id, on)
  }
  // The typed answer, set against the real one once it is shown: how close, and the grade that suggests.
  const typedScore = shown && said.trim() && card ? closeness(said, answer ?? textOf(card.body)) : null
  const suggested = typedScore === null ? null : suggestGrade(typedScore)
  // Split, only the pane in front answers keys.
  const here = useHere()
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
      // ⌘Z: the last grade or Not today taken back, the card in front again.
      if (event.metaKey && !event.shiftKey && event.key === 'z' && last && !typing() && !source) {
        event.preventDefault()
        event.stopPropagation()
        return undoLast()
      }
      if (event.metaKey || event.ctrlKey) return
      // Before the window's own Escape, which would hide the box.
      if (source) {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          leaveSource()
        }
        return
      }
      // Never while typing: in the prompt the editor sits beside the review.
      if (typing()) return
      // The slipping card's choices take the keys until one is made.
      if (slipping) {
        if (slipping.splitting) return
        const way = { '1': rewrite, '2': () => setSlipping({ ...slipping, splitting: true }), '3': aside, Escape: () => setSlipping(null) }[event.key]
        if (!way) return
        event.preventDefault()
        event.stopPropagation()
        return way()
      }
      if (event.key === 'r' && lineCard?.lineOf) {
        event.preventDefault()
        return openLine(lineCard.lineOf, lineCard.prompt)
      }
      if (event.key === 'r' && missed) {
        event.preventDefault()
        chime('read')
        setSource(missed)
        return
      }
      if (event.key === ' ' && card) {
        event.preventDefault()
        if (shown && !over) turnTo(true)
        else reveal()
      }
      if (['1', '2', '3', '4'].includes(event.key)) grade(Number(event.key) as 1 | 2 | 3 | 4)
      if (event.key === 'b') bury()
      if (event.key === 's' && card) {
        event.preventDefault()
        star()
      }
      // ; once the answer shows: a thought on it, without leaving the card.
      if (event.key === ';' && card && shown) {
        event.preventDefault()
        openGloss(card.id)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  if (!queue) return <Page title="Review"><div /></Page>
  if (source)
    return (
      <Page title="Review">
        <SourcePanel source={source} onClose={leaveSource} />
      </Page>
    )
  if (learning)
    return (
      <Page title="Review">
        <div className="mx-auto w-full max-w-2xl">
          <LearnMode onDone={() => void vigil.queue().then((cards) => (setLearning(false), fresh(cards, null)))} />
        </div>
      </Page>
    )
  if (slipping)
    return (
      <Page title="Review">
        <div className="mx-auto w-full max-w-2xl">
          <Slipping card={slipping.card} splitting={slipping.splitting} onRewrite={rewrite} onSplit={() => (chime('tap'), setSlipping({ ...slipping, splitting: true }))}
            onAside={aside} onKeep={() => setSlipping(null)} onSplitDone={() => setSlipping(null)} />
        </div>
      </Page>
    )
  if (!card && round)
    return (
      <Page title="Review">
        <Rest seed="review-round" compact={compact}>
          <Empty compact={compact} shaped title={<>Round done: <Rolling text={reviewed.size} /> practised</>}
            action={<Button variant="outline" size="sm" onClick={leaveRound}>Back to today’s cards</Button>}>
            The cards you graded keep their new dates; the rest are where they were.
          </Empty>
        </Rest>
      </Page>
    )
  if (!card)
    return (
      <Page title="Review">
        <div className="mx-auto w-full max-w-2xl">
        {queue.length || !(!unloaded(ideas) && !ideas.some((one) => one.prompt)) ? (
          // The end of the day's cards, or a day with none due: an ending, then the one way on.
          <Finished ids={[...reviewed]} count={reviewed.size} total={reviewed.size} later={round ? 0 : new Set(queue.map((one) => one.id)).size - reviewed.size} compact={compact} onPick={startRound} onLearn={() => setLearning(true)} />
        ) : (
          <Example compact={compact} tryIt="open a gem and write the question it answers, under “Review”. It joins today’s queue, and comes back later each time you know it.">
            <ExampleCard />
          </Example>
        )}
        <StrugglingShelf />
        <InkLine />
        </div>
      </Page>
    )

  return (
    <Page title="Review">
      {/* One card at a time in the middle of the page, never a narrow card with an empty half beside it. */}
      <div className="mx-auto w-full max-w-2xl">
      {/* One quiet line over the card: where you are, and practice, new cards and exams folded into it. */}
      {round ? <><RoundLine round={round} onLeave={leaveRound} /><Through at={at} total={queue.length} /></> : <TopLine at={at} total={queue.length} exams={exams} onPick={startRound} onLearn={() => setLearning(true)} />}
      {missed && (
        <p className="px-5 pt-3 -mb-1 text-xs text-muted-foreground">
          <Typed text="Missed that one? Reread where it came from:" step={28} delay={100} /> <Pressed keys="R" />
        </p>
      )}
      {/* The next card is there at once: grading fast never waits for the
          last one to finish leaving. Graded with 1 to 4, fifty times a
          sitting, the next card is simply there (lib/motion.ts rule 5);
          graded with a click it slides in from the right. */}
      <AnimatePresence mode="popLayout" custom={byKeys()}>
      <motion.div
        key={`${card.id}-${at}`}
        custom={byKeys()}
        variants={{
          from: (keyed: boolean) => keyed
            ? { opacity: 0, transform: shift('translateY(6px)') }
            : { opacity: 0, transform: shift(`translateX(${cameBack ? -8 : 8}px)`) },
          here: (keyed: boolean) => keyed
            ? { opacity: 1, transform: shift('translateY(0px)'), transition: { duration: 0.11, ease: EASE } }
            : { opacity: 1, transform: shift('translateX(0px)'), transition: { duration: 0.22, ease: EASE } },
          gone: (keyed: boolean) => keyed
            ? { opacity: 0, pointerEvents: 'none', transition: { duration: 0 } }
            : { opacity: 0, transform: shift('translateX(-8px)'), pointerEvents: 'none', transition: { opacity: { duration: 0.08 }, transform: { duration: 0.16, ease: EASE } } }
        }}
        // Reached or graded by a key, the card is simply there; by a click it arrives as a card.
        initial={byKeys() ? false : 'from'}
        animate="here"
        exit="gone"
        className="flex flex-col gap-6 px-5 pt-4 pb-8"
      >
        {lineCard && (
          <p data-line-from className="-mb-4 flex items-center gap-1.5 text-sm text-muted-foreground">
            <span className="min-w-0 truncate">From <span className="text-foreground">{lineFrom?.title || 'a note'}</span>, a line written as a card.</span>
            <span className="shrink-0">Open it at the line</span> <Pressed keys="R" />
          </p>
        )}
        {card.exam && (
          <p className="-mb-4 text-xs text-muted-foreground">
            From #{card.exam}{(() => {
              // The chip over the page already says how long is left: said once, not twice.
              const exam = exams.slice(2).find((one) => one.tag === card.exam)
              return exam ? `, which you want ready ${exam.days === 0 ? 'today' : exam.days === 1 ? 'tomorrow' : `in ${num(exam.days)} days`}` : ''
            })()}
          </p>
        )}
        {/* The question on the card's face, the answer on its back. */}
        <Flip
          over={over}
          onTurn={turnTo}
          front={
            <div className="relative h-full rounded-lg border bg-accent/30 px-5 py-6">
              {/* S stars it, for a round of its own. */}
              <Tip label={card.starredAt ? 'Starred: S takes it off' : 'Star it: S'}>
                <button type="button" aria-label={card.starredAt ? 'Unstar' : 'Star'} aria-pressed={!!card.starredAt} data-star onClick={star}
                  className={`absolute top-2 right-2 rounded-md p-1 transition-colors hover:bg-foreground/[0.06] ${card.starredAt ? 'text-[var(--tt-color-text-yellow)]' : 'text-muted-foreground/60'}`}>
                  <Star className="size-4" fill={card.starredAt ? 'currentColor' : 'none'} />
                </button>
              </Tip>
              {/* The question is editable in place: a card forgotten again and again
                  is usually asking the wrong thing, and this is where you notice. */}
              <h2
                key={`${card.id}-${rewrites}`}
                ref={heading}
                contentEditable
                suppressContentEditableWarning
                // One line: Enter keeps it rather than starting a second.
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  event.currentTarget.blur()
                }}
                onFocus={() => setEditing(true)}
                onBlur={(event) => {
                  const prompt = event.currentTarget.textContent?.trim()
                  // Drawn afresh, so what you typed never sits under React's own text.
                  setEditing(false)
                  setRewrites((n) => n + 1)
                  if (!prompt || prompt === card.prompt) return
                  // The card in the queue too, so an Again brings back the new words.
                  const before = card.prompt
                  card.prompt = prompt
                  void vigil.saveItem(card.id, { prompt }).then(() => (chime('noted'), quietly(() => {
                    card.prompt = before
                    setRewrites((n) => n + 1)
                    void vigil.saveItem(card.id, { prompt: before })
                  })))
                }}
                className={`rounded-md font-heading ${compact ? 'text-xl' : 'text-title'} font-semibold tracking-[-0.018em] text-balance outline-none focus-visible:ring-1 focus-visible:ring-ring`}
              >
                {editing ? card.prompt : asked}
              </h2>
            </div>
          }
          back={shown && (
            // Waiting on your grade: a faint beam goes round the answer.
            // On a light page the library draws it at a few percent, and it was
            // lost: there its stroke is drawn stronger, to a soft graphite arc.
            <BorderBeam size="md" colorVariant="mono" strength={0.5} style={surface === 'light' ? ({ '--beam-stroke-opacity': 12 } as React.CSSProperties) : undefined} duration={5} theme={surface} active={alive && over} borderRadius={8} className="h-full">
              {/* The answer sits at the box's edge, not in a page's wide margins. */}
              <div className="h-full rounded-lg border bg-accent/30 [--mf-padding:0.625rem_1rem_0.625rem_1.25rem] [&_.tiptap-word-count]:hidden">
                {/* What it answers, small at the top: the question is on the other side now. */}
                <p className="px-5 pt-3 text-xs text-muted-foreground">{asked}</p>
                <MindflowEditor
                  defaultContent={(card.body as JSONContent | string | null) ?? ''}
                  readOnly
                  toolbar={false}
                  handles={false}
                  slash={false}
                  outline={false}
                  search={false}
                  autofocus={false}
                />
              </div>
            </BorderBeam>
          )}
        />
        {isLeech(card.lapses) && (
          <p className="-mt-3 text-sm text-[var(--tt-color-text-orange)]">
            <Typed text={`Forgotten ${card.lapses} times. Rewrite the question above rather than drilling it: click it to edit.`} step={28} delay={300} />
          </p>
        )}

        {shown ? (
          <>
            {said.trim() && suggested && (
              <div data-typed className="-mb-2 flex flex-col gap-1 text-sm">
                <p className="whitespace-pre-line text-muted-foreground">You wrote: {said}</p>
                <p><strong className="font-semibold" style={{ color: GRADES[suggested - 1].tone }}>About {Math.round((typedScore ?? 0) * 100)}% the same: that suggests {GRADES[suggested - 1].label}.</strong> <span className="text-muted-foreground">Kept as a thought on the card when you grade it.</span></p>
              </div>
            )}
            {/* Context: what makes the answer learnable, shown only after it, or
                it would give the prompt away. */}
            {card.context && <p className="-mt-2 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{card.context}</p>}
            <Why card={card} />
            {/* Where it came from, which a flashcard app never knows. */}
            <Origin id={card.id} quote={card.kind === 'quote'} attribution={card.attribution} said={`${card.prompt ?? ''}\n${textOf(card.body)}`} />
            {/* Made from a selection: the exact words it was lifted from, and the way to them in their note. */}
            {card.passage && (
              <figure data-card-passage className="-mt-2 flex flex-col gap-1.5 rounded-lg border px-3 py-2">
                <figcaption className="text-control font-medium text-foreground/80">The passage it came from</figcaption>
                <blockquote className="line-clamp-4 text-body whitespace-pre-line text-foreground">{card.passage}</blockquote>
                <Button variant="ghost" size="sm" data-card-passage-open className="-ml-2 self-start" onClick={() => void vigil.source(card.id).then((found) => {
                  if (!found) return refuse('The note it came from is not there any more')
                  chime('read')
                  setSource({ ...found, needles: [card.passage!.split('\n')[0].slice(0, 60)] })
                })}>Show in its note</Button>
              </figure>
            )}
            {/* The answer, its source or context wrong: the card's own page, beside the review so the place is kept. */}
            {canSplit() && (
              <Button variant="ghost" size="sm" data-edit-card className="-mt-2 self-start text-muted-foreground" onClick={() => (chime('open'), openAside('nugget', card.id))}>
                Edit this card beside
              </Button>
            )}
            {/* A thought on it now: out of sight until ; opens it or there is one,
                so the Why field above is the only field under the answer. */}
            <GlossLine id={card.id} latest={!!card.why} quiet className="-mt-3" />
            {/* The key shows where there is room for it; in a narrow panel the time comes first. */}
            <div className="@container grid grid-cols-4 gap-2">
              {GRADES.map(({ grade: value, label, hint, tone }) => (
                <Tip key={value} label={`${hint}: back ${backIn(card.intervals[value])}`}>
                <button
                  type="button"
                  onClick={() => grade(value)}
                  // Under the pointer the grade takes on its own colour, edge and wash,
                  // so the four read as four answers rather than four grey boxes.
                  style={{ '--tone': tone } as React.CSSProperties}
                  data-suggested={suggested === value || undefined}
                  // The grade on its own line and when it comes back under it, so
                  // "in 10 min" never runs out of its button into the next one.
                  className="relative flex min-h-12 w-full min-w-0 flex-col items-center justify-center rounded-md border px-2 py-1.5 text-control transition-colors hover:border-[color-mix(in_srgb,var(--tone)_45%,var(--border))] hover:bg-[color-mix(in_srgb,var(--tone)_10%,transparent)] data-[suggested]:border-[color-mix(in_srgb,var(--tone)_60%,var(--border))] data-[suggested]:bg-[color-mix(in_srgb,var(--tone)_10%,transparent)]"
                >
                  <span className="font-semibold" style={{ color: tone }}>{label}</span>
                  <span className="max-w-full truncate text-xs text-muted-foreground tabular-nums">{backIn(card.intervals[value])}</span>
                  <Kbd className="absolute top-1.5 right-1.5 hidden @2xl:inline-flex">{value}</Kbd>
                </button>
                </Tip>
              ))}
            </div>
            <HowItDecides id={card.id} back={{ again: backIn(card.intervals[1]), hard: backIn(card.intervals[2]), good: backIn(card.intervals[3]), easy: backIn(card.intervals[4]) }} />
          </>
        ) : (
          <>
          <Textarea
            value={said}
            onChange={(event) => setSaid(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.metaKey) {
                event.preventDefault()
                reveal()
              } else if (event.key === 'Escape') event.currentTarget.blur()
            }}
            rows={3}
            placeholder="Type the answer first, if you like: ⌘↵ checks it against the card."
            className="resize-none text-heading"
          />
          <Button variant="outline" size="lg"
 onClick={reveal}
 className="self-start text-sm text-muted-foreground"
>
            Show the answer <Kbd>Space</Kbd>
          </Button>
          </>
        )}
        {!shown && (
          <div className="-mt-3 flex flex-wrap items-center gap-1 self-start">
            <Button variant="ghost" size="sm" onClick={bury} className="text-muted-foreground">
              {round ? 'Skip' : 'Not today'} <Pressed keys="B" />
            </Button>
            {last && (
              <Button variant="ghost" size="sm" data-undo-grade onClick={undoLast} className="text-muted-foreground">
                {last.grade ? `Undo “${['Again', 'Hard', 'Good', 'Easy'][last.grade - 1]}”` : 'Undo “Not today”'} <Pressed keys="⌘Z" />
              </Button>
            )}
          </div>
        )}
      </motion.div>
      </AnimatePresence>
      {at === 0 && !round && !shown && <StrugglingShelf />}
      </div>
    </Page>
  )
}

/**
 * The one quiet line over the card: where you are in the middle, how many
 * days in a row on the left, and on the right the exams (their readiness on
 * hover), the new cards to learn and Practise, which unfolds the rounds.
 * The card under it is the hero.
 */
function TopLine({ at, total, exams, onPick, onLearn }: { at: number; total: number; exams: Exam[]; onPick: (bucket: Round) => void; onLearn: () => void }): React.JSX.Element {
  const counts = useLive(vigil.buckets, null as Record<Round, number> | null, [], ['item'])
  const days = useLive(vigil.daysInARow, null as { run: number; banked: number } | null, [], ['item'])
  const [practising, setPractising] = useState(false)
  const fresh = counts?.new ?? 0
  const quiet = 'flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground aria-expanded:bg-foreground/[0.06] aria-expanded:text-foreground'
  return (
    <div data-review-top className="@container px-5 pt-5">
      <div className="grid grid-cols-1 items-center gap-y-2 @lg:grid-cols-[1fr_auto_1fr]">
        <span className="order-3 flex min-w-0 flex-wrap items-center gap-1 @lg:order-none">
          {/* The run, readable at a glance: its number in bold, the rest days after it. */}
          {days && days.run >= 2 && <span data-days-in-a-row className="mr-1 text-control text-foreground tabular-nums"><strong className="font-semibold">{num(days.run)} days</strong> in a row{days.banked ? <span className="text-muted-foreground">, {num(days.banked)} rest {days.banked === 1 ? 'day' : 'days'} banked</span> : ''}</span>}
          {exams.slice(0, 2).map((exam) => (
            <Tip key={exam.tag} label={<span className="block w-60 py-1"><Readiness exam={exam} /></span>}>
              <span data-exam-chip tabIndex={0} className={`${quiet} -ml-1.5 cursor-default`}>
                #{exam.tag} <span className="opacity-70">{exam.days === 0 ? 'ready today' : exam.days === 1 ? 'ready tomorrow' : `ready in ${num(exam.days)} days`}</span>
              </span>
            </Tip>
          ))}
        </span>
        <Through at={at} total={total} />
        <span className="flex flex-wrap items-center justify-start gap-1 @lg:justify-end">
          {fresh > 0 && (
            <Tip label={`${num(fresh)} new ${fresh === 1 ? 'card' : 'cards'}: learn them in a guided round before they join the schedule`}>
              <button type="button" data-learn-new onClick={() => (chime('open'), onLearn())} className={quiet}>
                Learn {fresh > 8 ? '8' : num(fresh)} new
              </button>
            </Tip>
          )}
          <button type="button" data-practise aria-expanded={practising} onClick={() => (chime(practising ? 'fold' : 'open'), setPractising(!practising))} className={quiet}>
            Practise
          </button>
        </span>
      </div>
      <Unfold open={practising}>
        <div className="-mx-5"><FocusChips round={null} onPick={onPick} /></div>
      </Unfold>
    </div>
  )
}

/** Where you are in today's cards: "1 of 3", with a dot for each card while they fit on one line. */
function Through({ at, total }: { at: number; total: number }): React.JSX.Element {
  return (
    <div data-through className="flex items-center justify-center gap-3 text-xs text-muted-foreground tabular-nums">
      {total <= 12 ? (
        <span aria-hidden className="flex items-center gap-1.5">
          {Array.from({ length: total }, (_, index) => (
            <span key={index} className={`size-1.5 rounded-full transition-colors duration-300 ${index < at ? 'bg-[var(--tt-brand-color-400)]' : index === at ? 'bg-foreground' : 'bg-border'}`} />
          ))}
        </span>
      ) : (
        <span aria-hidden className="h-0.5 w-24 overflow-hidden rounded-full bg-border">
          <span className="block h-full w-full origin-left bg-[var(--tt-brand-color-400)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ transform: `scaleX(${at / total})` }} />
        </span>
      )}
      <Rolling text={`${num(at + 1)} of ${num(total)}`} by="word" />
    </div>
  )
}

/**
 * The line where the dots were, at the end: the last one lit, then the dots
 * draw together into one bar that fills and charges (in the bar style chosen
 * in Settings, so a lightsaber flares), and the line folds away.
 */
function Closing({ total }: { total: number }): React.JSX.Element | null {
  const flat = still()
  const [phase, setPhase] = useState<'dots' | 'bar' | 'full' | 'gone'>(flat ? 'gone' : 'dots')
  useEffect(() => {
    if (flat) return
    const steps = [setTimeout(() => setPhase('bar'), 260), setTimeout(() => setPhase('full'), 420), setTimeout(() => setPhase('gone'), 1900)]
    return () => steps.forEach(clearTimeout)
  }, [flat])
  return (
    <AnimatePresence initial={false}>
      {phase !== 'gone' && (
        <motion.div data-closing exit={{ height: 0, opacity: 0, transition: { duration: 0.3, ease: EASE } }} className="overflow-hidden">
          <div className="flex h-11 items-center justify-center gap-3 pt-5 text-xs text-muted-foreground tabular-nums">
            {phase === 'dots' && total <= 12 ? (
              <span aria-hidden className="flex items-center gap-1.5">
                {Array.from({ length: total }, (_, index) => <span key={index} className="size-1.5 rounded-full bg-[var(--tt-brand-color-400)]" />)}
              </span>
            ) : (
              <motion.span initial={flat ? false : { opacity: 0, transform: shift('scaleX(0.95)') }} animate={{ opacity: 1, transform: shift('scaleX(1)') }} transition={{ duration: 0.18, ease: EASE }} className="block w-28">
                <ProgressBar value={phase === 'full' ? 1 : (total - 1) / Math.max(1, total)} label={`All ${num(total)} reviewed`} thick={3} duration={420} fill="var(--tt-brand-color-400)" />
              </motion.span>
            )}
            <span>All {num(total)}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** A day in a row worth a line of its own: 7, 30, 100. No confetti, no score. */
const MILESTONES: Record<number, string> = {
  7: 'Seven days in a row. That is how it sticks.',
  30: 'Thirty days in a row. It is a habit now, not an effort.',
  100: 'A hundred days in a row. Very few people ever get here.'
}

/**
 * The end of the day's cards, or a day with none due: the star rises, the
 * line on what that means, and one way on. Your Inbox when something waits
 * there, else the new cards to learn, else Home. Practice stays a quiet link
 * away, unfolded only when asked for. Enter takes the way on.
 */
function Finished({ count, total, later = 0, compact, onPick, onLearn, ids = [] }: { count: number; total: number; /** Cards put off with Not today in this sitting. */ later?: number; compact: boolean; onPick: (bucket: Round) => void; onLearn: () => void; /** The cards graded in this sitting, for its score. */ ids?: string[] }): React.JSX.Element {
  const counts = useLive(vigil.buckets, null as Record<Round, number> | null, [], ['item'])
  const days = useLive(vigil.daysInARow, null as { run: number; banked: number } | null, [], ['item'])
  const inbox = useLive(() => window.api.captures.list().then((all) => all.filter((one) => one.status === 'open' && !one.archivedAt).length), null as number | null, [])
  const exams = useLive(vigil.exams, [] as Exam[])
  const [practising, setPractising] = useState(false)
  const done = count > 0
  // The page's own how-to line has done its job once a day's cards are finished: put away for good.
  useEffect(() => {
    if (!done) return
    void onboarding.state().then((state) => void (state.hintsSeen.includes('review') || onboarding.set({ hintsSeen: [...state.hintsSeen, 'review'] })))
  }, [done])
  const fresh = counts?.new ?? 0
  const learn = fresh > 8 ? 'the first 8 new cards' : fresh === 1 ? 'the new card' : `the ${num(fresh)} new cards`
  const ways = [
    inbox ? { id: 'inbox', label: `Next: ${num(inbox)} ${inbox === 1 ? 'capture' : 'captures'} in your Inbox`, short: `your Inbox (${num(inbox)})`, run: () => (chime('open'), window.api.openInHome('view', 'inbox')) } : null,
    fresh ? { id: 'learn', label: `Next: learn ${learn}`, short: `learn ${learn}`, run: () => (chime('open'), onLearn()) } : null
  ].filter((one): one is { id: string; label: string; short: string; run: () => void } => !!one)
  const [next, other] = ways
  // Enter takes the way on, as the button says.
  const here = useHere()
  useEffect(() => {
    if (!next) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' || event.metaKey || event.ctrlKey || event.altKey || !here() || typing()) return
      event.preventDefault()
      next.run()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, here])
  const milestone = done && days ? MILESTONES[days.run] : undefined
  const link = 'font-medium text-foreground underline decoration-foreground/25 underline-offset-4 transition-colors hover:decoration-foreground/60'
  const flat = still()
  return (
    <>
      {done && <Closing total={total} />}
      <Rest seed={done ? 'review-done' : 'review-none'} compact={compact}>
        <div data-review-finished={done ? 'done' : 'none'} className={`flex max-w-md flex-col items-start gap-3 ${compact ? 'px-2 py-10' : 'px-5 py-[12vh]'}`}>
          {/* The book rises into its place, shut when the round is done: the one moment of the sitting. */}
          <motion.div initial={flat ? false : { opacity: 0, transform: 'translateY(8px) scale(0.95)' }} animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
            transition={{ type: 'spring', visualDuration: 0.6, bounce: 0.25, delay: done ? 0.35 : 0 }} className="mb-3">
            <Book size={compact ? 44 : 56} seed={done ? 'review-done' : 'review-none'} done={done} className="" />
          </motion.div>
          <h2 className={compact ? 'text-heading font-semibold' : 'text-title font-medium'}>
            {done ? <>Done: <Rolling text={count} /> reviewed</> : later ? 'All put off until tomorrow' : 'Nothing due right now'}
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            {done
              ? <><strong className="font-semibold text-foreground">A little most days outlasts one long cram.</strong> That is today’s cards finished. What you could not recall comes back soonest; the rest waits longer each time you know it.</>
              : later ? <><strong className="font-semibold text-foreground">{later === 1 ? 'The card you put off comes back tomorrow.' : `The ${num(later)} cards you put off come back tomorrow.`}</strong> Nothing else is due today.</>
              : <><strong className="font-semibold text-foreground">No card is due yet.</strong> Each one comes back as you start to forget it, so there is nothing to do here until then.</>}
          </p>
          {milestone ? <p data-milestone className="text-body font-semibold text-foreground">{milestone}</p>
            : days && days.run >= 2 && <p data-days-in-a-row className="text-control text-foreground tabular-nums"><strong className="font-semibold">{num(days.run)} days</strong> in a row{days.banked ? <span className="text-muted-foreground">, {num(days.banked)} rest {days.banked === 1 ? 'day' : 'days'} banked</span> : ''}.</p>}
          <div className="mt-2 flex flex-col items-start gap-2.5">
            {next ? (
              <Button data-onward size="lg" onClick={next.run} className="gap-2">
                {next.label} <Kbd className="bg-background/15 text-current">↵</Kbd>
              </Button>
            ) : (
              <Button data-onward variant="outline" size="lg" onClick={() => (chime('open'), window.api.openInHome('view', 'home'))}>Back to Home</Button>
            )}
            <p className="text-control text-muted-foreground">
              {other && <>Or <button type="button" onClick={other.run} className={link}>{other.short}</button>, or </>}
              {!other && 'Or '}
              <button type="button" data-practise aria-expanded={practising} onClick={() => (chime(practising ? 'fold' : 'open'), setPractising(!practising))} className={link}>practise a little more</button>.
            </p>
          </div>
          <Unfold open={practising}>
            <div className="-mx-5 -mt-3"><FocusChips round={null} onPick={onPick} /></div>
          </Unfold>
          {/* The sitting's own score, and each topic's over time. */}
          {done && <div className="mt-6 w-full"><RecallScore ids={ids} /></div>}
        </div>
      </Rest>
      {!done && exams.length > 0 && <div className="flex flex-col gap-4 px-5 pb-6">{exams.map((exam) => <Readiness key={exam.tag} exam={exam} />)}</div>}
    </>
  )
}

/** A card as Review shows it once turned over: the question, the answer, and the four grades with when each brings it back. */
function ExampleCard(): React.JSX.Element {
  const back = ['in 10 min', 'in 2 days', 'in 4 days', 'in 9 days']
  return (
    <div className="flex flex-col gap-4 px-5 py-6">
      <div className="rounded-lg border bg-accent/30 px-5 py-6">
        <h2 className="font-heading text-title font-semibold tracking-[-0.018em] text-balance">{exampleCard.prompt}</h2>
      </div>
      <div className="rounded-lg border bg-accent/30 px-5 py-4">
        <p className="text-xs text-muted-foreground">From {exampleCard.from}</p>
        <p className="mt-1.5 leading-relaxed">{exampleCard.answer}</p>
      </div>
      <div className="@container grid grid-cols-4 gap-2">
        {GRADES.map(({ grade, label, tone }, at) => (
          <span key={grade} className="flex min-h-12 min-w-0 flex-col items-center justify-center rounded-md border px-2 py-1.5 text-control">
            <span className="font-semibold" style={{ color: tone }}>{label}</span>
            <span className="max-w-full truncate text-xs text-muted-foreground tabular-nums">{back[at]}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Words compared as words: case, quotes and stops aside. */
const plain = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/**
 * Who said it and the capture it began as, under the answer. Either is left
 * out when the card already says it: a card made from a capture's own words
 * only repeated them here.
 */
function Origin({ id, quote, attribution, said }: { id: string; quote?: boolean; attribution: string | null; said: string }): React.JSX.Element | null {
  const lineage = useLive(() => vigil.lineage(id), null, [id])
  const card = plain(said)
  const fresh = (text: string | null | undefined): text is string => !!text && !card.includes(plain(text))
  const who = fresh(attribution) ? attribution : null
  const from = lineage?.from[0]?.title
  const source = fresh(from) && plain(from) !== plain(attribution ?? '') ? from : null
  if (!who && !source) return null
  const whence = source && `from ${/^["“‘'«]/.test(source) ? source : `“${source}”`}`
  // A quote is signed: the name in a pen's hand, then where it came from.
  if (quote && who) return <p className="-mt-2 flex min-w-0 items-baseline text-xs text-muted-foreground"><Signed who={who} className="private-text" />{whence && <span className="truncate">, {whence}</span>}</p>
  return (
    <p className="-mt-2 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      {who && <Avatar name={who} size={14} />}
      <span className="min-w-0">{[who && `Said by ${who}`, source && `from ${/^["“‘'«]/.test(source) ? source : `“${source}”`}`].filter(Boolean).join(', ')}</span>
    </p>
  )
}

type Source = { type: string; id: string; title: string; body: unknown; needles: string[] }

/** The words a cloze blanked, found by what stands either side of the blank. */
function answerOf(prompt: string | null, body: unknown): string | null {
  if (!prompt?.includes('_____')) return null
  const flat = (text: string): string => text.replace(/\s+/g, ' ').trim()
  const text = flat(textOf(body))
  const [before, after = ''] = flat(prompt).split('_____')
  const head = before.slice(-30)
  const start = text.indexOf(head)
  if (start < 0) return null
  const from = start + head.length
  const to = after.trim() ? text.indexOf(after.slice(0, 30).trim(), from) : text.length
  const found = to < 0 ? '' : text.slice(from, to).trim()
  return found && found.length <= 200 ? found : null
}

/** The question with the answer blanked wherever else it appears. */
function masked(prompt: string, answer: string | null): string {
  if (!answer || answer.length < 2) return prompt
  return prompt.replace(new RegExp(answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '_____')
}

/**
 * Why the answer is so, one line under it: its own, or else your latest
 * gloss, which often already says it. With neither, a line to write one.
 */
function Why({ card }: { card: Due }): React.JSX.Element {
  const [why, setWhy] = useState(card.why)
  // A line taken back with Undo: in the field again, the caret at its end.
  const [again, setAgain] = useState('')
  // A saved Why is changed where it is read: a click puts it back in the field.
  if (why || card.gloss)
    return (
      <p className="-mt-2 text-sm leading-relaxed">
        <span className="text-muted-foreground">{why ? 'Why: ' : 'Why, in your own words: '}</span>
        {why ? (
          <Tip label="Click to change it">
            <button type="button" data-why-saved className="rounded text-left hover:bg-accent" onClick={() => { chime('tap'); card.why = null; setAgain(why); setWhy(null) }}>{why}</button>
          </Tip>
        ) : card.gloss}
      </p>
    )
  // The one field under the answer, named: a thought on the card is kept here too (; opens a dated one).
  return (
    <label data-why className="-mt-2 flex flex-col gap-1 text-sm">
      <span><strong className="font-semibold">Why is it so?</strong> One line, shown under the answer next time.</span>
    <Input
      key={again}
      placeholder="Because…"
      defaultValue={again}
      autoFocus={!!again}
      onFocus={(event) => event.currentTarget.setSelectionRange(event.currentTarget.value.length, event.currentTarget.value.length)}
      className="h-8 text-sm"
      // Opened to change it and left as it was: it stays saved and shown.
      onBlur={(event) => { if (again && event.currentTarget.value.trim() === again) { card.why = again; setWhy(again) } }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') return event.currentTarget.blur()
        const line = event.currentTarget.value.trim()
        if (event.key !== 'Enter' || !line) return
        event.preventDefault()
        // A Why being changed goes back to what it said before; a new one back to the empty field.
        const before = again || null
        card.why = line
        setWhy(line)
        chime('noted')
        void vigil.saveItem(card.id, { why: line }).then(() =>
          toast(before ? 'Changed: it shows under the answer' : 'Saved: it shows under the answer', () => {
            card.why = before
            setWhy(before)
            if (!before) setAgain(line)
            void vigil.saveItem(card.id, { why: before })
          }))
        event.currentTarget.blur()
      }}
    />
    </label>
  )
}

/**
 * The place a missed card came from, open to read again: scrolled to the
 * paragraph that holds it, and that paragraph lit.
 */
function SourcePanel({ source, onClose }: { source: Source; onClose: () => void }): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let tries = 0
    let frame = 0
    // The editor draws its blocks a frame or two after it mounts.
    const find = (): void => {
      const blocks = [...(box.current?.querySelectorAll<HTMLElement>('.ProseMirror > *') ?? [])]
      if (!blocks.length) return void (tries++ < 30 && (frame = requestAnimationFrame(find)))
      const needles = source.needles.map((one) => one.toLowerCase().replace(/\s+/g, ' ').trim()).filter(Boolean)
      const flat = (el: HTMLElement): string => (el.textContent ?? '').toLowerCase().replace(/\s+/g, ' ')
      const hit = needles.map((needle) => blocks.find((el) => flat(el).includes(needle))).find(Boolean) ?? blocks[0]
      hit.classList.add('rounded-sm', 'bg-[color-mix(in_srgb,var(--tt-brand-color-400)_16%,transparent)]', 'ring-4', 'ring-[color-mix(in_srgb,var(--tt-brand-color-400)_16%,transparent)]')
      hit.scrollIntoView({ block: 'center', behavior: still() ? 'auto' : 'smooth' })
    }
    find()
    return () => cancelAnimationFrame(frame)
  }, [source])
  return (
    <motion.div initial={{ opacity: 0, transform: shift('translateY(8px)') }} animate={{ opacity: 1, transform: shift('translateY(0px)') }} className="flex min-h-0 flex-col gap-3 px-5 py-6">
      <div className="flex items-center gap-3">
        <p className="flex-1 text-sm text-muted-foreground">
          <Typed text={`Where it came from: ${quoted(source.title || 'Untitled', 200)}`} step={28} delay={100} />
        </p>
        <Button variant="outline" size="sm" onClick={onClose}>Back to the review <Kbd>Esc</Kbd></Button>
      </div>
      <div ref={box} className="max-h-[60vh] overflow-y-auto rounded-lg border">
        <MindflowEditor
          defaultContent={(source.body as JSONContent | string | null) ?? ''}
          readOnly
          toolbar={false}
          handles={false}
          slash={false}
          outline={false}
          search={false}
          autofocus={false}
        />
      </div>
    </motion.div>
  )
}

const READY = [
  { key: 'solid', label: 'solid', color: 'var(--tt-color-text-green)' },
  { key: 'learning', label: 'learning', color: 'var(--tt-color-text-blue)' },
  { key: 'struggling', label: 'struggling', color: 'var(--tt-color-text-orange)' },
  { key: 'unseen', label: 'not seen yet', color: 'var(--tt-color-text-gray)' }
] as const

/**
 * How ready one exam is: solid, learning, struggling and not yet seen, as
 * one bar. No bar before anything has been seen: a sentence says so instead.
 */
export function Readiness({ exam, named = true }: { exam: Exam; named?: boolean }): React.JSX.Element {
  const seen = exam.total - exam.unseen
  const day = exam.days === 0 ? 'today' : exam.days === 1 ? 'tomorrow' : `in ${num(exam.days)} days`
  return (
    <div className="space-y-1.5 text-xs text-muted-foreground">
      {named && <p className="text-sm text-foreground">#{exam.tag} <span className="text-muted-foreground">· {day}, {whenInLine(exam.at)}</span></p>}
      {!exam.total ? (
        <p>No tested cards carry #{exam.tag} yet. Give its gems a question and they are paced to be ready in time.</p>
      ) : !seen ? (
        <p><Rolling text={exam.total} /> {exam.total === 1 ? 'card' : 'cards'}, none seen yet. About <Rolling text={exam.perDay} /> a day from today has them all met in time.</p>
      ) : (
        <>
          {/* Drawn at its widths, there with the page: data, not a show. */}
          <div className="flex h-1.5 overflow-hidden rounded-full">
            {READY.map(({ key, color }) => exam[key] > 0 && (
              <div key={key} style={{ width: `${(exam[key] / exam.total) * 100}%`, background: color }} />
            ))}
          </div>
          <p className="flex flex-wrap gap-x-3">
            {READY.map(({ key, label, color }) => exam[key] > 0 && (
              <span key={key}><span style={{ color }}>●</span> <Rolling text={exam[key]} /> {label}</span>
            ))}
          </p>
        </>
      )}
      {exam.behind > 0 && (
        <p className="text-[var(--tt-color-text-orange)]">
          <Typed text={`${exam.behind} behind. About ${exam.perDay} a day catches you up; no need to do it all at once.`} step={28} delay={200} />
        </p>
      )}
    </div>
  )
}

/** A card's own past in review: the dates, the grades, and the gaps it grew through. */
export function ReviewHistory({ id }: { id: string }): React.JSX.Element | null {
  const history = useLive(() => vigil.history(id), null as Awaited<ReturnType<typeof vigil.history>> | null, [id])
  if (!history) return null
  if (!history.reviews.length) return <p className="text-xs">Not reviewed yet.</p>
  const { reviews, dueAt } = history
  // Each gap: from one review to the next, the last to when it is due.
  const gaps = reviews.map((one, n) => {
    const next = reviews[n + 1]?.at ?? dueAt
    return next ? interval(next, one.at) : null
  })
  // How it has gone, said first and in the page's own ink: the times seen, how many remembered, how many missed.
  const forgot = reviews.filter((one) => one.grade === 1).length
  return (
    <div className="space-y-1 text-xs">
      <p data-review-tally className="pb-1 text-control leading-snug text-foreground tabular-nums">
        <strong className="font-semibold">Reviewed {reviews.length === 1 ? 'once' : `${num(reviews.length)} times`}</strong>
        {reviews.length > 1 && <>, remembered <strong className="font-semibold">{Math.round(((reviews.length - forgot) / reviews.length) * 100)}%</strong></>}
        {forgot ? <>, missed {forgot === 1 ? 'once' : `${num(forgot)} times`}</> : ''}.
      </p>
      <StrengthLine id={id} />
      <p className="tabular-nums">{gaps.filter(Boolean).join(' → ')}</p>
      {reviews.map((one, n) => ({ ...one, gap: gaps[n] })).slice(-6).reverse().map((one) => {
        const grade = GRADES[one.grade - 1]
        return (
          <p key={one.at} className="flex gap-2 tabular-nums">
            <span className="w-24 opacity-70">{when(one.at)}</span>
            <span className="w-12" style={{ color: grade?.tone }}>{grade?.label}</span>
            {one.gap && <span className="opacity-70">then {one.gap}</span>}
          </p>
        )
      })}
    </div>
  )
}

/**
 * How strong a card is, as a line: after each review, how many days it would
 * hold (log scale, so a week and a year both read), a dot in that review's
 * grade colour. The latest said in words beside it.
 */
function StrengthLine({ id }: { id: string }): React.JSX.Element | null {
  const points = useLive(() => vigil.strength(id), [] as { at: string; grade: number; days: number }[], [id])
  if (points.length < 1) return null
  const W = 180
  const H = 36
  const top = Math.log10(Math.max(2, ...points.map((one) => one.days)) + 1)
  const xy = points.map((one, n) => [points.length === 1 ? W / 2 : 4 + (n / (points.length - 1)) * (W - 8), H - 4 - (Math.log10(one.days + 1) / top) * (H - 8)] as const)
  const last = points[points.length - 1].days
  return (
    <div data-strength className="flex flex-col gap-1 pb-1">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Strength after each review" className="h-9 w-full max-w-[16rem] overflow-visible">
        <polyline points={xy.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="currentColor" strokeOpacity={0.45} strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {xy.map(([x, y], n) => <circle key={points[n].at} cx={x} cy={y} r={2.5} fill={GRADES[points[n].grade - 1]?.tone ?? 'currentColor'} />)}
      </svg>
      <span className="text-foreground">Holds about {last >= 1.5 ? `${num(Math.round(last))} days` : last >= 1 ? 'a day' : 'under a day'} now</span>
    </div>
  )
}

// Which face a turn shows: an odd half turn is the back.
const backOf = (deg: number): boolean => Math.abs(Math.round(deg / 180)) % 2 === 1
const snap = (deg: number): number => Math.round(deg / 180) * 180

/**
 * A card with the question on its face and the answer on its back. Space or
 * a click turns it over; so does a quick drag sideways, which carries its
 * speed into the settle, the way a card flicked over keeps going. Short, so
 * it never holds up a grade: the next card does not wait for it to land.
 * With Motion off or Reduce motion it does not turn, one face simply gives
 * way to the other.
 */
export function Flip({ over, onTurn, front, back }: { over: boolean; onTurn: (over: boolean) => void; front: React.ReactNode; back: React.ReactNode }): React.JSX.Element {
  const turn = useMotionValue(over ? 180 : 0)
  // Where the turn is headed, which is not where it is while it is moving.
  const aim = useRef(over ? 180 : 0)
  const spin = useRef<AnimationPlaybackControls | null>(null)
  const grip = useRef<{ x: number; base: number; moved: boolean; width: number; trail: { t: number; deg: number }[] } | null>(null)
  const flat = still()
  const settle = (to: number, velocity = 0, keyed = false): void => {
    aim.current = to
    spin.current?.stop()
    // Turned by Space, every card of a sitting, it turns over quickly and flat; by the hand it carries its swing.
    spin.current = animate(turn, to, flat ? { duration: 0 } : keyed ? spring.moderate : { type: 'spring', visualDuration: 0.34, bounce: 0.15, velocity })
  }
  // Turned from outside (Space, the button): on over the way it was going.
  useEffect(() => {
    if (backOf(aim.current) !== over) settle(aim.current + 180, 0, byKeys())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over])
  // What a press on the card leaves alone: the question being edited, a link,
  // a button, words being picked out to copy.
  const own = (target: EventTarget): boolean => !!(target as HTMLElement).closest('a, button, input, textarea, [contenteditable="true"]')
  const face = (shown: boolean): React.HTMLAttributes<HTMLDivElement> => ({
    'aria-hidden': !shown,
    inert: !shown,
    className: `[grid-area:1/1] ${flat ? 'transition-opacity duration-150 starting:opacity-0' : '[backface-visibility:hidden]'} ${flat && !shown ? 'opacity-0' : ''}`
  })
  return (
    <div
      className="grid cursor-pointer [perspective:1400px]"
      onPointerDown={(event) => {
        if (event.button !== 0 || own(event.target)) return
        grip.current = { x: event.clientX, base: aim.current, moved: false, width: event.currentTarget.offsetWidth, trail: [] }
      }}
      onPointerMove={(event) => {
        const held = grip.current
        if (!held || flat) return
        const dx = event.clientX - held.x
        if (!held.moved) {
          if (Math.abs(dx) < 6) return
          // A drag, not a selection: the card has the pointer from here.
          held.moved = true
          // Caught mid-turn, it carries on from where your finger found it.
          spin.current?.stop()
          held.base = turn.get()
          held.x = event.clientX
          event.currentTarget.setPointerCapture(event.pointerId)
          getSelection()?.removeAllRanges()
        }
        const deg = held.base + ((event.clientX - held.x) / held.width) * 180
        turn.set(deg)
        held.trail = [...held.trail.filter((one) => event.timeStamp - one.t < 90), { t: event.timeStamp, deg }]
      }}
      onPointerUp={(event) => {
        const held = grip.current
        grip.current = null
        if (!held) return
        if (!held.moved) {
          // A click, unless it picked out words to copy.
          if (getSelection()?.isCollapsed !== false) onTurn(!over)
          return
        }
        const [first, last] = [held.trail[0], held.trail[held.trail.length - 1]]
        // Held still before letting go, it is not a flick.
        const velocity = first && last && last.t > first.t && event.timeStamp - last.t < 60 ? ((last.deg - first.deg) / (last.t - first.t)) * 1000 : 0
        const here = turn.get()
        // A flick goes over even when let go short of half way.
        const to = Math.min(snap(here) + 180, Math.max(snap(here) - 180, snap(here + velocity * 0.16)))
        settle(to, velocity)
        if (backOf(to) !== over) onTurn(backOf(to))
      }}
      onPointerCancel={() => {
        if (grip.current?.moved) settle(snap(grip.current.base))
        grip.current = null
      }}
    >
      <motion.div className="grid [transform-style:preserve-3d] [grid-area:1/1]" style={flat ? undefined : { rotateY: turn }}>
        <div {...face(!over)}>{front}</div>
        <div {...face(over)} style={flat ? undefined : { transform: 'rotateY(180deg)' }}>{back}</div>
      </motion.div>
    </div>
  )
}

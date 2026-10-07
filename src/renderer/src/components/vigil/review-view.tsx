import { useEffect, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'

import { AnimatePresence, motion } from 'motion/react'
import { EASE, byKeys, shift } from '@/lib/motion'

import { MindflowEditor } from '../mindflow'
import { textOf } from '../rot-cards'
import { chime } from '@/lib/sound'
import { interval, vigil, when, type Due, type Exam, useLive } from '@/lib/vigil'
import { Empty, Kbd, Page, Rolling, toast, Typed, typing, Pressed } from './ui'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tip } from '@/components/vigil/ui'
import { Button } from '@/components/ui/button'
import { Rest } from './scenery'
import { GlossLine, keepGloss, openGloss } from './gloss-line'
import { BorderBeam } from 'border-beam'
import { useAlive, useSurface } from '@/lib/use-alive'
import { num } from '../../../../main/dates'

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
  // Explain it back: your own words first, then the answer beside them.
  const [said, setSaid] = useState('')
  const started = useRef(Date.now())
  useEffect(() => void vigil.queue().then(setQueue), [])
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
    if (shown) return
    chime('reveal')
    setShown(true)
    // Out of the box, so 1 to 4 grade straight away.
    ;(document.activeElement as HTMLElement | null)?.blur()
  }
  const grade = (value: 1 | 2 | 3 | 4): void => {
    if (!card || !shown) return
    setMissed(null)
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
    if (value === 1) {
      setQueue((cards) => [...(cards ?? []), card])
      // Missed: the place it came from is offered, to read it again in context.
      const needles = [answer, textOf(card.body).trim().split('\n')[0].slice(0, 40)].filter(Boolean) as string[]
      toast('This card comes back once more before you finish', undefined, 'info')
      void vigil.source(card.id).then((found) => found && setMissed({ ...found, needles }))
    }
    setShown(false)
    setSaid('')
    setCameBack(false)
    setAt((index) => index + 1)
    started.current = Date.now()
  }
  // Bury: not today. The schedule is untouched; it is back tomorrow.
  const bury = (): void => {
    if (!card) return
    setMissed(null)
    void vigil.bury(card.id).then(() => (chime('later'), toast('Buried until tomorrow')))
    setShown(false)
    setSaid('')
    setCameBack(false)
    setAt((index) => index + 1)
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
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
      if (event.key === 'r' && missed) {
        event.preventDefault()
        chime('read')
        setSource(missed)
        return
      }
      if (event.key === ' ' && card) {
        event.preventDefault()
        reveal()
      }
      if (['1', '2', '3', '4'].includes(event.key)) grade(Number(event.key) as 1 | 2 | 3 | 4)
      if (event.key === 'b') bury()
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
  if (!card)
    return (
      <Page title="Review">
        {queue.length ? (
          <Rest seed="review-done" compact={compact}>
            <Empty compact={compact} shape={['star', 2]} title={<>Done: <Rolling text={reviewed.size} /> reviewed</>}>
              That is today’s queue finished. What you could not recall comes back soonest; the rest waits until just before you would forget it.
            </Empty>
          </Rest>
        ) : (
          <Rest seed="review-none" compact={compact}>
            <Empty compact={compact} shape={['moon', 1]} title="Nothing to review">
              Review holds only what you choose to be tested on. Open a nugget and write the question it answers, under Review: it joins the queue by tomorrow.
            </Empty>
          </Rest>
        )}
        <Exams exams={exams} />
      </Page>
    )

  return (
    <Page title="Review" count={queue.length - at}>
      {/* No empty bar before the first card is done. */}
      {at > 0 && (
        <div className="h-0.5 bg-border">
          <div className="h-full w-full origin-left bg-[var(--tt-brand-color-400)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ transform: `scaleX(${at / queue.length})` }} />
        </div>
      )}
      {at === 0 && <Exams exams={exams} />}
      {missed && (
        <p className="px-5 pt-4 -mb-6 text-xs text-muted-foreground">
          <Typed text="Missed that one? Reread where it came from:" step={28} delay={100} /> <Pressed keys="R" />
        </p>
      )}
      {/* The next card is there at once: grading fast never waits for the
          last one to finish leaving. Graded with 1 to 4, all session long,
          it simply swaps; graded with a click it slides in from the right. */}
      <AnimatePresence mode="popLayout" custom={byKeys()}>
      <motion.div
        key={`${card.id}-${at}`}
        custom={byKeys()}
        variants={{
          from: { opacity: 0, transform: shift(`translateX(${cameBack ? -24 : 24}px)`) },
          here: { opacity: 1, transform: shift('translateX(0px)') },
          gone: (keyed: boolean) => keyed
            ? { opacity: 0, pointerEvents: 'none', transition: { duration: 0 } }
            : { opacity: 0, transform: shift('translateX(-24px)'), pointerEvents: 'none', transition: { opacity: { duration: 0.08 }, transform: { duration: 0.16, ease: EASE } } }
        }}
        initial={byKeys() ? false : 'from'}
        animate="here"
        exit="gone"
        transition={{ duration: 0.22, ease: EASE }}
        className="flex flex-col gap-6 px-5 py-8"
      >
        {card.exam && (
          <p className="-mb-4 text-xs text-muted-foreground">
            For #{card.exam}{(() => {
              const exam = exams.find((one) => one.tag === card.exam)
              return exam ? `, ${exam.days === 0 ? 'today' : exam.days === 1 ? 'tomorrow' : `in ${num(exam.days)} days`}` : ''
            })()}
          </p>
        )}
        {/* The question is editable in place: a card forgotten again and again
            is usually asking the wrong thing, and this is where you notice. */}
        <h2
          key={`${card.id}-${rewrites}`}
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
            card.prompt = prompt
            void vigil.saveItem(card.id, { prompt }).then(() => (chime('noted'), toast('Question rewritten')))
          }}
          className="rounded-md font-heading text-title font-semibold tracking-[-0.018em] text-balance outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {editing ? card.prompt : asked}
        </h2>
        {card.lapses >= 4 && (
          <p className="-mt-3 text-sm text-[var(--tt-color-text-orange)]">
            <Typed text={`Forgotten ${card.lapses} times. Rewrite the question above rather than drilling it: click it to edit.`} step={28} delay={300} />
          </p>
        )}

        {shown ? (
          <>
            {said.trim() && (
              <div className="-mb-2 flex items-start gap-3 text-sm text-muted-foreground">
                <p className="flex-1 whitespace-pre-line">You said: {said}</p>
                <Button variant="ghost" size="sm" className="shrink-0" onClick={() =>
                  void keepGloss(card.id, said).then(() => setSaid(''))
                }>Keep as a gloss</Button>
              </div>
            )}
            {/* Waiting on your grade: a faint beam goes round the answer. */}
            {/* On a light page the library draws it at a few percent, and it was
                lost: there its stroke is drawn stronger, to a soft graphite arc. */}
            <BorderBeam size="md" colorVariant="mono" strength={0.5} style={surface === 'light' ? ({ '--beam-stroke-opacity': 12 } as React.CSSProperties) : undefined} duration={5} theme={surface} active={alive} borderRadius={8}>
            {/* Space shows it on every card: a quick fade out of a slight blur,
                nothing that travels, so reading starts at once. */}
            <motion.div
              initial={{ opacity: 0, filter: 'blur(2px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.16, ease: EASE }}
              // The answer sits at the box's edge, not in a page's wide margins.
              className="rounded-lg border bg-accent/30 [--mf-padding:0.625rem_1rem_0.625rem_1.25rem] [&_.tiptap-word-count]:hidden"
            >
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
            </motion.div>
            </BorderBeam>
            {/* Context: what makes the answer learnable, shown only after it, or
                it would give the prompt away. */}
            {card.context && <p className="-mt-2 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{card.context}</p>}
            <Why card={card} />
            {/* Where it came from, which a flashcard app never knows. */}
            <Origin id={card.id} attribution={card.attribution} said={`${card.prompt ?? ''}\n${textOf(card.body)}`} />
            {/* A thought on it now, while it is in front of you: the latest is
                shown above already when it stands in for the why. */}
            <GlossLine id={card.id} latest={!!card.why} className="-mt-3" />
            {/* The key shows where there is room for it; in a narrow panel the time comes first. */}
            <div className="@container grid grid-cols-4 gap-2">
              {GRADES.map(({ grade: value, label, hint, tone }) => (
                <Tip key={value} label={hint}>
                <button
                  type="button"
                  onClick={() => grade(value)}
                  // Under the pointer the grade takes on its own colour, edge and wash,
                  // so the four read as four answers rather than four grey boxes.
                  style={{ '--tone': tone } as React.CSSProperties}
                  className="flex h-9 min-w-0 items-center justify-center gap-2 rounded-md border px-2 text-control transition-colors hover:border-[color-mix(in_srgb,var(--tone)_45%,var(--border))] hover:bg-[color-mix(in_srgb,var(--tone)_10%,transparent)]"
                >
                  <span className="font-medium" style={{ color: tone }}>{label}</span>
                  <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{interval(card.intervals[value])}</span>
                  <Kbd className="hidden @lg:inline-flex">{value}</Kbd>
                </button>
                </Tip>
              ))}
            </div>
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
            placeholder="Say it back in your own words first, if you like. ⌘↵ to check."
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
          <Button variant="ghost" size="sm" onClick={bury} className="-mt-3 self-start text-muted-foreground">
            Not today <Pressed keys="B" />
          </Button>
        )}
      </motion.div>
      </AnimatePresence>
    </Page>
  )
}

/** Words compared as words: case, quotes and stops aside. */
const plain = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/**
 * Who said it and the capture it began as, under the answer. Either is left
 * out when the card already says it: a card made from a capture's own words
 * only repeated them here.
 */
function Origin({ id, attribution, said }: { id: string; attribution: string | null; said: string }): React.JSX.Element | null {
  const lineage = useLive(() => vigil.lineage(id), null, [id])
  const card = plain(said)
  const fresh = (text: string | null | undefined): text is string => !!text && !card.includes(plain(text))
  const who = fresh(attribution) ? attribution : null
  const from = lineage?.from[0]?.title
  const source = fresh(from) && plain(from) !== plain(attribution ?? '') ? from : null
  if (!who && !source) return null
  return (
    <p className="-mt-2 text-xs text-muted-foreground">
      {[who && `Said by ${who}`, source && `from ${/^["“‘'«]/.test(source) ? source : `“${source}”`}`].filter(Boolean).join(', ')}
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
  if (why || card.gloss)
    return (
      <p className="-mt-2 text-sm leading-relaxed">
        <span className="text-muted-foreground">{why ? 'Why: ' : 'Why, in your gloss: '}</span>
        {why ?? card.gloss}
      </p>
    )
  return (
    <Input
      placeholder="Why is it so? One line, shown here next time"
      // A line to write on, not another box under the answer's box.
      className="-mt-3 h-7 border-transparent bg-transparent px-0 text-control shadow-none focus-visible:border-transparent focus-visible:ring-0 placeholder:text-muted-foreground dark:bg-transparent"
      onKeyDown={(event) => {
        if (event.key === 'Escape') return event.currentTarget.blur()
        const line = event.currentTarget.value.trim()
        if (event.key !== 'Enter' || !line) return
        event.preventDefault()
        card.why = line
        setWhy(line)
        chime('noted')
        void vigil.saveItem(card.id, { why: line }).then(() =>
          toast('Kept: it shows under the answer', () => {
            card.why = null
            setWhy(null)
            void vigil.saveItem(card.id, { why: null })
          }))
        event.currentTarget.blur()
      }}
    />
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
      hit.scrollIntoView({ block: 'center', behavior: document.documentElement.dataset.motion === 'off' ? 'auto' : 'smooth' })
    }
    find()
    return () => cancelAnimationFrame(frame)
  }, [source])
  return (
    <motion.div initial={{ opacity: 0, transform: shift('translateY(8px)') }} animate={{ opacity: 1, transform: shift('translateY(0px)') }} className="flex min-h-0 flex-col gap-3 px-5 py-6">
      <div className="flex items-center gap-3">
        <p className="flex-1 text-sm text-muted-foreground">
          <Typed text={`Where it came from: “${source.title || 'Untitled'}”`} step={28} delay={100} />
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

/** Every exam ahead, nearest first. */
function Exams({ exams }: { exams: Exam[] }): React.JSX.Element | null {
  // Simply there: the card below is what arrives (lib/motion.ts, rule 4).
  if (!exams.length) return null
  return <div className="flex flex-col gap-4 px-5 pt-5">{exams.map((exam) => <Readiness key={exam.tag} exam={exam} />)}</div>
}

/**
 * How ready one exam is: solid, learning, struggling and not yet seen, as
 * one bar. No bar before anything has been seen: a sentence says so instead.
 */
export function Readiness({ exam, named = true }: { exam: Exam; named?: boolean }): React.JSX.Element {
  const seen = exam.total - exam.unseen
  const day = exam.days === 0 ? 'today' : exam.days === 1 ? 'tomorrow' : `in ${num(exam.days)} days`
  return (
    <div className="space-y-1.5 text-xs text-muted-foreground">
      {named && <p className="text-sm text-foreground">#{exam.tag} <span className="text-muted-foreground">· {day}, {when(exam.at)}</span></p>}
      {!exam.total ? (
        <p>No tested cards carry #{exam.tag} yet. Give its nuggets a question and they are paced to be ready in time.</p>
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
  return (
    <div className="space-y-1 text-xs">
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

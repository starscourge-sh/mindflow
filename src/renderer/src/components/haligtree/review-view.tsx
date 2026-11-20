import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { line, curveMonotoneX } from 'd3-shape'
import { tagsIn } from '../../../../main/tag-words'
import { byDefault, useToolKeys } from '@/lib/tool-keys'
import { fieldOf } from '@/components/capture-list'
import { quoted } from '../../../../main/clip'
import { RecallScore } from './recall-score'
import type { JSONContent } from '@tiptap/core'

import { AnimatePresence, animate, motion, useMotionValue, type AnimationPlaybackControls } from 'motion/react'
import { byKeys, EASE, glideWay, shift, spring, still } from '@/lib/motion'
import { Unfold } from './glide'

import { HaligtreeEditor } from '../haligtree'
import { textOf } from '../rot-cards'
import { chime, fold } from '@/lib/sound'
import { interval, unloaded, haligtree, when, whenInLine, type Due, type Exam, type Item, type Settings, useLive } from '@/lib/haligtree'
import { exampleCard } from '@/lib/examples'
import { Example } from './example'
import { Book, Empty, Kbd, Page, Rolling, sayNow, toast, Typed, typing, refuse, quietly } from './ui'
import { ProgressBar } from './progress-bar'
import { working } from './beam'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tip } from '@/components/haligtree/ui'
import { Button } from '@/components/ui/button'
import { Rest } from './scenery'
import { GlossLine, keepGloss, openGloss } from './gloss-line'
import { BorderBeam } from 'border-beam'
import { useAlive, useSurface } from '@/lib/use-alive'
import { dayKey, num, plural } from '../../../../main/dates'
import { Avatar } from './avatar'
import { Signed } from './signature'
import { canSplit, openAside, useHere } from '@/lib/split'
import { FocusChips, HowItDecides, RoundLine, Slipping, StrugglingShelf, openLine, setAside, type Round } from './study'
import { onboarding } from '@/lib/onboarding'
import { WithPictures } from './with-pictures'
import { languageOf, sayAgain, speak } from '@/lib/read-aloud'
import { LearnMode } from './learn-mode'
import { isLeech, minutesFor, sameAnswer, thingsIn, type Strictness } from '../../../../main/study'
import { Star } from 'lucide-react'
import { RowMenu, copyLinkItem, type RowItem } from './row-menu'
import { tierItem } from './gem-or-card'
import { binItem } from '@/lib/to-bin'
import { AnotherWay } from './another-way'
import { cardPerNumber } from './blank-panel'
import { behindOf, pictureIn, picturesIn, withPicture } from '@/lib/answer-picture'
import { answersOf, askCloze, clozeNumbers } from '@/lib/blanks'
import { AliveIcon } from '@/components/ui/alive-icon'
import DotsHorizontalIcon from '@/components/ui/dots-horizontal-icon'
import { InkLine } from './ink-line'
import { backIn } from '@/lib/back-in'
import { hoverNote } from './note-preview'
import { CoveredPicture } from './picture-cards'
import { occlusionOf, type Occlusion } from '../../../../main/occlusion'
import { Orb } from './orb'
import { VERDICT_SAID, cutWords, hint as askHint, hintedTimes, judge, meaningGrade, useStudyAi, wordsOf, type Judged } from '@/lib/study-ai'
import { useHas } from '@/lib/needs'

/**
 * A way somewhere inside a line of words, its key beside it, as Files' "In" links are drawn: the words underlined
 * quietly, lit and underlined in full under the pointer; the key's cap is never underlined.
 */
function LineWay({ onClick, keys, children, ...rest }: { onClick: () => void; /** Its key, said only while the key does this. */ keys?: string; children: React.ReactNode } & Record<`data-${string}`, string | boolean>): React.JSX.Element {
  return (
    <button type="button" {...rest} onClick={onClick} className="group/way inline-flex shrink-0 cursor-pointer items-baseline gap-1.5 rounded-sm text-left transition-transform duration-150 active:scale-[0.97] motion-reduce:active:scale-100">
      <span className="underline decoration-foreground/25 underline-offset-2 transition-colors group-hover/way:text-foreground group-hover/way:decoration-foreground">{children}</span>
      {keys && <Kbd>{keys}</Kbd>}
    </button>
  )
}

/** The four grades, as the plan defines them: how the retrieval felt, not whether it was right. */
export const GRADES = [
  { grade: 1, label: 'Again', hint: 'Could not recall it', tone: 'var(--tt-color-text-red)' },
  { grade: 2, label: 'Hard', hint: 'Got it, barely', tone: 'var(--tt-color-text-orange)' },
  { grade: 3, label: 'Good', hint: 'Normal effort', tone: 'var(--tt-color-text-green)' },
  { grade: 4, label: 'Easy', hint: 'Instant', tone: 'var(--tt-color-text-blue)' }
] as const

type GradeShape = { grade: 1 | 2 | 3 | 4; label: string; hint: string; tone: string }
/**
 * Two grades, a choice in Settings (four, Anki's, are the default): Forgot on any hesitation, Got it when it came.
 * They are Again and Good underneath, and the keys 2 and 4 still give Hard
 * and Easy for anyone with Anki in their fingers.
 */
const TWO: readonly GradeShape[] = [
  { grade: 1, label: 'Forgot', hint: 'It did not come, or you hesitated', tone: 'var(--tt-color-text-red)' },
  { grade: 3, label: 'Got it', hint: 'It came', tone: 'var(--tt-color-text-green)' }
]
/** The grades the person chose in Settings, two or four, and each grade's name in that set. */
export function useGrades(): { grades: readonly GradeShape[]; two: boolean; name: (grade: number) => string } {
  const settings = useLive(haligtree.settings, null as Settings | null)
  const two = (settings?.grades ?? 4) === 2
  return { grades: two ? TWO : GRADES, two, name: (grade) => (two ? ['Forgot', 'Hard', 'Got it', 'Easy'] : ['Again', 'Hard', 'Good', 'Easy'])[grade - 1] }
}

/**
 * The review session, the one surface allowed a definition of done. One card:
 * the prompt, then Space for the answer, then a grade. The queue is taken once
 * when the session starts and capped by the day's limits, so it can always be
 * finished, and an item stays in front of you until you grade it.
 */
/** How many captures wait in the Inbox: the ending's "Next" line. */
const inboxOpen = (): Promise<number> => window.api.captures.list().then((all) => all.filter((one) => one.status === 'open' && !one.archivedAt).length)

/** A round or a typed answer left part way today, kept so leaving Review and coming back loses nothing. */
type LeftOff = { day: string; round: Round | null; queue: Due[]; at: number; reviewed: string[]; card: string | null; said: string }
const LEFT = 'review-left'
function leftOff(): LeftOff | null {
  try {
    const kept = JSON.parse(localStorage.getItem(LEFT) ?? 'null') as LeftOff | null
    return kept && kept.day === dayKey() ? kept : null
  } catch {
    return null
  }
}
function keepLeftOff(left: LeftOff): void {
  try {
    // A round finished, and nothing typed: nothing to come back to.
    if ((!left.round || left.at >= left.queue.length) && !left.said.trim()) return localStorage.removeItem(LEFT)
    localStorage.setItem(LEFT, JSON.stringify(left.round && left.at < left.queue.length ? left : { ...left, round: null, queue: [] }))
  } catch {
    // Kept for this run only.
  }
}

/** `tag`: open on a round of that tag's cards (and the tags under it), from its page or ⌘K's "Study #tag". */
export function ReviewView({ compact = false, tag, actions, lead, onLeave }: { compact?: boolean; tag?: string; /** A deck's study left: for today's cards, or (Esc) for the decks. Each a step, kept by Review. */ onLeave?: (to: 'today' | 'decks') => void; /** "Study now", on the right of the page's line. */ actions?: React.ReactNode; /** The Review area's tabs, on the left of the page's line. */ lead?: React.ReactNode }): React.JSX.Element {
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
  // Someone who typed their answer to the last card types the next one too:
  // its box takes the keys the moment it arrives, so the first letters never
  // fall on Review's single-letter keys (B would put the new card off).
  // Someone who did not type keeps Space, 1 to 4 and the rest.
  const typer = useRef(false)
  const box = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => { if (typer.current) box.current?.focus() }, [at])
  // Cards already reviewed today, before this sitting: the line over the card counts the day ("13 of 20"), not the sitting.
  const [earlier, setEarlier] = useState(0)
  const takeQueue = (): Promise<Due[]> => Promise.all([haligtree.queue(), haligtree.reviewToday()]).then(([cards, today]) => (setEarlier(today.done), cards))
  // The beam turns while the day's cards are worked out, should that be slow. A round or a typed answer left
  // part way today comes back as it was (left in localStorage as you go, below).
  useEffect(() => void working(tag ? haligtree.round(`#${tag}`) : takeQueue()).then((cards) => {
    if (tag) return fresh(cards, `#${tag}`)
    const left = leftOff()
    if (left?.round && left.queue.length) {
      fresh(left.queue, left.round)
      setAt(Math.min(left.at, left.queue.length))
      setReviewed(new Set(left.reviewed))
      if (left.said && left.queue[left.at]?.id === left.card) setSaid(left.said)
      return
    }
    // The card you were typing an answer for comes first again, your words still in the box.
    const typedFor = left?.said ? cards.findIndex((one) => one.id === left.card) : -1
    if (typedFor > 0) cards = [cards[typedFor], ...cards.slice(0, typedFor), ...cards.slice(typedFor + 1)]
    setQueue(cards)
    if (typedFor >= 0) setSaid(left!.said)
  }), [tag]) // eslint-disable-line react-hooks/exhaustive-deps
  // A practice round from the chips above: its own short queue, then back to today's.
  const [round, setRound] = useState<Round | null>(null)
  // Learn mode over the new cards, in place of the queue until it is left.
  const [learning, setLearning] = useState(false)
  // A star put on or taken off the card in front, drawn at once.
  const [, setStars] = useState(0)
  // The card that keeps slipping, held up after its miss until you say what to do with it.
  const [slipping, setSlipping] = useState<{ card: Due; splitting: boolean } | null>(null)
  // Pictures put on the answer here: the answer drawn again with each (its key).
  const [pictured, setPictured] = useState(0)
  // A: "Ask another way" open under this card (its id), closed by moving on.
  const [asking, setAsking] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  // The question in front. A card going out (popLayout) lets go of its question after the next card's took hold:
  // cleared by whichever let go last, the ref held nothing and E (or "Rewrite it") picked nothing, so only the
  // question that still holds it clears it.
  const holdHeading = useCallback((el: HTMLHeadingElement | null): (() => void) => {
    heading.current = el
    return () => void (heading.current === el && (heading.current = null))
  }, [])
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
    undos.current = []
    started.current = Date.now()
  }
  const startRound = (bucket: Round): void => void working(haligtree.round(bucket)).then((cards) => (chime('riffle'), fresh(cards, bucket)))
  const leaveRound = (): void => (tag && onLeave ? (chime('fold'), onLeave('today')) : void working(takeQueue()).then((cards) => (chime('fold'), fresh(cards, null))))
  // Where you are, kept as you go: a practice round (its cards, how far in, which done) and the words typed
  // for the card in front, until the round ends or the day turns. A tag's study is opened from its page, so it is not kept.
  useEffect(() => {
    if (tag || !queue) return
    keepLeftOff({ day: dayKey(), round, queue: round ? queue : [], at, reviewed: [...reviewed], card: queue[at]?.id ?? null, said })
  }, [tag, queue, round, at, reviewed, said])
  // Nothing has a question to be tested on yet: an example card shows what Review does with one.
  const ideas = useLive(() => haligtree.items('nugget'), [] as Item[], [], ['item'])
  const card = queue?.[at]
  // Exams ahead, nearest first, each with how ready it is.
  const exams = useLive(haligtree.exams, [] as Exam[])
  // What the line over the card, the shelf under it and the ending are drawn from, read here too (each read is
  // kept, so they start on it): drawn before, "2 days in a row" came a beat late and pushed the card down.
  const counts = useLive(haligtree.buckets, null as Record<Round, number> | null, [], ['item'])
  const speaking = useLive(haligtree.tagSpeak, {} as Record<string, string>, [], ['item'])
  // How strictly each tag's typed answers are checked, set on the tag's page.
  const tagStudy = useLive(haligtree.tagStudy, { sides: {}, timer: {}, place: {}, typed: {}, newPerDay: {}, retention: {} } as Awaited<ReturnType<typeof haligtree.tagStudy>>, [], ['item'])
  const days = useLive(haligtree.daysInARow, null as { run: number; banked: number } | null, [], ['item'])
  const slipping_ = useLive(haligtree.slipping, [] as Item[], [], ['item'])
  const inboxLeft = useLive(inboxOpen, null as number | null, [], undefined, 'review-inbox')
  const reading = unloaded(ideas) || unloaded(exams) || !counts || !days || unloaded(slipping_) || inboxLeft === null
  // The card you just missed, its source open to reread.
  const [source, setSource] = useState<Source | null>(null)
  // The source of the card just missed, there for R until the next grade.
  const [missed, setMissed] = useState<Source | null>(null)
  // The question shows unmasked while you edit it, so the mask is never saved.
  const [editing, setEditing] = useState(false)
  const [rewrites, setRewrites] = useState(0)
  // E pressed: the question focused with all its words picked, after it is drawn unmasked.
  const [editAsked, setEditAsked] = useState(0)
  // Esc pressed in the question: the edit is let go as the question loses the keys, never kept.
  const dropEdit = useRef(false)
  useEffect(() => {
    const h = heading.current
    if (!editAsked || !h) return
    h.focus()
    getSelection()?.selectAllChildren(h)
  }, [editAsked])
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
  // A video time on a note's card ("[13:03] What does...") says where it is
  // from, not what is asked: it leaves the question for the "From" line.
  const timeOn = card?.lineOf ? (/\[((?:\d{1,2}:)?\d{1,2}:[0-5]\d)\]/.exec(card.prompt ?? '')?.[1] ?? null) : null
  const asked = card ? masked(askedOf(card.prompt), answer).replace(timeOn ? /\s*\[(?:\d{1,2}:)?\d{1,2}:[0-5]\d\]\s*/g : /$^/, ' ').trim() : ''

  // Made from a picture: its covers asked in place of a question, lifted off to answer.
  const occlusion = card ? occlusionOf(card.fields) : null
  // Its deck's names for the two sides ("English", "Spanish") and its timer, by the card's tags.
  const words = card ? `${card.title ?? ''} ${card.prompt ?? ''} ${textOf(card.body)}` : ''
  const sides = card ? byDeck(words, tagStudy.sides) : null
  const limit = card && !occlusion ? byDeck(words, tagStudy.timer) : null
  const reveal = (): void => {
    setOver(true)
    if (shown) return
    fold()
    setShown(true)
    // A tag set to read its answers aloud: the answer said as it shows.
    const language = card && languageOf(`${card.title ?? ''} ${card.prompt ?? ''} ${textOf(card.body)}`, speaking)
    if (card && language) speak(textOf(card.body), language)
    // Out of the box, so 1 to 4 grade straight away.
    ;(document.activeElement as HTMLElement | null)?.blur()
  }
  // The last grade or Not today, for ⌘Z: the card, where it stood, and what it changed here.
  const [last, setLast] = useState<{ card: Due; at: number; said: string; grade: 1 | 2 | 3 | 4 | null; reviewed: boolean; lapses: number; counted: boolean } | null>(null)
  // A picture pasted (⌘V) or dropped while the answer shows: under the answer
  // at once, no editor to open and no leaving the queue, with Undo.
  // What ⌘Z takes back here, newest last: a grade (Review's `last`) or a picture put on an answer.
  const undos = useRef<({ grade: true } | { undo: () => void; done: () => boolean })[]>([])
  const pictureOnAnswer = (file: File): void => {
    const on = card
    if (!on) return
    void file.arrayBuffer().then((bytes) => window.api.saveImage(file.type, new Uint8Array(bytes))).then((src) => {
      if (!src) return refuse('That kind of picture cannot be kept: try a PNG or JPEG')
      const before = on.body
      const after = withPicture(before, src)
      const put = (body: unknown): void => {
        on.body = body
        setPictured((n) => n + 1)
        void haligtree.saveItem(on.id, { body })
      }
      put(after)
      // On Review's own undo list, after any grade: ⌘Z takes the picture off
      // first, the next ⌘Z the grade. Run once, from the toast or the key.
      let done = false
      const undo = (): void => {
        if (done) return
        done = true
        put(before)
      }
      undos.current.push({ undo, done: () => done })
      chime('added')
      toast('Picture added to the answer', undo)
    })
  }
  useEffect(() => {
    const onPaste = (event: ClipboardEvent): void => {
      if (!here() || !shown || !card || typing() || source) return
      const file = pictureIn(event.clipboardData)
      if (!file) return
      event.preventDefault()
      pictureOnAnswer(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })
  const undoLast = (): void => {
    if (!last) return
    const was = last
    setLast(null)
    void haligtree.ungrade(was.card.id).then((ok) => {
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
    if (!round) undos.current.push({ grade: true })
    if (!round) setLast({ card, at, said, grade: value, reviewed: !!card.reviewed, lapses: card.lapses, counted: reviewed.has(card.id) })
    setMissed(null)
    // What you typed before turning it over is kept, as a dated thought on the card.
    if (said.trim()) void keepGloss(card.id, said)
    void haligtree.grade(card.id, value, Date.now() - started.current, hintsTaken)
    typer.current = !!said.trim()
    // Easy the first time it is seen: maybe it was never worth a card. Asked, never decided for you.
    if (value === 4 && !card.reviewed && !round) {
      const easy = card
      toast('You knew it cold. Keep it as a card?', undefined, 'info', { label: 'Set it aside', key: 'A', run: () => setAside(easy, true) })
    }
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
      void haligtree.source(card.id).then((found) => found && setMissed({ ...found, needles }))
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
      undos.current.push({ grade: true })
      setLast({ card, at, said, grade: null, reviewed: !!card.reviewed, lapses: card.lapses, counted: reviewed.has(card.id) })
      void haligtree.bury(card.id).then(() => (chime('later'), toast('Back tomorrow')))
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
    // Its question taken into the keys with its words picked, as E does, once the card in front is drawn.
    setEditing(true)
    setEditAsked((n) => n + 1)
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
  const lineFrom = useLive(() => (lineCard?.lineOf ? haligtree.linkTitle(lineCard.lineOf) : Promise.resolve(null)), null as Awaited<ReturnType<typeof haligtree.linkTitle>> | null, [lineCard?.lineOf])
  // S: a star on the card, for a round of its own.
  const star = (): void => {
    if (!card) return
    const on = !card.starredAt
    card.starredAt = on ? new Date().toISOString() : null
    setStars((n) => n + 1)
    chime(on ? 'pin' : 'unpin')
    void haligtree.star(card.id, on)
  }
  // Apple Intelligence, where this Mac has it: the typed answer judged by what it means, and a hint before the answer.
  const ai = useStudyAi(useLive(haligtree.settings, null as Settings | null))
  // The box to type the answer in: only on a Mac with Apple Intelligence (its switch in Settings off, still word for word).
  const answerBox = useHas('ai')
  const answerWords = card ? wordsOf(answer ?? textOf(card.body)) : ''
  // Hints asked for this card: each a step stronger, the second the last; each schedules the card a step sooner.
  const [hinting, setHinting] = useState<{ id: string; said: string[]; busy: boolean; error?: string } | null>(null)
  const hints = card && hinting?.id === card.id ? hinting : null
  const hintsTaken = hints?.said.length ?? 0
  const canHint = ai && !!card && !!answerWords && !shown && hintsTaken < 2
  const giveHint = (): void => {
    if (!card || !canHint || hints?.busy) return
    const id = card.id
    const said = hints?.said ?? []
    chime('tap')
    setHinting({ id, said, busy: true })
    void askHint(asked, answerWords, said.length ? 2 : 1).then((got) => setHinting((was) => {
      if (!was || was.id !== id || !was.busy) return was
      if ('error' in got) return { id, said, busy: false, error: got.error }
      chime('noted')
      return { id, said: [...said, got.text], busy: false }
    }))
  }
  const stopHint = (): void => setHinting((was) => (was?.busy ? { ...was, busy: false } : was))
  // The card's own menu, as every card has one: right-click, or the quiet ⋯ by its star.
  const drop = (id: string): void => setQueue((cards) => cards && cards.filter((one) => one.id !== id))
  const cardMenu: RowItem[] = card ? [
    { label: 'Open', run: () => (chime('open'), window.api.openInHome('nugget', card.id)) },
    copyLinkItem(`nugget:${card.id}`, card.prompt || card.title || 'Card'),
    { label: 'Ask another way', hint: 'A new card keeping its context, source and tags', keys: 'A', run: () => (chime('open'), setAsking(card.id)) },
    ...(canHint ? [{ label: hintsTaken ? 'A stronger hint' : 'Give me a hint', hint: 'A nudge from the answer, never the answer: it comes back a step sooner', keys: 'H', run: giveHint }] : []),
    { label: 'Pause', hint: 'Out of Review until you bring it back', keys: '@', run: () => setAside(card, true, () => drop(card.id)) },
    // A study card kept as a gem as well, or a gem tested here made study only: it stays in Review either way.
    ...(() => {
      const move = tierItem(card, () => setQueue((cards) => cards && cards.map((one) => (one.id === card.id ? { ...one, tier: one.tier === 'card' ? 'nugget' : 'card' } : one))))
      return move ? [move] : []
    })(),
    'separator',
    binItem([{ type: 'nugget', id: card.id }], () => drop(card.id))
  ] : []
  // The typed answer, set against the real one once it is shown: how close, and the grade that suggests.
  // The first of the card's tags with a rule for typed answers (a tag under it counts too), the way its language is found.
  const strictness = card ? (languageOf(`${card.title ?? ''} ${card.prompt ?? ''} ${textOf(card.body)}`, tagStudy.typed) ?? 'usual') as Strictness : 'usual'
  // Counted right at once only when it is the answer word for word (capitals, spaces and stops aside; under a tag set to
  // "Exact", every mark the same). Anything else is never graded by how many letters it shares, which proved unreliable
  // (19 Nov, the user's ruling): with Apple Intelligence this Mac judges it by meaning, as a suggestion; without, your
  // words stand beside the answer and you grade it yourself, nothing picked for you.
  const exactly = !!(shown && said.trim() && card && sameAnswer(said, answer ?? textOf(card.body), strictness === 'exact'))
  const { grades, two, name: gradeName } = useGrades()
  // With two grades, Hard and Easy are both Got it: the suggestion is one of the buttons there.
  const judgeKey = ai && shown && card && answerWords && said.trim() && !exactly ? `${card.id}\n${said}` : null
  const [meaning, setMeaning] = useState<{ key: string; got: Judged | null } | null>(null)
  useEffect(() => {
    if (!judgeKey) return
    let live = true
    setMeaning({ key: judgeKey, got: null })
    void judge(asked, answerWords, said).then((got) => live && setMeaning((was) => (was?.key === judgeKey && !was.got ? { key: judgeKey, got } : was)))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [judgeKey])
  const judged = judgeKey && meaning?.key === judgeKey ? meaning.got : null
  const judging = !!judgeKey && meaning?.key === judgeKey && !meaning.got
  const verdict = judged && 'verdict' in judged ? judged : null
  // The grade it suggests: Easy for the answer word for word, else this Mac's judgement of its meaning, else none.
  const leaning = !said.trim() || !shown ? null : exactly ? 4 : verdict ? meaningGrade(verdict.verdict) : null
  const suggested = leaning === null ? null : two ? (leaning === 1 ? 1 : 3) : leaning
  const stopJudge = (): void => setMeaning((was) => (was && !was.got ? { key: was.key, got: { error: 'stopped' } } : was))
  // Split, only the pane in front answers keys.
  const here = useHere()
  // Its keys are a tool's (lib/tool-keys.ts): asked before the app's own, so G then R goes to Review and C, on a card, is never also a capture.
  const reviewKey = (event: KeyboardEvent): void => {
      if (!here()) return
      // ⌘Z: the last grade or Not today taken back, the card in front again.
      if (event.metaKey && !event.shiftKey && event.key === 'z' && !typing() && !source) {
        // Newest first: a picture taken off already (by its toast) is passed over.
        const stack = undos.current
        // A grade already taken back (by its button) is passed over too.
        const spent = (one: (typeof stack)[number]): boolean => ('undo' in one ? one.done() : !last)
        while (stack.length && spent(stack[stack.length - 1])) stack.pop()
        const top = stack.pop()
        if (top && 'undo' in top) {
          event.preventDefault()
          event.stopPropagation()
          return top.undo()
        }
        if (last) {
          event.preventDefault()
          event.stopPropagation()
          return undoLast()
        }
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
      // Esc stops Apple Intelligence thinking first: a hint or a check by meaning.
      if (event.key === 'Escape' && (hints?.busy || judging)) {
        event.preventDefault()
        event.stopPropagation()
        chime('fold')
        return hints?.busy ? stopHint() : stopJudge()
      }
      if (event.key === 'h' && canHint) {
        event.preventDefault()
        return giveHint()
      }
      // Esc leaves a deck's study for the decks it was picked from.
      if (event.key === 'Escape' && tag && onLeave) {
        event.preventDefault()
        chime('fold')
        return onLeave('decks')
      }
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
      // Space and ↵ as Anki has them: the question turned over, then, on the answer, Good (Got it with two grades). A
      // control the keys are on (a grade reached with Tab, a link) keeps its own ↵; a card turned back to its question
      // turns over again first.
      if ((event.key === ' ' || event.key === 'Enter') && card) {
        const onControl = event.key === 'Enter' && !!(event.target as Element | null)?.closest?.('button, a[href], input, textarea, select, [role="button"], [role="menuitem"], [role="option"], [role="tab"], [role="switch"], [role="checkbox"]')
        if (onControl) return
        event.preventDefault()
        if (shown && over) return grade(3)
        if (shown) turnTo(true)
        else reveal()
        return
      }
      // The grade key is used up here: its digit is never typed into the next card's box, which may take the keys at once.
      if (['1', '2', '3', '4'].includes(event.key)) {
        event.preventDefault()
        grade(Number(event.key) as 1 | 2 | 3 | 4)
      }
      // Anki's keys too, for hands that learnt them there: - (or =) buries, * marks, @ (or !) suspends.
      if (event.key === 'b' || event.key === '-' || event.key === '=') {
        event.preventDefault()
        bury()
      }
      if ((event.key === '@' || event.key === '!') && card) {
        event.preventDefault()
        return setAside(card, true, () => drop(card.id))
      }
      // E: rewrite the question right here, without leaving Review (Enter keeps it, Esc leaves it as it was).
      if (event.key === 'e' && card && !event.metaKey) {
        event.preventDefault()
        // Unmasked first, then focused with its words picked, once React has drawn them (the effect below).
        setEditing(true)
        setEditAsked((n) => n + 1)
        return
      }
      // A: a new card on the same thing, keeping this one's context, source and tags.
      if (event.key === 'a' && card) {
        event.preventDefault()
        chime('open')
        return setAsking(card.id)
      }
      // The answer read aloud again.
      if (event.key === 'p' && shown) sayAgain()
      if ((event.key === 's' || event.key === '*') && card) {
        event.preventDefault()
        star()
      }
      // ⌫ bins the card in front, as its menu's "Move to the Bin" says and as in every list; back with Undo or ⌘Z.
      if ((event.key === 'Backspace' || event.key === 'Delete') && card) {
        event.preventDefault()
        return binItem([{ type: 'nugget', id: card.id }], () => drop(card.id)).run()
      }
      // ; once the answer shows: a thought on it, without leaving the card.
      if (event.key === ';' && card && shown) {
        event.preventDefault()
        openGloss(card.id)
      }
    }
  useToolKeys(byDefault(reviewKey))

  if (!queue || reading) return <Page title="Review" waiting><div /></Page>
  if (source)
    return (
      <Page title="Review" lead={lead} actions={actions}>
        <SourcePanel source={source} onClose={leaveSource} />
      </Page>
    )
  if (learning)
    return (
      <Page title="Review" lead={lead} actions={actions}>
        <div className="page-sheet mx-auto w-full">
          <LearnMode onDone={() => void haligtree.queue().then((cards) => (setLearning(false), fresh(cards, null)))} />
        </div>
      </Page>
    )
  if (slipping)
    return (
      <Page title="Review" lead={lead} actions={actions}>
        <div className="page-sheet mx-auto w-full">
          <Slipping card={slipping.card} splitting={slipping.splitting} onRewrite={rewrite} onSplit={() => (chime('tap'), setSlipping({ ...slipping, splitting: true }))}
            onAside={aside} onKeep={() => setSlipping(null)} onSplitDone={() => setSlipping(null)} />
        </div>
      </Page>
    )
  if (!card && round)
    return (
      <Page title="Review" lead={lead} actions={actions}>
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
      <Page title="Review" lead={lead} actions={actions}>
        <div className="page-sheet mx-auto w-full">
        {queue.length || !(!unloaded(ideas) && !ideas.some((one) => one.prompt)) ? (
          // The end of the day's cards, or a day with none due: an ending, then the one way on.
          <Finished ids={[...reviewed]} count={reviewed.size} total={reviewed.size} later={round ? 0 : new Set(queue.map((one) => one.id)).size - reviewed.size} compact={compact} onPick={startRound} onLearn={() => setLearning(true)} />
        ) : (
          <Example compact={compact} tryIt="“Make a card” on the Decks tab, or the example deck there. A card joins today’s cards, and waits longer each time you remember it.">
            <ExampleCard />
          </Example>
        )}
        <StrugglingShelf />
        <InkLine />
        </div>
      </Page>
    )

  return (
    <Page title="Review" lead={lead} actions={actions}>
      {/* One card at a time in the middle of the page, never a narrow card with an empty half beside it. */}
      <div className="page-sheet mx-auto w-full">
      {/* One quiet line over the card: where you are, and practice, new cards and exams folded into it. */}
      {round ? <><RoundLine round={round} onLeave={leaveRound} /><Through at={at} total={queue.length} /></> : <TopLine at={earlier + at} total={earlier + queue.length} fresh={queue.filter((one) => one.first).length} exams={exams} onPick={startRound} onLearn={() => setLearning(true)} onTrim={(cards) => {
        // The queue is most at risk first: the first ones that fit the time are the ones to do now.
        chime('settled')
        setQueue((all) => all && all.slice(0, at + cards))
        toast(`${num(cards)} cards, about 25 minutes, most at risk first. The rest wait for later today or tomorrow.`)
      }} />}
      {missed && (
        // The line is the way back to the source, as R is: said with its key, never a sentence that ends on a colon.
        // There with the next card, whole: typed in, its underline ran under the words still to come as stray dashes.
        <p className="px-5 pt-3 -mb-1 text-xs text-muted-foreground">
          {/* R opens a card written in a note at its line first (the keys below): over such a card the press alone is said here, so one R is promised once. */}
          <LineWay data-missed-reread onClick={() => (chime('read'), setSource(missed))} keys={lineCard ? undefined : 'R'}>Missed that one? Reread where it came from</LineWay>
        </p>
      )}
      {/* The next card is there at once: grading fast never waits for the
          last one to finish leaving. Graded with 1 to 4, fifty times a
          sitting, the next card is simply there (lib/motion.ts rule 5);
          graded with a click it is tucked under the pile (it drops a little,
          shrinks and goes behind) while the next comes off the top. */}
      <AnimatePresence mode="popLayout" custom={byKeys()}>
      <motion.div
        key={`${card.id}-${at}`}
        custom={byKeys()}
        variants={{
          from: (keyed: boolean) => keyed
            ? { opacity: 0, transform: shift('translateX(0px) translateY(6px) scale(1)') }
            : { opacity: 0, transform: shift(cameBack ? 'translateX(-8px) translateY(0px) scale(1)' : 'translateX(0px) translateY(-4px) scale(0.985)') },
          here: (keyed: boolean) => keyed
            ? { opacity: 1, transform: shift('translateX(0px) translateY(0px) scale(1)'), zIndex: 1, transition: { duration: 0.11, ease: EASE } }
            : { opacity: 1, transform: shift('translateX(0px) translateY(0px) scale(1)'), zIndex: 1, transition: { duration: 0.22, ease: EASE } },
          gone: (keyed: boolean) => keyed
            ? { opacity: 0, pointerEvents: 'none', transition: { duration: 0 } }
            : { opacity: 0, transform: shift('translateX(0px) translateY(14px) scale(0.96)'), zIndex: 0, pointerEvents: 'none', transition: { opacity: { duration: 0.18 }, transform: { duration: 0.2, ease: EASE }, zIndex: { duration: 0 } } }
        }}
        // Reached or graded by a key, the card is simply there; by a click it arrives as a card.
        initial={byKeys() ? false : 'from'}
        animate="here"
        exit="gone"
        data-review-sheet
        className="flex flex-col gap-6 px-5 pt-4 pb-8"
      >
        {lineCard && (
          <p data-line-from className="-mb-4 flex items-center gap-1.5 text-sm text-muted-foreground">
            <span className="min-w-0 truncate">From <span {...(lineFrom ? hoverNote(lineFrom.type, lineFrom.id, { kind: lineFrom.kind }) : {})} className="text-foreground">{lineFrom?.title ? <WithPictures text={titleWithFormulas(lineFrom.title, lineCard.prompt, textOf(lineCard.body))} small /> : 'a note'}</span>{timeOn && <>, at <span data-line-time className="text-foreground tabular-nums">{timeOn}</span> in its video</>}, a line written as a card.</span>
            <LineWay data-line-open onClick={() => openLine(lineCard.lineOf!, lineCard.prompt)} keys="R">Open it at the line</LineWay>
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
        <RowMenu items={cardMenu}>
        <div data-review-card className="contents">
        {occlusion ? <PictureFace occlusion={occlusion} shown={shown} answer={answer ?? textOf(card.body)} onReveal={reveal} /> : <Flip
          over={over}
          onTurn={turnTo}
          onLater={bury}
          front={
            <div data-finish-face className="relative h-full rounded-[6px] border px-5 py-6">
              <Tip label="More">
                <button type="button" aria-label="More" data-review-more
                  onClick={(event) => {
                    const box = event.currentTarget.getBoundingClientRect()
                    event.currentTarget.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left, clientY: box.bottom }))
                  }}
                  className="absolute top-2 right-9 grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground">
                  <AliveIcon icon={DotsHorizontalIcon} size={16} />
                </button>
              </Tip>
              {/* S stars it, for a round of its own. */}
              <Tip label={card.starredAt ? 'Starred: S takes it off' : 'Star it: S'}>
                <button type="button" aria-label={card.starredAt ? 'Unstar' : 'Star'} aria-pressed={!!card.starredAt} data-star onClick={star}
                  className={`absolute top-2 right-2 rounded-md p-1 transition-colors hover:bg-foreground/[0.06] ${card.starredAt ? 'text-[var(--tt-color-text-yellow)]' : 'text-muted-foreground'}`}>
                  <Star className="size-4" fill={card.starredAt ? 'currentColor' : 'none'} />
                </button>
              </Tip>
              {/* The question is editable in place: a card forgotten again and again
                  is usually asking the wrong thing, and this is where you notice. */}
              {sides && <p data-side-front className="mb-1 text-sm text-muted-foreground">{sides[0]}</p>}
              <h2
                key={`${card.id}-${rewrites}`}
                ref={holdHeading}
                contentEditable
                suppressContentEditableWarning
                // One line: Enter keeps it rather than starting a second. Esc leaves it as it was, as Esc does in
                // every field: nothing typed is kept, and the question is drawn again from the card.
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    event.stopPropagation()
                    dropEdit.current = true
                    return event.currentTarget.blur()
                  }
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  event.currentTarget.blur()
                }}
                onFocus={() => setEditing(true)}
                onBlur={(event) => {
                  const prompt = event.currentTarget.textContent?.trim()
                  const dropped = dropEdit.current
                  dropEdit.current = false
                  // Drawn afresh, so what you typed never sits under React's own text.
                  setEditing(false)
                  setRewrites((n) => n + 1)
                  if (dropped || !prompt || prompt === card.prompt) return
                  // Anki's blanks typed with two or more numbers: a card for each, this one keeping c1.
                  if (clozeNumbers(prompt).length > 1) {
                    const was = card.prompt
                    void cardPerNumber(card.id, prompt, textOf(card.body), card.body).then((split) => {
                      if (!split) return
                      card.prompt = split.prompt
                      setRewrites((n) => n + 1)
                      sayNow(haligtree.saveItem(card.id, { prompt: split.prompt }), `${clozeNumbers(prompt).length} cards, one for each number`, () => {
                        for (const one of split.made) void haligtree.unlift('nugget', one)
                        card.prompt = was
                        setRewrites((n) => n + 1)
                        void haligtree.saveItem(card.id, { prompt: was })
                      })
                    })
                    return
                  }
                  // The card in the queue too, so an Again brings back the new words.
                  const before = card.prompt
                  card.prompt = prompt
                  void haligtree.saveItem(card.id, { prompt }).then(() => (chime('noted'), quietly(() => {
                    card.prompt = before
                    setRewrites((n) => n + 1)
                    void haligtree.saveItem(card.id, { prompt: before })
                  })))
                }}
                className={`rounded-md font-heading ${compact ? 'text-xl' : 'text-title'} font-semibold tracking-[-0.018em] text-balance outline-none`}
              >
                {editing ? card.prompt : <WithPictures text={asked} />}
              </h2>
            </div>
          }
          back={shown && (
            // Waiting on your grade: a faint beam goes round the answer.
            // On a light page the library draws it at a few percent, and it was
            // lost: there its stroke is drawn stronger, to a soft graphite arc.
            <BorderBeam size="md" colorVariant="mono" strength={0.5} style={surface === 'light' ? ({ '--beam-stroke-opacity': 12 } as React.CSSProperties) : undefined} duration={5} theme={surface} active={alive && over} borderRadius={8} className="h-full">
              {/* The answer sits at the box's edge, not in a page's wide margins. */}
              <div data-finish-face data-answer-side className="h-full rounded-[6px] border [--mf-padding:0.625rem_1rem_0.625rem_1.25rem] [&_.tiptap-word-count]:hidden"
                onDragOver={(event) => pictureIn(event.dataTransfer) !== null || [...event.dataTransfer.items].some((one) => one.type.startsWith('image/')) ? event.preventDefault() : undefined}
                onDrop={(event) => {
                  const file = pictureIn(event.dataTransfer)
                  if (!file) return
                  event.preventDefault()
                  pictureOnAnswer(file)
                }}>
                {/* What it answers, small at the top: the question is on the other side now. */}
                <p className="px-5 pt-3 text-xs text-muted-foreground">{sides && <span data-side-back className="font-medium text-(--mf-muted-strong)">{sides[1]}, for </span>}<WithPictures text={asked} small /></p>
                <HaligtreeEditor
                  key={pictured}
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
        />}
        </div>
        </RowMenu>
        {asking === card.id && <AnotherWay card={card} onClose={() => (chime('fold'), setAsking(null))} />}
        {isLeech(card.lapses) && (
          <p className="-mt-3 text-sm text-[var(--tt-color-text-orange)]">
            <Typed text={`Forgotten ${card.lapses} times. Rewrite the question above rather than drilling it: click it to edit.`} step={28} delay={300} />
          </p>
        )}

        {shown ? (
          <>
            {answerBox && said.trim() && (
              <div data-typed={exactly ? 'exact' : judgeKey ? 'meaning' : 'self'} className="-mb-2 flex flex-col gap-1 text-sm">
                {!verdict && !judging && <p className="whitespace-pre-line text-muted-foreground">You wrote: {said}</p>}
                {judging || verdict ? (
                  // One line, the same height waiting and answered, so the grades under it never move; the why is under the grades.
                  <p data-meaning-slot={verdict ? verdict.verdict : 'wait'} className="flex h-6 items-center whitespace-nowrap">
                    {verdict && suggested ? <strong className="font-semibold" style={{ color: GRADES[suggested - 1].tone }}>{VERDICT_SAID[verdict.verdict]}: that suggests {gradeName(suggested)}.</strong> : <Orb label="Checking what it means, on this Mac…" stop={stopJudge} />}
                  </p>
                ) : exactly && suggested ? (
                  <p><strong className="font-semibold" style={{ color: GRADES[suggested - 1].tone }}>Word for word: that suggests {gradeName(suggested)}.</strong> <span className="text-muted-foreground">Kept as a thought on the card when you grade it.</span></p>
                ) : (
                  <p className="text-foreground">Set it beside the answer and grade it yourself. <span className="text-muted-foreground">Kept as a thought on the card when you grade it.</span></p>
                )}
              </div>
            )}
            {/* Behind the answer: what makes it learnable (the picture, the bigger
                story, why it is so), shown only after it, or it would give the prompt away. */}
            <Behind card={card} />
            {/* Where it came from, which a flashcard app never knows. */}
            <Origin id={card.id} quote={card.kind === 'quote'} attribution={card.attribution} where={card.medium} year={fieldOf(card.fields, 'year')} said={`${card.prompt ?? ''}\n${textOf(card.body)}`} />
            {/* Made from a selection: the exact words it was lifted from, and the way to them in their note. */}
            {/* Made in the PDF reader, its place is a page of the book, not a passage of a note: the
                answer's own "Title, p. N" opens the book there, so no "Show in its note", which it has none of. */}
            {card.passage && !pdfOf(card) && (
              <figure data-card-passage className="-mt-2 flex flex-col gap-1.5 rounded-lg border px-3 py-2">
                <figcaption className="text-control font-medium text-(--mf-muted-strong)">The passage it came from</figcaption>
                <blockquote className="line-clamp-4 text-body whitespace-pre-line text-foreground">{card.passage}</blockquote>
                <Button variant="ghost" size="sm" data-card-passage-open className="-ml-2 self-start" onClick={() => void haligtree.source(card.id).then((found) => {
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
            <CardSize id={card.id} answer={answer ?? textOf(card.body)} />
            {/* A thought on it now: out of sight until ; opens it or there is one,
                so the Behind the answer field above is the only field under the answer. */}
            <GlossLine id={card.id} latest={!!behindOf(card)} quiet className="-mt-3" />
            {hintsTaken > 0 && (
              <p data-hints-taken={hintsTaken} className="-mb-1 text-body font-medium text-foreground">
                {hintsTaken === 1 ? 'You took a hint, so it comes back sooner.' : 'You took two hints, so it comes back sooner still.'} The times under the grades already count it.
              </p>
            )}
            {/* The key shows where there is room for it; in a narrow panel the time comes first. Under a long answer
                the grades stay in sight at the foot of the page, as Anki's answer bar does, the answer passing under
                them on the page's own paint: never scrolled to before a card can be graded by a press. */}
            <div data-grades={grades.length} className={`@container sticky bottom-0 z-[2] -my-2 grid gap-2 bg-background py-2 ${two ? 'grid-cols-2' : 'grid-cols-4'}`}>
              {grades.map(({ grade: value, label, hint, tone }) => (
                <Tip key={value} label={`${hint}: back ${backIn(hintedTimes(card.intervals, Date.now(), hintsTaken)[value])}`}>
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
                  {two ? (
                    // With two, when it comes back is the big line: that is what the choice decides.
                    <>
                      <span className="max-w-full truncate text-body font-semibold tabular-nums text-foreground">{backIn(hintedTimes(card.intervals, Date.now(), hintsTaken)[value])}</span>
                      <span className="text-xs font-medium" style={{ color: tone }}>{label} <Kbd>{value}</Kbd></span>
                    </>
                  ) : (
                    <>
                      <span className="font-semibold" style={{ color: tone }}>{label}</span>
                      <span className="max-w-full truncate text-xs text-muted-foreground tabular-nums">{backIn(hintedTimes(card.intervals, Date.now(), hintsTaken)[value])}</span>
                    </>
                  )}
                </button>
                </Tip>
              ))}
            </div>
            {(() => { const back = hintedTimes(card.intervals, Date.now(), hintsTaken); return <HowItDecides id={card.id} back={{ again: backIn(back[1]), hard: backIn(back[2]), good: backIn(back[3]), easy: backIn(back[4]) }} /> })()}
            {verdict && (
              // Why, under everything, so its length moves nothing above it.
              <p data-meaning={verdict.verdict} className="-mt-2 text-body text-foreground">
                You said {quoted(cutWords(said, 48), 80)}, the card says {quoted(cutWords(answerWords, 48), 80)}.{verdict.missing ? ` ${verdict.missing.replace(/\.?$/, '.')}` : ''} The grade is yours.
                <span className="mt-0.5 block text-xs text-muted-foreground">Checked by meaning with Apple Intelligence, on this Mac. What you wrote is kept as a thought on the card when you grade it.</span>
              </p>
            )}
          </>
        ) : (
          <>
          {/* Typing the answer first is Apple Intelligence's to check: on a Mac without it, Anki's way, the answer is
              shown and the grade is yours, with no box to type in (the user, 20 Nov). */}
          {answerBox && <Textarea
            ref={box}
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
            data-typed-lines=""
            // Ruled lines under the card, written on in the card's serif: a page to answer on, not a grey box.
            className="min-h-0 resize-none rounded-none border-0 bg-transparent px-5 py-0 font-serif text-heading leading-[2.25rem] shadow-none placeholder:font-sans placeholder:text-body placeholder:italic placeholder:text-muted-foreground focus-visible:ring-0 dark:bg-transparent md:text-heading"
            style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 calc(2.25rem - 1px), color-mix(in oklab, var(--foreground) 12%, transparent) calc(2.25rem - 1px) 2.25rem)', backgroundAttachment: 'local' }}
          />}
          <span className="flex flex-wrap items-center gap-3 self-start">
            <Button size="lg" onClick={reveal} className="cursor-pointer" data-show-answer>
              {sides ? `Show the ${sides[1]}` : 'Show the answer'}
            </Button>
            {limit && <CardTimer key={`${card.id}-${at}`} seconds={limit} paused={editing} onEnd={reveal} />}
            {/* A nudge from the answer, never the answer, on this Mac: a second press, a stronger one, and that is all. */}
            {ai && answerWords && (hintsTaken < 2 || hints?.busy) && (
              // One fixed height for the button and the orb that takes its place, so the row never moves.
              <span className="flex h-10 items-center">
                {hints?.busy ? <Orb label={hintsTaken ? 'Thinking of a stronger hint…' : 'Thinking of a hint…'} stop={stopHint} /> : (
                  <Button variant="ghost" size="lg" data-hint-ask onClick={giveHint} className="cursor-pointer text-muted-foreground">
                    {hintsTaken ? 'A stronger hint' : 'Give me a hint'} <Kbd>H</Kbd>
                  </Button>
                )}
              </span>
            )}
          </span>
          {(hintsTaken > 0 || hints?.error) && (
            <div data-hints className="flex flex-col gap-1">
              {hints!.said.map((text, n) => (
                <p key={n} data-hint={n + 1} className="text-heading leading-snug text-foreground"><span className="font-semibold">{n ? 'Stronger hint' : 'Hint'}:</span> {text}</p>
              ))}
              {hints?.error && <p data-hint-error className="text-body text-[var(--tt-color-text-orange)]">{hints.error}</p>}
            </div>
          )}
          </>
        )}
        {!shown && (
          <div className="-mt-3 flex flex-wrap items-center gap-1 self-start">
            <Button variant="ghost" size="sm" onClick={bury} className="text-muted-foreground">
              {round ? 'Skip' : 'Not today'}
            </Button>
            {last && (
              <Button variant="ghost" size="sm" data-undo-grade onClick={undoLast} className="text-muted-foreground">
                {last.grade ? `Undo ${quoted(gradeName(last.grade), 80)}` : 'Undo “Not today”'}
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
function TopLine({ at, total, fresh: today, exams, onPick, onLearn, onTrim }: { at: number; total: number; /** Of today's cards, the new ones: counted from the queue itself. */ fresh: number; exams: Exam[]; onPick: (bucket: Round) => void; onLearn: () => void; /** Keep only as many cards as fit 25 minutes. */ onTrim: (cards: number) => void }): React.JSX.Element {
  const pace = useLive(haligtree.reviewPace, null as number | null, [], ['item'])
  const left = total - at
  const minutes = minutesFor(left, pace)
  const each = pace && pace > 3000 ? Math.min(pace, 60000) : 30000
  const fits = Math.max(1, Math.floor((25 * 60000) / each))
  const counts = useLive(haligtree.buckets, null as Record<Round, number> | null, [], ['item'])
  const days = useLive(haligtree.daysInARow, null as { run: number; banked: number } | null, [], ['item'])
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
                #{exam.tag} <span className="text-muted-foreground">{exam.days === 0 ? 'ready today' : exam.days === 1 ? 'ready tomorrow' : `ready in ${num(exam.days)} days`}</span>
              </span>
            </Tip>
          ))}
        </span>
        <Through at={at} total={total} minutes={minutes} fresh={today} />
        <span className="flex flex-wrap items-center justify-start gap-1 @lg:justify-end">
          {minutes > 30 && left > fits && (
            <Tip label={`A long day: the ${num(fits)} most at risk of fading first, about 25 minutes. The rest wait.`}>
              <button type="button" data-do-25 onClick={() => onTrim(fits)} className={quiet}>Do 25 minutes now</button>
            </Tip>
          )}
          {fresh > 0 && (
            <Tip label={`${plural(fresh, 'card')} not studied yet: learn them in a guided round before they join the schedule`}>
              {/* A round takes eight at most: with more waiting it says "the next 8 cards", never as if eight were all
                  there are, in no more room than the line has for it beside "Practise". */}
              <button type="button" data-learn-new onClick={() => (chime('open'), onLearn())} className={quiet}>
                Learn {fresh > 8 ? 'the next 8 cards' : `${num(fresh)} not studied yet`}
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
function Through({ at, total, minutes, fresh }: { at: number; total: number; /** About how long the cards left take, at your own pace. */ minutes?: number; /** How many of today's cards are new ones. */ fresh?: number }): React.JSX.Element {
  return (
    <div data-through className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
      {total <= 12 ? (
        <span aria-hidden className="flex items-center gap-1.5">
          {Array.from({ length: total }, (_, index) => (
            <span key={index} className={`size-1.5 rounded-full transition-colors duration-300 ${index < at ? 'bg-[var(--tt-brand-color-400)]' : index === at ? 'bg-foreground' : 'bg-border'}`} />
          ))}
        </span>
      ) : (
        <ProgressBar value={at / total} label={`${num(at)} of ${num(total)} reviewed`} thick={2} duration={300} silent fill="var(--tt-brand-color-400)" className="w-24" />
      )}
      <Rolling text={`${num(at + 1)} of ${num(total)}`} by="word" />
      {/* What today brings that you have not met: its new cards, out of the daily limit (Settings and each deck's own). */}
      {fresh !== undefined && <span data-new-today={fresh} className="text-(--mf-muted-strong)">{fresh ? `${num(fresh)} new today` : 'no new cards today'}</span>}
      {minutes !== undefined && <span data-minutes-left className="text-(--mf-muted-strong)">about {num(minutes)} {minutes === 1 ? 'minute' : 'minutes'} left</span>}
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
                {Array.from({ length: total }, (_, index) => <span key={index} className="size-1.5 rounded-full shrink-0 bg-[var(--tt-brand-color-400)]" />)}
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

/** "this morning", "this afternoon", "this evening": when the day's reviews were done. */
const partOfDay = (at: string | null): string => {
  const hour = at ? new Date(at).getHours() : 12
  return hour < 12 ? 'this morning' : hour < 17 ? 'this afternoon' : 'this evening'
}

/** A day in a row worth a line of its own: 7, 30, 100. No confetti, no score. */
const MILESTONES: Record<number, string> = {
  7: 'Seven days in a row. That is how it sticks.',
  30: 'Thirty days in a row. It is a habit now, not an effort.',
  100: 'A hundred days in a row. Very few people ever get here.'
}

/**
 * What the reviewing has added up to, said only against your own past and
 * only when it is true: a best day for cards remembered (with at least a week
 * of earlier days to beat, and ten cards or more), then the cards you now
 * know against a month ago. Never a count of sittings or of days opened: each
 * line is about remembering, the thing itself. Just finished, the lines come
 * one at a time after the book rises, each a beat after the last, the record
 * with a soft note; come back to later, or with Reduce motion, they are
 * simply there.
 */
function Grown({ reveal }: { reveal: boolean }): React.JSX.Element | null {
  const grown = useLive(haligtree.reviewGrown, null as Awaited<ReturnType<typeof haligtree.reviewGrown>> | null, [], ['item'])
  if (!grown) return null
  const record = grown.daysBefore >= 7 && grown.remembered >= 10 && grown.remembered > grown.best
  const gain = grown.known - grown.knownMonthAgo
  const lines = [
    record && { id: 'record', body: <><strong className="font-semibold">Your best day yet: {num(grown.remembered)} cards remembered,</strong> <span className="text-muted-foreground">past your old best of {num(grown.best)}.</span></> },
    gain > 0 && { id: 'known', body: <>You now know <strong className="font-semibold">{plural(grown.known, 'card', 'cards')}</strong>, <strong className="font-semibold">{num(gain)} more</strong> than a month ago <span className="text-muted-foreground">(known: remembered after 15 days or more).</span></> }
  ].filter((one): one is { id: string; body: React.JSX.Element } => !!one)
  if (!lines.length) return null
  return (
    <div data-grown data-reveal={reveal || undefined} className="flex flex-col gap-1.5">
      {lines.map((line, at) => (
        <p key={line.id} data-grown-line={line.id} className="text-body text-foreground tabular-nums" ref={(el) => {
          // Revealed once, as it first lands: the Web Animations API, filled backwards so it waits unseen through its delay.
          if (!el || !reveal || el.dataset.revealed) return
          el.dataset.revealed = ''
          const rise = el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0px)' }], { duration: 300, delay: 750 + at * 350, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' })
          if (line.id === 'record') rise.onfinish = () => chime('reveal')
        }}>
          {line.body}
        </p>
      ))}
    </div>
  )
}

/**
 * The end of the day's cards, or a day with none due: the star rises, the
 * line on what that means, and one way on. Your Inbox when something waits
 * there, else the new cards to learn, else Home. Practice stays a quiet link
 * away, unfolded only when asked for. Enter takes the way on.
 */
function Finished({ count, total, later = 0, compact, onPick, onLearn, ids = [] }: { count: number; total: number; /** Cards put off with Not today in this sitting. */ later?: number; compact: boolean; onPick: (bucket: Round) => void; onLearn: () => void; /** The cards graded in this sitting, for its score. */ ids?: string[] }): React.JSX.Element {
  const counts = useLive(haligtree.buckets, null as Record<Round, number> | null, [], ['item'])
  const days = useLive(haligtree.daysInARow, null as { run: number; banked: number } | null, [], ['item'])
  const inbox = useLive(inboxOpen, null as number | null, [], undefined, 'review-inbox')
  const sitting = useLive(haligtree.reviewToday, null as Awaited<ReturnType<typeof haligtree.reviewToday>> | null, [], ['item'])
  const exams = useLive(haligtree.exams, [] as Exam[])
  const [practising, setPractising] = useState(false)
  const done = count > 0
  // Cards reviewed today in earlier sittings: "Done for today" stays said all day.
  const today = sitting?.done ?? 0
  // The page's own how-to line has done its job once a day's cards are finished: put away for good.
  useEffect(() => {
    if (!done) return
    void onboarding.state().then((state) => void (state.hintsSeen.includes('review') || onboarding.set({ hintsSeen: [...state.hintsSeen, 'review'] })))
  }, [done])
  const fresh = counts?.new ?? 0
  const learn = fresh > 8 ? 'the first 8 cards not studied yet' : fresh === 1 ? 'the card not studied yet' : `the ${num(fresh)} cards not studied yet`
  const ways = [
    inbox ? { id: 'inbox', label: `Next: ${plural(inbox, 'capture')} in your Inbox`, short: `your Inbox (${num(inbox)})`, run: () => (chime('open'), window.api.openInHome('view', 'inbox')) } : null,
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
          <h2 className={`font-serif ${compact ? 'text-heading font-semibold' : 'text-title font-semibold'}`}>
            {done ? <>Done: <Rolling text={count} /> reviewed</> : later ? 'All put off until tomorrow' : today > 0 ? 'Done for today' : 'Nothing due right now'}
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            {done
              ? <><strong className="font-semibold text-foreground">A little most days outlasts one long cram.</strong> That is today’s cards finished. What you could not recall comes back soonest; the rest waits longer each time you remember it.</>
              : later ? <><strong className="font-semibold text-foreground">{later === 1 ? 'The card you put off comes back tomorrow.' : `The ${num(later)} cards you put off come back tomorrow.`}</strong> Nothing else is due today.</>
              // Back later the same day: the day's work is still said, not "nothing due".
              : today > 0 ? <><strong data-done-today className="font-semibold text-foreground">{num(today)} {today === 1 ? 'card' : 'cards'} {partOfDay(sitting?.last ?? null)}.</strong> What you could not recall comes back soonest; the rest waits longer each time you remember it.</>
              : <><strong className="font-semibold text-foreground">No card is due yet.</strong> Each one comes back as you start to forget it, so there is nothing to do here until then.</>}
          </p>
          {/* What it has added up to, against your own past: shown one line at a time once the book has risen. */}
          {(done || today > 0) && <Grown key={done ? 'done' : 'today'} reveal={done && !flat} />}
          {/* Two honest numbers from the sitting: the card that held longest, and the time a card took. */}
          {(done || today > 0) && sitting?.kept && <p data-still-knew className="text-body text-foreground">You still knew <strong className="font-semibold">{quoted(sitting.kept.prompt, 80)}</strong> after {num(sitting.kept.days)} days.</p>}
          {(done || today > 0) && !!sitting?.seconds && <p data-seconds-each className="text-control text-foreground tabular-nums">About {num(sitting.seconds)} {sitting.seconds === 1 ? 'second' : 'seconds'} a card today.</p>}
          {milestone ? <p data-milestone className="text-body font-semibold text-foreground">{milestone}</p>
            : null}
          {/* The week first, which one day off cannot break; the run after it. */}
          {!milestone && !!sitting?.week && (done || today > 0) && <p data-week-days className="text-control text-foreground tabular-nums"><strong className="font-semibold">{num(sitting.week)} of the last 7 days</strong> reviewed{days && days.run >= 2 ? <span className="text-muted-foreground">, {num(days.run)} in a row</span> : ''}.</p>}
          {!milestone && !(sitting?.week && (done || today > 0)) && days && days.run >= 2 && <p data-days-in-a-row className="text-control text-foreground tabular-nums"><strong className="font-semibold">{num(days.run)} days</strong> in a row{days.banked ? <span className="text-muted-foreground">, {num(days.banked)} rest {days.banked === 1 ? 'day' : 'days'} banked</span> : ''}.</p>}
          <div className="mt-2 flex flex-col items-start gap-2.5">
            {next ? (
              <Button data-onward size="lg" onClick={next.run} className="gap-2">
                {next.label}
              </Button>
            ) : (
              <Button data-onward variant="outline" size="lg" onClick={() => (chime('open'), window.api.openInHome('view', 'day'))}>Back to Today</Button>
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
  const { grades, two } = useGrades()
  return (
    <div className="flex flex-col gap-4 px-5 py-6">
      <div data-finish-face className="rounded-[6px] border px-5 py-6">
        <h2 className="font-heading text-title font-semibold tracking-[-0.018em] text-balance">{exampleCard.prompt}</h2>
      </div>
      <div data-finish-face className="rounded-[6px] border px-5 py-4">
        <p className="text-xs text-muted-foreground">From {exampleCard.from}</p>
        <p className="mt-1.5 leading-relaxed">{exampleCard.answer}</p>
      </div>
      <div className={`@container grid gap-2 ${two ? 'grid-cols-2' : 'grid-cols-4'}`}>
        {grades.map(({ grade, label, tone }) => (
          <span key={grade} className="flex min-h-12 min-w-0 flex-col items-center justify-center rounded-md border px-2 py-1.5 text-control">
            {two ? <span className="text-body font-semibold tabular-nums">{back[grade - 1]}</span> : <span className="font-semibold" style={{ color: tone }}>{label}</span>}
            <span className="max-w-full truncate text-xs tabular-nums" style={two ? { color: tone } : undefined}>{two ? label : back[grade - 1]}</span>
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
function Origin({ id, quote, attribution, where, year, said }: { id: string; quote?: boolean; attribution: string | null; where?: string | null; year?: string | null; said: string }): React.JSX.Element | null {
  const lineage = useLive(() => haligtree.lineage(id), null, [id])
  const card = plain(said)
  const fresh = (text: string | null | undefined): text is string => !!text && !card.includes(plain(text))
  const who = fresh(attribution) ? attribution : null
  const from = lineage?.from[0]?.title
  const source = fresh(from) && plain(from) !== plain(attribution ?? '') ? from : null
  if (!who && !source) return null
  const whence = source && `from ${/^["“‘'«]/.test(source) ? source : `${quoted(source, 80)}`}`
  // A quote is signed: the name in a pen's hand, then where it came from.
  if (quote && who) return <p className="-mt-2 flex min-w-0 items-baseline text-xs text-muted-foreground"><Signed who={who} where={where} year={year} className="private-text" />{whence && <span className="truncate">, {whence}</span>}</p>
  return (
    <p className="-mt-2 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      {who && <Avatar name={who} size={14} />}
      <span className="min-w-0">{who && `Said by ${who}`}{who && source && ', '}{source && <>from <span {...(lineage?.from[0] ? hoverNote(lineage.from[0].type, lineage.from[0].id) : {})}>{/^["“‘'«]/.test(source) ? source : `${quoted(source, 80)}`}</span></>}</span>
    </p>
  )
}

type Source = { type: string; id: string; title: string; body: unknown; needles: string[] }

/** The words a cloze blanked, found by what stands either side of the blank. */
/**
 * A note named by its first line keeps that line's words but not its `$`s
 * ("x^2"): the card's own question, which has them, puts them back where its
 * words open the title, so the "From" line draws the formula.
 */
/** The page of a PDF a card was made on, when it was made in the reader: the link its answer carries back, `haligtree://assets/….pdf#page=3`. */
function pdfOf(card: { passage?: string | null; body: unknown }): string | null {
  if (!/^p\. \d+$/.test(card.passage ?? '')) return null
  // The stored answer as written (its words, read for showing, drop the link).
  return /\(((?:haligtree|mindflow):\/\/assets\/[^)\s]+\.pdf#[^)\s"]*)\)/.exec(typeof card.body === 'string' ? card.body : JSON.stringify(card.body ?? ''))?.[1] ?? null
}

function titleWithFormulas(title: string, prompt: string | null, answer: string): string {
  for (const line of [`${prompt ?? ''} :: ${answer.trim()}`, prompt ?? '']) {
    if (!line.includes('$')) continue
    const bare = line.replace(/\$([^$\n]+)\$/g, '$1')
    if (title.startsWith(bare)) return line + title.slice(bare.length)
  }
  return title
}

/** A cloze's answer, its blanks' answers in order when it has several ("25, 13, 3"). */
function answerOf(prompt: string | null, body: unknown): string | null {
  // Anki's own blanks typed in the question ({{c1::word::hint}}): the answers are inside them.
  if (clozeNumbers(prompt).length) return askCloze(prompt!).answers.join(', ') || null
  return answersOf(prompt, textOf(body))?.join(', ') ?? null
}

/** The question as asked: typed Anki blanks drawn as gaps, the button's blanks as they are. */
const askedOf = (prompt: string | null): string => (clozeNumbers(prompt).length ? askCloze(prompt!).asked : (prompt ?? ''))

/** The question with each answer blanked wherever else it appears. */
function masked(prompt: string, answer: string | null): string {
  let out = prompt
  for (const one of answer?.split(', ') ?? []) {
    if (one.length < 2) continue
    out = out.replace(new RegExp(one.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '_____')
  }
  return out
}

/**
 * Behind the answer, under it: the picture, the bigger story, why it is so
 * (the card's Context and an older Why, as one). With none, your latest gloss,
 * which often already says it; with neither, a line to write one, kept as the
 * card's "Behind the answer".
 */
function Behind({ card }: { card: Due }): React.JSX.Element {
  const [behind, setBehind] = useState(() => behindOf(card))
  // Words taken back to change (a click on a one-line one) or with Undo: in the field again, the caret at its end.
  const [again, setAgain] = useState('')
  // One line of words is changed where it is read; a longer one, or one with pictures, on the card's page ("Edit this card beside").
  const oneLine = !!behind && !behind.includes('\n') && !picturesIn(behind).length
  const keep = (line: string | null): void => {
    card.context = line
    card.why = null
    setBehind(line ?? '')
  }
  if (behind)
    return (
      <div data-card-context className="-mt-2 flex flex-col gap-0.5 text-sm leading-relaxed">
        <span className="text-control font-medium text-(--mf-muted-strong)">Behind the answer</span>
        {oneLine ? (
          <Tip label="Click to change it">
            <button type="button" data-why-saved className="self-start rounded text-left text-muted-foreground hover:bg-accent" onClick={() => { chime('tap'); setAgain(behind); setBehind('') }}>{behind}</button>
          </Tip>
        ) : <div className="text-muted-foreground"><WithPictures text={behind} /></div>}
      </div>
    )
  if (card.gloss && !again)
    return (
      <p className="-mt-2 text-sm leading-relaxed">
        <span className="text-muted-foreground">Why, in your own words: </span>{card.gloss}
      </p>
    )
  // The one field under the answer, named: a thought on the card is kept here too (; opens a dated one).
  return (
    <label data-why className="-mt-2 flex flex-col gap-1 text-sm">
      <span><strong className="font-semibold">Why is it so?</strong> One line, shown behind the answer next time.</span>
    <Input
      key={again}
      placeholder="Because…"
      defaultValue={again}
      autoFocus={!!again}
      onFocus={(event) => event.currentTarget.setSelectionRange(event.currentTarget.value.length, event.currentTarget.value.length)}
      // A ruled line written on in the serif, as the typed answer above it: not a grey box. The app's one ruled line (mf-ruled).
      className="mf-ruled h-9 rounded-none border-0 bg-transparent px-0.5 font-serif text-body shadow-none placeholder:font-sans placeholder:text-sm placeholder:italic placeholder:text-muted-foreground focus-visible:ring-0 dark:bg-transparent"
      // Opened to change it and left as it was: it stays saved and shown.
      onBlur={(event) => { if (again && event.currentTarget.value.trim() === again) setBehind(again) }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') return event.currentTarget.blur()
        const line = event.currentTarget.value.trim()
        if (event.key !== 'Enter' || !line) return
        event.preventDefault()
        // One being changed goes back to what it said before; a new one back to the empty field.
        const before = again || null
        keep(line)
        chime('noted')
        void haligtree.saveBehind(card.id, line).then(() =>
          toast(before ? 'Changed: it shows behind the answer' : 'Saved: it shows behind the answer', () => {
            keep(before)
            if (!before) setAgain(line)
            void haligtree.saveBehind(card.id, before)
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
      hit.scrollIntoView({ block: 'center', behavior: glideWay() })
    }
    find()
    return () => cancelAnimationFrame(frame)
  }, [source])
  return (
    <motion.div initial={{ opacity: 0, transform: shift('translateY(8px)') }} animate={{ opacity: 1, transform: shift('translateY(0px)') }} className="flex min-h-0 flex-col gap-3 px-5 py-6">
      <div className="flex items-center gap-3">
        <p className="flex-1 text-sm text-muted-foreground">
          <Typed text={`Where it came from: ${quoted(source.title || 'New note', 200)}`} step={28} delay={100} />
        </p>
        <Button variant="outline" size="sm" onClick={onClose}>Back to the review</Button>
      </div>
      <div ref={box} className="max-h-[60vh] overflow-y-auto rounded-lg border">
        <HaligtreeEditor
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
  { key: 'unseen', label: 'not studied yet', color: 'var(--tt-color-text-gray)' }
] as const

/**
 * How ready one exam is: solid, learning, struggling and not studied yet, as
 * one bar. No bar before anything has been seen: a sentence says so instead.
 */
export function Readiness({ exam, named = true }: { exam: Exam; named?: boolean }): React.JSX.Element {
  const seen = exam.total - exam.unseen
  const day = exam.days === 0 ? 'today' : exam.days === 1 ? 'tomorrow' : `in ${num(exam.days)} days`
  return (
    <div className="space-y-1.5 text-xs text-muted-foreground">
      {named && <p className="text-sm text-foreground">#{exam.tag} <span className="text-muted-foreground">· {day}, {whenInLine(exam.at)}</span></p>}
      {!exam.total ? (
        <p>No cards carry #{exam.tag} yet. Make cards with that tag and they are paced to be ready in time.</p>
      ) : !seen ? (
        <p><Rolling text={exam.total} /> {exam.total === 1 ? 'card' : 'cards'}, none seen yet. About <Rolling text={exam.perDay} /> a day from today has them all met in time.</p>
      ) : (
        <>
          {/* Drawn at its widths, there with the page: data, not a show. */}
          <div className="flex h-1.5 overflow-hidden rounded-[2px]">
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

/**
 * When a card is too big, said under its answer while it is in front of you:
 * an answer holding more than 4 things (Carter's rule), or a card that has
 * taken you 40 seconds or more each time. Both offer the card's page beside.
 */
function CardSize({ id, answer }: { id: string; answer: string }): React.JSX.Element | null {
  const history = useLive(() => haligtree.history(id), null as Awaited<ReturnType<typeof haligtree.history>> | null, [id])
  const things = thingsIn(answer)
  const timed = (history?.reviews ?? []).filter((one) => one.ms).map((one) => Math.min(one.ms!, 60000))
  const seconds = timed.length >= 2 ? Math.round(timed.reduce((sum, ms) => sum + ms, 0) / timed.length / 1000) : 0
  const said = things > 4 ? `This answer holds ${num(things)} things; four at most stay together. Split it, group them under a few headings, or add a memory hook (a word from their first letters).`
    : seconds >= 40 ? `This card takes you about ${num(seconds)} seconds each time. Quick cards stick better: split it into two or three.` : null
  if (!said) return null
  return (
    <p data-card-size className="-mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-[var(--tt-color-text-orange)]">
      {said}
      {canSplit() && <Button variant="ghost" size="sm" data-card-size-edit className="-ml-2" onClick={() => (chime('open'), openAside('nugget', id))}>Split it beside</Button>}
    </p>
  )
}

/** A card's own past in review: the dates, the grades, and the gaps it grew through. */
export function ReviewHistory({ id }: { id: string }): React.JSX.Element | null {
  const history = useLive(() => haligtree.history(id), null as Awaited<ReturnType<typeof haligtree.history>> | null, [id])
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
            <span className="w-24 text-muted-foreground">{when(one.at)}</span>
            <span className="w-12" style={{ color: grade?.tone }}>{grade?.label}</span>
            {one.gap && <span className="text-muted-foreground">then {one.gap}</span>}
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
  const points = useLive(() => haligtree.strength(id), [] as { at: string; grade: number; days: number }[], [id])
  if (points.length < 1) return null
  const W = 180
  const H = 36
  const top = Math.log10(Math.max(2, ...points.map((one) => one.days)) + 1)
  const xy = points.map((one, n) => [points.length === 1 ? W / 2 : 4 + (n / (points.length - 1)) * (W - 8), H - 4 - (Math.log10(one.days + 1) / top) * (H - 8)] as const)
  const last = points[points.length - 1].days
  return (
    <div data-strength className="flex flex-col gap-1 pb-1">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Strength after each review" className="h-9 w-full max-w-[16rem] overflow-visible">
        {/* The charts' one ink: a 2 px monotone line (never past a point), each review a filled dot in its grade's tone, ringed in the page. */}
        <path d={line().curve(curveMonotoneX)(xy.map(([x, y]) => [x, y])) ?? ''} fill="none" stroke="var(--foreground)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {xy.map(([x, y], n) => <circle key={points[n].at} cx={x} cy={y} r={3.5} fill={GRADES[points[n].grade - 1]?.tone ?? 'var(--foreground)'} stroke="var(--background)" strokeWidth={1.5} />)}
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
 * way to the other. Given `onLater`, a flick down puts it off ("Not today"):
 * the card follows the hand down and goes under the pile; it never grades.
 */
export function Flip({ over, onTurn, onLater, front, back }: { over: boolean; onTurn: (over: boolean) => void; /** A flick down: put off until tomorrow. */ onLater?: () => void; front: React.ReactNode; back: React.ReactNode }): React.JSX.Element {
  const turn = useMotionValue(over ? 180 : 0)
  const drop = useMotionValue(0)
  // Where the turn is headed, which is not where it is while it is moving.
  const aim = useRef(over ? 180 : 0)
  const spin = useRef<AnimationPlaybackControls | null>(null)
  const grip = useRef<{ x: number; y: number; base: number; moved: boolean; down: boolean; width: number; trail: { t: number; deg: number }[] } | null>(null)
  const flat = still()
  // The card is the size of the side that is up: at rest the side turned down is not laid out (main.css, [data-flip]),
  // so an answer turned back to its question leaves no empty card under it (the user, 13 Nov: "spot the problem after
  // closing a card"). While it turns both sides are, each cut to the card's height at that point of the turn: the one
  // side's own height eased into the other's by the turn itself, so a drag held half way holds the height half way.
  const box = useRef<HTMLDivElement>(null)
  const sizes = useRef<{ front: number; back: number } | null>(null)
  const sizeAt = (deg: number): void => {
    const own = sizes.current
    if (own) box.current?.style.setProperty('--flip-h', `${own.front + (own.back - own.front) * ((1 - Math.cos((deg * Math.PI) / 180)) / 2)}px`)
  }
  useEffect(() => turn.on('change', sizeAt), [turn])
  // A turn begins: both sides laid out at their own heights, read once, then each held to the card's.
  const begin = (): void => {
    const el = box.current
    if (flat || !el || sizes.current) return
    el.dataset.turning = ''
    const [front, back] = [...el.querySelectorAll<HTMLElement>(':scope > * > [data-flip-side]')].map((side) => side.offsetHeight)
    sizes.current = { front, back }
    sizeAt(turn.get())
    el.dataset.sized = ''
  }
  // Landed: the side turned down leaves the layout, and the card is its side's own size again.
  const land = (): void => {
    const el = box.current
    sizes.current = null
    if (!el) return
    delete el.dataset.turning
    delete el.dataset.sized
    el.style.removeProperty('--flip-h')
  }
  const settle = (to: number, velocity = 0, keyed = false): void => {
    aim.current = to
    spin.current?.stop()
    begin()
    // Turned by Space, every card of a sitting, it turns over quickly and flat; by the hand it carries its swing.
    const going = animate(turn, to, flat ? { duration: 0 } : keyed ? spring.moderate : { type: 'spring', visualDuration: 0.34, bounce: 0.15, velocity })
    spin.current = going
    void going.then(() => { if (spin.current === going && !grip.current?.moved) land() })
  }
  // Turned from outside (Space, the button): on over the way it was going. Before the page is drawn, so the side
  // that was up is never hidden for a frame before the turn has laid both out.
  useLayoutEffect(() => {
    if (backOf(aim.current) !== over) settle(aim.current + 180, 0, byKeys())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over])
  // What a press on the card leaves alone: the question being edited, a link,
  // a button, words being picked out to copy.
  const own = (target: EventTarget): boolean => !!(target as HTMLElement).closest('a, button, input, textarea, [contenteditable="true"]')
  const face = (shown: boolean): React.HTMLAttributes<HTMLDivElement> & { 'data-flip-side': string } => ({
    'aria-hidden': !shown,
    inert: !shown,
    'data-flip-side': '',
    className: `[grid-area:1/1] self-start ${flat ? 'transition-opacity duration-150 starting:opacity-0' : '[backface-visibility:hidden]'} ${flat && !shown ? 'opacity-0' : ''}`
  })
  return (
    <div
      ref={box}
      data-flip
      className="grid cursor-pointer grid-cols-[minmax(0,1fr)] [perspective:1400px]"
      onPointerDown={(event) => {
        if (event.button !== 0 || own(event.target)) return
        grip.current = { x: event.clientX, y: event.clientY, base: aim.current, moved: false, down: false, width: event.currentTarget.offsetWidth, trail: [] }
        // A quick flick can be off the card before its first move is seen (a press near its edge):
        // once the pointer has gone 6px and left it, the card takes it back, so the rest of the move is the card's.
        const card = event.currentTarget
        const keep = (moving: PointerEvent): void => {
          const held = grip.current
          if (!held || held.moved) return stop()
          if (Math.hypot(moving.clientX - held.x, moving.clientY - held.y) < 6 || card.contains(moving.target as Node)) return
          card.setPointerCapture(moving.pointerId)
          stop()
        }
        const stop = (): void => (removeEventListener('pointermove', keep, true), removeEventListener('pointerup', stop, true))
        addEventListener('pointermove', keep, true)
        addEventListener('pointerup', stop, true)
      }}
      onPointerMove={(event) => {
        const held = grip.current
        if (!held || flat) return
        const dx = event.clientX - held.x
        const dy = event.clientY - held.y
        if (!held.moved) {
          if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
          // Mostly down, with somewhere to put it off: the card goes with the hand down, it does not turn.
          if (onLater && dy > 0 && dy > Math.abs(dx)) {
            held.moved = true
            held.down = true
            event.currentTarget.setPointerCapture(event.pointerId)
            getSelection()?.removeAllRanges()
          } else if (Math.abs(dx) < 6) return
        }
        if (held.down) {
          // Followed one to one going down; pulled up, it barely gives.
          drop.set(dy > 0 ? dy : dy * 0.15)
          held.trail = [...held.trail.filter((one) => event.timeStamp - one.t < 90), { t: event.timeStamp, deg: dy }]
          return
        }
        if (!held.moved) {
          // A drag, not a selection: the card has the pointer from here.
          held.moved = true
          // Caught mid-turn, it carries on from where your finger found it.
          spin.current?.stop()
          begin()
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
        if (held.down) {
          // Far enough, or let go moving down quickly: put off. Otherwise it springs back up.
          if (drop.get() > 90 || velocity > 500) return onLater?.()
          animate(drop, 0, { type: 'spring', visualDuration: 0.25, bounce: 0.1, velocity })
          return
        }
        const here = turn.get()
        // A flick goes over even when let go short of half way.
        const to = Math.min(snap(here) + 180, Math.max(snap(here) - 180, snap(here + velocity * 0.16)))
        settle(to, velocity)
        if (backOf(to) !== over) onTurn(backOf(to))
      }}
      onPointerCancel={() => {
        if (grip.current?.down) animate(drop, 0, { duration: 0.15 })
        else if (grip.current?.moved) settle(snap(grip.current.base))
        grip.current = null
      }}
    >
      <motion.div className="grid min-w-0 grid-cols-[minmax(0,1fr)] [transform-style:preserve-3d] [grid-area:1/1]" style={flat ? undefined : { rotateY: turn, y: drop }}>
        <div {...face(!over)}>{front}</div>
        <div {...face(over)} style={flat ? undefined : { transform: 'rotateY(180deg)' }}>{back}</div>
      </motion.div>
    </div>
  )
}

/**
 * A card made from a picture: no turning over. The covers asked glow softly
 * and lift off to answer, the label they hid said under the picture, its room
 * kept from the start so nothing moves. Once shown, "Show the whole picture"
 * lifts every other cover too, to look it all over.
 */
/** A deck's setting for a card, by the card's tags: its own deck's, or the nearest deck above it. */
function byDeck<T>(text: string, byTag: Record<string, T>): T | null {
  const tags = tagsIn(text)
  for (const tag of tags) if (byTag[tag] !== undefined) return byTag[tag]
  for (const tag of tags) for (const [parent, value] of Object.entries(byTag)) if (tag.startsWith(`${parent}-`)) return value
  return null
}

/**
 * A card's timer, set on its deck: the seconds left beside "Show the answer"
 * and a thin bar running down. At the end the answer shows by itself. Held
 * while the question is being edited.
 */
function CardTimer({ seconds, paused, onEnd }: { seconds: number; paused: boolean; onEnd: () => void }): React.JSX.Element {
  const [left, setLeft] = useState(seconds)
  const end = useRef(onEnd)
  end.current = onEnd
  useEffect(() => {
    if (paused) return
    const tick = window.setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000)
    return () => window.clearInterval(tick)
  }, [paused])
  useEffect(() => void (left === 0 && end.current()), [left])
  const low = left <= Math.min(5, Math.ceil(seconds / 4))
  return (
    <span data-card-timer={left} role="timer" aria-label="Time left on this card" className="flex items-center gap-2 text-control tabular-nums">
      <span className="relative h-1 w-20 overflow-hidden rounded-[2px] bg-foreground/10" aria-hidden>
        {/* Shrinks by transform, a second at a time, linear as a clock runs; held still with motion off. */}
        <span className={`absolute inset-0 origin-left rounded-[2px] transition-transform duration-1000 ease-linear motion-reduce:transition-none ${low ? 'bg-[var(--tt-color-text-orange)]' : 'bg-foreground/40'}`} style={{ transform: `scaleX(${left / seconds})` }} />
      </span>
      <span className={`w-10 ${low ? 'text-[var(--tt-color-text-orange)]' : 'text-muted-foreground'}`}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
    </span>
  )
}

function PictureFace({ occlusion, shown, answer, onReveal }: { occlusion: Occlusion; shown: boolean; answer: string; onReveal: () => void }): React.JSX.Element {
  const [all, setAll] = useState(false)
  // The label first: the deck's tag and the book's link under it are for the card's page, not for here.
  const said = answer.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && !line.startsWith('[')).join(', ')
  return (
    <div data-finish-face data-picture-face={shown ? 'shown' : 'asked'} onClick={() => !shown && onReveal()} className={`grid gap-3 rounded-[6px] border px-5 py-5 ${shown ? '' : 'cursor-pointer'}`}>
      {/* The picture's own question when it was given one (Anki's Header), on both sides; else the plain one. */}
      <p data-picture-question-shown className={occlusion.question ? 'text-body font-medium text-foreground' : 'text-sm text-muted-foreground'}>{occlusion.question || (occlusion.hide === 'all' ? 'What is under the glowing cover?' : 'What is hidden?')}</p>
      <CoveredPicture occlusion={occlusion} shown={shown} all={all} />
      <div className="flex min-h-8 flex-wrap items-center gap-3">
        <p data-picture-answer className={`min-w-0 flex-1 text-heading font-semibold text-foreground ${shown ? '' : 'invisible'}`}>{said || 'Shown on the picture, under the cover'}</p>
        {occlusion.covers.some((one) => one.group !== occlusion.ask) && (
          <Button variant="ghost" size="sm" data-picture-all className={`h-8 cursor-pointer px-3 text-muted-foreground ${shown ? '' : 'invisible'}`} onClick={(event) => (event.stopPropagation(), chime(all ? 'fold' : 'open'), setAll(!all))}>
            {all ? 'Cover the rest again' : 'Show the whole picture'}
          </Button>
        )}
      </div>
    </div>
  )
}

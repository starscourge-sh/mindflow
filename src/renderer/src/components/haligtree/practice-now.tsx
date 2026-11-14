import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { chime } from '@/lib/sound'
import { haligtree, useLive } from '@/lib/haligtree'
import { useMinute } from '@/lib/clock'
import { OFFER_LENGTH, answerOffer, offerLead, offerSaid, practices, startPractice, type Offer } from '@/lib/practices'
import { refuse, toast, whyFailed } from './ui'
import { LengthMark } from './length-mark'

/**
 * The words of the window's notice asking about an offer now, if one is up: Home's card asking takes it away, so the
 * two are never up together. A card already up is told as a notice is raised, and looks again once the notice is
 * drawn: taking it away in the same breath it was raised in found nothing drawn yet to take (seen in the dev build).
 */
let noticed = ''
const cards = new Set<() => void>()
const notice = (words: string): void => {
  noticed = words
  cards.forEach((tell) => tell())
}

const WORD = 'flex h-7 shrink-0 cursor-pointer items-center rounded-md px-2 text-control font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground'

/**
 * A practice offered, on Home's “Now” card: where it is asked while this window is in front, and where it waits once
 * the corner's card has let it go, until its time is past. The corner card's three answers, in its words; an answer
 * is said by the window's notice, with Undo. Its name is the line; how long it starts with is a mark of its own.
 */
export function PracticeNow(): React.JSX.Element | null {
  const offer = useLive(practices.offer, null as Offer | null, [], ['item'])
  const now = useMinute()
  // While the corner's card is asking (another app is in front), this one waits: one surface, never both.
  const [inCorner, setInCorner] = useState<string | null>(null)
  useEffect(() => {
    void window.api.practiceCorner?.().then(setInCorner)
    return window.api.onPracticeCorner?.(setInCorner)
  }, [])
  const asking = !!offer && inCorner !== offer.id
  // This card asking: the window's notice for the same offer (raised from another page a moment ago) goes. Looked at
  // after each time this card is drawn, and it is drawn again when a notice is raised: the notice is drawn by then.
  const [, drawAgain] = useState(0)
  useEffect(() => {
    const tell = (): void => drawAgain((n) => n + 1)
    cards.add(tell)
    return () => void cards.delete(tell)
  }, [])
  useEffect(() => {
    if (!asking || !noticed) return
    window.dispatchEvent(new CustomEvent('haligtree:untoast', { detail: { text: noticed } }))
    noticed = ''
  })
  if (!offer || !asking) return null
  const refused = (error: unknown): void => refuse(`Not saved: ${whyFailed(error)}.`, 'error')
  const answer = (how: 'skip' | 'later'): void => void answerOffer(offer, how).then((said) => toast(said.words, () => void said.undo()), refused)
  return (
    <section data-practice-now={offer.id} aria-label={offerSaid(offer, now)} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-background px-4 py-3">
      <p className="min-w-0 flex-1 basis-60 text-body text-muted-foreground">
        <strong data-practice-lead className="font-semibold text-foreground">{offerLead(offer, now)}.</strong>{' '}
        <span data-practice-name className="text-foreground">{offer.name}</span>{' '}
        <LengthMark data-practice-length>{OFFER_LENGTH}</LengthMark>
      </p>
      <span className="flex shrink-0 items-center gap-1">
        <Button size="sm" data-practice-start onClick={() => void startPractice(offer.id).catch(refused)}>Start</Button>
        <button type="button" data-practice-skip onClick={() => answer('skip')} className={WORD}>Not tonight</button>
        <button type="button" data-practice-later onClick={() => answer('later')} className={WORD}>In 30 min</button>
      </span>
    </section>
  )
}

/**
 * An offer made to this window (main says so: it is in front, or it is the sandbox's). With Home open in any pane
 * (`onHome`, from the window's own record of its pages, so it is right while Home is still loading) its “Now” card
 * asks. From any other page the window's own notice asks, with “Start” on it; its words open Home, where
 * “Not tonight” and “In 30 min” wait with it. One surface, never both.
 */
export function PracticeAsked({ onHome }: { onHome: boolean }): null {
  const home = useRef(onHome)
  home.current = onHome
  useEffect(() => window.api.onPracticeOffered?.(() => void practices.offer().then((offer) => {
    // Started or answered since, in another window: nothing to ask.
    if (!offer) return
    // A window that is not in front (the sandbox's, behind your work) asks without a sound.
    if (document.hasFocus()) chime('hint')
    if (home.current) return
    const words = offerSaid(offer)
    notice(words)
    toast(words, undefined, 'info', { label: 'Start', key: 'S', run: () => void startPractice(offer.id) }, { type: 'view', id: 'home' })
  })), [])
  // The sandbox's review reminder (the example person's): the window's notice says it, where a book of your own gets the corner's card.
  useEffect(() => window.api.onReviewOffered?.((text, again) => {
    toast(`${again ? 'Still time for their review' : 'Time for their review'}: ${text}`, undefined, 'info',
      { label: 'Review now', key: 'R', run: () => void haligtree.reviewSeen().then(() => window.api.openInHome('view', 'review', ':today')) })
  }), [])
  return null
}

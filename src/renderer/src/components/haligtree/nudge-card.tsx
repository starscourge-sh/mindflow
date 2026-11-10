import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AliveIcon } from '@/components/ui/alive-icon'
import AlarmClockPlusIcon from '@/components/ui/alarm-clock-plus-icon'
import BrainCircuitIcon from '@/components/ui/brain-circuit-icon'
import ClockIcon from '@/components/ui/clock-icon'
import XIcon from '@/components/ui/x-icon'
import EyeOffIcon from '@/components/ui/eye-off-icon'
import LockIcon from '@/components/ui/lock-icon'
// The theme's colours: this window has no editor, which is what usually brings them.
import '@/assets/styles/_variables.scss'
import { chime } from '@/lib/sound'
import { call, useAppearance, haligtree } from '@/lib/haligtree'
import { taskName } from '@/lib/tasks'
import { clock } from '@/lib/clock'
import { Tip } from './ui'
import { usePatience } from '@/lib/patience'
import type { Nudge } from '../../../../main/nudge'
import { sleptSaid } from '@/lib/slept'
import { still } from '@/lib/motion'
import { answerOffer, offerSaid, practices, startPractice, suggestSaid, timeSaid } from '@/lib/practices'
import CheckIcon from '@/components/ui/checked-icon'
import { START_MIN } from '../../../../main/practice-rules'
import { APP_NAME } from '../../../../main/name'
import { quoted } from '../../../../main/clip'

/** How long a card waits unanswered before it slides away (the task or review is still asked once more later). */
const LINGER = 2 * 60_000
const LINGER_AWAY = 10 * 60_000
/** A sticky hidden: long enough to change your mind, then out of the way. */
const LINGER_STICKY = 12_000
/** A site sent away: long enough to read it and choose “Allow 5 min”. */
const LINGER_BLOCKED = 10_000
const keyOf = (nudge: Nudge): string => (nudge.kind === 'review' ? 'review' : `${nudge.kind}:${nudge.id}`)

const PRIMARY = 'flex h-7 shrink-0 items-center rounded-full bg-[var(--tt-brand-color-400)] px-3 text-[12.5px] font-semibold mf-on-accent transition-[filter] hover:brightness-110'
/** Every card's sheet: the one float fill, opaque, with a ring and a lift small enough for the window's 10px margin. */
const SHEET = 'relative overflow-hidden rounded-[18px] border bg-[var(--mf-float)] shadow-[0_1px_2px_color-mix(in_oklab,var(--mf-shadow-ink)_14%,transparent),0_6px_18px_-4px_color-mix(in_oklab,var(--mf-shadow-ink)_18%,transparent)]'
/** How long an answer with Undo stays up before the card goes. */
const LINGER_SAID = 6_000
const WORD = 'flex h-7 shrink-0 items-center rounded-full px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'

/**
 * Haligtree's own nudge, in a window of its own at the top right: a task due now
 * (Done, In 10 min, Open), the daily review (Review now, In an hour), or a
 * session that ended while you were away (Go again, Keep going). A card is
 * answered with its buttons, and one left alone slides away after a while;
 * the task or review it was about is asked once more, then left be.
 */
export function NudgeCards(): React.JSX.Element {
  useAppearance()
  const [cards, setCards] = useState<Nudge[]>([])
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    return window.api.onNudge((one) => {
      const nudge = one as Nudge
      // The same task or review again replaces its card rather than stacking a second.
      setCards((all) => [nudge, ...all.filter((card) => keyOf(card) !== keyOf(nudge))].slice(0, 3))
      // A sticky just hidden made its own sound as it went: the card says so quietly.
      // A site sent away is a soft “not now”, never a bell.
      if (nudge.kind === 'blocked') chime('nope')
      else if (nudge.kind === 'practice') chime('hint')
      else if (nudge.kind !== 'sticky') chime(nudge.kind !== 'away' && nudge.again ? 'nudgeMore' : 'hint')
    })
  }, [])
  // The window is as tall as its cards; with none left (once they have slid away) it hides.
  useLayoutEffect(() => {
    if (!box.current || !cards.length) return
    const watch = new ResizeObserver(() => box.current && window.api.nudgeSize(box.current.offsetHeight + 24))
    watch.observe(box.current)
    return () => watch.disconnect()
  }, [cards.length])
  const drop = (nudge: Nudge): void => setCards((all) => all.filter((card) => keyOf(card) !== keyOf(nudge)))
  const calm = still()
  return (
    <div data-clear className="mf-floating h-screen overflow-hidden p-[10px] font-[system-ui,-apple-system,sans-serif] text-[13px] text-foreground">
      <div ref={box} data-clear className="flex flex-col gap-2">
        <AnimatePresence initial onExitComplete={() => setCards((all) => (all.length ? all : (window.api.nudgeSize(0), all)))}>
          {cards.map((nudge) => (
            <motion.div
              key={keyOf(nudge)}
              // By position only, so a card's words never stretch as the others come and go.
              layout={calm ? false : 'position'}
              data-nudge={nudge.kind}
              // From just beside where it lands (8px), never from far off.
              initial={calm ? { opacity: 0 } : { opacity: 0, x: 8, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={calm ? { opacity: 0, transition: { duration: 0.15 } } : { opacity: 0, x: 8, transition: { duration: 0.2 } }}
              transition={calm ? { duration: 0.18 } : { type: 'spring', stiffness: 380, damping: 30 }}
            >
              <Card nudge={nudge} onDone={() => drop(nudge)} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

function Card({ nudge, onDone }: { nudge: Nudge; onDone: () => void }): React.JSX.Element {
  // Left alone it slides away, but never from under the pointer, nor while its window is hidden.
  const wait = usePatience(nudge.kind === 'away' ? LINGER_AWAY : nudge.kind === 'sticky' ? LINGER_STICKY : nudge.kind === 'blocked' ? LINGER_BLOCKED : LINGER, onDone, true, nudge)
  const [failed, setFailed] = useState(false)
  // Answered with something that can be taken back (Done, Not tonight, In 30 min): the card says so, with Undo, then goes.
  const [said, setSaid] = useState<{ words: string; undo: () => Promise<unknown> } | null>(null)
  // Asked again (an Undo brings an offer back): the card asks, rather than still saying the answer.
  useEffect(() => setSaid(null), [nudge])
  // `checked`: the answer says whether it worked; when it did not, it is said, never cheered.
  const act = (run: () => Promise<unknown>, cue: Parameters<typeof chime>[0], checked = false): void => void run().then((worked) => {
    if (checked && !worked) return void (chime('nope'), setFailed(true))
    chime(cue)
    onDone()
  })
  if (said) return <Said said={said} onDone={onDone} />
  if (nudge.kind === 'blocked') return <Blocked nudge={nudge} wait={wait} act={act} />
  if (nudge.kind === 'practice') return <PracticeOffer nudge={nudge} wait={wait} onDone={onDone} onSaid={setSaid} />
  const lead = nudge.kind === 'sticky' ? 'Sticky hidden' : nudge.kind === 'task' ? (nudge.again ? 'Still due' : 'Due now') : nudge.kind === 'review' ? (nudge.again ? 'Still time to review' : 'Time to review') : nudge.timer ? (nudge.breakOf ? 'Your break ended' : 'Your timer ended') : 'Your session ended'
  const icon = nudge.kind === 'sticky' ? EyeOffIcon : nudge.kind === 'task' ? AlarmClockPlusIcon : nudge.kind === 'review' ? BrainCircuitIcon : ClockIcon
  const words = nudge.kind === 'sticky' ? `${quoted(taskName(nudge.title).text, 80)} is hidden. ⌃⌥⌘N shows your stickies again, this one too` : nudge.kind === 'task' ? taskName(nudge.title).text : nudge.kind === 'review' ? nudge.text : nudge.sleptAt ? sleptSaid({ ...nudge, kind: nudge.breakOf ? 'break' : null }).join(', ') : `At ${clock(nudge.endedAt)}, while you were away${nudge.timer ? '' : `: ${quoted(taskName(nudge.goal).text, 80)}`}`
  const seen = (): void => act(() => (nudge.kind === 'sticky' ? Promise.resolve() : nudge.kind === 'task' ? haligtree.alertSeen(nudge.id) : nudge.kind === 'review' ? haligtree.reviewSeen() : Promise.resolve()), 'fold')
  return (
    <div {...wait} className={`${SHEET} px-3.5 pt-3 pb-3`}>
      <Head icon={icon} lead={lead} words={words}>
        <Tip label={nudge.kind === 'review' ? 'Not today' : nudge.kind === 'sticky' ? 'Leave it hidden' : 'Got it: no more reminders about this one'}><button type="button" aria-label={nudge.kind === 'review' ? 'Not today' : 'Got it'} onClick={seen}
          className="-mt-0.5 -mr-1 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <AliveIcon icon={XIcon} size={14} />
        </button></Tip>
      </Head>
      {failed && <p role="status" className="mt-2 pl-[38px] text-[13px] leading-snug text-foreground">Another session is running now, so this one cannot start again.</p>}
      <div className="mt-2.5 flex items-center gap-1 pl-[38px]">
        {nudge.kind === 'task' && (
          <>
            <button type="button" data-nudge-done onClick={() => void haligtree.doneTask(nudge.id).then((was) => (chime('done'), setSaid({ words: `Done: ${taskName(nudge.title).text}`, undo: () => haligtree.undoneTask(nudge.id, was) })))} className={PRIMARY}>Done</button>
            <button type="button" data-nudge-later onClick={() => act(() => haligtree.alertLater(nudge.id, 10 * 60_000), 'fold')} className={WORD}>In 10 min</button>
            <button type="button" onClick={() => act(() => haligtree.alertSeen(nudge.id).then(() => window.api.openInHome('task', nudge.id)), 'open')} className={WORD}>Open</button>
          </>
        )}
        {nudge.kind === 'sticky' && (
          <button type="button" data-nudge-unhide onClick={() => act(async () => window.api.unhideSticky(nudge.id), 'back')} className={PRIMARY}>Bring it back</button>
        )}
        {nudge.kind === 'review' && (
          <>
            <button type="button" data-nudge-review onClick={() => act(() => haligtree.reviewSeen().then(() => window.api.openInHome('view', 'review', ':today')), 'open')} className={PRIMARY}>Review now</button>
            <button type="button" data-nudge-later onClick={() => act(() => haligtree.reviewLater(3600_000), 'fold')} className={WORD}>In an hour</button>
          </>
        )}
        {nudge.kind === 'away' && (
          <>
            {(!nudge.timer || nudge.breakOf) && <button type="button" data-nudge-again onClick={() => act(() => haligtree.againSession().then((id) => (id && window.api.showFocus(true), !!id)), 'anew', true)} className={PRIMARY}>Go again</button>}
            {!nudge.timer && nudge.idle && <button type="button" onClick={() => act(() => haligtree.unawaySession(nudge.id).then((back) => (back && window.api.showFocus(true), back)), 'back', true)} className={WORD}>Keep going</button>}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * A website sent away during a focus round, said under the pill: which, and
 * until when, with “Allow 5 min” to let it through for a while this round.
 * Allowed, the card says until when, then goes.
 */
function Blocked({ nudge, wait, act }: { nudge: Extract<Nudge, { kind: 'blocked' }>; wait: ReturnType<typeof usePatience>; act: (run: () => Promise<unknown>, cue: Parameters<typeof chime>[0]) => void }): React.JSX.Element {
  const [allowed, setAllowed] = useState<string | null>(null)
  // Its tab could not be put back (the browser was closed): said, and left up longer to read.
  const [missed, setMissed] = useState(false)
  const allow = (): void => void call<{ until: string; missed: boolean } | null>('site-block:allow', nudge.site).then((said) => {
    if (!said) return chime('nope')
    chime('back')
    setAllowed(said.until)
    setMissed(said.missed)
    setTimeout(() => act(() => Promise.resolve(), 'fold'), said.missed ? 6000 : 2400)
  })
  const words = allowed ? `${quoted(nudge.site, 80)} is allowed until ${clock(allowed)}, then blocked again` : `${quoted(nudge.site, 80)} is blocked until ${nudge.until ? clock(nudge.until) : 'this session ends'}`
  return (
    <div {...wait} className={`${SHEET} px-3.5 pt-3 pb-3`}>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--tt-brand-color-400)_16%,var(--mf-float))] text-[var(--tt-brand-color-400)]">
          <AliveIcon icon={LockIcon} size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-semibold text-[var(--tt-brand-color-400)]">{allowed ? `Let through for ${nudge.allowMinutes} minutes` : 'Website blocked'}</span>
          <span data-nudge-words className="line-clamp-2 text-[14.5px] leading-[19px] font-semibold">{words}</span>
        </span>
        <Tip label="Got it"><button type="button" aria-label="Got it" onClick={() => act(() => Promise.resolve(), 'fold')}
          className="-mt-0.5 -mr-1 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <AliveIcon icon={XIcon} size={14} />
        </button></Tip>
      </div>
      {missed && <p data-nudge-missed className="mt-2 pl-[38px] text-[13.5px] leading-[18px] font-semibold">{APP_NAME} could not open the page again. Open it in your browser.</p>}
      {!allowed && (
        <div className="mt-2.5 flex items-center gap-1 pl-[38px]">
          <button type="button" data-nudge-allow onClick={allow} className={WORD}>Allow {nudge.allowMinutes} min</button>
        </div>
      )}
    </div>
  )
}

/** The head every card shares: its icon in a soft disc, what it is, and what it is about. */
function Head({ icon, lead, words, children }: { icon: Parameters<typeof AliveIcon>[0]['icon']; lead: string; words: string; children?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--tt-brand-color-400)_16%,var(--mf-float))] text-[var(--tt-brand-color-400)]">
        <AliveIcon icon={icon} size={15} play />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold text-[var(--tt-brand-color-400)]">{lead}</span>
        <span data-nudge-words className="line-clamp-2 text-[14.5px] leading-[19px] font-semibold">{words}</span>
      </span>
      {children}
    </div>
  )
}

/**
 * A practice offered at its time: the one place it is asked, here with the
 * other asks. Start opens the bubble and what it loads; Not tonight and In 30
 * min say so with Undo. The card never takes the keys (this window never
 * takes them from what you are typing in), so it shows no keys to press.
 */
function PracticeOffer({ nudge, wait, onDone, onSaid }: { nudge: Extract<Nudge, { kind: 'practice' }>; wait: ReturnType<typeof usePatience>; onDone: () => void; onSaid: (said: { words: string; undo: () => Promise<unknown> }) => void }): React.JSX.Element {
  const offer = nudge.offer
  const answer = (how: 'skip' | 'later'): void => void answerOffer(offer, how).then(onSaid)
  const move = (to: string | null): void => void practices.move(offer.id, to).then(() => chime(to ? 'move' : 'tap'))
  return (
    <div {...wait} data-nudge-practice data-practice-offer={offer.id} role="group" aria-label={offerSaid(offer)} className={`${SHEET} px-3.5 pt-3 pb-3`}>
      <Head icon={ClockIcon} lead={offer.later ? 'Practice, asked again' : `Practice at ${timeSaid(offer.at)}`} words={`${offer.name}, ${START_MIN} minutes?`} />
      <div className="mt-2.5 flex flex-wrap items-center gap-1 pl-[38px]">
        <button type="button" data-practice-start onClick={() => void startPractice(offer.id).then(onDone)} className={PRIMARY}>Start</button>
        <button type="button" data-practice-skip onClick={() => answer('skip')} className={WORD}>Not tonight</button>
        <button type="button" data-practice-later onClick={() => answer('later')} className={WORD}>In 30 min</button>
      </div>
      {offer.suggest && (
        <div data-practice-suggest className="mt-2.5 ml-[38px] border-t pt-2">
          <p className="text-[13px] leading-[18px] text-foreground">{suggestSaid(offer.suggest)} Move it?</p>
          <div className="mt-1.5 flex gap-1">
            <button type="button" data-practice-move onClick={() => move(offer.suggest!.to)} className={PRIMARY}>Move to {timeSaid(offer.suggest.to)}</button>
            <button type="button" data-practice-keep-time onClick={() => move(null)} className={WORD}>Keep {timeSaid(offer.suggest.from)}</button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The newest answer that can be taken back, for ⌘Z in the main window (told
 * there, since this window never takes the keys): kept after its card goes,
 * for as long as the main window holds it, and taken back once.
 */
let lastSaid: { undo: () => Promise<unknown>; onDone?: () => void } | null = null
const takeBack = (): Promise<unknown> | undefined => {
  const was = lastSaid
  lastSaid = null
  if (!was) return
  // Its Undo button is spent too: the main window forgets it.
  window.api.nudgeUndoable('')
  return was.undo().then(() => was.onDone?.())
}
window.api.onNudgeUndo(() => void takeBack())

/** An answer that can be taken back: what was done, and Undo, for a few seconds. */
function Said({ said, onDone }: { said: { words: string; undo: () => Promise<unknown> }; onDone: () => void }): React.JSX.Element {
  const wait = usePatience(LINGER_SAID, onDone, true, said)
  useEffect(() => {
    const mine: NonNullable<typeof lastSaid> = { undo: said.undo, onDone }
    lastSaid = mine
    window.api.nudgeUndoable(said.words)
    // Gone from view, its ⌘Z stays (the main window lets it go after a while); only the card it closed is let go.
    return () => void (lastSaid === mine && (mine.onDone = undefined))
  }, [said])
  return (
    <div {...wait} data-nudge-said role="status" className={`${SHEET} flex items-center gap-2.5 py-2.5 pr-2 pl-3.5`}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--tt-brand-color-400)_16%,var(--mf-float))] text-[var(--tt-brand-color-400)]">
        <AliveIcon icon={CheckIcon} size={15} play />
      </span>
      <span data-nudge-words className="min-w-0 flex-1 line-clamp-2 text-[13.5px] leading-[18px] font-semibold">{said.words}</span>
      <button type="button" data-nudge-undo onClick={() => (chime('undo'), void takeBack())} className={WORD}>Undo</button>
    </div>
  )
}

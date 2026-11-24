import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AliveIcon } from '@/components/ui/alive-icon'
import AlarmClockPlusIcon from '@/components/ui/alarm-clock-plus-icon'
import BrainCircuitIcon from '@/components/ui/brain-circuit-icon'
import ClockIcon from '@/components/ui/clock-icon'
import XIcon from '@/components/ui/x-icon'
import EyeOffIcon from '@/components/ui/eye-off-icon'
import LockIcon from '@/components/ui/lock-icon'
import TriangleAlertIcon from '@/components/ui/triangle-alert-icon'
// The theme's colours: this window has no editor, which is what usually brings them.
import '@/assets/styles/_variables.scss'
import { chime } from '@/lib/sound'
import { call, useAppearance, haligtree } from '@/lib/haligtree'
import { taskName } from '@/lib/tasks'
import { clock, useMinute } from '@/lib/clock'
import { Tip, whyFailed } from './ui'
import { LengthMark } from './length-mark'
import { usePatience } from '@/lib/patience'
import type { Nudge } from '../../../../main/nudge'
import { sleptSaid } from '@/lib/slept'
import { still } from '@/lib/motion'
import { offerUndo, takeBack } from '@/lib/float-undo'
import { OFFER_LENGTH, answerOffer, offerLead, offerSaid, practices, startPractice, suggestSaid, timeSaid } from '@/lib/practices'
import CheckIcon from '@/components/ui/checked-icon'
import { APP_NAME } from '../../../../main/name'
import { quoted } from '../../../../main/clip'

/** How long a card waits unanswered before it slides away (the task or review is still asked once more later). */
const LINGER = 2 * 60_000
const LINGER_AWAY = 10 * 60_000
/** A sticky hidden: long enough to change your mind, then out of the way. */
const LINGER_STICKY = 12_000
/** A site sent away: long enough to read it and choose “Allow 5 min”. */
const LINGER_BLOCKED = 10_000
/** A save that failed: long enough to read what to do about it. */
const LINGER_FAILED = 12_000
const keyOf = (nudge: Nudge): string => (nudge.kind === 'review' ? 'review' : `${nudge.kind}:${nudge.id}`)

// The app's own buttons, never a coloured pill of their own (the user, 24 Nov: a blue pill and blue words read as
// another app's notification): the main answer filled in the theme's ink, the others quiet words, each with the hand.
const PRIMARY = 'flex h-7 shrink-0 cursor-pointer items-center rounded-md bg-primary px-3 text-control font-medium text-primary-foreground transition-colors hover:bg-primary/85 active:scale-[0.97]'
/** Every card's sheet: the one float fill, opaque, with a ring and a lift small enough for the window's 10px margin. */
const SHEET = 'relative overflow-hidden rounded-[14px] border bg-[var(--mf-float)] shadow-[0_1px_2px_color-mix(in_oklab,var(--mf-shadow-ink)_14%,transparent),0_6px_18px_-4px_color-mix(in_oklab,var(--mf-shadow-ink)_18%,transparent)]'
/** How long an answer with Undo stays up before the card goes. */
const LINGER_SAID = 6_000
const WORD = 'flex h-7 shrink-0 cursor-pointer items-center rounded-md px-2.5 text-control font-medium text-(--mf-muted-strong) transition-colors hover:bg-accent hover:text-foreground active:scale-[0.97]'

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
      else if (nudge.kind !== 'sticky' && nudge.kind !== 'failed') chime(nudge.kind !== 'away' && nudge.again ? 'nudgeMore' : 'hint')
    })
  }, [])
  // The window is as tall as its cards; with none left (once they have slid away) it hides.
  useLayoutEffect(() => {
    if (!box.current || !cards.length) return
    const watch = new ResizeObserver(() => box.current && window.api.nudgeSize(box.current.offsetHeight + 24))
    watch.observe(box.current)
    return () => watch.disconnect()
  }, [cards.length])
  const drop = (nudge: Nudge): void => {
    setCards((all) => all.filter((card) => keyOf(card) !== keyOf(nudge)))
    // A practice's card gone from the corner: Home's “Now” card has the offer from here, if it is still open.
    if (nudge.kind === 'practice') window.api.practiceCardGone?.(nudge.id)
  }
  const calm = still()
  return (
    <div data-clear className="mf-floating h-screen overflow-hidden p-[10px] font-sans text-[13px] text-foreground">
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
  const wait = usePatience(nudge.kind === 'away' ? LINGER_AWAY : nudge.kind === 'sticky' ? LINGER_STICKY : nudge.kind === 'blocked' ? LINGER_BLOCKED : nudge.kind === 'failed' ? LINGER_FAILED : LINGER, onDone, true, nudge)
  // What went wrong, said on the card: another session running, or a save that failed.
  const [failed, setFailed] = useState<string | null>(null)
  // Answered with something that can be taken back (Done, Not tonight, In 30 min): the card says so, with Undo, then goes.
  const [said, setSaid] = useState<{ words: string; undo: () => Promise<unknown> } | null>(null)
  const [due, setDue] = useState<string | null>(null)
  useEffect(() => void (nudge.kind === 'task' && haligtree.task(nudge.id).then((task) => setDue(task?.dueAt && !task.allDay ? task.dueAt : null), () => undefined)), [nudge])
  // Asked again (an Undo brings an offer back): the card asks, rather than still saying the answer.
  useEffect(() => setSaid(null), [nudge])
  // `checked`: the answer says whether it worked; when it did not, it is said, never cheered.
  const act = (run: () => Promise<unknown>, cue: Parameters<typeof chime>[0], checked = false): void => void run().then((worked) => {
    if (checked && !worked) return void (chime('nope'), setFailed('Another session is running now, so this one cannot start again.'))
    chime(cue)
    onDone()
  }, refused)
  // A save that failed keeps the card up, saying why, so it can be tried again.
  const refused = (error: unknown): void => (chime('nope'), setFailed(`Not saved: ${whyFailed(error)}.`))
  if (said) return <Said said={said} onDone={onDone} />
  if (nudge.kind === 'blocked') return <Blocked nudge={nudge} wait={wait} act={act} />
  if (nudge.kind === 'practice') return <PracticeOffer nudge={nudge} wait={wait} onDone={onDone} onSaid={setSaid} />
  if (nudge.kind === 'failed') return (
    <div {...wait} data-nudge-failed-save role="alert" className={`${SHEET} px-3.5 pt-3 pb-3`}>
      <Head icon={TriangleAlertIcon} lead="Not saved" words={nudge.text}>
        <Tip label="Got it"><button type="button" aria-label="Got it" onClick={() => act(() => Promise.resolve(), 'fold')}
          className="-mt-0.5 -mr-1 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <AliveIcon icon={XIcon} size={14} />
        </button></Tip>
      </Head>
    </div>
  )
  // When it was due, said: "Still due" alone left you guessing since when.
  const lead = nudge.kind === 'sticky' ? 'Sticky hidden' : nudge.kind === 'task' ? (due ? (nudge.again ? `Still due · it was ${clock(due)}` : `Due now · ${clock(due)}`) : nudge.again ? 'Still due' : 'Due now') : nudge.kind === 'review' ? (nudge.again ? 'Still time to review' : 'Time to review') : nudge.timer ? (nudge.breakOf ? 'Your break ended' : 'Your timer ended') : 'Your session ended'
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
      {failed && <p role="status" data-nudge-failed className="mt-2 pl-[38px] text-[13px] leading-snug text-foreground">{failed}</p>}
      <div className="mt-2.5 flex items-center gap-1 pl-[38px]">
        {nudge.kind === 'task' && (
          <>
            <button type="button" data-nudge-done onClick={() => void haligtree.doneTask(nudge.id).then((was) => (chime('done'), setSaid({ words: `Done: ${taskName(nudge.title).text}`, undo: () => haligtree.undoneTask(nudge.id, was) })), refused)} className={PRIMARY}>Done</button>
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
  const allow = (): void => void call<{ until: string; missed: boolean } | null>('site-block:allow', nudge.site).catch(() => null).then((said) => {
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
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-(--mf-muted-strong)">
          <AliveIcon icon={LockIcon} size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-control text-(--mf-muted-strong)">{allowed ? `Let through for ${nudge.allowMinutes} minutes` : 'Website blocked'}</span>
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

/** The head every card shares: its icon in a soft disc, what it is, and what it is about. `mark`: a quiet fact of its own at the end of the first line (a practice's “5 min”). */
function Head({ icon, lead, words, mark, children }: { icon: Parameters<typeof AliveIcon>[0]['icon']; lead: string; words: string; mark?: string; children?: React.ReactNode }): React.JSX.Element {
  // As a Mac notification reads: what it is about first, in the ink; why it is here under it, quiet; the icon in the
  // theme's ink on a plain disc, never a coloured badge (the user, 24 Nov).
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-(--mf-muted-strong)">
        <AliveIcon icon={icon} size={15} play />
      </span>
      <span className="min-w-0 flex-1">
        <span data-nudge-words className="line-clamp-2 text-[14.5px] leading-[19px] font-semibold">{words}</span>
        {mark ? (
          <span className="mt-0.5 flex items-center gap-2">
            <span data-nudge-lead className="min-w-0 flex-1 text-control text-(--mf-muted-strong)">{lead}</span>
            <LengthMark data-nudge-mark>{mark}</LengthMark>
          </span>
        ) : <span data-nudge-lead className="mt-0.5 block text-control text-(--mf-muted-strong)">{lead}</span>}
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
  // Its first line tells the time truthfully for as long as it is up: how late it is asked, once past the hour.
  const now = useMinute()
  const [failed, setFailed] = useState<string | null>(null)
  const refused = (error: unknown): void => (chime('nope'), (answering.current = false), setFailed(`Not saved: ${whyFailed(error)}.`))
  // Started or answered in another window, or asked inside the main window now that it is in front: this card goes,
  // with nothing more said. Never while its own answer is on the way: that one stays to say so, with Undo.
  const answering = useRef(false)
  useEffect(() => window.api.onNudgeDrop?.((id) => void (id === offer.id && !answering.current && onDone())), [offer.id])
  const answer = (how: 'skip' | 'later'): void => ((answering.current = true), void answerOffer(offer, how).then(onSaid, refused))
  const move = (to: string | null): void => void practices.move(offer.id, to).then(() => chime(to ? 'move' : 'tap'), refused)
  return (
    <div {...wait} data-nudge-practice data-practice-offer={offer.id} role="group" aria-label={offerSaid(offer, now)} className={`${SHEET} px-3.5 pt-3 pb-3`}>
      <Head icon={ClockIcon} lead={offerLead(offer, now)} mark={OFFER_LENGTH} words={offer.name} />
      <div className="mt-2.5 flex flex-wrap items-center gap-1 pl-[38px]">
        <button type="button" data-practice-start onClick={() => void startPractice(offer.id).then(onDone, refused)} className={PRIMARY}>Start</button>
        <button type="button" data-practice-skip onClick={() => answer('skip')} className={WORD}>Not tonight</button>
        <button type="button" data-practice-later onClick={() => answer('later')} className={WORD}>In 30 min</button>
      </div>
      {failed && <p role="status" data-nudge-failed className="mt-2 pl-[38px] text-[13px] leading-snug text-foreground">{failed}</p>}
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

/** An answer that can be taken back: what was done, and Undo, for a few seconds. */
function Said({ said, onDone }: { said: { words: string; undo: () => Promise<unknown> }; onDone: () => void }): React.JSX.Element {
  const wait = usePatience(LINGER_SAID, onDone, true, said)
  // ⌘Z in the main window takes it back too (this window never takes the keys from what you are typing in).
  useEffect(() => offerUndo(said.words, said.undo, onDone), [said])
  return (
    <div {...wait} data-nudge-said role="status" className={`${SHEET} flex items-center gap-2.5 py-2.5 pr-2 pl-3.5`}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-(--mf-muted-strong)">
        <AliveIcon icon={CheckIcon} size={15} play />
      </span>
      <span data-nudge-words className="min-w-0 flex-1 line-clamp-2 text-[13.5px] leading-[18px] font-semibold">{said.words}</span>
      <button type="button" data-nudge-undo onClick={() => (chime('undo'), void takeBack())} className={WORD}>Undo</button>
    </div>
  )
}

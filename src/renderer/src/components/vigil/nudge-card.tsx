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
import { setOnAccent } from '@/lib/on-accent'
import { call, useAppearance, vigil } from '@/lib/vigil'
import { taskName } from '@/lib/tasks'
import { clockTime } from './session-timeline'
import { usePatience } from '@/lib/patience'
import type { Nudge } from '../../../../main/nudge'
import { sleptDid } from '@/lib/slept'
import { still } from '@/lib/motion'

/** How long a card waits unanswered before it slides away (the task or review is still asked once more later). */
const LINGER = 2 * 60_000
const LINGER_AWAY = 10 * 60_000
/** A sticky hidden: long enough to change your mind, then out of the way. */
const LINGER_STICKY = 12_000
/** A site sent away: long enough to read it and choose “Allow 5 min”. */
const LINGER_BLOCKED = 10_000
const keyOf = (nudge: Nudge): string => (nudge.kind === 'review' ? 'review' : `${nudge.kind}:${nudge.id}`)

const PRIMARY = 'flex h-7 shrink-0 items-center rounded-full bg-[var(--tt-brand-color-400)] px-3 text-[12.5px] font-semibold text-[var(--pill-on-accent,white)] transition-[filter] hover:brightness-110'
const WORD = 'flex h-7 shrink-0 items-center rounded-full px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'

/**
 * Vigil's own nudge, in a window of its own at the top right: a task due now
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
    <div className="mf-floating h-screen overflow-hidden p-[10px] font-[system-ui,-apple-system,sans-serif] text-[13px] text-foreground">
      <div ref={box} className="flex flex-col gap-2">
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
  // `checked`: the answer says whether it worked; when it did not, it is said, never cheered.
  const act = (run: () => Promise<unknown>, cue: Parameters<typeof chime>[0], checked = false): void => void run().then((worked) => {
    if (checked && !worked) return void (chime('nope'), setFailed(true))
    chime(cue)
    onDone()
  })
  if (nudge.kind === 'blocked') return <Blocked nudge={nudge} wait={wait} act={act} />
  const lead = nudge.kind === 'sticky' ? 'Sticky hidden' : nudge.kind === 'task' ? (nudge.again ? 'Still due' : 'Due now') : nudge.kind === 'review' ? (nudge.again ? 'Still time to review' : 'Time to review') : nudge.timer ? (nudge.breakOf ? 'Your break ended' : 'Your timer ended') : 'Your session ended'
  const icon = nudge.kind === 'sticky' ? EyeOffIcon : nudge.kind === 'task' ? AlarmClockPlusIcon : nudge.kind === 'review' ? BrainCircuitIcon : ClockIcon
  const words = nudge.kind === 'sticky' ? `“${taskName(nudge.title).text}” is hidden. ⌃⌥⌘N shows your stickies again, this one too` : nudge.kind === 'task' ? taskName(nudge.title).text : nudge.kind === 'review' ? nudge.text : nudge.sleptAt ? `The Mac slept at ${clockTime(nudge.sleptAt)}, ${sleptDid({ ...nudge, kind: nudge.breakOf ? 'break' : null })}` : `At ${clockTime(nudge.endedAt)}, while you were away${nudge.timer ? '' : `: “${taskName(nudge.goal).text}”`}`
  const seen = (): void => act(() => (nudge.kind === 'sticky' ? Promise.resolve() : nudge.kind === 'task' ? vigil.alertSeen(nudge.id) : nudge.kind === 'review' ? vigil.reviewSeen() : Promise.resolve()), 'fold')
  return (
    <div ref={setOnAccent} {...wait} className="relative overflow-hidden rounded-[18px] border bg-popover px-3.5 pt-3 pb-3 shadow-[0_1px_2px_rgb(0_0_0/0.14),0_6px_18px_-4px_rgb(0_0_0/0.18)]">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--tt-brand-color-400)_16%,var(--popover))] text-[var(--tt-brand-color-400)]">
          <AliveIcon icon={icon} size={15} play />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-semibold text-[var(--tt-brand-color-400)]">{lead}</span>
          <span data-nudge-words className="line-clamp-2 text-[14.5px] leading-[19px] font-semibold">{words}</span>
        </span>
        <button type="button" aria-label={nudge.kind === 'review' ? 'Not today' : 'Got it'} title={nudge.kind === 'review' ? 'Not today' : nudge.kind === 'sticky' ? 'Leave it hidden' : 'Got it: no more reminders about this one'} onClick={seen}
          className="-mt-0.5 -mr-1 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <AliveIcon icon={XIcon} size={14} />
        </button>
      </div>
      {failed && <p role="status" className="mt-2 pl-[38px] text-[13px] leading-snug text-foreground">Another session is running now, so this one cannot start again.</p>}
      <div className="mt-2.5 flex items-center gap-1 pl-[38px]">
        {nudge.kind === 'task' && (
          <>
            <button type="button" data-nudge-done onClick={() => act(() => vigil.doneTask(nudge.id), 'done')} className={PRIMARY}>Done</button>
            <button type="button" data-nudge-later onClick={() => act(() => vigil.alertLater(nudge.id, 10 * 60_000), 'fold')} className={WORD}>In 10 min</button>
            <button type="button" onClick={() => act(() => vigil.alertSeen(nudge.id).then(() => window.api.openInHome('task', nudge.id)), 'open')} className={WORD}>Open</button>
          </>
        )}
        {nudge.kind === 'sticky' && (
          <button type="button" data-nudge-unhide onClick={() => act(async () => window.api.unhideSticky(nudge.id), 'back')} className={PRIMARY}>Bring it back</button>
        )}
        {nudge.kind === 'review' && (
          <>
            <button type="button" data-nudge-review onClick={() => act(() => vigil.reviewSeen().then(() => window.api.openInHome('view', 'review')), 'open')} className={PRIMARY}>Review now</button>
            <button type="button" data-nudge-later onClick={() => act(() => vigil.reviewLater(3600_000), 'fold')} className={WORD}>In an hour</button>
          </>
        )}
        {nudge.kind === 'away' && (
          <>
            {(!nudge.timer || nudge.breakOf) && <button type="button" data-nudge-again onClick={() => act(() => vigil.againSession().then((id) => (id && window.api.showFocus(true), !!id)), 'anew', true)} className={PRIMARY}>Go again</button>}
            {!nudge.timer && nudge.idle && <button type="button" onClick={() => act(() => vigil.unawaySession(nudge.id).then((back) => (back && window.api.showFocus(true), back)), 'back', true)} className={WORD}>Keep going</button>}
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
  const allow = (): void => void call<boolean>('site-block:allow', nudge.site).then((ok) => {
    if (!ok) return chime('nope')
    chime('back')
    setAllowed(new Date(Date.now() + 5 * 60_000).toISOString())
    setTimeout(() => act(() => Promise.resolve(), 'fold'), 2400)
  })
  const words = allowed ? `“${nudge.site}” is allowed until ${clockTime(allowed)}, then blocked again` : `“${nudge.site}” is blocked until ${nudge.until ? clockTime(nudge.until) : 'this session ends'}`
  return (
    <div ref={setOnAccent} {...wait} className="relative overflow-hidden rounded-[18px] border bg-popover px-3.5 pt-3 pb-3 shadow-[0_1px_2px_rgb(0_0_0/0.14),0_6px_18px_-4px_rgb(0_0_0/0.18)]">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--tt-brand-color-400)_16%,var(--popover))] text-[var(--tt-brand-color-400)]">
          <AliveIcon icon={LockIcon} size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-semibold text-[var(--tt-brand-color-400)]">{allowed ? 'Let through for 5 minutes' : 'Website blocked'}</span>
          <span data-nudge-words className="line-clamp-2 text-[14.5px] leading-[19px] font-semibold">{words}</span>
        </span>
        <button type="button" aria-label="Got it" title="Got it" onClick={() => act(() => Promise.resolve(), 'fold')}
          className="-mt-0.5 -mr-1 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <AliveIcon icon={XIcon} size={14} />
        </button>
      </div>
      {!allowed && (
        <div className="mt-2.5 flex items-center gap-1 pl-[38px]">
          <button type="button" data-nudge-allow onClick={allow} className={WORD}>Allow 5 min</button>
        </div>
      )}
    </div>
  )
}

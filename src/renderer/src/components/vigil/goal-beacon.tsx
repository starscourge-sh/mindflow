import { useEffect, useState, type CSSProperties } from 'react'
import { Flag } from 'lucide-react'
import { motion } from 'motion/react'
import { AliveIcon } from '@/components/ui/alive-icon'
import ExternalLinkIcon from '@/components/ui/external-link-icon'
import XIcon from '@/components/ui/x-icon'

import { EASE, shift } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { useAppearance, useLive, vigil } from '@/lib/vigil'
import { DotMatrix } from './dot-matrix'
import { Journey, TempusBars, useToday, warmth } from './goals-view'
import { dayKey, dayMonth } from '../../../../main/dates'
import { daysLeft, percent, wayThrough } from '../../../../main/goal-days'
import { SandboxStamp } from '@/components/vigil/sandbox'
import { Frost } from './frost'

const DRAG = { WebkitAppRegion: 'drag' } as CSSProperties
const STILL = { WebkitAppRegion: 'no-drag' } as CSSProperties

/**
 * A goal's beacon: a small window of its own on every Space, made by the
 * sticky notes' machinery (see `beacons` in main). The days left are the
 * hero, in the focus timer's dot figures, warming as the day nears; under
 * them the road and Tempus's four bars. It comes back each time it is
 * shown, so it reads as arriving rather than as wallpaper.
 */
export function GoalBeacon({ id }: { id: string }): React.JSX.Element | null {
  useAppearance()
  const today = useToday()
  const goal = useLive(() => vigil.item(id), undefined as Awaited<ReturnType<typeof vigil.item>> | undefined, [id])
  // Shown again (tucked, then out at its moment): it arrives again.
  const [shown, setShown] = useState(0)
  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    const onShow = (): void => void (document.visibilityState === 'visible' && setShown((n) => n + 1))
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [])
  if (!goal?.goalAt) return null
  const from = goal.goalFrom ?? dayKey(goal.createdAt)
  const left = daysLeft(goal.goalAt, today)
  const still = document.documentElement.dataset.motion === 'off'
  return (
    <div className="h-screen p-4">
      <motion.div
        key={shown}
        initial={still ? false : { opacity: 0, transform: shift('translateY(8px) scale(0.98)') }}
        animate={{ opacity: 1, transform: shift('translateY(0px) scale(1)') }}
        transition={{ duration: 0.45, ease: EASE }}
        data-private={goal.private ? '' : undefined}
        onPointerEnter={() => window.api.holdBeacon(true)}
        onPointerLeave={() => window.api.holdBeacon(false)}
        // Solid, as a sticky is: lit from the top, never see-through; frosted over the desktop picture as a sticky is.
        style={{ ...DRAG, backgroundImage: 'linear-gradient(rgb(255 255 255 / 0.05), transparent 40%), linear-gradient(var(--popover), var(--popover)), linear-gradient(var(--background), var(--background))', backgroundColor: 'Canvas' }}
        className="group relative isolate flex h-full flex-col gap-2.5 rounded-xl border px-4 pt-3 pb-4 text-control text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.14),0_6px_16px_-4px_rgb(0_0_0/0.22)]"
      >
        <SandboxStamp />
        <Frost />
        <div className="flex items-center gap-1.5">
          <Flag className="size-3.5 shrink-0" style={{ color: warmth(Math.max(left, 0)) }} />
          <p className="private-text min-w-0 flex-1 truncate font-medium">{goal.title}</p>
          <span className="flex items-center opacity-0 transition-opacity duration-200 group-hover:opacity-100" style={STILL}>
            <button type="button" title="Open it" aria-label="Open it" onClick={() => (chime('open'), window.api.openInHome('goal', id))}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
              <AliveIcon icon={ExternalLinkIcon} size={14} />
            </button>
            <button type="button" title="Put it away for now" aria-label="Put it away for now" onClick={() => (chime('tuck'), window.api.tuckBeacon())}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
              <AliveIcon icon={XIcon} size={14} />
            </button>
          </span>
        </div>
        {left < 0 ? (
          <div className="flex flex-col gap-1">
            <p className="font-heading text-2xl font-bold tracking-tight">Did you make it?</p>
            <button type="button" style={STILL} onClick={() => (chime('open'), window.api.openInHome('goal', id))} className="self-start text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
              {dayMonth(`${goal.goalAt}T12:00`)} has passed. Say how it went
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-3" style={{ color: left > 30 ? 'var(--foreground)' : warmth(left) }}>
            {left === 0
              ? <span className="font-heading text-4xl leading-none font-bold tracking-tight">Today</span>
              : <DotMatrix text={String(left)} className="h-12" />}
            <span className="pb-0.5 text-xs leading-tight text-muted-foreground">
              {left === 0 ? 'is the day' : left === 1 ? 'day left' : 'days left'}<br />
              to {dayMonth(`${goal.goalAt}T12:00`)} · {percent(wayThrough(from, goal.goalAt))}
            </span>
          </div>
        )}
        <div className="shrink-0 text-foreground"><Journey compact from={from} target={goal.goalAt} today={today} logs={goal.glosses} /></div>
        <TempusBars className="mt-auto" />
      </motion.div>
    </div>
  )
}

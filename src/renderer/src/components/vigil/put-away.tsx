import { useState } from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'
import { chime } from '@/lib/sound'
import { shift, spring } from '@/lib/motion'
import { useLive } from '@/lib/vigil'
import { toast } from './ui'
import { num } from '../../../../main/dates'

type Run = { at: string; moved: number; still: number; days: number }
const call = <T,>(channel: string, ...args: unknown[]): Promise<T> => window.api.vigil(channel, ...args) as Promise<T>
const AWAY = 'put-away:seen'

/**
 * The Inbox's word on what was put away on its own today: "12 old
 * captures were put away", with See them and Undo, until you close it or
 * bring them back. Shown on the day it happened only.
 */
export function PutAwayLine({ onSee }: { onSee: () => void }): React.JSX.Element | null {
  const run = useLive(() => call<Run | null>('putaway:today'), null as Run | null)
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(AWAY)
    } catch {
      return null
    }
  })
  if (!run || !run.still || seen === run.at) return null
  const close = (): void => {
    chime('fold')
    setSeen(run.at)
    try {
      localStorage.setItem(AWAY, run.at)
    } catch {
      // Back on the next look, then.
    }
  }
  const undo = (): void =>
    void call<number>('putaway:undo', run.at).then((back) => {
      chime('unshelve')
      toast(back === 1 ? 'Back in your Inbox' : `${num(back)} back in your Inbox`)
    })
  const link = 'font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60'
  return (
    <motion.div role="status" data-put-away
      initial={{ opacity: 0, transform: shift('translateY(-4px)') }} animate={{ opacity: 1, transform: shift('translateY(0px)') }} transition={spring.moderate}
      className="mx-5 mt-2 flex items-start gap-3 rounded-xl border bg-background py-2 pr-1.5 pl-3.5 text-body text-foreground/80">
      <p className="min-w-0 flex-1 py-1">
        <strong className="font-semibold text-foreground">{run.still === 1 ? '1 old capture was put away today,' : `${num(run.still)} old captures were put away today,`}</strong>{' '}
        untouched for {run.days} days. They wait in Archived.{' '}
        <button type="button" className={link} onClick={() => (chime('tap'), onSee())}>See them</button>
        {' · '}
        <button type="button" className={link} onClick={undo}>Undo</button>
      </p>
      <button type="button" aria-label="Put this away" onClick={close} className="mt-0.5 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground">
        <X className="size-3.5" />
      </button>
    </motion.div>
  )
}

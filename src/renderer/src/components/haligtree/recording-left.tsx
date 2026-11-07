import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'

import { EASE, shift, spring } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { Orb } from './orb'
import { toast } from './ui'

type Left = { id: string; said: string }
type Asked = { one: Left | null; more: number; keeping: boolean; trouble: string | null; keep: () => void; discard: () => void }

const inMainWindow = /home\.html$/.test(location.pathname) || /[?&]view=home/.test(location.search)

/**
 * The recordings a crash left behind (main/meeting.ts), one at a time: asked about in the main window only, and asked
 * for as long as it takes, because a notice that went away by itself could be missed and the recording with it.
 */
export function useRecordingsLeft(): Asked {
  const [all, setAll] = useState<Left[]>([])
  const [keeping, setKeeping] = useState(false)
  const [trouble, setTrouble] = useState<string | null>(null)
  const read = useCallback(() => void window.api.haligtree<Left[]>('meeting:left').then(setAll), [])
  useEffect(() => {
    if (!inMainWindow) return
    read()
    return window.api.onMeetingLeft(read)
  }, [read])
  const one = all[0] ?? null
  const keep = (): void => {
    if (!one || keeping) return
    chime('tap')
    setKeeping(true)
    setTrouble(null)
    void window.api.haligtree<{ id?: string; error?: string }>('meeting:left-keep', one.id).then((done) => {
      setKeeping(false)
      if (done.error) return (chime('nope'), setTrouble(done.error))
      chime('settled')
      read()
    })
  }
  const discard = (): void => {
    if (!one || keeping) return
    const { id } = one
    chime('away')
    setTrouble(null)
    setAll((was) => was.filter((other) => other.id !== id))
    void window.api.haligtree('meeting:left-discard', id).then(() => toast('Recording discarded', () => void window.api.haligtree('meeting:left-undo', id).then(read)))
  }
  return { one, more: Math.max(0, all.length - 1), keeping, trouble, keep, discard }
}

/**
 * In the toast lane, in the manner of the line about words not saved: quiet, no sound as it comes, and it holds still.
 * One width whatever it says, so with several to answer the next never moves “Keep” and “Discard” from under the hand.
 * The next takes this one's place in the same sheet, so two never show over each other, and the second click of a
 * double click is let go, so it never answers for the next.
 */
export function RecordingLeftLine({ left }: { left: Asked }): React.JSX.Element {
  const { one, more, keeping, trouble, keep, discard } = left
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {one && (
        <motion.div
          key="recording-left"
          layout="position"
          role="status"
          aria-live="polite"
          data-recording-left={one.id}
          initial={{ opacity: 0, transform: shift('translateY(8px)') }}
          animate={{ opacity: 1, transform: shift('translateY(0px)') }}
          exit={{ opacity: 0, transform: shift('translateY(8px)'), transition: { duration: 0.16, ease: EASE } }}
          transition={spring.slow}
          className="pointer-events-auto mx-4 flex w-[min(36rem,calc(100%-2rem))] min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-md border border-border bg-popover py-1.5 pr-3.5 pl-3.5 text-sm font-medium shadow-(--mf-panel-shadow)"
        >
          {keeping ? <Orb label="Keeping the recording…" /> : <>
            <span className="min-w-[min(13rem,100%)] flex-1 text-pretty">
              {one.said}{more > 0 && <span data-recording-left-more>{` (${more.toLocaleString()} more after this)`}</span>}
              {trouble && <span data-recording-left-trouble className="mt-0.5 block font-medium text-[var(--tt-color-text-orange)]">{trouble}</span>}
            </span>
            <button type="button" data-recording-left-keep onClick={(event) => event.detail < 2 && keep()} className="min-h-8 shrink-0 self-end cursor-pointer font-medium whitespace-nowrap text-[var(--tt-brand-color-400)] hover:underline">Keep</button>
            <button type="button" data-recording-left-discard onClick={(event) => event.detail < 2 && discard()} className="group/act min-h-8 shrink-0 self-end cursor-pointer font-medium whitespace-nowrap text-foreground">
              <span className="underline decoration-muted-foreground/50 underline-offset-2 group-hover/act:decoration-foreground">Discard</span>
            </button>
          </>}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

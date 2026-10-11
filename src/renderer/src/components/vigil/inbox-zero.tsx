import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { chime } from '@/lib/sound'
import { shift, spring } from '@/lib/motion'
import { useLive, vigil } from '@/lib/vigil'
import { useQueue, type QueueRow } from '@/lib/reading-queue'
import { Button } from '@/components/ui/button'
import { Empty, Kbd, typing } from './ui'
import { num } from '../../../../main/dates'

/**
 * True from the moment the inbox goes from something to nothing in front of
 * you, until something lands in it again. Arriving at an inbox already empty
 * is not that moment: it is simply quiet. The `clear` chord plays once, after
 * the last row has flown to its new home.
 */
export function useJustCleared(open: number, loaded: boolean): boolean {
  const before = useRef<number | null>(null)
  const [cleared, setCleared] = useState(false)
  useEffect(() => {
    if (!loaded) return
    const was = before.current
    before.current = open
    if (open > 0) return setCleared(false)
    if (!was) return
    setCleared(true)
    const ring = setTimeout(() => chime('clear'), 420)
    return () => clearTimeout(ring)
  }, [open, loaded])
  return cleared
}

/**
 * Inbox zero: the moment the last capture takes its way out. The scene rises,
 * the line types itself in, and one next step waits on Enter: the cards due
 * today, or the next thing in the reading queue. With neither, it says where
 * the next thought goes.
 */
export function InboxZero({ compact = false, onReview, onRead }: {
  compact?: boolean
  onReview: () => void
  onRead: (row: QueueRow) => void
}): React.JSX.Element {
  const due = useLive(vigil.dueCount, 0)
  const { queue } = useQueue()
  const next = due > 0
    ? { said: `Next: ${num(due)} ${due === 1 ? 'card' : 'cards'} to review`, run: onReview }
    : queue[0] ? { said: `Read next: ${queue[0].title || 'Untitled'}`, run: () => onRead(queue[0]) } : null
  const latest = useRef(next)
  latest.current = next
  const here = useRef<HTMLDivElement>(null)
  // Enter takes the next step, from anywhere on the page that is not writing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || typing() || !latest.current) return
      // A page kept but out of view (another pane in front, the box's panel shut) leaves Enter alone.
      if (!here.current?.offsetParent) return
      event.preventDefault()
      chime('tap')
      latest.current.run()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <motion.div ref={here} data-inbox-zero
      initial={{ opacity: 0, transform: shift('translateY(10px)') }}
      animate={{ opacity: 1, transform: shift('translateY(0px)') }}
      transition={spring.slow}>
      <Empty compact={compact} shaped shape={['flower', 2]} title="Inbox zero"
        action={next ? (
          <Button variant="outline" size={compact ? 'sm' : 'lg'} className="max-w-full" onClick={() => (chime('tap'), next.run())}>
            <span className="min-w-0 truncate">{next.said}</span> <Kbd>↵</Kbd>
          </Button>
        ) : undefined}>
        {next ? 'Everything you caught has a place.' : 'Everything you caught has a place. ⌘. catches the next one, from anywhere.'}
      </Empty>
    </motion.div>
  )
}

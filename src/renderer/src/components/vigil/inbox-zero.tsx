import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { chime } from '@/lib/sound'
import { shift, spring } from '@/lib/motion'
import { useLive, vigil } from '@/lib/vigil'
import { useQueue, type QueueRow } from '@/lib/reading-queue'
import { Button } from '@/components/ui/button'
import { Empty, Kbd, typing } from './ui'
import { num } from '../../../../main/dates'
import { lastBinned, seeTheBin } from '@/lib/to-bin'

/**
 * How the inbox just emptied in front of you: `done` when the last captures
 * took their real exits (a task, a gem, archived, resolved), `binned` when
 * they all went to the Bin, which is not the moment to celebrate. Null until
 * it happens, and again once something lands. Arriving at an inbox already
 * empty is not that moment: it is simply quiet. The `clear` chord plays once,
 * after the last row has flown to its new home, and never for the Bin.
 */
export type Cleared = { how: 'done' | 'binned'; left: string[] } | null
export function useJustCleared(open: readonly { id: string }[], all: readonly { id: string; status: string }[], loaded: boolean): Cleared {
  const before = useRef<string[] | null>(null)
  const [cleared, setCleared] = useState<Cleared>(null)
  const ids = open.map((one) => one.id).join(' ')
  useEffect(() => {
    if (!loaded) return
    const was = before.current
    before.current = ids ? ids.split(' ') : []
    if (ids) return setCleared(null)
    if (!was?.length) return
    // The ones that left last: every one in the Bin, and it is only quiet.
    const status = new Map(all.map((one) => [one.id, one.status]))
    if (was.every((id) => status.get(id) === 'discarded')) return setCleared({ how: 'binned', left: was })
    setCleared({ how: 'done', left: was })
    const ring = setTimeout(() => chime('clear'), 420)
    return () => clearTimeout(ring)
    // `all` is read when the open ones change, never on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, loaded])
  return cleared
}

/**
 * The inbox emptied into the Bin: the quiet page, saying where they went,
 * with the Undo that brings them back while it is still the last move.
 */
export function InboxBinned({ compact = false, left }: { compact?: boolean; left: string[] }): React.JSX.Element {
  // Only the move that took these, never an older one from elsewhere.
  const [last] = useState(() => { const one = lastBinned(); return one && left.every((id) => one.ids.includes(id)) ? one : null })
  // ⌘Z here too once the notice has gone; while it is up, the notice's own ⌘Z takes it.
  useEffect(() => {
    if (!last) return
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || event.shiftKey || event.altKey || event.key !== 'z' || typing()) return
      setTimeout(() => lastBinned()?.undo === last.undo && (chime('undo'), last.undo()), 0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [last])
  return (
    <Empty compact={compact} title="Nothing waiting"
      action={(
        <span className="flex flex-wrap items-center gap-2">
          {last && (
            <Button variant="outline" size={compact ? 'sm' : 'default'} onClick={() => (chime('undo'), last.undo())}>
              Undo <Kbd>⌘Z</Kbd>
            </Button>
          )}
          <Button variant="ghost" size={compact ? 'sm' : 'default'} onClick={() => (chime('tap'), seeTheBin.run())}>Open the Bin</Button>
        </span>
      )}>
      <><strong className="text-foreground">The last ones are in the Bin.</strong> They wait there until you empty it, so nothing is lost.</>
    </Empty>
  )
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
      <Empty compact={compact} shaped title="Inbox zero"
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

import { createContext, useContext, useMemo, useState } from 'react'
import { Clock } from 'lucide-react'

import { readingQueue, useQueue, type QueueRow } from '@/lib/reading-queue'
import { chime } from '@/lib/sound'
import { cn } from '@/lib/cn'
import { Tip, toast } from './ui'

/**
 * Read later, YouTube's Watch later: a note or page put at the end of the
 * Queue in one press, said in a toast with an Undo. Pressed again, it comes
 * out. The Feed reads the queue once and every post asks it.
 */
const Queued = createContext<Map<string, QueueRow>>(new Map())

export function QueuedProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { queue } = useQueue()
  const waiting = useMemo(() => new Map(queue.map((row) => [row.itemId, row])), [queue])
  return <Queued.Provider value={waiting}>{children}</Queued.Provider>
}

/** In the queue or not, and the press that changes it; what you chose shows at once. */
export function useReadLater(id: string): { queued: boolean; toggle: () => void } {
  const row = useContext(Queued).get(id)
  const [mine, setMine] = useState<boolean | null>(null)
  const queued = mine ?? !!row
  const toggle = (): void => {
    if (queued && row) {
      setMine(false)
      chime('untuck')
      void readingQueue.remove(row.id).then((was) => {
        setMine(null)
        toast('Out of your queue', was ? () => void readingQueue.restore(was).then(() => chime('undo')) : undefined)
      })
      return
    }
    setMine(true)
    chime('later')
    void readingQueue.add([id]).then(({ added, before }) => {
      setMine(null)
      if (added) toast('In your queue', () => void readingQueue.put(before).then(() => chime('undo')))
    })
  }
  return { queued, toggle }
}

const TIP = 'Read later: put it at the end of your queue'
const TIP_IN = 'In your queue: press to take it out'

/** The icon on a post's row: a clock, filled in its colour once it waits in the queue. */
export function ReadLaterButton({ id, className }: { id: string; className?: string }): React.JSX.Element {
  const { queued, toggle } = useReadLater(id)
  return (
    <Tip label={queued ? TIP_IN : TIP}>
      <button type="button" data-read-later={queued ? 'in' : 'out'} aria-pressed={queued} aria-label="Read later" onClick={toggle}
        className={cn('flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-foreground/[0.06] hover:text-foreground', queued && 'bg-primary/12 text-primary hover:bg-primary/18 hover:text-primary', className)}>
        <Clock className="size-4" strokeWidth={queued ? 2.4 : 2} />
      </button>
    </Tip>
  )
}

/** With its word, for the reader's foot bar. */
export function ReadLaterLabelled({ id, className }: { id: string; className?: string }): React.JSX.Element {
  const { queued, toggle } = useReadLater(id)
  return (
    <Tip label={queued ? TIP_IN : TIP}>
      <button type="button" data-read-later={queued ? 'in' : 'out'} aria-pressed={queued} onClick={toggle}
        className={cn('flex h-7 items-center gap-1.5 rounded-md px-2 text-control transition-colors hover:bg-foreground/[0.06] hover:text-foreground', queued && 'text-primary hover:text-primary', className)}>
        <Clock className="size-4 shrink-0" strokeWidth={queued ? 2.4 : 2} />
        {/* Both words held in one place, so the row never moves when it changes. */}
        <span className="grid">
          <span className={cn('col-start-1 row-start-1', queued && 'invisible')}>Read later</span>
          <span aria-hidden={!queued} className={cn('col-start-1 row-start-1', !queued && 'invisible')}>In your queue</span>
        </span>
      </button>
    </Tip>
  )
}

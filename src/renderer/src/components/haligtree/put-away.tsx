import { useState } from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'
import { chime } from '@/lib/sound'
import { shift, spring } from '@/lib/motion'
import { call, useLive } from '@/lib/haligtree'
import { toast } from './ui'
import { dayjs, num, plural } from '../../../../main/dates'

type Run = { at: string; moved: number; still: number; days: number }

/**
 * The Inbox's word on what was put away on its own today: "12 old
 * captures were put away", with See them and Undo, until you close it or
 * bring them back. Shown on the day it happened only.
 */
export function PutAwayLine({ onSee }: { onSee: () => void }): React.JSX.Element | null {
  const run = useLive(() => call<Run | null>('putaway:today'), null as Run | null)
  if (!run || !run.still) return null
  const undo = (): void =>
    void call<number>('putaway:undo', run.at).then((back) => {
      chime('unshelve')
      toast(back === 1 ? 'Back in your Inbox' : `${num(back)} back in your Inbox`)
    })
  return (
    <OwnLine seenKey="put-away:seen" at={run.at} onUndo={undo} onSee={onSee} mark="data-put-away"
      lead={run.still === 1 ? '1 old capture was put away today,' : `${num(run.still)} old captures were put away today,`}
      rest={`untouched for ${run.days === 1 ? 'a day' : `${run.days} days`}. ${run.still === 1 ? 'It waits' : 'They wait'} in Archived.`} />
  )
}

/**
 * The same word on the #tags taken out of notes' names, once a book (main/tags-off-name.ts): asked as the Inbox
 * opens, which moves them the first time. Each note keeps its tags, on its last line; Undo puts every one back.
 * Shown on the day it happened only.
 */
export function TagsMovedLine(): React.JSX.Element | null {
  const run = useLive(() => window.api.captures.tagsMoved(), null as { at: string; count: number } | null)
  if (!run || dayjs(run.at).isBefore(dayjs(), 'day')) return null
  const undo = (): void =>
    void window.api.captures.tagsMovedUndo().then((back) => {
      chime('unshelve')
      toast(back === 1 ? 'Its tags are back in its name' : `${num(back)} notes have their tags back in their names`)
    })
  return (
    <OwnLine seenKey="tags-moved:seen" at={run.at} onUndo={undo} mark="data-tags-moved"
      lead={`#tags moved out of the names of ${plural(run.count, 'note')},`}
      rest={`so a name says only what it is. ${run.count === 1 ? 'It keeps them' : 'Each keeps them'}, on its last line.`} />
  )
}

/** One line in the Inbox for something done on its own: what, how it stands, See them and Undo, until it is closed. */
function OwnLine({ seenKey, at, lead, rest, onSee, onUndo, mark }: { seenKey: string; at: string; lead: string; rest: string; onSee?: () => void; onUndo: () => void; mark: string }): React.JSX.Element | null {
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(seenKey)
    } catch {
      return null
    }
  })
  if (seen === at) return null
  const close = (): void => {
    chime('fold')
    setSeen(at)
    try {
      localStorage.setItem(seenKey, at)
    } catch {
      // Back on the next look, then.
    }
  }
  const link = 'font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60'
  return (
    <motion.div role="status" {...{ [mark]: '' }}
      initial={{ opacity: 0, transform: shift('translateY(-4px)') }} animate={{ opacity: 1, transform: shift('translateY(0px)') }} transition={spring.moderate}
      className="mx-5 mt-2 flex items-start gap-3 rounded-xl border bg-background py-2 pr-1.5 pl-3.5 text-body text-(--mf-muted-strong)">
      <p className="min-w-0 flex-1 py-1">
        <strong className="font-semibold text-foreground">{lead}</strong>{' '}
        {rest}{' '}
        {onSee && <><button type="button" className={link} onClick={() => (chime('tap'), onSee())}>See them</button>{' · '}</>}
        <button type="button" className={link} onClick={onUndo}>Undo</button>
      </p>
      <button type="button" aria-label="Put this away" onClick={close} className="mt-0.5 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground">
        <X className="size-3.5" />
      </button>
    </motion.div>
  )
}

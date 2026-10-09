import { Fragment, useRef } from 'react'
import { Flag, Minus, Plus } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import FileDescriptionIcon from '@/components/ui/file-description-icon'
import LibraryIcon from '@/components/ui/library-icon'
import HistoryCircleIcon from '@/components/ui/history-circle-icon'
import CheckedIcon from '@/components/ui/checked-icon'
import QuestionMarkIcon from '@/components/ui/question-mark'
import XIcon from '@/components/ui/x-icon'
import { AnimatePresence, motion } from 'motion/react'
import { EASE } from '@/lib/motion'

import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { openWindow } from '@/lib/notes'
import { chime } from '@/lib/sound'
import { useLive, vigil, type Recent, type Settings } from '@/lib/vigil'
import { Rolling, Tip, Typed } from './ui'
import { Highlight, useFluidHover } from './glide'
import { clock, dayKey as dayOf, dayName, daysFromToday } from '../../../../main/dates'

// itshover drawings in lucide's place, moving when their control is pointed at.
const FileText = alive(FileDescriptionIcon)
const Gem = alive(LibraryIcon)
const History = alive(HistoryCircleIcon)
const ListTodo = alive(CheckedIcon)
const Orbit = alive(QuestionMarkIcon)
const X = alive(XIcon)

const TIER = { nugget: Gem, article: FileText, question: Orbit, task: ListTodo, goal: Flag } as const

/** A day header in the list: "Today", "Yesterday", "Monday 5 October". */
const dayHeader = (iso: string): string => {
  const days = daysFromToday(iso)
  if (days === 0) return 'Today'
  if (days === -1) return 'Yesterday'
  return dayName(iso, 'never')
}
const dayKey = (iso: string): string => dayOf(iso)
const time = clock

/** Done, let go or settled: still listed where it was made, struck through. */
const closed = (one: Recent): boolean => ['resolved', 'discarded', 'done', 'dropped', 'closed'].includes(one.status)

/**
 * Everything made in the last few days, newest first, every kind of thing
 * together: the saved query a week's page is written beside, scrolled while
 * you look for the connections a day at a time hides. `until` pins it to a
 * week that has ended; otherwise it reaches back from now, as far as the
 * setting says, and − and + change that.
 */
export function RecentPanel({ until, onOpen, onClose, className = '' }: {
  /** The end of the stretch shown (a week's Sunday night); now if not given. */
  until?: string
  onOpen: (type: string, id: string) => void
  onClose?: () => void
  className?: string
}): React.JSX.Element {
  const settings = useLive(vigil.settings, null as Settings | null)
  const days = until ? 7 : settings?.recentDays ?? 7
  const list = useLive(() => vigil.recent(days, until ?? null), null as Recent[] | null, [days, until])
  // One light over the rows, gliding to the nearest; over a day's heading it stays on a row.
  const rows = useRef<HTMLDivElement>(null)
  const hover = useFluidHover(rows, { items: '[data-recent-row]' })
  const reach = (by: number): void => {
    const next = Math.max(1, Math.min(30, days + by))
    if (next === days) return chime('nope')
    chime(by > 0 ? 'slide' : 'fold')
    void vigil.setSettings({ recentDays: next })
  }
  return (
    <aside data-chrome aria-label="Recent" className={`flex min-h-0 min-w-0 flex-col ${className}`}>
      <header className="flex h-10 shrink-0 items-center gap-1.5 border-b px-3 text-control text-muted-foreground">
        <History className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {until ? <Rolling by="word" text="That week" /> : <Rolling by="word" text={days === 1 ? 'The last day' : `The last ${days} days`} />}
        </span>
        {list && <span className="shrink-0 tabular-nums"><Rolling text={list.length} /></span>}
        {!until && (
          <span className="flex shrink-0 items-center">
            <Tip label="A day less">
              <button type="button" aria-label="A day less" disabled={days <= 1} onClick={() => reach(-1)} className="flex size-6 items-center justify-center rounded-md hover:bg-accent hover:text-foreground disabled:opacity-35"><Minus className="size-3.5" /></button>
            </Tip>
            <Tip label="A day more">
              <button type="button" aria-label="A day more" disabled={days >= 30} onClick={() => reach(1)} className="flex size-6 items-center justify-center rounded-md hover:bg-accent hover:text-foreground disabled:opacity-35"><Plus className="size-3.5" /></button>
            </Tip>
          </span>
        )}
        {onClose && (
          <Tip label="Close  ⇧⌘Y">
            <button type="button" aria-label="Close Recent" onClick={() => (chime('fold'), onClose())} className="flex size-6 shrink-0 items-center justify-center rounded-md hover:bg-accent hover:text-foreground"><X className="size-3.5" /></button>
          </Tip>
        )}
      </header>
      <div ref={rows} {...hover.handlers} className="mf-more relative isolate min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        <Highlight spot={hover.spot} session={hover.session} snap={hover.snap} />
        {list && !list.length && (
          <p className="px-2 py-4 text-control text-muted-foreground">
            <Typed text={until ? 'Nothing was made that week.' : `Nothing made in the last ${days === 1 ? 'day' : `${days} days`}. What you capture, keep or plan shows here, newest first.`} step={28} />
          </p>
        )}
        <AnimatePresence initial={false}>
          {list?.map((one, index) => {
            const kind = CAPTURE_TYPES.find((type) => type.id === one.kind)
            const Mark = one.type === 'capture' ? kind?.icon ?? CAPTURE_TYPES[0].icon : TIER[one.type as keyof typeof TIER] ?? Gem
            const header = index === 0 || dayKey(list[index - 1].at) !== dayKey(one.at)
            return (
              <Fragment key={`${one.type}-${one.id}`}>
                {header && <h3 className="px-2 pt-3 pb-1 text-meta text-muted-foreground">{dayHeader(one.at)}</h3>}
                <motion.button
                  layout="position"
                  initial={{ opacity: 0, y: -3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  transition={{ duration: 0.16, ease: EASE }}
                  type="button"
                  data-recent-row
                  data-drag-open={`${one.type}:${one.id}`}
                  data-private={one.private ? '' : undefined}
                  onClick={(event) => {
                    if (event.metaKey && one.type !== 'task') return openWindow(one.type, one.id)
                    chime('tap')
                    onOpen(one.type, one.id)
                  }}
                  className="group/recent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-control"
                >
                  <Mark className="size-4 shrink-0" style={one.type === 'capture' && kind ? { color: kind.tint } : undefined} />
                  <span className={`private-text min-w-0 flex-1 truncate ${closed(one) ? 'text-muted-foreground line-through decoration-foreground/40' : 'text-foreground'}`}>{one.title || 'Untitled'}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{time(one.at)}</span>
                </motion.button>
              </Fragment>
            )
          })}
        </AnimatePresence>
      </div>
    </aside>
  )
}

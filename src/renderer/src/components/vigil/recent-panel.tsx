import { Fragment, useEffect, useRef } from 'react'
import { Flag, Minus, Plus } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import FileDescriptionIcon from '@/components/ui/file-description-icon'
import LibraryIcon from '@/components/ui/library-icon'
import HistoryCircleIcon from '@/components/ui/history-circle-icon'
import CheckedIcon from '@/components/ui/checked-icon'
import QuestionMarkIcon from '@/components/ui/question-mark'
import XIcon from '@/components/ui/x-icon'
import { AnimatePresence, motion } from 'motion/react'
import { DONE_WORDS } from './note-list'
import { EASE, shift } from '@/lib/motion'

import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { openWindow } from '@/lib/notes'
import { chime } from '@/lib/sound'
import { useLive, vigil, type Pin, type Recent, type Settings, type Task } from '@/lib/vigil'
import { Rolling, Tags, Tip, Typed, typing } from './ui'
import { RowMenu } from './row-menu'
import { sideMenu } from './open-today'
import { useTaskNow } from './tasks-view'
import { PICKED_MARK, usePickMixed } from './pick-mixed'
import { listInFront, useListScope } from '@/lib/list-front'
import { moveToBin } from '@/lib/to-bin'
import { taskName } from '@/lib/tasks'
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
  return dayName(iso)
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
  // Its rows answer as the sidebar's do: right-click, ⇧- or ⌘-click to pick, and with the
  // pointer over the panel or the last click in it (lib/list-front.ts), x, ⌘A, ⌫ to the
  // Bin and Esc. Its own keys, taken before the page's, which steps aside meanwhile.
  const tasks = useLive(vigil.tasks, [] as Task[])
  const pins = useLive(vigil.pins, [] as Pin[])
  const taskNow = useTaskNow()
  const panel = useRef<HTMLElement>(null)
  const several = usePickMixed((list ?? []).map((one) => ({ type: one.type, id: one.id, title: one.title, private: one.private, status: one.status })), { keys: false })
  useListScope(panel)
  const now = useRef({ list, several })
  now.current = { list, several }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!panel.current || listInFront() !== panel.current || typing() || event.ctrlKey || event.altKey) return
      const { list, several } = now.current
      const row = (document.activeElement as HTMLElement).closest<HTMLElement>('[data-drag-open]')?.dataset.dragOpen
      const key = (one: Recent): string => `${one.type}:${one.id}`
      const picked = (list ?? []).filter((one) => several.picked(one))
      if (event.metaKey && !event.shiftKey && event.code === 'KeyA') return void (event.preventDefault(), event.stopPropagation(), several.selectAll())
      if (event.metaKey && event.key !== 'Backspace') return
      if (event.key === 'Backspace' || event.key === 'Delete') {
        const going = picked.length ? picked : (list ?? []).filter((one) => key(one) === row)
        if (!going.length) return
        event.preventDefault()
        event.stopPropagation()
        return void moveToBin(going.map((one) => ({ type: one.type, id: one.id, status: one.status })), undefined).then((n) => n && several.count && several.clear())
      }
      if (event.key === 'x' && row && !event.metaKey) {
        const [type, ...rest] = row.split(':')
        event.preventDefault()
        event.stopPropagation()
        several.toggle({ type, id: rest.join(':') })
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  const reach = (by: number): void => {
    const next = Math.max(1, Math.min(30, days + by))
    if (next === days) return chime('nope')
    chime(by > 0 ? 'slide' : 'fold')
    void vigil.setSettings({ recentDays: next })
  }
  return (
    <aside ref={panel} data-chrome aria-label="Recent" className={`flex min-h-0 min-w-0 flex-col ${className}`}>
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
      {several.bar && <div data-pick-bar className="shrink-0 border-b px-2 py-1.5">{several.bar}</div>}
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
            const task = one.type === 'task' ? tasks.find((t) => t.id === one.id) : undefined
            const name = one.type === 'task' ? taskName(one.title) : { text: one.title, tags: [] as string[] }
            return (
              <Fragment key={`${one.type}-${one.id}`}>
                {header && <h3 className="px-2 pt-3 pb-1 text-meta text-muted-foreground">{dayHeader(one.at)}</h3>}
                <RowMenu items={several.menu(one) ?? [...(one.type === 'task' && !task ? [{ label: 'Open', run: () => onOpen(one.type, one.id) }] : sideMenu(one.type, one.id, name.text, { onOpen, pinned: pins.some((pin) => pin.id === one.id), kind: one.kind, status: one.status, task, now: taskNow })), ...several.rowItems(one)]}>
                <motion.button
                  layout="position"
                  initial={{ opacity: 0, transform: shift('translateY(-3px)') }}
                  animate={{ opacity: 1, transform: shift('translateY(0px)') }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  transition={{ duration: 0.16, ease: EASE }}
                  type="button"
                  data-recent-row
                  data-drag-open={`${one.type}:${one.id}`}
                  data-picked={several.picked(one) || undefined}
                  data-private={one.private ? '' : undefined}
                  onClick={(event) => {
                    if (event.shiftKey) return several.toggle(one)
                    if (event.metaKey && one.type !== 'task') return openWindow(one.type, one.id)
                    chime('tap')
                    onOpen(one.type, one.id)
                  }}
                  className={`group/recent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-control ${PICKED_MARK}`}
                >
                  <Mark className="size-4 shrink-0" style={one.type === 'capture' && kind ? { color: kind.tint } : one.type === 'task' ? { color: 'var(--tt-color-text-green)' } : undefined} />
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className={`private-text min-w-0 truncate ${closed(one) ? `text-muted-foreground ${DONE_WORDS}` : 'text-foreground'}`}>{name.text || 'Untitled'}</span>
                    <Tags tags={name.tags} />
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{time(one.at)}</span>
                </motion.button>
                </RowMenu>
              </Fragment>
            )
          })}
        </AnimatePresence>
      </div>
    </aside>
  )
}

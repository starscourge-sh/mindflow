import { unloaded, useLive, haligtree, type Settings, type Task } from '@/lib/haligtree'
import { TimeGone } from './time-gone'
import { MonthPlan } from './month-plan'
import { NowSlot } from './now-slot'
import { QueuePanel } from './queue-view'
import { StillWondering } from './questions-view'
import { GettingStarted } from './getting-started'
import { PowersLine } from './powers-view'
import { WhatsNewCard } from './whats-new'
import { CloseDayOffer } from './close-day'
import { MorningSortOffer } from './sort-out'
import { WeeklyDigest } from './weekly-digest'

/**
 * What Home held that still matters, at the foot of today's page, under the
 * tasks: the one card that fits the moment (now-slot.tsx), ranked by how much
 * it belongs to right now (the evening's close, Sunday's week, what is new,
 * then the steady ones; the next marked day is on the brief above), and the
 * month and the time gone when they are switched on in Settings. Home's shelves of things opened and
 * kept are gone: ⌘K's Recent and the pages themselves hold them.
 */
export function DayMoments({ onOpen, onView }: { onOpen?: (type: string, id: string) => void; onView?: (id: string, focus?: string) => void }): React.JSX.Element {
  const settings = useLive(haligtree.settings, null as Settings | null)
  const tasks = useLive(haligtree.tasks, [] as Task[])
  const open = onOpen ?? ((): void => undefined)
  const view = onView ?? ((): void => undefined)
  return (
    <div data-day-moments className="flex flex-col">
      <NowSlot>
        <div data-now={5} className="pt-2 empty:hidden"><QueuePanel onView={(id) => view(id)} /></div>
        <div data-now={4.5} className="pt-2 empty:hidden"><StillWondering onOpen={open} /></div>
        <div className="pt-4 empty:hidden"><GettingStarted onOpen={open} onView={view} /></div>
        <div data-now={6} className="pt-3 empty:hidden"><PowersLine onView={view} /></div>
        <div data-now={1} className="pt-3 empty:hidden"><CloseDayOffer /></div>
        <div data-now={1} className="pt-3 empty:hidden"><MorningSortOffer /></div>
        <div data-now={2} className="pt-3 empty:hidden"><WeeklyDigest onView={view} /></div>
        <div data-now={4} className="pt-3 empty:hidden"><WhatsNewCard onView={view} /></div>
      </NowSlot>
      {settings?.homeTimeGone === true && <div className="mt-6"><TimeGone heading={<h2 className="text-body font-semibold">Time gone</h2>} /></div>}
      {settings?.homeCalendar === true && !unloaded(tasks) && (
        <div className="mt-6"><MonthPlan tasks={tasks} onDay={(day) => view('day', day)} onOpen={open} onWeek={(monday) => view('weekpage', monday)} onMonth={(month) => view('monthpage', month)} /></div>
      )}
    </div>
  )
}

import { useEffect } from 'react'
import { haligtree } from './haligtree'
import { dayKey, plural } from '../../../main/dates'
import { toast } from '@/components/haligtree/ui'

/**
 * Back at the Mac after four hours or more locked or asleep (main/away.ts):
 * one quiet line on the main window saying what came due while you were gone,
 * "Welcome back. While you were away 2 tasks came due and 24 cards are ready.",
 * and nothing at all when nothing did. Settings, What comes back to you,
 * "Welcome back" turns it off.
 */
export const awaySaid = (ms: number): string => (ms >= 2 * 86_400_000 ? plural(Math.round(ms / 86_400_000), 'day') : ms >= 86_400_000 ? 'a day' : plural(Math.round(ms / 3600_000), 'hour'))

export function useBackLine(): void {
  useEffect(() => window.api.onBack(async (ms) => {
    const settings = await haligtree.settings()
    if (settings.backLine === false) return
    const since = Date.now() - ms
    const today = dayKey(new Date())
    const [tasks, cards] = await Promise.all([haligtree.tasks().catch(() => []), haligtree.dueCount().catch(() => 0)])
    // Tasks whose time came while you were away, or that are for today and still open.
    const due = tasks.filter((task) => task.status === 'open' && task.dueAt && (Date.parse(task.dueAt) >= since || task.dueAt.slice(0, 10) === today) && Date.parse(task.dueAt) <= Date.now() + 12 * 3600_000).length
    const parts = [due && `${plural(due, 'task')} ${due === 1 ? 'is' : 'are'} due`, cards && `${plural(cards, 'card')} ${cards === 1 ? 'is' : 'are'} ready to review`].filter(Boolean)
    if (!parts.length) return
    toast(`Welcome back after ${awaySaid(ms)}: ${parts.join(' and ')}.`, undefined, 'info')
  }), [])
}

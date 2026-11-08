import { useEffect } from 'react'
import { haligtree, splitTags, type Task } from './haligtree'
import { chime } from './sound'
import { toast } from '@/components/haligtree/ui'
import { quoted } from '../../../main/clip'

/**
 * A task in your Mac's Reminders (main/reminders.ts): the menu line that puts
 * it there or takes it out, and the keeping in step, from the main window: a
 * tick in Reminders makes the task done here (said quietly once), and a task
 * done here is ticked there. Read every minute while the window is open and
 * each time it comes to the front.
 */

let linked = new Set<string>()
const load = (): Promise<void> => window.api.haligtree<string[]>('reminders:linked').then((ids) => void (linked = new Set(ids)), () => undefined)
if (typeof window !== 'undefined' && window.api) void load()

const denied = (): void =>
  toast('Haligtree can’t reach Reminders yet: allow it in System Settings, Privacy & Security, Reminders', undefined, 'info', { label: 'Open Settings', key: 'S', run: () => void window.api.haligtree('reminders:privacy') })

export async function addToReminders(task: Task): Promise<void> {
  const title = splitTags(task.title).text || task.title
  // Known here first, so the lists main redraws on the change already say "Take out of Reminders".
  linked.add(task.id)
  const said = await window.api.haligtree<{ status: string }>('reminders:add', task.id, title, task.dueAt, !!task.allDay)
  if (said.status !== 'on') return (linked.delete(task.id), denied())
  await load()
  chime('noted')
  toast(`In Reminders: ${quoted(title, 80)}. Ticked there, it is done here`, () => void window.api.haligtree('reminders:remove', task.id).then(load))
}

export async function outOfReminders(task: Task): Promise<void> {
  linked.delete(task.id)
  await window.api.haligtree('reminders:remove', task.id)
  await load()
  chime('off')
  toast('Taken out of Reminders', () => void addToReminders(task))
}

/**
 * The task menu's line: a one-off task only (a repeating one repeats in its own way there). Its words and what it
 * does are read as the menu opens, so a list drawn before the task went to Reminders still says the truth.
 */
export const remindersItem = (task: Task): { label: string; hint?: string; run: () => void } | false =>
  task.status === 'open' && !task.recurrence && {
    get label() { return linked.has(task.id) ? 'Take out of Reminders' : 'Add to Reminders' },
    get hint() { return linked.has(task.id) ? 'It stays here' : 'Your Mac’s Reminders; its tick comes back' },
    run: () => void (linked.has(task.id) ? outOfReminders(task) : addToReminders(task)),
  }

/** Ticks kept in step both ways, from the main window. */
export function useRemindersInStep(): void {
  useEffect(() => {
    let busy = false
    const step = async (): Promise<void> => {
      if (busy || !linked.size) return
      busy = true
      try {
        const states = await window.api.haligtree<{ task: string; completed: boolean }[]>('reminders:state')
        if (states.length < linked.size) await load()
        if (!states.length) return
        const tasks = await haligtree.tasks()
        for (const one of states) {
          const task = tasks.find((each) => each.id === one.task)
          if (!task) continue
          if (one.completed && task.status === 'open') {
            await window.api.haligtree('task:done', task.id)
            chime('done')
            toast(`Ticked in Reminders: ${quoted(splitTags(task.title).text || task.title, 80)} is done`)
          } else if (!one.completed && task.status === 'done') await window.api.haligtree('reminders:tick', task.id, true)
        }
      } finally {
        busy = false
      }
    }
    const timer = window.setInterval(() => void step(), 60_000)
    window.addEventListener('focus', step)
    void step()
    return () => (window.clearInterval(timer), window.removeEventListener('focus', step))
  }, [])
}

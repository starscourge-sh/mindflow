import { CircleArrowUp, CircleCheck, CircleDashed, CircleX } from 'lucide-react'

import { ask, toast } from '@/components/vigil/ui'
import { chime } from '@/lib/sound'
import { lift, type Home } from '@/lib/fly-home'
import type { NoteSuggestion } from '@/extensions/note-link'
import { vigil, type Made } from '@/lib/vigil'

/** The short handle a capture goes by, like Linear's `REE-30`. */
export const captureKey = (number: number): string => `MF-${number}`

export const STATUS_ICON = {
  open: CircleDashed,
  promoted: CircleArrowUp,
  resolved: CircleCheck,
  discarded: CircleX
}

/** The three ways out of a capture, each one key where a card has the focus. */
export const EXITS = [
  // Their colours mean the same everywhere: kept, done, let go.
  { key: 'p', status: 'promoted', label: 'Promote', done: 'Promoted', tint: 'purple', what: 'Keep it as a nugget: it can come back to you, and be tested' },
  { key: 'r', status: 'resolved', label: 'Resolve', done: 'Resolved', tint: 'green', what: 'Done with it: dealt with, or no longer needed' },
  { key: 'd', status: 'discarded', label: 'Discard', done: 'Discarded', tint: 'red', what: 'Let it go: into Discarded, where it can come back' }
] as const

/**
 * Take an exit and say so, with the sound and an undo: the one way every list,
 * card and menu does it, so the same action never answers differently. A
 * resolve or discard can be taken back; a promotion has made a nugget, which
 * stays.
 */
export async function exit(id: string, status: string, onUndo?: () => void): Promise<void> {
  const one = EXITS.find((e) => e.status === status)
  const result = status === 'promoted' ? await flying(id, 'nugget', () => takeExit(id, status)) : await takeExit(id, status)
  if (result === 'cancelled' || !one) return
  // After the work, so a cancelled question or a refusal makes no false promise.
  chime(status === 'discarded' ? 'away' : status === 'promoted' ? 'promote' : 'resolve')
  toast(one.done, status === 'promoted' ? undefined : () => void window.api.captures.save(id, { status: 'open' }).then(() => onUndo?.()))
}

/**
 * Do something that sends a capture somewhere, and show it going there: the
 * picture is taken first, while the capture is still on screen, and flies
 * once the work is done. A cancelled step flies nowhere.
 */
export async function flying<T>(id: string, home: Home, work: () => Promise<T>): Promise<T> {
  const land = lift(id, home)
  const result = await work()
  if (result !== 'cancelled' && result !== 'needs-source' && result !== null) land?.()
  return result
}

/** A capture made into a task, flown into Tasks. */
export const toTask = (id: string): Promise<Made | null> => flying(id, 'task', () => vigil.toTask(id))

/** Take one. Promote makes a nugget as well; the other two only mark the capture. */
export async function takeExit(id: string, status: string): Promise<unknown> {
  if (status !== 'promoted') return window.api.captures.save(id, { status })
  let result = await vigil.promote(id)
  // A quote needs who said it: asked here, so the prompt is never a dead end.
  if (result === 'needs-source') {
    const who = await ask('Who said it? A quote is kept with its source.', 'e.g. Alan Kay, or a colleague in standup')
    if (!who) return 'cancelled'
    await vigil.setCapture(id, 'attribution', who)
    result = await vigil.promote(id)
  }
  if (result !== 'needs-words') return result
  // A quote is kept with a line of yours beside it, or not at all.
  const words = await ask('A quote keeps a line in your own words. What does it say to you?', 'Why it is worth keeping…')
  return words ? vigil.promote(id, words) : 'cancelled'
}

/** What `@` offers in any editor that can link captures. */
export async function findCaptures(query: string): Promise<NoteSuggestion[]> {
  const [captures, items] = await Promise.all([window.api.captures.search(query), vigil.findItems(query)])
  return [...captures.map((capture) => {
    const Icon = STATUS_ICON[capture.status as keyof typeof STATUS_ICON] ?? CircleDashed
    return {
      id: capture.id,
      label: capture.label || 'Untitled',
      key: captureKey(capture.number),
      icon: <Icon className="size-4 shrink-0 text-muted-foreground" />,
      group: 'Captures'
    }
  }),
  // A nugget's or article's link carries its tier, so a click knows where to go.
  ...items.map((item) => ({
    id: `${item.tier}:${item.id}`,
    label: item.title || 'Untitled',
    key: item.tier === 'article' ? 'Article' : 'Nugget',
    group: 'Nuggets and articles'
  }))]
}

/** Follow an @ link: a capture's id alone, or `nugget:` / `article:` and an id. */
export const follow = (link: string, open: (type: string, id: string) => void): void => {
  const [type, id] = link.includes(':') ? link.split(':') : ['capture', link]
  open(type, id)
}

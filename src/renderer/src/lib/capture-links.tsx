import { CircleArrowUp, CircleCheck, CircleDashed, CircleX } from 'lucide-react'

import { ask, askQuestion, refuse, toast } from '@/components/vigil/ui'
import { chime } from '@/lib/sound'
import { lift, type Home } from '@/lib/fly-home'
import { showHeading, type NoteSuggestion } from '@/extensions/note-link'
import { headingsIn } from '@/components/toc/headings'
import type { JSONContent } from '@tiptap/core'
import { vigil } from '@/lib/vigil'
import type { SaveResult } from '../../../main/captures'

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
  { key: 'd', status: 'discarded', label: 'Discard', done: 'Discarded', tint: 'red', what: 'Let it go: into Discarded, where it can come back' },
  // Not a status of its own: the capture is kept, inside a new question. H for
  // hold: Q is already the promote toast's "Add a question" for review.
  { key: 'h', status: 'question', label: 'Hold as a question', done: 'Kept in a question', tint: 'gray', what: 'You keep circling this and cannot say what it is yet: hold it open as a question, and its words become the first clue' }
] as const

/**
 * Take an exit and say so, with the sound and an undo: the one way every list,
 * card and menu does it, so the same action never answers differently. A
 * resolve or discard can be taken back; a promotion has made a nugget, which
 * stays.
 */
export async function exit(id: string, status: string, onUndo?: () => void): Promise<void> {
  const one = EXITS.find((e) => e.status === status)
  // Held as a question: one made from it, taken back by the undo.
  if (status === 'question') {
    const question = await flying(id, 'question', () => vigil.newQuestion('', id))
    if (!question) return refuse(NOT_OPEN)
    chime('hold')
    return toast('Kept in a question: it is in Holding', () => void vigil.dropQuestion(question).then(() => onUndo?.()), 'success', { label: 'Open', key: 'O', run: () => window.api.openInHome('question', question) })
  }
  const result = status === 'promoted' ? await flying(id, 'nugget', () => takeExit(id, status)) : await takeExit(id, status)
  if (result === 'cancelled' || !one) return
  // Only a capture still in the inbox takes an exit: one already promoted,
  // resolved or let go keeps the one it took.
  if (result === 'not-open' || (result as SaveResult | null)?.refused) return refuse(NOT_OPEN)
  // After the work, so a cancelled question or a refusal makes no false promise.
  chime(status === 'discarded' ? 'away' : status === 'promoted' ? 'promote' : 'resolve')
  // Kept as a nugget: the question review will test it with is one key away.
  // Kept, and it can be taken back like the other exits: the nugget goes, the capture is open again.
  if (status === 'promoted') return toast(one.done, typeof result === 'string' ? () => void unpromote(id, result).then(() => onUndo?.()) : undefined, 'success', typeof result === 'string' ? { label: 'Add a question', key: 'Q', run: () => void askQuestion(result) } : undefined)
  // Back to exactly the status it had: always open, as exits are taken from there.
  const was = ((result as SaveResult | null)?.was ?? 'open') as 'open'
  toast(one.done, () => void window.api.captures.save(id, { status: was }).then(() => onUndo?.()))
}

/** Said when an exit is asked of a capture that already took one. */
export const NOT_OPEN = 'That capture already took an exit. Put it back in the inbox first'

// Captures whose source was asked for while promoting: they had none before,
// and an undone promotion leaves them with none again.
const askedWho = new Set<string>()

/** A promotion taken back: the nugget goes, and a source asked for while promoting goes with it. */
export const unpromote = (id: string, nugget: string): Promise<boolean> => {
  const forget = askedWho.delete(id)
  return vigil.unpromote(id, nugget, forget)
}

/**
 * Do something that sends a capture somewhere, and show it going there: the
 * picture is taken first, while the capture is still on screen, and flies
 * once the work is done. A cancelled step flies nowhere.
 */
export async function flying<T>(id: string, home: Home, work: () => Promise<T>): Promise<T> {
  const land = lift(id, home)
  const result = await work()
  if (result !== 'cancelled' && result !== 'needs-source' && result !== 'not-open' && result !== null && !(result as SaveResult)?.refused) land?.()
  return result
}

/** Take one. Promote makes a nugget as well; the other two only mark the capture. */
export async function takeExit(id: string, status: string): Promise<unknown> {
  if (status !== 'promoted') return window.api.captures.save(id, { status })
  askedWho.delete(id)
  let result = await vigil.promote(id)
  // A quote needs who said it: asked here, so the prompt is never a dead end.
  if (result === 'needs-source') {
    // A name already in the words ("…" - Alan Kay, or Alan Kay: "…") is the
    // suggested answer, there to accept or change, never kept unasked.
    const title = (await window.api.captures.get(id))?.label ?? ''
    const guess = /["”']\s*[-—–]\s*([^"“”]{2,60})$/.exec(title)?.[1]?.trim() ?? /^([^:"“]{2,40}):/.exec(title)?.[1]?.trim() ?? ''
    const who = await ask('Who said it? A quote is kept with its source.', 'e.g. Alan Kay, or a colleague in standup', 'attribution', guess)
    if (!who) return 'cancelled'
    await vigil.setCapture(id, 'attribution', who)
    askedWho.add(id)
    result = await vigil.promote(id)
  }
  // A word is tested on its meaning: asked for here, so its card can be answered.
  if (result === 'needs-meaning') {
    const meaning = await ask(`What does "${(await window.api.captures.get(id))?.label ?? 'it'}" mean?`, 'Its meaning, in a line')
    return meaning ? vigil.promote(id, meaning) : 'cancelled'
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
    key: item.tier === 'article' ? 'Article' : item.tier === 'question' ? 'Question' : 'Nugget',
    group: 'Nuggets and articles'
  }))]
}

/** The headings in what an @ link points at, for `@Note#` to offer. */
export async function findHeadings(link: string): Promise<string[]> {
  const [type, id] = link.includes(':') ? link.split(':') : ['capture', link]
  const body = type === 'capture' ? (await window.api.captures.get(id))?.body : (await vigil.item(id))?.body
  return headingsIn(body as JSONContent | string | null)
}

/**
 * Follow an @ link: a capture's id alone, or `nugget:` / `article:` and an id.
 * A link to a heading lands on it, in the note already open if it is.
 */
export const follow = (link: string, open: (type: string, id: string) => void, heading?: string): void => {
  const [type, id] = link.includes(':') ? link.split(':') : ['capture', link]
  open(type, id)
  if (heading) headingIn(type, id, heading)
}

/** Land on a heading in a note just opened, by the editor id every view gives it. */
export const headingIn = (type: string, id: string, heading: string): void =>
  showHeading(`${type === 'capture' || type === 'task' ? type : 'item'}-${id}`, heading)

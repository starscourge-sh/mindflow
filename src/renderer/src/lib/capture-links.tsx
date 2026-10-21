import { seeTheBin } from './to-bin'
import { CircleArrowUp, CircleCheck, CircleDashed, CircleX, FileText, Flag, Gem, Hash, ListChecks, Orbit, UserRound } from 'lucide-react'

import { Avatar } from '@/components/vigil/avatar'
import { ask, askQuestion, refuse, toast } from '@/components/vigil/ui'
import { chime, tear } from '@/lib/sound'
import { lift, shred, type Home } from '@/lib/fly-home'
import { readTags, setLinkKinds, showHeading, type LinkKind, type NoteSuggestion } from '@/extensions/note-link'
import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import { openApart } from '@/lib/apart'
import { headingsIn } from '@/components/toc/headings'
import { linesIn } from '../../../main/blocks'
import type { JSONContent } from '@tiptap/core'
import { vigil } from '@/lib/vigil'
import { TagIcon } from '@/components/vigil/tag-icon'
import type { SaveResult } from '../../../main/captures'
import { clip, cut, quoted } from '../../../main/clip'
import { dayKey } from '../../../main/dates'

/**
 * Whether to offer writing a recall question or card for something: only on
 * the day it was captured, while it is fresh. After that day it is never
 * asked again; it can still be given one by hand.
 */
export const recallOffered = (capturedAt: string | null | undefined, now = new Date()): boolean => !!capturedAt && dayKey(new Date(capturedAt)) === dayKey(now)

/** The short handle a capture goes by, like Linear's `REE-30`. */
// V for Vigil. Notes from before keep their number; an old `MF-30` still finds `V-30`.
export const captureKey = (number: number): string => `V-${number}`

/** A link to a note that any note reads as one when it is pasted in: `[[@id|its words]]`. */
export const noteLinkText = (id: string, words: string): string => `[[@${id}|${cut((words || 'Untitled').replace(/[[\]|\n]+/g, ' ').trim(), 80)}]]`

export const STATUS_ICON = {
  open: CircleDashed,
  promoted: CircleArrowUp,
  resolved: CircleCheck,
  discarded: CircleX
}

/**
 * A capture's status as a person says it: the code's “promoted” is saved as a
 * gem, unless it went into a question (`keptIn`, from the list), which is said
 * instead, so the row never claims a gem that is not there.
 */
export const statusSaid = (status: string, keptIn?: string | null): string => {
  if (status === 'promoted' && keptIn) {
    const at = keptIn.indexOf(':')
    const name = keptIn.slice(at + 1).trim()
    const short = clip(name, 40)
    return keptIn.startsWith('question:') ? 'Made into a question' : short ? `A clue in “${short}”` : 'A clue in a question'
  }
  return ({ open: 'Open', promoted: 'Saved as a gem', resolved: 'Resolved', discarded: 'In the Bin' } as Record<string, string>)[status] ?? status
}

/** What a kind of thing is called on screen: the code's nugget is a gem; one article is an Article (the page of them is Writing). */
export const typeSaid = (type: string): string =>
  ({ capture: 'Capture', nugget: 'Gem', article: 'Article', question: 'Question', goal: 'Goal', task: 'Task', card: 'Card', event: 'Event' } as Record<string, string>)[type] ?? type

/** The three ways out of a capture, each one key where a card has the focus. */
export const EXITS = [
  // Their colours mean the same everywhere: kept, done, let go.
  { key: 'p', status: 'promoted', label: 'Save as a gem', done: 'Saved as a gem', tint: 'purple', what: 'Save it as a gem: it can come back to you, and be tested' },
  { key: 'r', status: 'resolved', label: 'Resolve', done: 'Resolved', tint: 'green', what: 'Done with it: out of the Inbox, still in Everything' },
  { key: 'd', status: 'discarded', label: 'Move to the Bin', done: 'Moved to the Bin', tint: 'red', what: 'Into the Bin, where it can come back' },
  // Not a status of its own: the capture is kept, inside a new question. H for
  // hold: Q is already the promote toast's "Add a question" for review.
  { key: 'h', status: 'question', label: 'Make it a question', done: 'Now a question', tint: 'gray', what: 'You keep circling this and cannot say what it is yet: it becomes a new question, and its words the first clue' }
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
    return toast('Now a question: it is in Questions', () => void vigil.dropQuestion(question).then(() => onUndo?.()), 'success', { label: 'Open', key: 'O', run: () => window.api.openInHome('question', question) })
  }
  const result = status === 'promoted' ? await flying(id, 'nugget', () => takeExit(id, status)) : status === 'discarded' ? await flying(id, 'away', () => takeExit(id, status)) : await takeExit(id, status)
  if (result === 'cancelled' || !one) return
  // Only a capture still in the inbox takes an exit: one already promoted,
  // resolved or let go keeps the one it took.
  if (result === 'not-open' || (result as SaveResult | null)?.refused) return refuse(NOT_OPEN)
  // After the work, so a cancelled question or a refusal makes no false promise.
  // Let go: paper tearing, as it goes through the shredder.
  if (status === 'discarded') tear()
  else chime(status === 'promoted' ? 'promote' : 'resolve')
  // Kept as a nugget: the question review will test it with is one key away.
  // Kept, and it can be taken back like the other exits: the nugget goes, the capture is open again.
  const fresh = status === 'promoted' && recallOffered((await window.api.captures.get(id))?.capturedAt)
  if (status === 'promoted') return toast(one.done, typeof result === 'string' ? () => void unpromote(id, result).then(() => onUndo?.()) : undefined, 'success', typeof result === 'string' && fresh ? { label: 'Add a question', key: 'Q', run: () => void askQuestion(result) } : undefined)
  // Back to exactly the status it had: always open, as exits are taken from there.
  const was = ((result as SaveResult | null)?.was ?? 'open') as 'open'
  toast(one.done, () => void window.api.captures.save(id, { status: was }).then(() => onUndo?.()), 'success', status === 'discarded' ? seeTheBin : undefined)
}

/** Said when an exit is asked of a capture that already took one. */
export const NOT_OPEN = 'That capture was already dealt with. Put it back in the Inbox first'

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
export async function flying<T>(id: string, home: Home | 'away', work: () => Promise<T>): Promise<T> {
  // Discarded: no home to fly to, it goes through the shredder.
  const land = home === 'away' ? shred(id) : lift(id, home)
  const result = await work()
  if (result !== 'cancelled' && result !== 'needs-source' && result !== 'not-open' && result !== null && !(result as SaveResult)?.refused && !(result as { mixed?: string })?.mixed) land?.()
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
    const meaning = await ask(`What does ${quoted((await window.api.captures.get(id))?.label ?? 'it', 60)} mean?`, 'Its meaning, in a line')
    return meaning ? vigil.promote(id, meaning) : 'cancelled'
  }
  if (result !== 'needs-words') return result
  // A quote is kept with a line of yours beside it, or not at all.
  const words = await ask('A quote keeps a line in your own words. What does it say to you?', 'Why it is worth keeping…')
  return words ? vigil.promote(id, words) : 'cancelled'
}

/**
 * Everything an @ link can point at, in the order the menu groups them: a
 * capture by its kind, then ideas, writing, questions, goals, tasks, the
 * people your quotes are from, and tags. Colours and icons are the ones the
 * sidebar and the kind picker already use, so a link looks like where it goes.
 */
let kinds: Record<string, LinkKind & { group: string }> | null = null
// Made when first asked for, not as this file loads: the kind picker it reads may not have loaded yet.
export const linkKinds = (): Record<string, LinkKind & { group: string }> => (kinds ??= {
  ...Object.fromEntries(CAPTURE_TYPES.map((type) => [type.id, { label: type.label, group: `${type.label}s`, icon: type.icon, color: /text-(\w+)/.exec(type.tint)?.[1] ?? 'gray' }])),
  idea: { label: 'Gem', group: 'Gems', icon: Gem, color: 'pink' },
  article: { label: 'Writing', group: 'Writing', icon: FileText, color: 'brown' },
  question: { label: 'Question', group: 'Questions', icon: Orbit, color: 'gray' },
  goal: { label: 'Goal', group: 'Goals', icon: Flag, color: 'orange' },
  task: { label: 'Task', group: 'Tasks', icon: ListChecks, color: 'green' },
  person: { label: 'Person', group: 'People', icon: UserRound, color: 'blue' },
  tag: { label: 'Tag', group: 'Tags', icon: Hash, color: 'gray' }
})

/** A row of the menu: its kind's icon, in its kind's colour. */
const row = (kind: string, one: Omit<NoteSuggestion, 'kind' | 'icon' | 'group'>): NoteSuggestion => {
  const look = linkKinds()[kind] ?? linkKinds().note
  return { ...one, kind, group: look.group, icon: <look.icon className="size-4 shrink-0" style={{ color: `var(--tt-color-text-${look.color})` }} /> }
}

setLinkKinds({
  kinds: linkKinds,
  // Links made before links kept their kind: a bare id is a capture, all of a note's asked about at once.
  find: (ids) => window.api.vigil<Record<string, string>>('notes:kinds', ids.filter((id) => !id.includes(':'))),
  // A new window of its own, for the notes that can have one.
  aside: (link) => {
    const [type, id] = link.includes(':') ? link.split(':') : ['capture', link]
    if (['task', 'person', 'tag'].includes(type)) return false
    openApart(type, id)
    return true
  },
  // The lines of a note a link can land on, and one given its lasting name (block-ids.ts).
  lines: async (link) => linesIn(await bodyOf(link)),
  anchor: (link, index, text) => window.api.vigil<string | null>('notes:anchor', link, index, text)
})

/** What a link points at, as stored: a capture's body, or a gem's, an article's or a question's. */
export async function bodyOf(link: string): Promise<unknown> {
  const [type, id] = link.includes(':') ? [link.slice(0, link.indexOf(':')), link.slice(link.indexOf(':') + 1)] : ['capture', link]
  return type === 'capture' ? (await window.api.captures.get(id))?.body : (await vigil.item(id))?.body
}

/**
 * A note renamed: the main process wrote every link to it again, once the new
 * name rested (renames.ts). Said once, here, with one Undo that puts the links
 * back as they were. Once per window, wherever this file is loaded.
 */
if (typeof window !== 'undefined' && !(window as { linksRenamedHeard?: boolean }).linksRenamedHeard) {
  ;(window as { linksRenamedHeard?: boolean }).linksRenamedHeard = true
  window.addEventListener('vigil:links-renamed', (event) => {
    const { token, count, to } = (event as CustomEvent<{ token: string; count: number; from: string; to: string }>).detail
    chime('settled')
    toast(`${count === 1 ? 'The link' : `${count} links`} to it now ${count === 1 ? 'says' : 'say'} ${quoted(to, 60)}`, () =>
      void window.api.vigil<number>('links:rename:undo', token).then((back) => chime(back ? 'back' : 'nope')))
  })
}

/** What `@` offers in any editor that can link captures. */
export async function findCaptures(query: string): Promise<NoteSuggestion[]> {
  const words = query.trim().toLowerCase()
  const [captures, items, tasks, people, tags] = await Promise.all([
    window.api.captures.search(query),
    vigil.findItems(query),
    vigil.tasks().catch(() => []),
    // Names and tags only once something is typed: the open menu stays short.
    words ? vigil.values('attribution').catch(() => []) : [],
    words ? readTags().catch(() => []) : []
  ])
  const rows = [
    ...captures.map((capture) => row(capture.kind in linkKinds() ? capture.kind : 'note', { id: capture.id, label: capture.label || 'Untitled', key: captureKey(capture.number) })),
    // A nugget's or article's link carries its tier, so a click knows where to go.
    ...items.map((item) => row(item.tier === 'nugget' ? 'idea' : item.tier, { id: `${item.tier}:${item.id}`, label: item.title || 'Untitled' })),
    // Open ones first, as the list already has them.
    ...tasks.filter((task) => task.title.toLowerCase().includes(words)).slice(0, 4)
      .map((task) => row('task', { id: `task:${task.id}`, label: task.title || 'Untitled', key: `T-${task.number}` })),
    // Who your quotes are from: a link opens every note by them.
    ...people.filter((name) => name.toLowerCase().includes(words)).slice(0, 3).map((name) => ({ ...row('person', { id: `person:${name}`, label: name }), icon: <Avatar name={name} size={16} /> })),
    ...tags.filter(({ tag }) => tag.includes(words.replace(/^#/, ''))).slice(0, 3).map(({ tag, color }) => ({ ...row('tag', { id: `tag:${tag}`, label: `#${tag}` }), icon: <TagIcon tag={tag} color={color} /> }))
  ]
  const order = Object.keys(linkKinds())
  return rows.sort((a, b) => order.indexOf(a.kind!) - order.indexOf(b.kind!))
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
  const [type, id] = link.includes(':') ? [link.slice(0, link.indexOf(':')), link.slice(link.indexOf(':') + 1)] : ['capture', link]
  // A person or a tag is a place in the main window, not a note: its tag page, or a search for their name.
  if (type === 'person' || type === 'tag') return window.api.openInHome(type, id)
  open(type, id)
  if (heading) headingIn(type, id, heading)
}

/** Land on a heading in a note just opened, by the editor id every view gives it. */
export const headingIn = (type: string, id: string, heading: string): void =>
  showHeading(`${type === 'capture' || type === 'task' || type === 'day' ? type : 'item'}-${id}`, heading)

import { seeTheBin } from './to-bin'
import { via } from './usage'
import { BookOpen, CalendarDays, CircleArrowUp, CircleCheck, CircleDashed, CircleX, FileText, Flag, Gem, Hash, ListChecks, Orbit, UserRound, Sun } from 'lucide-react'

import { Avatar } from '@/components/haligtree/avatar'
import { ask, askQuestion, refuse, toast } from '@/components/haligtree/ui'
import { chime, tear } from '@/lib/sound'
import { lift, shred, type Home } from '@/lib/fly-home'
import { readTags, setLinkKinds, showHeading, type LinkKind, type NoteSuggestion } from '@/extensions/note-link'
import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import { openApart } from '@/lib/apart'
import { canSplit, openAside, openNewTab, takeClick } from '@/lib/split'
import { headingsIn } from '@/components/toc/headings'
import { linesIn } from '../../../main/blocks'
import type { JSONContent } from '@tiptap/core'
import { haligtree, shownName } from '@/lib/haligtree'
import { UNATTRIBUTED } from '@/lib/sources'
import { TagIcon } from '@/components/haligtree/tag-icon'
import type { SaveResult } from '../../../main/captures'
import { clip, cut, quoted } from '../../../main/clip'
import { ago, dayKey, num } from '../../../main/dates'
import { NOTE_KEY } from '../../../main/name'
import { forgives } from '@/lib/slash-rank'
import { ICE, KIND_ICON, kindOf } from '@/lib/goal-kind'

/**
 * Whether to offer writing a recall question or card for something: only on
 * the day it was captured, while it is fresh. After that day it is never
 * asked again; it can still be given one by hand.
 */
export const recallOffered = (capturedAt: string | null | undefined, now = new Date()): boolean => !!capturedAt && dayKey(new Date(capturedAt)) === dayKey(now)

/** The short handle a capture goes by, like Linear's `REE-30`. */
// H for Haligtree (main/name.ts). Notes from before keep their number; an old `V-30` or `MF-30` still finds `H-30`.
export const captureKey = (number: number): string => `${NOTE_KEY}-${number}`

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

/** What a kind of thing is called on screen: the code's nugget is a gem; one article is a Page (the list of them is Writing). */
export const typeSaid = (type: string): string =>
  ({ capture: 'Capture', nugget: 'Gem', article: 'Page', question: 'Question', goal: 'Goal', task: 'Task', card: 'Card', event: 'Event', day: 'Journal', pdf: 'PDF' } as Record<string, string>)[type] ?? type

/** The three ways out of a capture, each one key where a card has the focus. */
export const EXITS = [
  // Their colours mean the same everywhere: kept, done, let go.
  { key: 'p', status: 'promoted', label: 'Save as a gem', done: 'Saved as a gem', tint: 'purple', what: 'Save it as a gem: it can come back to you, and be tested' },
  { key: 'r', status: 'resolved', label: 'Resolve', done: 'Resolved', tint: 'green', what: 'Done with it: out of the Inbox, still there with “Show sorted too”' },
  { key: 'd', status: 'discarded', label: 'Move to the Bin', done: 'Moved to the Bin', tint: 'red', what: 'Into the Bin, where it can come back' },
  // Not a status of its own: the capture is kept, inside a new question. H for
  // hold: Q is already the promote toast's "Add a question" for review.
  { key: 'h', status: 'question', label: 'Start an open question from this', done: 'Now a question', tint: 'gray', what: 'You keep circling this and cannot say what it is yet: it becomes a new question, and its words the first clue' }
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
    const question = await flying(id, 'question', () => haligtree.newQuestion('', id))
    if (!question) return refuse(NOT_OPEN)
    chime('hold')
    return toast('Now a question: it is in Questions, under Writing', () => void haligtree.dropQuestion(question).then(() => onUndo?.()), 'success', { label: 'Open', key: 'O', run: () => window.api.openInHome('question', question) })
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
  return haligtree.unpromote(id, nugget, forget)
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
  let result = await haligtree.promote(id)
  // A quote needs who said it: asked here, so the prompt is never a dead end.
  if (result === 'needs-source') {
    // A name already in the words ("…" - Alan Kay, or Alan Kay: "…") is the
    // suggested answer, there to accept or change, never kept unasked.
    const title = (await window.api.captures.get(id))?.label ?? ''
    const guess = /["”']\s*[-—–]\s*([^"“”]{2,60})$/.exec(title)?.[1]?.trim() ?? /^([^:"“]{2,40}):/.exec(title)?.[1]?.trim() ?? ''
    // Not known: "Unattributed" is its source, said once, never asked again.
    // Never a quote at all: a note again (with Undo), and nothing is promoted.
    let notQuote = false
    const said = await ask('Who said it? A quote is kept with its source.', 'e.g. Alan Kay, or a colleague in standup', { field: 'attribution', initial: guess, skip: UNATTRIBUTED, instead: { label: 'Not a quote', run: () => (notQuote = true) }, action: 'Keep the quote' })
    if (notQuote) {
      const was = await window.api.haligtree<{ kind: string; fields: string | null } | null>('notes:kind', 'captures', id, 'note')
      if (was) (chime('retag'), toast('Not a quote: kept as a note of yours', () => void window.api.haligtree('notes:kind:undo', 'captures', id, was)))
      return 'cancelled'
    }
    if (said === null) return 'cancelled'
    const who = said || UNATTRIBUTED
    await haligtree.setCapture(id, 'attribution', who)
    askedWho.add(id)
    result = await haligtree.promote(id)
  }
  // A word is tested on its meaning: asked for here, so its card can be answered.
  if (result === 'needs-meaning') {
    const meaning = await ask(`What does ${quoted((await window.api.captures.get(id))?.label ?? 'it', 60)} mean?`, 'Its meaning, in a line', { action: 'Keep the meaning' })
    return meaning ? haligtree.promote(id, meaning) : 'cancelled'
  }
  if (result !== 'needs-words') return result
  // A line of yours beside the quote, asked for and never forced: Enter on nothing, or Skip, keeps it without one.
  const words = await ask('A line in your own words, beside it. What does it say to you?', 'Why it is worth keeping…', { skip: 'Keep it without', action: 'Keep it with this' })
  return words === null ? 'cancelled' : haligtree.promote(id, words, !words)
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
  ...Object.fromEntries(CAPTURE_TYPES.map((type) => [type.id, { label: type.label, group: type.many, icon: type.icon, color: /text-(\w+)/.exec(type.tint)?.[1] ?? 'gray' }])),
  idea: { label: 'Gem', group: 'Gems', icon: Gem, color: 'pink' },
  article: { label: 'Writing', group: 'Writing', icon: FileText, color: 'brown' },
  question: { label: 'Question', group: 'Questions', icon: Orbit, color: 'gray' },
  goal: { label: 'Goal', group: 'Goals', icon: Flag, color: 'orange' },
  task: { label: 'Task', group: 'Tasks', icon: ListChecks, color: 'green' },
  event: { label: 'Event', group: 'Events', icon: CalendarDays, color: 'blue' },
  day: { label: 'Day', group: 'Journal', icon: Sun, color: 'orange' },
  // Read in the reader, never edited: a link opens it there, on the page you left.
  pdf: { label: 'PDF', group: 'PDFs', icon: FileText, color: 'red' },
  web: { label: 'Web article', group: 'Web articles', icon: BookOpen, color: 'blue' },
  person: { label: 'Person', group: 'People', icon: UserRound, color: 'blue' },
  tag: { label: 'Tag', group: 'Tags', icon: Hash, color: 'gray' }
})

/** "edited today", "edited 3 days ago": what a note list says to choose by. */
const edited = (at: string | null | undefined): string | undefined => (at ? `edited ${ago(at)}` : undefined)

/** A goal's row wears its own kind's mark: the someday telescope, or the snowflake on ice. */
const goalMarked = (item: { tier: string; goalAt?: string | null; closedHow?: string | null }, one: NoteSuggestion): NoteSuggestion => {
  if ((item.tier as string) !== 'goal' || kindOf(item) === 'dated') return one
  const Mark = KIND_ICON[kindOf(item)]
  return { ...one, icon: <Mark data-goal-mark={kindOf(item)} className="size-4 shrink-0" style={{ color: kindOf(item) === 'iced' ? ICE : `var(--tt-color-text-${linkKinds().goal.color})` }} /> }
}

/** A row of the menu: its kind's icon, in its kind's colour. */
const row = (kind: string, one: Omit<NoteSuggestion, 'kind' | 'icon' | 'group'>): NoteSuggestion => {
  const look = linkKinds()[kind] ?? linkKinds().note
  return { ...one, kind, group: look.group, icon: <look.icon className="size-4 shrink-0" style={{ color: `var(--tt-color-text-${look.color})` }} /> }
}

setLinkKinds({
  kinds: linkKinds,
  // Links made before links kept their kind: a bare id is a capture, all of a note's asked about at once.
  find: (ids) => window.api.haligtree<Record<string, string>>('notes:kinds', ids.filter((id) => !id.includes(':'))),
  // ⌘-click: outside the main window, a new window of its own, for the notes that can have one. In it, a new tab.
  aside: (link) => {
    if (canSplit()) return false
    const [type, id] = link.includes(':') ? [link.slice(0, link.indexOf(':')), link.slice(link.indexOf(':') + 1)] : ['capture', link]
    if (['task', 'person', 'tag', 'event', 'day', 'pdf', 'web'].includes(type)) return false
    openApart(type, id)
    return true
  },
  // The lines of a note a link can land on, and one given its lasting name (block-ids.ts).
  lines: async (link) => linesIn(await bodyOf(link)),
  anchor: (link, index, text) => window.api.haligtree<string | null>('notes:anchor', link, index, text)
})

/** What a link points at, as stored: a capture's body, or a gem's, an article's or a question's. */
async function bodyOf(link: string): Promise<unknown> {
  if (/^(pdf|web):/.test(link)) return null
  const [type, id] = link.includes(':') ? [link.slice(0, link.indexOf(':')), link.slice(link.indexOf(':') + 1)] : ['capture', link]
  return type === 'capture' ? (await window.api.captures.get(id))?.body : (await haligtree.item(id))?.body
}

/**
 * A note renamed: the main process wrote every link to it again, once the new
 * name rested (renames.ts). Said once, here, with one Undo that puts the links
 * back as they were. Once per window, wherever this file is loaded.
 */
if (typeof window !== 'undefined' && !(window as { linksRenamedHeard?: boolean }).linksRenamedHeard) {
  ;(window as { linksRenamedHeard?: boolean }).linksRenamedHeard = true
  window.addEventListener('haligtree:links-renamed', (event) => {
    const { token, count, to } = (event as CustomEvent<{ token: string; count: number; from: string; to: string }>).detail
    chime('settled')
    toast(`${count === 1 ? 'The link' : `${num(count)} links`} to it now ${count === 1 ? 'says' : 'say'} ${quoted(to, 60)}`, () =>
      void window.api.haligtree<number>('links:rename:undo', token).then((back) => chime(back ? 'back' : 'nope')))
  })
}

/** What `@` offers in any editor that can link captures. */
export async function findCaptures(query: string): Promise<NoteSuggestion[]> {
  const words = query.trim().toLowerCase()
  const [captures, items, tasks, people, tags, files] = await Promise.all([
    window.api.captures.search(query),
    haligtree.findItems(query),
    haligtree.tasks().catch(() => []),
    // Names, tags and files only once something is typed: the open menu stays short.
    words ? haligtree.values('attribution').catch(() => []) : [],
    words ? readTags().catch(() => []) : [],
    words ? window.api.captures.find(query).then((found) => found.filter((one) => one.type === 'pdf' || one.type === 'web')).catch(() => []) : []
  ])
  // Spelt right, nothing: a slip of the keys still finds it ("tolkein", "hamelt"), forgiven as ⌘K and the slash menu
  // forgive one, by name, among every note and page; only then, so a right spelling never lists near ones.
  if (words.length >= 3 && !captures.length && !items.length) {
    const [notes, ...lists] = await Promise.all([window.api.captures.list().catch(() => []), ...(['nugget', 'article', 'question'] as const).map((tier) => haligtree.items(tier).catch(() => []))])
    captures.push(...notes.filter((one) => one.status !== 'discarded' && one.label && forgives(words, one.label)).slice(0, 6))
    items.push(...lists.flat().filter((one) => !one.archivedAt && forgives(words, one.title)).slice(0, 6).map((one) => ({ id: one.id, tier: one.tier as 'nugget' | 'article' | 'question', title: one.title, updatedAt: one.updatedAt ?? undefined })))
  }
  const rows = [
    // A quiet word to choose by: when it was last written in.
    ...captures.map((capture) => row(capture.kind in linkKinds() ? capture.kind : 'note', { id: capture.id, label: shownName(capture.label ?? '') || 'Untitled', key: captureKey(capture.number), hint: edited(capture.editedAt ?? capture.capturedAt) })),
    // A nugget's or article's link carries its tier, so a click knows where to go.
    ...items.map((item) => goalMarked(item, row(item.tier === 'nugget' ? 'idea' : item.tier, { id: `${item.tier}:${item.id}`, label: shownName(item.title ?? '') || 'Untitled', hint: edited(item.updatedAt) }))),
    // Open ones first, as the list already has them.
    ...tasks.filter((task) => task.title.toLowerCase().includes(words)).slice(0, 4)
      .map((task) => row('task', { id: `task:${task.id}`, label: shownName(task.title ?? '') || 'Untitled', key: `T-${task.number}` })),
    // A PDF by its address alone (search's id adds the name it came under after a bar, which a link cannot hold); an article by its link.
    ...files.slice(0, 4).map((file) => row(file.type, { id: `${file.type}:${file.type === 'pdf' ? file.id.split('|')[0] : file.id}`, label: file.label || 'Untitled' })),
    // Who your quotes are from: a link opens every note by them.
    ...people.filter((name) => name.toLowerCase().includes(words)).slice(0, 3).map((name) => ({ ...row('person', { id: `person:${name}`, label: name }), icon: <Avatar name={name} size={16} /> })),
    ...tags.filter(({ tag }) => tag.includes(words.replace(/^#/, ''))).slice(0, 3).map(({ tag, color }) => ({ ...row('tag', { id: `tag:${tag}`, label: `#${tag}` }), icon: <TagIcon tag={tag} color={color} /> }))
  ]
  const order = Object.keys(linkKinds())
  // Within a kind, a name that starts with what was typed, then one with a word that does, then the rest ("ray": "raycast notes" before "Copy, paste, pray").
  const fit = (label: string): number => {
    const name = label.toLowerCase().replace(/^#/, '')
    return !words || name.startsWith(words) ? 0 : name.split(/[^\p{L}\p{N}]+/u).some((one) => one.startsWith(words)) ? 1 : 2
  }
  return rows.sort((a, b) => order.indexOf(a.kind!) - order.indexOf(b.kind!) || fit(a.label) - fit(b.label))
}

/** The headings in what an @ link points at, for `@Note#` to offer. */
export async function findHeadings(link: string): Promise<string[]> {
  // A PDF or a kept article has no headings a link can land on.
  if (/^(pdf|web):/.test(link)) return []
  const [type, id] = link.includes(':') ? link.split(':') : ['capture', link]
  const body = type === 'capture' ? (await window.api.captures.get(id))?.body : (await haligtree.item(id))?.body
  return headingsIn(body as JSONContent | string | null)
}

/**
 * Follow an @ link: a capture's id alone, or `nugget:` / `article:` and an id.
 * A link to a heading lands on it, in the note already open if it is.
 */
export const follow = (link: string, open: (type: string, id: string) => void, heading?: string): void => {
  // Found by a link, for the usage counts.
  via('link')
  const [type, id] = link.includes(':') ? [link.slice(0, link.indexOf(':')), link.slice(link.indexOf(':') + 1)] : ['capture', link]
  // ⌥-clicked: to the side. ⌘-clicked: a new tab, as everywhere. Read now, from the click, before a capture's lookup waits.
  const how = canSplit() && type !== 'person' ? takeClick() : null
  const side = how === 'aside'
  const go = side ? openAside : how === 'tab' ? openNewTab : open
  // A person or a tag is a place in the main window, not a note: its tag page, or a search for their name.
  // A PDF or a kept article opens in the reader there, wherever the link is.
  if (type === 'person' || type === 'tag' || type === 'pdf' || type === 'web') return side ? openAside(type, id) : window.api.openInHome(type, id)
  if (type === 'capture') return void keptAs(id).then((to) => {
    go(to.type, to.id)
    if (heading) headingIn(to.type, to.id, heading)
  })
  go(type, id)
  if (heading) headingIn(type, id, heading)
}

/**
 * Where a link to a capture lands: a capture turned into a page, a gem, a goal
 * or a question is that now, and its link opens what it became, not the old
 * capture filed in the Inbox. Any other capture opens as itself.
 */
const keptAs = async (id: string): Promise<{ type: string; id: string }> => {
  const capture = await window.api.captures.get(id)
  if (capture?.status !== 'promoted') return { type: 'capture', id }
  const { became } = await haligtree.lineage(id)
  const made = became.find((one) => ['article', 'nugget', 'goal', 'question'].includes(one.type))
  return made ? { type: made.type, id: made.id } : { type: 'capture', id }
}

/** Land on a heading in a note just opened, by the editor id every view gives it. */
export const headingIn = (type: string, id: string, heading: string): void =>
  showHeading(`${type === 'capture' || type === 'task' || type === 'day' ? type : 'item'}-${id}`, heading)

import type { CaptureMeta } from '@/components/capture-list'
import type { Item, Stats, Task } from './vigil'
import type { Day, NoteMap } from './notes'

/**
 * What an empty page shows until it has something of yours: the page itself,
 * filled with a few made-up rows, so you can see what it is for before you
 * have used it. Drawn by each page's own rows, dimmed, under an Example label,
 * and never saved: nothing here goes near the database, every id starts with
 * `example:`, and the rows cannot be clicked or reached by the keys.
 *
 * The same voice as the sandbox (lib/sandbox-seed.ts): books, plays and films
 * everyone half knows. Dates are counted from now, so the examples always
 * look current.
 */

/** Every example's id starts with this, so one can never pass for yours. */
export const EXAMPLE = 'example:'
export const isExample = (id: string | null | undefined): boolean => !!id && id.startsWith(EXAMPLE)

/** A moment `days` from now at a time of day, as the database keeps it. */
const at = (days: number, time = '09:00'): string => {
  const [hours, minutes] = time.split(':').map(Number)
  const when = new Date()
  when.setDate(when.getDate() + days)
  when.setHours(hours, minutes, 0, 0)
  return when.toISOString()
}
const minutesAgo = (n: number): string => new Date(Date.now() - n * 60_000).toISOString()
const monthKey = (offset = 0): string => {
  const when = new Date()
  when.setMonth(when.getMonth() + offset, 1)
  return `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}`
}
const dayKey = (days: number): string => at(days).slice(0, 10)

// --- captures

const capture = (n: number, part: Partial<CaptureMeta> & { label: string }): CaptureMeta => ({
  id: `${EXAMPLE}capture-${n}`, number: n, title: '', kind: 'note', status: 'open', source: '', private: 0,
  pinnedAt: null, remindAt: null, capturedAt: minutesAgo(n * 37), editedAt: null, attribution: null, device: null,
  elapsedMs: null, weather: null, medium: null, closedAt: null, archivedAt: null, importedAt: null, ...part
})

/** The Inbox: one of most kinds, the way a first week's catches look. */
export const exampleInbox = (): CaptureMeta[] => [
  capture(7, { kind: 'quote', label: 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.', attribution: 'Jane Austen' }),
  capture(6, { kind: 'todo', label: 'Return Frankenstein to the library by friday' }),
  capture(5, { kind: 'decision', label: 'Read Dune before seeing the film #book' }),
  capture(4, { kind: 'word', label: 'Soliloquy: speaking your thoughts aloud, alone on stage' }),
  capture(3, { kind: 'experiment', label: 'Write 300 words before breakfast, for two weeks' }),
  capture(2, { kind: 'link', label: 'The Folger Shakespeare: Hamlet, Act 3', medium: 'Website' }),
  capture(1, { kind: 'note', label: 'Yoda never explains the Force. Maybe the best teachers show, then stop talking #writing' })
]

/** Discarded: what was let go, still there to bring back. */
export const exampleDiscarded = (): CaptureMeta[] => [
  capture(3, { kind: 'todo', label: 'Buy a quill, like Mary Shelley', status: 'discarded', closedAt: minutesAgo(400) }),
  capture(2, { kind: 'note', label: 'Rename the cat Mr Darcy?', status: 'discarded', closedAt: minutesAgo(900) }),
  capture(1, { kind: 'link', label: 'Ten facts about sandworms', status: 'discarded', closedAt: minutesAgo(2000) })
]

/** Archived: out of sight, never let go. */
export const exampleArchived = (): CaptureMeta[] => [
  capture(2, { kind: 'note', label: 'Reading notes from the Hamlet course, spring term', archivedAt: minutesAgo(3000), status: 'resolved' }),
  capture(1, { kind: 'quote', label: 'To be, or not to be, that is the question', attribution: 'William Shakespeare', archivedAt: minutesAgo(6000), status: 'promoted' })
]

// --- tasks

const task = (n: number, part: Partial<Task> & { title: string }): Task => ({
  id: `${EXAMPLE}task-${n}`, number: n, status: 'open', dueAt: null, allDay: 0, recurrence: null, captureId: null,
  createdAt: minutesAgo(n * 90), completedAt: null, waitingOn: null, estimate: null, sortOrder: null, repeatUntil: null,
  important: 0, deadline: null, deadlineTimed: 0, blocker: null, reschedules: 0, notify: null, priority: 0, planFor: null,
  subtasks: [], ...part
})

/** Enough tasks for every task page to show what it does: each page picks its own out of them. */
export const exampleTasks = (): Task[] => [
  task(1, { title: 'Return Frankenstein to the library', dueAt: at(-1), allDay: 1, priority: 2, important: 1 }),
  task(2, { title: 'Call Mum about Sunday lunch', dueAt: at(0, '18:00'), priority: 3 }),
  task(3, { title: 'Finish chapter 4 of Pride and Prejudice #book', dueAt: at(0), allDay: 1, subtasks: [{ text: 'The ball at Netherfield', done: true }, { text: 'Mr Collins proposes', done: false }, { text: 'Notes', done: false }] }),
  task(4, { title: 'Book seats for Hamlet at the Globe', dueAt: at(2, '12:00'), deadline: at(5), priority: 1, important: 1 }),
  task(5, { title: 'Send the book club the reading list', dueAt: at(3), allDay: 1, estimate: 15 }),
  task(6, { title: 'Learn the Litany Against Fear by heart', priority: 4 }),
  task(7, { title: 'Hear back about the Austen walking tour', waitingOn: 'Bath tourist office' }),
  task(8, { title: 'Water the plants', recurrence: 'every! 3 days', dueAt: at(1), allDay: 1 }),
  task(9, { title: 'Put the bins out', recurrence: 'every monday', dueAt: at(((8 - new Date().getDay()) % 7) || 7, '19:00') }),
  task(10, { title: 'Weekly review', recurrence: 'every friday', dueAt: at(((12 - new Date().getDay()) % 7) || 7), allDay: 1 }),
  task(11, { title: 'Reread Hamlet before the play', planFor: monthKey() }),
  task(12, { title: 'Visit Bath, where Austen lived', planFor: String(new Date().getFullYear()) }),
  task(13, { title: 'Learn enough German to read Goethe', planFor: 'someday' }),
  task(14, { title: 'Write to the publisher about the essay', deadline: at(6), priority: 2, important: 1 })
]

// --- ideas, writing, questions, goals

const item = (n: number, part: Partial<Item> & { tier: Item['tier']; title: string }): Item => ({
  id: `${EXAMPLE}${part.tier}-${n}`, kind: 'note', prompt: null, private: 0, pinnedAt: null, dueAt: null, suspended: 0,
  reviewed: 0, createdAt: minutesAgo(n * 2000), updatedAt: null, captureId: null, remindAt: null, lapses: 0,
  attribution: null, context: null, mode: 'encounter', supersededBy: null, revisions: 0, archivedAt: null, why: null,
  closedAt: null, closedHow: null, clues: 0, goalAt: null, goalFrom: null, beacon: null, lastLog: null, ...part
})

/** Ideas: kept in your own words, each with how it comes back. */
export const exampleIdeas = (): Item[] => [
  item(1, { tier: 'nugget', kind: 'quote', title: 'First impressions are often wrong: the whole of Pride and Prejudice turns on it.', attribution: 'Jane Austen', prompt: 'What does Elizabeth get wrong about Darcy at first?', dueAt: at(2) }),
  item(2, { tier: 'nugget', title: 'Victor never names his creature. Leaving something nameless is a way of refusing to own it.', mode: 'pushed' }),
  item(3, { tier: 'nugget', kind: 'word', title: 'Soliloquy: a speech made alone, so we hear what a character really thinks.', prompt: 'What is a soliloquy?', dueAt: at(0) }),
  item(4, { tier: 'nugget', title: 'Fear is the mind-killer: naming a fear out loud makes it smaller. #dune' })
]

/** Writing: your own pages, built from ideas. */
export const exampleWriting = (): Item[] => [
  item(1, { tier: 'article', title: 'What Frankenstein gets right about ambition', attribution: 'From 3 ideas' }),
  item(2, { tier: 'article', title: 'Why Hamlet waits', attribution: 'An essay, half done' }),
  item(3, { tier: 'article', title: 'A beginner\'s guide to reading Dune' })
]

/** Questions: held for as long as it takes, gathering clues. */
export const exampleQuestions = (): Item[] => [
  item(1, { tier: 'question', title: 'Why do I finish books I am not enjoying?', clues: 3, createdAt: at(-40) }),
  item(2, { tier: 'question', title: 'Is Hamlet mad, or only pretending?', clues: 5, createdAt: at(-200) }),
  item(3, { tier: 'question', title: 'What would Elizabeth Bennet make of dating apps?', clues: 0, createdAt: at(-3) }),
  item(4, { tier: 'question', title: 'Why does Gatsby keep watching the green light?', clues: 6, createdAt: at(-90), closedAt: at(-5), closedHow: 'answered' })
]

/** Goals: a day you are aiming for, counted down. */
export const exampleGoals = (): Item[] => [
  item(1, { tier: 'goal', title: 'Read twelve classics this year', goalFrom: dayKey(-120), goalAt: dayKey(80), clues: 7 }),
  item(2, { tier: 'goal', title: 'Learn the Hamlet soliloquy by heart', goalFrom: dayKey(-10), goalAt: dayKey(20), clues: 2 }),
  item(3, { tier: 'goal', title: 'Finish the first draft of the essay', goalFrom: dayKey(-30), goalAt: dayKey(6), clues: 4 }),
  item(4, { tier: 'goal', title: 'Read War and Peace before the summer', goalFrom: dayKey(-150), goalAt: dayKey(-20), clues: 9, closedAt: at(-20), closedHow: 'made it' })
]

// --- tags, stats, the map

export const exampleTags = (): { tag: string; count: number; color: string | null; action: boolean; examAt: string | null }[] => [
  { tag: 'book', count: 14, color: 'brown', action: false, examAt: null },
  { tag: 'writing', count: 9, color: 'blue', action: false, examAt: null },
  { tag: 'hamlet', count: 6, color: 'purple', action: false, examAt: null },
  { tag: 'bit', count: 4, color: null, action: false, examAt: null },
  { tag: 'dune', count: 3, color: 'orange', action: false, examAt: null },
  { tag: 'fix', count: 2, color: 'red', action: true, examAt: null }
]

export const exampleStats = (): Stats => ({
  exits: [{ status: 'promoted', n: 18 }, { status: 'resolved', n: 31 }, { status: 'discarded', n: 9 }, { status: 'open', n: 7 }],
  kinds: [{ kind: 'note', n: 24 }, { kind: 'quote', n: 12 }, { kind: 'todo', n: 15 }, { kind: 'word', n: 6 }, { kind: 'link', n: 8 }],
  week: 23, lastWeek: 19, nuggets: 18, articles: 3, recall: 0.86,
  days: Array.from({ length: 84 }, (_, n) => dayKey(-n)).filter((_, n) => n % 3 !== 1 && n % 7 !== 5),
  hints: { shown: 40, up: 12, down: 3 },
  reviews: { n: 64, recalled: 55 },
  hours: Array.from({ length: 24 }, (_, hour) => ({ hour, n: hour >= 7 && hour <= 22 ? Math.round(6 * Math.exp(-((hour - 9) ** 2) / 6) + 3 * Math.exp(-((hour - 21) ** 2) / 4)) : 0 })),
  firstUse: Date.now() - 120 * 86_400_000,
  tasksDone: 11,
  sessions: { n: 5, minutes: 140 },
  tagsWeek: { book: 6, hamlet: 3, writing: 2 },
  retention: 0.9,
  estimates: { estimated: 120, spent: 150 },
  lead: { exits: 58, glosses: 14, reviewDays: 21, articles: 3 },
  leeches: [],
  day: { captured: 4, exits: 3, tasks: 2, reviews: 9 },
  year: { captured: 210, nuggets: 18, articles: 3, month: null },
  stopped: 0,
  unprocessed: { now: 7, weekAgo: 12 }
})

export const exampleMap = (): NoteMap => {
  const node = (id: string, title: string, kind: string, type = 'capture'): NoteMap['nodes'][number] => ({ type, id: `${EXAMPLE}${id}`, title, kind, links: 0 })
  const nodes = [
    node('austen', 'Pride and Prejudice', 'note'), node('first', 'First impressions are often wrong', 'quote', 'nugget'),
    node('darcy', 'Mr Darcy, misjudged', 'note'), node('bath', 'Visit Bath', 'todo'), node('ball', 'The Netherfield ball', 'note'),
    node('frank', 'Frankenstein', 'note'), node('nameless', 'The creature has no name', 'note', 'nugget'), node('ambition', 'What Frankenstein gets right about ambition', 'note', 'article'),
    node('hamlet', 'Hamlet', 'note'), node('waits', 'Why Hamlet waits', 'note', 'article'), node('soliloquy', 'Soliloquy', 'word'), node('mad', 'Is Hamlet mad?', 'note', 'question'),
    node('dune', 'Dune', 'decision'), node('fear', 'Fear is the mind-killer', 'quote', 'nugget'), node('yoda', 'Yoda shows, then stops talking', 'note')
  ]
  const pairs: [string, string][] = [['austen', 'first'], ['austen', 'darcy'], ['first', 'darcy'], ['austen', 'bath'], ['austen', 'ball'], ['darcy', 'ball'],
    ['frank', 'nameless'], ['frank', 'ambition'], ['nameless', 'ambition'], ['hamlet', 'waits'], ['hamlet', 'soliloquy'], ['hamlet', 'mad'], ['waits', 'mad'],
    ['dune', 'fear'], ['fear', 'yoda'], ['ambition', 'waits'], ['first', 'yoda']]
  const edges = pairs.map(([a, b]): [string, string] => [`${EXAMPLE}${a}`, `${EXAMPLE}${b}`])
  for (const one of nodes) one.links = edges.filter((edge) => edge.includes(one.id)).length
  return { nodes, edges, alone: 0 }
}

// --- the day, the year, review

/** What Today's page gathers under the day's words. */
export const exampleDay = (day: string): Day => {
  const entry = (id: string, title: string, type = 'capture', kind?: string, status?: string): Day['captured'][number] => ({ type, id: `${EXAMPLE}${id}`, title, kind, status, private: 0 })
  return {
    day, exists: false, body: null, reviewed: false,
    captured: [entry('d1', 'It is a truth universally acknowledged…', 'capture', 'quote'), entry('d2', 'Return Frankenstein to the library', 'capture', 'todo', 'resolved'), entry('d3', 'Soliloquy', 'capture', 'word')],
    resolved: [entry('d4', 'Read Dune before seeing the film', 'capture', 'decision', 'promoted')],
    studied: [entry('d5', 'What does Elizabeth get wrong about Darcy at first?', 'nugget', 'quote', 'good')],
    done: [entry('d6', 'Call Mum about Sunday lunch', 'task')]
  }
}

/** A year's months as seasons of life, for the months so far. */
export const exampleYear = (year: string, months: number): ({ month: string } & Record<string, string>)[] => {
  const seasons = [
    ['The month I read Frankenstein in two nights', 'Sleep more'], ['Back to the Austen books', 'Finish the essay'], ['Waiting for spring, and for news', ''],
    ['The Hamlet course', 'One soliloquy a week'], ['Learning to say no', 'Protect mornings'], ['Long evenings, short lists', ''],
    ['The month of the walking tour', 'Bath, and the letters'], ['Dune, finally', 'Read before the film'], ['Starting over at the desk', 'The first draft'],
    ['Quiet, and glad of it', ''], ['The book club year ends', 'Choose next year\'s twelve'], ['Looking back', '']
  ]
  return seasons.slice(0, months).map(([season, focus], at) => ({ month: `${year}-${String(at + 1).padStart(2, '0')}`, season, ...(focus ? { focus } : {}) }))
}

/** One card, front and back, the way Review turns it. */
export const exampleCard = { prompt: 'What does Elizabeth get wrong about Darcy at first?', answer: 'She takes his pride for the whole of him. The first impression, made at a dance, is wrong, and the book is her finding that out.', from: 'Pride and Prejudice' }

/** The month's two fields, filled in. */
export const exampleMonth = { season: 'The month I stopped waiting for permission', focus: 'Finish the Frankenstein essay; read in the mornings, not the evenings' }

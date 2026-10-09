import { useEffect, useState } from 'react'
import { vigil, type Item } from './vigil'
import { notes } from './notes'
import { onboarding } from './onboarding'
import { SANDBOX } from './sandbox'

/**
 * What Vigil can do, one card each: the powers the app never shows until you
 * need them, grouped by what they are for. The page that lists them is
 * components/vigil/powers-view.tsx; each card's moving picture is in
 * power-demos.tsx, under the same id.
 */
export type Group = 'Catching' | 'Writing' | 'Remembering' | 'Planning' | 'Seeing your year' | 'Windows' | 'Bringing notes in'

/**
 * Where Show me takes you. `view` (and `focus`) opens a page; `at` is what to
 * point at there, a selector, or `find` the first of those holding these
 * words. `settings` opens that section of Settings first. `box` opens the
 * box itself, which is its own window: nothing to point at, so `text` says
 * what to type.
 */
export type Show = {
  view?: string
  focus?: () => Promise<string | undefined>
  at?: string
  find?: string
  settings?: string
  box?: boolean
  text: string
}

export type Power = {
  id: string
  group: Group
  name: string
  line: string
  keys?: string[]
  show: Show
  /** Whether you have used it, from your own data; left out where no cheap, honest sign exists. */
  used?: (seen: Signs) => boolean
}

export const GROUPS: { id: Group; line: string }[] = [
  { id: 'Catching', line: 'The box takes more than words. A few small signs make it do things.' },
  { id: 'Writing', line: 'A note is more than a page of text.' },
  { id: 'Remembering', line: 'What you keep comes back, so it stays with you.' },
  { id: 'Planning', line: 'Tasks, choices and goals that check in on you.' },
  { id: 'Seeing your year', line: 'Days add up to weeks, months and seasons.' },
  { id: 'Windows', line: 'Vigil outside its own window.' },
  { id: 'Bringing notes in', line: 'Start with the notes you already have.' }
]

/** The first row of a list on the page. */
const ROW = '[data-row]'

export const POWERS: Power[] = [
  // Catching
  { id: 'box', group: 'Catching', name: 'The box, from any app', line: 'One key opens a small box over whatever you are doing. Write, press Return, and it is gone.', keys: ['⌘.'],
    show: { box: true, text: 'Write anything and press Return.' }, used: (s) => s.steps.catch },
  { id: 'timer', group: 'Catching', name: 'Timers in plain words', line: 'Type 5m tea in the box and a timer starts, with a bell when it is done.', keys: ['⌘.'],
    show: { box: true, text: 'Type 5m tea and press Return.' } },
  { id: 'clue', group: 'Catching', name: 'Add a clue to a question', line: 'Start with a plus and the question’s name, and what you type joins it as a clue. The same works for a goal’s log.', keys: ['⌘.'],
    show: { view: 'questions', at: ROW, text: 'Each question here gathers clues. In the box, type + and the start of its name.' }, used: (s) => s.items.some((item) => item.tier === 'question' && item.clues > 0) },
  { id: 'tagtask', group: 'Catching', name: 'Tags that make a task', line: 'Mark a tag as one that makes a task, and anything you write with #bug lands in your tasks.',
    show: { view: 'tags', find: '#bug', at: 'p', text: 'Open a tag and set it to Makes a task. Anything tagged with it becomes a task.' }, used: (s) => s.actionTag },
  { id: 'remind', group: 'Catching', name: 'Reminders, loud or quiet', line: 'End a task with !alert to be interrupted, !quiet for a silent note, or !pull to only see it when you look.',
    show: { view: 'upcoming', at: ROW, text: 'Open a task to set how it reminds you, or add !alert, !quiet or !pull as you write it.' }, used: (s) => s.tasks.some((task) => !!task.notify) },
  { id: 'comingback', group: 'Catching', name: 'The idea that keeps coming back', line: 'Catch the same thought three times and Vigil notices, and puts it in front of you.',
    show: { view: 'inbox', at: ROW, text: 'Write the same idea a few times and it turns up here as Coming back.' } },
  { id: 'onetask', group: 'Catching', name: 'One task from many notes', line: 'Pick a few notes that are really one job, and turn them into a single task that links back to each.', keys: ['⌘K'],
    show: { view: 'inbox', at: ROW, text: '⌘-click a few rows to pick them, then ⌘K and Make one task.' } },
  { id: 'merge', group: 'Catching', name: 'Merge two notes into one', line: 'Two notes about the same thing? Merge one into the other by its number, and both sets of words stay.',
    show: { view: 'inbox', at: ROW, text: 'Open a note and use Merge into from its ··· menu.' } },

  // Writing
  { id: 'board', group: 'Writing', name: 'Headings become a board', line: 'Any note of headings and lists flips into columns of cards, and back again.', keys: ['⌥⌘B'],
    show: { view: 'day', at: '.tiptap.ProseMirror', text: 'Write a few headings with lists under them, then press ⌥⌘B.' }, used: (s) => s.board },
  { id: 'versions', group: 'Writing', name: 'Every version, a slider away', line: 'Drag back through everything a note has been. Nothing you write is ever really lost.',
    show: { view: 'all', at: ROW, text: 'Open a note, then Version history in its ··· menu.' } },
  { id: 'find', group: 'Writing', name: 'Find and replace', line: 'Find a word in a long note and change every one of them at once.', keys: ['⌥⌘F'],
    show: { view: 'day', at: '.tiptap.ProseMirror', text: 'In any note, press ⌥⌘F.' } },
  { id: 'aliases', group: 'Writing', name: 'Other names for a note', line: 'Give a note its nicknames, and a mention of any of them links back to it.',
    show: { view: 'nuggets', at: ROW, text: 'Open an idea and add Other names beside it.' } },
  { id: 'calc', group: 'Writing', name: 'Sums as you type', line: 'Write a sum and an equals sign, and the answer appears. Press Tab to keep it.',
    show: { view: 'day', at: '.tiptap.ProseMirror', text: 'Type 12 × 4 = on any line.' } },
  { id: 'fold', group: 'Writing', name: 'Fold a heading', line: 'Tuck everything under a heading out of the way while you work on the rest.', keys: ['⌥⌘['],
    show: { view: 'day', at: '.tiptap.ProseMirror', text: 'Put the cursor in a heading and press ⌥⌘[.' } },
  { id: 'bit', group: 'Writing', name: '#bit keeps it to yourself', line: 'Tag a note #bit and it stays blurred in every list until you point at it.',
    show: { view: 'tags', find: '#bit', at: ROW, text: 'Anything tagged #bit is blurred in lists and never comes back as a hint.' }, used: (s) => s.tags.includes('bit') },
  { id: 'glossary', group: 'Writing', name: 'Your own glossary', line: 'Keep a word with what it means, and it is underlined wherever you write it again.',
    show: { view: 'kind:word', at: ROW, text: 'Words you keep show their meaning when you point at them in any note.' }, used: (s) => s.kinds.has('word') },

  // Remembering
  { id: 'review', group: 'Remembering', name: 'Ideas come back to you', line: 'Give an idea a question and it returns just before you would forget it, a little later each time.',
    show: { view: 'review', text: 'Answer from memory, then say how well it came back.' }, used: (s) => s.steps.review },
  { id: 'cloze', group: 'Remembering', name: 'Fill in the blank', line: 'Select a few words in an idea and blank them out. Review asks you to fill them back in.',
    show: { view: 'nuggets', at: ROW, text: 'Open an idea, select a word or two, then Blank the selected words.' }, used: (s) => s.items.some((item) => item.prompt?.includes('_____')) },
  { id: 'context', group: 'Remembering', name: 'Where it came from, and why', line: 'Note where you were and why it mattered. Both come back with the idea, so it still makes sense later.',
    show: { view: 'nuggets', at: ROW, text: 'Open an idea and fill in Context and Why.' }, used: (s) => s.items.some((item) => !!item.context || !!item.why) },
  { id: 'readthrough', group: 'Remembering', name: 'Read through a list', line: 'Go through any list one note at a time, full size, with nothing else on screen.', keys: ['⇧⌘R'],
    show: { view: 'nuggets', at: '[aria-label="Read through"]', text: 'Press ⇧⌘R on any list.' } },
  { id: 'wrong', group: 'Remembering', name: 'Wrong? Keep the truth', line: 'When something you saved turns out to be wrong, write what is true. The old one is kept, crossed out.',
    show: { view: 'nuggets', at: ROW, text: 'Open an idea and choose Wrong? to write what is true now.' }, used: (s) => s.items.some((item) => !!item.supersededBy) },
  { id: 'suspend', group: 'Remembering', name: 'Keep showing me, or rest it', line: 'Ask for an idea more often, or pause it until you want it back.',
    show: { view: 'nuggets', at: ROW, text: 'Open an idea: Keep showing me this, or Suspend.' }, used: (s) => s.items.some((item) => !!item.suspended) },
  { id: 'questions', group: 'Remembering', name: 'Questions you are holding', line: 'Keep a question open for weeks. Clues gather under it until you can answer it.',
    show: { view: 'questions', at: ROW, text: 'Every open question, with its clues.' }, used: (s) => s.items.some((item) => item.tier === 'question') },

  // Planning
  { id: 'decision', group: 'Planning', name: 'A decision comes back', line: 'Write down what you decided and when to look again. On that day it asks if it still holds.',
    show: { view: 'kind:decision', at: ROW, text: 'Open a decision and give it a Look again date.' }, used: (s) => s.kinds.has('decision') },
  { id: 'experiment', group: 'Planning', name: 'Experiments that report back', line: 'Try something until a date. When the day comes, Vigil asks how it went.',
    show: { view: 'kind:experiment', at: ROW, text: 'An experiment runs until its date, then asks for the outcome.' }, used: (s) => s.kinds.has('experiment') },
  { id: 'goals', group: 'Planning', name: 'Goals with a road there', line: 'A goal has a day and a line that fills as you go. Log steps from the box with + and its name.', keys: ['G E'],
    show: { view: 'goals', at: ROW, text: 'Each goal, with how far along it is.' }, used: (s) => s.items.some((item) => item.tier === 'goal') },
  { id: 'matrix', group: 'Planning', name: 'Urgent and important', line: 'Your tasks in four boxes, by how soon and how much they matter.', keys: ['G Q'],
    show: { view: 'matrix', at: '[data-quadrant]', text: 'Drag a task to another box, or press 1 to 4.' } },
  { id: 'routines', group: 'Planning', name: 'Routines', line: 'Say every day, every Monday or every 3 days, and the task comes back by itself.', keys: ['G O'],
    show: { view: 'routines', at: ROW, text: 'Every task that repeats.' }, used: (s) => s.tasks.some((task) => !!task.recurrence) },
  { id: 'focus', group: 'Planning', name: 'Focus on one task', line: 'Start a session on a task. A small timer floats over your screen until you are done.',
    show: { view: 'today', at: ROW, text: 'Open a task and press Focus.' }, used: (s) => s.steps.focus },
  { id: 'later', group: 'Planning', name: 'Later, not lost', line: 'What has no day yet waits in This month, This year or Someday.', keys: ['G Z'],
    show: { view: 'later', at: ROW, text: 'Tasks without a day.' } },

  // Seeing your year
  { id: 'pages', group: 'Seeing your year', name: 'A page for every day, week and month', line: 'Write on today’s page, then step back to the week and the month in a few lines each.', keys: ['G P'],
    show: { view: 'day', at: '[aria-label="Week"]', text: 'Switch between Day, Week, Month and Year here.' } },
  { id: 'year', group: 'Seeing your year', name: 'Your year in seasons', line: 'Name each month’s season of life, and see the year as the story it was.',
    show: { view: 'yearpage', text: 'Name a month’s season on its page, and it shows here.' }, used: (s) => s.season },
  { id: 'book', group: 'Seeing your year', name: '#book: stars and a takeaway', line: 'Tag a note #book to give it a reading status, a rating out of five and what you will keep from it.',
    show: { view: 'tags', find: '#book', at: ROW, text: 'Notes tagged #book get a status, stars and a takeaway.' }, used: (s) => s.rated },
  { id: 'wrapped', group: 'Seeing your year', name: 'Your month and year, wrapped', line: 'What you caught, your busiest day, the books you finished, played back like a story.',
    show: { view: 'stats', text: 'Stats, and ⌘K for Your month, wrapped.' } },
  { id: 'map', group: 'Seeing your year', name: 'A map of what links to what', line: 'Every note you have linked, drawn as dots and lines.', keys: ['G X'],
    show: { view: 'map', text: 'Drag to move around. Click a dot to open it.' } },

  // Windows
  { id: 'stickies', group: 'Windows', name: 'Sticky notes on your desktop', line: 'Put a note or today’s tasks on your desktop, over everything, like paper.', keys: ['⌃⌥⌘N'],
    show: { view: 'today', at: ROW, text: 'Open a task or note and choose Keep on screen.' }, used: (s) => s.steps.stick },
  { id: 'recordings', group: 'Windows', name: 'Hidden from screen recordings', line: 'Share your screen and Vigil shows as blank to everyone else. You still see it.',
    show: { view: 'settings', settings: 'What comes back to you', find: 'screen recordings', at: '[data-setting]', text: 'Vigil is hidden from recordings unless this is on. Turn it on for a demo.' } },
  { id: 'window', group: 'Windows', name: 'A note in its own window', line: '⌘-click any note to open it in a window of its own, beside whatever you are doing.',
    show: { view: 'all', at: ROW, text: '⌘-click a row to open it in its own window.' } },
  { id: 'safe', group: 'Windows', name: 'Safe mode', line: 'One key blurs everything private at once, for when someone is looking over your shoulder.', keys: ['⌥⌘S'],
    show: { view: 'inbox', at: ROW, text: 'Press ⌥⌘S, and again to come back.' } },
  { id: 'lock', group: 'Windows', name: 'Lock a note', line: 'Make a note read only, so a stray key cannot change it.',
    show: { box: true, text: 'In the box, open the ··· menu and choose Lock.' } },

  // Bringing notes in
  { id: 'vault', group: 'Bringing notes in', name: 'An Obsidian vault or Notion export', line: 'Bring a whole folder of notes in at once, links and properties kept.',
    show: { view: 'settings', settings: 'Import and backups', find: 'Obsidian', at: '[data-setting]', text: 'Pick the folder. Nothing in it is changed.' } },
  { id: 'files', group: 'Bringing notes in', name: 'Highlights and cards', line: 'Readwise and Kindle highlights, Markdown files, bookmarks and Anki cards.',
    show: { view: 'settings', settings: 'Import and backups', find: 'Readwise', at: '[data-setting]', text: 'Files… takes any of these.' } },
  { id: 'embeds', group: 'Bringing notes in', name: 'Pasted embeds fill themselves in', line: 'Paste a note from Obsidian with ![[embeds]] in it, and Vigil fetches what they point to.',
    show: { view: 'day', at: '.tiptap.ProseMirror', text: 'Paste a note with ![[an embed]] into any page.' } }
]

/** What your own notes say you have done: each cheap to read, and only what is certain. */
export type Signs = {
  steps: Record<string, boolean>
  items: Item[]
  tasks: { notify: string | null; recurrence: string | null }[]
  tags: string[]
  actionTag: boolean
  kinds: Set<string>
  board: boolean
  season: boolean
  rated: boolean
}

async function read(): Promise<Signs> {
  const [state, items, tasks, tags, captures, year] = await Promise.all([
    onboarding.state(),
    Promise.all((['nugget', 'article', 'question', 'goal'] as const).map((tier) => vigil.items(tier))).then((all) => all.flat()),
    vigil.tasks(),
    vigil.tags(),
    window.api.captures.list(),
    vigil.year(String(new Date().getFullYear())).catch(() => [])
  ])
  let board = false
  try {
    for (let i = 0; i < localStorage.length && !board; i++) {
      const key = localStorage.key(i)
      board = !!key?.startsWith('board:') && localStorage.getItem(key) === 'on'
    }
  } catch {
    // Not known: no tick.
  }
  // A #book rated: only the books, and at most a few dozen of them.
  let rated = false
  if (tags.some((one) => one.tag === 'book')) {
    const books = (await vigil.tag('book')).slice(0, 40)
    for (const book of books) {
      const fields = await notes.fields(book.type === 'capture' ? 'captures' : 'nuggets', book.id).catch(() => ({}) as Record<string, unknown>)
      if (Number(fields.rating) > 0) {
        rated = true
        break
      }
    }
  }
  return {
    steps: state.steps,
    items,
    tasks,
    tags: tags.map((one) => one.tag),
    actionTag: tags.some((one) => one.action),
    kinds: new Set(captures.filter((one) => one.status !== 'discarded').map((one) => one.kind)),
    board,
    season: year.some((month) => !!month.season?.trim()),
    rated
  }
}

/**
 * Which powers you have used, by id. Nothing in the sandbox: its examples
 * would tick everything, and none of it would be yours.
 */
export function useUsed(): Set<string> | null {
  const [used, setUsed] = useState<Set<string> | null>(null)
  useEffect(() => {
    if (SANDBOX) return
    let live = true
    void read().then((signs) => live && setUsed(new Set(POWERS.filter((power) => power.used?.(signs)).map((power) => power.id)))).catch(() => {})
    return () => void (live = false)
  }, [])
  return used
}

/** The page has been opened: Home stops offering it. */
export const SEEN_KEY = 'powers:seen'

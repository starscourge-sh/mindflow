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
  /** The card's italic Try it line, where Show me's words describe the place rather than say what to do. */
  tryIt?: string
  keys?: string[]
  show: Show
  /** Whether you have used it, from your own data; left out where no cheap, honest sign exists. */
  used?: (seen: Signs) => boolean
}

export const GROUPS: { id: Group; line: string }[] = [
  { id: 'Catching', line: 'A few small signs make quick capture do more than keep words.' },
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
  { id: 'box', group: 'Catching', name: 'Quick capture, from any app', line: 'One key opens quick capture over whatever you are doing, and ⌘↵ puts it away.', keys: ['⌘.'],
    show: { box: true, text: 'Write anything and press ⌘↵.' }, used: (s) => s.steps.catch },
  { id: 'timer', group: 'Catching', name: 'Timers in plain words', line: 'Type 5m tea in quick capture and a timer starts, with a bell when it is done.', keys: ['⌘.'],
    show: { box: true, text: 'Type 5m tea and press ⌘↵.' } },
  { id: 'rounds', group: 'Catching', name: 'Pomodoro rounds', line: 'Type 4x25 in quick capture for four 25-minute rounds with 5-minute breaks and a long one after the fourth; 4x25/10 sets the break. The session bubble shows a dot for each round, and a break starts with a softer sound of its own.', keys: ['⌘.'],
    show: { box: true, text: 'Type 4x25 essay and press ⌘↵.' } },
  { id: 'clue', group: 'Catching', name: 'Add a clue to a question', tryIt: 'In quick capture, type + and the start of a question’s name.', line: 'Start with + and a question’s or goal’s name, and what you type joins it as a clue or a log entry.', keys: ['⌘.'],
    show: { view: 'questions', at: ROW, text: 'Each question here gathers clues. In quick capture, type + and the start of its name.' }, used: (s) => s.items.some((item) => item.tier === 'question' && item.clues > 0) },
  { id: 'tagtask', group: 'Catching', name: 'Tags that make a task', tryIt: 'Open a tag, choose “Manage”, turn on “Tagged notes become tasks”, and pick a day beside “Scheduled”.', line: 'Mark a tag as one that makes a task, and anything you write with #bug lands in your tasks, with no date or on the day you choose.',
    show: { view: 'tags', at: ROW, text: 'Open a tag, choose “Manage”, turn on “Tagged notes become tasks”, and pick a day beside “Scheduled”.' }, used: (s) => s.actionTag },
  { id: 'remind', group: 'Catching', name: 'Reminders, loud or quiet', line: 'End a task with !alert to be interrupted, !quiet to have it counted quietly in the menu bar, or !pull to only see it when you look.',
    show: { view: 'upcoming', at: ROW, text: 'Open a task to set how it reminds you, or add !alert, !quiet or !pull as you write it.' }, used: (s) => s.tasks.some((task) => !!task.notify) },
  { id: 'comingback', group: 'Catching', name: 'The idea that keeps coming back', line: 'Catch the same thought three times, in much the same words, and Vigil notices and puts it in front of you.',
    show: { view: 'home', text: 'Write the same idea three times in much the same words, and it turns up on Home under “You keep coming back to this”.' } },
  { id: 'onetask', group: 'Catching', name: 'One task from many notes', line: 'Pick a few notes that are really one job, and turn them into a single task that links back to each.', keys: ['⌘K'],
    show: { view: 'inbox', at: ROW, text: '⇧-click a few rows to pick them, then ⌘K and “Make one task”.' } },
  { id: 'merge', group: 'Catching', name: 'Merge two notes into one', line: 'Merge one note into another, found by its words, and both sets of words stay.',
    show: { view: 'inbox', at: ROW, text: 'Open a note, click “Details” at its top right, choose “Merge into another note…” under “Status”, and type a few words of the other note.' } },

  // Writing
  { id: 'board', group: 'Writing', name: 'Headings become a board', line: 'A note of headings and lists in your Inbox flips into columns of cards, and back again.', keys: ['⌥⌘B'],
    show: { view: 'inbox', at: ROW, text: 'Open a note of headings with lists under them, then press ⌥⌘B.' }, used: (s) => s.board },
  { id: 'versions', group: 'Writing', name: 'Every version, a slider away', line: 'Drag back through everything a note has been, so nothing you write is ever lost.',
    show: { view: 'all', at: ROW, text: 'Open a note, then “Version history” in its ··· menu.' } },
  { id: 'find', group: 'Writing', name: 'Find and replace', line: 'Find a word in a long note and change every one of them at once.', keys: ['⌥⌘F'],
    show: { view: 'day', at: '.tiptap.ProseMirror', text: 'In any note, press ⌥⌘F.' } },
  { id: 'aliases', group: 'Writing', name: 'Other names for a note', line: 'Give a note its nicknames, and search, ⌘K and @ links find it by any of them.',
    show: { view: 'nuggets', at: ROW, text: 'Open a gem, click “Details” at its top right, and add a name under “Also called”.' } },
  { id: 'calc', group: 'Writing', name: 'Sums as you type', line: 'Write a sum and an equals sign, and the answer appears; Tab keeps it.',
    show: { view: 'day', at: '.tiptap.ProseMirror', text: 'Type 12 × 4 = on any line.' } },
  { id: 'fold', group: 'Writing', name: 'Fold a heading', line: 'Tuck everything under a heading out of the way while you work on the rest.', keys: ['⌥⌘['],
    show: { view: 'day', at: '.tiptap.ProseMirror', text: 'Put the cursor in a heading and press ⌥⌘[.' } },
  { id: 'bit', group: 'Writing', name: '#bit keeps it to yourself', tryIt: 'Tag a note #bit, then point at it in a list.', line: 'Tag a note #bit and it stays blurred in every list until you point at it.',
    show: { view: 'tags', find: '#bit', at: ROW, text: 'Anything tagged #bit is blurred in lists and never comes back as a hint.' }, used: (s) => s.tags.includes('bit') },
  { id: 'glossary', group: 'Writing', name: 'Your own glossary', tryIt: 'In quick capture, write a word alone on the first line and its meaning under it; then open it and, in its “Details”, choose “Save as a gem”.', line: 'Keep a word with what it means, and Review asks you what it means until it sticks.',
    show: { view: 'kind:word', at: ROW, text: 'Every word you caught, with its meaning. Open one, click “Details” and choose “Save as a gem”, and Review asks you for it.' }, used: (s) => s.kinds.has('word') },

  // Remembering
  { id: 'review', group: 'Remembering', name: 'Gems come back to you', line: 'Give a gem a question and it returns just before you would forget it, a little later each time.',
    show: { view: 'review', text: 'Answer from memory, then say how well it came back.' }, used: (s) => s.steps.review },
  { id: 'cloze', group: 'Remembering', name: 'Fill in the blank', line: 'Blank out a few words in a gem, and Review asks you to fill them back in.',
    show: { view: 'nuggets', at: ROW, text: 'Open a gem, select a word or two, click “Details” at its top right, then “Blank the selected words”.' }, used: (s) => s.items.some((item) => item.prompt?.includes('_____')) },
  { id: 'context', group: 'Remembering', name: 'Where it came from, and why', line: 'Add the background and the reason behind a gem, and Review shows both after the answer so it still makes sense.',
    show: { view: 'nuggets', at: ROW, text: 'Open a gem, click “Details” at its top right, and fill in “Context” and “Why”.' }, used: (s) => s.items.some((item) => !!item.context || !!item.why) },
  { id: 'readthrough', group: 'Remembering', name: 'Read through a list', line: 'Go through a list of notes or gems one at a time, full size, with nothing else on screen.', keys: ['⇧⌘R'],
    show: { view: 'nuggets', at: '[aria-label="Read through"]', text: 'Press ⇧⌘R on a list of notes or gems.' } },
  { id: 'queue', group: 'Remembering', name: 'A reading queue', tryIt: 'Right-click a note, point at “Queue”, and choose “Add to queue” or “Read next”.', line: 'Line up what you mean to read, Spotify’s way, then read it one after the other with “Up next” under the page.', keys: ['G B'],
    show: { view: 'queue', at: '[data-queue-row]', text: 'Drag to reorder, then “Start reading”. ] skips on, ⇧→ marks one read and goes to the next.' } },
  { id: 'wrong', group: 'Remembering', name: 'Wrong? Keep the truth', line: 'When something you saved turns out wrong, write what is true, and the old one stays, marked “Replaced”.',
    show: { view: 'nuggets', at: ROW, text: 'Open a gem, click “Details” at its top right, and under “Wrong?” choose “This turned out wrong…” to write what is true now.' }, used: (s) => s.items.some((item) => !!item.supersededBy) },
  { id: 'suspend', group: 'Remembering', name: 'Keep showing me, or rest it', tryIt: 'Open a gem, click “Details”, and under “Comes back” choose “Not at all”, or “Often” for a gem with no question.', line: 'Rest a gem until you want it back, or have one with no question come back often instead of now and then.',
    show: { view: 'nuggets', at: ROW, text: 'Open a gem, click “Details”, and under “Comes back” choose “Not at all”, or “Often” if it has no question.' }, used: (s) => s.items.some((item) => !!item.suspended) },
  { id: 'questions', group: 'Remembering', name: 'Questions you are holding', tryIt: 'Open a question and add a clue.', line: 'Keep a question open for weeks while clues gather under it, until you can answer it.',
    show: { view: 'questions', at: ROW, text: 'Every open question, with its clues.' }, used: (s) => s.items.some((item) => item.tier === 'question') },
  { id: 'linecards', group: 'Remembering', name: 'Cards written in a note', tryIt: 'Type a line like Capital of Peru :: Lima in any note.', line: 'Write a line as question :: answer in any note and it becomes a review card, marked at the line’s end and kept in step as you edit it.',
    show: { view: 'day', at: '.tiptap.ProseMirror', text: 'Type a line like Capital of Peru :: Lima. Review asks the words before ::, and R there opens the note at that line.' } },
  { id: 'slipping', group: 'Remembering', name: 'Cards that keep slipping', line: 'Miss a card a fourth time and Review offers to rewrite it, split it in two or set it aside; the Struggling shelf keeps them.', keys: ['1', '2', '3'],
    show: { view: 'review', at: '[data-struggling]', text: 'Every card missed four times or more, with a way to rest it or bring it back.' }, used: (s) => s.items.some((item) => item.lapses >= 4) },
  { id: 'practice', group: 'Remembering', name: 'Practise by focus', line: '“Practise” at the top of Review opens five short extra rounds from all your gems: weak spots, ones still being learnt, old ones, ones you know, or new ones.',
    show: { view: 'review', at: '[data-practise]', text: 'Choose “Practise”, then a round of up to ten. Only a grade moves a card’s next date.' } },
  { id: 'blurt', group: 'Remembering', name: 'Blurt a tag', tryIt: 'Open a tag and choose “Blurt”.', line: 'Write everything you remember about a tag in five minutes, then see its gems with the ones you left out lit, and those come up sooner in Review.',
    show: { view: 'tags', at: ROW, text: 'Open a tag and choose “Blurt” at the top. What you write is kept on today’s page.' } },
  { id: 'reviewreminder', group: 'Remembering', name: 'A reminder to review', tryIt: 'In Settings, turn on “Review reminder” and pick a time.', line: 'At the time you pick, a notification says how many cards are due and about how long they take; it stays quiet when none are.',
    show: { view: 'settings', settings: 'Review', find: 'Review reminder', at: '[data-setting]', text: 'Turn it on and pick a time. Never in quiet hours.' } },
  { id: 'learnvigil', group: 'Remembering', name: 'Learn Vigil by reviewing it', line: 'One click adds about twenty cards on what Vigil does without showing it, tagged #learn-vigil; they come a few a day.',
    show: { view: 'powers', at: '[data-learn]', text: 'Add the deck here, or from Getting started.' }, used: (s) => s.tags.includes('learn-vigil') },
  { id: 'learnmode', group: 'Remembering', name: 'Learn mode', tryIt: 'In Review, choose “Learn 8 new” at the top, beside “Practise”; it says how many new cards wait.', line: 'New cards asked twice, first as a choice of answers and then written out, with a bar that fills, until each is learnt and joins the schedule.', keys: ['1', '2', '3', '4'],
    show: { view: 'review', at: '[data-learn-new]', text: 'Learn the new cards before they join the schedule.' } },
  { id: 'typed', group: 'Remembering', name: 'Type the answer', tryIt: 'In Review, type your answer before turning the card, then press ⌘↵.', line: 'Type the answer before you look, and Review says how close it was, suggests a grade, and keeps what you wrote as a thought on the card.', keys: ['⌘↵'],
    show: { view: 'review', text: 'Type in the box under the question, then ⌘↵.' } },
  { id: 'practisetag', group: 'Remembering', name: 'Practise without counting', tryIt: 'Open a tag and choose “Practise”.', line: 'Go through a tag’s cards one after another, the answer on Space, with nothing graded or scheduled.', keys: ['Space', 'J', 'K'],
    show: { view: 'tags', at: ROW, text: 'Open a tag and choose “Practise” at the top.' } },
  { id: 'star', group: 'Remembering', name: 'Star a card', tryIt: 'Press S on a card in Review.', line: 'Press S on a card in Review to star it, and “Starred” under “Practise” gives those cards a round of their own.', keys: ['S'],
    show: { view: 'review', at: '[data-practise]', text: '“Starred” is the last round under “Practise”. S stars the card in front.' }, used: (s) => s.items.some((item) => !!item.starredAt) },
  { id: 'howitdecides', group: 'Remembering', name: 'How it decides', tryIt: 'Turn a card over in Review and open “How it decides”.', line: 'Under the grades, a fold says in plain words what Review aims for and why this card comes back when it does.',
    show: { view: 'review', text: 'Turn a card over, then open “How it decides” under the grades.' } },
  { id: 'tagpriority', group: 'Remembering', name: 'Pause a tag, or keep it ticking', tryIt: 'Open a tag, choose “Manage”, then “Maintaining” or “Paused”.', line: 'Set a tag to “Maintaining” and its cards keep coming back but no new ones start; “Paused” rests all of them.',
    show: { view: 'tags', at: ROW, text: 'Open a tag, choose “Manage”, and pick “Learning”, “Maintaining” or “Paused”.' }, used: (s) => s.priority },
  { id: 'listcards', group: 'Remembering', name: 'Paste a list, get cards', tryIt: 'Paste a few lines like Ephemeral - lasting a very short time.', line: 'Paste lines of “term - meaning” into any note and a toast offers to make each one a card.',
    show: { view: 'day', at: '.tiptap.ProseMirror', text: 'Paste three lines of term - meaning, then choose “Make 3 cards”.' } },
  { id: 'strength', group: 'Remembering', name: 'A card’s own history', tryIt: 'Open a gem you have reviewed, click “Details”, and look under “Comes back”.', line: 'Every gem you review keeps its dated grades, and a line of how long it would hold after each one.',
    show: { view: 'nuggets', focus: async () => (await vigil.items('nugget')).find((item) => item.prompt && item.reviewed > 0 && !item.suspended)?.id, at: '[data-strength]', text: 'Its dated grades and strength line, under “Comes back” in “Details”.' } },
  { id: 'fit', group: 'Remembering', name: 'Review fitted to your memory', tryIt: 'In Settings, Review, choose “Fit now” once you have a thousand reviews.', line: 'After a thousand reviews, Vigil works out how long a new card lasts for you, from whether you remembered it next time.',
    show: { view: 'settings', settings: 'Review', find: 'Fit to how I remember', at: '[data-setting]', text: 'It counts your reviews until there are enough.' } },
  { id: 'daysinarow', group: 'Remembering', name: 'Days in a row, rest days banked', line: 'Review quietly counts the days in a row you reviewed; each full week banks a rest day, up to three, and a day off spends one instead of ending the run.',
    show: { view: 'review', text: 'The count sits at the top left of Review, and under Done, once you have two days in a row.' } },

  // Planning
  { id: 'decision', group: 'Planning', name: 'A decision comes back', line: 'Write down what you decided and when to look again, and on that day it asks if it still holds.',
    show: { view: 'kind:decision', at: ROW, text: 'Open a decision and, under “Details” at the top right, give it a “Look again” date.' }, used: (s) => s.kinds.has('decision') },
  { id: 'experiment', group: 'Planning', name: 'Experiments that report back', tryIt: 'Open an experiment: its date and how it went are under “Details” at the top right.', line: 'Try something until a date, and when the day comes Vigil asks how it went.',
    show: { view: 'kind:experiment', at: ROW, text: 'An experiment runs until its date, then asks for the outcome.' }, used: (s) => s.kinds.has('experiment') },
  { id: 'goals', group: 'Planning', name: 'Goals with a road there', tryIt: 'Open a goal and log a step.', line: 'A goal has a day, a line that fills as the day comes closer, and steps you log from quick capture with + and its name.', keys: ['G E'],
    show: { view: 'goals', at: ROW, text: 'Each goal, with how far along it is.' }, used: (s) => s.items.some((item) => item.tier === 'goal') },
  { id: 'matrix', group: 'Planning', name: 'Urgent and important', line: 'Your tasks in four boxes, by how soon and how much they matter.', keys: ['G Q'],
    show: { view: 'matrix', at: '[data-quadrant]', text: 'Drag a task to another box, or pick one with J and K and press 1 to 4.' } },
  { id: 'routines', group: 'Planning', name: 'Routines', tryIt: 'Type a task that ends with every Monday.', line: 'Say every day, every Monday or every 3 days, and the task comes back by itself.', keys: ['G O'],
    show: { view: 'routines', at: ROW, text: 'Every task that repeats.' }, used: (s) => s.tasks.some((task) => !!task.recurrence) },
  { id: 'focus', group: 'Planning', name: 'Focus on one task', line: 'Start a session on a task, and a small timer floats over your screen until you are done.',
    show: { view: 'today', at: ROW, text: 'Open a task, choose “Start a focus session”, then “Start”.' }, used: (s) => s.steps.focus },
  { id: 'lengths', group: 'Planning', name: 'How long a task takes', tryIt: 'Type a task that ends with ~30m.', line: 'Write ~30m or ~1h on a task, and Today sets the hours planned beside the hours left before your day ends.',
    show: { view: 'today', at: '[data-day-budget]', text: 'Planned against what is left of the day. Write ~30m on a task to plan it.' }, used: (s) => s.tasks.some((task) => !!task.estimate) },
  { id: 'closeday', group: 'Planning', name: 'Close the day', tryIt: 'Press ⌘K and choose “Close the day”.', line: 'Each evening, a short look back: what got done, each open task sent to tomorrow, next week or let go, a line for today’s page and the one task to start tomorrow with.', keys: ['⌘K'],
    show: { view: 'settings', settings: 'What comes back to you', find: 'Close the day', at: '[data-setting]', text: 'Pick when it is offered each evening, or press ⌘K and choose “Close the day”.' } },
  { id: 'frog', group: 'Planning', name: 'Eat the frog', tryIt: 'Right-click a task and choose “Do this first today”.', line: 'Mark the one task to do first, and it leads Today and the day brief until the day is out.',
    show: { view: 'today', at: ROW, text: 'Right-click a task and choose “Do this first today”.' } },
  { id: 'writeday', group: 'Planning', name: 'Write out your day', tryIt: 'In Today, choose “Page”, write a line and press ↵.', line: 'Today as a page you write: one task a line under Now, Next and Later, the top three first, steps by ⇥, ticked lines struck where they are.', keys: ['⌥↑', '⌥↓', '⌘↵'],
    show: { view: 'today', at: 'button[aria-pressed]', find: 'Page', text: 'Choose “Page”, then write a line and press ↵.' } },
  { id: 'linetasks', group: 'Planning', name: 'Lines into tasks', tryIt: 'Select three lines in a note and choose “3 tasks”.', line: 'Several lines of a note made tasks at once, each line a to-do ticked with its task; a long pasted page sorted into tasks, links, words and sayings.',
    show: { view: 'inbox', text: 'Open a note, select a few lines, and choose “tasks” in the bar.' } },
  { id: '135', group: 'Planning', name: '1-3-5', tryIt: 'In Today, press F and pick “1-3-5” under “Grouping”.', line: 'Lay Today out as one big thing, three medium and five small, in the order you give them.',
    show: { view: 'today', at: '[data-display]', text: 'Press F or click here, and pick “1-3-5” under “Grouping”.' } },
  { id: 'pickup', group: 'Planning', name: 'Where you pick up', line: 'As a focus session ends, say where you will pick up, and the task shows it at the top when you next open it.',
    show: { view: 'today', at: ROW, text: 'Finish a focus session, and answer “Where do you pick up next time?”' } },
  { id: 'countin', group: 'Planning', name: 'The five-second rule', tryIt: 'In Settings, turn on “Count in a session”.', line: 'A session can count 5, 4, 3, 2, 1 with a tick each before its clock starts.',
    show: { view: 'settings', settings: 'Appearance', find: 'Count in a session', at: '[data-setting]', text: 'Turn it on, then start a session.' } },
  { id: 'later', group: 'Planning', name: 'Later, not lost', tryIt: 'Type a task that ends with someday.', line: 'What has no day yet waits in This month, This year or Someday.', keys: ['G Z'],
    show: { view: 'later', at: ROW, text: 'Tasks without a day.' } },

  // Seeing your year
  { id: 'pages', group: 'Seeing your year', name: 'A page for every day, week and month', tryIt: 'Switch between “Day”, “Week”, “Month” and “Year” at the top of a page.', line: 'Write on today’s page, then step back to the week and the month in a few lines each.', keys: ['G P'],
    show: { view: 'day', at: '[aria-label="Week"]', text: 'Switch between “Day”, “Week”, “Month” and “Year” here.' } },
  { id: 'year', group: 'Seeing your year', name: 'Your year in seasons', line: 'Name each month’s season of life, and see the year as the story it was.',
    show: { view: 'yearpage', text: 'Name a month’s season on its page, and it shows here.' }, used: (s) => s.season },
  { id: 'milestones', group: 'Seeing your year', name: 'Mark a day', tryIt: 'Right-click any day on the year, month or week, or type !milestone Exam on 3 Dec in quick capture.', line: 'Give any day a purpose, like Exam, Launch or Mum’s birthday, and count down to it from Home and the menu bar.',
    show: { view: 'yearpage', at: '[data-year-marks]', text: 'Each marked day stands tall here. Right-click any day to mark it.' } },
  { id: 'calendar', group: 'Seeing your year', name: 'The month at a glance', line: 'Each day on the Month page shows whether it has a page, how much you reviewed, its marked days and exams, and the cards still to come.', keys: ['G M'],
    show: { view: 'monthpage', at: '[data-month-legend]', text: 'What each mark means. Click a day to open it.' } },
  { id: 'maccalendar', group: 'Seeing your year', name: 'Your Mac’s calendar', tryIt: 'In Settings, turn on “Your Mac’s calendar”.', line: 'Your calendar’s events in Today’s brief and the week, read only, once macOS has asked you.',
    show: { view: 'settings', settings: 'What comes back to you', find: 'calendar', at: '[data-setting]', text: 'Turn it on; macOS asks once.' } },
  { id: 'digest', group: 'Seeing your year', name: 'A weekly digest', line: 'On Sundays, Home sums up your week: caught, kept, reviewed and finished, and from 6 in the evening a notification says it too. Nothing leaves your Mac.',
    show: { view: 'settings', settings: 'What comes back to you', find: 'Weekly digest', at: '[data-setting]', text: 'On by default; turn it off here.' } },
  { id: 'book', group: 'Seeing your year', name: '#book: stars and a takeaway', tryIt: 'Tag a note #book, then give it stars under “Details” at the top right.', line: 'Tag a note #book to give it a reading status, a rating out of five and what you will keep from it.',
    show: { view: 'tags', find: '#book', at: ROW, text: 'Notes tagged #book get a status, stars and a takeaway.' }, used: (s) => s.rated },
  { id: 'wrapped', group: 'Seeing your year', name: 'Your month and year, wrapped', tryIt: 'Press ⌘K and choose “Your month, wrapped”.', line: 'What you caught, your busiest day, the books you finished, played back like a story.',
    show: { view: 'stats', text: 'Stats, and ⌘K for “Your month, wrapped”.' } },
  { id: 'map', group: 'Seeing your year', name: 'A map of what links to what', tryIt: 'Open the map and click a dot.', line: 'Every note you have linked, drawn as dots and lines.', keys: ['G X'],
    show: { view: 'map', text: 'Drag to move around. Click a dot to open it.' } },

  // Windows
  { id: 'stickies', group: 'Windows', name: 'Sticky notes on your desktop', line: 'Put a note or today’s tasks on your desktop, over everything, like paper, and ⌃⌥⌘N hides or shows them all.', keys: ['⌃⌥⌘N'],
    show: { view: 'all', at: ROW, text: 'Right-click a note and choose “Stick on the desktop”; today’s page has “Keep on screen” for its to-dos.' }, used: (s) => s.steps.stick },
  { id: 'recordings', group: 'Windows', name: 'Hidden from screen recordings', tryIt: 'For a demo, turn off “The main window” under “Hide from screen recordings and shares”, or show it all from ⌘K.', line: 'Share your screen and Vigil shows as blank to everyone else, while you still see it. The main window, quick capture, sticky notes and the session bubble each have their own switch.',
    show: { view: 'settings', settings: 'What comes back to you', find: 'screen recordings', at: '[data-setting]', text: 'Each kind of window is hidden from recordings while its switch is on. Turn one off for a demo.' } },
  { id: 'window', group: 'Windows', name: 'A note in its own window', line: '⌘-click a note in your Inbox to open it in a window of its own, beside whatever you are doing.',
    show: { view: 'inbox', at: ROW, text: '⌘-click a row to open it in its own window.' } },
  { id: 'safe', group: 'Windows', name: 'Safe mode', line: 'One key stops hints, old captures and pinned notes coming up on their own, for when someone is looking over your shoulder.', keys: ['⌥⌘S'],
    show: { view: 'inbox', at: ROW, text: 'Press ⌥⌘S, and again to come back.' } },
  { id: 'notch', group: 'Windows', name: 'The bubble in the notch', tryIt: 'In Settings, set “Bubble sits” to “Under the notch”.', line: 'On a Mac with a notch, the session bubble can sit tucked around it, the time beside it, and open when you point at it.',
    show: { view: 'settings', settings: 'Appearance', find: 'Bubble sits', at: '[data-setting]', text: 'Choose “Under the notch”. On a Mac without one, the bubble stays where you put it.' } },
  { id: 'news', group: 'Windows', name: 'What’s new', tryIt: 'Press ⌘K and choose “What’s new”.', line: 'After an update, Home shows what changed once, each with a “Show me”; ⌘K and the menu bar open the whole list any time.', keys: ['⌘K'],
    show: { view: 'home', text: 'Press ⌘K and choose “What’s new”.' } },
  { id: 'bin', group: 'Windows', name: 'One Bin, with Restore', tryIt: 'Press G D.', line: 'Discarded captures, tasks closed without doing and notes moved to the Bin wait in one place, each with “Restore”, until you hold to empty it.', keys: ['G D'],
    show: { view: 'discarded', at: '[data-bin]', text: '“Restore” brings one back; “Hold to empty” lets them all go for good.' } },
  { id: 'lock', group: 'Windows', name: 'Lock a note', line: 'Lock the note open in quick capture as read only, so a stray key cannot change it; the next note opens unlocked.',
    show: { box: true, text: 'In quick capture, open the ··· menu and choose “Lock: read only”.' } },

  // Bringing notes in
  { id: 'vault', group: 'Bringing notes in', name: 'An Obsidian vault or Notion export', tryIt: 'In Settings, “Import and backups”, choose “Obsidian or Notion…” and pick the folder; nothing in it is changed.', line: 'Bring a whole folder of notes in at once, links and properties kept.',
    show: { view: 'settings', settings: 'Import and backups', find: 'Obsidian', at: '[data-setting]', text: 'Pick the folder. Nothing in it is changed.' } },
  { id: 'files', group: 'Bringing notes in', name: 'Highlights and cards', tryIt: 'In Settings, “Import and backups”, choose “Files…”.', line: 'Readwise and Kindle highlights, Markdown files, bookmarks and Anki cards.',
    show: { view: 'settings', settings: 'Import and backups', find: 'Readwise', at: '[data-setting]', text: '“Files…” takes any of these.' } },
  { id: 'embeds', group: 'Bringing notes in', name: 'Pasted embeds fill themselves in', line: 'Paste a note from Obsidian with ![[picture.png]] in it, and Vigil brings in the pictures and files it points to.',
    show: { view: 'day', at: '.tiptap.ProseMirror', text: 'Paste a note with ![[a picture]] into any page.' } }
]

/** What your own notes say you have done: each cheap to read, and only what is certain. */
export type Signs = {
  steps: Record<string, boolean>
  items: Item[]
  tasks: { notify: string | null; recurrence: string | null; estimate?: number | null }[]
  tags: string[]
  actionTag: boolean
  kinds: Set<string>
  board: boolean
  season: boolean
  rated: boolean
  /** A tag set to Maintaining or Paused. */
  priority: boolean
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
    rated,
    priority: tags.some((one) => !!one.priority)
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

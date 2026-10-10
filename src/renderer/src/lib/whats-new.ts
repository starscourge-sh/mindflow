import type { Show } from './powers'

/**
 * What's new, newest first: the one place the timeline after an update reads
 * from (components/vigil/whats-new.tsx). Add an entry at the top for anything
 * worth telling, with a bold lead-in, one sentence and where Show me points.
 * A new top entry is what makes the card come back on Home, once.
 */
export type News = {
  /** Stable and unique: the newest one seen is remembered by it. */
  id: string
  /** The day it shipped, "2026-10-10". */
  day: string
  lead: string
  text: string
  keys?: string[]
  show: Show
}

/** The version this list was last brought up to. */
export const NEWS_VERSION = '1.0.0'

const ROW = '[data-row]'

export const NEWS: News[] = [
  { id: 'close-day', day: '2026-10-10', lead: 'Close the day.', text: 'Each evening Vigil offers a short pass: what got done, where each open task goes, a line for today’s page and the first task for tomorrow.', keys: ['⌘K'],
    show: { view: 'settings', settings: 'What comes back to you', find: 'Close the day', at: '[data-setting]', text: 'Pick when it is offered, or press ⌘K and choose Close the day.' } },
  { id: 'rounds', day: '2026-10-10', lead: 'Pomodoro rounds.', text: 'Type 4x25 in quick capture for four 25-minute rounds with 5-minute breaks, a dot a round on the session pill and a sound of its own for each break.', keys: ['⌘.'],
    show: { box: true, text: 'Type 4x25 essay and press ⌘↵.' } },
  { id: 'lengths', day: '2026-10-10', lead: 'Task lengths.', text: 'Write ~30m or ~1h on a task, and Today says how many hours are planned against the hours left in the day.',
    show: { view: 'today', at: '[data-day-budget]', text: 'Planned against what is left of the day. Write ~30m on a task to plan it.' } },
  { id: 'month-calendar', day: '2026-10-10', lead: 'A month at a glance.', text: 'The Month page marks each day with its page, its reviews, its marked days, its exams and the cards still to come, with a key to read them by.', keys: ['G M'],
    show: { view: 'monthpage', at: '[data-month-legend]', text: 'What each mark means. Click a day to open it.' } },
  { id: 'notch', day: '2026-10-10', lead: 'The pill in the notch.', text: 'On a Mac with a notch, the session pill can sit tucked around it and open when you point at it.',
    show: { view: 'settings', settings: 'Appearance', find: 'Pill sits', at: '[data-setting]', text: 'Choose Under the notch.' } },
  { id: 'map', day: '2026-10-10', lead: 'The Map, redrawn.', text: 'Every linked note is a small chip coloured by its tag, the busiest named, and the links grow thicker the more two notes share.', keys: ['G X'],
    show: { view: 'map', text: 'Drag to move around. Click a dot to open it.' } },
  { id: 'gems', day: '2026-10-10', lead: 'Gems.', text: 'A thought kept in your own words is now called a gem, and every gem can come back to you in Review.', keys: ['G N'],
    show: { view: 'nuggets', at: ROW, text: 'Your gems, each in your own words.' } },
  { id: 'brutal', day: '2026-10-10', lead: 'The Brutal style.', text: 'Square corners, the theme’s ink as an outline and hard shadows, in light and dark.',
    show: { view: 'settings', settings: 'Appearance', find: 'Style', at: '[data-setting]', text: 'Pick Brutal, in any theme.' } },
  { id: 'tidy-stickies', day: '2026-10-10', lead: 'Tidy stickies.', text: 'One key gathers every sticky note into a neat column down the right of its screen, and puts them back after.', keys: ['⌃⌥⌘T'],
    show: { view: 'all', at: ROW, text: 'Stick a note on the desktop from its right-click menu, then press ⌃⌥⌘T.' } },
  { id: 'giphy', day: '2026-10-10', lead: 'A GIF for a task done.', text: 'With your own Giphy key, finishing a task can celebrate with a GIF found by the words you choose.',
    show: { view: 'settings', settings: 'Scenery', find: 'Giphy', at: '[data-setting]', text: 'Turn it on, then add your Giphy key and the words to search for.' } },
  { id: 'session-log', day: '2026-10-10', lead: 'The session log.', text: 'While a focus session runs, add a thought, a picture or a screenshot from the pill, and it is kept with the task.',
    show: { view: 'today', at: ROW, text: 'Open a task and start a focus session, then point at the pill.' } },
  { id: 'queue', day: '2026-10-10', lead: 'A reading queue.', text: 'Line up what you mean to read or watch, and Home shows the next few with a way to start.', keys: ['G B'],
    show: { view: 'queue', at: ROW, text: 'Drag a note onto Queue in the sidebar to add it.' } },
  { id: 'marked-days', day: '2026-10-10', lead: 'Marked days.', text: 'Give any day a purpose, like Exam or Launch, and count down to it from Home and the menu bar.',
    show: { view: 'yearpage', at: '[data-year-marks]', text: 'Right-click any day to mark it, or type !milestone Exam on 3 Dec in quick capture.' } },
  { id: 'split', day: '2026-10-10', lead: 'Split view.', text: 'Open a page again beside itself, or a note beside another, each pane named by what it shows.', keys: ['⌥⌘\\'],
    show: { view: 'inbox', at: ROW, text: 'Press ⌥⌘\\ to open this page again beside it.' } },
  { id: 'thought-box', day: '2026-10-09', lead: 'The thought box.', text: 'Under an open note, a line to add a dated thought without touching the note itself; ; puts the caret there.', keys: [';'],
    show: { view: 'inbox', at: ROW, text: 'Open a note, then press ; to add a thought under it.' } },
  { id: 'groups', day: '2026-10-08', lead: 'Groups.', text: 'Gather notes in a list into named, coloured groups that fold away.', keys: ['G N'],
    show: { view: 'nuggets', at: ROW, text: 'Select a few rows and press ⌃⌘N, or right-click them and choose New group.' } },
  { id: 'books', day: '2026-10-08', lead: 'Books.', text: 'Keep a separate book of notes for a project or a test, and switch between them from ⌘K or the menu bar.', keys: ['⌘K'],
    show: { view: 'home', text: 'Press ⌘K and choose Switch book or New book.' } }
]

/** Where the newest entry seen is kept. */
export const SEEN_NEWS = 'whats-new:seen'

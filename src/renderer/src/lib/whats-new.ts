import type { Show } from './powers'

/**
 * What's new, newest first: the one place the built-in What's new pages read
 * from (components/vigil/whats-new.tsx). Each release is a dated page of its
 * own, shipped with the app and read only; add an entry at the top for
 * anything worth telling, with a bold lead-in, one sentence and where Show me
 * points. A new top entry is what makes the card come back on Home, once.
 */
export type Release = { id: string; day: string; title: string; version?: string }
export const RELEASES: Release[] = [
  { id: 'planning', day: '2026-10-10', title: 'Planning and sessions', version: '1.0.0' },
  { id: 'map-and-gems', day: '2026-10-10', title: 'The Map, gems and Brutal' },
  { id: 'groups-and-books', day: '2026-10-08', title: 'Groups, books and thoughts on a note' }
]
export type News = {
  /** Which release page it is on. */
  release: string
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
  { id: 'write-day', release: 'planning', day: '2026-10-12', lead: 'Write out your day.', text: 'Choose “Page” at the top of Today and write the day as a list, one task a line, the top three first. Ticked lines stay struck through where they are, and anything left from before waits above with “Bring it”.', keys: ['⌥↑', '⌥↓'],
    show: { view: 'today', at: 'button[aria-pressed]', find: 'Page', text: 'Choose “Page” here, then write a line and press ↵.' } },
  { id: 'line-tasks', release: 'planning', day: '2026-10-12', lead: 'Lines into tasks.', text: 'Select several lines in a note and choose “3 tasks”: each line becomes a to-do linked to its task, and ticking either ticks both. A long mixed page pasted in offers “Sort this out”.',
    show: { view: 'inbox', text: 'Open a note, select a few lines, and choose “tasks” in the bar that comes up.' } },
  { id: 'bin', release: 'planning', day: '2026-10-10', lead: 'One Bin for everything.', text: 'Discarded captures, tasks closed without doing and notes moved to the Bin wait in one place, each with “Restore”, until you hold to empty it.', keys: ['G D'],
    show: { view: 'discarded', at: '[data-bin]', text: '“Restore” brings one back; “Hold to empty” lets them all go for good.' } },
  { id: 'frog', release: 'planning', day: '2026-10-10', lead: 'Eat the frog.', text: 'Right-click a task and choose “Eat the frog”, and it leads Today and the day brief until the day is out.',
    show: { view: 'today', at: ROW, text: 'Right-click a task and choose “Eat the frog”.' } },
  { id: '135', release: 'planning', day: '2026-10-10', lead: '1-3-5.', text: 'Today can be laid out as one big thing, three medium and five small, in the order you give them.',
    show: { view: 'today', at: '[data-display]', text: 'Press F or click here, and pick “1-3-5” under “Grouping”.' } },
  { id: 'pickup', release: 'planning', day: '2026-10-10', lead: 'Where you pick up.', text: 'As a session ends, its bubble asks where you will pick up, and the task shows it at the top when you next open it.',
    show: { view: 'today', at: ROW, text: 'Finish a focus session, and answer “Where do you pick up next time?”' } },
  { id: 'count-in', release: 'planning', day: '2026-10-10', lead: 'The five-second rule.', text: 'Turn on “Count in a session”, and a session counts 5, 4, 3, 2, 1 with a tick each before its clock starts.',
    show: { view: 'settings', settings: 'Appearance', find: 'Count in a session', at: '[data-setting]', text: 'Turn it on, then start a session.' } },
  { id: 'mac-calendar', release: 'planning', day: '2026-10-10', lead: 'Your Mac’s calendar.', text: 'Turn it on, and the day’s events show in Today’s brief and the week, read only, after macOS asks you once.',
    show: { view: 'settings', settings: 'What comes back to you', find: 'calendar', at: '[data-setting]', text: 'Turn it on; macOS asks once.' } },
  { id: 'digest', release: 'planning', day: '2026-10-10', lead: 'A weekly digest.', text: 'On Sundays, Home sums up your week in four numbers: caught, kept, reviewed and finished, with a notification in the evening.',
    show: { view: 'settings', settings: 'What comes back to you', find: 'Weekly digest', at: '[data-setting]', text: 'On by default. Nothing is sent anywhere.' } },
  { id: 'close-day', release: 'planning', day: '2026-10-10', lead: 'Close the day.', text: 'Each evening Vigil offers a short look back: what got done, where each open task goes, a line for today’s page and the first task for tomorrow.', keys: ['⌘K'],
    show: { view: 'settings', settings: 'What comes back to you', find: 'Close the day', at: '[data-setting]', text: 'Pick when it is offered, or press ⌘K and choose “Close the day”.' } },
  { id: 'rounds', release: 'planning', day: '2026-10-10', lead: 'Pomodoro rounds.', text: 'Type 4x25 in quick capture for four 25-minute rounds with 5-minute breaks, a dot for each round on the session bubble and a sound of its own for each break.', keys: ['⌘.'],
    show: { box: true, text: 'Type 4x25 essay and press ⌘↵.' } },
  { id: 'lengths', release: 'planning', day: '2026-10-10', lead: 'Task lengths.', text: 'Write ~30m or ~1h on a task, and Today says how many hours are planned against the hours left in the day.',
    show: { view: 'today', at: '[data-day-budget]', text: 'Planned against what is left of the day. Write ~30m on a task to plan it.' } },
  { id: 'month-calendar', release: 'planning', day: '2026-10-10', lead: 'A month at a glance.', text: 'The Month page marks each day with its page, its reviews, its marked days, its exams and the cards still to come, with a key to read them by.', keys: ['G M'],
    show: { view: 'monthpage', at: '[data-month-legend]', text: 'What each mark means. Click a day to open it.' } },
  { id: 'notch', release: 'planning', day: '2026-10-10', lead: 'The bubble in the notch.', text: 'On a Mac with a notch, the session bubble can sit tucked around it and open when you point at it.',
    show: { view: 'settings', settings: 'Appearance', find: 'Bubble sits', at: '[data-setting]', text: 'Choose “Under the notch”.' } },
  { id: 'map', release: 'map-and-gems', day: '2026-10-10', lead: 'The Map, redrawn.', text: 'Every linked note is a small chip coloured by its tag, the busiest named, and the links grow thicker the more two notes share.', keys: ['G X'],
    show: { view: 'map', text: 'Drag to move around. Click a dot to open it.' } },
  { id: 'gems', release: 'map-and-gems', day: '2026-10-10', lead: 'Gems.', text: 'A thought kept in your own words is now called a gem, and every gem can come back to you in Review.', keys: ['G N'],
    show: { view: 'nuggets', at: ROW, text: 'Your gems, each in your own words.' } },
  { id: 'brutal', release: 'map-and-gems', day: '2026-10-10', lead: 'The Brutal style.', text: 'Square corners, the theme’s ink as an outline and hard shadows, in light and dark.',
    show: { view: 'settings', settings: 'Appearance', find: 'Style', at: '[data-setting]', text: 'Pick “Brutal”, in any theme.' } },
  { id: 'tidy-stickies', release: 'map-and-gems', day: '2026-10-10', lead: 'Tidy stickies.', text: 'One key gathers every sticky note into a neat column down the right of its screen, and puts them back after.', keys: ['⌃⌥⌘T'],
    show: { view: 'all', at: ROW, text: 'Stick a note on the desktop from its right-click menu, then press ⌃⌥⌘T.' } },
  { id: 'giphy', release: 'map-and-gems', day: '2026-10-10', lead: 'A GIF for a task done.', text: 'With your own Giphy key, finishing a task can celebrate with a GIF found by the words you choose.',
    show: { view: 'settings', settings: 'Scenery', find: 'Giphy', at: '[data-setting]', text: 'Turn it on, then add your Giphy key and the words to search for.' } },
  { id: 'session-log', release: 'map-and-gems', day: '2026-10-10', lead: 'The session log.', text: 'While a focus session runs, add a thought, a picture or a screenshot from the session bubble, and it is kept with the task.',
    show: { view: 'today', at: ROW, text: 'Open a task and start a focus session, then point at its bubble.' } },
  { id: 'queue', release: 'map-and-gems', day: '2026-10-10', lead: 'A reading queue.', text: 'Line up what you mean to read or watch, and Home shows the next few with a way to start.', keys: ['G B'],
    show: { view: 'queue', at: ROW, text: 'Drag a note onto Queue in the sidebar to add it.' } },
  { id: 'marked-days', release: 'map-and-gems', day: '2026-10-10', lead: 'Marked days.', text: 'Give any day a purpose, like Exam or Launch, and count down to it from Home and the menu bar.',
    show: { view: 'yearpage', at: '[data-year-marks]', text: 'Right-click any day to mark it, or type !milestone Exam on 3 Dec in quick capture.' } },
  { id: 'split', release: 'map-and-gems', day: '2026-10-10', lead: 'Split view.', text: 'Open a page again beside itself, or a note beside another, each pane named by what it shows.', keys: ['⌥⌘\\'],
    show: { view: 'inbox', at: ROW, text: 'Press ⌥⌘\\ to open this page again beside it.' } },
  { id: 'thought-box', release: 'groups-and-books', day: '2026-10-09', lead: 'Thoughts on a note.', text: 'Under an open note, a line to add a dated thought without touching the note itself; ; puts the caret there.', keys: [';'],
    show: { view: 'inbox', at: ROW, text: 'Open a note, then press ; to add a thought under it.' } },
  { id: 'groups', release: 'groups-and-books', day: '2026-10-08', lead: 'Groups.', text: 'Gather notes in a list into named, coloured groups that fold away.', keys: ['G N'],
    show: { view: 'nuggets', at: ROW, text: 'Select a few rows and press ⌃⌘N, or right-click them and choose “New group”.' } },
  { id: 'books', release: 'groups-and-books', day: '2026-10-08', lead: 'Books.', text: 'Keep a separate book of notes for a project or a test, and switch between them from ⌘K or the menu bar.', keys: ['⌘K'],
    show: { view: 'home', text: 'Press ⌘K and choose “Switch book” or “New book”.' } }
]

/** Where the newest entry seen is kept. */
export const SEEN_NEWS = 'whats-new:seen'

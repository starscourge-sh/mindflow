/**
 * Every shortcut in the app, in one list: what Settings shows under Shortcuts
 * and what ? opens over either window. Only a list - each key is still handled
 * where it works - so a key added anywhere is added here too, or nobody finds it.
 *
 * `keys` is written the way it is drawn: one cap per character, and a space
 * between keys pressed one after the other (G then I is "G I").
 */
export type Shortcut = {
  keys: string
  /** What it does, in a few plain words. */
  does: string
  /** Where it works: Anywhere, Both windows, The box, Main window, Lists, Writing, Review or Reading. */
  where: string
  group: string
}

export const SHORTCUTS: Shortcut[] = [
  // From anywhere on the Mac, Vigil in front or not.
  { group: 'Anywhere', keys: '⌘.', does: 'Open or hide the box', where: 'Anywhere' },
  { group: 'Anywhere', keys: '⌥⌘S', does: 'Safe mode on or off: no hints, rot cards or pins', where: 'Anywhere' },

  { group: 'Getting around', keys: '⌘K', does: 'Search everything, and every action', where: 'Both windows' },
  { group: 'Getting around', keys: '⌘,', does: 'Settings', where: 'Both windows' },
  { group: 'Getting around', keys: '?', does: 'This list of shortcuts', where: 'Both windows' },
  { group: 'Getting around', keys: '⌘/', does: 'This list of shortcuts, even while writing', where: 'Both windows' },
  { group: 'Getting around', keys: '⌘[', does: 'Back', where: 'Both windows' },
  { group: 'Getting around', keys: '⌘]', does: 'Forward', where: 'Both windows' },
  { group: 'Getting around', keys: '⌘\\', does: 'Show or hide the side panel or sidebar', where: 'Both windows' },
  { group: 'Getting around', keys: '⌃⇧F', does: 'Make the window bigger, or back to compact', where: 'Both windows' },
  { group: 'Getting around', keys: '⇧⌘F', does: 'Focus mode on or off', where: 'Both windows' },
  { group: 'Getting around', keys: '⌘Q', does: 'Quit', where: 'Both windows' },
  { group: 'Getting around', keys: 'G I', does: 'Go to Inbox', where: 'Main window' },
  { group: 'Getting around', keys: 'G R', does: 'Go to Review', where: 'Main window' },
  { group: 'Getting around', keys: 'G T', does: 'Go to Today', where: 'Main window' },
  { group: 'Getting around', keys: 'G U', does: 'Go to Upcoming', where: 'Main window' },
  { group: 'Getting around', keys: 'G W', does: 'Go to Week', where: 'Main window' },
  { group: 'Getting around', keys: 'G O', does: 'Go to Routines', where: 'Main window' },
  { group: 'Getting around', keys: 'G Z', does: 'Go to Later: this month, this year, someday', where: 'Main window' },
  { group: 'Getting around', keys: 'G N', does: 'Go to Nuggets', where: 'Main window' },
  { group: 'Getting around', keys: 'G A', does: 'Go to Articles', where: 'Main window' },
  { group: 'Getting around', keys: 'G H', does: 'Go to Holding: the questions you are holding open', where: 'Main window' },
  { group: 'Getting around', keys: 'G #', does: 'Go to Tags', where: 'Main window' },
  { group: 'Getting around', keys: 'G S', does: 'Go to Stats', where: 'Main window' },
  { group: 'Getting around', keys: 'G L', does: 'Go to All captures', where: 'Main window' },
  { group: 'Getting around', keys: 'G D', does: 'Go to Discarded', where: 'Main window' },
  { group: 'Getting around', keys: 'G P', does: "Go to today's page", where: 'Main window' },
  { group: 'Getting around', keys: 'G V', does: 'Go to Archived', where: 'Main window' },
  { group: 'Getting around', keys: 'C', does: 'New capture in the box', where: 'Main window' },
  { group: 'Getting around', keys: '⌃1', does: 'Side panel: Inbox', where: 'The box' },
  { group: 'Getting around', keys: '⌃2', does: 'Side panel: Tasks', where: 'The box' },
  { group: 'Getting around', keys: '⌃3', does: 'Side panel: Review', where: 'The box' },
  { group: 'Getting around', keys: '⌃4', does: 'Side panel: Kept', where: 'The box' },
  { group: 'Getting around', keys: '⌃J', does: 'From the note to the list beside it', where: 'The box' },
  { group: 'Getting around', keys: 'I', does: 'From the list back to the note', where: 'The box' },
  { group: 'Getting around', keys: 'Esc', does: 'Hide the box', where: 'The box' },

  { group: 'Writing', keys: '⌘↵', does: 'Send the capture', where: 'The box' },
  { group: 'Writing', keys: '⌥⌘↵', does: 'Send, and keep the box open for the next', where: 'The box' },
  { group: 'Writing', keys: '+', does: 'First line "+name: …": a clue for that question instead of a capture', where: 'The box' },
  { group: 'Writing', keys: '⌥C', does: 'Create more on or off: every send keeps the box open', where: 'The box' },
  { group: 'Writing', keys: '⌘N', does: 'New capture', where: 'The box' },
  { group: 'Writing', keys: '⌘1', does: 'Kind: the first to the ninth (⌘1 to ⌘9)', where: 'The box' },
  { group: 'Writing', keys: '⌃L', does: 'Pick a kind', where: 'The box' },
  { group: 'Writing', keys: '⇧⌘C', does: 'Copy the note as Markdown', where: 'The box' },
  { group: 'Writing', keys: '⌘E', does: 'Show or hide the source', where: 'Writing' },
  { group: 'Writing', keys: '⇧⌘D', does: 'Details of the open capture', where: 'The box' },
  { group: 'Writing', keys: '⌘F', does: 'Find in the note', where: 'Writing' },
  { group: 'Writing', keys: '⌃F', does: 'Find in the note, the same as ⌘F', where: 'Writing' },
  { group: 'Writing', keys: '⌥⌘F', does: 'Find and replace in the note', where: 'Writing' },
  { group: 'Writing', keys: '⇧⌘O', does: 'Outline: move with arrows, ↵ to go there', where: 'Writing' },
  { group: 'Writing', keys: '⌥⌘↓', does: 'Next heading', where: 'Writing' },
  { group: 'Writing', keys: '⌥⌘↑', does: 'Heading before', where: 'Writing' },
  { group: 'Writing', keys: '⇥', does: 'Write in the answer after a line ending in =', where: 'Writing' },
  { group: 'Writing', keys: '⌘+', does: 'Bigger text in notes', where: 'Both windows' },
  { group: 'Writing', keys: '⌘−', does: 'Smaller text in notes', where: 'Both windows' },
  { group: 'Writing', keys: '⌘0', does: 'Text back to normal size', where: 'Both windows' },
  { group: 'Writing', keys: '/', does: 'Insert a block', where: 'Writing' },
  { group: 'Writing', keys: '⌘B', does: 'Bold', where: 'Writing' },
  { group: 'Writing', keys: '⌘I', does: 'Italic', where: 'Writing' },
  { group: 'Writing', keys: '⌘U', does: 'Underline', where: 'Writing' },
  { group: 'Writing', keys: '⇧⌘S', does: 'Strike through', where: 'Writing' },
  { group: 'Writing', keys: '⌥⌘4', does: 'To-do list, or tick the box', where: 'Writing' },
  { group: 'Writing', keys: '⌥⌘5', does: 'Bulleted list', where: 'Writing' },
  { group: 'Writing', keys: '⌥⌘6', does: 'Numbered list', where: 'Writing' },
  { group: 'Writing', keys: '⌥⌘7', does: 'Fold under a heading (a toggle)', where: 'Writing' },
  { group: 'Writing', keys: '⌥⌘8', does: 'Code, in the line', where: 'Writing' },
  { group: 'Writing', keys: '⌥⌘9', does: 'Math, in the line', where: 'Writing' },
  { group: 'Writing', keys: '⌥⌘0', does: 'Math block', where: 'Writing' },
  { group: 'Writing', keys: '⌥⌘T', does: 'Table', where: 'Writing' },
  { group: 'Writing', keys: '⌘Z', does: 'Undo the last thing, from its notice', where: 'Both windows' },

  { group: 'Lists', keys: 'J', does: 'Next row', where: 'Lists' },
  { group: 'Lists', keys: 'K', does: 'Row before', where: 'Lists' },
  { group: 'Lists', keys: 'G G', does: 'First row', where: 'Lists' },
  { group: 'Lists', keys: '⇧G', does: 'Last row', where: 'Lists' },
  { group: 'Lists', keys: '↵', does: 'Open the row', where: 'Lists' },
  { group: 'Lists', keys: '↓', does: 'Next item, with one open', where: 'Lists' },
  { group: 'Lists', keys: 'X', does: 'Select the row, for one action on several', where: 'Lists' },
  { group: 'Lists', keys: 'F', does: 'Display: filter, sort and group', where: 'Lists' },
  { group: 'Lists', keys: '⇧⌘R', does: 'Read through the list, one at a time', where: 'Lists' },
  { group: 'Lists', keys: 'P', does: 'Promote: keep it as a nugget', where: 'Lists' },
  { group: 'Lists', keys: 'R', does: 'Resolve: done with it', where: 'Lists' },
  { group: 'Lists', keys: 'D', does: 'Discard: let it go', where: 'Lists' },
  { group: 'Lists', keys: 'H', does: 'On a capture: hold it as a question, its words the first clue', where: 'Lists' },
  { group: 'Lists', keys: 'W', does: 'On a rot card: say who said it', where: 'Lists' },
  { group: 'Lists', keys: ';', does: 'Add a thought (a dated gloss) on the row, card or page in front of you', where: 'Lists' },
  { group: 'Lists', keys: '⌘;', does: 'Add a thought while a field has the keys: the hint card, or the highlighted search result', where: 'Both windows' },
  { group: 'Lists', keys: 'E', does: 'Complete the task', where: 'Lists' },
  { group: 'Lists', keys: 'T', does: 'Move the task to today', where: 'Lists' },
  { group: 'Lists', keys: 'M', does: 'Move the task to tomorrow', where: 'Lists' },
  { group: 'Lists', keys: 'W', does: 'On a task: move it to next week', where: 'Lists' },
  { group: 'Lists', keys: 'A', does: 'Add a task, in Today', where: 'Lists' },
  { group: 'Lists', keys: '⌥J', does: 'Move the task down', where: 'Lists' },
  { group: 'Lists', keys: '⌥K', does: 'Move the task up', where: 'Lists' },
  { group: 'Lists', keys: '⌥↓', does: 'Move the note down, in your own order (or ⌥J)', where: 'Lists' },
  { group: 'Lists', keys: '⌥↑', does: 'Move the note up, in your own order (or ⌥K)', where: 'Lists' },
  { group: 'Lists', keys: '⌘', does: '⌘-click a note: open it in a window of its own', where: 'Lists' },
  { group: 'Lists', keys: '←', does: "The day before, on a day's page", where: 'Main window' },
  { group: 'Lists', keys: '→', does: "The day after, on a day's page", where: 'Main window' },
  { group: 'Lists', keys: 'T', does: "Back to today, on a day's page", where: 'Main window' },
  { group: 'Lists', keys: '1', does: 'Task priority: Urgent, High, Medium, Low (1 to 4)', where: 'Lists' },
  { group: 'Lists', keys: '0', does: 'Task priority: none', where: 'Lists' },
  { group: 'Week', keys: 'H', does: 'Day before (L for the day after)', where: 'Main window' },
  { group: 'Week', keys: 'J', does: 'Next task in the day (K for the one before)', where: 'Main window' },
  { group: 'Week', keys: '⇧H', does: 'Move the task a day earlier', where: 'Main window' },
  { group: 'Week', keys: '⇧L', does: 'Move the task a day later', where: 'Main window' },
  { group: 'Week', keys: '[', does: 'Week before', where: 'Main window' },
  { group: 'Week', keys: ']', does: 'Week after', where: 'Main window' },
  { group: 'Week', keys: '↵', does: 'Open the task', where: 'Main window' },
  { group: 'Week', keys: 'Esc', does: 'Close the open task', where: 'Main window' },
  { group: 'Week', keys: 'E', does: 'Complete the task', where: 'Main window' },
  { group: 'Week', keys: 'T', does: 'Move the task to today', where: 'Main window' },
  { group: 'Week', keys: 'M', does: 'Move the task to tomorrow', where: 'Main window' },
  { group: 'Week', keys: 'W', does: 'Move the task to a week from today', where: 'Main window' },
  { group: 'Week', keys: '1', does: 'Task priority: Urgent, High, Medium, Low (1 to 4; 0 for none)', where: 'Main window' },
  { group: 'Lists', keys: '⌃⇧↑', does: 'A hint is worth keeping', where: 'The box' },
  { group: 'Lists', keys: '⌃⇧↓', does: 'A hint is not for you: show it less', where: 'The box' },

  { group: 'Review', keys: 'Space', does: 'Show the answer', where: 'Review' },
  { group: 'Review', keys: '1', does: 'Again', where: 'Review' },
  { group: 'Review', keys: '2', does: 'Hard', where: 'Review' },
  { group: 'Review', keys: '3', does: 'Good', where: 'Review' },
  { group: 'Review', keys: '4', does: 'Easy', where: 'Review' },
  { group: 'Review', keys: 'B', does: 'Not today', where: 'Review' },
  { group: 'Review', keys: ';', does: 'Add a thought on the card, once the answer shows', where: 'Review' },
  { group: 'Review', keys: 'R', does: 'After Again: reread where the card came from', where: 'Review' },
  { group: 'Review', keys: 'Esc', does: 'Back from the source to the review', where: 'Review' },
  { group: 'Review', keys: '← →', does: 'Step through a recap (Stats, or ⌘K: wrapped)', where: 'Main window' },
  { group: 'Review', keys: 'Space', does: 'Next in a recap (↵, L or J too)', where: 'Main window' },
  { group: 'Review', keys: 'H', does: 'Back in a recap (K too)', where: 'Main window' },
  { group: 'Review', keys: 'Esc', does: 'Close the recap', where: 'Main window' },

  { group: 'Reading', keys: 'J', does: 'Next', where: 'Reading' },
  { group: 'Reading', keys: 'K', does: 'Back', where: 'Reading' },
  { group: 'Reading', keys: 'E', does: 'Write in it', where: 'Reading' },
  { group: 'Reading', keys: 'T', does: 'Make it a task', where: 'Reading' },
  { group: 'Reading', keys: 'P', does: 'Promote: keep it as a nugget', where: 'Reading' },
  { group: 'Reading', keys: 'R', does: 'Resolve: done with it', where: 'Reading' },
  { group: 'Reading', keys: 'D', does: 'Discard: let it go', where: 'Reading' },
  { group: 'Reading', keys: 'H', does: 'Hold as a question', where: 'Reading' },
  { group: 'Reading', keys: ';', does: 'Add a thought on the page', where: 'Reading' },
  { group: 'Reading', keys: 'Esc', does: 'Stop reading', where: 'Reading' },

  { group: 'Settings', keys: 'J', does: 'Next setting', where: 'Main window' },
  { group: 'Settings', keys: 'K', does: 'Setting before', where: 'Main window' },
  { group: 'Settings', keys: 'H', does: 'Slider down', where: 'Main window' },
  { group: 'Settings', keys: 'L', does: 'Slider up', where: 'Main window' },
  { group: 'Settings', keys: '↑ ↓', does: 'Next or previous section, in the section list (J and K too)', where: 'Main window' }
]

/** The list in its groups, in the order they first appear. */
export function grouped(list: Shortcut[] = SHORTCUTS): [string, Shortcut[]][] {
  const groups = new Map<string, Shortcut[]>()
  for (const one of list) groups.set(one.group, [...(groups.get(one.group) ?? []), one])
  return [...groups]
}

/** The ones that match what was typed, by what they do, the keys, or where. */
export function findShortcuts(query: string): Shortcut[] {
  const q = query.trim().toLowerCase()
  if (!q) return SHORTCUTS
  return SHORTCUTS.filter((one) => `${one.does} ${one.keys} ${one.where} ${one.group}`.toLowerCase().includes(q))
}

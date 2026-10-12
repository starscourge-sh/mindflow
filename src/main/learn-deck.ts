/**
 * Learn Vigil by reviewing it: a deck of gems tagged #learn-vigil, each a
 * question about something the app does without showing it. Added only when
 * asked (Getting started, What Vigil can do, or the sandbox's seed), never on
 * its own. Each answer is checked against the code it describes; when a key
 * or a word changes there, it changes here too (src/renderer/src/lib/shortcuts.ts
 * lists the keys).
 */
export const LEARN_TAG = 'learn-vigil'

export const LEARN_DECK: { question: string; answer: string }[] = [
  { question: 'How do you open quick capture from any app?', answer: 'Press ⌘. anywhere on the Mac, and ⌘↵ puts what you wrote away.' },
  { question: 'In quick capture, how do you add a clue to a question you are holding?', answer: 'Start with + and the question’s name, then a colon and the clue: “+Who is the monster?: he reads Paradise Lost”. On a goal it is logged instead.' },
  { question: 'How do you start a timer from quick capture?', answer: 'Type a length and a name, like “5m tea”, and press ⌘↵. A bell rings when it is done.' },
  { question: 'Which key turns a note of headings and lists into a board of columns?', answer: '⌥⌘B, and again to turn it back into a note.' },
  { question: 'What is the difference between “every 3 days” and “every! 3 days” on a task?', answer: '“every” follows the calendar. “every!” counts from when you last did it.' },
  { question: 'How do you make a fill-in-the-blank card from a gem?', answer: 'Open the gem, select a word or two, and choose “Blank the selected words”. Review asks you to fill them back in.' },
  { question: 'How do you go through a list one note at a time, full size?', answer: 'Press ⇧⌘R on a list of notes or gems: “Read through”.' },
  { question: 'How do you put two pages side by side, and move between them?', answer: '⌥⌘\\ opens the page again in a pane beside it. ⌃H and ⌃L give the keys to the pane on the left or right; ⌃W closes the one in front.' },
  { question: 'How do you line up notes to read later, in order?', answer: 'Right-click a note and choose “Queue”, then “Add to queue”, or “Read next” to put it first. G B opens the queue.' },
  { question: 'How do you mark a day, like an exam or a birthday?', answer: 'Right-click any day on the year, month or week, or type “!milestone Exam on 3 Dec” in quick capture. It counts down on Home and in the menu bar.' },
  { question: 'Which key lines your sticky notes up down the side of the screen?', answer: '⌃⌥⌘T tidies them down the right middle of the screen, from anywhere. ⌃⌥⌘N hides or shows them all.' },
  { question: 'What is a session’s log?', answer: 'Thoughts and pictures you add from the session bubble while a session runs, each stamped with its time. Afterwards they read as a timeline in the task and on the day’s page.' },
  { question: 'How do you link one note to another as you write?', answer: 'Type @ and the start of the other note’s name, then pick it. A nickname under “Also called” works too.' },
  { question: 'How do you keep a note blurred in every list?', answer: 'Tag it bit, with a # in front (written here without one, so this card is not tagged too). It stays blurred until you point at it, and never comes back as a hint.' },
  { question: 'Which key stops anything coming up on its own while you share your screen?', answer: '⌥⌘S, from anywhere: safe mode. Press it again to come back.' },
  { question: 'How do you get a sum worked out in a note?', answer: 'Write the sum and an equals sign, like “12 × 4 =”. The answer appears after it, and Tab writes it in.' },
  { question: 'How do you tuck everything under a heading out of the way?', answer: 'Put the cursor in the heading and press ⌥⌘[. The same key unfolds it.' },
  { question: 'A gem turns out to be wrong. How do you fix it without losing it?', answer: 'Open it and choose “This turned out wrong…” under “Wrong?”. You write what is true, and the old one stays, marked “Replaced” and out of Review.' },
  { question: 'In Review, what do B and ; do?', answer: 'B is “Not today”: the card is back tomorrow, its schedule untouched. ; once the answer shows adds a thought on the card.' },
  { question: 'How do you make a review card without leaving the note you are writing?', answer: 'Write a line as “question :: answer”. It becomes a card, marked at the end of the line, and stays in step as you edit the line.' },
  { question: 'Which key shows everything made lately, beside the page?', answer: '⇧⌘Y opens Recent.' },
  { question: 'In Review, what does S do?', answer: 'It stars the card. “Starred”, under “Practise” at the top of Review, then gives your starred cards a round of their own.' },
  { question: 'How do you go through a tag’s cards without anything being scheduled?', answer: 'Open the tag and choose “Practise”: Space shows the answer, J goes on, and nothing is graded.' },
  { question: 'How do you write out your day as a list, with every line a task?', answer: 'Open Today and choose “Page”, or ⌘K “Write out my day”. ↵ starts the next line, ⇥ makes a line a step of the one above, ⌥↑ and ⌥↓ reorder, and the top three come first.' },
  { question: 'How do you turn several lines of a note into tasks at once?', answer: 'Select the lines and choose “3 tasks” (or however many) in the bar. Each line becomes a to-do linked to its task: tick either one and both tick.' }
]

/**
 * Answers as they were worded before, by question. A card added then still
 * holds the old words; learn:add swaps them for today's, but only on a card
 * nobody has edited since (its answer still exactly the old one).
 */
export const LEARN_EARLIER: Record<string, string[]> = {
  'What is a session’s log?': ['Thoughts and pictures you add from the focus pill while a session runs, each stamped with its time. Afterwards they read as a timeline in the task and on the day’s page.'],
  'How do you make a fill-in-the-blank card from a gem?': ['Open the gem, select a word or two, and choose Blank the selected words. Review asks you to fill them back in.'],
  'How do you go through a list one note at a time, full size?': ['Press ⇧⌘R on a list of notes or gems: Read through.'],
  'How do you line up notes to read later, in order?': ['Right-click a note and choose Add to queue, or Read next to put it first. G B opens the queue.', 'Right-click a note and choose “Add to queue”, or “Read next” to put it first. G B opens the queue.'],
  'How do you link one note to another as you write?': ['Type @ and the start of the other note’s name, then pick it. A nickname under Also called works too.'],
  'A gem turns out to be wrong. How do you fix it without losing it?': ['Open it and choose This turned out wrong… under Wrong?. You write what is true, and the old one stays, marked Superseded and out of Review.', 'Open it and choose “This turned out wrong…” under “Wrong?”. You write what is true, and the old one stays, marked “Superseded” and out of Review.'],
  'In Review, what do B and ; do?': ['B is Not today: the card is back tomorrow, its schedule untouched. ; once the answer shows adds a thought on the card.'],
  'In Review, what does S do?': ['It stars the card. The Starred chip above Review then gives your starred cards a round of their own.', 'It stars the card. The “Starred” chip above Review then gives your starred cards a round of their own.'],
  'How do you go through a tag’s cards without anything being scheduled?': ['Open the tag and choose Practise: Space shows the answer, J goes on, and nothing is graded.']
}

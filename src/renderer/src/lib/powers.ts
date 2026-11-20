import { useEffect, useState } from 'react'
import { haligtree, type Item } from './haligtree'
import { notes } from './notes'
import { onboarding } from './onboarding'
import { SANDBOX } from './sandbox'
import { APP_NAME, LEARN_TAG } from '../../../main/name'
import type { Need } from '../../../main/needs'

/**
 * What Haligtree can do, one card each: the powers the app never shows until you
 * need them, grouped by what they are for. The page that lists them is
 * components/haligtree/powers-view.tsx; each card's moving picture is in
 * power-demos.tsx, under the same id.
 */
export type Group = 'Writing' | 'Catching' | 'Reading and questions' | 'Remembering' | 'Tasks and time' | 'Days and seasons' | 'Windows and your Mac'

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
  /** Which Macs get it (main/needs.ts); left out, every Mac. A Mac that lacks it is told so, never shown it as working. */
  needs?: Need
}

/** In the page's tab order: writing first, then what feeds it, then what it turns into. */
export const GROUPS: { id: Group; line: string }[] = [
  { id: 'Writing', line: 'A note is more than a page of text.' },
  { id: 'Catching', line: 'Quick capture does more than keep words, and the notes you already have come in whole.' },
  { id: 'Reading and questions', line: 'Books, PDFs and the questions you are holding open.' },
  { id: 'Remembering', line: 'What you keep comes back, so it stays with you.' },
  { id: 'Tasks and time', line: 'Tasks, timers and goals that check in on you.' },
  { id: 'Days and seasons', line: 'Days add up to weeks, months and seasons.' },
  { id: 'Windows and your Mac', line: `${APP_NAME} outside its own window.` }
]

/** The first row of a list on the page. */
const ROW = '[data-row]'

/** The powers of the focus timer and its bubble: left out while it is turned off (Settings, Tasks). */
export const FOCUS_POWERS = new Set(['timer', 'rounds', 'focus', 'pickup', 'countin', 'notch'])

export const POWERS: Power[] = [
  // Catching
  { id: 'box', group: 'Catching', name: 'Quick capture, from any app', line: 'One key opens quick capture over whatever you are doing, and ⌘↵ puts it away. It notes the app you were in, and the page open in your browser once you let it; × leaves it off a note.', keys: ['⌘.'],
    show: { box: true, text: 'Write anything and press ⌘↵.' }, used: (s) => s.steps.catch },
  { id: 'services', group: 'Catching', name: 'Send to Haligtree, from any app', needs: 'every', tryIt: 'Pick some words in Safari, right-click them, and choose “Services”, then “Send to Haligtree”.', line: 'Pick words in any app, right-click, and “Send to Haligtree” puts them in your Inbox as a quote, saying the app and page they came from, with nothing copied. macOS lists it once Haligtree is in your Applications folder.',
    show: { view: 'inbox', at: ROW, text: 'What you send lands at the top of the Inbox, as a quote.' } },
  { id: 'calls', group: 'Catching', name: 'Record a call or lecture', needs: 'every', tryIt: 'Press ⌃⌥⌘M, or press ⌘K and choose “Record a call or lecture”.', line: 'Your microphone and the sound from this Mac, or from one app, kept in your book. Each voice is told apart and each line plays from its moment; words come as they are said where this Mac has the language on hand. Your noted moments and action items sit on its page, and typing can’t break it. Nothing leaves this Mac.', keys: ['⌃⌥⌘M'],
    show: { view: 'inbox', at: ROW, text: 'A recording lands in the Inbox as a page of its own.' } },
  { id: 'timer', group: 'Tasks and time', name: 'Timers in plain words', line: 'Type 5m tea in quick capture and a timer starts, with a bell when it is done.', keys: ['⌘.'],
    show: { box: true, text: 'Type 5m tea and press ⌘↵.' } },
  { id: 'letter', group: 'Catching', name: 'Letters to future you', line: 'Add @1y to a note (or @6m, @3m, @2w) and it stays out of sight until then, then comes back in the Journal saying when you wrote it.', keys: ['⌘.'],
    show: { box: true, text: 'Type Will I still want the farm? @1y and press ⌘↵.' } },
  { id: 'rounds', group: 'Tasks and time', name: 'Focus rounds', line: 'Type 4x25 in quick capture for four 25-minute rounds with 5-minute breaks and a long one after the fourth; 4x25/10 sets the break. The session bubble shows a dot for each round, and a break starts with a softer sound of its own.', keys: ['⌘.'],
    show: { box: true, text: 'Type 4x25 essay and press ⌘↵.' } },
  { id: 'clue', group: 'Reading and questions', name: 'Add a clue to a question', tryIt: 'In quick capture, type + and the start of a question’s name.', line: 'Start with + and a question’s or goal’s name, and what you type joins the question as a clue, or the goal’s progress log.', keys: ['⌘.'],
    show: { view: 'questions', at: ROW, text: 'Each question here gathers clues. In quick capture, type + and the start of its name.' }, used: (s) => s.items.some((item) => item.tier === 'question' && item.clues > 0) },
  { id: 'tagtask', group: 'Tasks and time', name: 'Tags that make a task', tryIt: 'Open a tag, choose “Manage”, turn on “Tagged notes become tasks”, and pick a day beside “Scheduled”.', line: 'Mark a tag as one that makes a task, and anything you write with #bug lands in your tasks, with no date or on the day you choose.',
    show: { view: 'tags', at: ROW, text: 'Open a tag, choose “Manage”, turn on “Tagged notes become tasks”, and pick a day beside “Scheduled”.' }, used: (s) => s.actionTag },
  { id: 'remind', group: 'Tasks and time', name: 'Reminders, loud or quiet', line: 'End a task with !alert to be interrupted, !quiet to have it counted quietly in the menu bar, or !pull to only see it when you look.',
    show: { view: 'upcoming', at: ROW, text: 'Open a task to set how it reminds you, or add !alert, !quiet or !pull as you write it.' }, used: (s) => s.tasks.some((task) => !!task.notify) },
  { id: 'comingback', group: 'Catching', name: 'The idea that keeps coming back', line: `Catch the same thought three times, in much the same words, and ${APP_NAME} notices and puts it in front of you.`,
    show: { view: 'day', text: 'Write the same idea three times in much the same words, and it turns up in the Journal, under its tasks.' } },
  { id: 'picturewords', group: 'Catching', name: 'Words in your pictures', needs: 'every', tryIt: 'Press ⌘K and type a word written in one of your pictures.', line: 'Every screenshot, photo of a slide and page of your own handwriting you keep is read by your Mac, so search and ⌘K find it by what it says. Right-click a picture to copy its words, make them a note of their own, or find the notes that say the same.', keys: ['⌘K'],
    show: { view: 'media', at: '[data-media="picture"]', text: 'Right-click a picture: “Copy text from image”, “Make it a note” or “Find this in my notes”.' } },
  { id: 'translate', group: 'Reading and questions', name: 'Translate on this Mac', needs: 'macos26', tryIt: 'Pick some words in a PDF, right-click them and choose “Translate”.', line: 'Words picked in a book or a web page, or the words in a picture, put into your own language by your Mac, with nothing sent anywhere. Offered only for words in another language; the first time a language is needed, Apple’s own prompt fetches it once.',
    show: { view: 'media', at: '[data-media="picture"]', text: 'Right-click a picture and choose “Translate the text”.' } },
  { id: 'onetask', group: 'Tasks and time', name: 'One task from many notes', line: 'Pick a few notes that are really one job, and turn them into a single task that links back to each.', keys: ['⌘K'],
    show: { view: 'inbox', at: ROW, text: '⇧-click a few rows to pick them, then ⌘K and “Make one task”.' } },
  { id: 'merge', group: 'Writing', name: 'Merge two notes into one', line: 'Merge one note into another, found by its words, and both sets of words stay.',
    show: { view: 'inbox', at: ROW, text: 'Open a note, click “Details” at its top right and, under “Where it goes”, choose “Merge into another note…”, then type a few words of the other note.' } },

  // Writing
  { id: 'properties', group: 'Writing', name: 'Properties, and tags that bring them', tryIt: 'In any note, type Author:: Ursula Le Guin on a line of its own and press ↵.', line: 'Any note or page can carry properties: a name and a value (words, a number, a date, yes or no, a choice, a link), in a quiet strip under its title. Give one to a tag and every note with that tag gets it, as #book brings Status and Rating. Search author:le guin to find them.', keys: ['⌥⌘P'],
    show: { view: 'inbox', at: ROW, text: 'Open a note: its properties sit under the title. Press ⌥⌘P or type Name:: value to add one.' } },
  { id: 'dates', group: 'Writing', name: 'Dates and times lit as you write', needs: 'every', tryIt: 'In any note, write “Essay due Friday 3pm” and rest the pointer on the date.', line: 'A date or a time in a note, a Journal day or a gem is lit as you type it, and resting on it says the day it means, read as on the day the note was written. One switch in Settings, Writing.',
    show: { view: 'settings', settings: 'Writing', find: 'Dates and times lit', at: '[data-setting]', text: 'On, unless you turn it off here.' } },
  { id: 'cluewhy', group: 'Reading and questions', name: 'Why a clue may help', needs: 'ai', line: 'Under each note offered for a question, one line on why it may help answer it, written by Apple Intelligence on your Mac.',
    show: { view: 'questions', text: 'Open a question: notes of yours that may answer it each say why.' } },
  { id: 'offers', group: 'Writing', name: 'Offers from your own notes', needs: 'every', tryIt: 'Write a few lines that name another note’s title, then stop typing for a moment.', line: 'Under a note, one quiet line at a time: a note it names, linked with a click, its words lit in the note while you point at the line; a note it nearly repeats, to open or join; the folder it reads like; the people it names, for People, every one on one line; the tags the notes most like it carry, added with a click. On a question, notes that may answer it; on Today, the notes for your next event. Found by the words they share, never sent anywhere.',
    show: { view: 'settings', settings: 'What comes back to you', find: 'Offers from your notes', at: '[data-setting]', text: 'On, unless you turn it off here.' } },
  { id: 'writinghelp', group: 'Writing', name: 'Writing help on what you pick', needs: 'ai', tryIt: 'Pick a few sentences in a note and choose “Writing help” on the bar over them, or press ⌃⌘W.', line: 'Apple Intelligence on your Mac, on the words you pick: “Fix it” (spelling and dictation slips), “Shorter”, “Friendlier”, “Plainer”, “In my words” (retold in your voice, learned from your notes), “Ask me about this” (a question you hold) and “Pull the quote”. The new wording shows after your own before anything changes: ↵ uses it, Esc keeps yours, ⌘Z puts yours back. Nothing leaves this Mac.', keys: ['⌃⌘W'],
    show: { view: 'inbox', at: ROW, text: 'Open a note, pick a few sentences, and choose “Writing help” on the bar over them.' } },
  { id: 'untitled', group: 'Writing', name: 'A name for a note with none', needs: 'ai', tryIt: 'Open a note that starts with a picture, or with a whole paragraph, and wait a moment.', line: 'A note with no name of its own (it starts with a picture, or with a long paragraph) is offered one, written by Apple Intelligence on your Mac from its words: “Use this name” puts it at the top, ⌘Z takes it back.',
    show: { view: 'inbox', text: 'Under such a note, a quiet line offers a name.' } },
  { id: 'faces', group: 'Writing', name: 'Faces framed', needs: 'every', line: 'Wherever one of your pictures is cut to a shape (a person’s round photo, a square tile), your Mac finds the face in it, or the main thing, and centres the cut there.',
    show: { view: 'sources', text: 'Give a person a photo: their round face is centred on them.' } },
  { id: 'reminders', group: 'Tasks and time', name: 'A task in your Reminders', needs: 'every', tryIt: 'Right-click a task and choose “Add to Reminders”.', line: 'Put a task in your Mac’s Reminders, with its day and time, to have it on your phone and watch: tick it there and it is done here, tick it here and it is ticked there.',
    show: { view: 'today', text: 'Right-click a task and choose “Add to Reminders”.' } },
  { id: 'away', group: 'Tasks and time', name: 'Welcome back', needs: 'every', line: 'Back at your Mac after hours away, one line says what came due while you were gone; and a day your Mac was locked or asleep never breaks a streak.',
    show: { view: 'settings', settings: 'What comes back to you', find: 'Welcome back', at: '[data-setting]', text: 'On, unless you turn it off here.' } },
  { id: 'board', group: 'Writing', name: 'Lists become a board', line: 'Any note, page or gem of headings with lists under them, or of bullets with bullets under them, flips into columns of cards, and back again.', keys: ['⌥⌘B'],
    show: { view: 'inbox', at: ROW, text: 'Open a note of headings with lists under them, or of bullets with bullets under them, then press ⌥⌘B.' }, used: (s) => s.board },
  { id: 'versions', group: 'Writing', name: 'Every version, a slider away', line: 'Drag back through everything a note has been, so nothing you write is ever lost.',
    show: { view: 'inbox', at: ROW, text: 'Open a note, then “Version history” in its ··· menu.' } },
  { id: 'readaloud', group: 'Writing', name: 'Read it to me', needs: 'every', tryIt: 'Open a note, press ⌘K and choose “Read it to me”.', line: 'Your Mac reads a note, a Journal day, words picked in a book or the words in a picture aloud, in the language they are written in, each word lit as it is said. Esc stops it.', keys: ['⌘K'],
    show: { view: 'inbox', at: ROW, text: 'Open a note, then “Read it to me” in its ··· menu or in ⌘K.' } },
  { id: 'find', group: 'Writing', name: 'Find and replace', line: 'Find a word in a long note and change every one of them at once.', keys: ['⌥⌘F'],
    show: { view: 'day', at: '.tiptap.ProseMirror', text: 'In any note, press ⌥⌘F.' } },
  { id: 'aliases', group: 'Writing', name: 'Other names for a note', line: 'Give a note its nicknames, and search, ⌘K and @ links find it by any of them.',
    show: { view: 'nuggets', at: ROW, text: 'Open a gem, click “Details” at its top right, open “Also called”, and add a name.' } },
  { id: 'calc', group: 'Writing', name: 'Sums as you type', line: 'Write a sum and an equals sign, and the answer appears; Tab keeps it.',
    show: { view: 'day', at: '.tiptap.ProseMirror', text: 'Type 12 × 4 = on any line.' } },
  { id: 'fold', group: 'Writing', name: 'Fold a heading', line: 'Tuck everything under a heading out of the way while you work on the rest.', keys: ['⌥⌘['],
    show: { view: 'day', at: '.tiptap.ProseMirror', text: 'Put the cursor in a heading and press ⌥⌘[.' } },
  { id: 'bit', group: 'Writing', name: '#bit keeps it to yourself', tryIt: 'Tag a note #bit, then point at it in a list.', line: 'Tag a note #bit and it stays blurred in every list until you point at it.',
    show: { view: 'tags', find: '#bit', at: ROW, text: 'Anything tagged #bit is blurred in lists and never comes back as a hint.' }, used: (s) => s.tags.includes('bit') },
  { id: 'glossary', group: 'Writing', name: 'Your own glossary', tryIt: 'In quick capture, write a word alone on the first line and its meaning under it; then open it and, in its “Details”, choose “Save as a gem”.', line: 'Keep a word with what it means, and Review asks you what it means until it sticks.',
    show: { view: 'kind:word', at: ROW, text: 'Every term you caught, with its meaning. Open one, click “Details” and choose “Save as a gem”, and Review asks you for it.' }, used: (s) => s.kinds.has('word') },

  // Remembering
  { id: 'review', group: 'Remembering', name: 'Gems come back to you', line: 'Give a gem a question and it returns as you start to forget it, and waits longer each time you remember it.',
    show: { view: 'review', text: 'Answer from memory, then say how well it came back.' }, used: (s) => s.steps.review },
  { id: 'cloze', group: 'Remembering', name: 'Fill in the blank', line: 'Blank out a few words in a gem, and Review asks you to fill them back in.',
    show: { view: 'nuggets', at: ROW, text: 'Open a gem, select a word or two, click “Details” at its top right, then “Blank the selected words”.' }, used: (s) => s.items.some((item) => item.prompt?.includes('_____')) },
  { id: 'context', group: 'Remembering', name: 'Behind the answer', line: 'Add the picture, the bigger story and why it is so behind a gem, and Review shows it after the answer so it still makes sense.',
    show: { view: 'nuggets', at: ROW, text: 'Open a gem, click “Details” at its top right, and open “Behind the answer” to fill it in.' }, used: (s) => s.items.some((item) => !!item.context || !!item.why) },
  { id: 'readthrough', group: 'Reading and questions', name: 'Read through a list', line: 'Go through a list of notes or gems one at a time, full size, with nothing else on screen.', keys: ['⇧⌘R'],
    show: { view: 'nuggets', at: '[aria-label="Read through"]', text: 'Press ⇧⌘R on a list of notes or gems.' } },
  { id: 'queue', group: 'Reading and questions', name: 'A reading queue', tryIt: 'Right-click a note, point at “Queue”, and choose “Add to queue” or “Read next”.', line: 'Line up what you mean to read, Spotify’s way, then read it one after the other with “Up next” under the page.', keys: ['G B'],
    show: { view: 'queue', at: '[data-queue-row]', text: 'Drag to reorder, then “Start reading”. ] skips on, ⇧→ marks one read and goes to the next.' } },
  { id: 'wrong', group: 'Remembering', name: 'Wrong? Keep the truth', line: 'When something you saved turns out wrong, write what is true, and the old one stays, marked “Replaced”.',
    show: { view: 'nuggets', at: ROW, text: 'Open a gem, click “Details” at its top right, open “Wrong?” and choose “This turned out wrong…” to write what is true now.' }, used: (s) => s.items.some((item) => !!item.supersededBy) },
  { id: 'suspend', group: 'Remembering', name: 'Keep showing me, or pause it', tryIt: 'Open a gem, click “Details”, open “Comes back” and choose “Not at all”, or “Often” for a gem with no question.', line: 'Pause a gem until you want it back, or have one with no question come back often instead of now and then.',
    show: { view: 'nuggets', at: ROW, text: 'Open a gem, click “Details”, open “Comes back” and choose “Not at all”, or “Often” if it has no question.' }, used: (s) => s.items.some((item) => !!item.suspended) },
  { id: 'questions', group: 'Reading and questions', name: 'Questions you are holding', tryIt: 'Open a question and add a clue.', line: 'Keep a question open for weeks while clues gather under it, until you can answer it.',
    show: { view: 'questions', at: ROW, text: 'Every open question, with its clues.' }, used: (s) => s.items.some((item) => item.tier === 'question') },
  { id: 'linecards', group: 'Remembering', name: 'Cards written in a note', tryIt: 'Type a line like Capital of Peru :: Lima in any note.', line: 'Write a line as question :: answer in any note and it becomes a review card, marked at the line’s end and kept in step as you edit it.',
    show: { view: 'day', at: '.tiptap.ProseMirror', text: 'Type a line like Capital of Peru :: Lima. Review asks the words before ::, and R there opens the note at that line.' } },
  { id: 'slipping', group: 'Remembering', name: 'Cards that keep slipping', line: 'Miss a card a fourth time and Review offers to rewrite it, split it in two or pause it; the Struggling shelf keeps them.', keys: ['1', '2', '3'],
    show: { view: 'review', at: '[data-struggling]', text: 'Every card missed four times or more, with a way to pause it or bring it back.' }, used: (s) => s.items.some((item) => item.lapses >= 4) },
  { id: 'practice', group: 'Remembering', name: 'Practise by focus', line: '“Practise” at the top of Review opens five short extra rounds from all your gems: weak spots, ones still being learnt, old ones, ones you know, or new ones.',
    show: { view: 'review', at: '[data-practise]', text: 'Choose “Practise”, then a round of up to ten. Only a grade moves a card’s next date.' } },
  { id: 'blurt', group: 'Remembering', name: 'Blurt a tag', tryIt: 'Open a tag and choose “Blurt”.', line: 'Write everything you remember about a tag in five minutes, then see its gems with the ones you left out lit, and those come up sooner in Review.',
    show: { view: 'tags', at: ROW, text: 'Open a tag and choose “Blurt” at the top. What you write is kept on today’s page.' } },
  { id: 'reviewreminder', group: 'Remembering', name: 'A reminder to review', tryIt: 'In Settings, turn on “Review reminder” and pick a time.', line: 'At the time you pick, a notification says how many cards are due and about how long they take; it stays quiet when none are.',
    show: { view: 'settings', settings: 'Review', find: 'Review reminder', at: '[data-setting]', text: 'Turn it on and pick a time. Never in quiet hours.' } },
  { id: 'learnhaligtree', group: 'Remembering', name: `Learn ${APP_NAME} by reviewing it`, line: `One click adds about twenty cards on what ${APP_NAME} does without showing it, tagged #${LEARN_TAG}; they come a few a day.`,
    show: { view: 'powers', at: '[data-learn]', text: 'Add the deck here, or from Getting started.' }, used: (s) => s.tags.includes(LEARN_TAG) },
  { id: 'learnmode', group: 'Remembering', name: 'Learn mode', tryIt: 'In Review, choose “Learn 8 new” at the top, beside “Practise”; it says how many new cards wait.', line: 'New cards asked twice, first as a choice of answers and then written out, with a bar that fills, until each is learnt and joins the schedule.', keys: ['1', '2', '3', '4'],
    show: { view: 'review', at: '[data-learn-new]', text: 'Learn the new cards before they join the schedule.' } },
  { id: 'typed', group: 'Remembering', name: 'Type the answer', needs: 'ai', tryIt: 'In Review, type your answer before turning the card, then press ⌘↵.', line: 'Type the answer before you look: word for word, Review suggests Easy; otherwise Apple Intelligence suggests one from what you meant, and the grade is yours. What you wrote is kept as a thought on the card.', keys: ['⌘↵'],
    show: { view: 'review', text: 'Type in the box under the question, then ⌘↵.' } },
  { id: 'meaning', group: 'Remembering', name: 'Answers checked by meaning', needs: 'ai', tryIt: 'In Review, type an answer in your own words, then press ⌘↵.', line: 'A typed answer is judged by what it means, not its letters: “Close enough: you said ‘feeling of unease’, the card says ‘disquiet’.” It suggests a grade; the grade is yours. By Apple Intelligence, on this Mac.', keys: ['⌘↵'],
    show: { view: 'review', at: '[data-typed-lines]', text: 'Type your answer in your own words here, then press ⌘↵.' } },
  { id: 'hint', group: 'Remembering', name: 'A hint, not the answer', needs: 'ai', tryIt: 'Stuck on a card in Review, press H.', line: 'H gives a nudge built from the answer, never the answer itself; press it again for a stronger one. Each hint brings the card back a step sooner. By Apple Intelligence, on this Mac.', keys: ['H'],
    show: { view: 'review', at: '[data-hint-ask]', text: 'Stuck? Press H for a nudge, and again for a stronger one.' } },
  { id: 'chaptercards', group: 'Remembering', name: 'Five cards from a chapter', needs: 'ai', tryIt: 'In a PDF, choose the sparkles button in the reader’s bar, or right-click a page.', line: 'Five cards from the chapter you are in (or the pages on screen), from your highlights and its headings first, each with its page. Keep, change or drop each; none is made until you keep it. By Apple Intelligence, on this Mac.',
    show: { view: 'media', at: '[data-media="pdf"]', text: 'Open a PDF, then choose the sparkles in its bar.' } },
  { id: 'practisetag', group: 'Remembering', name: 'Practise without counting', tryIt: 'Open a tag and choose “Practise”.', line: 'Go through a tag’s cards one after another, the answer on Space, with nothing graded or scheduled.', keys: ['Space', 'J', 'K'],
    show: { view: 'tags', at: ROW, text: 'Open a tag and choose “Practise” at the top.' } },
  { id: 'anotherway', group: 'Remembering', name: 'Ask another way', tryIt: 'Press A on a card in Review.', line: 'One topic asked from many angles: A opens a new card under the one in front that keeps its context, source and #tags, so you write only the new question and its answer.', keys: ['A'],
    show: { view: 'review', at: '[data-review-card]', text: 'Press A on the card in front: the new card keeps its context, source and tags.' } },
  { id: 'star', group: 'Remembering', name: 'Star a card', tryIt: 'Press S on a card in Review.', line: 'Press S on a card in Review to star it, and “Starred” under “Practise” gives those cards a round of their own.', keys: ['S'],
    show: { view: 'review', at: '[data-practise]', text: '“Starred” is the last round under “Practise”. S stars the card in front.' }, used: (s) => s.items.some((item) => !!item.starredAt && item.tier !== 'goal') },
  { id: 'howitdecides', group: 'Remembering', name: 'How it decides', tryIt: 'Turn a card over in Review and open “How it decides”.', line: 'Under the grades, a fold says in plain words what Review aims for and why this card comes back when it does.',
    show: { view: 'review', text: 'Turn a card over, then open “How it decides” under the grades.' } },
  { id: 'tagpriority', group: 'Remembering', name: 'Pause a tag, or keep it ticking', tryIt: 'Open a tag, choose “Manage”, then “Maintaining” or “Paused”.', line: 'Set a tag to “Maintaining” and its cards keep coming back but no new ones start; “Paused” pauses all of them.',
    show: { view: 'tags', at: ROW, text: 'Open a tag, choose “Manage”, and pick “Learning”, “Maintaining” or “Paused”.' }, used: (s) => s.priority },
  { id: 'listcards', group: 'Remembering', name: 'Paste a list, get cards', tryIt: 'Paste a few lines like Ephemeral - lasting a very short time.', line: 'Paste lines of “term - meaning” into any note and a toast offers to make each one a card.',
    show: { view: 'day', at: '.tiptap.ProseMirror', text: 'Paste three lines of term - meaning, then choose “Make 3 cards”.' } },
  { id: 'strength', group: 'Remembering', name: 'A card’s own history', tryIt: 'Open a gem you have reviewed, click “Details”, and open “Comes back”.', line: 'Every gem you review keeps its dated grades, and a line of how long it would hold after each one.',
    show: { view: 'nuggets', focus: async () => (await haligtree.items('nugget')).find((item) => item.prompt && item.reviewed > 0 && !item.suspended)?.id, at: '[data-strength]', text: 'Its dated grades and strength line, under “Comes back” in “Details”.' } },
  { id: 'fit', group: 'Remembering', name: 'Review fitted to your memory', tryIt: 'In Settings, Review, choose “Fit now” once you have a thousand reviews.', line: `After a thousand reviews, ${APP_NAME} works out how long a new card lasts for you, from whether you remembered it next time.`,
    show: { view: 'settings', settings: 'Review', find: 'Fit to my memory', at: '[data-setting]', text: 'It counts your reviews until there are enough.' } },
  { id: 'daysinarow', group: 'Remembering', name: 'Days in a row, rest days banked', line: 'Review quietly counts the days in a row you reviewed; each full week banks a rest day, up to three, and a day off spends one instead of ending the run.',
    show: { view: 'review', text: 'The count sits at the top left of Review, and under Done, once you have two days in a row.' } },

  // Tasks and time
  { id: 'checkback', group: 'Tasks and time', name: 'Check back on a date', tryIt: 'In quick capture, pick the kind “Check back”, then set its day and its question under the title.', line: `A decision to look at again, or something to try for a while: give it a date and a question, and on that day ${APP_NAME} asks you. Your answer is kept under it.`,
    show: { view: 'kind:checkback', at: ROW, text: 'Each Check back, with the day it comes back and what it asks.' }, used: (s) => s.kinds.has('checkback') },
  { id: 'practiseit', group: 'Tasks and time', name: 'Practise a routine', tryIt: 'Open a repeating task and turn on “Practise it”.', line: 'Turn on “Practise it” on a repeating task: at its time it offers 5 minutes, opens with your material, and afterwards writes a line in its log and asks “What stuck?”.',
    show: { view: 'routines', at: ROW, text: 'Open a routine: “Practise it” is in its details.' } },
  { id: 'goals', group: 'Tasks and time', name: 'Goals with a road there', tryIt: 'Open a goal and write what you did in its progress log.', line: 'A goal has a day, a line that fills as the day comes closer, and a progress log. Made progress? In quick capture, start with + and its name, like “+chapter three: 600 words”.', keys: ['G E'],
    show: { view: 'goals', at: ROW, text: 'Each goal, with how far along it is.' }, used: (s) => s.items.some((item) => item.tier === 'goal') },
  { id: 'matrix', group: 'Tasks and time', name: 'Urgent and important', line: 'Your tasks in four boxes, by how soon and how much they matter.', keys: ['G Q'],
    show: { view: 'matrix', at: '[data-quadrant]', text: 'Drag a task to another box, or pick one with J and K and press 1 to 4.' } },
  { id: 'routines', group: 'Tasks and time', name: 'Routines', tryIt: 'Type a task that ends with every Monday.', line: 'Say every day, every Monday or every 3 days, and the task comes back by itself.', keys: ['G O'],
    show: { view: 'routines', at: ROW, text: 'Every task that repeats.' }, used: (s) => s.tasks.some((task) => !!task.recurrence) },
  { id: 'focus', group: 'Tasks and time', name: 'Focus on one task', line: 'Start a session on a task, and the session bubble floats over your screen until you are done.',
    show: { view: 'today', at: ROW, text: 'Open a task, choose “Start a focus session”, then “Start”.' }, used: (s) => s.steps.focus },
  { id: 'lengths', group: 'Tasks and time', name: 'How long a task takes', tryIt: 'Type a task that ends with ~30m.', line: 'Write ~30m or ~1h on a task, and with “Day progress and planning hints” on in Settings, Today sets the hours planned beside the hours left before your day ends.',
    show: { view: 'settings', settings: 'Tasks', find: 'Day progress and planning hints', at: '[data-setting]', text: 'Turn it on, then write ~30m on a task to plan it.' }, used: (s) => s.tasks.some((task) => !!task.estimate) },
  { id: 'closeday', group: 'Tasks and time', name: 'Close the day', tryIt: 'Press ⌘K and choose “Close the day”.', line: 'Each evening, a short look back: what got done, each open task sent to tomorrow, next week or closed without doing, a line for today’s page and the one task to start tomorrow with.', keys: ['⌘K'],
    show: { view: 'settings', settings: 'What comes back to you', find: 'Close the day', at: '[data-setting]', text: 'Pick when it is offered each evening, or press ⌘K and choose “Close the day”.' } },
  { id: 'frog', group: 'Tasks and time', name: 'Eat the frog', tryIt: 'Right-click a task and choose “Date”, then “Do this first today”.', line: 'Mark the one task to do first, and it leads Today and the day’s report until the day is out.',
    show: { view: 'today', at: ROW, text: 'Right-click a task and choose “Date”, then “Do this first today”.' } },
  { id: 'writeday', group: 'Tasks and time', name: 'Write out your day', tryIt: 'In Tasks, choose “Write out my day”, write a line and press ↵.', line: 'Today’s list is written in where it stands: “Write out my day”, or a click under the list, puts the caret on a new line at its end, and O on a task starts one under it (⇧O above). A task a line, ↵ for the next, ⇥ for a step and ⇧⇥ out, ⌫ on an empty line takes it away; dates, times, #tags and !! light up as you type.', keys: ['O', '↵', '⇥', '⇧⇥'],
    show: { view: 'today', at: '[data-write-day]', find: 'Write out my day', text: 'Choose “Write out my day”, then write a line and press ↵.' } },
  { id: 'linetasks', group: 'Tasks and time', name: 'Lines into tasks', tryIt: 'Select three lines in a note and choose “3 tasks”.', line: 'Several lines of a note made tasks at once, each line keeps a box that ticks with its task.',
    show: { view: 'inbox', text: 'Open a note, select a few lines, and choose “tasks” in the bar.' } },
  { id: '135', group: 'Tasks and time', name: '1-3-5', tryIt: 'In Today, press F and pick “1-3-5” under “Grouping”.', line: 'Lay Today out as one big thing, three medium and five small, in the order you give them.',
    show: { view: 'today', at: '[data-display]', text: 'Press F or click here, and pick “1-3-5” under “Grouping”.' } },
  { id: 'pickup', group: 'Tasks and time', name: 'Where you pick up', line: 'As a focus session ends, say where you will pick up, and the task shows it at the top when you next open it.',
    show: { view: 'today', at: ROW, text: 'Finish a focus session, and answer “Where do you pick up next time?”' } },
  { id: 'countin', group: 'Tasks and time', name: 'The five-second rule', tryIt: 'In Settings, turn on “Count in a session”.', line: 'A session can count 5, 4, 3, 2, 1 with a tick each before its clock starts.',
    show: { view: 'settings', settings: 'Appearance', find: 'Count in a session', at: '[data-setting]', text: 'Turn it on, then start a session.' } },
  { id: 'later', group: 'Tasks and time', name: 'Later, not lost', tryIt: 'Type a task that ends with someday.', line: 'What has no day yet waits in This month, This year or Someday.', keys: ['G Z'],
    show: { view: 'later', at: ROW, text: 'Tasks without a day.' } },

  // Days and seasons
  { id: 'pages', group: 'Days and seasons', name: 'A page for every day, week and month', tryIt: 'Switch between “Day”, “Week”, “Month” and “Year” at the top of a page.', line: 'Write on today’s page, then step back to the week and the month in a few lines each.', keys: ['G P'],
    show: { view: 'day', at: '[aria-label="Week"]', text: 'Switch between “Day”, “Week”, “Month” and “Year” here.' } },
  { id: 'year', group: 'Days and seasons', name: 'Your year in seasons', line: 'Name each month’s season of life, and see the year as the story it was.',
    show: { view: 'yearpage', text: 'Name a month’s season on its page, and it shows here.' }, used: (s) => s.season },
  { id: 'milestones', group: 'Days and seasons', name: 'Mark a day', tryIt: 'Right-click any day on the year, month or week, or type !milestone Exam on 3 Dec in quick capture.', line: 'Give any day a purpose, like Exam, Launch or Mum’s birthday, and count down to it from the Journal and the menu bar.',
    show: { view: 'yearpage', at: '[data-year-marks]', text: 'Each marked day stands tall here. Right-click any day to mark it.' } },
  { id: 'calendar', group: 'Days and seasons', name: 'The month at a glance', line: 'Each day on Month’s page shows whether it has a page, how much you reviewed, its marked days and exams, and the cards still to come.', keys: ['G M'],
    show: { view: 'monthpage', at: '[data-month-legend]', text: 'What each mark means. Click a day to open it.' } },
  { id: 'maccalendar', group: 'Days and seasons', name: 'Your Mac’s calendar', tryIt: 'In Settings, turn on “Your Mac’s calendar”.', line: 'Your calendar’s events in Today’s report and the week, read only, once macOS has asked you.',
    show: { view: 'settings', settings: 'What comes back to you', find: 'calendar', at: '[data-setting]', text: 'Turn it on; macOS asks once.' } },
  { id: 'weekparagraph', group: 'Days and seasons', name: 'Your week, in a paragraph', needs: 'ai', tryIt: 'On the Week page, choose “Your week, in a paragraph”.', line: 'Apple Intelligence on your Mac writes your week in a few sentences from the notes you kept in it. You read it first, keep it as the week’s summary only if you want, and change it as you like; Wrapped ends with it too.',
    show: { view: 'weekpage', at: '[data-ai-week]', text: 'Choose “Your week, in a paragraph”: nothing is kept until you say.' } },
  { id: 'sun', group: 'Days and seasons', name: 'Evening at sunset', needs: 'every', tryIt: 'In Settings, turn on “Evening at sunset”.', line: 'Close the day, “For tomorrow” and the scenery’s light follow the sun where you are, not a fixed hour: from your Mac’s time zone, or a city you pick. Never your location.',
    show: { view: 'settings', settings: 'What comes back to you', find: 'Evening at sunset', at: '[data-setting]', text: 'Turn it on, and pick a city if the time zone’s is far from you.' } },
  { id: 'digest', group: 'Days and seasons', name: 'A weekly digest', line: 'On Sundays, Home sums up your week: caught, kept, reviewed and finished, and from 6 in the evening a notification says it too. Nothing leaves your Mac.',
    show: { view: 'settings', settings: 'What comes back to you', find: 'Weekly digest', at: '[data-setting]', text: 'On by default; turn it off here.' } },
  { id: 'book', group: 'Reading and questions', name: '#book: stars and a takeaway', tryIt: 'Tag a note #book, then give it stars under “Details” at the top right.', line: 'Tag a note #book to give it a reading status, a rating out of five and what you will keep from it.',
    show: { view: 'tags', find: '#book', at: ROW, text: 'Notes tagged #book get a status, stars and a takeaway.' }, used: (s) => s.rated },
  { id: 'pace', group: 'Reading and questions', name: 'Your pace through a book', needs: 'every', tryIt: 'Read a PDF on two different days, then look under it in “Continue reading” on Home.', line: 'After two days of reading a PDF, its card on Home and its Details say the day you finish it at the pages a day you go at.',
    show: { view: 'home', at: '[data-reading-row]', text: 'Under each book you are reading: your page, and the day you finish it at your pace.' } },
  { id: 'wrapped', group: 'Days and seasons', name: 'Your month and year, wrapped', tryIt: 'Press ⌘K and choose “Your month in notes, wrapped”.', line: 'What you caught, your busiest day, the books you finished, played back like a story.',
    show: { view: 'stats', text: 'Stats, and ⌘K for “Your month in notes, wrapped”.' } },
  { id: 'map', group: 'Reading and questions', name: 'A map of what links to what', tryIt: 'Open the map and click a dot.', line: 'Every note you have linked, drawn as dots and lines.', keys: ['G X'],
    show: { view: 'map', text: 'Drag to move around. Click a dot to open it.' } },

  // Windows and your Mac
  { id: 'stickies', group: 'Windows and your Mac', name: 'Sticky notes on your desktop', line: 'Put a note or today’s tasks on your desktop, over everything, like paper, and ⌃⌥⌘N hides or shows them all.', keys: ['⌃⌥⌘N'],
    show: { view: 'inbox', at: ROW, text: 'Right-click a note and choose “Stick on the desktop”; today’s page has “Stick on the desktop” for its tasks.' }, used: (s) => s.steps.stick },
  { id: 'recordings', group: 'Windows and your Mac', name: 'Hidden from screen recordings', tryIt: 'Before you share your screen, turn on “The main window” under “Hide from recordings”, or hide it all from ⌘K.', line: `Hidden, ${APP_NAME} is left out of a shared screen, while you still see it; screenshots and some recorders still show it, so try yours once. The main window, quick capture, sticky notes and the session bubble each have their own switch.`,
    show: { view: 'settings', settings: 'What comes back to you', find: 'Hide from recordings', at: '[data-setting]', text: 'Each kind of window stays out of a shared screen while its switch is on. Turn one on before you share your screen.' } },
  { id: 'window', group: 'Windows and your Mac', name: 'A note in its own window', line: '⌥⌘-click a note in your Inbox to open it in a window of its own, beside whatever you are doing (⌘-click picks it, as in Finder).',
    show: { view: 'inbox', at: ROW, text: '⌥⌘-click a row to open it in its own window.' } },
  { id: 'split', group: 'Windows and your Mac', name: 'Splits and tabs', line: 'Press ⌘\\ to split the page, then ⌘O to open anything there: a page, a note, a task, a day or a place like the Inbox. Each side has its own row of tabs: ⌘-click anything for a new tab, drag a tab to the other side, or to an edge for a new split. ⌃H and ⌃L move between sides, ⌃Tab between tabs, ⌃W closes one.', keys: ['⌘\\', '⌘O', '⌃Tab'],
    show: { view: 'inbox', at: ROW, text: 'Press ⌘\\, then ⌘O, type the name of a page, then ↵.' } },
  { id: 'spotlight', group: 'Windows and your Mac', name: 'Your notes in Spotlight', needs: 'every', tryIt: 'Press ⌘Space and type a few words from one of your notes.', line: `⌘Space finds your notes by their words, from anywhere on your Mac, and opens them in ${APP_NAME}. Private and #bit notes are never in it, and one switch in Settings takes them all out. Once ${APP_NAME} is in your Applications folder.`,
    show: { view: 'settings', settings: 'What comes back to you', find: 'Your notes in Spotlight', at: '[data-setting]', text: 'On, unless you turn it off here.' } },
  { id: 'finder', group: 'Windows and your Mac', name: 'Send files from Finder', needs: 'every', tryIt: 'In Finder, right-click any file, then Quick Actions or Services, “Send to Haligtree”.', line: `Any file picked in Finder (a picture, a PDF, a video, a Word or Pages file, a ZIP) goes into Files from its right-click, with no note made; Markdown and text come in as a note. Once ${APP_NAME} is in your Applications folder.`,
    show: { view: 'media', text: 'In Finder: right-click, Quick Actions or Services, “Send to Haligtree”.' } },
  { id: 'safe', group: 'Windows and your Mac', name: 'Safe mode', line: 'One key stops hints, old captures and favorites coming up on their own, for when someone is looking over your shoulder.', keys: ['⌥⌘S'],
    show: { view: 'inbox', at: ROW, text: 'Press ⌥⌘S, and again to come back.' } },
  { id: 'notch', group: 'Windows and your Mac', name: 'The bubble in the notch', tryIt: 'In Settings, set “Bubble sits” to “Under the notch”.', line: 'On a Mac with a notch, the session bubble can sit tucked around it, the time beside it, and open when you point at it.',
    show: { view: 'settings', settings: 'Appearance', find: 'Bubble sits', at: '[data-setting]', text: 'Choose “Under the notch”. On a Mac without one, the bubble stays where you put it.' } },
  { id: 'news', group: 'Windows and your Mac', name: 'What’s new', tryIt: 'Press ⌘K and choose “What’s new”.', line: `After an update, Home shows what changed once, each with a “Show me”; ⌘K and the ${APP_NAME} menu open the whole list any time.`, keys: ['⌘K'],
    show: { view: 'day', text: 'Press ⌘K and choose “What’s new”.' } },
  { id: 'bin', group: 'Windows and your Mac', name: 'One Bin, with Restore', tryIt: 'Press G D.', line: 'Captures, tasks closed without doing and notes you move to the Bin wait in one place, each with “Restore”, until you hold to empty it.', keys: ['G D'],
    show: { view: 'discarded', at: '[data-bin]', text: '“Restore” brings one back; “Hold to empty” lets them all go for good.' } },
  { id: 'lock', group: 'Windows and your Mac', name: 'Lock a note', line: 'Lock the note open in quick capture as read only, so a stray key cannot change it; the next note opens unlocked.',
    show: { box: true, text: 'In quick capture, open the gear menu at the top right and choose “Lock”.' } },

  // Catching: the notes you already have
  { id: 'vault', group: 'Catching', name: 'An Obsidian vault or Notion export', tryIt: 'In Settings, “Import and backups”, choose “Obsidian or Notion…”, pick the folder and choose which of its folders to bring in; nothing in it is changed.', line: 'Bring a whole folder of notes in at once, links and properties kept.',
    show: { view: 'settings', settings: 'Import and backups', find: 'Obsidian', at: '[data-setting]', text: 'Pick the folder, then choose which of its folders to bring in. Each becomes a group in Writing, and nothing in it is changed.' } },
  { id: 'files', group: 'Catching', name: 'Highlights and cards', tryIt: 'In Settings, “Import and backups”, choose “Files…”.', line: 'Readwise and Kindle highlights, Markdown files, bookmarks and Anki cards.',
    show: { view: 'settings', settings: 'Import and backups', find: 'Files…', at: '[data-setting]', text: '“Files…” takes any of these.' } },
  { id: 'scan', group: 'Catching', name: 'A scanned book you can search', needs: 'every', tryIt: 'Open a scanned PDF and choose “Read the text on these pages”.', line: 'A PDF whose pages are only pictures of words is read by your Mac, page by page, and kept with the book, so you can find, highlight, make cards from and listen to it like any other.',
    show: { view: 'nuggets', text: 'Open a scanned PDF: the line under its bar offers to read it.' } },
  { id: 'embeds', group: 'Writing', name: 'Pasted embeds fill themselves in', line: `Paste a note from Obsidian with ![[picture.png]] in it, and ${APP_NAME} brings in the pictures and files it points to.`,
    show: { view: 'day', at: '.tiptap.ProseMirror', text: 'Paste a note with ![[a picture]] into any page.' } }
]

/** What your own notes say you have done: each cheap to read, and only what is certain. */
type Signs = {
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
    Promise.all((['nugget', 'article', 'question', 'goal'] as const).map((tier) => haligtree.items(tier))).then((all) => all.flat()),
    haligtree.tasks(),
    haligtree.tags(),
    window.api.captures.list(),
    haligtree.year(String(new Date().getFullYear())).catch(() => [])
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
    const books = (await haligtree.tag('book')).slice(0, 40)
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

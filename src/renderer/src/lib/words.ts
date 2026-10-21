/**
 * Vigil's own words: the names it gives things in a sense nobody would guess
 * from the word alone. Each one, wherever it is a heading, is a door to a
 * short note (components/vigil/term.tsx): a line on hover, the note on a click,
 * and `gloss?` in ⌘K reaches the same note without one on screen.
 *
 * A note reads like something found in a margin, not a manual: what it means
 * here, led in bold, one thing to try, then where the word came from. Where a word's
 * history is uncertain, it says so rather than tell a tidy story.
 */
import { APP_NAME } from '../../../main/name'

export type Word = {
  id: string
  /** Every spelling it answers to, the name it is shown under first. */
  forms: string[]
  /** What it means here, in one line: the hover. */
  line: string
  /** Where it came from, in a few words, under its name. */
  origin: string
  /** What it is here: a bold lead-in (`**…**`, components/vigil/lead.tsx), then one plain sentence. */
  here: string
  /** One thing to try, the note's italic line. */
  try: string
  /** Where the word came from, told for whoever wants it. */
  history: string
  /** Its neighbours, each a door to its own note. */
  see: string[]
}

export const WORDS: Word[] = [
  {
    id: 'vigil',
    forms: [APP_NAME],
    line: 'This app: a tree that holds what you notice and grows it',
    origin: 'Old English hālig, holy, and trēow, tree',
    here: `**This app keeps what you notice and grows it.** You stop holding it all in your head, and ${APP_NAME} brings it back when it matters.`,
    try: 'Press ⌘. anywhere and write the thing down.',
    history: 'Hālig is the Old English root of holy and hallow, and trēow of tree. A hallowed tree was one kept and tended, never cut, where people came back season after season.',
    see: ['capture', 'kept', 'surfacing']
  },
  {
    id: 'capture',
    forms: ['Capture', 'Captures'],
    line: 'Anything you write in quick capture, before you decide what it is',
    origin: 'Latin captura, a taking',
    here: '**Whatever you caught in quick capture.** A line, a link, a quote or half a thought; it does not have to be good or finished.',
    try: 'Press ⌘., type, and press ⌘↵. It waits in the Inbox.',
    history: 'From Latin capere, to take or seize, the same root as captive and capable.',
    see: ['inbox', 'promote', 'tidy']
  },
  {
    id: 'inbox',
    forms: ['Inbox'],
    line: 'Where every capture waits until you deal with it',
    origin: 'From the office in-tray',
    here: '**Every capture you have not dealt with yet.** Each one leaves when you do: P saves it as a gem, R marks it finished, D moves it to the Bin.',
    try: 'Press P, R or D on one in the Inbox; leaving one waiting is fine too.',
    history: 'Desks once had two wire trays, in and out: papers arrived in one and left by the other. Email borrowed the in-tray as the inbox.',
    see: ['capture', 'tidy', 'decide']
  },
  {
    id: 'promote',
    forms: ['Save as a gem', 'Saved as a gem'],
    line: 'Save a capture for good, as a gem',
    origin: 'Plain words: it is kept, as one of your gems',
    here: '**Saving a capture for good, as a gem.** It moves out of the Inbox into what you save, and can come back to you later.',
    try: 'Press P on one in the Inbox.',
    history: 'A commonplace book kept only what was worth copying out; the rest of the day’s scraps were let go. Saving one as a gem is that copying out.',
    see: ['nugget', 'inbox', 'kept']
  },
  {
    id: 'nugget',
    forms: ['Gem', 'Gems'],
    line: 'Something you saved, in your own words, that can come back to you',
    origin: 'Latin gemma, a bud, then a precious stone',
    here: '**A capture worth keeping, said your way.** Gems come back as hints, and as review cards once you give one a question.',
    try: 'Open one and add a thought saying why you saved it.',
    history: 'Gem comes from Latin gemma, first the bud on a vine, then a precious stone cut from the rough. English has used it since the 1300s for anything small and worth keeping, like a gem of a line.',
    see: ['promote', 'review', 'gloss']
  },
  {
    id: 'kept',
    forms: ['Saved'],
    line: 'Everything you chose to keep: gems, writing, questions and goals',
    origin: 'Latin salvare, to make safe',
    here: `**The shelf of what you meant to hold on to.** It makes ${APP_NAME} a commonplace book of your own.`,
    try: 'In quick capture, the Saved tab shows your gems, writing and questions beside whatever you are writing.',
    history: 'Save comes through Old French sauver from Latin salvare, to make safe. Readers in the Renaissance kept commonplace books: notebooks of passages worth saving, filed under headings, so they could find them again and think with them.',
    see: ['nugget', 'holding', 'surfacing']
  },
  {
    id: 'gloss',
    forms: ['Thoughts', 'Thought', 'Thoughts on this note', 'Gloss', 'Glosses'],
    line: 'A dated thought on a note: what it means to you now',
    origin: 'Old English þōht, what is in the mind',
    here: '**Your reaction to a thing, kept beside it with its date.** Past you and present you can disagree in the open.',
    try: 'Add one under “Thoughts on this note” beside any capture or gem, or press ⌘; on a search result.',
    history: 'Thought is Old English þōht, from the same root as think. Medieval readers wrote theirs in the margins of books, dated or not, and later copyists sometimes folded them into the text as if the author had written them.',
    see: ['nugget', 'clue', 'review']
  },
  {
    id: 'surfacing',
    forms: ['Surfacing', 'Surface'],
    line: 'Whether this may come back to you unasked, as a hint or a card',
    origin: 'Rising from below',
    here: '**Whether a kept thing may come up to meet you, in quick capture and on Home.** Private keeps it out of hints; a pin keeps it in view.',
    try: 'Mark something private if you never want it offered as a hint.',
    history: 'To surface is to come up from underneath, as a diver or a whale does. The noun is older: French sur, over, and face, the outer side of a thing.',
    see: ['rot', 'kept', 'review']
  },
  {
    id: 'holding',
    forms: ['Questions'],
    line: 'Questions you are carrying, not ready to answer yet',
    origin: 'Latin quaerere, to seek',
    here: '**Where the questions you carry live.** Nothing here needs settling: add clues as they turn up, and settle one only when it comes clear.',
    try: 'Press ⌘K and choose “New question”, for one you keep coming back to.',
    history: 'Question comes from Latin quaestio, a seeking, from quaerere, to seek. In 1903 Rilke wrote to a young poet to be patient with what is unsolved in his heart and to live the questions now.',
    see: ['clue', 'kept', 'surfacing']
  },
  {
    id: 'clue',
    forms: ['Clue', 'Clues'],
    line: 'Something that turned up toward a question you are holding',
    origin: 'A ball of thread',
    here: '**Something you found that bears on a question you are holding.** It needs no conclusion.',
    try: 'Drop one in from quick capture while a question shows there.',
    history: 'A clue, or clew, was a ball of thread. In the Greek story, Theseus unwound Ariadne’s thread through the Labyrinth and followed it back out, so a clue came to mean anything that leads you through a puzzle.',
    see: ['holding', 'gloss', 'capture']
  },
  {
    id: 'review',
    forms: ['Review'],
    line: 'Cards that come back as you start to forget them',
    origin: 'Latin revidere, to see again',
    here: '**Your cards come back just as you would forget them.** Every card waits longer each time you remember it.',
    try: 'Press Space to turn one over, then 1 to 4 for how well you knew it.',
    history: 'From French revoir and Latin revidere, to see again. In 1885 Hermann Ebbinghaus measured how fast he forgot lists of nonsense syllables; seeing a thing again just as it fades is what makes it stay.',
    see: ['nugget', 'surfacing', 'gloss']
  },
  {
    id: 'tidy',
    forms: ['Tidy', 'Daily tidy'],
    line: 'A few minutes over the latest captures: tags and formatting, no decisions',
    origin: 'Middle English, timely',
    here: '**A few minutes a day over your latest captures, deciding nothing.** Add a tag, bold the line that matters, fold a section, cross off what is done.',
    try: 'Press ⌘K and choose “Tidy captures”.',
    history: 'Tidy comes from tide, which once meant time or season, so tidy first meant timely, in season. Only later did it come to mean neat and in good order.',
    see: ['decide', 'inbox', 'rot']
  },
  {
    id: 'decide',
    forms: ['Decide', 'Deciding', 'Deciding day'],
    line: 'Once a week, go over what waited: keep it, act on it, or move it to the Bin',
    origin: 'Latin decidere, to cut off',
    here: '**Once a week, a look over what waited.** On the day you pick in Settings: what you set aside and what has waited longest, to keep, finish or move to the Bin, and leaving one waiting is a choice too.',
    try: 'Press ⌘K and choose “Decide what to keep”.',
    history: 'From Latin de-, off, and caedere, to cut, the same cut as in incision. To decide is to cut away the other choices.',
    see: ['tidy', 'inbox', 'later']
  },
  {
    id: 'later',
    forms: ['Later'],
    line: 'Tasks for this month, this year, next year or someday, with no date yet',
    origin: 'Old English læt, slow',
    here: '**Tasks you mean to do, but not on any day yet.** They wait without nagging in four lists: this month, this year, next year and someday.',
    try: 'Right-click a task to put it in one; G Z brings you here.',
    history: 'Late comes from Old English læt, slow or sluggish; later is simply more so.',
    see: ['decide', 'inbox', 'season']
  },
  {
    id: 'rot',
    forms: ['Old captures', 'Old capture', 'Captures that come back'],
    line: 'A few old captures you have not dealt with, shown each time you open quick capture',
    origin: 'Old English eald, grown up',
    here: '**A few old captures that come back each time you open quick capture.** Never the whole pile, and they ask only for a tidy.',
    try: 'Settings, What comes back to you, says how many.',
    history: 'Old is Old English eald, which first meant grown or full grown. A note left untouched does not spoil, but it does lose the reason you wrote it.',
    see: ['tidy', 'surfacing', 'inbox']
  },
  {
    id: 'season',
    forms: ['Season', 'Seasons', 'Season of life', 'Seasons of life'],
    line: 'A name for what a month was really about, given looking back',
    origin: 'Latin satio, a sowing',
    here: '**A name you give a month afterwards, when you can see the story you were inside.** Each month’s page has a field for it, and Year’s page lines them up.',
    try: 'Name last month’s.',
    history: 'Season comes through Old French seson from Latin satio, a sowing: the season was first the time for planting.',
    see: ['wrapped', 'later', 'review']
  },
  {
    id: 'wrapped',
    forms: ['Wrapped'],
    line: 'Your month or your year, told back to you in a few pages',
    origin: 'After Spotify Wrapped',
    here: '**Your month or year, told back to you in a few pages.** It covers what you caught, kept and finished.',
    try: 'Ask ⌘K for your month, wrapped, or your year.',
    history: 'Since 2016 Spotify has sent its listeners a Wrapped each December: their year, told back as a few bright pages. The name stuck to the idea.',
    see: ['season', 'review', 'kept']
  },
  {
    id: 'scenery',
    forms: ['Scenery'],
    line: 'Pictures from your own folders, shown only where you rest',
    origin: 'Greek skēnē, a tent',
    here: '**Pictures from your own folders, at the quiet moments only.** An empty inbox, a finished review, the top of today’s page, and dimmed behind Focus and while you tidy or decide.',
    try: 'Point Settings, Scenery, at a folder you love.',
    history: 'The Greek skēnē was a tent or hut; in the theatre it became the building behind the stage. Scenery came to mean the painted backdrops set up there.',
    see: ['wrapped', 'sandbox', 'sticky']
  },
  {
    id: 'sticky',
    forms: ['Sticky', 'Stickies', 'Sticky notes', 'Sticky note'],
    line: 'A note stuck on your desktop, where you left it',
    origin: 'After the Post-it',
    here: '**Any note, stuck on the desktop where you put it.** Now and then one stirs a little, so your eye finds it again.',
    try: '⌃⌥⌘N shows or hides them all.',
    history: 'In 1968 Spencer Silver at 3M made a glue too weak to be useful. Years later his colleague Art Fry used it to keep bookmarks from falling out of his hymn book, and Post-it notes went on sale in 1980.',
    see: ['beacon', 'surfacing', 'scenery']
  },
  {
    id: 'beacon',
    forms: ['Goal card', 'Goal cards'],
    line: 'A goal’s small card on screen, with the days left',
    origin: 'Perhaps Old English gāl, a limit',
    here: '**A goal’s small card on every Space, with the days left.** It keeps the goal in sight.',
    try: 'Settings, What comes back to you, says when it shows.',
    history: 'Goal may come from Old English gāl, a barrier or limit, though nobody is sure; by the 1500s it was the post at the end of a race. The card keeps that post in view.',
    see: ['sticky', 'surfacing', 'kept']
  },
  {
    id: 'sandbox',
    forms: ['Sandbox'],
    line: "A peek into someone else's book, apart from your own notes",
    origin: 'A box of sand to play in',
    here: "**A peek into someone else's book: their reading, films, questions and goals.** Try anything there; your own notes are never touched.",
    try: 'Open it from ⌘K, and come back the same way.',
    history: 'A sandbox was a box of sand for children to dig in, safely inside its edges. Programmers borrowed the word for a place to try things that cannot harm the real system.',
    see: ['vigil', 'capture', 'scenery']
  }
]

const BY_FORM = new Map(WORDS.flatMap((word) => word.forms.map((form) => [form.toLowerCase(), word] as const)))

/** The word a heading or a typed line names, said any way it answers to. */
export function wordFor(text: string): Word | undefined {
  return BY_FORM.get(text.trim().toLowerCase().replace(/\s+/g, ' '))
}

/** One by its id. */
export const word = (id: string): Word | undefined => WORDS.find((one) => one.id === id)

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
    forms: ['Vigil'],
    line: 'This app: a place that stays awake to what you notice',
    origin: 'Latin vigilia, a staying awake',
    here: '**This app keeps watch over what you notice.** You stop holding it all in your head, and Vigil brings it back when it matters.',
    try: 'Press ⌘. anywhere and write the thing down.',
    history: 'A vigil was a night watch: soldiers on guard, or the faithful awake before a feast day. The root is Latin vigil, awake, the same as in vigilant.',
    see: ['capture', 'kept', 'surfacing']
  },
  {
    id: 'capture',
    forms: ['Capture', 'Captures'],
    line: 'Anything you write in the box, before you decide what it is',
    origin: 'Latin captura, a taking',
    here: '**Whatever you caught in the box.** A line, a link, a quote or half a thought; it does not have to be good or finished.',
    try: 'Press ⌘., type, and press Enter. It waits in the Inbox.',
    history: 'From Latin capere, to take or seize, the same root as captive and capable.',
    see: ['inbox', 'promote', 'tidy']
  },
  {
    id: 'inbox',
    forms: ['Inbox'],
    line: 'Where every capture waits until it leaves by one of its exits',
    origin: 'From the office in-tray',
    here: '**Every capture that has not left yet.** Each leaves by an exit: P saves it as an idea, R marks it finished, D lets it go.',
    try: 'Press P, R or D on one in the Inbox; leaving one waiting is fine too.',
    history: 'Desks once had two wire trays, in and out: papers arrived in one and left by the other. Email borrowed the in-tray as the inbox.',
    see: ['capture', 'tidy', 'decide']
  },
  {
    id: 'promote',
    forms: ['Promote', 'Promoted'],
    line: 'Save a capture for good, as an idea',
    origin: 'Latin promovere, to move forward',
    here: '**Saving a capture for good, as an idea.** It moves out of the Inbox into what you save, and can come back to you later.',
    try: 'Press P on one in the Inbox.',
    history: 'From Latin pro-, forward, and movere, to move. A soldier promoted moves up a rank.',
    see: ['nugget', 'inbox', 'kept']
  },
  {
    id: 'nugget',
    forms: ['Idea', 'Ideas'],
    line: 'Something you saved, in your own words, that can come back to you',
    origin: 'Greek idea, the look of a thing',
    here: '**A capture worth keeping, said your way.** Ideas are what come back as hints and review cards.',
    try: 'Open one and add a gloss saying why you saved it.',
    history: 'Idea comes from Greek idea, the look or form of a thing, from idein, to see. Plato used it for the true shape behind what we see; English took it up in the 1500s for a thought in the mind.',
    see: ['promote', 'review', 'gloss']
  },
  {
    id: 'kept',
    forms: ['Saved'],
    line: 'Everything you chose to keep: ideas, writing, questions and goals',
    origin: 'Latin salvare, to make safe',
    here: '**The shelf of what you meant to hold on to.** It makes Vigil a commonplace book of your own.',
    try: 'In the box, the Saved tab shows it beside whatever you are writing.',
    history: 'Save comes through Old French sauver from Latin salvare, to make safe. Readers in the Renaissance kept commonplace books: notebooks of passages worth saving, filed under headings, so they could find them again and think with them.',
    see: ['nugget', 'holding', 'surfacing']
  },
  {
    id: 'gloss',
    forms: ['Gloss', 'Glosses'],
    line: 'Your own note on an item: what it means to you, dated',
    origin: 'Greek glōssa, tongue',
    here: '**Your reaction to a thing, kept beside it with its date.** Past you and present you can disagree in the open.',
    try: 'Add one under Glosses beside any note, or press ⌘; on a search result.',
    history: 'From Greek glōssa, tongue or language, through Latin glossa: first a hard word that needed explaining, then the explanation itself. Medieval scribes wrote glosses between the lines and in the margins, and later copyists sometimes folded them into the text as if the author had written them.',
    see: ['nugget', 'clue', 'review']
  },
  {
    id: 'surfacing',
    forms: ['Surfacing', 'Surface'],
    line: 'Whether this may come back to you unasked, as a hint or a card',
    origin: 'Rising from below',
    here: '**Whether a kept thing may come up to meet you, in the box and on Home.** Private keeps it down; a pin keeps it in view.',
    try: 'Mark something private if you only want it found when you search.',
    history: 'To surface is to come up from underneath, as a diver or a whale does. The noun is older: French sur, over, and face, the outer side of a thing.',
    see: ['rot', 'kept', 'review']
  },
  {
    id: 'holding',
    forms: ['Questions'],
    line: 'Questions you are carrying, not ready to answer yet',
    origin: 'Latin quaerere, to seek',
    here: '**Where the questions you carry live.** Nothing here needs settling: add clues as they turn up, and settle one only when it comes clear.',
    try: 'Press ⌘K, New question, for one you keep coming back to.',
    history: 'Question comes from Latin quaestio, a seeking, from quaerere, to seek. In 1903 Rilke wrote to a young poet to be patient with what is unsolved in his heart and to live the questions now.',
    see: ['clue', 'kept', 'surfacing']
  },
  {
    id: 'clue',
    forms: ['Clue', 'Clues'],
    line: 'Something that turned up toward a question you are holding',
    origin: 'A ball of thread',
    here: '**Something you found that bears on a question you are holding.** It needs no conclusion.',
    try: 'Drop one in from the box while a question is in view.',
    history: 'A clue, or clew, was a ball of thread. In the Greek story, Theseus unwound Ariadne’s thread through the Labyrinth and followed it back out, so a clue came to mean anything that leads you through a puzzle.',
    see: ['holding', 'gloss', 'capture']
  },
  {
    id: 'review',
    forms: ['Review'],
    line: 'Cards that come back just before you would forget them',
    origin: 'Latin revidere, to see again',
    here: '**Your cards come back just as you would forget them.** Each is spaced a little further out every time you know it.',
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
    try: 'Start one from ⌘K, Tidy.',
    history: 'Tidy comes from tide, which once meant time or season, so tidy first meant timely, in season. Only later did it come to mean neat and in good order.',
    see: ['decide', 'inbox', 'rot']
  },
  {
    id: 'decide',
    forms: ['Decide', 'Deciding', 'Deciding day'],
    line: 'The weekly pass over what waited: keep it, act on it, or let it go',
    origin: 'Latin decidere, to cut off',
    here: '**Once a week, the pass over what waited.** On the day you pick in Settings: what you set aside and what has waited longest, each with its exits, and leaving one open is a choice too.',
    try: 'Run it from ⌘K, Decide.',
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
    forms: ['Rot cards', 'Rot card', 'Rot'],
    line: 'A few unhandled captures that come back each time you open the box',
    origin: 'Old English rotian, to decay',
    here: '**A few old captures that come back each time you open the box.** Never the whole pile, and they ask only for a tidy.',
    try: 'Settings, What comes back to you, says how many.',
    history: 'Rot is Old English rotian, to decay. A note left untouched does not spoil, but it does lose the reason you wrote it.',
    see: ['tidy', 'surfacing', 'inbox']
  },
  {
    id: 'season',
    forms: ['Season', 'Seasons', 'Season of life', 'Seasons of life'],
    line: 'A name for what a month was really about, given looking back',
    origin: 'Latin satio, a sowing',
    here: '**A name you give a month afterwards, when you can see the story you were inside.** Each month’s page has a field for it, and the Year page lines them up.',
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
    here: '**Pictures from your own folders, at the quiet moments only.** An empty inbox, a finished review, the top of today’s page; never behind your work.',
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
    forms: ['Beacon'],
    line: 'A goal’s small card on screen, with the days left',
    origin: 'Old English bēacen, a sign',
    here: '**A goal’s small card on every Space, with the days left.** It keeps the goal in sight.',
    try: 'Settings, What comes back to you, says when it shows.',
    history: 'Old English bēacen meant a sign or signal. Beacons were fires laid ready on hilltops, lit one after another to carry a warning across a country.',
    see: ['sticky', 'surfacing', 'kept']
  },
  {
    id: 'sandbox',
    forms: ['Sandbox'],
    line: 'A copy of Vigil full of examples, apart from your own notes',
    origin: 'A box of sand to play in',
    here: '**A separate copy of Vigil, full of examples.** Break anything there; your own notes are never touched.',
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

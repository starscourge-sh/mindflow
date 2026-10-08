/**
 * Vigil's own words: the names it gives things in a sense nobody would guess
 * from the word alone. Each one, wherever it is a heading, is a door to a
 * short note (components/vigil/term.tsx): a line on hover, the note on a click,
 * and `gloss?` in ⌘K reaches the same note without one on screen.
 *
 * A note reads like something found in a margin, not a manual: where the word
 * came from, then what it means here and one thing to try. Where a word's
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
  /** The note: its history, then what it is here. */
  note: string[]
  /** Its neighbours, each a door to its own note. */
  see: string[]
}

export const WORDS: Word[] = [
  {
    id: 'vigil',
    forms: ['Vigil'],
    line: 'This app: a place that stays awake to what you notice',
    origin: 'Latin vigilia, a staying awake',
    note: [
      'A vigil was a night watch: soldiers on guard, or the faithful awake before a feast day. The root is Latin vigil, awake, the same as in vigilant.',
      'Here it keeps watch over what you notice, so you can stop holding it all in your head. Press ⌘. anywhere and write the thing down; Vigil brings it back when it matters.'
    ],
    see: ['capture', 'kept', 'surfacing']
  },
  {
    id: 'capture',
    forms: ['Capture', 'Captures'],
    line: 'Anything you write in the box, before you decide what it is',
    origin: 'Latin captura, a taking',
    note: [
      'From Latin capere, to take or seize, the same root as captive and capable.',
      'A capture is whatever you caught in the box: a line, a link, a quote, half a thought. It does not have to be good or finished. Press ⌘., type, and press Enter; it waits in the Inbox.'
    ],
    see: ['inbox', 'promote', 'tidy']
  },
  {
    id: 'inbox',
    forms: ['Inbox'],
    line: 'Where every capture waits until it leaves by one of its exits',
    origin: 'From the office in-tray',
    note: [
      'Desks once had two wire trays, in and out: papers arrived in one and left by the other. Email borrowed the in-tray as the inbox.',
      'Here it holds every capture that has not left yet. Each leaves by an exit: P promotes it to a nugget, R marks it finished, D lets it go. Leaving one waiting is fine too.'
    ],
    see: ['capture', 'tidy', 'decide']
  },
  {
    id: 'promote',
    forms: ['Promote', 'Promoted'],
    line: 'Keep a capture for good, as a nugget',
    origin: 'Latin promovere, to move forward',
    note: [
      'From Latin pro-, forward, and movere, to move. A soldier promoted moves up a rank.',
      'Promoting a capture moves it out of the Inbox and into what you keep, as a nugget that can come back to you later. Press P on one in the Inbox.'
    ],
    see: ['nugget', 'inbox', 'kept']
  },
  {
    id: 'nugget',
    forms: ['Nugget', 'Nuggets'],
    line: 'Something you kept, in your own words, that can come back to you',
    origin: 'A lump of gold, from the 1850s',
    note: [
      'Nugget turns up in print in the 1850s, in the gold rushes, for a lump of gold dug out whole. Where it came from before that is not certain; it may come from an English dialect word, nug, a lump.',
      'Here a nugget is a capture worth keeping, said your way. Nuggets are what come back as hints and review cards. Open one and add a gloss saying why you kept it.'
    ],
    see: ['promote', 'review', 'gloss']
  },
  {
    id: 'kept',
    forms: ['Kept'],
    line: 'Everything you chose to keep: nuggets, articles, questions and goals',
    origin: 'Old English cēpan, to hold and look after',
    note: [
      'Keep goes back to Old English cēpan, to hold, watch over, look after. Readers in the Renaissance kept commonplace books: notebooks of passages worth keeping, filed under headings, so they could find them again and think with them.',
      'Vigil is one of those. Kept is the shelf of what you meant to hold on to. In the box, the Kept tab shows it beside whatever you are writing.'
    ],
    see: ['nugget', 'holding', 'surfacing']
  },
  {
    id: 'gloss',
    forms: ['Gloss', 'Glosses'],
    line: 'Your own note on an item: what it means to you, dated',
    origin: 'Greek glōssa, tongue',
    note: [
      'From Greek glōssa, tongue or language, through Latin glossa: first a hard word that needed explaining, then the explanation itself. Medieval scribes wrote glosses between the lines and in the margins, and later copyists sometimes folded them into the text as if the author had written them.',
      'Here a gloss is your reaction to a thing, kept beside it with its date, so past you and present you can disagree in the open. Press ⌘; on anything to add one.'
    ],
    see: ['nugget', 'clue', 'review']
  },
  {
    id: 'surfacing',
    forms: ['Surfacing', 'Surface'],
    line: 'Whether this may come back to you unasked, as a hint or a card',
    origin: 'Rising from below',
    note: [
      'To surface is to come up from underneath, as a diver or a whale does. The noun is older: French sur, over, and face, the outer side of a thing.',
      'Vigil sends kept things up to meet you now and then, in the box and on Home. This part says whether an item may come up: Private keeps it down, a pin keeps it in view. Mark something private if you only want it found when you search.'
    ],
    see: ['rot', 'kept', 'review']
  },
  {
    id: 'holding',
    forms: ['Holding'],
    line: 'Questions you are carrying, not ready to answer yet',
    origin: 'Old English healdan, to keep and tend',
    note: [
      'Old English healdan meant to hold, but also to keep, guard and tend. In 1903 Rilke wrote to a young poet to be patient with what is unsolved in his heart and to live the questions now.',
      'Holding is where those questions live. Nothing here needs settling: add clues as they turn up, and settle one only when it comes clear. Try ⌘K, New question, for one you keep coming back to.'
    ],
    see: ['clue', 'kept', 'surfacing']
  },
  {
    id: 'clue',
    forms: ['Clue', 'Clues'],
    line: 'Something that turned up toward a question you are holding',
    origin: 'A ball of thread',
    note: [
      'A clue, or clew, was a ball of thread. In the Greek story, Theseus unwound Ariadne’s thread through the Labyrinth and followed it back out, so a clue came to mean anything that leads you through a puzzle.',
      'Here a clue is a thing you found that bears on a question you are holding. It needs no conclusion. Drop one in from the box while a question is in view.'
    ],
    see: ['holding', 'gloss', 'capture']
  },
  {
    id: 'review',
    forms: ['Review'],
    line: 'Cards that come back just before you would forget them',
    origin: 'Latin revidere, to see again',
    note: [
      'From French revoir and Latin revidere, to see again. In 1885 Hermann Ebbinghaus measured how fast he forgot lists of nonsense syllables; seeing a thing again just as it fades is what makes it stay.',
      'Review brings your cards back on that curve, each one spaced a little further out each time you know it. Press Space to turn one over, then 1 to 4 for how well you knew it.'
    ],
    see: ['nugget', 'surfacing', 'gloss']
  },
  {
    id: 'tidy',
    forms: ['Tidy', 'Daily tidy'],
    line: 'A few minutes over the latest captures: tags and formatting, no decisions',
    origin: 'Middle English, timely',
    note: [
      'Tidy comes from tide, which once meant time or season, so tidy first meant timely, in season. Only later did it come to mean neat and in good order.',
      'The tidy pass is a few minutes a day over your latest captures: add a tag, bold the line that matters, fold a section, cross off what is done. Nothing gets decided there. Start one from ⌘K, Tidy.'
    ],
    see: ['decide', 'inbox', 'rot']
  },
  {
    id: 'decide',
    forms: ['Decide', 'Deciding', 'Deciding day'],
    line: 'The weekly pass over what waited: keep it, act on it, or let it go',
    origin: 'Latin decidere, to cut off',
    note: [
      'From Latin de-, off, and caedere, to cut, the same cut as in incision. To decide is to cut away the other choices.',
      'Once a week, on the day you pick in Settings, Vigil offers the decide pass: what you set aside, and what has waited longest, each with its exits. Leaving one open is a choice too. Try it from ⌘K, Decide.'
    ],
    see: ['tidy', 'inbox', 'later']
  },
  {
    id: 'later',
    forms: ['Later'],
    line: 'Tasks for this month, this year, next year or someday, with no date yet',
    origin: 'Old English læt, slow',
    note: [
      'Late comes from Old English læt, slow or sluggish; later is simply more so.',
      'Later holds the tasks you mean to do but not on any day yet, in four lists: this month, this year, next year and someday. They wait there without nagging. Right-click a task to put it in one, and G Z brings you here.'
    ],
    see: ['decide', 'inbox', 'season']
  },
  {
    id: 'rot',
    forms: ['Rot cards', 'Rot card', 'Rot'],
    line: 'A few unhandled captures that come back each time you open the box',
    origin: 'Old English rotian, to decay',
    note: [
      'Rot is Old English rotian, to decay. A note left untouched does not spoil, but it does lose the reason you wrote it.',
      'So each time you open the box a few old captures come back as rot cards, never the whole pile. They ask only for a tidy. Settings, What comes back to you, says how many.'
    ],
    see: ['tidy', 'surfacing', 'inbox']
  },
  {
    id: 'season',
    forms: ['Season', 'Seasons', 'Season of life', 'Seasons of life'],
    line: 'A name for what a month was really about, given looking back',
    origin: 'Latin satio, a sowing',
    note: [
      'Season comes through Old French seson from Latin satio, a sowing: the season was first the time for planting.',
      'A season of life is a name you give a month afterwards, when you can see the story you were inside. Each month’s page has a field for it, and the Year page lines them up. Name last month’s.'
    ],
    see: ['wrapped', 'later', 'review']
  },
  {
    id: 'wrapped',
    forms: ['Wrapped'],
    line: 'Your month or your year, told back to you in a few pages',
    origin: 'After Spotify Wrapped',
    note: [
      'Since 2016 Spotify has sent its listeners a Wrapped each December: their year, told back as a few bright pages. The name stuck to the idea.',
      'Vigil does the same with what you caught, kept and finished. Ask ⌘K for your month, wrapped, or your year.'
    ],
    see: ['season', 'review', 'kept']
  },
  {
    id: 'scenery',
    forms: ['Scenery'],
    line: 'Pictures from your own folders, shown only where you rest',
    origin: 'Greek skēnē, a tent',
    note: [
      'The Greek skēnē was a tent or hut; in the theatre it became the building behind the stage. Scenery came to mean the painted backdrops set up there.',
      'Here scenery is pictures from your own folders at the quiet moments: an empty inbox, a finished review, the top of today’s page. Never behind your work. Point Settings, Scenery, at a folder you love.'
    ],
    see: ['wrapped', 'sandbox', 'sticky']
  },
  {
    id: 'sticky',
    forms: ['Sticky', 'Stickies', 'Sticky notes', 'Sticky note'],
    line: 'A note stuck on your desktop, where you left it',
    origin: 'After the Post-it',
    note: [
      'In 1968 Spencer Silver at 3M made a glue too weak to be useful. Years later his colleague Art Fry used it to keep bookmarks from falling out of his hymn book, and Post-it notes went on sale in 1980.',
      'Here any note can be stuck on the desktop and stays where you put it. Now and then one stirs a little, so your eye finds it again. ⌃⌥⌘N shows or hides them all.'
    ],
    see: ['beacon', 'surfacing', 'scenery']
  },
  {
    id: 'beacon',
    forms: ['Beacon'],
    line: 'A goal’s small card on screen, with the days left',
    origin: 'Old English bēacen, a sign',
    note: [
      'Old English bēacen meant a sign or signal. Beacons were fires laid ready on hilltops, lit one after another to carry a warning across a country.',
      'A goal’s beacon is a small card on every Space with the days left, so the goal stays in sight. Settings, What comes back to you, says when it shows.'
    ],
    see: ['sticky', 'surfacing', 'kept']
  },
  {
    id: 'sandbox',
    forms: ['Sandbox'],
    line: 'A copy of Vigil full of examples, apart from your own notes',
    origin: 'A box of sand to play in',
    note: [
      'A sandbox was a box of sand for children to dig in, safely inside its edges. Programmers borrowed the word for a place to try things that cannot harm the real system.',
      'Vigil’s sandbox is a separate copy full of examples. Break anything there; your own notes are never touched. Open it from ⌘K, and come back the same way.'
    ],
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

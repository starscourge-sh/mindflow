import type { JSONContent } from '@tiptap/core'
import { EXAMPLES, STARTERS } from '@/lib/welcome-box'
import { FLOW_WORDS } from '@/components/vigil/welcome-flow'
// The same desert the welcome's Dune card shows (welcome-reel.tsx).
import dunesUrl from '@/assets/welcome/dunes.webp'

import tabletUrl from '@/assets/sandbox/cuneiform-tablet.webp'
import plaqueUrl from '@/assets/sandbox/odysseus-plaque.webp'
import headUrl from '@/assets/sandbox/marble-head.webp'
import frankensteinUrl from '@/assets/sandbox/frankenstein-1831.webp'
import champollionUrl from '@/assets/sandbox/champollion.webp'
import dotUrl from '@/assets/sandbox/pale-blue-dot.webp'
import monaUrl from '@/assets/sandbox/mona-lisa.webp'
import annunciationUrl from '@/assets/sandbox/annunciation.webp'
import supperUrl from '@/assets/sandbox/last-supper.webp'
import adamUrl from '@/assets/sandbox/creation-of-adam.webp'
import primaveraUrl from '@/assets/sandbox/primavera.webp'
import wandererUrl from '@/assets/sandbox/scenery/wanderer.webp'
import montBlancUrl from '@/assets/sandbox/scenery/mont-blanc.webp'
import tahoeUrl from '@/assets/sandbox/scenery/lake-tahoe.webp'
import landersUrl from '@/assets/sandbox/scenery/landers-peak.webp'
import berninaUrl from '@/assets/sandbox/scenery/bernina.webp'
import prairieUrl from '@/assets/sandbox/scenery/evening-prairie.webp'
import jungfrauUrl from '@/assets/sandbox/scenery/jungfrau.webp'
import harborUrl from '@/assets/sandbox/scenery/harbor-entrance.webp'
import mananUrl from '@/assets/sandbox/scenery/grand-manan.webp'
import lucerneUrl from '@/assets/sandbox/scenery/lake-lucerne.webp'
import penobscotUrl from '@/assets/sandbox/scenery/penobscot-bay.webp'

/**
 * What the sandbox holds when it opens: about fifty examples, each teaching
 * one thing Vigil does, in the voice of Nisaba, the Sumerian goddess of
 * writing and keeper of the scribes' tablets.
 *
 * Every rule of the sandbox's writing is here in one place: each note says
 * the one thing it teaches on its first lines, then a "Try it" line asking
 * you to do it right there. The film, myth and history are only the examples;
 * take the reference away and the note still teaches. Copyrighted works get a
 * name or a phrase, never a passage; Homer (Butler, 1900), Marcus Aurelius
 * (Long, 1862) and Leonardo (Richter, 1883) are public domain.
 *
 * Everything goes in through the same calls a person's actions make, so the
 * examples change with the app. The one thing the app cannot do on its own,
 * putting a few dates in the past, is `sandbox:age`, which only the sandbox
 * answers. Dates are counted from the day it is seeded, so a reset always
 * gives the same world, just as fresh.
 */

const v = <T = unknown>(channel: string, ...args: unknown[]): Promise<T> => window.api.vigil(channel, ...args) as Promise<T>

/** A local day, `n` days from today: "2026-10-07". */
const day = (n: number): string => {
  const at = new Date()
  at.setDate(at.getDate() + n)
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
}
/** A moment `n` days from today at a time of day, as the database keeps it. */
const at = (n: number, time = '09:00'): string => {
  const [hours, minutes] = time.split(':').map(Number)
  const when = new Date()
  when.setDate(when.getDate() + n)
  when.setHours(hours, minutes, 0, 0)
  return when.toISOString()
}
/**
 * Earlier today, on the last hour or half hour, so no time reads like the
 * moment the sandbox was set out ("7:41"). The Inbox reads newest first, so
 * each is a moment apart in the order given (`minutes` the smaller, the
 * newer), all within that same minute.
 */
const earlier = (minutes: number): string => {
  // Past the first few, the rest go back over the weeks and months, so the
  // Inbox ages as a lived-in one does: its tints warm, Oldest untouched and
  // the weekly pass have something to show. Still newest first, in order.
  if (minutes > 10) return at(-Math.round((minutes - 10) ** 1.35 / 6), ['08:30', '12:30', '19:00', '21:30'][minutes % 4])
  const now = Date.now()
  const midnight = new Date().setHours(0, 0, 0, 0)
  let base = Math.floor(now / 1_800_000) * 1_800_000
  if (now - base < 60_000) base = Math.max(midnight, base - 1_800_000)
  return new Date(base + Math.max(0, 200 - minutes) * 250).toISOString()
}
/** The Monday of this week, as week pages are keyed. */
const monday = (): string => {
  const at = new Date()
  at.setDate(at.getDate() - ((at.getDay() + 6) % 7))
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
}

/** A bundled picture, stored the way a pasted one is. */
async function picture(url: string): Promise<string> {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
  return window.api.saveImage('image/webp', bytes)
}

type Read = (markdown: string) => JSONContent | null
/** Plain paragraphs, should no editor ever come to read Markdown with: less rich, never empty. */
const paragraphs = (markdown: string): JSONContent => ({
  type: 'doc',
  content: markdown.split(/\n{2,}/).map((text) => ({ type: 'paragraph', content: text.trim() ? [{ type: 'text', text: text.trim() }] : [] }))
})

/** A link to another example by its id, the form the editor reads back as a link; with a heading, it lands on that heading. */
const link = (id: string, name: string, type = '', heading = ''): string => `[[@${type ? `${type}:` : ''}${id}${heading ? `#${heading}` : ''}|${name}]]`

export type SeedCounts = { captures: number; nuggets: number; tasks: number }

/** Set the sandbox out. `read` turns Markdown into a document, as an open editor would. */
export async function seedSandbox(read: Read): Promise<SeedCounts> {
  // A picture given a width sits in the middle of the column, as a figure does.
  const centred = (node: JSONContent): JSONContent =>
    node.type === 'image' && node.attrs?.width ? { ...node, attrs: { ...node.attrs, align: 'center' } } : node.content ? { ...node, content: node.content.map(centred) } : node
  const doc = (markdown: string): JSONContent => centred(read(markdown.trim()) ?? paragraphs(markdown))
  let captures = 0
  let nuggets = 0
  let tasks = 0

  /** A capture, its body written in afterwards so it can link to the ones made after it. */
  const capture = async (patch: { kind?: string; attribution?: string; medium?: string; title?: string }, when: string): Promise<string> => {
    const id = await window.api.captures.create({ ...patch, body: { type: 'doc', content: [{ type: 'paragraph' }] } } as never)
    await v('capture:set', id, 'capturedAt', when)
    captures++
    return id
  }
  const write = (id: string, markdown: string): Promise<unknown> => window.api.captures.save(id, { body: doc(markdown), fetched: true })
  const field = (id: string, key: string, value: unknown): Promise<unknown> => v('notes:fields:set', 'captures', id, key, value)

  // Practice tasks never send a notification, and nothing celebrates while
  // the examples go in; the sandbox's own look is set by the caller.
  await v('settings:set', { notify: 'quiet', celebrate: false, goalBeacon: 'sometimes' })

  const [tablet, plaque, head, dot, mona, annunciation, supper, adam, primavera] = await Promise.all(
    [tabletUrl, plaqueUrl, headUrl, dotUrl, monaUrl, annunciationUrl, supperUrl, adamUrl, primaveraUrl].map(picture))

  // --- the captures, newest first as the Inbox reads them --------------------------------
  const start = await capture({}, earlier(2))
  const errands = await capture({}, earlier(5))
  const hal = await capture({ kind: 'decision' }, earlier(9))
  const kessel = await capture({}, earlier(16))
  const napoleon = await capture({ kind: 'quote', attribution: 'Napoleon Bonaparte' }, earlier(23))
  const blueDot = await capture({ kind: 'link', title: 'The Pale Blue Dot' }, earlier(31))
  const apophenia = await capture({ kind: 'word' }, earlier(38))
  const odyssey = await capture({ kind: 'quote', attribution: 'Homer, tr. Samuel Butler', medium: 'The Odyssey, Book 1 (1900)' }, earlier(46))
  const leonardo = await capture({}, earlier(54))
  const endurance = await capture({}, earlier(61))
  const prestige = await capture({}, earlier(69))
  const totem = await capture({ kind: 'todo' }, earlier(77))
  const bit = await capture({}, earlier(84))
  const book = await capture({ attribution: 'Homer' }, earlier(92))
  const walk = await capture({ kind: 'experiment' }, at(-5, '12:40'))
  const wolf = await capture({}, earlier(107))
  const team = await capture({}, earlier(114))
  const mona17 = await capture({}, earlier(122))
  const supper18 = await capture({}, earlier(129))
  const adam19 = await capture({}, earlier(137))
  const primavera20 = await capture({}, earlier(144))
  const pitch = await capture({}, earlier(152))
  // Two books on the go: Dune half read, Dorian Gray finished.
  const dune = await capture({ attribution: 'Frank Herbert', medium: 'A friend who would not stop talking about sandworms' }, earlier(166))
  const duneNotes = await capture({}, at(-1, '22:30'))
  const dorian = await capture({ attribution: 'Oscar Wilde', medium: 'A second-hand shop in Dublin' }, at(-2, '21:15'))
  const noFace = await capture({}, at(-3, '22:41'))
  const rick = await capture({}, at(-4, '19:12'))
  const gilgamesh = await capture({}, at(-6, '08:03'))
  const akkadian = await capture({}, at(-8, '13:27'))
  const sanskrit = await capture({}, at(-40, '23:50'))
  const milkyWay = await capture({}, (() => {
    const when = new Date()
    when.setFullYear(when.getFullYear() - 1)
    when.setHours(23, 14, 0, 0)
    return when.toISOString()
  })())

  // --- kept things, made first so the notes can link to them --------------------------
  // A word kept: a new card, waiting in Review now.
  const petrichorCapture = await capture({ kind: 'word' }, at(-2, '07:40'))
  await write(petrichorCapture, 'Petrichor: the smell of rain on dry earth.')
  await field(petrichorCapture, 'definition', 'The smell of rain on dry earth, from the Greek for stone and the fluid in the veins of the gods.')
  const petrichor = await v<string>('promote', petrichorCapture)
  nuggets++

  // A quote kept with words of your own beside it.
  const aureliusCapture = await capture({ kind: 'quote', attribution: 'Marcus Aurelius', medium: 'Meditations, tr. George Long (1862)' }, at(-5, '06:55'))
  await write(aureliusCapture, 'Remember this, that very little is needed for living a happy life.')
  const aurelius = await v<string>('promote', aureliusCapture, 'Mine: the list of what I need keeps getting shorter, and that is the point.')
  nuggets++

  // A line kept from a novel: the character who says it, inside the book it is from.
  const wildeCapture = await capture({ kind: 'quote', attribution: 'Lord Henry, in Oscar Wilde', medium: 'The Picture of Dorian Gray, chapter 2 (1890)' }, at(-10, '23:02'))
  await write(wildeCapture, 'The only way to get rid of a temptation is to yield to it.')
  const wilde = await v<string>('promote', wildeCapture, 'He says it to be clever. The rest of the book is the bill.')
  nuggets++

  // And one from Middle-earth, said by the wizard, inside the book it is from.
  const gandalfCapture = await capture({ kind: 'quote', attribution: 'Gandalf, in J.R.R. Tolkien', medium: 'The Fellowship of the Ring, Book 1, chapter 2 (1954)' }, at(-7, '22:15'))
  await write(gandalfCapture, 'All we have to decide is what to do with the time that is given us.')
  const gandalf = await v<string>('promote', gandalfCapture, 'The film puts it in Moria. The book has it at Bag End, before anyone has left home: advice for an ordinary Tuesday.')
  nuggets++

  // A card with a history: reviewed three times over three weeks, due again today.
  const schwarzschild = await v<string>('nugget:from', 'How small a mass must be squeezed to become a black hole. For Earth, about 9 mm: a marble. #astrophysics', {})
  await v('item:save', schwarzschild, { title: 'What is a Schwarzschild radius?', prompt: 'What is a Schwarzschild radius?' })
  for (const grade of [3, 3, 4]) await v('review:grade', schwarzschild, grade, 6000)
  nuggets++

  // A film card, new this week, waiting in Review today.
  const redPill = await v<string>('nugget:from', 'The red. He wakes up in a pod, and the comfortable lie is gone for good. Cypher later wants it back: ignorance is bliss. #film', {})
  await v('item:save', redPill, { title: 'Red pill or blue pill?', prompt: 'Red pill or blue pill: which one does Neo take, and what does it cost him?' })
  nuggets++

  // Missed four times: Review offered to rewrite it, split it or set it aside, and it waits on the Struggling shelf.
  const lagrange = await v<string>('nugget:from', 'Five points where a small body can sit still between two large ones, held there by both pulls and its orbit. The Webb telescope sits at L2, a million miles beyond the Earth. #astrophysics', {})
  await v('item:save', lagrange, { title: 'Lagrange points', prompt: 'What are the Lagrange points, how many are there, and which one does Webb use?' })
  for (const grade of [3, 1, 1, 1, 1, 2]) await v('review:grade', lagrange, grade, 9000)
  nuggets++

  // Cards written inside a note: every line with a question, two colons and an answer is a card of its own.
  const kepler = await capture({}, at(-3, '20:10'))
  await write(kepler, `
Kepler's three laws, for the #astrophysics exam. A line written as a question, two colons and its answer is a review card of its own, marked at its end.

**Try it:** add a line of your own the same way, then find it in Review, where R opens this note at that line.

- First law :: Every planet moves in an ellipse, with the Sun at one focus.
- Second law :: A line from the Sun to a planet sweeps out equal areas in equal times.
- Third law :: The square of a planet's year is proportional to the cube of its orbit's size.
`)

  // Corrected, not erased.
  const pluto = await v<string>('nugget:from', 'Pluto is the ninth planet.', {})
  const plutoFixed = await v<string>('supersede', pluto, 'Pluto is a dwarf planet, since the vote in Prague in 2006.')
  await v('gloss', plutoFixed, 'Unlike the Ministry of Truth, Vigil keeps what you used to believe, marked as replaced.')
  nuggets += 2

  // Kept months ago: it comes back as a hint now and then.
  const overfitting = await v<string>('nugget:from', 'Overfitting: a model that learns its training set by heart and fails on anything new. People do it too: the exam passed, the subject never learnt.', {})
  await v('item:save', overfitting, { title: 'Overfitting' })
  nuggets++

  // An article: a page of your own, written from what you kept.
  const article = await v<string>('article:new')
  await v('item:save', article, {
    title: "Mnemosyne's problem: how memory fades",
    body: doc(`
An article is a page of your own, written from things you kept. It links to them, and they link back.

**Try it:** press ⌘K and type *study* to find the task this page made, then tick it off.

![A Greek marble head of a woman, 425 to 400 BC|320](${head})

*A Greek marble head, 425 to 400 BC. The Met, open access.*

Mnemosyne was the Greek goddess of memory, and the mother of the nine Muses. The order matters: memory first, then every art.

In 1885 Hermann Ebbinghaus learnt lists of nonsense syllables and tested himself as they slipped away. Most of a list was gone within a day, and what was left faded more slowly after that: the forgetting curve.

The fix is old and dull and works. Meet the thing again just before you would forget it, and each time it lasts longer. That is all Review does: ${link(schwarzschild, 'What is a Schwarzschild radius?', 'nugget')} has come back three times, each gap longer than the last.

What you keep, rather than what you read, is what returns: ${link(petrichor, 'Petrichor', 'nugget')}, ${link(overfitting, 'Overfitting', 'nugget')}.
`)
  })
  nuggets++

  // --- questions held open ---------------------------------------------------------------
  const top = await v<string>('question:new', 'Is the top still spinning?')
  const clues = [
    [await v<string>('clue', top, 'A totem only works if nobody else has ever handled it.'), at(-20, '21:30')],
    [await v<string>('clue', top, 'Watch the ring, not the top.'), at(-9, '07:15')],
    [await v<string>('clue', top, 'No-Face speaks only in the voices it swallowed. Whose dream is this, then?'), at(-2, '23:05')]
  ] as const
  await v('question:pin', top, true)
  const bronzeClue = await capture({}, at(-11, '18:20'))
  await write(bronzeClue, 'Drought, earthquakes and the Sea Peoples, all at once?')
  const bronze = await v<string>('question:new', 'Why did the Bronze Age collapse around 1177 BC?')
  await v('clue', bronze, '', bronzeClue)
  const alexandria = await v<string>('question:new', 'Did the Library of Alexandria burn, or slowly fade away?')
  const alexandriaClues = [
    [await v<string>('clue', alexandria, "Caesar's fire in 48 BC burnt part of the city by the harbour. Books, or only warehouses? Nobody agrees."), at(-14, '21:10')],
    [await v<string>('clue', alexandria, 'Hypatia taught maths in Alexandria until 415 AD, long after the great Library had dwindled. No single fire: centuries of less money and fewer scholars.'), at(-5, '22:00')]
  ] as const
  const paul = await v<string>('question:new', 'Is Paul the hero of Dune?')
  const paulClues = [
    [await v<string>('clue', paul, 'He sees the holy war coming, in every future, and walks toward it anyway.'), at(-8, '22:40')],
    [await v<string>('clue', paul, 'Herbert said he wrote him as a warning about following a leader like that, not as a model.'), at(-1, '22:55')]
  ] as const
  nuggets += 4

  // --- goals ---------------------------------------------------------------------------
  const mars = await v<string>('goal:new', 'Get to Mars before the dust storm', day(68), day(-30), "The Hab won't hold forever.")
  const marsLogs = [
    ['Ran the numbers on the oxygenator. It holds, if nothing else breaks.', -28],
    ['Water: made 40 litres, burnt one eyebrow.', -21],
    ['Potatoes, day 12: sprouting.', -14],
    ['Fixed the rover battery with duct tape. Duct tape is magic.', -9],
    ['Rover range is up to 90 km a day.', -4],
    ['Mapped the route to the crater. 3,200 km, give or take.', -1]
  ] as const
  const marsGlosses: [string, string][] = []
  for (const [text, n] of marsLogs) marsGlosses.push([await v<string>('gloss', mars, text), at(n, n === -1 ? '20:10' : '18:30')])
  await v('goal:beacon:set', mars, 'always')
  // Every day here counts from the day the sandbox is opened, so nothing in it ever goes stale:
  // a year's goal begun five months ago, seven to go, whatever the date.
  const homer = await v<string>('goal:new', 'Read the whole Odyssey: 24 books', day(215), day(-150), 'Three thousand years old and still the best road trip.')
  const homerGlosses: [string, string][] = [
    [await v<string>('gloss', homer, 'Book 5: Calypso lets him go. Seven years on one island.'), at(-26, '22:00')],
    [await v<string>('gloss', homer, "Book 9: the Cyclops. 'Nobody' is the best fake name ever given."), at(-6, '21:45')]
  ]
  // Beacons share one window, the goal stack, nearest day on top: Dune, then Mars, then the Odyssey.
  await v('goal:beacon:set', homer, 'always')
  const kesselGoal = await v<string>('goal:new', 'Make the Kessel Run in under 12 parsecs', day(-3), day(-40), 'Fastest hunk of junk in the galaxy.')
  await v('gloss', kesselGoal, 'Cut the corner past the Maw. 11.5 parsecs.')
  await v('goal:close', kesselGoal, 'made it')
  // A small reading goal, its logs a reading diary.
  const duneGoal = await v<string>('goal:new', 'Finish Dune before film night', day(12), day(-18), 'Book before film, every time.')
  const duneGlosses: [string, string][] = [
    [await v<string>('gloss', duneGoal, 'Book One done. The dinner party chapter is all knives.'), at(-15, '22:20')],
    [await v<string>('gloss', duneGoal, 'Into the deep desert. Slower going, more glossary than story.'), at(-8, '22:35')],
    [await v<string>('gloss', duneGoal, 'Book Two finished on the bus. Missed my stop.'), at(-1, '18:05')]
  ]
  await v('goal:beacon:set', duneGoal, 'always')
  nuggets += 4

  // --- tasks, typed as a person would ------------------------------------------------
  const task = async (text: string): Promise<string> => {
    tasks++
    return (await v<{ id: string }>('task:add', text, undefined, false)).id
  }
  await task('Return the briefcase to Marsellus today 10am p1')
  const tablets = await task('Return the Gilgamesh tablets to the library')
  await v('task:save', tablets, { due: at(-2, '17:00') })
  const wall = await task('Chip at the wall for ten minutes every day')
  const losAlamos = await task('Send the Los Alamos budget by Friday')
  const blackHole = await task('Black hole data from the probe')
  await v('task:save', blackHole, { waitingOn: 'TARS', due: at(3, '09:00') })
  await v('task:save', wall, { due: at(0, '21:00'), reschedules: 0 })
  const cuneiform = await task('Learn to read cuneiform someday')
  // Important and not yet urgent: the matrix's Plan box.
  const oxygenator = await task('Draft the oxygenator repair plan next week !!')
  // One already done this morning, struck through on Today's page.
  await v('task:done', await task('Water the potatoes today 8am'))
  const kick = await task('Plan the kick tomorrow')
  await v('task:save', kick, { subtasks: [{ text: 'Music cue: one minute before', done: true }, { text: 'Fill the bathtub', done: false }, { text: 'Get the van off the bridge', done: false }] })
  const django = await task('Rewatch Django Unchained on Saturday 8pm')
  await v('task:save', django, { notes: doc('The D is silent. Bring the good popcorn, and Sam, who has never seen it.') })
  // A task that remembers the capture it came from.
  const plane = await capture({}, earlier(160))
  await write(plane, 'Follow the white rabbit. Probably a tattoo, but you never know.')
  await v('tasks:from', [plane], 'Follow the white rabbit')
  tasks++
  // A task to practise a focus session on, its notes saying how.
  const voightKampff = await task('Run the Voight-Kampff test today')
  await v('task:save', voightKampff, { notes: doc(`
A focus session is a timer on one task: a goal, how long, and a small clock that floats over everything until you are done. When it ends, it asks how it went.

**Try it:** under “Sessions”, beside these notes, choose “Start a focus session”. 25 minutes is already filled in; press ↵.
`) })
  // A study task, made from the article.
  await v('study', article, 'Study the forgetting curve this week')
  tasks++

  // --- the notes themselves ------------------------------------------------------------
  await write(start, `
# Start here

This is someone else's book: their reading, films, questions, tasks and goals. Look around and try anything; your own notes are safe. “Reset”, in the bar at the top, puts it all back.

![A clay school tablet from Babylon, covered in cuneiform|300](${tablet})

*A student's practice tablet, Babylon, about 3,800 years old. The Met, open access.*

Five thousand years ago, scribes in Sumer pressed lists into clay: grain, beer, debts, and later the first stories. In Sumerian, *an-ki*, heaven and earth, meant everything there is. Vigil's aim is smaller: everything you noticed.

Every note here teaches one thing, and asks you to try it.

[TOC]

## Catch

Press ⌘. in any app. A small box opens; write, press ⌘↵, and you are back where you were. It all lands in the Inbox, each thing with a kind: a note, a todo, a quote, a word, a link.

${link(kessel, 'Kessel Run maths')} · ${link(napoleon, 'A quote, kept with your own words')} · ${link(blueDot, 'The Pale Blue Dot')}

## Wait

Nothing in the Inbox goes stale or nags to be cleared. It waits until you have a few minutes, and the oldest things come back on their own. ${link(sanskrit, 'This one has waited 40 days')}.

## Tidy

Once a day, a few minutes over the last few days: a tag here, a bold line there. Nothing to decide yet. Press ⌘K and choose “Tidy”.

## Decide

Once a week: keep it (P), finish it (R) or let it go (D). Nothing is ever destroyed: ${link(pitch, 'a pitch let go')} is still there to bring back.

## Come back

What you keep comes back: as ${link(schwarzschild, 'a Review card', 'nugget')} just before you would forget it, as a hint in quick capture, and as what you caught on this day last year. Goals and questions stay in sight: ${link(mars, 'Get to Mars before the dust storm', 'goal')}, ${link(top, 'Is the top still spinning?', 'question')}

## Look back

Once a month and once a year, Vigil reads you back: the books you read and the lines you kept from each, the hour you think best, what you kept circling, how much you remembered. This copy has a year behind it: five books finished, from Meditations to Dorian Gray, and a question about Frankenstein settled.

**Try it:** press ⌘K and choose “Your year, wrapped”, then → to turn its pages.

## Find

⌘K finds anything: notes, tasks, goals, and every action in the app. Try *renaissance*, or open ${link(leonardo, "Leonardo's notebooks")}.

A link can land partway down a note: ${link(prestige, 'Every great trick has three acts', '', 'The Turn')} opens that note at its second act, unfolded.

**Try it:** click it. To make your own, type @ and a note's name, then # to pick one of its headings.

*Nisaba, keeper of the tablets*
`)
  await v('pin', 'captures', start, true)

  await write(errands, `
Tasks, said in plain words

Write a task the way you would say it, and the date comes out of the words: *call Mr Wolf tomorrow 9am*, *send the budget by Friday*, *chip at the wall every day*.

**Try it:** press G then T for Today, press A, and type *feed the cat tomorrow 8am*. Then tick a task off with its circle, or press E on it.

Today is what is due now. Week lays the next seven days side by side, Upcoming lists everything with a date ahead, and Routines hold what comes round again. In Today, open *Run the Voight-Kampff test* to try a focus session.
`)

  await write(hal, `
Which AI flies the ship: HAL or TARS?

A decision keeps what you weighed, so it is never argued again. Its fields, under “Details” at the top right, hold the call and what would reopen it.

**Try it:** click in the table and press Tab to go cell to cell. Tab in the last cell adds a row.

| | HAL 9000 | TARS |
|---|---|---|
| Honesty | Selective | 90%, by setting |
| Sense of humour | None found | 75%, adjustable |
| Opens the pod bay doors | Declines | Holds them open |
| Survives a black hole | Not tested | Yes, and sends the data |

**The call:** TARS. Humour at 75%.
`)
  await field(hal, 'state', 'Decided')
  await field(hal, 'call', 'TARS, with humour at 75%')
  await field(hal, 'options', 'HAL 9000, TARS, or flying it by hand')
  await field(hal, 'reopen', 'Only if HAL learns to say sorry.')

  await write(kessel, `
Kessel Run maths

A line ending in = shows its answer, faint. Name a number once and use it below. Units and money convert as you type.

**Try it:** put the caret at the end of any line ending in = and press Tab to write the answer in.

run = 12 parsec

run in lightyear =

A parsec is a distance, not a time: the boast was about a shorter route.

napoleon = 169 cm

napoleon in inch =

About average for his day. The short story came from British cartoons, and from French inches being longer than English ones.

royale = 4.50 EUR

4 * royale in USD =

A Royale with Cheese, four times, in dollars. Money needs the internet once a day for its rates; the rest works offline.
`)

  await write(napoleon, `
Never interrupt your enemy when he is making a mistake.

**Try it:** find it in the Inbox list and press P to keep it. Vigil asks what it means to you first: a quote kept with nothing of yours beside it is one you collected, not one you understood.
`)

  await write(blueDot, `
Pale Blue Dot, Voyager 1, 1990

\`\`\`cardlink
url: https://en.wikipedia.org/wiki/Pale_Blue_Dot
title: "Pale Blue Dot"
description: "Earth, photographed by Voyager 1 on 14 February 1990 from about 6 billion kilometres away: less than a pixel, in a ray of sunlight."
host: en.wikipedia.org
image: ${dot}
\`\`\`

A link becomes a card like this one, picture and all, kept with your notes so it works offline. Sagan's point about this picture, in two words: be kind.

**Try it:** paste any link into a note, on a line of its own.
`)

  await write(apophenia, `
Apophenia: seeing patterns in noise.

A word keeps its meaning and an example. Keep it and it comes back in Review as a card: the word on the front, the meaning behind.

**Try it:** find it in the Inbox list and press P.
`)
  await field(apophenia, 'definition', 'Seeing meaningful patterns in random things.')
  await field(apophenia, 'example', 'Faces in clouds; a model that finds a cat in static.')

  await write(odyssey, `
Tell me, O muse, of that ingenious hero who travelled far and wide after he had sacked the famous town of Troy. Many cities did he visit, and many were the nations with whose manners and customs he was acquainted; moreover he suffered much by sea while trying to save his own life and bring his men safely home; but do what he might he could not save his men, for they perished through their own sheer folly in eating the cattle of the Sun-god Hyperion; so the god prevented them from ever reaching home.

A long quote is a passage you mean to mine. **Try it:** select one sentence and choose “Gem” in the bar that appears. It is kept on its own, and once something is lifted out, the long quote steps aside.

![A clay plaque from Melos showing Odysseus|360](${plaque})

*Odysseus home at last. A clay plaque from Melos, about 450 BC. The Met, open access.*
`)
  await field(odyssey, 'location', 'Book 1, the opening lines')

  await write(leonardo, `
Leonardo's notebooks

Pictures sit in a note at any size, each with a caption under it.

**Try it:** click a picture and press Space to look at it closely. Space again puts it back.

He filled thousands of pages, and about 7,000 survive, most written right to left, in mirror writing.

![The Annunciation, by Leonardo da Vinci](${annunciation})

*The Annunciation, about 1472. He was barely twenty.*

> The painter who draws merely by practice and by eye, without any reason, is like a mirror which copies every thing placed in front of it without being conscious of their existence.

*Leonardo, from his notebooks (Richter's translation, 1883)*

![The Mona Lisa, by Leonardo da Vinci|340](${mona})

*Mona Lisa. He kept working on her for about sixteen years, and never handed her over.*
`)

  await write(endurance, `
Mission log, Endurance

Type / on an empty line for everything a note can hold. A few of them, ready made:

**Try it:** put the caret on the empty line at the end and type /.

> [!warning] Murphy's law
> Anything that can happen, will happen. Cooper named his daughter after it, and meant it kindly.

\`\`\`python
# Gradient descent: the whole of machine learning, nearly
for step in range(1000):
    weights -= 0.01 * gradient(weights)
\`\`\`

<!-- columns -->

**Miller's planet**

One hour there is seven years back home.

<!-- column -->

**Mann's planet**

Ice clouds, and data that was too good to be true.

<!-- /columns -->

Link a note with @ as in ${link(top, 'Is the top still spinning?', 'question')}, without leaving the line, and tag with # as in #interstellar. Vim keys are there too, off to start with: Settings, Writing.

`)

  await write(prestige, `
Every great trick has three acts

A heading folds away everything under it, so a long note reads as its outline.

**Try it:** point at a heading and click the arrow beside it. Or press ⌘K and choose “Fold every heading”.

## The Pledge

The magician shows you something ordinary: a deck of cards, a bird, a man. He asks you to look it over, to see that it is real and unaltered and normal. Nobody ever does look closely, and that is the first part of the trick.

Notes are like this too. A heading looks like a label, and it is a handle: everything under it moves with it, and folds with it.

## The Turn

Then the ordinary thing does something extraordinary. The bird is gone, the cage folded flat in his hands. You look for the secret, and you will not find it, because you are not really looking: you want to be fooled.

Fold this section and the page is suddenly short. Unfold it and every word is back where it was. Folding never changes the note, only how much of it you see.

## The Prestige

Making something disappear is not enough; you have to bring it back. The bird returns, and everyone claps, and nobody asks what happened to the first bird.

Folds are remembered for each note, so a long page opens the way you left it.
`)

  await write(totem, `
Take the Ring to Mordor #quest

Anything you catch can become a task, and the task remembers where it came from.

**Try it:** open this and choose “Make it a task”, or press T on it while you decide (⌘K, Decide).
`)

  await write(bit, `
There's no place like 127.0.0.1 #bit

Tagged #bit (a joke, a line for later), a note starts private: blurred in lists until you point at it, and never brought up unasked.

**Try it:** press ⌥⌘S for safe mode, from any app, and watch the stickies, pins and hints leave the screen. Press it again to bring them all back.
`)

  await write(book, `
The Odyssey #book

Tagged #book, a note keeps where you are with a book and what you made of it. This one feeds ${link(homer, 'a goal to read all 24 of its books', 'goal')} and ${link(odyssey, 'a passage from Book 1')}.

**Try it:** open its details and set it to “Finished”: a place for what you will keep from it appears.
`)
  await field(book, 'status', 'Reading')
  await field(book, 'rating', 5)

  await write(walk, `
Does a ten-minute walk shrink the 3pm slump?

An experiment runs for a set time, then comes back to ask what you found. Here: two weeks, started five days ago.

**Try it:** set its outcome when it comes back, in a line or two.
`)
  await field(walk, 'status', 'Running')
  await field(walk, 'question', 'Is the afternoon better with a short walk after lunch?')
  await field(walk, 'until', day(9))

  await write(wolf, `
Call Mr Wolf. He solves problems.

A reminder is a pin with a date: tomorrow at 9:00 this pins itself to the top of the sidebar and Home.

**Try it:** set one on any note with “Remind me…”, in its details.
`)
  await v('remind', 'captures', wolf, at(1, '09:00'))

  await write(team, `
The road to Mordor

- [x] Leave the Shire
- [x] Through the Mines of Moria
- [ ] Mount Doom

Stuck to your desktop, on every Space. **Try it:** tick the last box.
`)

  const renaissance = [
    [mona17, mona, 'Mona Lisa|420', 'No eyebrows: lost to cleaning over the centuries, or never painted?'],
    [supper18, supper, 'The Last Supper', 'Painted on dry plaster, not wet. It began flaking within twenty years.'],
    [adam19, adam, 'The Creation of Adam', "The fingers don't touch. The gap is the whole painting."],
    [primavera20, primavera, 'Primavera', 'About 500 plants, painted carefully enough to be named by botanists.']
  ] as const
  for (const [id, src, name, line] of renaissance) {
    await write(id, `
${name.split('|')[0]} #renaissance

![${name}](${src})

${line}
`)
  }
  await v('tag:set', 'renaissance', { color: 'orange' })

  await write(pitch, `
Pitch: a sequel where Odysseus takes the long way home on purpose.

Let go, not deleted. Everything you discard waits under Discarded, to bring back whenever you like.
`)
  await window.api.captures.save(pitch, { status: 'discarded' })

  await write(dune, `
Dune #book

A book keeps who wrote it and where you heard of it, the two things forgotten first. Its reading notes can live in a note of their own, and a link can open them at the part you are on: ${link(duneNotes, "Dune, as I read it", '', "Book Two: Muad'Dib")}.

**Try it:** open its details, top right: the friend who would not stop talking about sandworms is there. It also feeds ${link(duneGoal, 'a goal with a date', 'goal')}.
`)
  await field(dune, 'status', 'Reading')

  await write(duneNotes, `
Dune, as I read it

Notes on a long book, a heading for each part: the note reads as its outline, and a link can land on any one part.

**Try it:** press ⇧⌘O for the outline, pick Book Three with the arrows and press ↵.

## Book One: Dune

A desert planet, and the only place the spice comes from. Whoever holds the spice holds the empire, so of course everyone wants the desert.

The test with the box in the first chapter: pain, to tell a person from an animal. *Fear is the mind-killer*, and the boy believes it.

## Book Two: Muad'Dib

Paul and his mother in the deep desert, with the Fremen. He sees the futures now, and most of them end in a holy war fought in his name.

He knows, and he goes on. That is where I began to wonder: ${link(paul, 'Is Paul the hero of Dune?', 'question')}

## Book Three: The Prophet

The worm ride, the duel, the emperor beaten. It reads like a triumph. Herbert said it was meant as a warning.
`)

  await write(dorian, `
The Picture of Dorian Gray #book

A book set to “Finished” asks one more thing: what you will keep from it, a line or two under “Takeaway”.

**Try it:** press ⌘K and type *Dorian*: the book and the quote ${link(wilde, 'this line', 'nugget')} was kept from come up together, one by its title, the other by where it is from.
`)
  await field(dorian, 'status', 'Finished')
  await field(dorian, 'rating', 4)
  await field(dorian, 'takeaway', 'A face can stay young while the life behind it does not. The bill is paid somewhere.')

  await write(noFace, 'No-Face only speaks with the voices of the ones it swallowed.')
  await write(rick, "Rick's catchphrase supposedly means 'I am in great pain, please help me'.")
  await write(gilgamesh, 'Gilgamesh went looking for immortality and came home with a story instead. #history')
  await write(akkadian, "Learn enough Akkadian to read one line of Hammurabi's code?")
  await write(sanskrit, 'Oppenheimer learnt Sanskrit to read the Gita in the original. How long did that take him?')
  await write(milkyWay, "Saw the Milky Way properly for the first time. Couldn't find words, so I counted: about 2,500 stars on a dark night, they say. I got to 40.")

  // --- the stickies ----------------------------------------------------------------------
  window.api.stick('capture', team, true)
  // Today's tasks as one sticky, ticked off through the day.
  window.api.stick('today', 'today', true)

  // --- the pages ---------------------------------------------------------------------------
  await v('notes:day:save', day(0), {
    body: doc(`
Morning: three coffees, one idea.

A page a day. What you catch, finish and review today gathers underneath it on its own.

**Try it:** write one line about how today went, then tick “Mark reviewed”.
`)
  })
  await v('notes:day:save', day(-1), {
    body: doc("Read Book 9 on the train. 'Nobody' is still the best fake name in literature.\n\nTen minutes at the wall. Six days running."),
    reviewed: true
  })
  await v('period:save', `week:${monday()}`, {
    fields: { theme: 'Do, or do not', summary: 'Small steps on the big things: the oxygenator, the wall, Book 9.', projects: 'Mars, the Odyssey', people: 'Watney, TARS, Mr Wolf' },
    body: doc(`One page a week: what matters, and how it went.

This week: ${link(mars, 'Get to Mars before the dust storm', 'goal')}, and the Los Alamos budget by Friday.`)
  })
  await v('period:save', `month:${day(0).slice(0, 7)}`, {
    fields: { focus: 'The long patient chisel: ten minutes a day, every day.' }
  })

  // --- tags with a date to be ready by ---------------------------------------------------
  await v('tag:set', 'astrophysics', { examAt: day(21), color: 'purple' })

  // --- a year behind it ----------------------------------------------------------------
  // What a year of using it as meant leaves: books read one after another,
  // the lines kept from each with a word of your own, a question worked out
  // over weeks, cards reviewed on many days, and the small things caught in
  // between. It is what the month and year recaps and Stats read back. Most
  // reading notes fall on Sunday evenings, so the day you write most is a
  // Sunday wherever in the week the sandbox is set out. Every passage is
  // public domain: Austen (1813), Shelley (1831 text), Shakespeare, and
  // Marcus Aurelius in Long's translation (1862).
  /** `n` days back, then further back to the nearest `weekday` (0 is Sunday), at a time of day. */
  const on = (n: number, weekday: number, time: string): [number, string] => {
    const when = new Date()
    when.setDate(when.getDate() - n)
    const back = n + ((when.getDay() - weekday + 7) % 7)
    return [back, at(-back, time)]
  }
  const yearAges: unknown[] = []
  const books: [string, string, string, number, number, string][] = [
    ['Meditations', 'Marcus Aurelius', "Grandad's shelf", 272, 4, 'Most of what upsets me is my opinion of the thing, not the thing.'],
    ['Pride and Prejudice', 'Jane Austen', "The book club's pick", 236, 5, 'First impressions are a draft. The whole book is Elizabeth revising one.'],
    ['Frankenstein', 'Mary Shelley', 'A podcast about the summer of 1816', 180, 5, 'The creature asks for one thing, company, and everyone refuses him. The monster is made, not born.'],
    ['Hamlet', 'William Shakespeare', 'The play in the park', 126, 4, 'Thinking about acting is not acting. He knows it, and does it anyway for five acts.']
  ]
  // Each book's id by its title, so the lines and notes about it can link to it.
  const bookId: Record<string, string> = {}
  for (const [title, by, heard, n, rating, takeaway] of books) {
    const id = await capture({ attribution: by, medium: heard }, on(n, 6, '10:30')[1])
    bookId[title] = id
    await write(id, `${title} #book`)
    await field(id, 'status', 'Finished')
    await field(id, 'rating', rating)
    await field(id, 'takeaway', takeaway)
    yearAges.push({ usedAt: at(-on(n, 6, '10:30')[0], '18:00'), captureId: id })
  }

  // The lines kept, each with your own words beside it: [days ago, weekday, time, who, where, the line, yours].
  const lines: [number, number, string, string, string, string, string][] = [
    [268, 1, '07:10', 'Marcus Aurelius', 'Meditations, Book 2, tr. George Long (1862)', 'Begin the morning by saying to thyself, I shall meet with the busy-body, the ungrateful, arrogant, deceitful, envious, unsocial.', 'Read on the bus to work. It lowered the bar for the day, and the day cleared it.'],
    [233, 0, '21:10', 'Jane Austen', 'Pride and Prejudice, chapter 1', 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.', "The first line is a joke, and it is the narrator's, not the world's. It took a reread to hear it."],
    [226, 0, '21:40', 'Jane Austen', 'Pride and Prejudice, chapter 5', 'I could easily forgive his pride, if he had not mortified mine.', 'Elizabeth, honest about herself before she knows she is being.'],
    [219, 0, '20:55', 'Jane Austen', 'Pride and Prejudice, chapter 5', 'Vanity and pride are different things, though the words are often used synonymously. A person may be proud without being vain. Pride relates more to our opinion of ourselves, vanity to what we would have others think of us.', 'Mary, the sister nobody listens to, gets the clearest line in the book.'],
    [212, 0, '21:25', 'Jane Austen', 'Pride and Prejudice, chapter 11', 'I declare after all there is no enjoyment like reading! How much sooner one tires of any thing than of a book!', 'Caroline says it while not reading, to be seen reading. Austen is merciless.'],
    [205, 0, '22:05', 'Jane Austen', 'Pride and Prejudice, chapter 34', 'In vain have I struggled. It will not do. My feelings will not be repressed. You must allow me to tell you how ardently I admire and love you.', 'The worst proposal in English, and he means every word.'],
    [176, 0, '21:15', 'Mary Shelley', 'Frankenstein, chapter 4 (1831)', 'Learn from me, if not by my precepts, at least by my example, how dangerous is the acquirement of knowledge, and how much happier that man is who believes his native town to be the world, than he who aspires to become greater than his nature will allow.', 'Victor, warning Walton. Every chapter after this is him not taking his own advice.'],
    [162, 0, '21:50', 'Mary Shelley', 'Frankenstein, chapter 10 (1831)', 'I was benevolent and good; misery made me a fiend. Make me happy, and I shall again be virtuous.', 'The whole argument of the book in two sentences, and the creature makes it, not Victor.'],
    [161, 1, '07:45', 'Mary Shelley', 'Frankenstein, chapter 10 (1831)', 'Remember that I am thy creature; I ought to be thy Adam, but I am rather the fallen angel, whom thou drivest from joy for no misdeed.', 'He has read Paradise Lost. Of course he has: it is the only story about him.'],
    [148, 0, '22:20', 'Mary Shelley', 'Frankenstein, chapter 20 (1831)', 'Beware; for I am fearless, and therefore powerful.', 'Nothing left to lose, said as a threat.'],
    [120, 0, '21:05', 'William Shakespeare', 'Hamlet, Act 1, Scene 3', 'This above all: to thine own self be true, / And it must follow, as the night the day, / Thou canst not then be false to any man.', 'Polonius says it, and Polonius is a fool. Is good advice from a bad source still good advice?'],
    [113, 0, '21:35', 'William Shakespeare', 'Hamlet, Act 1, Scene 5', 'There are more things in heaven and earth, Horatio, / Than are dreamt of in your philosophy.', 'Said to the one person in the play who studies philosophy.'],
    [106, 0, '20:40', 'William Shakespeare', 'Hamlet, Act 2, Scene 2', 'There is nothing either good or bad, but thinking makes it so.', 'Marcus Aurelius said much the same in Meditations, and said it calmer.'],
    [99, 0, '21:20', 'William Shakespeare', 'Hamlet, Act 2, Scene 2', 'Brevity is the soul of wit', 'Polonius, in the longest speech of the scene.'],
    [92, 0, '21:55', 'William Shakespeare', 'Hamlet, Act 5, Scene 2', "There's a divinity that shapes our ends, / Rough-hew them how we will.", 'By the last act he has stopped planning. It goes no better, and no worse.'],
    [85, 0, '22:30', 'William Shakespeare', 'Hamlet, Act 5, Scene 2', 'The rest is silence.', 'Four words, after four hours.']
  ]
  const kept: { id: string; n: number; book: string; line: string }[] = []
  for (const [n, weekday, time, who, where, line, mine] of lines) {
    const [back, when] = on(n, weekday, time)
    const id = await capture({ kind: 'quote', attribution: who, medium: where }, when)
    await write(id, line)
    const nugget = await v<string>('promote', id, mine)
    nuggets++
    const book = books.find(([title]) => where.startsWith(title))![0]
    kept.push({ id: nugget, n: back, book, line })
    yearAges.push({ createdAt: at(-back, time), nuggetId: nugget }, { exitedAt: at(-back, time), captureId: id })
  }
  // Read again later, and a word added each time.
  for (const [index, n, text] of [[1, 60, 'Read chapter 1 aloud. Funnier aloud.'], [7, 40, 'Came back in Review on a hard week, and still lands.'], [12, 8, 'Came back in Review on a bad day. It helped, a little.']] as const)
    yearAges.push({ glossAt: at(-n, '21:30'), id: await v<string>('gloss', kept[index].id, text) })

  // The rest of the year, caught in passing: [days ago, weekday, time, words, what became of it].
  const passing: [number, number, string, string, ('kept' | 'gone' | 'task')?][] = [
    [275, 5, '08:15', 'Walk at lunch, no phone. The plane trees have bark like a map. #walks'],
    [270, 0, '21:05', 'Meditations was never meant to be read. It is a man writing notes to himself, which is why it works. #reading'],
    [262, 2, '13:05', 'Two-minute rule: if it takes less than two minutes, do it now. Works for dishes, not for letters. #work', 'kept'],
    [254, 0, '21:00', 'Rosetta Stone, found in 1799: one decree in three scripts, hieroglyphs, Demotic and Greek. The Greek was the key to the rest. #history'],
    [258, 3, '07:30', 'Twelve books of Meditations, one a week. On Book 3 and slowing down on purpose. #reading'],
    [250, 4, '18:40', 'Bread, third try: more water than feels right. It was right. #cooking'],
    [243, 6, '11:00', 'The library has a seed library. You borrow seeds, and bring back seeds. #ideas'],
    [238, 1, '07:50', 'Meetings that could be a note: most of them. Meetings that should be a walk: the rest. #work'],
    [230, 0, '20:50', 'Mr Collins is the funniest man in English, and has no idea. #reading'],
    [228, 3, '19:20', "Mum's lentil soup: cumin first, in the oil, before anything else. #cooking", 'kept'],
    [221, 0, '21:30', 'Darcy is not shy. He is rude, and the book is honest that those differ. #reading'],
    [216, 2, '12:45', 'Ten-minute walk after lunch: the 3pm slump came at 4pm instead. One data point. #walks'],
    [208, 0, '21:15', "Pemberley changes Elizabeth's mind, and she admits it is partly the house. Austen lets her be that honest. #reading"],
    [203, 5, '17:30', 'Write the email you would want to get: short, one ask, the date in the first line. #work', 'kept'],
    [200, 6, '10:20', 'Finished Pride and Prejudice. Reread the first chapter straight after: every line is a different joke now. #reading'],
    [196, 0, '20:45', 'Apollo 11, 20 July 1969: the guidance computer had about 4 KB of working memory. The alarms on the way down were it running out of room. #history'],
    [190, 4, '08:05', 'Every city has a street the locals walk and visitors never find. #walks'],
    [184, 0, '09:30', 'Ideas come in the shower because there is nothing to write them down with. A waterproof notepad? #ideas', 'task'],
    [178, 0, '21:00', 'Frankenstein began as a ghost story contest by Lake Geneva in 1816, the year without a summer. #reading'],
    [170, 0, '22:00', "Ada Lovelace's Note G, 1843: steps for the Analytical Engine to work out Bernoulli numbers. The first program, for a machine never built. #history", 'kept'],
    [166, 1, '22:40', 'Cannot sleep. The fridge hums in B flat, I think.', 'gone'],
    [156, 4, '23:05', "The creature learns to read from books found in the woods. A better education than Victor's. #reading"],
    [152, 3, '07:20', 'Rain all week. The canal is higher than the path.'],
    [141, 0, '21:20', 'Finished Frankenstein. The creature is the one I will remember, and he never gets a name. #reading'],
    [140, 3, '19:05', 'Sunday sauce, the Goodfellas way: Paulie slices the garlic with a razor, so thin it melts in the pan. Used a knife. It still melted. #cooking'],
    [137, 6, '15:10', 'Market: a man selling forty kinds of tomato, and arguing about all of them. #cooking'],
    [134, 0, '21:10', 'Gutenberg, about 1440: a press with movable metal type. By 1500, Europe had printed millions of books. #history'],
    [130, 2, '18:25', 'Ask for the decision, not the meeting. #work', 'kept'],
    [124, 6, '22:30', 'Saw Hamlet in the park. The ghost came on while a dog barked, and nobody laughed. #reading'],
    [117, 4, '21:50', 'Long light this time of year: walked home the long way, twice. #walks'],
    [110, 0, '21:45', 'Hamlet thinks about every move so long that the play happens to him instead. #reading'],
    [103, 1, '08:40', 'Started a list of the words I look up. Three today. #ideas'],
    [97, 0, '20:30', 'Ophelia gets the fewest lines, and the saddest. #reading'],
    [94, 0, '21:30', 'Magna Carta, 1215: annulled by the Pope within ten weeks, and still the charter everyone quotes. Being right later counts. #history'],
    [90, 5, '19:00', 'The best part of a trip is the first morning, before you know where anything is. #walks'],
    [84, 0, '21:10', 'Finished Hamlet. Five acts of deciding, then everything at once. #reading'],
    [78, 3, '12:30', 'Lunch with Sam: he reads the last page first, always. #reading', 'gone'],
    [74, 0, '21:15', 'The Antikythera mechanism: bronze gears, over 2,000 years old, that predicted eclipses. Nothing that fine turns up again for a thousand years. #history'],
    [72, 6, '09:15', 'Swam in the lake at 7am. Cold enough to make the day short and clear.'],
    [66, 2, '17:45', 'Write the plan on one page, or it is not a plan yet. #work'],
    [64, 0, '21:40', 'A Remembrall turns red when you have forgotten something, and never says what. Review is the half Neville needed. #study'],
    [60, 0, '21:00', 'Odyssey, Book 12: tied to the mast, so he can hear the song and not drown. Wanting the thing, and arranging not to have it. #reading'],
    [55, 4, '22:20', "Planted the seed library's beans. Two came up. #ideas"],
    [52, 0, '21:05', 'Wright Flyer, 17 December 1903: the first flight lasted 12 seconds and went 120 feet, less than the wingspan of a jumbo jet. #history'],
    [48, 1, '07:35', "First cold morning. Gloves in last year's coat, with a ticket in them."],
    [45, 0, '21:30', "Started Dorian Gray. Every line of Lord Henry's is a quote, which is the trouble with him. #reading"],
    [36, 0, '21:20', "Hermione's method: read the book first. Read the chapter before the astrophysics lecture, and the lecture was a second reading. #study", 'kept'],
    [38, 3, '13:10', 'A good question keeps for months. Most answers do not. #ideas', 'kept'],
    [33, 4, '08:40', "Hunch: the 3pm slump is the lunch, not the hour. Minority Report: the future isn't fixed if you know it. #precog"],
    [30, 0, '21:15', 'Finished Dorian Gray. The ending is one page, and it is enough. #reading'],
    [24, 0, '21:40', "Marie Curie's notebooks are still radioactive. They sit in lead-lined boxes in Paris, and readers sign a waiver first. #history"],
    [26, 5, '18:20', 'Bread, fourteenth try: finally the holes. #cooking'],
    [19, 2, '08:50', 'Sorted the bookshelf by colour. Now I cannot find anything, and it looks wonderful.', 'gone'],
    [15, 0, '22:10', 'Darwin, 1837: wrote "I think" above his first sketch of a tree of life. Two words, then the tree. #history'],
    [12, 0, '21:00', 'Reading on Sunday evenings has become the best hour of the week. #reading']
  ]
  // Each note caught in passing by its words, for the links written in below.
  const passed = new Map<string, string>()
  for (const [n, weekday, time, words, became] of passing) {
    const [back, when] = on(n, weekday, time)
    const id = await capture({}, when)
    await write(id, words)
    if (became !== 'gone') passed.set(words, id)
    // Looked at again a day or two later, when the week's few minutes came round.
    yearAges.push({ usedAt: at(-back + 1 + (back % 2), '20:30'), captureId: id })
    if (became === 'kept') {
      yearAges.push({ createdAt: at(-back, '21:45'), nuggetId: await v<string>('promote', id) }, { exitedAt: at(-back, '21:45'), captureId: id })
      nuggets++
    } else if (became === 'gone') {
      await window.api.captures.save(id, { status: 'discarded' })
      yearAges.push({ exitedAt: at(-back + 4, '20:00'), captureId: id })
    } else if (became === 'task') {
      await v('tasks:from', [id], 'Buy a waterproof notepad')
      tasks++
      yearAges.push({ exitedAt: at(-back + 1, '09:00'), captureId: id })
    }
  }

  // A decision made with help from a film, the call kept with what would reopen it.
  const party = await capture({ kind: 'decision' }, at(-12, '19:40'))
  await write(party, `
Not saying who spoilt the surprise party

Jimmy's rule in Goodfellas: never rat on your friends, and always keep your mouth shut. A terrible role model with one good rule.
`)
  await field(party, 'state', 'Decided')
  await field(party, 'call', 'Say nothing. The cake was still a surprise.')
  await field(party, 'reopen', 'Only if it happens at my party.')

  // A question held for a month, then answered: its clues become an article.
  const monster = await v<string>('question:new', 'Who is the monster in Frankenstein?')
  const monsterClues: [string, number][] = [
    ['Victor runs from the creature the moment it opens its eyes. Everything after is that one minute, paid for.', 170],
    ['The creature saves a drowning girl and is shot for it.', 158],
    ['Victor tears up the half-made bride, and is surprised by what follows.', 150],
    ['Both of them, Victor first. The creature was taught by everyone who ran from him.', 142]
  ]
  // Dated before it is settled, so the article lists each clue on its own day.
  await v('sandbox:age', [{ createdAt: at(-172, '21:30'), nuggetId: monster }, ...await Promise.all(monsterClues.map(async ([text, n]) => ({ glossAt: at(-n, '21:40'), id: await v<string>('clue', monster, text) })))])
  // --- the year joined up: what you wrote about a book links to it, a book to
  // the lines kept from it and the question it left, and the places two
  // books, or a book and a walk, meet. It is what the Map draws.
  const short = (text: string): string => (text.length > 40 ? `${text.slice(0, 38).trimEnd()}…` : text).replace(/[|\]]/g, '')
  const lineLink = (line: (typeof kept)[number]): string => link(line.id, short(line.line), 'nugget')
  const linesOf = (book: string): string => kept.filter((line) => line.book === book).map(lineLink).join(' · ')
  const bookLink = (title: string): string => link(bookId[title], title)
  // The question holds the lines that were its clues, and its answer keeps them.
  await v('item:save', monster, { body: doc(`The lines it came from: ${linesOf('Frankenstein')}. From ${bookLink('Frankenstein')}.`) })
  const answered = await v<{ article: string | null }>('question:close', monster, 'answered')
  yearAges.push({ closedAt: at(-141, '21:50'), nuggetId: monster })
  if (answered?.article) yearAges.push({ createdAt: at(-141, '21:50'), nuggetId: answered.article })
  // And one still circling.
  const mad = await v<string>('question:new', 'Is Hamlet mad, or acting?')
  yearAges.push({ createdAt: at(-118, '22:00'), nuggetId: mad })
  for (const [text, n] of [['He tells Horatio he will put on an antic disposition: acting, so far.', 115], ['Talking to the skull, there is nobody left to act for.', 101], ['Read the graveyard scene again. Still both.', 20]] as const)
    yearAges.push({ glossAt: at(-n, '21:40'), id: await v<string>('clue', mad, text) })
  nuggets += 3

  const monsterLink = link(monster, 'Who is the monster in Frankenstein?', 'question')
  const madLink = link(mad, 'Is Hamlet mad, or acting?', 'question')
  await v('item:save', mad, { body: doc(`The lines that keep it open: ${linesOf('Hamlet')}. From ${bookLink('Hamlet')}.`) })
  await write(bookId['Meditations'], `Meditations #book\n\nLines kept: ${linesOf('Meditations')} · ${link(aurelius, 'Very little is needed for a happy life', 'nugget')}`)
  await write(bookId['Pride and Prejudice'], `Pride and Prejudice #book\n\nLines kept: ${linesOf('Pride and Prejudice')}\n\nJudged on sight, as the creature is in ${bookLink('Frankenstein')}, only here someone changes their mind.`)
  await write(bookId['Frankenstein'], `Frankenstein #book\n\nLines kept: ${linesOf('Frankenstein')}\n\nThe question it left me with: ${monsterLink}`)
  await write(bookId['Hamlet'], `Hamlet #book\n\nLines kept: ${linesOf('Hamlet')}\n\nStill circling: ${madLink}. Thinking makes it so, as ${bookLink('Meditations')} says, and says calmer.`)
  // Notes caught in passing, each joined to what it was about.
  const noteLink = (start: string): string => {
    const [words, id] = [...passed].find(([one]) => one.startsWith(start))!
    return link(id, short(words.replace(/\s#\w+/g, '')))
  }
  const joins: [string, string[]][] = [
    ['Meditations was never', [bookLink('Meditations')]],
    ['Twelve books of Meditations', [bookLink('Meditations'), noteLink('Meditations was never')]],
    ['Mr Collins', [bookLink('Pride and Prejudice')]],
    ['Darcy is not shy', [bookLink('Pride and Prejudice'), lineLink(kept[2])]],
    ['Pemberley', [bookLink('Pride and Prejudice'), noteLink('Darcy is not shy')]],
    ['Finished Pride and Prejudice', [bookLink('Pride and Prejudice'), lineLink(kept[1])]],
    ['Frankenstein began', [bookLink('Frankenstein')]],
    ['The creature learns to read', [bookLink('Frankenstein'), monsterLink, lineLink(kept[8])]],
    ['Finished Frankenstein', [bookLink('Frankenstein'), monsterLink, ...(answered?.article ? [link(answered.article, 'What the clues added up to', 'article')] : [])]],
    ['Saw Hamlet', [bookLink('Hamlet')]],
    ['Hamlet thinks about every move', [bookLink('Hamlet'), madLink, lineLink(kept[12])]],
    ['Ophelia', [bookLink('Hamlet')]],
    ['Finished Hamlet', [bookLink('Hamlet'), madLink]],
    ['Odyssey, Book 12', [link(odyssey, 'A passage from Book 1'), link(book, 'The Odyssey')]],
    ['Started Dorian Gray', [link(dorian, 'The Picture of Dorian Gray')]],
    ['Finished Dorian Gray', [link(dorian, 'The Picture of Dorian Gray'), link(wilde, 'The line kept from it', 'nugget')]],
    ['Reading on Sunday evenings', [...books.map(([title]) => bookLink(title)), link(dorian, 'Dorian Gray')]],
    ['Two-minute rule', [noteLink('Write the email')]],
    ['Meetings that could be a note', [noteLink('Ask for the decision'), noteLink('Write the plan'), noteLink('Walk at lunch')]],
    ['Ask for the decision', [link(hal, 'Which AI flies the ship?')]],
    ['Write the plan on one page', [noteLink('Two-minute rule')]],
    ['Walk at lunch', [noteLink('Ten-minute walk')]],
    ['Ten-minute walk', [link(walk, 'Does a ten-minute walk shrink the slump?')]],
    ['Every city has a street', [noteLink('The best part of a trip'), noteLink('Walk at lunch')]],
    ['Long light this time', [noteLink('Walk at lunch'), noteLink('Every city has a street')]],
    ['Bread, third try', [noteLink('Bread, fourteenth try')]],
    ["Mum's lentil soup", [noteLink('Market')]],
    ['Market', [noteLink('Bread, third try')]],
    ['The library has a seed library', [noteLink("Planted the seed library's beans")]],
    ['Started a list of the words', [link(apophenia, 'Apophenia'), link(petrichor, 'Petrichor', 'nugget')]],
    ['A good question keeps', [madLink, link(top, 'Is the top still spinning?', 'question'), monsterLink]],
    ['Rain all week', [link(petrichor, 'Petrichor', 'nugget')]],
    ['Swam in the lake', [noteLink('First cold morning')]],
    ['Hunch: the 3pm slump', [link(walk, 'Does a ten-minute walk shrink the slump?'), noteLink('Ten-minute walk')]],
    ["Hermione's method", [link(article, "Mnemosyne's problem", 'article'), noteLink('Started a list of the words')]],
    ['A Remembrall', [link(schwarzschild, 'What is a Schwarzschild radius?', 'nugget'), noteLink("Hermione's method")]],
    ['Rosetta Stone', [link(gilgamesh, 'Gilgamesh came home with a story'), link(akkadian, 'Learn enough Akkadian?')]],
    ["Ada Lovelace's Note G", [noteLink('The Antikythera mechanism'), link(overfitting, 'Overfitting', 'nugget')]],
    ['Apollo 11', [noteLink('Wright Flyer'), link(blueDot, 'The Pale Blue Dot')]],
    ['Gutenberg', [noteLink('Magna Carta'), noteLink('Rosetta Stone')]],
    ['Darwin, 1837', [noteLink("Ada Lovelace's Note G"), noteLink("Marie Curie's notebooks")]]
  ]
  for (const [start, to] of joins) {
    const [words, id] = [...passed].find(([one]) => one.startsWith(start))!
    await write(id, `${words}\n\n${to.join(' · ')}`)
  }

  // A question from Middle-earth, still open, its clues from the book.
  const frodo = await v<string>('question:new', 'Did Frodo fail at Mount Doom?')
  const frodoClues = [
    [await v<string>('clue', frodo, 'At the edge of the fire he says it plainly: "I will not do this deed. The Ring is mine!"'), at(-4, '22:30')],
    [await v<string>('clue', frodo, 'The Ring is only destroyed because Gollum is there, and Gollum is only there because Bilbo and then Frodo spared him.'), at(-3, '21:50')],
    [await v<string>('clue', frodo, 'Tolkien wrote in a letter that by then no one could have given the Ring up of their own will. He failed a test nobody could pass.'), at(-1, '22:05')]
  ] as const
  nuggets++

  // --- writing of your own: short pieces, each built from things kept ------------------
  const essay = async (title: string, markdown: string): Promise<string> => {
    const id = await v<string>('article:new')
    await v('item:save', id, { title, body: doc(markdown) })
    nuggets++
    return id
  }
  const matrix = await essay('What The Matrix gets right about choosing', `
Morpheus holds out two pills and asks Neo to choose. Most people remember the choice. I keep thinking about what comes after it.

> All I'm offering is the truth. Nothing more.
>
> Morpheus, The Matrix (1999)

## The red pill is not the reward

Neo takes the red pill and wakes up cold, bald and weak, in a pod, in a world that is mostly ruins. Nothing about the truth is comfortable. That is the point of ${link(redPill, 'the card I keep coming back to', 'nugget')}: the choice costs him, and he cannot take it back.

## Cypher is the honest one

Cypher eats a steak he knows is not real and says ignorance is bliss. He is the villain, but he says out loud what most of us do quietly: we pick the comfortable story and stop checking.

> [!note] Why this is in my notes
> A list of things I believe that I have never checked would be a long list. ${link(plutoFixed, 'Pluto', 'nugget')} was on it for twenty years.

## The small version

Nobody offers me pills. The small version is the note I would rather not reread, the question I keep open instead of answering. ${link(top, 'Is the top still spinning?', 'question')} is a film asking the same thing with a spinning top.
`)
  const hermione = await essay("Hermione's method, a term later", `
At the start of term I wrote down ${noteLink("Hermione's method")}: read the book before the lecture. A term later, here is what happened.

## What she actually does

In the third book Hermione is given a Time-Turner so she can take more classes than one day has room for. By the end she has given two of them up and handed it back. Even she ran out of hours. The trick was never more hours. It was meeting everything twice.

## What I did

- Read the chapter the night before each lecture, slowly, without notes.
- In the lecture, wrote down only what surprised me.
- Turned each surprise into a card, so it came back before I forgot it.

> [!tip] What worked
> The lecture stopped being the first time I heard anything. It was the second reading, and the second time is when things stick.

## What did not

Reading ahead does not stop forgetting. ${noteLink('A Remembrall')} turns red and never says what you forgot. That is where Review comes in, the way ${link(article, "Mnemosyne's problem", 'article')} says: ${link(schwarzschild, 'What is a Schwarzschild radius?', 'nugget')} has come back three times and still holds.
`)
  const timeGiven = await essay('On Gandalf and the time given us', `
Frodo, at Bag End, wishes none of this had happened in his time. Gandalf does not argue with the wish. He answers with ${link(gandalf, 'the line I kept', 'nugget')}:

> All we have to decide is what to do with the time that is given us.
>
> Gandalf, in J.R.R. Tolkien, The Fellowship of the Ring (1954)

## Not chosen, only used

Nobody picks their time. Frodo did not ask for the Ring, and Gandalf does not pretend he did. What is left to decide is smaller and more useful: what to do on an ordinary Tuesday.

## Where I see it now

${link(aurelius, 'Very little is needed for a happy life', 'nugget')}, says Marcus Aurelius, an emperor writing notes to himself. Same advice, less wizard. And ${link(mars, 'Get to Mars before the dust storm', 'goal')} is only ever one day of steps at a time.

> [!note] Still open
> ${link(frodo, 'Did Frodo fail at Mount Doom?', 'question')} He did not choose the time either, and at the very end he could not choose at all.
`)
  const rosetta = await essay('The Rosetta Stone and the key in plain sight', `
${noteLink('Rosetta Stone')} was the note. This is the longer version, because the story is better than the stone.

## One decree, three scripts

French soldiers found the stone in 1799 near Rashid, which Europeans called Rosetta. It carries one decree from 196 BC, for the young king Ptolemy V, written three times: in hieroglyphs, in Demotic, and in Ancient Greek. Scholars could read the Greek. So they knew what the other two said, long before they could read them.

## Twenty years to read it

The British took the stone in 1801, and it has been in the British Museum since 1802. Thomas Young worked out that the oval rings, the cartouches, held royal names. In 1822 Jean-François Champollion showed that hieroglyphs spell sounds as well as ideas, and the whole script opened up.

![Jean-François Champollion, painted by Léon Cogniet in 1831|300](${await picture(champollionUrl)})

> [!info] What made it work
> Not a genius alone: a text everyone could already read, sitting beside the ones nobody could.

## Why it is in my notes

The same move works on anything hard. Put what you know beside what you do not. ${link(gilgamesh, 'Gilgamesh came home with a story')}, and ${link(akkadian, 'Learn enough Akkadian?')} is still a someday. And for what was lost instead of found: ${link(alexandria, 'Did the Library of Alexandria burn?', 'question')}
`)

  // Reviewed as Review asks, each gap longer than the last, so the days add
  // up across the year: a day, three, eight, eighteen, forty, then months.
  const GAPS = [1, 3, 8, 18, 40, 80, 150, 260]
  let graded = 0
  for (const card of kept) {
    let nth = 0
    for (const gap of GAPS) {
      const ago = card.n - gap
      if (ago <= 0) {
        // Next due on the day the gap ends: today for some, later for most.
        // Today's are due from midnight, so they wait in Review at any hour.
        yearAges.push({ dueAt: at(-ago, ago === 0 ? '00:00' : '08:00'), nuggetId: card.id })
        break
      }
      // Mostly remembered; now and then easy, now and then hard.
      await v('review:grade', card.id, graded++ % 5 === 4 ? 4 : graded % 7 === 0 ? 2 : 3, 5000)
      yearAges.push({ reviewedAt: at(-ago, `0${7 + (nth % 2)}:${String(10 + ((graded * 7) % 40)).padStart(2, '0')}`), itemId: card.id, nth: nth++ })
      // Past its last gap: a month from now.
      if (gap === GAPS[GAPS.length - 1]) yearAges.push({ dueAt: at(30, '08:00'), nuggetId: card.id })
    }
  }

  // A small routine kept most evenings, and the app opened most days.
  const reading = await task('Read twenty pages before bed every day')
  for (let n = 160; n >= 1; n--) if (n % 4 !== 2) yearAges.push({ done: reading, at: at(-n, '22:30') })
  for (let n = 280; n >= 1; n--) if (n % 9 !== 4 && (n < 120 || n % 3 !== 1)) yearAges.push({ openedAt: at(-n, '08:20') })
  await v('sandbox:age', yearAges)

  // Ten weeks of focus sessions, for each task's numbers and Stats': mostly
  // mornings, the odd evening, a few cut short or abandoned, breaks between.
  // Every day of the last nine, so a streak is running. Today is left alone,
  // and so is the Voight-Kampff task, kept for your own first session.
  const focus: unknown[] = []
  const recaps = ['The numbers only work if the fuel line is shorter.', 'Slower than I hoped. The second half went well.', 'Found the mistake from Tuesday.', '']
  for (let n = 69; n >= 1; n--) {
    if (n > 9 && (n % 7 === 3 || n % 11 === 5 || n % 13 === 0)) continue
    const count = 1 + Number(n % 3 === 0) + Number(n % 5 === 1)
    let clock = n % 6 === 4 ? 19 * 60 + 30 : 9 * 60 + (n % 4) * 10
    for (let i = 0; i < count; i++) {
      const planned = (n + i) % 3 === 0 ? 50 : 25
      const abandoned = (n * 7 + i) % 17 === 0
      const worked = abandoned ? 6 + (n % 5) : (n + i) % 9 === 4 ? Math.round(planned * 0.6) : planned
      const paused = (n + i) % 5 === 2 ? 3 : 0
      const start = at(-n, `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`)
      const end = new Date(new Date(start).getTime() + (worked + paused) * 60_000).toISOString()
      focus.push({ sessionAt: start, endedAt: end, taskId: [losAlamos, oxygenator, cuneiform, losAlamos, oxygenator][(n + i) % 5], pausedMs: paused * 60_000, plannedMs: planned * 60_000, abandoned, recap: abandoned ? '' : recaps[(n + i) % 7] ?? '' })
      if (i < count - 1) focus.push({ breakAt: end, ms: (n % 4 === 0 ? 10 : 5) * 60_000 })
      clock += worked + paused + 10
    }
    // Ten minutes at the wall, most evenings.
    if (n % 2 === 0 || n < 6) focus.push({ sessionAt: at(-n, '21:00'), endedAt: at(-n, '21:10'), taskId: wall, plannedMs: 10 * 60_000 })
  }
  await v('sandbox:age', focus)

  // --- dates moved into the past, so it all looks lived in -----------------------------
  const done = [-6, -5, -4, -3, -2, -1].map((n) => ({ done: wall, at: at(n, '21:00') }))
  await v('sandbox:age', [
    ...clues.map(([id, when]) => ({ glossAt: when, id })),
    ...marsGlosses.map(([id, when]) => ({ glossAt: when, id })),
    ...homerGlosses.map(([id, when]) => ({ glossAt: when, id })),
    ...paulClues.map(([id, when]) => ({ glossAt: when, id })),
    ...alexandriaClues.map(([id, when]) => ({ glossAt: when, id })),
    ...frodoClues.map(([id, when]) => ({ glossAt: when, id })),
    ...duneGlosses.map(([id, when]) => ({ glossAt: when, id })),
    ...done,
    { reviewedAt: at(-21, '08:10'), itemId: schwarzschild, nth: 0 },
    { reviewedAt: at(-17, '08:05'), itemId: schwarzschild, nth: 1 },
    { reviewedAt: at(-9, '07:58'), itemId: schwarzschild, nth: 2 },
    // Due from midnight, not 08:00: opened before eight, it must already wait in Review.
    { dueAt: at(0, '00:00'), nuggetId: schwarzschild },
    { createdAt: at(-150, '10:00'), nuggetId: overfitting },
    { createdAt: at(-60, '12:00'), nuggetId: pluto },
    { createdAt: at(-2, '07:41'), nuggetId: petrichor },
    { createdAt: at(-5, '06:56'), nuggetId: aurelius },
    { createdAt: at(-10, '23:03'), nuggetId: wilde },
    { createdAt: at(-7, '22:16'), nuggetId: gandalf },
    { createdAt: at(-6, '21:30'), nuggetId: redPill },
    { dueAt: at(0, '00:00'), nuggetId: redPill },
    { createdAt: at(-5, '22:00'), nuggetId: frodo },
    // Writing, newest first: the Matrix piece last night, the Rosetta Stone a month ago.
    { createdAt: at(-1, '21:40'), nuggetId: matrix },
    { createdAt: at(-4, '22:50'), nuggetId: timeGiven },
    { createdAt: at(-12, '20:30'), nuggetId: hermione },
    { createdAt: at(-26, '21:15'), nuggetId: rosetta },
    { createdAt: at(-16, '20:50'), nuggetId: alexandria },
    // Kept on the day they were caught, not the day the seed ran.
    { exitedAt: at(-2, '07:41'), captureId: petrichorCapture },
    { exitedAt: at(-5, '06:56'), captureId: aureliusCapture },
    { exitedAt: at(-10, '23:03'), captureId: wildeCapture },
    { exitedAt: at(-7, '22:16'), captureId: gandalfCapture },
    { createdAt: at(-9, '22:10'), nuggetId: paul },
    { createdAt: at(-18, '21:00'), nuggetId: duneGoal },
    // Held, aimed at and written for some while: their pages say since when.
    { createdAt: at(-24, '22:10'), nuggetId: top },
    { createdAt: at(-15, '09:30'), nuggetId: bronze },
    { createdAt: at(-30, '10:00'), nuggetId: mars },
    { createdAt: at(-280, '10:00'), nuggetId: homer },
    { createdAt: at(-40, '10:00'), nuggetId: kesselGoal },
    { createdAt: at(-3, '20:15'), nuggetId: article }
  ])

  // --- marked days, counted from today so they never go stale ------------------------
  // The astrophysics exam (in 21 days) is marked by its tag already.
  for (const mark of [
    { day: day(9), title: 'Hamlet essay due', icon: '📚', color: 'red', note: `question:${mad}` },
    { day: day(12), title: 'Dune film night', icon: '🎬', color: 'purple', note: duneNotes },
    { day: day(23), title: "Mum's birthday", icon: '🎂', color: 'pink', note: null },
    { day: day(-40), title: 'Start of the course', icon: '🎓', color: 'blue', note: null },
    { day: day(-141), title: 'Finished Frankenstein', icon: null, color: 'green', note: bookId['Frankenstein'] ?? null }
  ]) await v('milestone:set', mark)

  // --- a short reading queue, and what was read from it lately ------------------------
  await v('queue:add', [blueDot, dorian, article, schwarzschild, duneNotes])
  await v('queue:add', [wildeCapture, aureliusCapture])
  const { queue } = await v<{ queue: { id: string; itemId: string }[] }>('queue')
  for (const [id, n] of [[aureliusCapture, 6], [wildeCapture, 3]] as const) {
    const row = queue.find((one) => one.itemId === id)
    if (row) await v('queue:done', row.id, at(-n, '22:00'))
  }

  // --- the welcome's own examples, word for word, so whatever it shows can be found here ---
  // Its cards (welcome-box.ts STARTERS), quick capture's typed examples (EXAMPLES) and How a thought grows (welcome-flow.tsx).
  const starter = (kind: string): string => STARTERS.find((one) => one.kind === kind)!.text
  const thought = await capture({}, at(-3, '08:12'))
  await write(thought, `${starter('note')}\n\nA plain thought, kept as written: most of what anyone catches is one of these.`)
  const yoda = await capture({ kind: 'quote', attribution: 'Yoda', medium: 'The Empire Strikes Back (1980)' }, at(-6, '21:30'))
  await write(yoda, `${starter('quote')}\n\nA quote keeps who said it and where. A year from today it can come back to you as a postcard.`)
  const duneLink = await capture({ kind: 'link', title: 'Dune (novel)' }, at(-9, '19:10'))
  await write(duneLink, `
Dune (novel)

\`\`\`cardlink
url: ${starter('link')}
title: "Dune (novel)"
description: "Frank Herbert's 1965 novel of the desert planet Arrakis."
host: en.wikipedia.org
image: ${await picture(dunesUrl)}
\`\`\`
`)
  await task(starter('todo'))
  const frodoThought = await capture({}, at(-4, '23:10'))
  await write(frodoThought, EXAMPLES.note)
  const anagnorisis = await capture({ kind: 'word' }, at(-8, '07:55'))
  await write(anagnorisis, `Anagnorisis: the moment a character sees the truth of their situation.`)
  await field(anagnorisis, 'definition', 'The moment in a story when a character sees the truth, from the Greek for recognition.')
  const rosettaLink = await capture({ kind: 'link', title: 'Rosetta Stone' }, at(-27, '20:05'))
  await write(rosettaLink, `
Rosetta Stone

\`\`\`cardlink
url: ${EXAMPLES.link}
title: "Rosetta Stone"
description: "One decree from 196 BC in hieroglyphs, Demotic and Greek: the key to reading hieroglyphs."
host: en.wikipedia.org
\`\`\`
`)
  await task(EXAMPLES.todo)
  // How a thought grows: the question caught at the bus stop, the note it became, and what branched off it.
  const story = await capture({}, at(-5, '08:13'))
  await write(story, `${FLOW_WORDS.caught}\n\nWalton writes the letters, Victor tells his story inside them, and the creature tells his inside Victor's.`)
  await essay(FLOW_WORDS.note, `${FLOW_WORDS.lines.join('\n\n')}

![The 1831 frontispiece: the creature wakes and Victor runs|300](${await picture(frankensteinUrl)})`)
  await task(`${FLOW_WORDS.task} on Saturday`)
  const speaks = await v<string>('nugget:from', `${FLOW_WORDS.gem}: by listening to a family through a wall, before anyone has spoken to him.`, {})
  await v('item:save', speaks, { title: FLOW_WORDS.gem, prompt: 'How does the creature learn to speak?' })
  nuggets++

  // The deck that teaches Vigil itself, tagged #learn-vigil: a few new cards a day in Review.
  nuggets += await v<number>('learn:add')

  // Opened this morning, so Home's first tiles are the Matrix piece and the card it grew from.
  await v('home:opened', 'nugget', redPill)
  await v('home:opened', 'article', matrix)

  return { captures, nuggets, tasks }
}

/** The four landscapes Scenery shows in a sandbox when you have no folder of your own. */
/** The public-domain landscapes Vigil ships with, written to a folder of its own; that folder's path. */
export async function builtInScenery(): Promise<string> {
  const files = await Promise.all(([['wanderer.webp', wandererUrl], ['mont-blanc.webp', montBlancUrl], ['lake-tahoe.webp', tahoeUrl], ['landers-peak.webp', landersUrl], ['bernina.webp', berninaUrl], ['evening-prairie.webp', prairieUrl], ['jungfrau.webp', jungfrauUrl], ['harbor-entrance.webp', harborUrl], ['grand-manan.webp', mananUrl], ['lake-lucerne.webp', lucerneUrl], ['penobscot-bay.webp', penobscotUrl]] as const)
    .map(async ([name, url]) => ({ name, bytes: new Uint8Array(await (await fetch(url)).arrayBuffer()) })))
  return v<string>('sandbox:scenery', files)
}

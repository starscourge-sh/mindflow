import type { JSONContent } from '@tiptap/core'

import tabletUrl from '@/assets/sandbox/cuneiform-tablet.webp'
import plaqueUrl from '@/assets/sandbox/odysseus-plaque.webp'
import headUrl from '@/assets/sandbox/marble-head.webp'
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
 * Earlier today, `minutes` before now, and never before 00:05: the Inbox
 * reads newest first, so the order the examples were "caught" in is the
 * order they are read in.
 */
const earlier = (minutes: number): string => {
  const morning = new Date()
  morning.setHours(0, 5, 0, 0)
  return new Date(Math.max(morning.getTime() + (240 - minutes), Date.now() - minutes * 60_000)).toISOString()
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
  const odyssey = await capture({ kind: 'excerpt', attribution: 'Homer, tr. Samuel Butler', medium: 'The Odyssey, Book 1 (1900)' }, earlier(46))
  const leonardo = await capture({}, earlier(54))
  const endurance = await capture({}, earlier(61))
  const prestige = await capture({}, earlier(69))
  const totem = await capture({ kind: 'todo' }, earlier(77))
  const bit = await capture({ kind: 'bit' }, earlier(84))
  const book = await capture({ kind: 'book', attribution: 'Homer' }, earlier(92))
  const walk = await capture({ kind: 'experiment' }, at(-5, '12:40'))
  const wolf = await capture({}, earlier(107))
  const team = await capture({}, earlier(114))
  const mona17 = await capture({}, earlier(122))
  const supper18 = await capture({}, earlier(129))
  const adam19 = await capture({}, earlier(137))
  const primavera20 = await capture({}, earlier(144))
  const pitch = await capture({}, earlier(152))
  // Two books on the go: Dune half read, Dorian Gray finished.
  const dune = await capture({ kind: 'book', attribution: 'Frank Herbert', medium: 'A friend who would not stop talking about sandworms' }, earlier(166))
  const duneNotes = await capture({}, at(-1, '22:30'))
  const dorian = await capture({ kind: 'book', attribution: 'Oscar Wilde', medium: 'A second-hand shop in Dublin' }, at(-2, '21:15'))
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

  // A card with a history: reviewed three times over three weeks, due again today.
  const schwarzschild = await v<string>('nugget:from', 'How small a mass must be squeezed to become a black hole. For Earth, about 9 mm: a marble. #astrophysics', {})
  await v('item:save', schwarzschild, { title: 'What is a Schwarzschild radius?', prompt: 'What is a Schwarzschild radius?' })
  for (const grade of [3, 3, 4]) await v('review:grade', schwarzschild, grade, 6000)
  nuggets++

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
  const paul = await v<string>('question:new', 'Is Paul the hero of Dune?')
  const paulClues = [
    [await v<string>('clue', paul, 'He sees the holy war coming, in every future, and walks toward it anyway.'), at(-8, '22:40')],
    [await v<string>('clue', paul, 'Herbert said he wrote him as a warning about following a leader like that, not as a model.'), at(-1, '22:55')]
  ] as const
  nuggets += 3

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
  const year = new Date().getFullYear()
  const homer = await v<string>('goal:new', 'Read the whole Odyssey: 24 books', `${year}-12-31`, `${year}-01-01`, 'Three thousand years old and still the best road trip.')
  const homerGlosses: [string, string][] = [
    [await v<string>('gloss', homer, 'Book 5: Calypso lets him go. Seven years on one island.'), at(-26, '22:00')],
    [await v<string>('gloss', homer, "Book 9: the Cyclops. 'Nobody' is the best fake name ever given."), at(-6, '21:45')]
  ]
  // One beacon on the desktop is a reminder; two is clutter.
  await v('goal:beacon:set', homer, 'off')
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
  await v('goal:beacon:set', duneGoal, 'off')
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
  await task('Send the Los Alamos budget by Friday')
  const blackHole = await task('Black hole data from the probe')
  await v('task:save', blackHole, { waitingOn: 'TARS' })
  await v('task:save', wall, { due: at(0, '21:00'), reschedules: 0 })
  await task('Learn to read cuneiform someday')
  // One already done this morning, struck through on Today's page.
  await v('task:done', await task('Water the potatoes today 8am'))
  const kick = await task('Plan the kick tomorrow')
  await v('task:save', kick, { subtasks: [{ text: 'Music cue: one minute before', done: true }, { text: 'Fill the bathtub', done: false }, { text: 'Get the van off the bridge', done: false }] })
  // A task that remembers the capture it came from.
  const plane = await capture({}, earlier(160))
  await write(plane, 'Follow the white rabbit. Probably a tattoo, but you never know.')
  await v('tasks:from', [plane], 'Follow the white rabbit')
  tasks++
  // A task to practise a focus session on, its notes saying how.
  const voightKampff = await task('Run the Voight-Kampff test today')
  await v('task:save', voightKampff, { notes: doc(`
A focus session is a timer on one task: a goal, how long, and a small clock that floats over everything until you are done. When it ends, it asks how it went.

**Try it:** under **Sessions**, beside these notes, choose **Start a focus session**. 25 minutes is already filled in; press ↵.
`) })
  // A study task, made from the article.
  await v('study', article, 'Study the forgetting curve this week')
  tasks++

  // --- the notes themselves ------------------------------------------------------------
  await write(start, `
# Start here

This is a practice copy of Vigil, full of examples. Break anything you like: **Reset**, in the bar at the top, puts it all back.

![A clay school tablet from Babylon, covered in cuneiform|300](${tablet})

*A student's practice tablet, Babylon, about 3,800 years old. The Met, open access.*

Five thousand years ago, scribes in Sumer pressed lists into clay: grain, beer, debts, and later the first stories. In Sumerian, *an-ki*, heaven and earth, meant everything there is. Vigil's aim is smaller: everything you noticed.

Every note here teaches one thing, and asks you to try it.

[TOC]

## Catch

Press ⌘. in any app. A small box opens; write, press ⌘↵, and you are back where you were. It all lands in the Inbox, each thing with a kind: a note, a quote, a word, a link, a book.

${link(kessel, 'Kessel Run maths')} · ${link(napoleon, 'A quote, kept with your own words')} · ${link(blueDot, 'The Pale Blue Dot')}

## Wait

Nothing in the Inbox goes stale or nags to be cleared. It waits until you have a few minutes, and the oldest things come back on their own. ${link(sanskrit, 'This one has waited 40 days')}.

## Tidy

Once a day, a few minutes over the last few days: a tag here, a bold line there. Nothing to decide yet. Press ⌘K and choose **Tidy**.

## Decide

Once a week: keep it (P), finish it (R) or let it go (D). Nothing is ever destroyed: ${link(pitch, 'a pitch let go')} is still there to bring back.

## Come back

What you keep comes back: as ${link(schwarzschild, 'a Review card', 'nugget')} just before you would forget it, as a hint in the box, and as what you caught on this day last year. Goals and questions stay in sight: ${link(mars, 'Get to Mars before the dust storm', 'goal')}, ${link(top, 'Is the top still spinning?', 'question')}

## Find

⌘K finds anything: notes, tasks, goals, and every action in the app. Try *renaissance*, or open ${link(leonardo, "Leonardo's notebooks")}.

A link can land partway down a note: ${link(prestige, 'Every great trick has three acts', '', 'The Turn')} opens that note at its second act, unfolded.

**Try it:** click it. To make your own, write \`[[Note#Heading]]\`, or type @ and a note's name, then # to pick one of its headings.

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

A decision keeps what you weighed, so it is never argued again. Its fields, under Details at the top right, hold the call and what would reopen it.

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

**Try it:** put the caret after any = and press Tab to write the answer in.

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

**Try it:** press P to keep it. Vigil asks what it means to you first: a quote kept with nothing of yours beside it is one you collected, not one you understood.
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

**Try it:** paste any link into a note.
`)

  await write(apophenia, `
Apophenia: seeing patterns in noise.

A word keeps its meaning and an example. Keep it and it comes back in Review as a card: the word on the front, the meaning behind.

**Try it:** press P.
`)
  await field(apophenia, 'definition', 'Seeing meaningful patterns in random things.')
  await field(apophenia, 'example', 'Faces in clouds; a model that finds a cat in static.')

  await write(odyssey, `
Tell me, O muse, of that ingenious hero who travelled far and wide after he had sacked the famous town of Troy. Many cities did he visit, and many were the nations with whose manners and customs he was acquainted; moreover he suffered much by sea while trying to save his own life and bring his men safely home; but do what he might he could not save his men, for they perished through their own sheer folly in eating the cattle of the Sun-god Hyperion; so the god prevented them from ever reaching home.

An excerpt is a long passage you mean to mine. **Try it:** select one sentence and choose **Nugget** in the bar that appears. It is kept on its own, and once something is lifted out, the excerpt steps aside.

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

Link a note with [[ as in ${link(top, 'Is the top still spinning?', 'question')}, tag with # as in #interstellar, and @ finds any note to link without leaving the line. Vim keys are there too, off to start with: Settings, Writing.

`)

  await write(prestige, `
Every great trick has three acts

A heading folds away everything under it, so a long note reads as its outline.

**Try it:** point at a heading and click the arrow beside it. Or press ⌘K and choose **Fold every heading**.

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

**Try it:** open this and choose **Make it a task**, or press T on it in the Decide pass.
`)

  await write(bit, `
There's no place like 127.0.0.1

A bit (a joke, a line for later) starts private: blurred in lists until you point at it, and never brought up unasked.

**Try it:** press ⌥⌘S for safe mode, from any app, and watch everything private leave the screen. Press it again to bring it all back.
`)

  await write(book, `
The Odyssey

A book keeps where you are with it and what you made of it. This one feeds ${link(homer, 'a goal of 24 books', 'goal')} and ${link(odyssey, 'an excerpt from Book 1')}.

**Try it:** open its details and set it to Finished: a place for what you will keep from it appears.
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

**Try it:** set one on any note with **Remind me…**, in its details.
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
Dune

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
The Picture of Dorian Gray

A book set to Finished asks one more thing: what you will keep from it, a line or two under Takeaway.

**Try it:** press ⌘K and type *Dorian*: the book and ${link(wilde, 'the line kept from it', 'nugget')} come up together, one by its title, the other by where it is from.
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

  // --- the pages ---------------------------------------------------------------------------
  await v('notes:day:save', day(0), {
    body: doc(`
Morning: three coffees, one idea.

A page a day. What you catch, finish and review today gathers underneath it on its own.

**Try it:** write one line about how today went, then tick **Reviewed**.
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

  // --- dates moved into the past, so it all looks lived in -----------------------------
  const done = [-6, -5, -4, -3, -2, -1].map((n) => ({ done: wall, at: at(n, '21:00') }))
  await v('sandbox:age', [
    ...clues.map(([id, when]) => ({ glossAt: when, id })),
    ...marsGlosses.map(([id, when]) => ({ glossAt: when, id })),
    ...homerGlosses.map(([id, when]) => ({ glossAt: when, id })),
    ...paulClues.map(([id, when]) => ({ glossAt: when, id })),
    ...duneGlosses.map(([id, when]) => ({ glossAt: when, id })),
    ...done,
    { reviewedAt: at(-21, '08:10'), itemId: schwarzschild, nth: 0 },
    { reviewedAt: at(-12, '08:05'), itemId: schwarzschild, nth: 1 },
    { reviewedAt: at(-4, '07:58'), itemId: schwarzschild, nth: 2 },
    { dueAt: at(0, '08:00'), nuggetId: schwarzschild },
    { createdAt: at(-150, '10:00'), nuggetId: overfitting },
    { createdAt: at(-60, '12:00'), nuggetId: pluto },
    { createdAt: at(-2, '07:41'), nuggetId: petrichor },
    { createdAt: at(-5, '06:56'), nuggetId: aurelius },
    { createdAt: at(-10, '23:03'), nuggetId: wilde },
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

  return { captures, nuggets, tasks }
}

/** The four landscapes Scenery shows in a sandbox when you have no folder of your own. */
export async function sandboxScenery(): Promise<string> {
  const files = await Promise.all(([['wanderer.webp', wandererUrl], ['mont-blanc.webp', montBlancUrl], ['lake-tahoe.webp', tahoeUrl], ['landers-peak.webp', landersUrl]] as const)
    .map(async ([name, url]) => ({ name, bytes: new Uint8Array(await (await fetch(url)).arrayBuffer()) })))
  return v<string>('sandbox:scenery', files)
}

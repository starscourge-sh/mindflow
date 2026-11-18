import type { JSONContent } from '@tiptap/core'
import { EXAMPLES, starters } from '@/lib/welcome-box'
import { flowTask, flowWords } from '@/components/haligtree/welcome-flow'
// The same desert the welcome's Dune card shows (welcome-reel.tsx).
import dunesUrl from '@/assets/welcome/dunes.webp'

import tabletUrl from '@/assets/sandbox/cuneiform-tablet.webp'
import plaqueUrl from '@/assets/sandbox/odysseus-plaque.webp'
import headUrl from '@/assets/sandbox/marble-head.webp'
import champollionUrl from '@/assets/sandbox/champollion.webp'
import dotUrl from '@/assets/sandbox/pale-blue-dot.webp'
import monaUrl from '@/assets/sandbox/mona-lisa.webp'
import annunciationUrl from '@/assets/sandbox/annunciation.webp'
import supperUrl from '@/assets/sandbox/last-supper.webp'
import adamUrl from '@/assets/sandbox/creation-of-adam.webp'
import primaveraUrl from '@/assets/sandbox/primavera.webp'
import trinityUrl from '@/assets/sandbox/masaccio-trinity.webp'
import tributeUrl from '@/assets/sandbox/tribute-money.webp'
import austenUrl from '@/assets/sandbox/jane-austen.webp'
import aureliusUrl from '@/assets/sandbox/marcus-aurelius.webp'
import shelleyUrl from '@/assets/sandbox/mary-shelley.webp'
import shakespeareUrl from '@/assets/sandbox/william-shakespeare.webp'
import wildeUrl from '@/assets/sandbox/oscar-wilde.webp'
import vasariUrl from '@/assets/sandbox/giorgio-vasari.webp'
import napoleonUrl from '@/assets/sandbox/napoleon-bonaparte.webp'
import leonardoUrl from '@/assets/sandbox/leonardo-da-vinci.webp'
import homerUrl from '@/assets/sandbox/homer.webp'
import creatureUrl from '@/assets/sandbox/the-creature.webp'
import victorUrl from '@/assets/sandbox/victor-frankenstein.webp'
import lordHenryUrl from '@/assets/sandbox/lord-henry.webp'
import draculaUrl from '@/assets/sandbox/count-dracula.webp'
import holmesUrl from '@/assets/sandbox/sherlock-holmes.webp'
import bennetUrl from '@/assets/sandbox/elizabeth-bennet.webp'
import odysseusUrl from '@/assets/sandbox/odysseus.webp'
import idealCityUrl from '@/assets/sandbox/ideal-city.webp'
import vitruvianUrl from '@/assets/sandbox/vitruvian-man.webp'
import atlanticusUrl from '@/assets/sandbox/codex-atlanticus.webp'
import delphicUrl from '@/assets/sandbox/delphic-sibyl.webp'
import sibylStudyUrl from '@/assets/sandbox/libyan-sibyl-study.webp'
import ermineUrl from '@/assets/sandbox/lady-with-an-ermine.webp'
import ginevraUrl from '@/assets/sandbox/ginevra-de-benci.webp'
import simonettaUrl from '@/assets/sandbox/botticelli-simonetta.webp'
import unicornUrl from '@/assets/sandbox/lady-with-a-unicorn.webp'
import copernicusUrl from '@/assets/sandbox/copernicus.webp'
import babelUrl from '@/assets/sandbox/tower-of-babel.webp'
import pompeiiUrl from '@/assets/sandbox/last-day-of-pompeii.webp'
import medusaUrl from '@/assets/sandbox/raft-of-the-medusa.webp'
import homerPicUrl from '@/assets/sandbox/apotheosis-of-homer.webp'
import ahasuerusUrl from '@/assets/sandbox/ahasuerus.webp'
import daphneUrl from '@/assets/sandbox/apollo-and-daphne.webp'
import peterUrl from '@/assets/sandbox/denial-of-saint-peter.webp'
import catherineUrl from '@/assets/sandbox/saint-catherine.webp'
import bocklinUrl from '@/assets/sandbox/bocklin-death-fiddle.webp'
import opheliaUrl from '@/assets/sandbox/ophelia-cabanel.webp'
import frankensteinPlateUrl from '@/assets/sandbox/frankenstein-1831.webp'
import dorianCoverUrl from '@/assets/sandbox/dorian-lippincott.webp'
import prideProtestedUrl from '@/assets/sandbox/pride-protested.webp'
import prideDancingUrl from '@/assets/sandbox/pride-dancing.webp'
import hayWainUrl from '@/assets/scenery/hay-wain.webp'
import temeraireUrl from '@/assets/scenery/fighting-temeraire.webp'
import wandererUrl from '@/assets/scenery/wanderer.webp'
import ninthWaveUrl from '@/assets/scenery/ninth-wave.webp'
import oxbowUrl from '@/assets/scenery/the-oxbow.webp'
import { clip } from '../../../main/clip'
import { call } from '@/lib/haligtree'
import { APP_NAME } from '../../../main/name'

/**
 * What the sandbox holds when it opens: about fifty examples, each teaching
 * one thing Haligtree does, in the voice of Nisaba, the Sumerian goddess of
 * writing and keeper of the scribes' tablets.
 *
 * Every rule of the sandbox's writing is here in one place: each note says
 * the one thing it teaches on its first lines, then a "Try it" line asking
 * you to do it right there. The film, myth and history are only the examples;
 * take the reference away and the note still teaches. Copyrighted works get a
 * name or a phrase, never a passage; Homer (Butler, 1900), Marcus Aurelius
 * (Long, 1862), Leonardo (Richter, 1883) and Vasari (de Vere, 1912) are
 * public domain, each line checked against that edition's text.
 *
 * Everything goes in through the same calls a person's actions make, so the
 * examples change with the app. The one thing the app cannot do on its own,
 * putting a few dates in the past, is `sandbox:age`, which only the sandbox
 * answers. Dates are counted from the day it is seeded, so a reset always
 * gives the same world, just as fresh.
 */

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

type SeedCounts = { captures: number; nuggets: number; tasks: number }

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
    await call('capture:set', id, 'capturedAt', when)
    captures++
    return id
  }
  const write = (id: string, markdown: string): Promise<unknown> => window.api.captures.save(id, { body: doc(markdown), fetched: true })
  const field = (id: string, key: string, value: unknown): Promise<unknown> => call('notes:fields:set', 'captures', id, key, value)

  // Practice tasks never send a notification, and nothing celebrates while
  // the examples go in; the sandbox's own look is set by the caller.
  // One goal's card on the desktop (Dune's, set below), no other: two stickies in all, with Today's.
  // The example book has turned its goals on for Home (off in a new book): the nearest two, where a newcomer looks first.
  await call('settings:set', { notify: 'quiet', celebrate: false, goalBeacon: 'off', goalsOnHome: 'nearest', goalsNearest: 2, bio: 'Reads on the bus, cooks on Sundays, and keeps the lines worth keeping.' })

  const [tablet, plaque, head, dot, mona, annunciation, supper, adam, primavera] = await Promise.all(
    [tabletUrl, plaqueUrl, headUrl, dotUrl, monaUrl, annunciationUrl, supperUrl, adamUrl, primaveraUrl].map(picture))

  // --- the captures, newest first as the Inbox reads them --------------------------------
  const start = await capture({}, earlier(2))
  const errands = await capture({}, earlier(5))
  const hal = await capture({ kind: 'checkback' }, earlier(9))
  const kessel = await capture({}, earlier(16))
  const napoleon = await capture({ kind: 'quote', attribution: 'Napoleon Bonaparte' }, earlier(23))
  const blueDot = await capture({ kind: 'link', title: 'The Pale Blue Dot' }, earlier(31))
  const apophenia = await capture({ kind: 'word' }, earlier(38))
  // Who said it is Homer; whose English it is belongs with where it is from, as Marcus Aurelius's lines have it.
  const odyssey = await capture({ kind: 'quote', attribution: 'Homer', medium: 'The Odyssey, Book 1, tr. Samuel Butler (1900)' }, earlier(46))
  const leonardo = await capture({}, earlier(54))
  const endurance = await capture({}, earlier(61))
  const prestige = await capture({}, earlier(69))
  const totem = await capture({ kind: 'todo' }, earlier(77))
  const bit = await capture({}, earlier(84))
  const book = await capture({ attribution: 'Homer' }, earlier(92))
  const walk = await capture({ kind: 'checkback' }, at(-5, '12:40'))
  const wolf = await capture({}, earlier(107))
  const team = await capture({}, earlier(114))
  const mona17 = await capture({}, earlier(122))
  const supper18 = await capture({}, earlier(129))
  const adam19 = await capture({}, earlier(137))
  const primavera20 = await capture({}, earlier(144))
  const pitch = await capture({}, earlier(152))
  // Two books on the go: Dune half read, Dorian Gray finished.
  const dune = await capture({ attribution: 'Frank Herbert' }, earlier(166))
  const duneNotes = await capture({}, at(-1, '22:30'))
  const dorian = await capture({ attribution: 'Oscar Wilde' }, at(-2, '21:15'))
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
  const petrichor = await call<string>('promote', petrichorCapture)
  nuggets++

  // A quote kept with words of your own beside it.
  const aureliusCapture = await capture({ kind: 'quote', attribution: 'Marcus Aurelius', medium: 'Meditations, tr. George Long (1862)' }, at(-5, '06:55'))
  await write(aureliusCapture, 'Remember this, that very little is needed for living a happy life.')
  const aurelius = await call<string>('promote', aureliusCapture, 'Mine: the list of what I need keeps getting shorter, and that is the point.')
  nuggets++

  // A line kept from a novel: the character who says it, inside the book it is from.
  const wildeCapture = await capture({ kind: 'quote', attribution: 'Lord Henry', medium: 'The Picture of Dorian Gray, chapter 2 (1890)' }, at(-10, '23:02'))
  await write(wildeCapture, 'The only way to get rid of a temptation is to yield to it.')
  const wilde = await call<string>('promote', wildeCapture, 'He says it to be clever. The rest of the book is the bill.')
  nuggets++

  // And one on time, from the emperor's notebook (public domain, Long's 1862 translation); Middle-earth's wizard says
  // the same thing in the essay below, in our own words, since that book is still in copyright.
  const gandalfCapture = await capture({ kind: 'quote', attribution: 'Marcus Aurelius', medium: 'Meditations, Book 4, tr. George Long (1862)' }, at(-7, '22:15'))
  await write(gandalfCapture, 'Do not act as if thou wert going to live ten thousand years. Death hangs over thee. While thou livest, while it is in thy power, be good.')
  const gandalf = await call<string>('promote', gandalfCapture, 'Written in a tent on campaign, to himself. Not a sermon: a reminder for an ordinary Tuesday.')
  nuggets++

  // A card with a history: reviewed three times over three weeks, due again today.
  const schwarzschild = await call<string>('nugget:from', 'How small a mass must be squeezed to become a black hole. For Earth, about 9 mm: a marble. #astrophysics', {})
  await call('item:save', schwarzschild, { title: 'What is a Schwarzschild radius?', prompt: 'What is a Schwarzschild radius?' })
  for (const grade of [3, 3, 4]) await call('review:grade', schwarzschild, grade, 6000)
  nuggets++

  // A film card, new this week, waiting in Review today.
  const redPill = await call<string>('nugget:from', 'The red. He wakes up in a pod, and the comfortable lie is gone for good. Cypher later wants it back: ignorance is bliss. #film', {})
  await call('item:save', redPill, { title: 'Red pill or blue pill?', prompt: 'Red pill or blue pill: which one does Neo take, and what does it cost him?' })
  nuggets++

  // Missed four times: Review offered to rewrite it, split it or pause it, and it waits on the Struggling shelf.
  const lagrange = await call<string>('nugget:from', 'Five points where a small body can sit still between two large ones, held there by both pulls and its orbit. The Webb telescope sits at L2, a million miles beyond the Earth. #astrophysics', {})
  await call('item:save', lagrange, { title: 'Lagrange points', prompt: 'What are the Lagrange points, how many are there, and which one does Webb use?' })
  for (const grade of [3, 1, 1, 1, 1, 2]) await call('review:grade', lagrange, grade, 9000)
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
  const pluto = await call<string>('nugget:from', 'Pluto is the ninth planet.', {})
  const plutoFixed = await call<string>('supersede', pluto, 'Pluto is a dwarf planet, since the vote in Prague in 2006.')
  await call('gloss', plutoFixed, `Unlike the Ministry of Truth, ${APP_NAME} keeps what you used to believe, marked as replaced.`)
  nuggets += 2

  // Kept months ago: it comes back as a hint now and then.
  const overfitting = await call<string>('nugget:from', 'Overfitting: a model that learns its training set by heart and fails on anything new. People do it too: the exam passed, the subject never learnt.', {})
  await call('item:save', overfitting, { title: 'Overfitting' })
  nuggets++

  // An article: a page of your own, written from what you kept.
  const article = await call<string>('article:new')
  await call('item:save', article, {
    title: "Mnemosyne's problem: how memory fades",
    body: doc(`
A page is your own writing, made from things you kept. It links to them, and they link back.

**Try it:** press ⌘K and type *study* to find the task this page made, then tick it off.

![A Greek marble head of a woman, 425 to 400 BC](${head})

*A Greek marble head, 425 to 400 BC. The Met, open access.*

Mnemosyne was the Greek goddess of memory, and the mother of the nine Muses. The order matters: memory first, then every art.

In 1885 Hermann Ebbinghaus learnt lists of nonsense syllables and tested himself as they slipped away. Most of a list was gone within a day, and what was left faded more slowly after that: the forgetting curve.

The fix is old and dull and works. Meet the thing again as it starts to fade, and each time it lasts longer. That is all Review does: ${link(schwarzschild, 'What is a Schwarzschild radius?', 'nugget')} has come back three times, each gap longer than the last.

What you keep, rather than what you read, is what returns: ${link(petrichor, 'Petrichor', 'nugget')}, ${link(overfitting, 'Overfitting', 'nugget')}.
`)
  })
  nuggets++

  // --- questions held open ---------------------------------------------------------------
  const top = await call<string>('question:new', 'Is the top still spinning?')
  const clues = [
    [await call<string>('clue', top, 'A totem only works if nobody else has ever handled it.'), at(-20, '21:30')],
    [await call<string>('clue', top, 'Watch the ring, not the top.'), at(-9, '07:15')],
    [await call<string>('clue', top, 'No-Face speaks only in the voices it swallowed. Whose dream is this, then?'), at(-2, '23:05')]
  ] as const
  await call('question:pin', top, true)
  const bronzeClue = await capture({}, at(-11, '18:20'))
  await write(bronzeClue, 'Drought, earthquakes and the Sea Peoples, all at once?')
  const bronze = await call<string>('question:new', 'Why did the Bronze Age collapse around 1177 BC?')
  await call('clue', bronze, '', bronzeClue)
  const alexandria = await call<string>('question:new', 'Did the Library of Alexandria burn, or slowly fade away?')
  const alexandriaClues = [
    [await call<string>('clue', alexandria, "Caesar's fire in 48 BC burnt part of the city by the harbour. Books, or only warehouses? Nobody agrees."), at(-14, '21:10')],
    [await call<string>('clue', alexandria, 'Hypatia taught maths in Alexandria until 415 AD, long after the great Library had dwindled. No single fire: centuries of less money and fewer scholars.'), at(-5, '22:00')]
  ] as const
  const paul = await call<string>('question:new', 'Is Paul the hero of Dune?')
  const paulClues = [
    [await call<string>('clue', paul, 'He sees the holy war coming, in every future, and walks toward it anyway.'), at(-8, '22:40')],
    [await call<string>('clue', paul, 'Herbert said he wrote him as a warning about following a leader like that, not as a model.'), at(-1, '22:55')]
  ] as const
  nuggets += 4

  // --- goals ---------------------------------------------------------------------------
  const mars = await call<string>('goal:new', 'Get to Mars before the dust storm', day(68), day(-30), "The Hab won't hold forever.")
  const marsLogs = [
    ['Ran the numbers on the oxygenator. It holds, if nothing else breaks.', -28],
    ['Water: made 40 litres, burnt one eyebrow.', -21],
    ['Potatoes, day 12: sprouting.', -14],
    ['Fixed the rover battery with duct tape. Duct tape is magic.', -9],
    ['Rover range is up to 90 km a day.', -4],
    ['Mapped the route to the crater. 3,200 km, give or take.', -1]
  ] as const
  const marsGlosses: [string, string][] = []
  for (const [text, n] of marsLogs) marsGlosses.push([await call<string>('gloss', mars, text), at(n, n === -1 ? '20:10' : '18:30')])
  // Every day here counts from the day the sandbox is opened, so nothing in it ever goes stale:
  // a year's goal begun five months ago, seven to go, whatever the date.
  const homer = await call<string>('goal:new', 'Read the whole Odyssey: 24 books', day(215), day(-150), 'Three thousand years old and still the best road trip.')
  const homerGlosses: [string, string][] = [
    [await call<string>('gloss', homer, 'Book 5: Calypso lets him go. Seven years on one island.'), at(-26, '22:00')],
    [await call<string>('gloss', homer, "Book 9: the Cyclops. 'Nobody' is the best fake name ever given."), at(-6, '21:45')]
  ]
  const kesselGoal = await call<string>('goal:new', 'Make the Kessel Run in under 12 parsecs', day(-3), day(-40), 'Fastest hunk of junk in the galaxy.')
  await call('gloss', kesselGoal, 'Cut the corner past the Maw. 11.5 parsecs.')
  await call('goal:close', kesselGoal, 'made it')
  // A small reading goal, its logs a reading diary.
  const duneGoal = await call<string>('goal:new', 'Finish Dune before film night', day(12), day(-18), 'Book before film, every time.')
  const duneGlosses: [string, string][] = [
    [await call<string>('gloss', duneGoal, 'Book One done. The dinner party chapter is all knives.'), at(-15, '22:20')],
    [await call<string>('gloss', duneGoal, 'Into the deep desert. Slower going, more glossary than story.'), at(-8, '22:35')],
    [await call<string>('gloss', duneGoal, 'Book Two finished on the bus. Missed my stop.'), at(-1, '18:05')]
  ]
  // The best-known of them, and the only goal with a card on the desktop: Dune.
  await call('goal:beacon:set', duneGoal, 'always')
  nuggets += 4

  // --- tasks, typed as a person would ------------------------------------------------
  const task = async (text: string): Promise<string> => {
    tasks++
    return (await call<{ id: string }>('task:add', text, undefined, false)).id
  }
  await task('Return the briefcase to Marsellus today 10am p1')
  const tablets = await task('Return the Gilgamesh tablets to the library')
  await call('task:save', tablets, { due: at(-2, '17:00') })
  const wall = await task('Chip at the wall for ten minutes every day')
  const losAlamos = await task('Send the Los Alamos budget by Friday')
  const blackHole = await task('Black hole data from the probe')
  await call('task:save', blackHole, { waitingOn: 'TARS', due: at(3, '09:00') })
  await call('task:save', wall, { due: at(0, '21:00'), reschedules: 0 })
  const cuneiform = await task('Learn to read cuneiform someday')
  // Important and not yet urgent: the matrix's Plan box.
  const oxygenator = await task('Draft the oxygenator repair plan next week !!')
  // Lengths planned on tasks that already have a date, so the month's Wrapped has planned against did to show.
  await call('task:save', tablets, { estimate: 60 })
  await call('task:save', wall, { estimate: 150 })
  await call('task:save', losAlamos, { estimate: 180 })
  // One already done this morning, struck through on Today's page.
  await call('task:done', await task('Water the potatoes today 8am'))
  const kick = await task('Plan the kick tomorrow')
  await call('task:save', kick, { subtasks: [{ text: 'Music cue: one minute before', done: true }, { text: 'Fill the bathtub', done: false }, { text: 'Get the van off the bridge', done: false }] })
  const django = await task('Rewatch Django Unchained on Saturday 8pm')
  await call('task:save', django, { notes: doc('The D is silent. Bring the good popcorn, and Sam, who has never seen it.') })
  // A task that remembers the capture it came from.
  const plane = await capture({}, earlier(160))
  await write(plane, 'Follow the white rabbit. Probably a tattoo, but you never know.')
  await call('tasks:from', [plane], 'Follow the white rabbit')
  tasks++
  // A task to practise a focus session on, its notes saying how.
  const voightKampff = await task('Run the Voight-Kampff test today')
  await call('task:save', voightKampff, { notes: doc(`
A focus session is a timer on one task: a goal, how long, and a small clock that floats over everything until you are done. When it ends, it asks how it went.

**Try it:** under “Sessions”, beside these notes, choose “Start a focus session”. 25 minutes is already filled in; press ↵.
`) })
  // A study task, made from the article.
  await call('study', article, 'Study the forgetting curve this week')
  tasks++

  // Today in their own order, written out: the briefcase first, the test, then the wall.
  const briefcase = (await call<{ id: string; title: string }[]>('tasks')).find((one) => one.title.startsWith('Return the briefcase'))
  for (const [at, id] of [briefcase?.id, voightKampff, wall].entries()) if (id) await call('task:save', id, { sortOrder: at })
  // Lines in a note that are tasks too: three linked, three still plain to try it on.
  const saturday = await capture({}, earlier(30))
  const errand = async (text: string): Promise<string> => {
    tasks++
    return (await call<{ id: string }>('task:add', text, saturday, false)).id
  }
  const linked = [await errand('Pick up the suit from the cleaners'), await errand('Buy a new Rubik’s cube'), await errand('Post the letter to Mrs Hudson')]
  await call('task:done', linked[1])
  const line = (text: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text }] })
  await window.api.captures.save(saturday, { fetched: true, body: { type: 'doc', content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Saturday saturday' }] },
    line('Made tasks from this note: each line is ticked with its task, here or in Today.'),
    { type: 'taskList', content: [
      { type: 'taskItem', attrs: { checked: false, taskId: linked[0] }, content: [line('Pick up the suit from the cleaners')] },
      { type: 'taskItem', attrs: { checked: true, taskId: linked[1] }, content: [line('Buy a new Rubik’s cube')] },
      { type: 'taskItem', attrs: { checked: false, taskId: linked[2] }, content: [line('Post the letter to Mrs Hudson')] }
    ] },
    line('Still plain lines:'),
    { type: 'bulletList', content: ['Return the hired tuxedo', 'Get the piano tuned', 'Collect the photos'].map((text) => ({ type: 'listItem', content: [line(text)] })) },
    { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Try it:' }, { type: 'text', text: ' select the three plain lines and choose “3 tasks” in the bar that comes up.' }] }
  ] } })

  // --- the notes themselves ------------------------------------------------------------
  await write(start, `
# Start here

This is someone else's book: their reading, films, questions, tasks and goals. Look around and try anything; your own notes are safe. “Reset”, in the bar at the top, puts it all back.

![A clay school tablet from Babylon, covered in cuneiform|300](${tablet})

*A student's practice tablet, Babylon, about 3,800 years old. The Met, open access.*

Five thousand years ago, scribes in Sumer pressed lists into clay: grain, beer, debts, and later the first stories. In Sumerian, *an-ki*, heaven and earth, meant everything there is. ${APP_NAME}'s aim is smaller: everything you noticed.

Every note here teaches one thing, and asks you to try it.

[TOC]

## Catch

Press ⌘. in any app. A small box opens; write, press ⌘↵, and you are back where you were. It all lands in the Inbox, each thing with a kind: a note, a task, a quote, a word, a link. A task goes on to your list in Tasks.

${link(kessel, 'Kessel Run maths')} · ${link(napoleon, 'A quote, kept with your own words')} · ${link(blueDot, 'The Pale Blue Dot')}

## Wait

Nothing in the Inbox goes stale or nags to be cleared. It waits until you have a few minutes, and the oldest things come back on their own. ${link(sanskrit, 'This one has waited 40 days')}.

## Tidy

Once a day, a few minutes over the last few days: a tag here, a bold line there. Nothing to decide yet. Press ⌘K and choose “Tidy captures”.

## Decide

Once a week: keep it (P), finish it (R) or move it to the Bin (D). Nothing is ever destroyed: ${link(pitch, 'a pitch in the Bin')} is still there to bring back.

## Come back

What you keep comes back: as ${link(schwarzschild, 'a Review card', 'nugget')} that waits longer each time you remember it, as a hint in quick capture, and as what you caught on this day last year. Goals and questions stay in sight: ${link(mars, 'Get to Mars before the dust storm', 'goal')}, ${link(top, 'Is the top still spinning?', 'question')}

## Look back

Once a month and once a year, ${APP_NAME} reads you back: the books you read and the lines you kept from each, the hour you think best, what you kept circling, how much you remembered. This copy has a year behind it: five books finished, from Meditations to Dorian Gray, and a question about Frankenstein settled.

**Try it:** press ⌘K and choose “Your year, wrapped”, then → to turn its pages.

## Write out your day

Some days are clearer written down as a list. Open Tasks and choose “Write out my day”, and the caret waits on a new line at the end of Today’s list: one thing a line, ↵ for the next, ⇥ to make a line a step of the one above, and the first three numbered 1, 2, 3. Every line is a task, so it shows everywhere tasks do. Lines in any note can become tasks too: ${link(saturday, 'Saturday errands')}.

**Try it:** press ⌘K and choose “Write out my day”.

## Find

⌘K finds anything: notes, tasks, goals, and every action in the app. Try *renaissance*, or open ${link(leonardo, "Leonardo's notebooks")}.

A link can land partway down a note: ${link(prestige, 'Every great trick has three acts', '', 'The Turn')} opens that note at its second act, unfolded.

**Try it:** click it. To make your own, type \`@\` and a note's name, then \`#\` to pick one of its headings.

*Nisaba, keeper of the tablets*
`)
  await call('pin', 'captures', start, true)

  await write(errands, `
Tasks, said in plain words

Write a task the way you would say it, and the date comes out of the words: *call Mr Wolf tomorrow 9am*, *send the budget by Friday*, *chip at the wall every day*.

**Try it:** press G then T for Today, press A, and type *feed the cat tomorrow 8am*. Then tick a task off with its circle, or press E on it.

Some days read better written out: choose “Write out my day” at the top of Tasks and write the day as a list, one task a line, the most important first.

Today is what is due now. Week lays the next seven days side by side, Upcoming lists everything with a date ahead, and Routines hold what comes round again. In Today, open *Run the Voight-Kampff test* to try a focus session.
`)

  await write(hal, `
Which AI flies the ship: HAL or TARS?

A Check back: a date, then a question back to you. Under the title it keeps the call, what would reopen it, and the day it asks whether the call still holds.

**Try it:** click in the table and press Tab to go cell to cell. Tab in the last cell adds a row.

| | HAL 9000 | TARS |
|---|---|---|
| Honesty | Selective | 90%, by setting |
| Sense of humour | None found | 75%, adjustable |
| Opens the pod bay doors | Declines | Holds them open |
| Survives a black hole | Not tested | Yes, and sends the data |

**The call:** TARS. Humour at 75%.
`)
  await field(hal, 'The call', 'TARS, with humour at 75%')
  await field(hal, 'Options weighed', 'HAL 9000, TARS, or flying it by hand')
  await field(hal, 'Reopen only if', 'HAL learns to say sorry.')
  await field(hal, 'back', at(30, '12:00'))
  await field(hal, 'ask', 'Is TARS still the one to fly the ship?')

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

**Try it:** find it in the Inbox list and press P to keep it. ${APP_NAME} asks what it means to you first: a quote kept with nothing of yours beside it is one you collected, not one you understood.
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
  // The book is said in where it is from, so its place there is only the lines: said once, not "Book 1 … Book 1".
  await field(odyssey, 'location', 'the opening lines')

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

**Try it:** open this and choose “Make it a task”, or press T on it while you decide (⌘K, then “Decide”).
`)

  await write(bit, `
There's no place like 127.0.0.1 #bit

Tagged #bit (a joke, a line for later), a note starts private: blurred in lists until you point at it, and never brought up unasked.

**Try it:** press ⌥⌘S for safe mode, in any Haligtree window, and watch the stickies, pins and hints leave the screen. Press it again to bring them all back.
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

A Check back: tried for two weeks, started five days ago, and on its day it comes back to ask what you found.

**Try it:** set its outcome when it comes back, in a line or two.
`)
  await field(walk, 'ask', 'Is the afternoon better with a short walk after lunch?')
  await field(walk, 'back', at(9, '12:00'))

  await write(wolf, `
Call Mr Wolf. He solves problems.

A reminder is a pin with a date: tomorrow at 9:00 this pins itself to the top of the sidebar and Home.

**Try it:** set one on any note with “Remind me…”, in its details.
`)
  await call('remind', 'captures', wolf, at(1, '09:00'))

  await write(team, `
The road to Mordor

- [x] Leave the Shire
- [x] Through the Mines of Moria
- [ ] Mount Doom

Any note can be stuck to your desktop, on every Space: right-click it and choose “Stick on the desktop”. **Try it:** tick the last box.
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
  await call('tag:set', 'renaissance', { color: 'orange' })

  await write(pitch, `
Pitch: a sequel where Odysseus takes the long way home on purpose.

In the Bin, not deleted. Everything you move to the Bin waits there, to bring back whenever you like.
`)
  await window.api.captures.save(pitch, { status: 'discarded' })

  await write(dune, `
Dune #book

Heard of it from a friend who would not stop talking about sandworms.

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

The test with the box in the first chapter: pain, to tell a person from an animal. Fear is the thing he is taught to master first, and the boy believes it.

## Book Two: Muad'Dib

Paul and his mother in the deep desert, with the Fremen. He sees the futures now, and most of them end in a holy war fought in his name.

He knows, and he goes on. That is where I began to wonder: ${link(paul, 'Is Paul the hero of Dune?', 'question')}

## Book Three: The Prophet

The worm ride, the duel, the emperor beaten. It reads like a triumph. Herbert said it was meant as a warning.
`)

  const dorianCover = await picture(dorianCoverUrl)
  await write(dorian, `
The Picture of Dorian Gray #book

Found in a second-hand shop in Dublin.

![Lippincott's Monthly Magazine, July 1890: the first printing of Dorian Gray](${dorianCover})

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
  // Today's tasks as one sticky, ticked off through the day, under Dune's card in one column.
  window.api.stick('today', 'today', true)

  // --- the pages ---------------------------------------------------------------------------
  await call('notes:day:save', day(0), {
    body: doc(`
Morning: three coffees, one idea.

A page a day. What you catch, finish and review today gathers underneath it on its own.

**Try it:** write one line about how today went, then tick “Mark looked back”.
`)
  })
  await call('notes:day:save', day(-1), {
    body: doc("Read Book 9 on the train. 'Nobody' is still the best fake name in literature.\n\nTen minutes at the wall. Six days running."),
    reviewed: true
  })
  // Older days, so the Feed has Journal days to bring back: one from a year ago today.
  for (const [n, words] of [
    [-12, 'Finished the Odyssey at last. Penelope is the cleverest person in it, and the poem knows it.\n\nWall: eight minutes. My fingers have opinions now.'],
    [-47, "Couldn't sleep, so I went out and looked up. Orion was already rising. Wrote down three questions I can't answer yet."],
    [-365, 'First day with a notebook that answers back. I caught nine things before lunch and could not tell you what any of them were by dinner. That is the problem to fix.']
  ] as const) await call('notes:day:save', day(n), { body: doc(words), reviewed: true })
  await call('period:save', `week:${monday()}`, {
    fields: { theme: 'Do, or do not', summary: 'Small steps on the big things: the oxygenator, the wall, Book 9.', projects: 'Mars, the Odyssey', people: 'Watney, TARS, Mr Wolf' },
    body: doc(`One page a week: what matters, and how it went.

This week: ${link(mars, 'Get to Mars before the dust storm', 'goal')}, and the Los Alamos budget by Friday.`)
  })
  await call('period:save', `month:${day(0).slice(0, 7)}`, {
    fields: { focus: 'The long patient chisel: ten minutes a day, every day.' }
  })

  // --- tags with a date to be ready by ---------------------------------------------------
  await call('tag:set', 'astrophysics', { examAt: day(21), color: 'purple' })

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

  // Everyone the notes are from, as pages whole from the start: a portrait (public domain, SOURCES.txt; none where the only
  // pictures are in copyright), what they did and when they lived, a line about them, and a few words of yours.
  // The line is kept as written by you (no address), which also marks them as looked up: opening one asks Wikipedia nothing.
  const people: [string, string, string, string, string, string, string][] = [
    ['Jane Austen', austenUrl, 'Novelist', '1775', '1817', 'English novelist of money, manners and marriage.', 'Six novels, written mostly in a shared sitting room, with a creaking door that warned her when someone was coming. Funnier than school made her sound, and sharper. Pride and Prejudice is the one I keep going back to, for Elizabeth changing her mind and saying so. She published without her name: the title pages said only "By a Lady". Read Persuasion next: everyone says it is the grown-up one, written last, about a second chance taken late. Her letters to Cassandra are worth it too, for the gossip.'],
    ['Marcus Aurelius', aureliusUrl, 'Roman emperor and Stoic', '121', '180', 'Roman emperor from 161 to 180, and a Stoic philosopher.', 'Emperor of Rome for nineteen years, mostly at war on the Danube. Meditations was his notebook, written to himself in Greek and never meant to be read. That is why it works: nobody is being lectured but him.'],
    ['Mary Shelley', shelleyUrl, 'Novelist', '1797', '1851', 'English novelist, best known for Frankenstein.', 'Wrote Frankenstein at eighteen, in the wet summer of 1816 by Lake Geneva, for a ghost story contest. The creature is the one I remember. She outlived almost everyone in that house, and kept writing.'],
    ['William Shakespeare', shakespeareUrl, 'Playwright and poet', '1564', '1616', 'English playwright, poet and actor.', 'Thirty-odd plays and the sonnets. Half the phrases I use without thinking are his. Hamlet is the one I keep: a man who thinks about acting for five acts.'],
    ['Oscar Wilde', wildeUrl, 'Playwright and novelist', '1854', '1900', 'Irish poet, playwright and wit, who died in Paris at forty-six.', 'One novel, The Picture of Dorian Gray, and the preface he wrote for it is a list of fights he wanted to pick. Lord Henry gets all the best lines in it, and the book does not trust a single one of them.'],
    ['Giorgio Vasari', vasariUrl, 'Painter, architect and writer', '1511', '1574', 'Italian painter and architect, best known for his Lives of the painters, sculptors and architects, printed in 1550 and again in 1568.', 'A painter himself, and a friend of Michelangelo, so he takes sides. I read him for the gossip and stay for the eye: he tells you what to look at before you have seen the wall.'],
    ['Napoleon Bonaparte', napoleonUrl, 'Emperor of the French', '1769', '1821', 'French general who became Emperor of the French.', 'Kept for one line, about leaving an enemy alone while he is making a mistake. He is quoted far more than he is read, and I have not read him either.'],
    ['Leonardo da Vinci', leonardoUrl, 'Painter, engineer and scientist', '1452', '1519', 'Italian painter, engineer and scientist of the Renaissance, who painted the Mona Lisa and The Last Supper.', 'He kept a commonplace book before it had a name: page after page in mirror writing, on machines, proportions and how to draw. He warned his readers he would repeat himself, because memory cannot keep it all. The best excuse I know for keeping a book like this one.'],
    // No years: nobody knows them.
    ['Homer', homerUrl, 'Poet of the Iliad and the Odyssey', '', '', 'The Greek poet the Iliad and the Odyssey are credited to. When he lived, and whether he was one poet, nobody can say for sure.', 'The poems are what is left of him, and they are enough. I am reading the Odyssey a book at a time, in Samuel Butler’s prose.'],
    // No portrait, on purpose (SOURCES.txt says why): he keeps his initials.
    ['Frank Herbert', '', 'Science fiction writer', '1920', '1986', 'American science fiction writer, best known for Dune (1965).', 'He said he wrote Paul as a warning about following a leader like that, not as a model. I am half way through Dune and cheering for Paul anyway, which may be the point.']
  ]
  for (const [who, portrait, what, born, died, about, words] of people) {
    if (portrait) await call('people:set', who, await picture(portrait))
    await call('source:set', 'attribution', who, words)
    await call('source:facts', 'attribution', who, { what, born, died })
    await call('source:bio', 'attribution', who, about, '')
  }

  // Six characters, kept apart from the people: the work each is in, a line about them in your words, who played one, and a
  // face where an edition of their book drew one that is public domain (SOURCES.txt). Paul Atreides and Gandalf are in
  // copyright, and no such drawing shows Dorian Gray's face: they keep their initials.
  const characters: [string, string, string, string, string][] = [
    ['The creature', 'Frankenstein', '', 'Made from the dead and left on his own the night he woke. Teaches himself to read from three books, and asks only for company. He never gets a name.', creatureUrl],
    ['Victor Frankenstein', 'Frankenstein', '', 'The student who made the creature, then ran from it. The book is his confession, told on a ship in the Arctic.', victorUrl],
    ['Dorian Gray', 'The Picture of Dorian Gray', '', 'Stays young and lovely while his portrait, locked upstairs, takes every year and every cruelty for him.', ''],
    ['Paul Atreides', 'Dune', 'Timothée Chalamet', 'The duke’s son taken to the desert planet, who sees the futures and goes on anyway.', ''],
    ['Lord Henry', 'The Picture of Dorian Gray', '', 'Talks Dorian into everything and does none of it himself. Every line is a quotation, which is the trouble with him.', lordHenryUrl],
    ['Gandalf', 'The Fellowship of the Ring', '', 'The wizard who sends Frodo off, then turns up when hope is thinnest.', '']
  ]
  for (const [who, work, played, line, face] of characters) {
    await call('source:character', who, work, played)
    await call('source:bio', 'attribution', who, line, '')
    if (face) await call('people:set', who, await picture(face))
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
    [161, 1, '07:45', 'The creature', 'Frankenstein, chapter 10 (1831)', 'Remember that I am thy creature; I ought to be thy Adam, but I am rather the fallen angel, whom thou drivest from joy for no misdeed.', 'He has read Paradise Lost. Of course he has: it is the only story about him.'],
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
    const nugget = await call<string>('promote', id, mine)
    nuggets++
    const book = books.find(([title]) => where.startsWith(title))![0]
    kept.push({ id: nugget, n: back, book, line })
    yearAges.push({ createdAt: at(-back, time), nuggetId: nugget }, { exitedAt: at(-back, time), captureId: id })
  }
  // Read again later, and a word added each time.
  for (const [index, n, text] of [[1, 60, 'Read chapter 1 aloud. Funnier aloud.'], [7, 40, 'Came back in Review on a hard week, and still lands.'], [12, 8, 'Came back in Review on a bad day. It helped, a little.']] as const)
    yearAges.push({ glossAt: at(-n, '21:30'), id: await call<string>('gloss', kept[index].id, text) })

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
  // The gem each kept one became, by its words, for the replies written over the years below.
  const passedGem = new Map<string, string>()
  for (const [n, weekday, time, words, became] of passing) {
    const [back, when] = on(n, weekday, time)
    const id = await capture({}, when)
    await write(id, words)
    if (became !== 'gone') passed.set(words, id)
    // Looked at again a day or two later, when the week's few minutes came round.
    yearAges.push({ usedAt: at(-back + 1 + (back % 2), '20:30'), captureId: id })
    if (became === 'kept') {
      const gem = await call<string>('promote', id)
      passedGem.set(words, gem)
      yearAges.push({ createdAt: at(-back, '21:45'), nuggetId: gem }, { exitedAt: at(-back, '21:45'), captureId: id })
      nuggets++
    } else if (became === 'gone') {
      await window.api.captures.save(id, { status: 'discarded' })
      yearAges.push({ exitedAt: at(-back + 4, '20:00'), captureId: id })
    } else if (became === 'task') {
      await call('tasks:from', [id], 'Buy a waterproof notepad')
      tasks++
      yearAges.push({ exitedAt: at(-back + 1, '09:00'), captureId: id })
    }
  }

  // A decision made with help from a film, the call kept with what would reopen it.
  const party = await capture({ kind: 'checkback' }, at(-12, '19:40'))
  await write(party, `
Not saying who spoilt the surprise party

Jimmy's rule in Goodfellas: never rat on your friends, and always keep your mouth shut. A terrible role model with one good rule.
`)
  await field(party, 'The call', 'Say nothing. The cake was still a surprise.')
  await field(party, 'Reopen only if', 'It happens at my party.')
  await field(party, 'ask', 'Does saying nothing still hold?')
  await field(party, 'back', at(3, '12:00'))
  // Decisions made weeks ago and settled: the Feed asks of one a day whether it was right.
  const decided: [string, string, number][] = [
    ['Read Dune before seeing the film\n\nThe book first, so the film is a second reading, not the first. Villeneuve can wait a month.', 'Read the book before the film', 64],
    ['Swapped the late-night scroll for a paper book\n\nPhone out of the bedroom, a novel on the pillow. Gandalf would approve: the only choice we get is what to do with the time we have.', 'A paper book in bed, the phone left in the kitchen', 41],
    ['Walk to work on Tuesdays and Thursdays\n\nForty minutes each way, like Forrest Gump with a backpack. The bus is quicker but I never think on the bus.', 'Walk to work two days a week', 33]
  ]
  for (const [text, call_, back] of decided) {
    const one = await capture({ kind: 'checkback' }, at(-back, '20:15'))
    await write(one, text)
    await field(one, 'state', 'Decided')
    await field(one, 'call', call_)
    await field(one, 'decidedAt', at(-back, '20:15'))
  }

  // A question held for a month, then answered: its clues become an article.
  const monster = await call<string>('question:new', 'Who is the monster in Frankenstein?')
  const monsterClues: [string, number][] = [
    ['Victor runs from the creature the moment it opens its eyes. Everything after is that one minute, paid for.', 170],
    ['The creature saves a drowning girl and is shot for it.', 158],
    ['Victor tears up the half-made bride, and is surprised by what follows.', 150],
    ['Both of them, Victor first. The creature was taught by everyone who ran from him.', 142]
  ]
  // Dated before it is settled, so the article lists each clue on its own day.
  await call('sandbox:age', [{ createdAt: at(-172, '21:30'), nuggetId: monster }, ...await Promise.all(monsterClues.map(async ([text, n]) => ({ glossAt: at(-n, '21:40'), id: await call<string>('clue', monster, text) })))])
  // --- the year joined up: what you wrote about a book links to it, a book to
  // the lines kept from it and the question it left, and the places two
  // books, or a book and a walk, meet. It is what the Map draws.
  const short = (text: string): string => clip(text, 40).replace(/[|\]]/g, '')
  const lineLink = (line: (typeof kept)[number]): string => link(line.id, short(line.line), 'nugget')
  const linesOf = (book: string): string => kept.filter((line) => line.book === book).map(lineLink).join(' · ')
  const bookLink = (title: string): string => link(bookId[title], title)
  // The question holds the lines that were its clues, and its answer keeps them.
  await call('item:save', monster, { body: doc(`The lines it came from: ${linesOf('Frankenstein')}. From ${bookLink('Frankenstein')}.`) })
  const answered = await call<{ article: string | null }>('question:close', monster, 'answered')
  yearAges.push({ closedAt: at(-141, '21:50'), nuggetId: monster })
  if (answered?.article) yearAges.push({ createdAt: at(-141, '21:50'), nuggetId: answered.article })
  // And one still circling.
  const mad = await call<string>('question:new', 'Is Hamlet mad, or acting?')
  yearAges.push({ createdAt: at(-118, '22:00'), nuggetId: mad })
  for (const [text, n] of [['He tells Horatio he will put on an antic disposition: acting, so far.', 115], ['Talking to the skull, there is nobody left to act for.', 101], ['Read the graveyard scene again. Still both.', 20]] as const)
    yearAges.push({ glossAt: at(-n, '21:40'), id: await call<string>('clue', mad, text) })
  nuggets += 3

  const monsterLink = link(monster, 'Who is the monster in Frankenstein?', 'question')
  const madLink = link(mad, 'Is Hamlet mad, or acting?', 'question')
  await call('item:save', mad, { body: doc(`The lines that keep it open: ${linesOf('Hamlet')}. From ${bookLink('Hamlet')}.`) })
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
  const frodo = await call<string>('question:new', 'Did Frodo fail at Mount Doom?')
  const frodoClues = [
    [await call<string>('clue', frodo, 'At the edge of the fire he says it plainly: "I will not do this deed. The Ring is mine!"'), at(-4, '22:30')],
    [await call<string>('clue', frodo, 'The Ring is only destroyed because Gollum is there, and Gollum is only there because Bilbo and then Frodo spared him.'), at(-3, '21:50')],
    [await call<string>('clue', frodo, 'Tolkien wrote in a letter that by then no one could have given the Ring up of their own will. He failed a test nobody could pass.'), at(-1, '22:05')]
  ] as const
  nuggets++

  // --- writing of your own: short pieces, each built from things kept ------------------
  const essay = async (title: string, markdown: string): Promise<string> => {
    const id = await call<string>('article:new')
    await call('item:save', id, { title, body: doc(markdown) })
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
Frodo, at Bag End, wishes none of this had happened in his time. Gandalf does not argue with the wish. He tells him, more or less, that nobody gets to choose their time, only what they do with it. Marcus Aurelius wrote ${link(gandalf, 'the same thing to himself', 'nugget')}, seventeen centuries earlier:

> Do not act as if thou wert going to live ten thousand years. Death hangs over thee. While thou livest, while it is in thy power, be good.
>
> Marcus Aurelius, Meditations, Book 4 (tr. George Long, 1862)

## Not chosen, only used

Nobody picks their time. Frodo did not ask for the Ring, and Gandalf does not pretend he did. What is left to decide is smaller and more useful: what to do on an ordinary Tuesday.

## Where I see it now

${link(aurelius, 'Very little is needed for a happy life', 'nugget')}, he says elsewhere. Same advice, less wizard. And ${link(mars, 'Get to Mars before the dust storm', 'goal')} is only ever one day of steps at a time.

> [!note] Still open
> ${link(frodo, 'Did Frodo fail at Mount Doom?', 'question')} He did not choose the time either, and at the very end he could not choose at all.
`)
  // The scene it is about is in The Fellowship of the Ring: its where, so Gandalf's "in The Fellowship of the Ring" opens a page with it.
  await call('item:save', timeGiven, { medium: characters.find(([who]) => who === 'Gandalf')![1] })

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
      await call('review:grade', card.id, graded++ % 5 === 4 ? 4 : graded % 7 === 0 ? 2 : 3, 5000)
      yearAges.push({ reviewedAt: at(-ago, `0${7 + (nth % 2)}:${String(10 + ((graded * 7) % 40)).padStart(2, '0')}`), itemId: card.id, nth: nth++ })
      // Past its last gap: a month from now.
      if (gap === GAPS[GAPS.length - 1]) yearAges.push({ dueAt: at(30, '08:00'), nuggetId: card.id })
    }
  }

  // A small routine kept most evenings, and the app opened most days.
  const reading = await task('Read twenty pages before bed every day')
  // One practice to try: "Practise it" on, opening your #reading gems at 9pm, 30 minutes planned.
  await call('practices:set', reading, { on: true, targetMin: 30, loadKind: 'tag', load: 'reading' })
  for (let n = 160; n >= 1; n--) if (n % 4 !== 2) yearAges.push({ done: reading, at: at(-n, '22:30') })
  for (let n = 280; n >= 1; n--) if (n % 9 !== 4 && (n < 120 || n % 3 !== 1)) yearAges.push({ openedAt: at(-n, '08:20') })
  await call('sandbox:age', yearAges)

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
      // The sites the day's first session sent away, fewer as the weeks went on: Stats' sites chart and Wrapped's card.
      const blocked = i ? {} : Object.fromEntries(([['youtube.com', n % 2 ? 1 + (n % 3) + Number(n > 35) : 0], ['x.com', n % 3 ? 0 : 1 + (n % 2)], ['reddit.com', n % 5 ? 0 : 1], ['news.ycombinator.com', n % 7 === 1 ? 1 : 0]] as const).filter(([, count]) => count))
      focus.push({ sessionAt: start, endedAt: end, taskId: [losAlamos, oxygenator, cuneiform, losAlamos, oxygenator][(n + i) % 5], pausedMs: paused * 60_000, plannedMs: planned * 60_000, abandoned, recap: abandoned ? '' : recaps[(n + i) % 7] ?? '', blocked })
      if (i < count - 1) focus.push({ breakAt: end, ms: (n % 4 === 0 ? 10 : 5) * 60_000 })
      clock += worked + paused + 10
    }
    // Ten minutes at the wall, most evenings.
    if (n % 2 === 0 || n < 6) focus.push({ sessionAt: at(-n, '21:00'), endedAt: at(-n, '21:10'), taskId: wall, plannedMs: 10 * 60_000 })
  }
  await call('sandbox:age', focus)

  // --- dates moved into the past, so it all looks lived in -----------------------------
  const done = [-6, -5, -4, -3, -2, -1].map((n) => ({ done: wall, at: at(n, '21:00') }))
  await call('sandbox:age', [
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
    // Days marked for a goal show on that goal's card and road, and nowhere else's.
    { day: day(12), title: 'Dune film night', icon: '🎬', color: 'purple', note: `goal:${duneGoal}` },
    { day: day(40), title: 'Dust storm season', icon: '🌪️', color: 'orange', note: `goal:${mars}` },
    { day: day(30), title: 'Book 12 by here', icon: '📚', color: 'blue', note: `goal:${homer}` },
    { day: day(23), title: "Mum's birthday", icon: '🎂', color: 'pink', note: null },
    { day: day(-40), title: 'Start of the course', icon: '🎓', color: 'blue', note: null },
    { day: day(-141), title: 'Finished Frankenstein', icon: null, color: 'green', note: bookId['Frankenstein'] ?? null }
  ]) await call('milestone:set', mark)

  // --- a short reading queue, and what was read from it lately ------------------------
  await call('queue:add', [blueDot, dorian, article, schwarzschild, duneNotes])
  await call('queue:add', [wildeCapture, aureliusCapture])
  const { queue } = await call<{ queue: { id: string; itemId: string }[] }>('queue')
  for (const [id, n] of [[aureliusCapture, 6], [wildeCapture, 3]] as const) {
    const row = queue.find((one) => one.itemId === id)
    if (row) await call('queue:done', row.id, at(-n, '22:00'))
  }

  // --- a Renaissance thread: one interest followed for three weeks, the way a
  // commonplace book grows. A line of Vasari's kept as a gem, the question it
  // raised, the clues, and the article they became; Leonardo's own notebooks,
  // which were a commonplace book; a reading note on the Sistine ceiling.
  // Every picture is public domain or CC0 (SOURCES.txt beside them), every
  // quote checked against the public-domain edition it cites.
  const [trinityPic, tributePic, idealCityPic, vitruvianPic, atlanticusPic, delphicPic, sibylStudyPic] = await Promise.all(
    [trinityUrl, tributeUrl, idealCityUrl, vitruvianUrl, atlanticusUrl, delphicUrl, sibylStudyUrl].map(picture))

  // A few gems kept with the painting they are about, from long ago, so the
  // Feed has pictures to show the way a real book would. All public domain,
  // the same pictures the scenery uses.
  const paintings = [
    [hayWainUrl, 'The Hay Wain', 'Constable painted it in his London studio, from sketches made by the river Stour.', 'John Constable, 1821', 260],
    [temeraireUrl, 'The Fighting Temeraire', 'A warship from Trafalgar towed away to be broken up, by a small steam tug.', 'J. M. W. Turner, 1839', 310],
    [wandererUrl, 'Wanderer above the Sea of Fog', 'We never see his face, so the view becomes ours.', 'Caspar David Friedrich, about 1818', 355],
    [ninthWaveUrl, 'The Ninth Wave', "Sailors' lore says the ninth wave is the biggest. They are holding on to the mast.", 'Ivan Aivazovsky, 1850', 400],
    [oxbowUrl, 'The Oxbow', 'Wilderness on the left, farms on the right, and the storm passing between them.', 'Thomas Cole, 1836', 445]
  ] as const
  const paintingAges: unknown[] = []
  for (const [url, name, line, by, back] of paintings) {
    const gem = await call<string>('nugget:from', `${name}\n\n![${name}, ${by}](${await picture(url)})\n\n${line}`, {})
    paintingAges.push({ createdAt: at(-back, '21:10'), nuggetId: gem })
    nuggets++
  }
  await call('sandbox:age', paintingAges)
  const vasari = (life: string): string => `Lives of the Painters, Life of ${life}, tr. Gaston du C. de Vere (1912)`
  const richter = (section: number): string => `The Notebooks, §${section}, tr. Jean Paul Richter (1883)`
  const renAges: unknown[] = []

  // Three lines from Vasari, so a "From Giorgio Vasari" postcard can come back.
  const vasariMasaccio = await capture({ kind: 'quote', attribution: 'Giorgio Vasari', medium: vasari('Masaccio') }, at(-19, '21:20'))
  await write(vasariMasaccio, 'But the most beautiful thing, apart from the figures, is a barrel-shaped vaulting, drawn in perspective and divided into squares filled with rosettes, which are foreshortened and made to diminish so well that the wall appears to be pierced.')
  await field(vasariMasaccio, 'location', "On Masaccio's Trinity, Santa Maria Novella")
  const pierced = await call<string>('promote', vasariMasaccio, 'A flat wall painted to look like a room you could walk into. That is the trick the whole century learnt.')
  await call('item:save', pierced, { title: 'The wall appears to be pierced', prompt: "What did Vasari say Masaccio's painted vault does to the wall of Santa Maria Novella?" })
  await call('review:grade', pierced, 3, 6000)
  nuggets++
  const vasariBrunelleschi = await capture({ kind: 'quote', attribution: 'Giorgio Vasari', medium: vasari('Filippo Brunelleschi') }, at(-17, '22:05'))
  await write(vasariBrunelleschi, 'He gave much attention to perspective, which was then in a very evil plight by reason of many errors that were made therein; and in this he spent much time, until he found by himself a method whereby it might become true and perfect.')
  const vasariMichelangelo = await capture({ kind: 'quote', attribution: 'Giorgio Vasari', medium: vasari('Michelagnolo Buonarroti') }, at(-3, '21:35'))
  await write(vasariMichelangelo, `"It will be finished when I shall have satisfied myself in the matter of art."

Michelangelo's answer to Pope Julius II, who kept asking when the Sistine ceiling would be done.`)

  // Two from Leonardo's notebooks: one kept with words of mine, one long enough to mine for a line.
  const leonardoTheory = await capture({ kind: 'quote', attribution: 'Leonardo da Vinci', medium: richter(19) }, at(-15, '07:40'))
  await write(leonardoTheory, 'Practice must always be founded on sound theory, and to this Perspective is the guide and the gateway; and without this nothing can be done well in the matter of drawing.')
  const gateway = await call<string>('promote', leonardoTheory, 'He puts theory first, then fills thousands of pages with practice. Both, then.')
  await call('item:save', gateway, { title: 'Perspective is the guide and the gateway', prompt: 'In his notebooks, what does Leonardo call "the guide and the gateway" of drawing?' })
  nuggets++
  const leonardoOrder = await capture({ kind: 'quote', attribution: 'Leonardo da Vinci', medium: richter(4) }, at(-13, '22:15'))
  await write(leonardoOrder, "And this is to be a collection without order, taken from many papers which I have copied here, hoping to arrange them later each in its place, according to the subjects of which they may treat. But I believe that before I am at the end of this [task] I shall have to repeat the same things several times; for which, O reader! do not blame me, for the subjects are many and memory cannot retain them [all].")
  await field(leonardoOrder, 'location', 'Begun at Florence, 22 March 1508')
  const memoryLine = await call<string>('nugget:from', 'The subjects are many and memory cannot retain them all.', { captureId: leonardoOrder })
  await call('item:save', memoryLine, { title: 'Memory cannot retain them all', prompt: 'Why did Leonardo warn readers of his notebooks that he would repeat himself?' })
  nuggets++

  // Three words, two kept as cards and one left in the Inbox to try P on.
  const word = async (text: string, definition: string, example: string, when: string, keep: boolean): Promise<string | null> => {
    const id = await capture({ kind: 'word' }, when)
    await write(id, text)
    await field(id, 'definition', definition)
    await field(id, 'example', example)
    if (!keep) return null
    nuggets++
    const nugget = await call<string>('promote', id)
    renAges.push({ createdAt: when, nuggetId: nugget }, { exitedAt: when, captureId: id })
    return nugget
  }
  const sfumato = (await word('Sfumato: soft blending of tones with no hard outlines, like smoke.', 'Soft blending of light into shadow with no hard edges, from the Italian fumo, smoke.', "The corners of the Mona Lisa's mouth and eyes, left in shadow so her expression never quite settles.", at(-14, '08:10'), true))!
  const contrapposto = (await word('Contrapposto: a figure standing with its weight on one leg, hips and shoulders tilted opposite ways.', 'A standing pose with the weight on one leg, so the hips tilt one way and the shoulders the other, from the Italian for set against.', "Michelangelo's David; the twisting nude youths around the edges of the Sistine ceiling.", at(-4, '07:55'), true))!
  await word('Chiaroscuro: strong contrast of light and dark, to make things look solid.', 'Modelling with strong light and dark, from the Italian chiaro, light, and scuro, dark.', "Masaccio's figures in the Brancacci Chapel, lit from one side as if by the chapel's real window.", at(-9, '21:50'), false)

  // A museum's open-access page, kept as a link card.
  const metLink = await capture({ kind: 'link', title: 'Studies for the Libyan Sibyl, The Met' }, at(-6, '20:40'))
  await write(metLink, `
Studies for the Libyan Sibyl, The Met

\`\`\`cardlink
url: https://www.metmuseum.org/art/collection/search/337497
title: "Michelangelo, Studies for the Libyan Sibyl"
description: "Red chalk studies for a figure on the Sistine ceiling, about 1510 to 1511. Open Access: free to download and use."
host: www.metmuseum.org
image: ${sibylStudyPic}
\`\`\`

Hundreds of thousands of public-domain artworks are free to download from museums now: the Met, the National Gallery of Art, the Rijksmuseum. #renaissance
`)

  // The question the Vasari line raised, its clues gathered over two weeks.
  const perspectiveQ = await call<string>('question:new', 'Why did linear perspective arrive in Florence and not elsewhere?')
  renAges.push({ createdAt: at(-18, '22:30'), nuggetId: perspectiveQ })
  renAges.push({ glossAt: at(-17, '22:06'), id: await call<string>('clue', perspectiveQ, '', vasariBrunelleschi) }, { exitedAt: at(-17, '22:06'), captureId: vasariBrunelleschi })
  for (const [text, n] of [
    ['Brunelleschi and Donatello went to Rome and spent years measuring the ruins. He came back a surveyor as much as a goldsmith.', -16],
    ['Florence was rich from wool and banking, and its guilds paid for public art in competition with one another. New ideas had buyers.', -12],
    ['Alberti wrote On Painting in Latin in 1435, then put it into Italian and dedicated it to Brunelleschi: the method was written down in the city that tried it first.', -8]
  ] as const) renAges.push({ glossAt: at(n, '22:20'), id: await call<string>('clue', perspectiveQ, text) })
  nuggets++

  // A note for a seminar, and the task made from it.
  const brancacci = await capture({}, at(-5, '19:30'))
  await write(brancacci, `
Brancacci Chapel #renaissance

![The Tribute Money, by Masaccio](${tributePic})

*Masaccio, The Tribute Money, about 1425. Brancacci Chapel, Florence. Public domain, via Wikimedia Commons.*

For the seminar. What to look at:

- One story told three times in one picture: Christ tells Peter to pay, Peter finds the coin in a fish's mouth (left), Peter pays the tax collector (right).
- The light comes from the right, the side of the chapel's real window, so every shadow falls the way the room's would.
- The lines of the building on the right run to one point, at Christ's head.
`)
  await call('tasks:from', [brancacci], 'Read the Brancacci Chapel notes before the seminar')
  tasks++
  const seminarTask = (await call<{ id: string; title: string }[]>('tasks')).find((one) => one.title.startsWith('Read the Brancacci'))
  if (seminarTask) await call('task:save', seminarTask.id, { due: at(2, '10:00') })
  renAges.push({ exitedAt: at(-5, '19:35'), captureId: brancacci })

  // A reading goal, logged as it goes.
  const vasariGoal = await call<string>('goal:new', "Read Vasari's Lives of Leonardo and Michelangelo", day(40), day(-12), 'He knew Michelangelo, and he gossips like it.')
  renAges.push({ createdAt: at(-12, '21:00'), nuggetId: vasariGoal })
  for (const [text, n] of [
    ['Warmed up on the Life of Masaccio: short, and the Trinity is in it.', -11],
    ['Leonardo done. Vasari says he worked on the Mona Lisa for four years and left it unfinished.', -7],
    ['Into Michelangelo. The ceiling chapter alone is longer than most of the Lives.', -2]
  ] as const) renAges.push({ glossAt: at(n, '22:40'), id: await call<string>('gloss', vasariGoal, text) })
  nuggets++

  // The three articles, made first so each can link to the others.
  const florence = await call<string>('article:new')
  const notebooks = await call<string>('article:new')
  const ceiling = await call<string>('article:new')
  nuggets += 3
  await call('item:save', florence, {
    title: 'How Florence learned perspective',
    body: doc(`
Between about 1415 and 1435, a handful of people in one city worked out how to make a flat wall look like a room. This started as ${link(pierced, 'one line of Vasari I kept', 'nugget')} and turned into ${link(perspectiveQ, 'a question', 'question')}. Here is what I have so far.

## The mirror in the doorway

Around 1415, Filippo Brunelleschi stood in the doorway of Florence Cathedral and painted the Baptistery opposite on a small panel. He drilled a hole through it at the point where all the lines met. You looked through the hole from the back, at a mirror held up in front, and saw his painting; lower the mirror and the real building was there, lined up with it.

Vasari, a century later, says he found the method ${link(vasariBrunelleschi, 'by himself, after much time')}. Brunelleschi never wrote it down.

## A hole in the wall

![The Holy Trinity, by Masaccio|340](${trinityPic})

*Masaccio, The Holy Trinity, about 1426 to 1428. Santa Maria Novella, Florence. Public domain, via Wikimedia Commons.*

Masaccio's Trinity is the first large painting to use the method all the way through. Every line of the painted vault runs to one point, at about the eye height of a person standing in the church. Stand there, and the chapel goes back into the wall.

Under it, a painted skeleton lies on a tomb with the words *Io fu già quel che voi sete, e quel ch'i son voi anco sarete*: I was once what you are, and what I am you will be.

## Alberti writes it down

In 1435 Leon Battista Alberti put the method into a book, *De pictura*, On Painting. Its best-known line, in his Latin:

> Quod quidem mihi pro aperta fenestra est, ex qua historia contueatur.
>
> Alberti, De pictura, Book 1 (1435). My own rough translation: the frame I draw is, for me, an open window through which the story is seen.

![The Ideal City, Urbino](${idealCityPic})

*The Ideal City, unknown painter, 1480s. Galleria Nazionale delle Marche, Urbino. Public domain, via Wikimedia Commons.*

Fifty years on, painters could build a whole city on a panel with nobody in it, just to show they could.

## Who added what

| Who | When | What they added |
|---|---|---|
| Brunelleschi | about 1415 | The experiment: one eye, one point, a mirror to check it |
| Masaccio | 1426 to 1428 | The Trinity: a chapel painted on a flat wall |
| Alberti | 1435 | The book: a method anyone could follow |
| Piero della Francesca | 1470s | The maths written out in full, in On Perspective for Painting |

## Still open

${link(perspectiveQ, 'Why did linear perspective arrive in Florence and not elsewhere?', 'question')} Money, guilds and one stubborn goldsmith explain some of it. Leonardo, a generation later, took it as the first rule: ${link(gateway, 'perspective is the guide and the gateway', 'nugget')}. More on him in ${link(notebooks, 'Leonardo kept a commonplace book', 'article')}.

Before the seminar: ${link(brancacci, 'Brancacci Chapel')}, where Masaccio did the same with light. #renaissance
`)
  })
  await call('item:save', notebooks, {
    title: 'Leonardo kept a commonplace book',
    body: doc(`
${link(leonardo, "Leonardo's notebooks")} was where I first kept a few of his pages. This is the longer version: his notebooks were a commonplace book, and he said so himself.

## A collection without order

> And this is to be a collection without order, taken from many papers which I have copied here, hoping to arrange them later each in its place, according to the subjects of which they may treat.
>
> Leonardo da Vinci, begun at Florence, 22 March 1508. The Notebooks, §4, tr. Jean Paul Richter (1883)

In the same breath he says sorry for repeating himself, because ${link(memoryLine, 'memory cannot retain them all', 'nugget')}. Five hundred years on, that is still the reason to write things down.

![A page of the Codex Atlanticus, by Leonardo da Vinci](${atlanticusPic})

*Leonardo da Vinci, Codex Atlanticus, folio 26 verso, about 1480: machines for lifting water, the notes in mirror writing. Biblioteca Ambrosiana, Milan. Public domain, via Wikimedia Commons.*

## The little book at his belt

He told every painter to carry one:

> You must go about, and constantly, as you go, observe, note and consider the circumstances and behaviour of men in talking, quarrelling or laughing or fighting together ... And take a note of them with slight strokes thus, in a little book which you should always carry with you.
>
> Leonardo da Vinci, The Notebooks, §571, tr. Jean Paul Richter (1883)

## What I am taking from him

1. **Catch first, sort later.** He copied things in, hoping to arrange them "later each in its place". The Inbox is that later.
2. **Draw as well as write.** Many of his notes are drawings, and the drawing is the note.
3. **Come back to it.** ${link(sfumato, 'Sfumato', 'nugget')} took him years of returning to the same faces.
4. **Theory and practice together.** ${link(gateway, 'Perspective is the guide and the gateway', 'nugget')}, which he learnt from the Florentines: ${link(florence, 'How Florence learned perspective', 'article')}.

![Vitruvian Man, by Leonardo da Vinci|300](${vitruvianPic})

*Leonardo da Vinci, Vitruvian Man, about 1490. Gallerie dell'Accademia, Venice. Public domain, via Wikimedia Commons.*

The proportions are from Vitruvius, a Roman architect; the drawing, and the mirror writing above and below it, are Leonardo's.

Next: ${link(vasariGoal, "Read Vasari's Lives of Leonardo and Michelangelo", 'goal')}, and the ceiling read the same way: ${link(ceiling, "Michelangelo's Sistine ceiling", 'article')}. #renaissance
`)
  })
  await call('item:save', ceiling, {
    title: "Michelangelo's Sistine ceiling: a reading note",
    body: doc(`
Notes from Vasari's Life of Michelangelo, read with the ceiling open beside it. The most famous panel has a note of its own: ${link(adam19, 'The Creation of Adam')}.

## Four years on a scaffold

Pope Julius II asked for twelve apostles. Michelangelo talked him into the story of Genesis instead, and painted it from 1508 to 1512, standing on a scaffold of his own design and bending backwards, not lying down as the films have it.

When the Pope kept asking when it would be done, Vasari has him answer: ${link(vasariMichelangelo, '"It will be finished when I shall have satisfied myself in the matter of art."')}

## Drawing first

![Studies for the Libyan Sibyl, by Michelangelo](${sibylStudyPic})

*Michelangelo, Studies for the Libyan Sibyl, red chalk, about 1510 to 1511. The Metropolitan Museum of Art, 24.197.2. Open Access, CC0.*

He drew the Sibyl from a young man, again and again: the twist of the back, the shoulder, the left hand, the big toe. The sheet is in New York, and ${link(metLink, "the Met's page for it")} lets anyone download it.

## What to look for

| Where | What | Look for |
|---|---|---|
| The centre | Nine scenes from Genesis | Painted in reverse: he began with Noah, over the door |
| Along the sides | Seven prophets and five sibyls | The figures grow larger as he grows bolder |
| The four corners | Four rescues of Israel, David and Goliath among them | Bodies bent to fit curved, awkward spaces |
| Between the scenes | Twenty nude youths, the ignudi | Every pose a twist, no two alike |

The ignudi are ${link(contrapposto, 'contrapposto', 'nugget')} pushed as far as it goes: weight on one side, shoulders turned against the hips.

![The Delphic Sibyl, by Michelangelo](${delphicPic})

*Michelangelo, The Delphic Sibyl, about 1509. Sistine Chapel ceiling, Vatican. Public domain, via Wikimedia Commons.*

## Vasari's verdict

> This work, in truth, has been and still is the lamp of our art, and has bestowed such benefits and shed so much light on the art of painting, that it has served to illuminate a world that had lain in darkness for so many hundreds of years.
>
> Giorgio Vasari, Life of Michelagnolo Buonarroti, tr. Gaston du C. de Vere (1912)

High praise from a friend, and Vasari was one. Still, eighty years after ${link(florence, "Masaccio's hole in the wall", 'article')}, the whole ceiling seems to open onto the sky. #renaissance
`)
  })
  // The question, closed over its clues, points on to where it was written up.
  await call('item:save', perspectiveQ, { body: doc(`It began with ${link(pierced, 'a line of Vasari', 'nugget')}, and grew into ${link(florence, 'How Florence learned perspective', 'article')}. #renaissance`) })
  // A study task from the article, as ⌘K's "Study" makes one.
  await call('study', florence, 'Reread How Florence learned perspective before the seminar')
  tasks++

  // A postcard: this time last year, in front of the painting itself.
  const lastYearTrip = await capture({}, (() => {
    const when = new Date()
    when.setFullYear(when.getFullYear() - 1)
    when.setDate(when.getDate() - 2)
    when.setHours(16, 20, 0, 0)
    return when.toISOString()
  })())
  await write(lastYearTrip, `Florence, Santa Maria Novella. Stood in the nave where Masaccio meant you to stand, and the vault in the Trinity really does go back into the wall. Nobody else in the church was looking at it. #renaissance

Later: ${link(florence, 'How Florence learned perspective', 'article')}`)

  renAges.push(
    { createdAt: at(-19, '21:25'), nuggetId: pierced }, { exitedAt: at(-19, '21:25'), captureId: vasariMasaccio },
    { reviewedAt: at(-6, '08:05'), itemId: pierced, nth: 0 }, { dueAt: at(0, '00:00'), nuggetId: pierced },
    { createdAt: at(-15, '07:45'), nuggetId: gateway }, { exitedAt: at(-15, '07:45'), captureId: leonardoTheory },
    { createdAt: at(-13, '22:20'), nuggetId: memoryLine },
    { createdAt: at(-8, '22:50'), nuggetId: florence },
    { createdAt: at(-11, '21:30'), nuggetId: notebooks },
    { createdAt: at(-2, '22:10'), nuggetId: ceiling }
  )
  await call('sandbox:age', renAges)

  // --- the welcome's own examples, word for word, so whatever it shows can be found here ---
  // Its cards (welcome-box.ts starters), quick capture's typed examples (EXAMPLES) and the story Catch, Write and Remember follow (welcome-flow.tsx).
  const starter = (kind: string): string => starters().find((one) => one.kind === kind)!.text
  const bookLine = starters().find((one) => one.kind === 'quote')!
  const thought = await capture({}, at(-3, '08:12'))
  await write(thought, `${starter('note')}\n\nA plain thought, kept as written: most of what anyone catches is one of these.`)
  const yoda = await capture({ kind: 'quote', attribution: bookLine.who, medium: bookLine.where }, at(-6, '21:30'))
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
  // The welcome's story, the one it told (welcome-stories.ts): the thought caught on a walk, the page it became, and the task and the two gems picked out of it.
  const told = flowWords()
  // Whoever says the story's line lives in its book, so they are a character of it, never one of the People: the line
  // about them in your words, and a face where an edition drew one that is public domain. The creature is one already.
  const speakers: Partial<Record<typeof told.id, [string, string]>> = {
    sherlock: ['The detective Watson writes about. He looks at the same boot as everyone else, and reads a life in it.', holmesUrl],
    dracula: ['The Count who meets Jonathan Harker at his own front door, all manners. He is most frightening when he is being polite.', draculaUrl],
    pride: ['The Bennet sister who judges on sight, finds she was wrong, and says so.', bennetUrl],
    odyssey: ['Trying to get home from Troy. He wins by his wits: he tells the Cyclops his name is Nobody.', odysseusUrl]
  }
  const speaker = speakers[told.id]
  if (speaker && bookLine.who && bookLine.where) {
    await call('source:character', bookLine.who, bookLine.where, '')
    await call('source:bio', 'attribution', bookLine.who, speaker[0], '')
    if (speaker[1]) await call('people:set', bookLine.who, await picture(speaker[1]))
  }
  const story = await capture({}, at(-3, '09:13'))
  await write(story, `${told.caught}\n\nThought of on a walk.`)
  await essay(told.note, `${told.words.join(' ')} I should ${told.phrase}.`)
  // Named as the page names it, due on the day the page reads.
  const storyTask = flowTask()
  await call('task:save', await task(storyTask.title), { title: storyTask.title, due: storyTask.due, allDay: storyTask.allDay ? 1 : 0 })
  // Two gems, as the page made them: one kept as it is (no question, so it comes back now and then in the Feed), and the last sentence with its question for Review.
  await call<string>('nugget:from', told.kept, {})
  const storyGem = await call<string>('nugget:from', told.gem, {})
  await call('item:save', storyGem, { title: told.gem, prompt: told.question })
  nuggets += 2

  // The deck that teaches Haligtree itself, tagged with LEARN_TAG: a few new cards a day in Review.
  nuggets += await call<number>('learn:add')

  // --- three years of replying to yourself --------------------------------------------
  // A few gems kept long before this year, each with the thoughts added since:
  // agreeing, doubting, then a new view. The Feed shows them as threads, and
  // what has not come up in a year as "From the archives" or "A year ago today".
  /** A moment `years` back, in that year's `month` (1 to 12) and day; this year's are counted back in days instead. */
  const yearsBack = (years: number, month: number, date: number, time = '21:30'): string => {
    const [hours, minutes] = time.split(':').map(Number)
    return new Date(new Date().getFullYear() - years, month - 1, date, hours, minutes).toISOString()
  }
  const yearAgo = (time: string): string => {
    const when = new Date()
    when.setFullYear(when.getFullYear() - 1)
    const [hours, minutes] = time.split(':').map(Number)
    when.setHours(hours, minutes, 0, 0)
    return when.toISOString()
  }
  const keptBy = (start: string): string => kept.find((one) => one.line.startsWith(start))!.id
  const gemBy = (start: string): string => [...passedGem].find(([words]) => words.startsWith(start))![1]
  const threads: [string, string, [string, string][]][] = [
    [keptBy('Begin the morning'), yearsBack(2, 3, 11, '07:10'), [
      ['Tried it for a month. Some days it only made me expect the worst, and find it.', yearsBack(1, 2, 9, '07:20')],
      ['It is not about lowering the bar. He goes on to say none of them can harm me. That is the half I missed.', yearsBack(1, 11, 16, '21:10')],
      ['Now I read it as kindness, not armour: they do it because they know no better. Same line, different man reading it.', at(-40, '07:15')]
    ]],
    [gemBy('Two-minute rule'), yearsBack(1, 1, 14, '13:05'), [
      ['Cleared the sink every night for a fortnight. Small win, every night.', yearsBack(1, 1, 28, '21:40')],
      ['Doubting it. Forty two-minute jobs is a whole afternoon gone, and none of it the thing that mattered.', yearsBack(1, 9, 3, '18:20')],
      ['Where I have landed: two minutes for things, never for people. Letters and replies get their own hour.', at(-130, '20:45')]
    ]],
    [keptBy('This above all'), yearsBack(1, 3, 2, '21:05'), [
      ['Still good advice. Who says it matters less than whether it holds.', yearsBack(1, 7, 19, '22:00')],
      ["Changed my mind, a bit. 'Thine own self' assumes you know which self. Polonius never doubts it, and that is the joke.", at(-95, '21:30')]
    ]],
    [keptBy('There is nothing either good or bad'), yearsBack(1, 5, 11, '20:40'), [
      ['Less sure now. Some things are bad whatever I think of them. It works for traffic, not for grief.', at(-75, '22:10')]
    ]],
    [gemBy('Write the email'), yearsBack(1, 6, 6, '17:30'), [
      ['Sent the boiler email this way. A reply in ten minutes, after three weeks of nothing.', yearsBack(1, 6, 20, '19:00')],
      ['Still true. Added: say what happens if they do nothing.', at(-160, '12:40')]
    ]],
    [keptBy('I could easily forgive his pride'), yearsBack(1, 4, 13, '21:40'), [
      ['Read it again. It is less about Darcy than I thought: she is hurt, and calls it judgement.', at(-55, '21:20')]
    ]],
    [keptBy('It is a truth universally'), yearsBack(1, 8, 10, '21:10'), [
      ['Read it to Sam on the train. Nobody laughed at it in school, and we both laughed now.', yearsBack(1, 12, 27, '15:30')]
    ]],
    [keptBy('I declare after all'), yearsBack(1, 9, 21, '21:25'), [
      ['Caught myself doing exactly this, holding a book on the train and reading my phone. Austen got me too.', at(-110, '08:10')]
    ]],
    [keptBy('Beware; for I am fearless'), yearsBack(1, 12, 7, '22:20'), [
      ['Thought of it in the redundancy meeting. Nothing to lose is a kind of freedom, and a kind of danger.', at(-150, '19:30')]
    ]],
    [keptBy("There's a divinity"), yearsBack(1, 11, 2, '21:55'), [
      ['Heard it read at a funeral. It sounded less like giving up than it does on the page.', at(-20, '22:15')]
    ]],
    // A year ago today, and one thought on it since.
    [gemBy("Mum's lentil soup"), yearAgo('19:20'), [
      ['Made it for Sam on a cold night. She asked for the recipe twice, and I had it written down.', at(-200, '20:00')]
    ]]
  ]
  const threadAges: unknown[] = []
  for (const [id, made, said] of threads) {
    threadAges.push({ createdAt: made, nuggetId: id })
    // The words kept with it on the day: that same day, not the day the seed ran.
    for (const gloss of await call<{ id: string; createdAt: string }[]>('glosses', id)) if (gloss.createdAt > made) threadAges.push({ glossAt: made, id: gloss.id })
    for (const [text, when] of said) threadAges.push({ glossAt: when, id: await call<string>('gloss', id, text) })
  }
  // A page with a picture, from a trip two summers ago, not opened since: it comes back "From the archives".
  const urbino = await call<string>('article:new')
  await call('item:save', urbino, {
    title: 'Urbino in the rain',
    body: doc(`
![The Ideal City, a painted panel in Urbino](${await picture(idealCityUrl)})

A whole town painted with nobody in it. I stood in front of it for twenty minutes while it rained outside, and it was the calmest room I have been in.
`)
  })
  nuggets++
  threadAges.push({ createdAt: yearsBack(2, 6, 18, '16:40'), nuggetId: urbino })

  // A page whose lists are a board: each heading a column, each line a card to carry across.
  const shelf = await essay('Reading this winter', `
## To read

- The Epic of Gilgamesh, the Andrew George translation
- Middlemarch, because everyone says the second half is worth it
- The Left Hand of Darkness

## Reading

- Dune, Book Three, before film night
- The Odyssey, Book 10: Circe

## Finished

- The Picture of Dorian Gray
- Pride and Prejudice
- Frankenstein
`)
  await call('notes:fields:set', 'nuggets', shelf, 'kanban-plugin', 'board')
  // Begun a month ago, so it sits under the newer pages.
  threadAges.push({ createdAt: at(-34, '21:00'), nuggetId: shelf })

  // Folders in Writing and Gems, as the sidebar shows them: an icon each, one three deep, one still empty.
  const folder = async (list: string, name: string, icon: string, ids: string[], parent: string | null = null): Promise<string> => {
    const id = await call<string>('groups:make', list, name, parent)
    await call('groups:set', id, { icon })
    if (ids.length) await call('groups:place', ids.map((one) => ({ id: one, group: id })))
    return id
  }
  await folder('article', 'Films and books', '🎬', [matrix, timeGiven, hermione, shelf])
  const history = await folder('article', 'History', '🏛️', [rosetta, article])
  const renaissanceFolder = await folder('article', 'Renaissance', '🎨', [florence, ceiling], history)
  await folder('article', 'Leonardo', '📐', [notebooks], renaissanceFolder)
  await folder('article', 'Trips to write up', '🧳', [])
  await folder('nugget', 'Space', '🔭', [schwarzschild, lagrange])
  await folder('nugget', 'Lines from books', '📖', [wilde, gandalf, aurelius])
  await folder('nugget', 'Words worth knowing', '🌧️', [petrichor])

  // Two words looked up and not answered yet: Lookups holds them until their meaning is in.
  for (const [text, n] of [['Sonder', -3], ['Hiraeth', -12]] as const) await write(await capture({ kind: 'word' }, at(n, '22:10')), text)

  // The Odyssey goal chosen for the top of Home; an old ambition paused, on ice, not given up.
  await call('review:star', homer, true)
  const akkadianGoal = await call<string>('goal:new', 'Read Gilgamesh in the Akkadian', day(120), day(-60), 'To read the oldest story in the words it was pressed into.')
  await call('gloss', akkadianGoal, 'Too much at once with the Odyssey going. Back to it in the spring.')
  await call('goal:close', akkadianGoal, 'on ice')
  nuggets++
  await call('sandbox:age', threadAges)

  // --- a gallery: paintings kept for their own sake ----------------------------------------
  // Five portraits kept as gems over the year, each with the one fact worth remembering.
  const portraits = [
    [ermineUrl, 'Lady with an Ermine', 'Cecilia Gallerani, about sixteen. The ermine was a pun on her name in Greek, galê.', 'Leonardo da Vinci, about 1490', 170],
    [ginevraUrl, "Ginevra de' Benci", 'Leonardo was about 22. The juniper behind her, ginepro, is another pun on a name.', 'Leonardo da Vinci, about 1475', 150],
    [simonettaUrl, 'Portrait of a Young Woman', 'Painted as a nymph, not as a sitter: no one is quite sure who she was.', 'Sandro Botticelli, about 1480', 132],
    [unicornUrl, 'Young Woman with a Unicorn', 'X-rays found a small dog under the unicorn, and under that, nothing at all.', 'Raphael, about 1506', 95],
    [copernicusUrl, 'Astronomer Copernicus, or Conversations with God', 'Painted 330 years after he put the Sun in the middle, on the roof at Frombork.', 'Jan Matejko, 1873', 48]
  ] as const
  const portraitAges: unknown[] = []
  for (const [url, name, line, by, back] of portraits) {
    const gem = await call<string>('nugget:from', `${name}\n\n![${name}, ${by}](${await picture(url)})\n\n${line}`, {})
    portraitAges.push({ createdAt: at(-back, '21:40'), nuggetId: gem })
    nuggets++
  }
  await call('sandbox:age', portraitAges)

  // Others dropped straight into Files, with no note yet: a file kept for later, the way a print is pinned above a desk.
  const gallery = [
    [babelUrl, 'Pieter Bruegel the Elder, The Tower of Babel, 1563.webp'],
    [prideProtestedUrl, 'Hugh Thomson, Pride and Prejudice, Mr Collins protests he never reads novels, 1894.webp'],
    [prideDancingUrl, 'Hugh Thomson, Pride and Prejudice, superior dancing, 1894.webp'],
    [pompeiiUrl, 'Karl Bryullov, The Last Day of Pompeii, 1833.webp'],
    [medusaUrl, 'Théodore Géricault, The Raft of the Medusa, 1819.webp'],
    [homerPicUrl, 'Jean-Auguste-Dominique Ingres, The Apotheosis of Homer, 1827.webp'],
    [ahasuerusUrl, 'Adolf Hirémy-Hirschl, Ahasuerus at the End of the World, 1888.webp'],
    [daphneUrl, 'Francesco Albani, Apollo and Daphne, about 1615.webp'],
    [peterUrl, 'Caravaggio, The Denial of Saint Peter, 1610.webp'],
    [catherineUrl, 'Raphael, Saint Catherine of Alexandria, about 1507.webp'],
    [bocklinUrl, 'Arnold Böcklin, Self-Portrait with Death Playing the Fiddle, 1872.webp']
  ] as const
  await call('media:add', await Promise.all(gallery.map(async ([url, name]) => ({ name, bytes: new Uint8Array(await (await fetch(url)).arrayBuffer()) }))))

  // A picture taken back out of a note: it waits in Files under "Unlinked" until it is kept or thrown away.
  // Files is read once first, so everything above counts as kept; the picture is seen in the note, then let go.
  await call('media:list')
  const opheliaPic = await picture(opheliaUrl)
  const ophelia = await capture({ kind: 'quote', attribution: 'William Shakespeare', medium: 'Hamlet, Act 4, Scene 7' }, at(-18, '21:15'))
  await write(ophelia, `There is a willow grows aslant a brook, / That shows his hoar leaves in the glassy stream.\n\n![Ophelia, Alexandre Cabanel, 1883](${opheliaPic})`)
  await call('media:list')
  await write(ophelia, 'There is a willow grows aslant a brook, / That shows his hoar leaves in the glassy stream.\n\nI pasted Cabanel\'s *Ophelia* here, then took it out again. A picture no note holds any more is not lost: it waits in Files under “Unlinked”.\n\nTry it: open Files, choose “Unlinked”, and keep it or move it to the Bin.')
  await call('media:list')

  // --- four more decks, the kind a curious person keeps: Greek myth, painters,
  // Dune and Middle-earth, and physics said in a sentence. Each mixes plain
  // questions, fill-in-the-blanks short enough to type, and cards with the
  // painting on the back. Begun over the last six weeks and reviewed as Review
  // asks, so some wait today, some later, and the newest are not met yet.
  // Dune and The Lord of the Rings get facts in my own words, never a line of theirs.
  const laterAges: unknown[] = []
  const DECK_GAPS = [1, 3, 8, 18, 40]
  let deckGraded = 0
  const cardId: Record<string, string> = {}
  /**
   * A card: `prompt` asked, `answer` on the back; a prompt with _____ is a fill-in-the-blank.
   * Made `made` days ago; `reviewed` ones were met each time a gap from then ended (a day,
   * three, eight, eighteen, forty), so one made 8, 18 or 40 days ago waits today. `missed`
   * ones were forgotten along the way and wait today too.
   */
  const deckCard = async (tag: string, prompt: string, answer: string, made: number, reviewed: number, missed = false): Promise<void> => {
    const id = await call<string>('nugget:from', `${answer}\n\n#${tag}`, {})
    cardId[prompt] = id
    await call('item:save', id, { title: prompt, prompt })
    nuggets++
    laterAges.push({ createdAt: at(-made, '21:00'), nuggetId: id })
    const gaps = reviewed ? DECK_GAPS.filter((gap) => gap < made) : []
    for (const [nth, gap] of gaps.entries()) {
      const grade = missed && nth > 0 ? (nth === gaps.length - 1 ? 2 : 1) : deckGraded++ % 6 === 5 ? 4 : deckGraded % 9 === 0 ? 2 : 3
      await call('review:grade', id, grade, 7000)
      laterAges.push({ reviewedAt: at(gap - made, `0${7 + (nth % 2)}:${String(15 + ((deckGraded * 11) % 40)).padStart(2, '0')}`), itemId: id, nth })
    }
    const next = (DECK_GAPS[gaps.length] ?? 80) - made
    if (gaps.length) laterAges.push({ dueAt: missed || next <= 0 ? at(0, '00:00') : at(next, '08:00'), nuggetId: id })
  }
  const pic = (path: string, what: string): string => `![${what}|360](${path})`
  type Deck = [string, string, number, number, boolean?][]
  const myth: Deck = [
    ['Who stole fire from the gods, and what did it cost him?', 'Prometheus. Zeus chained him to a rock, where an eagle ate his liver every day and it grew back every night.', 45, 1],
    ['The nine Muses were daughters of Zeus and _____, the goddess of memory.', 'The nine Muses were daughters of Zeus and Mnemosyne, the goddess of memory.', 40, 4],
    ["Why did Odysseus tell the Cyclops his name was 'Nobody'?", 'So when Polyphemus shouted that Nobody was hurting him, the other Cyclopes thought he was fine and went back to bed.', 33, 3],
    ["A clay plaque from Melos, about 450 BC, shows Odysseus home at last. Who knows him first, in his beggar's disguise?", `${pic(plaque, 'Terracotta plaque with Odysseus, Melos, about 450 BC')}\n\nArgos, his old dog, who wags his tail and dies. Then Eurycleia, his nurse, by the scar on his leg as she washes his feet.`, 30, 3],
    ['_____ wove a shroud by day and unpicked it by night, to keep the suitors waiting.', 'Penelope wove a shroud by day and unpicked it by night, to keep the suitors waiting.', 26, 3, true],
    ["What was left in Pandora's jar when she shut the lid?", 'Hope. Everything else had already flown out into the world.', 22, 2],
    ['Who were the three Fates, and what did each do?', 'Clotho spun the thread of a life, Lachesis measured it, and Atropos cut it.', 18, 1],
    ['Orpheus lost Eurydice for good because he _____ before they reached the daylight.', 'Orpheus lost Eurydice for good because he looked back before they reached the daylight.', 12, 2],
    ['What was the Labyrinth built for, and who got out of it?', "To hold the Minotaur under King Minos's palace on Crete. Theseus killed it and found his way out by Ariadne's thread.", 8, 1],
    ['The river of forgetting in the underworld is the _____.', 'The river of forgetting in the underworld is the Lethe.', 4, 0],
    ['Why did Icarus fall?', 'He flew too near the sun and the wax in his wings melted. His father Daedalus had told him to fly the middle way.', 2, 0],
    ['What did Sisyphus do to earn his boulder?', 'He cheated death, twice. His sentence: push a boulder up a hill for ever, and watch it roll back down.', 1, 0]
  ]
  const painters: Deck = [
    ["Leonardo's Mona Lisa: what is sfumato, and where do you see it?", `${pic(mona, 'Mona Lisa, Leonardo da Vinci')}\n\nSoft blending with no hard outlines, like smoke. The corners of her mouth and eyes sit in shadow, so her look never settles.`, 44, 4],
    ['In The Creation of Adam, what happens in the gap between the two hands?', `${pic(adam, 'The Creation of Adam, Michelangelo')}\n\nNothing, yet. Their fingers do not touch: Adam's hand hangs limp, God's reaches. The spark is about to cross.`, 40, 4],
    ["Who stands at the centre of Botticelli's Primavera?", `${pic(primavera, 'Primavera, Sandro Botticelli')}\n\nVenus, in her orange grove, with Cupid above her aiming an arrow. Painted about 1480, for a Medici house in Florence.`, 34, 3],
    ["Masaccio's Trinity, about 1427: why did people stop and stare?", `${pic(trinityPic, 'The Holy Trinity, Masaccio')}\n\nOne of the first paintings built on linear perspective. The painted vault looks like a real chapel cut into the wall of Santa Maria Novella.`, 31, 3],
    ['The Last Supper: which moment does Leonardo paint?', `${pic(supper, 'The Last Supper, Leonardo da Vinci')}\n\nJust after Jesus says one of them will betray him: each apostle reacts at once. Painted on a dry wall, it began to flake in Leonardo's own lifetime.`, 27, 3, true],
    ["Masaccio's Tribute Money tells one story three times in one picture. What are the three moments?", `${pic(tributePic, 'The Tribute Money, Masaccio')}\n\nThe tax collector asks; Peter finds the coin in a fish's mouth (left); Peter pays (right).`, 23, 2],
    ['Who painted the Delphic Sibyl, and where?', `${pic(delphicPic, 'The Delphic Sibyl, Michelangelo')}\n\nMichelangelo, on the Sistine Chapel ceiling, 1508 to 1512. A prophetess of Apollo, among the prophets of the Old Testament.`, 20, 2],
    ['What is the Vitruvian Man measuring?', `${pic(vitruvianPic, 'Vitruvian Man, Leonardo da Vinci')}\n\nThe proportions the Roman architect Vitruvius gave for a man: arms spread as wide as he is tall, so he fits a circle and a square. About 1490.`, 13, 2],
    ["Raphael painted _____ for the Pope's library, with Plato and Aristotle at its centre.", "Raphael painted The School of Athens for the Pope's library, with Plato and Aristotle at its centre.", 10, 1],
    ['Michelangelo carved his _____ from a block of marble other sculptors had given up on.', 'Michelangelo carved his David from a block of marble other sculptors had given up on.', 5, 0],
    ['Who wrote the Lives of the Painters, and why not trust every word?', 'Giorgio Vasari, in 1550 and again in 1568. A painter himself and a friend of Michelangelo: he tells a good story and takes sides.', 3, 0],
    ["Leonardo's Annunciation: how old was he when he painted it?", `${pic(annunciation, 'The Annunciation, Leonardo da Vinci')}\n\nAbout twenty, still in Verrocchio's workshop in Florence. Look at the angel's wings: drawn from a real bird's.`, 1, 0]
  ]
  const lore: Deck = [
    ['What is the spice in Dune, and why does everyone want it?', 'Melange, found only on Arrakis. It lengthens life, and the Guild navigators need it to steer ships between the stars. Whoever holds Arrakis holds the trade of the universe.', 38, 4],
    ['Who are the Fremen?', 'The desert people of Arrakis. They save every drop of water, ride the sandworms, and have waited generations for someone to lead them.', 35, 3],
    ["A Fremen stillsuit recycles the body's own _____.", "A Fremen stillsuit recycles the body's own water.", 29, 3],
    ["What is the Bene Gesserit's long plan?", 'To breed a man who can see past and future at once, the Kwisatz Haderach. Paul arrives a generation early, and not on their terms.', 24, 2, true],
    ['Why are there no computers in Dune?', 'The Butlerian Jihad, thousands of years before the story, banned any machine made in the likeness of a human mind. People trained as Mentats do the sums instead.', 18, 2],
    ['How many Rings of Power were there, and who got them?', 'Three for the Elves, seven for the Dwarves, nine for Men, and the One that Sauron made to rule them all.', 14, 2],
    ['Why will Gandalf not take the Ring, even to do good?', 'Because he would use it to do good, and it would make him into what he fights. Its pull works through pity and strength, not greed.', 8, 1],
    ["Bilbo's sword, which Frodo carries and which glows when orcs are near, is called _____.", "Bilbo's sword, which Frodo carries and which glows when orcs are near, is called Sting.", 5, 0],
    ['Who were the Istari?', 'Five wizards sent to Middle-earth in the Third Age, in the shape of old men, to help against Sauron and never to rule. Gandalf and Saruman are two.', 2, 0],
    ['What became of the Entwives?', 'They went off to tend gardens in the lands of Men and were lost. The Ents never found them.', 1, 0]
  ]
  // --- the owner's maths: formulas and graphs you can play with, from their own interests ----
  // Kepler for the #astrophysics exam, Masaccio's floor for the Renaissance notes, and the Pale Blue Dot's dimness.
  const keplerDrawn = await essay('Kepler, drawn: why orbits are ellipses', `
For the #astrophysics exam. Kepler's first law says every planet moves on an ellipse with the Sun at one focus, not in the middle. Drag $c$, how stretched the orbit is (its eccentricity), and watch the Sun (the small orange circle) slide off centre as the orbit stretches.

\`\`\`graph
x^2/25 + y^2/(25*(1 - c^2)) = 1 {blue}
(x - 5*c)^2 + y^2 = 0.09 {orange}
c = 0.7 (0 to 0.95)
view: -8, 8, -5, 5
\`\`\`
*Earth's orbit is $e \\approx 0.017$: almost a circle. Halley's comet is $e \\approx 0.967$.*

His third law ties the year to the size of the orbit: $T^2 = a^3$, with $T$ in years and $a$ in astronomical units. Mars sits at $a \\approx 1.52$, so its year is $1.52^{3/2} \\approx 1.88$ Earth years.

\`\`\`graph
y = x^(3/2) {red}
y = x {green}
view: 0, 12, 0, 12
\`\`\`
*Red: a planet's year against its distance. Green: what it would be if the two grew together. The gap is why Saturn takes 29 years.*

From ${link(schwarzschild, 'What is a Schwarzschild radius?', 'nugget')} to this: gravity again, $F = \\frac{G M m}{r^2}$. #astrophysics
`)
  const vanishing = await essay("Masaccio's floor: one point where every line meets", `
In ${link(florence, 'How Florence learned perspective', 'article')}, Brunelleschi's rule is simple: lines that run straight away from you all meet at one point on the horizon. Move $h$ and the whole floor swings to follow it, the way the vault in the Trinity bends toward the viewer's eye.

\`\`\`graph
y = 3 {brown}
y = 3 + 0.5*(x - h) {blue}
y = 3 + 1*(x - h) {blue}
y = 3 + 2.5*(x - h) {blue}
y = 3 - 0.5*(x - h) {blue}
y = 3 - 1*(x - h) {blue}
y = 3 - 2.5*(x - h) {blue}
h = 0 (-6 to 6)
view: -10, 10, -6, 6
\`\`\`
*Brown is the horizon at the painted eye level. Every blue line passes through $(h, 3)$, the vanishing point.*

Alberti wrote it down in 1435: the size of a thing falls as $\\frac{1}{d}$, its distance from the eye. #renaissance
`)
  const dimming = await essay('Why the Pale Blue Dot is so faint', `
Light spreads over a sphere as it travels, so its brightness falls with the square of the distance: $b = \\frac{1}{d^2}$. Twice as far, a quarter as bright. Voyager 1 took ${link(blueDot, 'the Pale Blue Dot')} from about 40 times the Earth's distance from the Sun, so sunlight there is about $\\frac{1}{1600}$ as strong.

\`\`\`graph
y = 1/x^2 {blue}
y = 1/x {purple}
y = k/x^2 {orange}
k = 4 (1 to 16)
view: 0, 6, 0, 4
\`\`\`
*Blue: brightness with distance. Purple: what it would be if light only spread in a line. Orange: a brighter star, $k$ times the Sun; slide $k$ to see how far away it can be and still look the same.*
`)
  laterAges.push({ createdAt: at(-4, '21:40'), nuggetId: keplerDrawn }, { createdAt: at(-9, '20:10'), nuggetId: vanishing }, { createdAt: at(-2, '22:05'), nuggetId: dimming })

  const physics: Deck = [
    ['Why is the sky blue?', 'Air scatters short blue light far more than long red light, so blue reaches you from every part of the sky.', 42, 4],
    ['If space is full of stars, why is the night sky dark?', 'The universe has an age: light from the farthest stars has not reached us yet, and the stretching of space reddens what has.', 39, 4],
    ['Mass and energy are the same thing: E = _____.', 'Mass and energy are the same thing: E = mc².', 32, 3],
    ['What does entropy say, in one sentence?', 'Left alone, things go from order to disorder, never back: it is why time has a direction.', 28, 3, true],
    ['Why do astronauts float on the space station?', 'They are falling round the Earth all the time. Gravity up there is still about nine tenths of what it is on the ground.', 25, 2],
    ["What does Heisenberg's uncertainty principle say?", 'The more exactly you know where a particle is, the less exactly you can know how it is moving, and the other way round.', 21, 2],
    ['Light from the Sun takes about _____ minutes to reach us.', 'Light from the Sun takes about 8 minutes to reach us.', 18, 1],
    ['Why does a spinning skater speed up when she pulls her arms in?', 'Angular momentum is kept: the same spin in a smaller circle has to go round faster.', 11, 1],
    ['What is the Pale Blue Dot?', `${pic(dot, 'Pale Blue Dot, Voyager 1, 1990')}\n\nVoyager 1 turned round in 1990, about six billion kilometres out, and photographed the Earth: less than a pixel, in a band of scattered sunlight. Sagan asked for the picture.`, 7, 1],
    ["What is Newton's third law, in a sentence?", 'Every push gets an equal push back: a rocket throws gas down, the gas throws the rocket up.', 4, 0],
    ['Why does the Moon always show us the same face?', "Tidal locking: Earth's pull slowed its spin until one turn takes exactly one orbit.", 2, 0],
    ['Why can nothing go faster than light?', 'The faster a thing goes, the more energy each bit more speed costs; at the speed of light it would cost an endless amount.', 1, 0]
  ]
  for (const [tag, cards, color] of [['greek-myth', myth, 'blue'], ['painters', painters, 'orange'], ['other-worlds', lore, 'yellow'], ['physics', physics, 'green']] as const) {
    // Leonardo's cards sit in a deck of their own inside Painters, as Anki's Parent::Child decks come in.
    for (const [prompt, answer, made, reviews, missed] of cards) await deckCard(tag === 'painters' && /Leonardo|Vitruvian|Last Supper|Mona Lisa/.test(prompt + answer) ? 'painters-leonardo' : tag, prompt, answer, made, reviews, missed)
    await call('tag:set', tag, { color })
  }
  await call('tag:set', 'painters-leonardo', { deck: true, color: 'orange' })

  // --- a line of Wilde's kept on his page (made above, with the others) -------------------
  const wildePreface = await capture({ kind: 'quote', attribution: 'Oscar Wilde', medium: 'The Picture of Dorian Gray, the preface (1891)' }, at(-16, '22:40'))
  await write(wildePreface, 'There is no such thing as a moral or an immoral book. Books are well written, or badly written. That is all.')
  const wellWritten = await call<string>('promote', wildePreface, 'Then he wrote a novel where a man pays for every sin. The preface is a dare, not a creed.')
  nuggets++
  laterAges.push({ createdAt: at(-16, '22:41'), nuggetId: wellWritten }, { exitedAt: at(-16, '22:41'), captureId: wildePreface })

  // --- a question answered in a week: Greek myth meets Frankenstein ---------------------
  const prometheusQ = await call<string>('question:new', 'Why is Frankenstein subtitled The Modern Prometheus?')
  for (const [text, n] of [
    ['Prometheus stole fire and gave it to people. Victor steals the spark of life.', 13],
    ['In some tellings Prometheus also shaped the first people out of clay. Victor makes a man from what he finds.', 10],
    ['Both are punished for ever after: the rock and the eagle, the creature following Victor across the ice.', 7]
  ] as const) laterAges.push({ glossAt: at(-n, '22:15'), id: await call<string>('clue', prometheusQ, text) })
  await call('item:save', prometheusQ, { body: doc(`From ${link(bookId['Frankenstein'], 'Frankenstein')}, and the ${link(cardId[myth[0][0]], 'Prometheus card', 'nugget')} in my Greek myth deck.`) })
  const prometheusAnswer = await call<{ article: string | null }>('question:close', prometheusQ, 'answered')
  laterAges.push({ createdAt: at(-14, '21:30'), nuggetId: prometheusQ }, { closedAt: at(-6, '22:00'), nuggetId: prometheusQ })
  if (prometheusAnswer?.article) laterAges.push({ createdAt: at(-6, '22:00'), nuggetId: prometheusAnswer.article })
  nuggets++

  // --- a page read closely: highlights, footnotes, citations, and the people it
  // names, whose kept lines gather in its margin. It links to the book, the
  // question and Wilde's line, and they link back.
  /** Each ⟦key⟧ in the words made a citation chip of that work. */
  const cited = (node: JSONContent, cites: Record<string, Record<string, string>>): JSONContent => node.content
    ? { ...node, content: node.content.flatMap((child) => child.type === 'text' && child.text?.includes('⟦')
      ? child.text.split(/(⟦\w+⟧)/).filter(Boolean).map((part) => {
        const key = /^⟦(\w+)⟧$/.exec(part)?.[1]
        return key && cites[key] ? { type: 'citation', attrs: cites[key] } : { ...child, text: part }
      })
      : [cited(child, cites)]) }
    : node
  const person = (name: string): string => `[[@person:${name}|${name}]]`
  const character = (name: string): string => `[[@character:${name}|${name}]]`
  const frankensteinPlate = await picture(frankensteinPlateUrl)
  const creatureReads = await call<string>('article:new')
  await call('item:save', creatureReads, {
    title: "The creature's three books",
    body: cited(doc(`
A page read closely: highlights, footnotes and citations, and in its margin, the lines you kept from the people it names.

**Try it:** select a few words and press ⌘⇧H to highlight them, or type “/” and choose “Cite a source”.

![Theodor von Holst, the frontispiece to the 1831 Frankenstein: Victor runs from what he made](${frankensteinPlate})

Hiding beside the cottage, the creature finds a satchel with three books in it: Paradise Lost, Plutarch's Lives and The Sorrows of Young Werther ⟦shelley⟧. ==He learns what a person is from them before any person has been kind to him.==[^1]

${person('Mary Shelley')} gives him Milton, so he reads himself as Adam, then as Satan. The subtitle reaches further back, to Prometheus, who steals fire for people and pays for it ⟦hesiod⟧. I worked that out in ${link(prometheusQ, 'Why is Frankenstein subtitled The Modern Prometheus?', 'question')}.

==A made thing with a library and no friends.== The saddest idea in the book, and nobody in it says so.[^2]

${person('Oscar Wilde')} would say a book is only well or badly written: ${link(wellWritten, 'Books are well written, or badly written', 'nugget')}. ${character("The creature")} is the case against him: three books made him who he is.

From ${link(bookId['Frankenstein'], 'Frankenstein')}.

[^1]: Chapter 15 in the 1831 text. Werther teaches him grief, Plutarch virtue, and Milton that he has no Eve.
[^2]: To bring up at the book club.
`), {
      shelley: { work: 'Frankenstein', authors: 'Mary Shelley', year: '1831', publisher: 'Henry Colburn and Richard Bentley' },
      hesiod: { work: 'Theogony', authors: 'Hesiod', year: '1914', publisher: 'Loeb Classical Library, tr. Hugh G. Evelyn-White' }
    })
  })
  laterAges.push({ createdAt: at(-5, '21:45'), nuggetId: creatureReads })
  nuggets++

  // --- a reading goal tied to the books on the shelf, logged as each is finished ------
  const booksGoal = await call<string>('goal:new', 'Read twelve books this year', day(52), day(-310), 'One a month, and write a page on each.')
  for (const [text, n] of [
    ['1: Meditations. Grandad\'s copy, pencil marks and all.', 272],
    ['2: Pride and Prejudice, for the book club.', 236],
    ['3: Frankenstein. The best of the year so far.', 180],
    ['4: Hamlet, after the play in the park.', 126],
    ['5: The Picture of Dorian Gray. Read the preface last, which was right.', 30],
    ['Dune next, before film night. Seven to go and two months left: shorter books from here.', 2]
  ] as const) laterAges.push({ glossAt: at(-n, '21:50'), id: await call<string>('gloss', booksGoal, text) })
  laterAges.push({ createdAt: at(-310, '10:00'), nuggetId: booksGoal })
  nuggets++

  // --- the calendar: a lecture, a museum and a book club behind, more of each ahead --------
  const event = async (n: number, from: string, to: string, title: string, place: string, calendarId: string, notes = ''): Promise<string> =>
    (await call<{ key: string }>('event:add', { title, start: at(n, from), end: at(n, to), place, calendarId, notes })).key
  await event(-10, '18:30', '20:00', 'Lecture: why the Bronze Age ended', 'Senate House, room 104', 'uni', 'Bring the Bronze Age question.')
  await event(-6, '11:00', '13:00', 'Museum: Renaissance drawings', 'The British Museum, room 90', 'personal', 'Red chalk studies. Look for the Michelangelo.')
  await event(-3, '19:00', '21:30', 'Book club: The Picture of Dorian Gray', "Sam's flat", 'personal')
  const club = await event(4, '19:00', '21:00', 'Book club: Frankenstein', 'The Lamb, upstairs room', 'personal', 'My turn to start. Three questions, ten minutes.')
  await event(6, '18:30', '19:30', 'Public lecture: why the night sky is dark', 'The Royal Institution', 'uni')
  await event(9, '10:30', '13:00', 'National Gallery: Botticelli and the Medici', 'Trafalgar Square, Sainsbury Wing', 'personal', 'Before lunch, while it is quiet.')
  await event(11, '19:30', '21:00', 'Odyssey reading group: Book 10, Circe', 'The library, first floor', 'personal')
  await event(13, '14:00', '15:30', 'Seminar: Masaccio and the Brancacci Chapel', 'History of Art, room 2.14', 'uni')
  // The book club's own note, linked to the evening both ways.
  const clubNote = await capture({}, at(-2, '21:20'))
  await write(clubNote, `
Frankenstein book club: my three questions

1. Who is the monster? I have an answer, and I want to hear theirs first.
2. Why does the creature read before he speaks to anyone?
3. Would it be a different book if Victor had stayed in the room?

My notes for it: ${link(creatureReads, "The creature's three books", 'article')}.
`)
  await call('event:note:link', club, clubNote)

  // --- tasks with steps, for the evenings ahead -----------------------------------------
  const stepped = async (text: string, due: string, steps: [string, boolean][]): Promise<void> => {
    const id = await task(text)
    await call('task:save', id, { due, subtasks: steps.map(([words, done]) => ({ text: words, done })) })
  }
  await stepped('Get ready for the Frankenstein book club', at(4, '18:00'), [['Reread chapters 11 to 16', true], ['Write three questions', true], ['Find the 1818 and 1831 differences', false], ['Bring the Penguin with the tabs', false]])
  await stepped('Plan the National Gallery visit', at(8, '20:00'), [['Check the Botticelli room is open', false], ['Pick five paintings to sit with', false], ['Pack the small sketchbook', false]])
  await stepped('Make the physics deck to twenty cards', at(10, '21:00'), [['Entropy, again, in fewer words', false], ['A card on why ice floats', false], ['One on black holes for the exam', false]])

  // --- the journal, most days of the last six weeks: morning pages, what I read, one thing I am glad of
  for (const [n, words] of [
    [-2, `Morning pages before the alarm. Three pages of nothing, and one idea on the third, which is the usual rate.\n\n**Read:** Frankenstein, chapter 15 again, for the club. Wrote it up as ${link(creatureReads, "The creature's three books", 'article')}. ${person('Mary Shelley')} was eighteen.\n\n**Glad of:** the bakery opening early.`],
    [-3, "Book club at Sam's, on Dorian Gray. Everyone hated Lord Henry and quoted him all night.\n\n**Glad of:** people who argue kindly."],
    [-4, `**Read:** ${person('Giorgio Vasari')} on Michelangelo, the ceiling chapter.\n\nReview before coffee: the Penelope card again. I keep typing Helen.\n\n**Glad of:** a seat on the bus both ways.`],
    [-6, `The drawings room at the museum. Red chalk is smaller than you expect, and better than any print.\n\nOn the bus home the Prometheus question came together: ${link(prometheusQ, 'Why is Frankenstein subtitled The Modern Prometheus?', 'question')}.`],
    [-8, 'Morning pages, rain. Learnt the Fates at last: Clotho spins, Lachesis measures, Atropos cuts.\n\n**Glad of:** dry socks.'],
    [-10, `Lecture on the Bronze Age collapse. One line worth keeping: no single cause, everything at once. It went straight into ${link(bronze, 'Why did the Bronze Age collapse around 1177 BC?', 'question')}.\n\n**Glad of:** the lecturer who stayed to answer.`],
    [-16, `Began a physics deck: things I can say in one sentence, or cannot yet. The blue sky took four tries.\n\n**Read:** the preface to Dorian Gray. ${person('Oscar Wilde')} picking fights in the first page.`],
    [-22, '**Morning pages:** a full week ahead. One thing at a time.\n\n**Glad of:** an hour on the phone with Mum, about nothing.'],
    [-38, 'Started a lore deck for Dune and Middle-earth, in my own words, so I stop looking things up mid-chapter.'],
    [-41, 'Began a Greek myth deck, after the Odyssey kept naming people I could not place. Prometheus first, then the Muses.']
  ] as const) await call('notes:day:save', day(n), { body: doc(words), reviewed: true })
  const weekBack = (weeks: number): string => {
    const when = new Date(`${monday()}T12:00:00`)
    when.setDate(when.getDate() - 7 * weeks)
    return `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`
  }
  await call('period:save', `week:${weekBack(1)}`, {
    fields: { theme: 'Myths and monsters', summary: 'Frankenstein for the club, the Prometheus question answered, the drawings room.', projects: 'Book club, the Greek myth deck', people: 'Sam, Mary Shelley' },
    body: doc(`Closed ${link(prometheusQ, 'the Prometheus question', 'question')} and wrote ${link(creatureReads, "The creature's three books", 'article')}.`)
  })
  await call('period:save', `week:${weekBack(2)}`, {
    fields: { theme: 'Say it in a sentence', summary: 'Physics deck begun; Dorian Gray finished.', projects: 'Physics cards, twelve books', people: 'Oscar Wilde' }
  })
  await call('sandbox:age', laterAges)

  // Every work the notes are from, as a page whole from the start, as the people are: what kind it is, its year and who
  // wrote it (each checked in two places; a year that cannot be given as one, Hamlet's or the Odyssey's, is left out), and
  // a line about it in your words, kept with no address, which marks it as looked up: opening one asks Wikipedia nothing.
  // [where, kind, year, author, the line]. The five welcome stories' books are here too; the one told is the one listed.
  const works: [string, string, string, string, string][] = [
    ['The Odyssey, Book 1, tr. Samuel Butler (1900)', 'Epic poem', '1900', 'Homer', 'Book 1: the gods agree that Odysseus may go home at last, and Athena, dressed as a stranger, tells his son Telemachus to go looking for news of him.'],
    ['Meditations, tr. George Long (1862)', 'Book', '1862', 'Marcus Aurelius', 'The emperor’s notes to himself, in George Long’s English of 1862: twelve short books, thees and thous included.'],
    ['Meditations, Book 2, tr. George Long (1862)', 'Book', '1862', 'Marcus Aurelius', 'Book 2 starts with the morning: expect the busy-body and the ungrateful today, and do not be angry with them.'],
    ['Meditations, Book 4, tr. George Long (1862)', 'Book', '1862', 'Marcus Aurelius', 'Book 4: on time running out, and on retreating into your own mind instead of to the country or the sea.'],
    ['The Picture of Dorian Gray, chapter 2 (1890)', 'Novel', '1890', 'Oscar Wilde', 'Chapter 2: Lord Henry meets Dorian in Basil’s studio and talks to him about youth, until Dorian wishes the portrait could grow old instead of him.'],
    ['The Picture of Dorian Gray, the preface (1891)', 'Preface', '1891', 'Oscar Wilde', 'A page of short sayings about art, printed in a magazine first, then at the front of the 1891 book. It ends: all art is quite useless.'],
    ["Grandad's shelf", 'Bookshelf', '', '', 'Where Meditations came from: Grandad’s own copy, his pencil still in the margins.'],
    ["The book club's pick", 'Book club', '', '', 'How Pride and Prejudice came round: the club voted for it, and I was the only one who had not read it.'],
    ['A podcast about the summer of 1816', 'Podcast', '', '', 'An episode on the wet summer by Lake Geneva when Mary Shelley started Frankenstein, for a ghost story contest. I ordered the book before it ended.'],
    ['The play in the park', 'Play', '', '', 'Hamlet on the grass one summer evening, a dog barking through the ghost. That is where the play got me.'],
    ['Pride and Prejudice, chapter 1', 'Novel', '1813', 'Jane Austen', 'Chapter 1: Netherfield Park is let at last, to a single man of large fortune, and Mrs Bennet has five daughters.'],
    ['Pride and Prejudice, chapter 5', 'Novel', '1813', 'Jane Austen', 'Chapter 5: the morning after the ball at Meryton the Lucases call, and the talk is all of Mr Darcy’s pride.'],
    ['Pride and Prejudice, chapter 11', 'Novel', '1813', 'Jane Austen', 'Chapter 11: an evening at Netherfield. Miss Bingley pretends to read, then walks about the room to be looked at.'],
    ['Pride and Prejudice, chapter 34', 'Novel', '1813', 'Jane Austen', 'Chapter 34: at Hunsford, Darcy proposes, insulting her family in the same breath, and Elizabeth turns him down.'],
    ['Frankenstein, chapter 4 (1831)', 'Novel', '1831', 'Mary Shelley', 'Chapter 4: two years of study at Ingolstadt, then the night Victor finds out how to give life to dead matter.'],
    ['Frankenstein, chapter 10 (1831)', 'Novel', '1831', 'Mary Shelley', 'Chapter 10: on the glacier above Chamonix, the creature finds Victor and makes him listen.'],
    ['Frankenstein, chapter 20 (1831)', 'Novel', '1831', 'Mary Shelley', 'Chapter 20: in the Orkneys Victor tears apart the second creature he was making, and the first promises to be with him on his wedding night.'],
    ['Hamlet, Act 1, Scene 3', 'Play', '', 'William Shakespeare', 'Act 1, Scene 3: Laertes leaves for France. Polonius loads him with advice, then forbids Ophelia to see Hamlet.'],
    ['Hamlet, Act 1, Scene 5', 'Play', '', 'William Shakespeare', 'Act 1, Scene 5: the Ghost tells Hamlet he was murdered by his own brother, and Hamlet swears his friends to silence.'],
    ['Hamlet, Act 2, Scene 2', 'Play', '', 'William Shakespeare', 'Act 2, Scene 2: Rosencrantz and Guildenstern arrive, Polonius explains Hamlet’s madness to the king, and the players come.'],
    ['Hamlet, Act 4, Scene 7', 'Play', '', 'William Shakespeare', 'Act 4, Scene 7: Claudius and Laertes plan the duel with a poisoned blade, and Gertrude brings news that Ophelia has drowned.'],
    ['Hamlet, Act 5, Scene 2', 'Play', '', 'William Shakespeare', 'Act 5, Scene 2: the duel. A poisoned cup, a poisoned blade, and nearly everyone dies.'],
    // De Vere's translation came out in ten volumes from 1912 to 1915, so no one year is sure for each life.
    [vasari('Masaccio'), 'Biography', '', 'Giorgio Vasari', 'Vasari’s life of Masaccio, who painted the Trinity in Santa Maria Novella and died in his twenties.'],
    [vasari('Filippo Brunelleschi'), 'Biography', '', 'Giorgio Vasari', 'Vasari’s life of Brunelleschi, who built the dome of Florence’s cathedral and worked out how perspective is drawn.'],
    [vasari('Michelagnolo Buonarroti'), 'Biography', '', 'Giorgio Vasari', 'Vasari’s life of Michelangelo. He knew him, and writes him as the summit every other life was climbing to.'],
    [richter(19), 'Notebooks', '1883', 'Leonardo da Vinci', 'Richter’s 1883 edition of Leonardo’s notes, sorted by subject. This part is on perspective, the guide and the gateway of drawing.'],
    // The welcome stories' books (welcome-stories.ts), and Gandalf's, which the essay on him is from.
    ['A Scandal in Bohemia', 'Short story', '1891', 'Arthur Conan Doyle', 'The first Sherlock Holmes story in the Strand Magazine: a king, a photograph, and Irene Adler, the woman who beats him.'],
    ['Frankenstein', 'Novel', '1818', 'Mary Shelley', 'Mary Shelley’s novel, first printed without her name: Victor makes a man and runs from him.'],
    ['Dracula', 'Novel', '1897', 'Bram Stoker', 'Told in letters and diaries: a young lawyer goes to Transylvania to sell a house in England to a Count, who then sails for it.'],
    ['Pride and Prejudice', 'Novel', '1813', 'Jane Austen', 'Elizabeth Bennet, Mr Darcy, and two first impressions, each put right.'],
    ['The Odyssey', 'Epic poem', '', 'Homer', 'Odysseus’s ten years getting home from Troy, in twenty-four books, while Penelope keeps the suitors waiting.'],
    ['The Fellowship of the Ring', 'Novel', '1954', 'J. R. R. Tolkien', 'The first of the three volumes of The Lord of the Rings: Frodo leaves the Shire with the Ring, and Gandalf falls in Moria.']
  ]
  // Only the works the book holds: a page made for one it does not would show on Sources with no notes.
  const listed = new Set((await call<{ field: string; name: string }[]>('sources')).filter((one) => one.field === 'medium').map((one) => one.name))
  for (const [where, what, year, author, line] of works) {
    if (!listed.has(where)) continue
    await call('work:save', { title: where, authors: author, year, what, publisher: '', doi: '', isbn: '', url: '' })
    await call('source:bio', 'medium', where, line, '')
  }

  // On a developer's own Mac, a few of their books and paintings as well; never in a packaged app.
  await call('sandbox:local-library')

  // Opened lately, a little ahead of the rest: three notes with pictures, so Home's "Jump back in" leans to them
  // without being only pictures. Then this morning's two, so Home's first tiles are the Matrix piece and the card it grew from.
  await call('home:opened', 'article', urbino)
  await call('home:opened', 'capture', dorian)
  await call('home:opened', 'article', creatureReads)
  await call('home:opened', 'nugget', redPill)
  await call('home:opened', 'article', matrix)

  return { captures, nuggets, tasks }
}



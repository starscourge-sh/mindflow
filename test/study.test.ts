// Run with: node --test test/study.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { balancedDay, bucketOf, daysInARow, fitFirstDays, isEquation, isLeech, keyWords, LEECH_AT, lineCard, lineCardsIn, matchLineCards, mentions, minutesFor, sameAnswer, shuffleNew, termLines, thingsIn, withinTagLimits, wordsIn } from '../src/main/study.ts'

test('a line with :: between words is a card', () => {
  assert.deepEqual(lineCard('Capital of Peru :: Lima'), { question: 'Capital of Peru', answer: 'Lima' })
  assert.deepEqual(lineCard('  What is 2 + 2?   ::   4  '), { question: 'What is 2 + 2?', answer: '4' })
  // Only the first :: splits; the answer may hold more.
  assert.deepEqual(lineCard('Ratio :: 1 :: 2'), { question: 'Ratio', answer: '1 :: 2' })
})

test('code, times and half-written lines are not cards', () => {
  assert.equal(lineCard('std::vector<int> is a template'), null)
  assert.equal(lineCard('a::b'), null)
  assert.equal(lineCard('Capital of Peru ::'), null)
  assert.equal(lineCard(':: Lima'), null)
  assert.equal(lineCard('Capital of Peru'), null)
  assert.equal(lineCard(''), null)
})

test('a list marker before the question is not part of it', () => {
  assert.deepEqual(lineCard('- First law :: Ellipses'), { question: 'First law', answer: 'Ellipses' })
  assert.deepEqual(lineCard('2. Second law :: Equal areas'), { question: 'Second law', answer: 'Equal areas' })
})

test('cards are found in a stored note, list items included, code blocks skipped', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'heading', content: [{ type: 'text', text: 'Kepler' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First law ' }, { type: 'text', text: ':: Ellipses', marks: [{ type: 'bold' }] }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second law :: Equal areas' }] }] }
      ] },
      { type: 'codeBlock', content: [{ type: 'text', text: 'x :: y' }] },
      { type: 'paragraph' }
    ]
  }
  assert.deepEqual(lineCardsIn(doc), [{ question: 'First law', answer: 'Ellipses' }, { question: 'Second law', answer: 'Equal areas' }])
})

test('cards are found in Markdown, not inside a fence', () => {
  const text = 'Notes\n- Peru :: Lima\n```\nfoo :: bar\n```\nChile :: Santiago'
  assert.deepEqual(lineCardsIn(text), [{ question: 'Peru', answer: 'Lima' }, { question: 'Chile', answer: 'Santiago' }])
})

test('an edited line keeps its card; a new line makes one; a line gone drops one', () => {
  const had = [{ id: 'a', prompt: 'Peru' }, { id: 'b', prompt: 'Chile' }]
  // Chile's question reworded, Peru unchanged, a third line added.
  const { keep, add, drop } = matchLineCards(had, [{ question: 'Peru', answer: 'Lima' }, { question: 'Capital of Chile', answer: 'Santiago' }, { question: 'Bolivia', answer: 'Sucre' }])
  assert.deepEqual(keep.map((one) => [one.card.id, one.line.question]), [['a', 'Peru'], ['b', 'Capital of Chile']])
  assert.deepEqual(add.map((one) => one.question), ['Bolivia'])
  assert.deepEqual(drop, [])
  // Moved lines keep their own cards, matched by question first.
  const swapped = matchLineCards(had, [{ question: 'Chile', answer: 'Santiago' }, { question: 'Peru', answer: 'Lima' }])
  assert.deepEqual(swapped.keep.map((one) => [one.card.id, one.line.question]), [['b', 'Chile'], ['a', 'Peru']])
  // Every line taken out: both cards go.
  assert.deepEqual(matchLineCards(had, []).drop.map((one) => one.id), ['a', 'b'])
})

test('a card is slipping from its fourth miss', () => {
  assert.equal(LEECH_AT, 4)
  assert.equal(isLeech(3), false)
  assert.equal(isLeech(4), true)
  assert.equal(isLeech(9), true)
  assert.equal(isLeech(0), false)
})

test('practice buckets', () => {
  const card = { seen: true, last: 3, lapses: 0, recall: 0.95, daysSince: 3 }
  assert.equal(bucketOf({ ...card, seen: false }, 0.9), 'new')
  assert.equal(bucketOf({ ...card, last: 1 }, 0.9), 'weak')
  assert.equal(bucketOf({ ...card, lapses: 3 }, 0.9), 'weak')
  assert.equal(bucketOf({ ...card, recall: 0.7 }, 0.9), 'learning')
  assert.equal(bucketOf({ ...card, daysSince: 45 }, 0.9), 'old')
  assert.equal(bucketOf(card, 0.9), 'fresh')
})

test('a blurt mentions a gem by the words they share', () => {
  const blurt = keyWords('The event horizon is where light cannot escape. Hawking radiation leaks out slowly.')
  assert.equal(mentions(blurt, 'Event horizon: the boundary past which light cannot escape a black hole'), true)
  assert.equal(mentions(blurt, 'Schwarzschild radius: how small a mass must be squeezed to become a black hole'), false)
  // Plurals and case match.
  assert.equal(mentions(keyWords('PLANETS move in ellipses'), 'A planet moves in an ellipse'), true)
})

test('a review takes about thirty seconds a card unless your reviews say otherwise', () => {
  assert.equal(minutesFor(12, null), 6)
  assert.equal(minutesFor(1, null), 1)
  assert.equal(minutesFor(10, 12000), 2)
  // A stray slow review is not believed.
  assert.equal(minutesFor(12, 900000), 6)
})

test('a pasted list of term - meaning lines', () => {
  const list = termLines('Ephemeral - lasting a very short time\nLaconic – using few words\nSanguine: hopeful\n')
  assert.deepEqual(list.map((one) => one.term), ['Ephemeral', 'Laconic', 'Sanguine'])
  assert.equal(list[1].meaning, 'using few words')
  // Two lines, or prose with a dash in it, is not a list.
  assert.deepEqual(termLines('a - b\nc - d'), [])
  assert.deepEqual(termLines('I went out - it rained.\nThen I came home and read for an hour.\nAnd slept.\nThe end - of it all.'), [])
})

test('days in a row: a week banks a rest day, a missed day spends it', () => {
  const days = (from: number, n: number): string[] => Array.from({ length: n }, (_, i) => `2026-10-${String(from + i).padStart(2, '0')}`)
  assert.deepEqual(daysInARow([], '2026-10-10'), { run: 0, banked: 0, best: 0, since: '2026-10-10' })
  // Today not reviewed yet: the run stands.
  assert.deepEqual(daysInARow(days(5, 4), '2026-10-09'), { run: 4, banked: 0, best: 4, since: '2026-10-05' })
  assert.deepEqual(daysInARow(days(5, 4), '2026-10-10').run, 0)
  // Seven in a row, a day off, two more: the rest day was spent, the run goes on.
  assert.deepEqual(daysInARow([...days(1, 7), ...days(9, 2)], '2026-10-10'), { run: 9, banked: 0, best: 9, since: '2026-10-01' })
  // Without a banked day the run starts again.
  assert.equal(daysInARow([...days(1, 3), ...days(5, 2)], '2026-10-06').run, 2)
  // The best run is kept after a run ends: three, then two.
  assert.equal(daysInARow([...days(1, 3), ...days(5, 2)], '2026-10-06').best, 3)
})

test('fitting how long a first grade lasts', () => {
  const curve = (t: number, s: number): number => Math.pow(1 + (19 / 81) * (t / s), -0.5)
  // Good cards remembered nine times in ten after 3 days, three in four after 30: a few days to a fortnight.
  const pairs = [...Array(40)].flatMap((_, i) => [{ first: 3, days: 3, recalled: i % 10 !== 0 }, { first: 3, days: 30, recalled: i % 4 !== 0 }])
  const fitted = fitFirstDays(pairs, [0.2, 1.2, 3, 15], curve)
  assert.ok(fitted[2] > 3 && fitted[2] < 15, String(fitted[2]))
  // Too few to say: the defaults stay.
  assert.equal(fitted[0], 0.2)
  assert.equal(fitted[3], 15)
})

test('formulas survive in card lines, in a stored note and in Markdown', () => {
  const doc = { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'What is the derivative of ' }, { type: 'inlineMath', attrs: { latex: 'x^2' } }, { type: 'text', text: '? :: ' }, { type: 'inlineMath', attrs: { latex: '2x' } }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Integral of ' }, { type: 'inlineMath', attrs: { latex: '\\int_0^1 x\\,dx' } }, { type: 'text', text: ' :: ' }, { type: 'inlineMath', attrs: { latex: '\\frac{1}{2}' } }] }
  ] }
  assert.deepEqual(lineCardsIn(doc), [{ question: 'What is the derivative of $x^2$?', answer: '$2x$' }, { question: 'Integral of $\\int_0^1 x\\,dx$', answer: '$\\frac{1}{2}$' }])
  assert.deepEqual(lineCard('Speed of light $c$ :: $3 \\times 10^8$ m/s'), { question: 'Speed of light $c$', answer: '$3 \\times 10^8$ m/s' })
})

test('lines that are not cards stay text: ratios, :: in code or a formula', () => {
  assert.equal(lineCard('hot : cold :: up : down'), null)
  assert.equal(lineCard('`map :: (a -> b) -> [a] -> [b]`'), null)
  assert.equal(lineCard('$a :: b$ in a proportion'), null)
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'map :: (a -> b)', marks: [{ type: 'code' }] }] }] }
  assert.deepEqual(lineCardsIn(doc), [])
  // A card whose question shows code keeps it, and still splits outside it.
  assert.deepEqual(lineCard('What does `std::move` do? :: Casts to an rvalue'), { question: 'What does `std::move` do?', answer: 'Casts to an rvalue' })
})

test('a pasted list of equations is not cut into terms', () => {
  assert.deepEqual(termLines('a - b = c\nx^2 - 4 = 0\n2y - 1 = 5'), [])
  assert.equal(isEquation('a - b = c'), true)
  assert.equal(isEquation('Force - F = ma'), false)
  assert.equal(isEquation('\\frac{a}{b} - c = 0'), true)
})

test('new cards you wrote are shuffled, the same all day, siblings at least 5 apart', () => {
  // A 12-line list from one note and 12 single cards from elsewhere.
  const cards = [...Array.from({ length: 12 }, (_, n) => ({ id: `list${n}`, group: 'list' })), ...Array.from({ length: 12 }, (_, n) => ({ id: `one${n}`, group: `note${n}` }))]
  const day = shuffleNew(cards, '2026-10-31')
  assert.equal(day.length, 24)
  assert.deepEqual(shuffleNew(cards, '2026-10-31').map((one) => one.id), day.map((one) => one.id))
  assert.notDeepEqual(day.map((one) => one.id), cards.map((one) => one.id))
  const at = day.flatMap((one, n) => (one.group === 'list' ? [n] : []))
  // 12 siblings in 24 places cannot all be 5 apart: the first ones are, and none is ever next to another.
  for (let n = 1; n < 4; n++) assert.ok(at[n] - at[n - 1] >= 5, `${at}`)
  for (let n = 1; n < at.length; n++) assert.ok(at[n] - at[n - 1] >= 1)
  // A list on its own, with nothing to mix in, still comes, all of it.
  assert.equal(shuffleNew(cards.slice(0, 12), '2026-10-31').length, 12)
})

test("a note's words, code left out, are where its cards' tags come from", () => {
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cells #biology' }] }, { type: 'codeBlock', content: [{ type: 'text', text: '#include <x>' }] }, { type: 'paragraph', content: [{ type: 'text', text: '#hex', marks: [{ type: 'code' }] }] }] }
  assert.equal(wordsIn(doc).includes('#biology'), true)
  assert.equal(wordsIn(doc).includes('#include') || wordsIn(doc).includes('#hex'), false)
  assert.equal(wordsIn('Notes #law\n```\n#not\n```').includes('#not'), false)
})

test('a typed answer is right at once only word for word; how many letters it shares decides nothing', () => {
  // Capitals, spaces, stops and accents aside.
  assert.equal(sameAnswer('paris', 'Paris'), true)
  assert.equal(sameAnswer('  Hastings. ', 'Hastings'), true)
  assert.equal(sameAnswer('murcielago', 'murciélago'), true)
  // A slip, a missing unit, a near word: not the answer; the person or this Mac judges it.
  assert.equal(sameAnswer('mitochondira', 'mitochondria'), false)
  assert.equal(sameAnswer('9.8', '9.8 m/s²'), false)
  assert.equal(sameAnswer('', 'Lima'), false)
  // Exact: every mark the same.
  assert.equal(sameAnswer('co2', 'CO2', true), false)
  assert.equal(sameAnswer('CO2', 'CO2', true), true)
})

test('a card coming back in 3 days or more lands on the lightest day in reach', () => {
  const load = (day: number): number => ({ 19: 80, 20: 120, 21: 40 } as Record<number, number>)[day] ?? 60
  // 20 days: 1 day either side; 21 has the fewest.
  assert.equal(balancedDay(20, load), 21)
  // Short gaps are kept as they are.
  assert.equal(balancedDay(2, () => 0), 2)
  // A lighter day is skipped when another is in reach, even if emptier.
  assert.equal(balancedDay(20, load, (day) => day === 21), 19)
  // Within reach only: 100 days moves at most 4.
  const moved = balancedDay(100, (day) => (day === 104 ? 0 : 50))
  assert.equal(moved, 104)
  assert.equal(balancedDay(100, (day) => (day === 106 ? 0 : 50)), 100)
})

test('an answer counts the things it asks you to recall', () => {
  assert.equal(thingsIn('- Mercury\n- Venus\n- Earth\n- Mars\n- Jupiter'), 5)
  assert.equal(thingsIn('Cyan, magenta, yellow and black'), 4)
  assert.equal(thingsIn('Ser, estar, tener, ir, hacer, poder'), 6)
  // A sentence with commas is one thing.
  assert.equal(thingsIn('Because, as Ebbinghaus found in 1885, memory fades fast at first and then slowly'), 1)
  assert.equal(thingsIn('Lima'), 1)
  // Lines that are a word's meaning, not a list, are one thing.
  assert.equal(thingsIn('Wicked or criminal, especially in a sly way.\nExample: a nefarious plot to seize power.\nSimilar: villainous, sinister, wicked.\nFrom Latin nefas, a wrong against the gods.'), 1)
  assert.equal(thingsIn('1. Mercury\n2. Venus\n3. Earth'), 3)
  assert.equal(thingsIn('Mercury\nVenus\nEarth'), 3)
})

test('a tag with its own new cards a day starts no more than that', () => {
  const cards = [...Array.from({ length: 8 }, (_, n) => ({ id: `art${n}`, tags: n % 2 ? ['art-baroque'] : ['art'] })), { id: 'phys', tags: ['physics'] }, { id: 'both', tags: ['art', 'physics'] }]
  const limits = new Map([['art', 3]])
  const kept = withinTagLimits(cards, (card) => card.tags, limits)
  // 3 from #art (#art-baroque counts toward it), and the #physics card still comes.
  assert.deepEqual(kept.map((card) => card.id), ['art0', 'art1', 'art2', 'phys'])
  // 2 started earlier today: only 1 more.
  assert.deepEqual(withinTagLimits(cards, (card) => card.tags, limits, [['art'], ['art-baroque']]).map((card) => card.id), ['art0', 'phys'])
  // None: no new #art cards at all; no limits: everything.
  assert.deepEqual(withinTagLimits(cards, (card) => card.tags, new Map([['art', 0]])).map((card) => card.id), ['phys'])
  assert.equal(withinTagLimits(cards, (card) => card.tags, new Map()).length, 10)
})

test('siblings: an Anki note\'s cards and a both-ways pair share a note; one of a note a day', async () => {
  const { siblingsOf, burySiblings } = await import('../src/main/study.ts')
  assert.equal(siblingsOf('anki:Ab1:0'), 'anki:Ab1')
  assert.equal(siblingsOf('anki:Ab1:1'), 'anki:Ab1')
  assert.equal(siblingsOf('pair:x9:1'), 'pair:x9')
  assert.equal(siblingsOf('anki:1745387328294'), null)
  assert.equal(siblingsOf(null), null)
  const cards = [{ id: 'a', o: 'anki:n:0' }, { id: 'b', o: null }, { id: 'c', o: 'anki:n:1' }, { id: 'd', o: 'pair:p:0' }, { id: 'e', o: 'pair:q:1' }]
  assert.deepEqual(burySiblings(cards, (one) => siblingsOf(one.o), new Set(['pair:q'])).map((one) => one.id), ['a', 'b', 'd'])
})

test('days in a row: a day away neither counts nor costs a banked day', async () => {
  const { daysInARow } = await import('../src/main/study.ts')
  assert.deepEqual(daysInARow(['2026-10-01', '2026-10-02', '2026-10-04'], '2026-10-04', new Set(['2026-10-03'])), { run: 3, banked: 0, best: 3, since: '2026-10-01' })
  assert.deepEqual(daysInARow(['2026-10-01', '2026-10-02', '2026-10-04'], '2026-10-04'), { run: 1, banked: 0, best: 2, since: '2026-10-04' })
})

// Questions open on their cards, and a card says the question in its own words: never the line its
// note began with to say where it came from ("From HTOP, under "Dream Weaver"."), never its tags.
// 5, 50 and 500 questions, light and dark; the list is still a Display choice away and kept.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<dir> node qa/questions-cards.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go, both, errors } = c
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const doc = (...lines) => ({ type: 'doc', content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) })
const make = (patch) => h.evaluate((p) => window.api.captures.create(p), patch)

try {
  // A capture whose first line is where it came from, made a question from the Inbox (H).
  const from = await make({ kind: 'note', body: doc('From HTOP, under "Dream Weaver".', 'Should the dream log be private by default?', 'Some notes about it.') })
  const id = await v('question:new', '', from)
  // And a question holding words of its own that start elsewhere: its card still says the question.
  const held = await v('question:new', 'Is the river older than the town?')
  await v('item:save', held, { body: JSON.stringify(doc('From HTOP, under "Rivers".', 'Notes on the ford.')) }).catch(() => {})
  const made = (await v('items', 'question')).find((one) => one.id === id)
  check('1. a question made from a note that starts "From HTOP, under …" is named by its question', made?.title === 'Should the dream log be private by default?', made?.title)
  await v('question:new', 'how hard would it be to build my own aerospace? #work')
  await go('questions')
  await wait(1500)
  const read = () => h.evaluate(() => {
    const cards = [...document.querySelectorAll('[role="main"] [data-row]')]
    return { grid: !!document.querySelector('[role="main"] [data-density="grid"], [role="main"] [data-grid]') || cards.some((one) => Math.abs(one.getBoundingClientRect().width - one.getBoundingClientRect().height) < 30), texts: cards.map((one) => one.textContent.replace(/\s+/g, ' ').trim()), sizes: [...new Set(cards.map((one) => `${Math.round(one.getBoundingClientRect().width)}x${Math.round(one.getBoundingClientRect().height)}`))] }
  })
  const five = await read()
  if (shots) await both(`${shots}/questions-5`)
  check('2. Questions opens on its cards', five.grid, JSON.stringify(five.sizes))
  check('3. no card says where its note came from', !five.texts.some((one) => /From HTOP/.test(one)), five.texts.slice(0, 4).join(' | '))
  check('3b. a question whose words start elsewhere still shows itself', five.texts.some((one) => /Is the river older than the town\?/.test(one)), five.texts.slice(0, 4).join(' | '))
  check('4. no card shows its tags', !five.texts.some((one) => /#work/.test(one)), five.texts.find((one) => /aerospace/.test(one)))
  check('5. one size for every card', five.sizes.length === 1, five.sizes.join(' '))
  for (const n of [50, 500]) {
    for (let k = 0; k < n - 5; k++) await v('question:new', k % 7 === 0 ? `What would it take to rebuild the old lighthouse keeper’s cottage at the end of the harbour wall, question ${k}?` : `Question ${k}?`)
    await go('day')
    await go('questions')
    await wait(1500)
    const many = await read()
    if (shots) await both(`${shots}/questions-${n}`)
    check(`6. ${n} questions: still one size for every card`, many.sizes.length === 1, many.sizes.join(' '))
  }
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()

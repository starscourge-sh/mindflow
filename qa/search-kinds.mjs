// ⌘K finds every kind of thing by a word in its name and by a word in its
// body, and a click on the result opens it: a task, a capture of each kind, a
// gem, a Page, a question, a goal, an event and a journal day (its page and
// its two answers).
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/search-kinds.mjs [shots]
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.argv[2]
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h, v, go } = c
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const doc = (...lines) => ({ type: 'doc', content: lines.map(para) })
try {
  const made = []
  for (const kind of ['note', 'todo', 'quote', 'word', 'link', 'checkback']) {
    const id = await h.evaluate(([k, d]) => window.api.captures.create({ kind: k, body: d }), [kind, doc(`Zephyr${kind}name`, `Quillon${kind}body`)])
    made.push({ what: `capture (${kind})`, type: 'capture', id, name: `Zephyr${kind}name`, body: `Quillon${kind}body` })
  }
  const task = await v('task:add', 'Zephyrtaskname')
  await v('task:save', task.id, { notes: 'Quillontaskbody' })
  made.push({ what: 'task', type: 'task', id: task.id, name: 'Zephyrtaskname', body: 'Quillontaskbody' })
  const gem = await v('nugget:from', 'Quillongembody', {})
  const gemId = typeof gem === 'string' ? gem : gem.id
  await v('item:save', gemId, { title: 'Zephyrgemname', body: doc('Quillongembody') })
  made.push({ what: 'gem', type: 'nugget', id: gemId, name: 'Zephyrgemname', body: 'Quillongembody' })
  const page = await v('article:new')
  const pageId = typeof page === 'string' ? page : page.id
  await v('item:save', pageId, { title: 'Zephyrpagename', body: doc('Quillonpagebody') })
  made.push({ what: 'Page', type: 'article', id: pageId, name: 'Zephyrpagename', body: 'Quillonpagebody' })
  const question = await v('question:new', 'Zephyrquestionname')
  const questionId = typeof question === 'string' ? question : question.id
  await v('item:save', questionId, { body: doc('Quillonquestionbody') })
  made.push({ what: 'question', type: 'question', id: questionId, name: 'Zephyrquestionname', body: 'Quillonquestionbody' })
  const goal = await v('goal:new', 'Zephyrgoalname', null)
  const goalId = typeof goal === 'string' ? goal : goal.id
  // A goal's page shows "Why it matters", not a body: found by that, and never by words it hides.
  await v('item:save', goalId, { why: 'Quillongoalbody', body: doc('Hiddengoalwords') })
  made.push({ what: 'goal', type: 'goal', id: goalId, name: 'Zephyrgoalname', body: 'Quillongoalbody' })
  const start = new Date(Date.now() + 86400000).toISOString()
  const event = await v('event:add', { title: 'Zephyreventname', start, end: new Date(Date.now() + 90000000).toISOString(), notes: 'Quilloneventbody' })
  const eventId = event.key
  made.push({ what: 'event', type: 'event', id: eventId, name: 'Zephyreventname', body: 'Quilloneventbody' })
  const day = '2026-10-20'
  await v('notes:day:save', day, { body: doc('Quillondaybody') })
  await v('journal:save', day, 'well', 'Quillonjournalbody')

  for (const one of made) {
    const byName = await h.evaluate((w) => window.api.captures.find(w), one.name)
    const byBody = await h.evaluate((w) => window.api.captures.find(w), one.body)
    check(`${one.what}: found by a word in its name`, byName.some((r) => r.id === one.id), byName.map((r) => r.type).join(',') || 'nothing')
    check(`${one.what}: found by a word in its body`, byBody.some((r) => r.id === one.id), byBody.map((r) => r.type).join(',') || 'nothing')
  }
  const hidden = await h.evaluate((w) => window.api.captures.find(w), 'Hiddengoalwords')
  check('goal: words its page does not show are not found', !hidden.some((r) => r.id === goalId), JSON.stringify(hidden.map((r) => r.type)))
  // A slip of the keys forgiven for every kind, events too.
  for (const one of made) {
    const slip = one.body.slice(0, -2) + one.body.slice(-1) + one.body.slice(-2, -1)
    const found = await h.evaluate((w) => window.api.captures.find(w), slip)
    check(`${one.what}: found with a slip ("${slip}")`, found.some((r) => r.id === one.id), found.map((r) => r.type).join(',') || 'nothing')
  }
  for (const word of ['Quillondaybody', 'Quillonjournalbody']) {
    const found = await h.evaluate((w) => window.api.captures.find(w), word)
    check(`journal day: found by "${word}"`, found.some((r) => r.type === 'day' && r.id === day), JSON.stringify(found.map((r) => [r.type, r.id])))
  }

  // Through ⌘K itself: typed, the row is there, and a click opens it.
  const viaPalette = async (what, words, key, shown) => {
    await go('home')
    await h.keyboard.press('Meta+k')
    await h.waitForTimeout(500)
    await h.keyboard.type(words)
    await h.waitForTimeout(900)
    const row = h.locator(`div[aria-label="Search"] button[data-drag-open="${key}"]`)
    const there = await row.count() > 0
    check(`⌘K "${words}" lists the ${what}`, there)
    if (!there) {
      await h.keyboard.press('Escape')
      await h.waitForTimeout(300)
      return
    }
    if (shots) await h.screenshot({ path: `${shots}/search-${what.replace(/\W+/g, '-')}.png` })
    await row.first().click()
    await h.waitForTimeout(1500)
    const after = await h.evaluate((s) => ({ closed: !document.querySelector('div[aria-label="Search"]'), shows: document.body.innerText.includes(s) || [...document.querySelectorAll('input, textarea')].some((one) => one.offsetParent && one.value.includes(s)) }), shown)
    check(`clicking it opens the ${what}`, after.closed && after.shows, JSON.stringify(after))
    if (shots) await h.screenshot({ path: `${shots}/opened-${what.replace(/\W+/g, '-')}.png` })
    await h.keyboard.press('Escape')
    await h.waitForTimeout(300)
  }
  // A gem's page shows its words, not a name.
  for (const one of made) await viaPalette(one.what, one.body, `${one.type}:${one.id}`, one.type === 'nugget' ? one.body : one.name)
  await viaPalette('journal day', 'Quillonjournalbody', `day:${day}`, 'Quillondaybody')
  check('no page errors', !c.errors.filter((e) => /PAGEERROR/.test(e)).length, c.errors.join(' | ').slice(0, 300))
} finally {
  await c.close()
  done()
}

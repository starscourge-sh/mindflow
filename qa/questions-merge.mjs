// Lookups and Questions are one place at two speeds: Questions with Looked up,
// Open and Answered. A lookup shows under Looked up; "Keep asking" makes it an
// open question with its words as the first clue; a new question is offered
// what the dictionary and Wikipedia say ("Use this" / "Not it", never filled
// on its own); offline it says so quietly and fills once back; old links to
// Lookups land in Questions, Looked up; the sidebar has no Lookups row.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<dir> node qa/questions-merge.mjs
import { createServer } from 'node:http'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

let offline = false
const server = createServer((req, res) => {
  res.setHeader('content-type', 'application/json')
  if (offline) return (res.statusCode = 503, res.end('{}'))
  const wiki = (title, extract) => res.end(JSON.stringify({ type: 'standard', title, description: '', extract, content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${title}` } } }))
  if (req.url.startsWith('/wiki/serendipity')) return wiki('Serendipity', 'Serendipity is an unplanned fortunate discovery. It is a common occurrence. More follows.')
  if (req.url.startsWith('/wiki/zephyr')) return wiki('Zephyr', 'A zephyr is a light wind. It blows from the west.')
  if (req.url.startsWith('/wiki/quokka')) return wiki('Quokka', 'The quokka is a small wallaby. It lives on islands.')
  if (req.url.startsWith('/dict/serendipity')) return res.end(JSON.stringify([{ word: 'serendipity', meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'Finding good things without looking for them.' }] }] }]))
  res.statusCode = 404
  res.end('{}')
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
process.env.HALIGTREE_QA_WIKI = `http://127.0.0.1:${server.address().port}/wiki/`
process.env.HALIGTREE_QA_DICT = `http://127.0.0.1:${server.address().port}/dict/`

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go, send, errors } = c
const shots = process.env.QA_SHOTS
const shot = (name) => shots && h.screenshot({ path: `${shots}/${name}.png` }).catch(() => {})
const wait = (ms) => h.waitForTimeout(ms)
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
let base
const theme = async (one) => { base = await h.evaluate(([t, was]) => { const r = document.documentElement; was ??= r.className; r.className = t === 'dark' ? 'dark' : was.replace(/dark/, ''); return was }, [one, base]); await wait(300) }
const questions = () => v('items', 'question')
/** A Questions filter, picked as a click would: the chip whose words they are, in the list on show. */
const tab = (name) => h.locator('[data-question-filter] button:visible').nth(['Looked up', 'Open', 'Answered'].indexOf(name)).click({ timeout: 5000 })

try {
  const word = await h.evaluate((p) => window.api.captures.create(p), { kind: 'word', title: 'Probe hubris', body: doc('Probe hubris'), markdown: 'Probe hubris' })
  const before = await h.evaluate(() => window.api.captures.list().then((all) => all.length)).catch(() => null)

  // An old link to Lookups lands in Questions, Looked up.
  await go('lookups')
  check('1. an old Lookups link lands in Questions with Looked up on', await h.locator('[data-question-filter="looked"]').isVisible())
  check('2. a lookup appears under Looked up', await h.locator('[data-row]', { hasText: 'Probe hubris' }).count() >= 1)
  check('3. the sidebar has no Lookups row', await h.locator('nav, aside').first().getByText('Lookups', { exact: true }).count() === 0)
  await shot('questions-looked-up-light')
  await theme('dark')
  await shot('questions-looked-up-dark')
  await theme('light')
  // The tabs move between the speeds.
  await tab('Open')
  await wait(900)
  check('4. "Open" shows the open questions, with the same tabs', await h.locator('[data-question-filter="open"]').isVisible())
  await tab('Looked up')
  await wait(900)
  check('5. "Looked up" goes back', await h.locator('[data-question-filter="looked"]').isVisible())

  // Keep asking: an open question, its words the first clue.
  const had = (await questions()).length
  await send('capture', word)
  await wait(1200)
  await go('lookups')
  await h.locator('[data-row]:visible', { hasText: 'Probe hubris' }).first().click({ button: 'right' })
  await wait(400)
  await h.getByRole('menuitem', { name: /Keep asking/ }).first().click({ timeout: 5000 })
  await wait(1500)
  const now = await questions()
  const made = now.find((one) => !had || !one.closedAt) && now.length === had + 1 ? now.find((one) => /hubris/i.test(one.title)) : null
  check('6. Keep asking makes an open question', !!made && !made.closedAt, JSON.stringify(now.map((one) => one.title)))
  const full = made && await v('item', made.id)
  check('7. with what was looked up as its first clue', !!full && full.glosses.length === 1 && /hubris/i.test(full.glosses[0].body), JSON.stringify(full?.glosses))
  check('8. the lookup itself is kept (no data deleted)', !!(await h.evaluate((id) => window.api.captures.get(id), word)))

  // A new question is offered a first clue; Use this keeps it.
  const ask = async (title) => { const id = await v('question:new', title); await send('question', id); await wait(1500); return id }
  const sid = await ask('What is serendipity?')
  check('9. a new question is offered what was found', await h.locator('[data-suggest="found"]').isVisible())
  check('10. it is not filled on its own', (await v('item', sid)).glosses.length === 0)
  check('11. the suggestion has the dictionary and Wikipedia', /Finding good things/.test(await h.locator('[data-suggest-text]').textContent()) && /unplanned fortunate discovery/.test(await h.locator('[data-suggest-text]').textContent()))
  await shot('question-suggest-light')
  await theme('dark')
  await shot('question-suggest-dark')
  await theme('light')
  await h.locator('[data-suggest-use]').click()
  await wait(1200)
  const used = await v('item', sid)
  check('12. Use this keeps it as the first clue, with its credit', used.glosses.length === 1 && /Wikipedia, CC BY-SA/.test(used.glosses[0].body))
  check('13. and the offer goes', await h.locator('[data-suggest]').count() === 0)

  // Not it: gone, nothing kept, and not offered again.
  const zid = await ask('What is a zephyr?')
  check('14. a second question is offered Wikipedia', await h.locator('[data-suggest="found"]').isVisible())
  await h.locator('[data-suggest-no]').click()
  await wait(500)
  check('15. Not it takes the offer away and keeps nothing', await h.locator('[data-suggest]').count() === 0 && (await v('item', zid)).glosses.length === 0)
  await send('question', sid)
  await wait(800)
  await send('question', zid)
  await wait(1200)
  check('16. and it is not offered again', await h.locator('[data-suggest]').count() === 0)

  // Offline: a quiet line, no toast, no spinner; back online, it fills.
  offline = true
  await ask('What is a quokka?')
  check('17. offline shows the quiet line', (await h.locator('[data-suggest="offline"]').textContent().catch(() => '')) === 'Offline: suggestions will come when you’re back.')
  check('18. and no error notice', await h.locator('[data-sonner-toast][data-type="error"]').count() === 0)
  offline = false
  await h.evaluate(() => window.dispatchEvent(new Event('online')))
  await wait(1500)
  check('19. back online, the suggestion comes', await h.locator('[data-suggest="found"]').isVisible() && /small wallaby/.test(await h.locator('[data-suggest-text]').textContent()))
  check('no page errors', errors.length === 0, errors.join(' | '))
  void before
} finally {
  await c.close()
  server.closeAllConnections?.()
  server.close()
}
done()

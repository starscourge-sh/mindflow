// A person's page shows with its line about them, or the line's room kept with the orb in it while
// Wikipedia answers slowly here (700ms); the sections under it never move. And the Sources page's "quotes have no source" island: each quote's light wraps its own words,
// never a band across the page, five shown and the rest a press away. Frames every 50ms to QA_SHOTS.
//
//   npx electron-vite build --outDir out-wr
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-wr/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/source-still.mjs
import { createServer } from 'node:http'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const server = createServer((req, res) => {
  res.setHeader('content-type', 'application/json')
  if (req.url.startsWith('/wiki/Slow_Example')) return void setTimeout(() => res.end(JSON.stringify({ type: 'standard', title: 'Slow Example', description: 'Writer', extract: 'Slow Example (born 1950) is a writer of long and careful books about the sea and the people who live by it. Her lines are kept in many commonplace books. She lives in Cornwall.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Slow_Example' } } })), 700)
  res.statusCode = 404
  res.end('{}')
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
process.env.HALIGTREE_QA_WIKI = `http://127.0.0.1:${server.address().port}/wiki/`

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, v, go, close, errors } = s
const shots = process.env.QA_SHOTS
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const make = (patch) => h.evaluate((p) => window.api.captures.create(p), patch)
try {
  await v('settings:set', { hintRate: 0 })
  await make({ kind: 'quote', body: doc('The sea keeps what it is given'), attribution: 'Slow Example' })
  for (let n = 0; n < 7; n++) await make({ kind: 'quote', body: doc(`A line nobody signed, number ${n + 1}, long enough to run on a little way across the page`) })
  await h.waitForTimeout(500)

  // The person's page, sampled from the moment it is asked for.
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:source', { detail: 'attribution:Slow Example' })))
  const frames = []
  for (let f = 0; f < 36; f++) {
    frames.push(await h.evaluate(() => {
      const page = document.querySelector('[data-source-page]')
      const shown = !!page && getComputedStyle(page.closest('section') ?? page).visibility !== 'hidden' && page.getBoundingClientRect().height > 0
      const words = document.querySelector('[data-portrait="words"]')?.getBoundingClientRect().top
      return { shown, room: document.querySelector('[data-bio-room]')?.getAttribute('data-bio-room') ?? null, bio: document.querySelector('[data-bio-text]')?.value ?? null, add: !!document.querySelector('[data-bio-add]'), words: words == null ? null : Math.round(words) }
    }))
    if (shots && f < 24) await h.screenshot({ path: `${shots}/person-${String(f).padStart(2, '0')}.png` })
    await h.waitForTimeout(50)
  }
  const seen = frames.filter((one) => one.shown)
  console.log(frames.map((one, k) => `${k}:${one.shown ? 'shown' : 'hidden'}/${one.bio ? 'bio' : one.add ? 'add' : '-'}/${one.words}`).join(' '))
  check('the person page is seen', seen.length > 0)
  // The page never waits for Wikipedia (qa/person-at-once.mjs): until the line comes, its room is kept with the orb in it.
  check('from its first frame on show, the line about them or its waiting room is there, never "Add a line"', seen.length > 0 && seen.every((one) => (one.bio && one.bio.startsWith('Slow Example')) || one.room === 'waiting') && !seen.some((one) => one.add), JSON.stringify(seen[0]))
  check('and the line itself comes in', seen.some((one) => one.bio?.startsWith('Slow Example')), JSON.stringify(seen.at(-1)))
  check('their words never move once it is on show', new Set(seen.map((one) => one.words)).size === 1, [...new Set(seen.map((one) => one.words))].join(' -> '))

  // The Sources page's island of quotes with no source.
  await go('sources')
  await h.waitForTimeout(600)
  const island = await h.evaluate(() => {
    const box = document.querySelector('[data-missing-source]')?.getBoundingClientRect()
    const rows = [...document.querySelectorAll('[data-missing-row]')]
    const word = rows[0]?.querySelector('button')?.getBoundingClientRect()
    const list = document.querySelector('[data-row]')?.getBoundingClientRect()
    return { box: box && { left: Math.round(box.left), width: Math.round(box.width) }, rows: rows.length, word: word && Math.round(word.width), more: document.querySelector('[data-missing-more]')?.textContent, listLeft: list && Math.round(list.left) }
  })
  check('five quotes shown, the rest a press away', island.rows === 5 && /Show all 7/.test(island.more ?? ''), JSON.stringify(island))
  check('a quote’s light wraps its own words, not a band across the island', island.word && island.box && island.word < island.box.width - 140, JSON.stringify(island))
  check('the island starts on the list’s own box edge', island.box && island.listLeft != null && Math.abs(island.box.left - island.listLeft) <= 2, JSON.stringify(island))
  await h.locator('[data-missing-row] button').first().hover()
  if (shots) await h.screenshot({ path: `${shots}/missing-hover.png` })
  await h.locator('[data-missing-more]').click()
  await h.waitForTimeout(300)
  check('“Show all 7” shows all seven', await h.locator('[data-missing-row]').count() === 7)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
  server.close()
}
done()

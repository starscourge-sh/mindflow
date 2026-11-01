// A person's page shows at once, never waiting on Wikipedia: the line about them keeps its room (three quiet lines)
// from the first frame, the words fade into it when they come and nothing below moves; with no answer the room closes
// once after 4 seconds; a second visit has the kept words in its first frame.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-fi/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/person-at-once.mjs
import { createServer } from 'node:http'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

// Slow Person answers after 2.5 seconds; Never Person not at all (main gives up at 5).
const server = createServer((req, res) => {
  res.setHeader('content-type', 'application/json')
  if (req.url.startsWith('/wiki/Slow_Person')) return void setTimeout(() => res.end(JSON.stringify({ type: 'standard', title: 'Slow Person', description: 'Writer', extract: 'Slow Person is a writer who takes their time. Their books are long. Very long.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Slow_Person' } } })), 2500)
  if (req.url.startsWith('/wiki/Never_Person')) return
  res.statusCode = 404
  res.end('{}')
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
process.env.HALIGTREE_QA_WIKI = `http://127.0.0.1:${server.address().port}/wiki/`

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, errors } = c
const shots = process.env.QA_SHOTS
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const make = (patch) => h.evaluate((p) => window.api.captures.create(p), patch)
// Every 50ms from the open: when the page shows, the line's room, and where the first section below starts.
const watch = (name, ms) => h.evaluate(([name, ms]) => new Promise((resolve) => {
  const frames = []
  const start = performance.now()
  window.dispatchEvent(new CustomEvent('haligtree:source', { detail: `attribution:${name}` }))
  const tick = setInterval(() => {
    const page = document.querySelector('[data-source-page]')
    const shown = !!page && page.checkVisibility({ opacityProperty: true }) && Number(getComputedStyle(page.closest('section') ?? page).opacity) > 0.5
    const room = document.querySelector('[data-bio-room], [data-bio], [data-bio-add]')
    const below = document.querySelector('[data-portrait]')
    frames.push({ t: Math.round(performance.now() - start), shown, room: room ? `${room.hasAttribute('data-bio-room') ? 'room-' + room.getAttribute('data-bio-room') : room.hasAttribute('data-bio') ? 'bio' : 'add'}:${Math.round(room.getBoundingClientRect().height)}` : '', below: below ? Math.round(below.getBoundingClientRect().top) : null })
    if (performance.now() - start > ms) (clearInterval(tick), resolve(frames))
  }, 50)
}), [name, ms])
try {
  await make({ kind: 'quote', body: doc('Take your time #craft'), attribution: 'Slow Person' })
  await make({ kind: 'quote', body: doc('Nobody answers #craft'), attribution: 'Never Person' })
  await h.waitForTimeout(800)
  const slow = await watch('Slow Person', 4000)
  const first = slow.find((one) => one.shown)
  check('Slow Person: the page shows within 500ms, not after Wikipedia', !!first && first.t <= 500, JSON.stringify(first))
  check('Slow Person: the room is there from the first frame shown', !!first && first.room.startsWith('room-waiting'), first?.room)
  const after = slow.filter((one) => one.shown && one.below !== null)
  const tops = [...new Set(after.map((one) => one.below))]
  if (process.env.DEBUG) console.log(JSON.stringify(slow.filter((one, i) => i && (one.room !== slow[i - 1].room || one.below !== slow[i - 1].below))))
  check('Slow Person: nothing below the line moves as the words come in', tops.length === 1, JSON.stringify(tops))
  check('Slow Person: the words are in by the end', slow.at(-1).room.startsWith('bio'), slow.at(-1).room)
  if (shots) await h.screenshot({ path: `${shots}/person-slow.png` })
  const never = await watch('Never Person', 5500)
  const rooms = never.filter((one) => one.shown).map((one) => one.room)
  const shownAt = never.find((one) => one.shown)
  check('Never Person: the page shows within 500ms', !!shownAt && shownAt.t <= 500, JSON.stringify(shownAt))
  // Then, when main gives up (5s), "Add a line about them": a closed room left alone read as a failed page (Oscar Wilde, 1 Nov).
  check('Never Person: the room waits, closes once after 4s, then the lookup over, "Add a line"', rooms[0]?.startsWith('room-waiting') && never.find((one) => one.room.startsWith('room-closed'))?.t >= 3900 && rooms.at(-1)?.startsWith('add'), `${rooms[0]} .. ${rooms.at(-1)}`)
  if (shots) await h.screenshot({ path: `${shots}/person-never.png` })
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:view', { detail: 'home' })))
  await h.waitForTimeout(600)
  const again = await watch('Slow Person', 800)
  const firstAgain = again.find((one) => one.shown)
  check('Slow Person again: the kept words are in the first frame', !!firstAgain && firstAgain.room.startsWith('bio'), JSON.stringify(firstAgain))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await c.close()
  server.close()
}
done()

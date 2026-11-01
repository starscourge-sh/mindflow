// A person's line from Wikipedia that answers after the 4-second wait, or never: the moment the
// lookup ends, every waiting sign stops (no orb left turning in a closed room), a late answer shows
// its line, and a failure leaves "Add a line about them", never an empty gap that reads as failed
// (Oscar Wilde, user 1 Nov). Also the page's first frames stay as before.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<dir> node qa/bio-late.mjs
import { createServer } from 'node:http'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

// Late Person answers at 4.6 seconds (after the room closes, before main gives up at 5); Never Person not at all.
const server = createServer((req, res) => {
  res.setHeader('content-type', 'application/json')
  if (req.url.startsWith('/wiki/Late_Person')) return void setTimeout(() => res.end(JSON.stringify({ type: 'standard', title: 'Late Person', description: 'Irish writer', extract: 'Late Person was an Irish writer of plays. He was known for his wit. He died in Paris.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Late_Person' } } })), 4600)
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
/** Every 100ms from the open: the line's state, and whether an orb is still turning anywhere in the page. */
const watch = (name, ms) => h.evaluate(([name, ms]) => new Promise((resolve) => {
  const frames = []
  const start = performance.now()
  window.dispatchEvent(new CustomEvent('haligtree:source', { detail: `attribution:${name}` }))
  const tick = setInterval(() => {
    const room = document.querySelector('[data-bio-room]')
    const state = document.querySelector('[data-bio-text]') ? 'bio' : document.querySelector('[data-bio-add]') ? 'add' : room ? `room-${room.getAttribute('data-bio-room')}` : 'nothing'
    frames.push(`${Math.round((performance.now() - start) / 100) / 10}s:${state}${document.querySelector('[data-source-page] .mf-orb-pill, [data-bio-room] .mf-orb-pill') ? '+orb' : ''}`)
    if (performance.now() - start > ms) (clearInterval(tick), resolve(frames))
  }, 100)
}), [name, ms])

try {
  await make({ kind: 'quote', body: doc('A late line'), attribution: 'Late Person' })
  await make({ kind: 'quote', body: doc('A line never looked up'), attribution: 'Never Person' })
  const late = await watch('Late Person', 6500)
  console.log('Late Person:', [...new Set(late.map((one) => one.split(':')[1]))].join(' → '))
  if (shots) await h.screenshot({ path: `${shots}/bio-late.png` })
  check('1. Late Person: answered after the room closed, the line shows', late.at(-1).endsWith(':bio'), late.at(-1))
  check('2. Late Person: no orb once the answer is in', !late.at(-1).includes('+orb'), late.at(-1))
  check('3. Late Person: never "nothing" at the end (an empty gap reads as failed)', !late.at(-1).includes('nothing'))
  const never = await watch('Never Person', 7000)
  console.log('Never Person:', [...new Set(never.map((one) => one.split(':')[1]))].join(' → '))
  if (shots) await h.screenshot({ path: `${shots}/bio-never.png` })
  check('4. Never Person: when the lookup gives up, "Add a line about them" is there', never.at(-1).endsWith(':add'), never.at(-1))
  check('5. Never Person: no orb turns once the room has closed', never.filter((one) => one.includes('room-closed') || one.endsWith(':nothing')).every((one) => !one.includes('+orb')), never.filter((one) => one.includes('+orb')).slice(-2).join(' '))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await c.close()
  server.closeAllConnections?.()
  server.close()
}
done()

// "Join them" on two huge notes that say nearly the same (handover ask 1): the app never freezes, and the one loader
// shows while the join works. Run on a COPY of a book (QA_DATA), never the book itself: the copy's largest open note is
// copied under a new id first, so the two say the same, then the copy is opened and its offer's "Join them" clicked.
//
//   cp -cR <book> <copy> && npx electron-vite build --outDir out-x
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/join-big.mjs
//
// Prints the longest frozen stretch after the click, their sum, how long until the other note is in the Bin, and
// whether the orb was on screen. PROF=1 prints where the time went.
import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const load = () => `load ${loadavg()[0].toFixed(1)}`
const root = process.env.QA_DATA
if (!root) throw new Error('QA_DATA must be a copy of a book')
const shelf = existsSync(join(root, 'books.json')) ? JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')) : null
const file = shelf?.last && shelf.last !== 'default' ? join(root, 'books', shelf.last, 'haligtree.db') : join(root, 'haligtree.db')
const db = new DatabaseSync(file)
const big = db.prepare("select * from captures where status = 'open' and kind = 'note' and body is not null order by length(body) desc limit 1").get()
const twin = randomUUID()
const cols = Object.keys(big).filter((one) => one !== 'id' && one !== 'number')
db.prepare(`insert into captures (id, ${cols.join(', ')}) values (?, ${cols.map(() => '?').join(', ')})`).run(twin, ...cols.map((one) => (one === 'captured_at' ? new Date().toISOString() : big[one])))
db.close()
console.log(`twin of ${big.id.slice(0, 8)} (${Math.round(big.body.length / 1024)} KB): ${twin.slice(0, 8)}`)

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, send } = c
try {
  await send('capture', twin)
  const offer = h.locator('[data-note-offer="same"] [data-offer-action="join"]')
  // The offer stands under the note's last line, a long way down: brought into view as a person scrolls to it.
  await offer.waitFor({ state: 'attached', timeout: 120_000 })
  // As the user was, at the note's end where the offer stands under the last line: scrolled to it.
  // The note is still being laid out a while after its offer is made: scrolled to again until it stands on the page.
  let box = null
  for (let tries = 0; tries < 120 && !box; tries++) {
    // As a person scrolls: the note's own scroller to its foot (its far blocks are laid out only as they come near).
    await offer.evaluate((one) => {
      let up = one.parentElement
      while (up && !(up.scrollHeight > up.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(up).overflowY))) up = up.parentElement
      if (up) up.scrollTop = up.scrollHeight
      one.scrollIntoView({ block: 'center' })
    }).catch(() => {})
    await h.waitForTimeout(500)
    box = await offer.boundingBox().catch(() => null)
  }
  if (!box) throw new Error('the offer never stood on the page')
  await h.evaluate(() => {
    window.__long = []
    window.__seen = new PerformanceObserver((list) => list.getEntries().forEach((e) => window.__long.push([e.startTime, e.duration])))
    window.__seen.observe({ type: 'longtask' })
    window.__orb = null
    window.__t0 = performance.now()
    // Looked for where the offer stands, never across the whole page: a note this size is a million elements.
    const at = document.querySelector('[data-note-offer="same"]').parentElement
    const look = () => {
      if (at.querySelector(':scope > [data-note-offer="joining"]')) window.__orb ??= performance.now() - window.__t0
      if (window.__orb === null) requestAnimationFrame(look)
    }
    requestAnimationFrame(look)
  })
  const cdp = process.env.PROF ? await c.electron.context().newCDPSession(h) : null
  if (cdp) (await cdp.send('Profiler.enable'), await cdp.send('Profiler.setSamplingInterval', { interval: 500 }), await cdp.send('Profiler.start'))
  box = (await offer.boundingBox()) ?? box
  await h.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  const started = Date.now()
  // Done: the twin's other half is in the Bin and the page has had a second with no frozen stretch.
  let binned = null
  while (Date.now() - started < 180_000) {
    const status = await h.evaluate(async (id) => (await window.api.captures.get(id))?.status, big.id).catch(() => null)
    if (status && status !== 'open') { binned = Date.now() - started; break }
    await h.waitForTimeout(250)
  }
  await h.waitForFunction(() => { const last = window.__long.at(-1); return performance.now() - (last ? last[0] + last[1] : 0) > 1000 }, null, { timeout: 120_000, polling: 200 })
  if (cdp) {
    const { profile } = await cdp.send('Profiler.stop')
    const byId = new Map(profile.nodes.map((node) => [node.id, node]))
    const self = new Map()
    profile.samples.forEach((id, at) => {
      const node = byId.get(id)
      const key = `${node.callFrame.functionName || '(anon)'} ${node.callFrame.url.split('/').pop()}:${node.callFrame.lineNumber + 1}`
      self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[at] ?? 0))
    })
    console.log([...self].filter(([k]) => !/^\((idle|program|root)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, us]) => `  ${(us / 1000).toFixed(0).padStart(7)}ms  ${k}`).join('\n'))
  }
  const r = await h.evaluate(() => ({
    longest: Math.round(Math.max(0, ...window.__long.map(([, d]) => d))),
    total: Math.round(window.__long.reduce((sum, [, d]) => sum + d, 0)),
    orb: window.__orb === null ? null : Math.round(window.__orb),
    first: window.__long.length ? Math.round(window.__long[0][0] - window.__t0) : null,
  }))
  console.log(`join: other note binned after ${binned ?? 'never'} ms; frozen ${r.longest} ms at most, ${r.total} ms in all; orb at ${r.orb} ms, first freeze at ${r.first} ms  [${load()}]`)
  check('the other note goes to the Bin', binned !== null, `${binned}`)
  check('the orb shows before the window is busy', r.orb !== null && (r.first === null || r.orb <= r.first + 50), JSON.stringify(r))
  check('no frozen stretch over 250 ms while two huge notes join', r.longest <= 250, `${r.longest} ms`)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()

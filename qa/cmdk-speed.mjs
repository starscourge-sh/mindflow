// ⌘K stays quick on a big book: 10,000 captures, 2,000 tasks, 500 gems, a
// year of journal days and 500 events. Measured inside the page, from the
// key going down to the first frame that shows the answer:
//   open:   ⌘K to the box focused with its list drawn (target one frame, 16 ms)
//   typing: each letter to the results for the words so far (p95 under 50 ms)
//   arrows: ↓ to the highlight on the next row (one frame)
// and fast typing keeps every key, ending on the last words' results.
//
//   npx electron-vite build --outDir out-ck
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-ck/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/cmdk-speed.mjs
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const WORDS = 'garden river meeting philosophy coffee window budget travel lantern harvest orbit violin mountain recipe library science history ocean winter summer letter promise compass bridge thunder forest anchor candle mirror pocket shadow island marble ladder rocket silver whisper engine planet museum castle feather harbor journey kettle meadow needle orchard pebble quartz saddle tunnel valley wander yellow zenith'.split(' ')
let seed = 7
const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n)
const words = (n) => Array.from({ length: n }, () => WORDS[rand(WORDS.length)]).join(' ')
const doc = (...lines) => JSON.stringify({ type: 'doc', content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) })
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString()

const first = await sandbox({ width: 1300, height: 900, seeded: true })
await first.v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
await first.close()
const db = new DatabaseSync(join(process.env.QA_DATA, 'sandbox', 'haligtree.db'))
db.exec('begin')
const top = (table) => Number(db.prepare(`select coalesce(max(number), 0) as n from ${table}`).get().n)
let n = top('captures')
const cap = db.prepare("insert into captures (id, number, title, kind, status, body, captured_at) values (?, ?, '', 'note', 'open', ?, ?)")
for (let i = 0; i < 10000; i++) cap.run(randomUUID(), ++n, doc(words(6), words(40), words(40)), ago(i * 37))
const gem = db.prepare("insert into nuggets (id, tier, kind, title, body, created_at, updated_at) values (?, 'nugget', 'note', ?, ?, ?, ?)")
for (let i = 0; i < 500; i++) gem.run(randomUUID(), words(3), doc(words(60)), ago(i * 300), ago(i * 300))
n = top('tasks')
const task = db.prepare("insert into tasks (id, number, title, notes, status, created_at) values (?, ?, ?, ?, 'open', ?)")
for (let i = 0; i < 2000; i++) task.run(randomUUID(), ++n, words(4), words(12), ago(i * 90))
const day = db.prepare('insert or replace into day_pages (day, body, updated_at) values (?, ?, ?)')
const answer = db.prepare('insert or replace into journal (day, question, answer) values (?, ?, ?)')
for (let i = 1; i <= 365; i++) {
  const d = ago(i * 1440).slice(0, 10)
  day.run(d, doc(words(50)), ago(i * 1440))
  answer.run(d, 'well', words(10))
  answer.run(d, 'learned', words(10))
}
const event = db.prepare('insert into events (id, title, start_at, end_at, place, notes, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)')
for (let i = 0; i < 500; i++) event.run(randomUUID(), words(3), ago(i * 700), ago(i * 700 - 60), words(1), words(8), ago(i * 700), ago(i * 700))
db.exec('commit')
db.close()
console.log('library: 10,000 captures, 500 gems, 2,000 tasks, 365 journal days, 500 events (plus the sandbox)')

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h } = c
const pct = (list, p) => { const s = [...list].sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 10) / 10 : NaN }
try {
  await h.waitForTimeout(2500)
  // Armed before the key: each frame from then on checks `ready`, and the time
  // kept is from the key going down to the first frame where it holds.
  await h.evaluate(() => {
    window.__kd = 0
    document.addEventListener('keydown', (event) => (window.__kd = event.timeStamp), { capture: true })
    window.__arm = (src) => {
      const ready = new Function(`return (${src})`)()
      window.__res = null
      const tick = () => (window.__kd && ready() ? (window.__res = performance.now() - window.__kd) : requestAnimationFrame(tick))
      window.__kd = 0
      requestAnimationFrame(tick)
    }
    window.__shown = () => [...document.querySelectorAll('[role="dialog"][aria-label="Search"] [data-drag-open]')].map((one) => one.getAttribute('data-drag-open'))
  })
  const timed = async (src, press) => {
    await h.evaluate((s) => window.__arm(s), src)
    await press()
    await h.waitForFunction(() => window.__res !== null, null, { timeout: 10000 })
    return h.evaluate(() => window.__res)
  }
  const box = '[role="dialog"][aria-label="Search"] input'
  // Open: the box focused and the list under it drawn.
  const opens = []
  for (let i = 0; i < 8; i++) {
    opens.push(await timed(`() => document.activeElement?.matches('${box}') && document.querySelectorAll('[role="dialog"][aria-label="Search"] button').length > 3`, () => h.keyboard.press('Meta+k')))
    await h.keyboard.press('Escape')
    await h.waitForFunction((b) => !document.querySelector(b), box)
    await h.waitForTimeout(150)
  }
  console.log(`open: p50 ${pct(opens, 0.5)} ms, p95 ${pct(opens, 0.95)} ms`)
  check('⌘K opens within two frames (p50)', pct(opens, 0.5) <= 34, `${pct(opens, 0.5)} ms`)

  // Typing: each letter, to the results for the words so far.
  await h.keyboard.press('Meta+k')
  await h.waitForSelector(box)
  const queries = ['garden', 'rivr', 'meeting budget', 'philosophy', 'x', 'zqx', 'lantern harvest', 'violni']
  const keys = []
  const firstKey = []
  for (const q of queries) {
    for (let i = 1; i <= q.length; i++) {
      const typed = q.slice(0, i)
      if (typed.endsWith(' ')) { await h.keyboard.type(' '); continue }
      const want = (await h.evaluate((t) => window.api.captures.find(t), typed)).map((one) => `${one.type}:${one.id}`)
      const src = `() => document.querySelector('${box}').value === ${JSON.stringify(typed)} && ((s) => s.length === ${want.length} && s[0] === ${JSON.stringify(want[0] ?? null)} || (${want.length} === 0 && s.length === 0 && /Nothing (matches|called that)/.test(document.querySelector('[role="dialog"][aria-label="Search"]').textContent)))(window.__shown())`
      const ms = await timed(src, () => h.keyboard.type(q[i - 1]))
      keys.push(ms)
      if (i === 1) firstKey.push(ms)
    }
    await h.keyboard.press('Meta+a')
    await h.keyboard.press('Backspace')
    await h.waitForTimeout(300)
  }
  console.log(`typing: ${keys.length} keystrokes, p50 ${pct(keys, 0.5)} ms, p95 ${pct(keys, 0.95)} ms, max ${pct(keys, 1)} ms`)
  check('each letter shows its results within 50 ms (p95)', pct(keys, 0.95) <= 50, `${pct(keys, 0.95)} ms`)

  // QA_PROFILE=1: a CPU profile of fast typing and the arrow presses, the costliest functions printed.
  const cdp = process.env.QA_PROFILE ? await c.electron.context().newCDPSession(h) : null
  const profiler = {
    start: async () => { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start') },
    stop: async (name) => {
      const { profile } = await cdp.send('Profiler.stop')
      if (process.env.QA_PROFILE_DIR) (await import('fs')).writeFileSync(`${process.env.QA_PROFILE_DIR}/${name.replace(/\W+/g, '-')}.cpuprofile`, JSON.stringify(profile))
      const byId = new Map(profile.nodes.map((node) => [node.id, node]))
      const self = new Map()
      const gap = profile.timeDeltas
      profile.samples.forEach((id, at) => { self.set(id, (self.get(id) ?? 0) + (gap[at] ?? 0)) })
      const parent = new Map()
      for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id)
      const where = (node) => `${node.callFrame.functionName || '(anon)'} ${node.callFrame.url.split('/').pop()}:${node.callFrame.lineNumber + 1}`
      const selfBy = new Map(); const total = new Map()
      for (const [id, us] of self) {
        const node = byId.get(id)
        selfBy.set(where(node), (selfBy.get(where(node)) ?? 0) + us)
        const seen = new Set()
        for (let at = id; at; at = parent.get(at)) { const key = where(byId.get(at)); if (!seen.has(key)) (seen.add(key), total.set(key, (total.get(key) ?? 0) + us)) }
      }
      const top = (map, n) => [...map].filter(([k]) => !/^\(idle\)|^\(program\)|^\(root\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => `  ${(us / 1000).toFixed(1).padStart(7)}ms  ${k}`).join('\n')
      console.log(`--- profile ${name}: self\n${top(selfBy, 25)}\n--- inclusive (app code)\n${top(new Map([...total].filter(([k]) => /home-|index-|\.tsx?:|chunk|-[\w]{8}\.js/.test(k))), 60)}`)
    }
  }
  // Fast typing (25 ms a key): no key lost, the caret never waits, the last words' results stay.
  await h.evaluate(() => {
    window.__lag = []
    window.__lt = []
    window.__seen = []
    const input = document.querySelector('[role="dialog"][aria-label="Search"] input')
    input.addEventListener('keydown', (e) => { const t = e.timeStamp; requestAnimationFrame(() => window.__lag.push(performance.now() - t)) })
    new PerformanceObserver((list) => list.getEntries().forEach((one) => window.__lt.push(Math.round(one.duration)))).observe({ type: 'longtask' })
    new MutationObserver(() => window.__seen.push(window.__shown()[0] ?? '')).observe(document.querySelector('[role="dialog"][aria-label="Search"]'), { subtree: true, childList: true })
  })
  const fast = 'orchard meadow'
  if (cdp) await profiler.start()
  await h.keyboard.type(fast, { delay: 25 })
  const want = (await h.evaluate((t) => window.api.captures.find(t), fast)).map((one) => `${one.type}:${one.id}`)
  await h.waitForFunction((w) => window.__shown()[0] === w, want[0], { timeout: 5000 })
  await h.waitForTimeout(800)
  if (cdp) await profiler.stop('fast typing')
  const fastState = await h.evaluate((b) => ({ value: document.querySelector(b).value, lag: window.__lag, lt: window.__lt, last: window.__shown()[0] }), box)
  console.log(`fast typing: caret frame p95 ${pct(fastState.lag, 0.95)} ms, max ${pct(fastState.lag, 1)} ms; long tasks ${JSON.stringify(fastState.lt)}`)
  check('fast typing keeps every key', fastState.value === fast, JSON.stringify(fastState.value))
  check('the last words\' results stay, nothing older lands over them', fastState.last === want[0])

  // Arrows: ↓ to the highlight on the next row, over a long list of results.
  await h.keyboard.press('Meta+a')
  await h.keyboard.type('garden')
  await h.waitForFunction(() => window.__shown().length > 30, null, { timeout: 5000 })
  // The search alone, in main, for the record.
  const ipc = await h.evaluate(async () => { const out = []; for (const q of ['g', 'garden', 'rivr', 'meeting budget', 'zqx']) { const t = performance.now(); await window.api.captures.find(q); out.push(`${q} ${Math.round(performance.now() - t)}`) } return out.join(', ') })
  console.log(`search in main (ms): ${ipc}`)
  const arrows = []
  if (cdp) await profiler.start()
  for (let i = 0; i < 20; i++) {
    const before = await h.evaluate(() => [...document.querySelectorAll('[role="dialog"][aria-label="Search"] [data-search-at]')].map((one) => one.textContent).join())
    arrows.push(await timed(`() => [...document.querySelectorAll('[role="dialog"][aria-label="Search"] [data-search-at]')].map((one) => one.textContent).join() !== ${JSON.stringify(before)}`, () => h.keyboard.press('ArrowDown')))
  }
  if (cdp) await profiler.stop('arrows')
  console.log(`arrows: p50 ${pct(arrows, 0.5)} ms, p95 ${pct(arrows, 0.95)} ms`)
  check('↓ moves the highlight within two frames (p95)', pct(arrows, 0.95) <= 34, `${pct(arrows, 0.95)} ms`)
} finally {
  await c.close()
}
done()

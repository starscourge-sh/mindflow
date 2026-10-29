// How quickly a page of Writing opens, on a book like a real one: 45 pages,
// each with properties, headings, a large picture, link cards and over 2,000
// words, beside 10,000 captures. Timed inside the page from the click (or the
// ↓ / ↑ key) to the first frame showing:
//   title:   the page's title
//   body:    its words (the first line under the picture)
//   picture: its picture drawn (decoded, laid out)
//   ready:   the page answering a key (the last long frame since the press over)
// p50 and p95 over each set of opens: cold (never opened in this window) and
// warm (opened before), by click and by ↓ / ↑.
//
//   npx electron-vite build --outDir out-op
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-op/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/writing-open-speed.mjs
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const PAGES = 45, CAPTURES = 10000
const { check, done } = checks()
const WORDS = 'garden river meeting philosophy coffee window budget travel lantern harvest orbit violin mountain recipe library science history ocean winter summer letter promise compass bridge thunder forest anchor candle mirror pocket shadow island marble ladder rocket silver whisper engine planet museum castle feather harbor journey kettle meadow needle orchard pebble quartz saddle tunnel valley wander yellow zenith'.split(' ')
let seed = 11
const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n)
const words = (n) => Array.from({ length: n }, () => WORDS[rand(WORDS.length)]).join(' ')
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString()
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const h2 = (text) => ({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] })

// 1. Pictures saved through the app (large photos, as a camera makes), then the book written while it is shut.
const first = await sandbox({ width: 1400, height: 900 })
await first.v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
await first.v('settings:set', { sounds: false, hintRate: 0, countIn: false })
// One photo per page, none shared: a picture decoded once is kept, and a shared one would hide what decoding costs.
const pictures = await first.h.evaluate(async (count) => {
  const out = []
  for (let k = 0; k < count; k++) {
    const canvas = new OffscreenCanvas(4000, 2600)
    const g = canvas.getContext('2d')
    for (let i = 0; i < 3000; i++) { g.fillStyle = `hsl(${(k * 37 + i * 7) % 360} 55% ${25 + ((i + k) % 50)}%)`; g.fillRect((i * 997 + k * 131) % 4000, (i * 613 + k * 89) % 2600, 90 + (i % 140), 60 + (i % 90)) }
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 })
    out.push(await window.api.saveImage('image/jpeg', new Uint8Array(await blob.arrayBuffer())))
  }
  return out
}, PAGES)
await first.close()
const db = new DatabaseSync(join(process.env.QA_DATA, 'sandbox', 'haligtree.db'))
db.exec('begin')
let n = Number(db.prepare('select coalesce(max(number), 0) as n from captures').get().n)
const cap = db.prepare("insert into captures (id, number, title, kind, status, body, captured_at) values (?, ?, '', 'note', 'open', ?, ?)")
for (let i = 0; i < CAPTURES; i++) cap.run(randomUUID(), ++n, JSON.stringify({ type: 'doc', content: [p(words(6)), p(words(40))] }), ago(i * 37))
const art = db.prepare("insert into nuggets (id, tier, kind, title, body, fields, created_at, updated_at) values (?, 'article', 'note', ?, ?, ?, ?, ?)")
const titles = []
for (let i = 0; i < PAGES; i++) {
  const title = `Page ${String(i + 1).padStart(2, '0')} ${words(2)}`
  titles.push(title)
  const content = [p(`Opening${i} line: ${words(30)}`), { type: 'image', attrs: { src: pictures[i % pictures.length] } }, p(`First${i} under the picture: ${words(40)}`)]
  for (let part = 0; part < 12; part++) {
    content.push(h2(`Part ${part + 1} ${words(2)}`))
    for (let q = 0; q < 4; q++) content.push(p(words(42)))
    if (part % 4 === 1) content.push({ type: 'bookmark', attrs: { href: `https://example.com/${i}/${part}`, title: `Read ${words(3)}`, description: words(18), image: '', icon: '', site: 'example.com' } })
  }
  const fields = { Status: ['Draft', 'Editing', 'Done'][i % 3], Source: `https://example.com/source/${i}`, Rating: (i % 5) + 1, Due: '2026-11-20' }
  art.run(randomUUID(), title, JSON.stringify({ type: 'doc', content }), JSON.stringify(fields), ago(i * 60), ago(i * 60))
}
db.exec('commit')
db.close()

const c = await sandbox({ width: 1400, height: 900, seeded: false })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)

// Watches every frame from the press for the four marks; long frames give "ready".
const arm = (want) => h.evaluate((want) => {
  const marks = {}
  let t0 = null
  let busyUntil = 0
  const loaf = new PerformanceObserver((list) => {
    for (const one of list.getEntries()) if (t0 !== null && one.startTime + one.duration > t0) busyUntil = Math.max(busyUntil, one.startTime + one.duration - t0)
  })
  try { loaf.observe({ type: 'long-animation-frame', buffered: false }) } catch {}
  const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight }
  const titled = () => {
    const found = document.evaluate(`//*[normalize-space(.)=${JSON.stringify(want.title)} and not(ancestor::*[@data-row]) and not(*[normalize-space(.)=${JSON.stringify(want.title)}])]`, document.body, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)
    for (let i = 0; i < found.snapshotLength; i++) if (shown(found.snapshotItem(i))) return true
    return [...document.querySelectorAll('textarea, input')].some((one) => one.value === want.title && shown(one))
  }
  let pictured = null
  const start = (event) => {
    if (t0 !== null) return
    if (want.key ? event.type !== 'keydown' : event.type !== 'pointerdown') return
    t0 = event.timeStamp
    const frame = () => {
      const now = performance.now() - t0
      if (marks.title === undefined && titled()) marks.title = now
      const editor = [...document.querySelectorAll('.tiptap.ProseMirror')].find((one) => one.textContent.includes(want.words))
      if (marks.body === undefined && editor) marks.body = now
      const img = editor?.querySelector('img[src^="haligtree://assets"]')
      if (pictured === null && img?.complete && img.naturalWidth && shown(img)) pictured = now
      else if (pictured !== null && marks.picture === undefined) marks.picture = now
      if (now < 5000 && (marks.picture === undefined || marks.title === undefined)) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }
  window.addEventListener('pointerdown', start, true)
  window.addEventListener('keydown', start, true)
  window.__openSpeed = () => {
    loaf.disconnect()
    window.removeEventListener('pointerdown', start, true)
    window.removeEventListener('keydown', start, true)
    marks.ready = Math.max(marks.body ?? 0, busyUntil)
    return Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, Math.round(v)]))
  }
}, want)

// QA_PROFILE=1: a CPU profile of a few opens, the costliest functions printed.
let cdp = null, profileNow = false
const profiled = async (run) => {
  if (!process.env.QA_PROFILE || !profileNow) return run()
  cdp ??= await c.electron.context().newCDPSession(h)
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start')
  await run()
  profileNow = false
  const { profile } = await cdp.send('Profiler.stop')
  if (process.env.QA_PROFILE_DIR) (await import('fs')).writeFileSync(join(process.env.QA_PROFILE_DIR, 'open.cpuprofile'), JSON.stringify(profile))
  const byId = new Map(profile.nodes.map((node) => [node.id, node]))
  const parent = new Map()
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id)
  const where = (node) => `${node.callFrame.functionName || '(anon)'} ${node.callFrame.url.split('/').pop()}:${node.callFrame.lineNumber + 1}`
  const self = new Map(), total = new Map()
  profile.samples.forEach((id, at) => {
    const us = profile.timeDeltas[at] ?? 0
    self.set(where(byId.get(id)), (self.get(where(byId.get(id))) ?? 0) + us)
    const seen = new Set()
    for (let up = id; up; up = parent.get(up)) { const key = where(byId.get(up)); if (!seen.has(key)) (seen.add(key), total.set(key, (total.get(key) ?? 0) + us)) }
  })
  const top = (map, n) => [...map].filter(([k]) => !/^\((idle|program|root)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => `  ${(us / 1000).toFixed(1).padStart(7)}ms  ${k}`).join('\n')
  console.log(`--- self\n${top(self, 30)}\n--- inclusive\n${top(total, 70)}`)
}
const sets = {}
// QA_AB=<name>: every other open the old way (window.__qaOld = name, read by the app's own code while a change is measured), to compare in one run on a busy machine.
let turn = 0
const ab = async () => {
  if (!process.env.QA_AB) return ''
  const off = turn++ % 2 === 1
  await h.evaluate(([off, old]) => void (window.__qaOld = off ? old : undefined), [off, process.env.QA_AB])
  return off ? ` (old ${process.env.QA_AB})` : ''
}
const record = (set, got) => (sets[set] ??= []).push(got)
const idOf = (title) => h.evaluate((title) => [...document.querySelectorAll('[data-row][data-id]')].find((one) => one.textContent.includes(title))?.getAttribute('data-id'), title)
const openByClick = async (set, i) => {
  const title = titles[i]
  // The row brought into the list's view first, as a hand scrolls to it.
  await h.evaluate((title) => [...document.querySelectorAll('[data-row][data-id]')].find((one) => one.textContent.includes(title))?.scrollIntoView({ block: 'center' }), title)
  let row = h.locator('[data-row][data-id]').filter({ hasText: title }).first()
  for (const dir of [-1, 1]) for (let k = 0; k < 25 && !(await row.count()); k++) { await h.mouse.move(500, 500); await h.mouse.wheel(0, dir * 400); await wait(80) }
  await row.hover(); await wait(150)
  set += await ab()
  await arm({ title, words: `First${i} under` })
  await profiled(async () => { await row.click(); await wait(1600) })
  record(set, await h.evaluate(() => window.__openSpeed()))
}
const step = async (set, key, i) => {
  await h.mouse.move(900, 20)
  set += await ab()
  await arm({ title: titles[i], words: `First${i} under`, key: true })
  await h.keyboard.press(key)
  await wait(1600)
  record(set, await h.evaluate(() => window.__openSpeed()))
}
const pct = (list, q) => { const s = list.filter((x) => x !== undefined).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : '-' }

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false })
  // A plain list, newest first, so the rows sit in the order they were written.
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'newest', group: 'none', filter: {}, density: 'list' })))
  await go('home'); await wait(400)
  await go('articles'); await wait(2500)
  // Cold by click: 15 pages never opened here.
  for (let i = 0; i < 15; i++) await openByClick('click cold', i * 2)
  // Cold by ↓: from page 30 down 14 times, each a page not opened before.
  await openByClick('click cold', 30)
  for (let i = 31; i < 45; i++) await step('↓ cold', 'ArrowDown', i)
  // Warm by ↑: back up over the same pages.
  for (let i = 43; i >= 30; i--) await step('↑ warm', 'ArrowUp', i)
  // Warm by click: the first pages again.
  for (let i = 0; i < 15; i++) { profileNow = i === 3; await openByClick('click warm', i * 2) }
  await h.screenshot({ path: process.env.QA_SHOT ?? '/tmp/writing-open.png' }).catch(() => {})
  console.log(`book: ${PAGES} Writing pages (properties, 12 headings, a 4000x2600 photo, 3 link cards, about 2,100 words each), ${CAPTURES} captures`)
  console.log('set            n   title p50/p95   body p50/p95   picture p50/p95   ready p50/p95   (ms from the press)')
  for (const [set, got] of Object.entries(sets)) {
    const col = (k) => `${pct(got.map((one) => one[k]), 0.5)}/${pct(got.map((one) => one[k]), 0.95)}`.padEnd(16)
    console.log(`${set.padEnd(14)} ${String(got.length).padEnd(3)} ${col('title')}${col('body')} ${col('picture')}  ${col('ready')}`)
  }
  if (process.env.QA_RAW) console.log(JSON.stringify(sets))
  const all = Object.values(sets).flat()
  check('every open showed its words', all.every((one) => one.body !== undefined), `${all.filter((one) => one.body === undefined).length} missed`)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()

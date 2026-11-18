// "Join them" on two notes that say nearly the same (handover ask 1, 16 Nov: "they're both large files, i cliked join
// them and the app froze"). Run on a COPY of a book (QA_DATA), never the book itself: the copy's largest open note is
// copied under a new id first, so the two say the same, then the copy is opened, its offer's "Join them" pressed with a
// real pointer, and the join taken back with ⌘Z.
//
//   cp -cR <book> <copy> && npx electron-vite build --outDir out-x
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/join-big.mjs
//
// Checks: the copy holds both (its words, a rule, the other's), the other is in the Bin, the one loader shows, the
// notice says it with Undo, ⌘Z puts both rows back exactly (every column), no page errors; and prints the longest gap
// between two frames of the window from the press until the note is drawn again, and the longest frozen stretch.
//   SMALL=1   the largest open note under 3,000 characters instead: the meaning, on an ordinary note.
//   TYPED=1   a word typed at the end of the copy's first line first: kept as a document then, while the other may
//             still be the Markdown it came in as (the window reads that one for the join).
//   DARK=1    the join and its undo in the dark look.   FRAMES=<folder>  a frame every 50 ms through the join and the undo.
//   PROF=1    where the time went, from the press until the note is drawn again.
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync } from 'fs'
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
// SMALL: an ordinary note still kept as the Markdown it came in as (most of a book is), of a few hundred words: a short one of links and a tag has too few words to be said to repeat anything.
const SMALL = ` and substr(body, 1, 1) = '"' and length(body) between 1500 and 6000`
const big = db.prepare(`select * from captures where status = 'open' and kind = 'note' and body is not null and private = 0${process.env.SMALL ? SMALL : ''} order by length(body) desc limit 1`).get()
const twin = randomUUID()
// Every column as the note's own, its time too: a copy made a moment ago would be marked used the first time it is read
// past its first minute (captures.ts), which a probe's timing, not the join, would decide.
const cols = Object.keys(big).filter((one) => one !== 'id' && one !== 'number')
db.prepare(`insert into captures (id, ${cols.join(', ')}) values (?, ${cols.map(() => '?').join(', ')})`).run(twin, ...cols.map((one) => big[one]))
db.close()
const markdown = big.body.startsWith('"')
console.log(`twin of ${big.id.slice(0, 8)} (${Math.round(big.body.length / 1024)} KB, kept as ${markdown ? 'Markdown' : 'a document'}): ${twin.slice(0, 8)}  [${load()}]`)
// Read where the words lie, so nothing the probe asks writes anything (captures:get marks a note used).
const book = () => new DatabaseSync(file, { readOnly: true })
const rowsOf = () => { const one = book(); try { return Object.fromEntries([big.id, twin].map((id) => [id, one.prepare('select * from captures where id = ?').get(id)])) } finally { one.close() } }
// While waiting: only each one's status and how long its words are, never the megabytes themselves, every 50 ms.
const glance = () => { const one = book(); try { return Object.fromEntries([big.id, twin].map((id) => [id, one.prepare('select status, length(cast(body as blob)) as n from captures where id = ?').get(id)])) } finally { one.close() } }
const shots = process.env.FRAMES ?? null
if (shots) mkdirSync(shots, { recursive: true })

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, send } = c
const pane = `[data-open="${twin}"]`
try {
  if (process.env.DARK) await c.look('dark')
  await send('capture', twin)
  await h.waitForSelector(`${pane} .ProseMirror`, { timeout: 120_000 })
  if (process.env.TYPED) {
    // A word at the end of its first line, as a hand types it: the copy is kept as a document from then on.
    const first = await h.locator(`${pane} .ProseMirror > :first-child`).boundingBox()
    await h.mouse.click(first.x + first.width - 4, first.y + first.height / 2)
    await h.keyboard.press('Meta+ArrowRight')
    await h.keyboard.type(' again')
    const typed = Date.now()
    while (Date.now() - typed < 30_000 && rowsOf()[twin].body.startsWith('"')) await h.waitForTimeout(250)
    console.log(`typed: the copy is kept as ${rowsOf()[twin].body.startsWith('"') ? 'Markdown still' : 'a document'}`)
  }
  const offer = h.locator('[data-note-offer="same"] [data-offer-action="join"]')
  await offer.waitFor({ state: 'attached', timeout: 120_000 })
  // As the user was, at the note's end where the offer stands under the last line: taken there with ⌘↓ from its
  // first line, as a hand does (a long note draws its far blocks only as they come near). Then the button's middle,
  // read again until it stands still on the page with nothing over it: a box read once, as the note's blocks were
  // still being drawn, put the press on the words above the offer (18 Nov, the first run).
  if (!process.env.TYPED) {
    const first = await h.locator(`${pane} .ProseMirror > :first-child`).boundingBox()
    await h.mouse.click(first.x + 8, first.y + first.height / 2)
  }
  await h.keyboard.press('Meta+ArrowDown')
  const spot = () => offer.evaluate((one) => {
    one.scrollIntoView({ block: 'center' })
    const r = one.getBoundingClientRect()
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return r.top >= 0 && r.bottom <= innerHeight && hit && one.contains(hit) ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null
  }).catch(() => null)
  let box = null
  for (let tries = 0, was = null; tries < 240 && !box; tries++) {
    await h.waitForTimeout(400)
    const now = await spot()
    box = now && was && now.x === was.x && now.y === was.y ? now : null
    was = now
  }
  if (!box) throw new Error('the offer never stood still on the page')
  // Every frame's time, every frozen stretch, and the one loader where the offer was and where the note is.
  await h.evaluate(() => {
    window.__frames = []
    window.__long = []
    window.__seen = new PerformanceObserver((list) => list.getEntries().forEach((e) => window.__long.push([e.startTime, e.duration])))
    window.__seen.observe({ type: 'longtask' })
    const tick = (at) => (window.__frames.push(at), requestAnimationFrame(tick))
    requestAnimationFrame(tick)
    window.__orbs = { offer: null, note: null }
    // Looked for where each stands, never across the whole page: a note this size is a million elements.
    const slot = document.querySelector('[data-note-offer="same"]').parentElement
    const look = () => {
      window.__orbs.offer ??= slot.querySelector(':scope > [data-note-offer="joining"]') ? performance.now() : null
      window.__orbs.note ??= document.querySelector('[data-coming] [data-note-waiting]') ? performance.now() : null
      requestAnimationFrame(look)
    }
    requestAnimationFrame(look)
  })
  const before = rowsOf()
  // A frame every 50 ms while `until` is not met, each written as <phase>-<n>.png. MOMENTS=<folder> instead keeps one
  // frame as each state is first seen (the offer's loader, the note's loader, the note drawn): on a note this long a
  // frame every 50 ms is itself a full draw each time, and held the window for most of the first run (18 Nov).
  const moments = process.env.MOMENTS ?? null
  if (moments) mkdirSync(moments, { recursive: true })
  const stateOf = () => h.evaluate(() => (document.querySelector('[data-note-offer="joining"]') ? 'joining' : document.querySelector('[data-coming]') ? 'opening' : 'note')).catch(() => 'busy')
  const moment = (name) => (moments ? h.screenshot({ path: join(moments, `${name}.png`) }).catch(() => {}) : null)
  const film = async (phase, until) => {
    const started = Date.now()
    const seen = new Set()
    for (let n = 0; Date.now() - started < 180_000; n++) {
      if (await until()) return (await moment(`${phase}-drawn`), Date.now() - started)
      if (shots) await h.screenshot({ path: join(shots, `${phase}-${String(n).padStart(3, '0')}.png`) }).catch(() => {})
      else await h.waitForTimeout(50)
      const state = moments ? await stateOf() : null
      if (state && !seen.has(state)) (seen.add(state), await moment(`${phase}-${state}`))
    }
    return null
  }
  // Drawn again: an editor in the note's pane that was not there before the press, and no note on its way. (The one
  // before is kept by the probe, never marked: a mark on the editor's own element is a change ProseMirror reads.)
  const drawnAgain = () => h.evaluate((sel) => { const now = document.querySelector(`${sel} .ProseMirror`); return !!now && now !== window.__was && !document.querySelector('[data-coming]') }, pane).catch(() => false)
  const markOld = () => h.evaluate((sel) => void (window.__was = document.querySelector(`${sel} .ProseMirror`)), pane)
  const quiet = () => h.waitForFunction(() => { const last = window.__long.at(-1); return performance.now() - (last ? last[0] + last[1] : 0) > 1000 }, null, { timeout: 120_000, polling: 200 }).catch(() => console.log("(the window never had a quiet second in 2 minutes)"))
  const cdp = process.env.PROF ? await c.electron.context().newCDPSession(h) : null
  if (cdp) (await cdp.send('Profiler.enable'), await cdp.send('Profiler.setSamplingInterval', { interval: 500 }), await cdp.send('Profiler.start'))
  box = (await spot()) ?? box
  await moment('join-offer')
  await markOld()
  const t0 = await h.evaluate(() => performance.now())
  await h.mouse.click(box.x, box.y)
  const joined = await film('join', async () => glance()[big.id].status === 'discarded' && (await drawnAgain()))
  await quiet()
  const t1 = await h.evaluate(() => performance.now())
  if (cdp) {
    const { profile } = await cdp.send('Profiler.stop')
    const byId = new Map(profile.nodes.map((node) => [node.id, node]))
    const self = new Map()
    profile.samples.forEach((id, at) => {
      const node = byId.get(id)
      const key = `${node.callFrame.functionName || '(anon)'} ${node.callFrame.url.split('/').pop()}:${node.callFrame.lineNumber + 1}`
      self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[at] ?? 0))
    })
    console.log([...self].filter(([k]) => !/^\((idle|program|root)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, us]) => `  ${(us / 1000).toFixed(0).padStart(7)}ms  ${k}`).join('\n'))
  }
  const gaps = (from, to) => h.evaluate(([a, b]) => {
    const frames = window.__frames.filter((at) => at >= a && at <= b)
    let gap = 0
    for (let i = 1; i < frames.length; i++) gap = Math.max(gap, frames[i] - frames[i - 1])
    const long = window.__long.filter(([at]) => at >= a && at <= b)
    return { gap: Math.round(gap), longest: Math.round(Math.max(0, ...long.map(([, d]) => d))), total: Math.round(long.reduce((sum, [, d]) => sum + d, 0)), frames: frames.length }
  }, [from, to])
  const after = rowsOf()
  const kept = after[twin].body
  const wanted = (() => {
    const a = JSON.parse(before[twin].body)
    const b = JSON.parse(before[big.id].body)
    if (typeof a === 'string' && typeof b === 'string') return { text: JSON.stringify(`${a.trimEnd()}\n\n---\n\n${b.trimStart()}`) }
    if (typeof a === 'string' || typeof b === 'string') return { blocks: null }
    // Its own blocks without the empty lines it ends on, the rule, then the other's.
    let own = a.content.length
    while (own && a.content[own - 1].type === 'paragraph' && !a.content[own - 1].content?.length) own--
    return { blocks: own + 1 + b.content.length }
  })()
  const read = JSON.parse(kept)
  const holds = wanted.text ? kept === wanted.text : typeof read === 'object' && (wanted.blocks === null || read.content.length === wanted.blocks) && read.content.some((one) => one.type === 'horizontalRule')
  const j = await gaps(t0, t1)
  const orbs = await h.evaluate((at) => ({ offer: window.__orbs.offer === null ? null : Math.round(window.__orbs.offer - at), note: window.__orbs.note === null ? null : Math.round(window.__orbs.note - at) }), t0)
  const said = await h.locator('[data-toast], [role="status"]').allInnerTexts().catch(() => [])
  console.log(`join: done and drawn again after ${joined ?? 'never'} ms; longest gap between frames ${j.gap} ms (${j.frames} frames), frozen ${j.longest} ms at most, ${j.total} ms in all; the loader in the offer at ${orbs.offer} ms, in the note at ${orbs.note} ms  [${load()}]`)
  console.log(`  kept: ${typeof read === 'string' ? `Markdown, ${kept.length} characters` : `${read.content.length} blocks`}; notice: ${JSON.stringify(said.join(' | ').slice(0, 160))}`)
  check('the copy holds both: its words, a rule, then the other\'s', holds, typeof read === 'string' ? `${kept.length} vs ${wanted.text?.length}` : `${read.content?.length} blocks, wanted ${wanted.blocks}`)
  check('the other note is in the Bin', after[big.id].status === 'discarded', after[big.id].status)
  check('the one loader shows where the offer was', orbs.offer !== null, JSON.stringify(orbs))
  check('the notice says they were joined and where the other went, with Undo', said.some((one) => /^Joined .* into this note, and moved it to the Bin/.test(one) && /Undo/.test(one)), said.join(' | '))
  check('no frame waits over 1 s from the press until the note is drawn again', j.gap <= 1000, `${j.gap} ms`)

  // ⌘Z: both rows exactly as they were, while the notice still offers it. (MOMENTS: the note as it is then, in the
  // other look, after.)
  await markOld()
  const t2 = await h.evaluate(() => performance.now())
  await h.keyboard.press('Meta+z')
  const undone = await film('undo', async () => { const now = glance(); return now[big.id].status === before[big.id].status && now[twin].n === Buffer.byteLength(before[twin].body) && (await drawnAgain()) })
  await quiet()
  const t3 = await h.evaluate(() => performance.now())
  const back = rowsOf()
  const differ = [big.id, twin].flatMap((id) => Object.keys(before[id]).filter((name) => before[id][name] !== back[id][name]).map((name) => `${id === twin ? 'copy' : 'other'}.${name}`))
  const u = await gaps(t2, t3)
  if (moments) (await c.look(process.env.DARK ? 'light' : 'dark'), await moment('undo-other-look'))
  console.log(`undo: both back and drawn again after ${undone ?? 'never'} ms; longest gap between frames ${u.gap} ms, frozen ${u.longest} ms at most; columns not as they were: ${differ.join(', ') || 'none'}  [${load()}]`)
  check('⌘Z puts both notes back exactly as they were, every column', undone !== null && !differ.length, differ.join(', '))
  check('the note shows its own words again after ⌘Z', await drawnAgain())
  check('no frame waits over 1 s while it is taken back', u.gap <= 1000, `${u.gap} ms`)
  // What the page threw (HW1's run threw "Invalid collection of marks for node text: bold,code"), apart from the book's
  // own pictures and files that a copy of it may lack (a missing file is said by the console, and is not the join's).
  const thrown = c.errors.filter((one) => !/^Failed to load resource/.test(one))
  if (thrown.length < c.errors.length) console.log(`  (the console also said ${c.errors.length - thrown.length} times that a file of the book was not found)`)
  check('no page errors', !thrown.length, thrown.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()

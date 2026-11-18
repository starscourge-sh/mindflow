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
//   SMALL=1   a note of three short paragraphs and its twin instead: the meaning, on an ordinary note.
//   TYPED=1   a word typed at the end of the copy's first line first: kept as a document then, while the other may
//             still be the Markdown it came in as (the window reads that one for the join).
//   DARK=1    the join and its undo in the dark look.   FRAMES=<folder>  a frame every 50 ms through the join and the undo;
//             MOMENTS=<folder>  one frame as each state is first seen, and the end in the other look.
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
// SMALL: an ordinary note of three short paragraphs, written a day ago, put in the book first. (A small note of the
// book's own was no use: those old enough are put away as the book opens, and a note put away is not offered.)
// The last line is the one the copy lacks: in words the note has already, so the two still read as nearly the same
// (85% of their root words shared both ways, main/roots.ts).
const paragraphs = ['Feed the sourdough starter twice a day at room temperature.', 'It is ready when it doubles and smells sour and sweet.', 'Weigh the flour, cups lie. Bake it in a lidded pot, hot.', 'Feed it, then weigh the flour.']
const small = () => {
  const id = randomUUID()
  const body = JSON.stringify({ type: 'doc', content: [...paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })), { type: 'paragraph' }] })
  db.prepare("insert into captures (id, title, kind, status, body, captured_at) values (?, '', 'note', 'open', ?, ?)").run(id, body, new Date(Date.now() - 86_400_000).toISOString())
  return db.prepare('select * from captures where id = ?').get(id)
}
const big = process.env.SMALL ? small() : db.prepare("select * from captures where status = 'open' and kind = 'note' and body is not null and private = 0 order by length(body) desc limit 1").get()
const twin = randomUUID()
// Every column as the note's own, its time too: a copy made a moment ago would be marked used the first time it is read
// past its first minute (captures.ts), which a probe's timing, not the join, would decide. Nearly the same, as the two
// the offer finds: the copy lacks some lines of the other's (12 paragraphs spread through a long note, its last line in
// a short one) and has one of its own.
const cols = Object.keys(big).filter((one) => one !== 'id' && one !== 'number')
const theirs = JSON.parse(big.body)
const words = (node) => node.text ?? (node.content ?? []).map(words).join('')
const said = theirs.content.flatMap((block, at) => (block.type === 'paragraph' && words(block).trim().length > 20 ? [at] : []))
const gone = new Set(process.env.SMALL ? [said.at(-1)] : Array.from({ length: 12 }, (_, n) => said[Math.floor(((n + 0.5) * said.length) / 12)]))
const own = process.env.SMALL ? [] : [{ type: 'paragraph', content: [{ type: 'text', text: 'A line only the copy has, written after.' }] }]
const mine = { ...theirs, content: [...theirs.content.filter((_, at) => !gone.has(at)), ...own] }
db.prepare(`insert into captures (id, ${cols.join(', ')}) values (?, ${cols.map(() => '?').join(', ')})`).run(twin, ...cols.map((one) => (one === 'body' ? JSON.stringify(mine) : big[one])))
// And a note elsewhere that links to the other: after the join its link leads to the copy, after ⌘Z back again.
const linker = randomUUID()
db.prepare("insert into captures (id, title, kind, status, body, captured_at) values (?, '', 'note', 'open', ?, ?)").run(linker, JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'See ' }, { type: 'noteLink', attrs: { id: big.id, label: 'the other' } }] }] }), new Date(Date.now() - 86_400_000).toISOString())
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
  // What the editor holds and has not saved (its own tidying of the words as they opened, too) saved first, as the join
  // itself does first, so the rows read here are what the join is made of and what Undo must put back: read once the
  // copy's stored words have stood still for a moment.
  await h.evaluate(() => window.dispatchEvent(new Event('haligtree:flush')))
  for (let was = -1, n = 0; n < 30; n++) {
    await h.waitForTimeout(300)
    const now = glance()[twin].n
    if (now === was) break
    was = now
  }
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
  // Until the note is drawn again (the window's own work after that, reading offers for it, counts as the note open).
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
  // Read at once and light (the database counts the blocks), with the notice and the frames: ⌘Z is pressed while the
  // notice still offers it, as a hand would, not after seconds of the probe's own reading (it had gone, 18 Nov).
  const look = () => { const one = book(); try { return { other: one.prepare('select status from captures where id = ?').get(big.id).status, kept: one.prepare("select json_type(body) as type, case when json_type(body) = 'object' then json_array_length(body, '$.content') end as blocks, instr(body, '\"horizontalRule\"') > 0 as rule, length(body) as n from captures where id = ?").get(twin), link: one.prepare('select instr(body, ?) > 0 as here, instr(body, ?) > 0 as there from captures where id = ?').get(`"id":"${twin}"`, `"id":"${big.id}"`, linker) } } finally { one.close() } }
  const after = look()
  const j = await gaps(t0, t1)
  const orbs = await h.evaluate((at) => ({ offer: window.__orbs.offer === null ? null : Math.round(window.__orbs.offer - at), note: window.__orbs.note === null ? null : Math.round(window.__orbs.note - at) }), t0)
  const said = await h.locator('[data-toast], [role="status"]').allInnerTexts().catch(() => [])

  // ⌘Z: both rows exactly as they were. (MOMENTS: the note as it is then, in the other look, after.)
  await markOld()
  const t2 = await h.evaluate(() => performance.now())
  await h.keyboard.press('Meta+z')
  const undone = await film('undo', async () => { const now = glance(); return now[big.id].status === before[big.id].status && now[twin].n === Buffer.byteLength(before[twin].body) && (await drawnAgain()) })
  await quiet()
  const t3 = await h.evaluate(() => performance.now())
  const back = rowsOf()
  // What the join was made of: the copy as Undo put it back (as stored at the press, its typing saved first), and the other.
  // The copy whole, then a rule and only the other's blocks whose words it held nowhere (matched as the join matches
  // them: by their words, or a block with none by itself), in their order.
  const blockWords = (node) => node.text ?? (node.content ?? []).map(blockWords).join(node.content?.some((one) => one.text !== undefined) ? '' : '\n')
  const keyOf = (block) => { const w = blockWords(block).trim(); return w ? `w:${w}` : `b:${JSON.stringify({ ...block, attrs: { ...block.attrs, blockId: undefined } })}` }
  const wanted = (() => {
    const a = JSON.parse(back[twin].body)
    const b = JSON.parse(back[big.id].body)
    if (typeof a === 'string' || typeof b === 'string') return { blocks: null, fresh: null }
    let own = a.content.length
    while (own && a.content[own - 1].type === 'paragraph' && !a.content[own - 1].content?.length) own--
    const held = new Set(a.content.slice(0, own).map(keyOf))
    const fresh = b.content.filter((block) => !(block.type === 'paragraph' && !blockWords(block).trim()) && !held.has(keyOf(block))).length
    return { blocks: fresh ? own + 1 + fresh : a.content.length, fresh }
  })()
  const kept = after.kept
  console.log(`join: done and drawn again after ${joined ?? 'never'} ms; longest gap between frames ${j.gap} ms (${j.frames} frames), frozen ${j.longest} ms at most, ${j.total} ms in all; the loader in the offer at ${orbs.offer} ms, in the note at ${orbs.note} ms`)
  console.log(`  kept: ${kept.type === 'object' ? `${kept.blocks} blocks` : `Markdown, ${kept.n} characters`} (wanted ${wanted.blocks}: ${wanted.fresh} of the other's that the copy lacked); notice: ${JSON.stringify(said.join(' | ').slice(0, 200))}`)
  check('the copy stays whole and gains only the lines it lacked, under a rule', kept.type === 'object' && kept.blocks === wanted.blocks && !!kept.rule === !!wanted.fresh, `${kept.blocks ?? kept.n}, wanted ${wanted.blocks}`)
  check('the other note is in the Bin', after.other === 'discarded', after.other)
  check('a link elsewhere to the other leads to the copy now', !!after.link.here && !after.link.there, JSON.stringify(after.link))
  check('the one loader shows where the offer was', orbs.offer !== null, JSON.stringify(orbs))
  check('the notice says what came over and where the other went, with Undo', said.some((one) => new RegExp(`^Joined .*: ${wanted.fresh === 1 ? '1 line' : `${(wanted.fresh ?? 0).toLocaleString('en')} lines`} it had that this note didn't\\. .* is in the Bin`).test(one) && /Undo/.test(one)), said.join(' | '))
  check('no frame waits over 1 s from the press until the note is drawn again', j.gap <= 1000, `${j.gap} ms`)
  const differ = [big.id, twin].flatMap((id) => Object.keys(before[id]).filter((name) => before[id][name] !== back[id][name]).map((name) => `${id === twin ? 'copy' : 'other'}.${name}`))
  const u = await gaps(t2, t3)
  if (moments) (await c.look(process.env.DARK ? 'light' : 'dark'), await moment('undo-other-look'))
  console.log(`undo: both back and drawn again after ${undone ?? 'never'} ms; longest gap between frames ${u.gap} ms, frozen ${u.longest} ms at most; columns not as they were: ${differ.join(', ') || 'none'}  [${load()}]`)
  check('⌘Z puts both notes back exactly as they were, every column', undone !== null && !differ.length, differ.join(', '))
  check('the note shows its own words again after ⌘Z', await drawnAgain())
  const backLink = look().link
  check('⌘Z leads the link elsewhere back to the other', !!backLink.there && !backLink.here, JSON.stringify(backLink))
  check('no frame waits over 1 s while it is taken back', u.gap <= 1000, `${u.gap} ms`)
  // The same open with no join at all: the other note's row pressed with a real pointer, timed the same way. Where the
  // two match, the reopen is the general cost of opening a long note (queued apart, ask 5), not the join's.
  if (!process.env.SMALL) {
    const row = h.locator(`[data-id="${big.id}"]`).first()
    await row.scrollIntoViewIfNeeded({ timeout: 30_000 }).catch(() => {})
    const t4 = await h.evaluate(() => performance.now())
    await row.click({ timeout: 30_000 })
    await h.waitForSelector(`[data-open="${big.id}"] .ProseMirror`, { timeout: 120_000 }).catch(() => {})
    const t5 = await h.evaluate(() => performance.now())
    const o = await gaps(t4, t5 + 50)
    console.log(`open from its row (the other, the same note, no join): drawn after ${Math.round(t5 - t4)} ms; longest gap between frames ${o.gap} ms, frozen ${o.longest} ms at most  [${load()}]`)
  }
  // What the page threw (HW1's run threw "Invalid collection of marks for node text: bold,code"), apart from the book's
  // own pictures and files that a copy of it may lack (a missing file is said by the console, and is not the join's).
  const thrown = c.errors.filter((one) => !/^Failed to load resource/.test(one))
  if (thrown.length < c.errors.length) console.log(`  (the console also said ${c.errors.length - thrown.length} times that a file of the book was not found)`)
  check('no page errors', !thrown.length, thrown.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()

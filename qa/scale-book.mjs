// Built for scale (item 52), the whole app: a book with 10,000 notes, 2,000
// tasks, 5,000 log lines, 3,000 glosses and 500 tags, and every page still
// opens, scrolls and searches quickly, drawing only what is on screen.
//   - The tasks go in through the app; the rest is written straight into the
//     sandbox's file while the app is shut, the way an import leaves it, then
//     the app is opened again on it (which is the "app start" measure).
//   - Each page: how long until it has finished drawing, how many elements it
//     drew (a list that draws all 10,000 rows has tens of thousands), and for
//     the long ones, what a fast scroll adds to each frame.
//   - Search as you type, in ⌘K and in a list's search, and switching pages.
// Each measure has a limit that fails the probe.
//
//   npx electron-vite build --outDir out-scale
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-scale/main/index.js MINDFLOW_QA_AWAY=1 node qa/scale-book.mjs
// PAGES=all,inbox,... runs only those pages; KEEP=1 keeps the data folder's book for a second run (skips seeding when it is there).
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
import { mkdirSync } from 'fs'

const { check, done } = checks()
const DATA = process.env.QA_DATA
if (!DATA) throw new Error('QA_DATA is needed: the book is written into it between two runs')
const FILE = join(DATA, 'sandbox', 'mindflow.db')
// SHOTS=<folder>: a picture of each page and thing as it opened.
const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const shot = (h, name) => SHOTS && h.screenshot({ path: join(SHOTS, `${name.replace(/[^a-z0-9]+/gi, '-')}.png`) }).catch(() => {})

// Limits, in ms or elements.
const START = 6000 // launch to Home drawn, with the big book
const OPEN = 1500 // a page shown and finished drawing
const SWITCH = 1200 // from one page straight to another
const ELEMENTS = 9000 // elements a page draws at most: a list drawing every row has far more
const FRAME = 50 // what a fast scroll adds to a frame (median), over the window's own pace
const TYPED = 400 // a key typed to its results drawn, the slowest key
const BUSY = 250 // the longest frame while typing

const N = { captures: 6000, gems: 2500, writing: 1500, tasks: 2000, ticks: 3000, sessions: 20, lines: 100, glosses: 3000, tags: 500, practices: 40 }
const word = (i) => ['river', 'lamp', 'orchard', 'quill', 'harbour', 'meadow', 'lantern', 'ember', 'thistle', 'willow'][i % 10]
const tag = (i) => `topic${i % N.tags}`
const doc = (text, link) => JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }, ...(link ? [{ type: 'text', text: ' see ' }, { type: 'noteLink', attrs: { id: link, label: 'a note' } }] : [])] }] })
const DAY = 86400000
const ago = (days) => new Date(Date.now() - days * DAY).toISOString()

async function seedTasks() {
  const c = await sandbox({ width: 1400, height: 900 })
  try {
    await c.v('settings:set', { hintRate: 0 })
    await c.v('onboarding:set', { pageHints: false })
    const made = Date.now()
    for (let i = 0; i < N.tasks; i += 50)
      await Promise.all(Array.from({ length: 50 }, (_, n) => c.v('task:add', `Scale task ${i + n + 1} ${word(i + n)}${i + n < 300 ? ' today' : ''}`, undefined, i + n < 300)))
    await c.v('task:add', 'Stretch every day')
    console.log(`made ${N.tasks} tasks in ${Math.round((Date.now() - made) / 1000)}s`)
  } finally {
    await c.close()
  }
}

function seedRest() {
  const db = new DatabaseSync(FILE)
  const made = Date.now()
  db.exec('begin')
  let number = db.prepare('select coalesce(max(number), 0) as n from captures').get().n
  const addCapture = db.prepare('insert into captures (id, number, title, kind, status, body, captured_at, archived_at) values (?, ?, ?, ?, ?, ?, ?, ?)')
  const ids = []
  for (let i = 0; i < N.captures; i++) {
    const id = randomUUID()
    ids.push(id)
    // 2,000 in the Inbox, 300 archived, 400 in the Bin, the rest kept; over five years.
    const status = i < 2000 ? 'open' : i < 2300 ? 'open' : i < 2700 ? 'discarded' : 'resolved'
    const link = i > 10 && i % 4 === 0 ? ids[(i * 7) % (i - 1)] : null
    addCapture.run(id, ++number, '', i % 9 === 0 ? 'quote' : 'note', status, doc(`Scale note ${i + 1} about the ${word(i)} #${tag(i)} #${tag(i * 3 + 1)}${i % 3 === 0 ? ' #scaletag' : ''}`, link), ago((i * 1826) / N.captures), i >= 2000 && i < 2300 ? ago(1) : null)
  }
  const addGem = db.prepare("insert into nuggets (id, tier, kind, title, body, created_at, updated_at, prompt) values (?, ?, 'note', ?, ?, ?, ?, ?)")
  const gems = []
  for (let i = 0; i < N.gems + N.writing; i++) {
    const id = randomUUID()
    const gem = i < N.gems
    if (gem) gems.push(id)
    const at = ago((i * 1826) / (N.gems + N.writing))
    // A thousand gems ask a question, so Review has a long queue to work out.
    addGem.run(id, gem ? 'nugget' : 'article', gem ? '' : `Scale writing ${i + 1 - N.gems} on the ${word(i)}`, doc(`${gem ? 'Scale gem' : 'Scale draft'} ${i + 1} on the ${word(i)} #${tag(i + 7)}`, i % 5 === 0 ? ids[i % ids.length] : null), at, at, gem && i < 1000 ? `What about the ${word(i)} ${i + 1}?` : null)
  }
  // Five years of reviews, for Stats and Review's own history.
  const addReview = db.prepare('insert into review_log (item_id, grade, reviewed_at, ms, first) values (?, 3, ?, 4000, 0)')
  for (let i = 0; i < 4000; i++) addReview.run(gems[i % 1000], ago((i * 1826) / 4000))
  const addGloss = db.prepare('insert into glosses (id, item_id, body, created_at) values (?, ?, ?, ?)')
  // 500 on the first gem, the rest spread.
  for (let i = 0; i < N.glosses; i++) addGloss.run(randomUUID(), i < 500 ? gems[0] : gems[i % gems.length], `Scale gloss ${i + 1}: the ${word(i)} again`, ago((N.glosses - i) / 3))
  // The tracker: 3,000 ticks on a routine, and 20 sessions of 100 lines each on one task.
  const routine = db.prepare("select id from tasks where title like 'Stretch%'").get().id
  const addTick = db.prepare('insert into task_done (task_id, done_at) values (?, ?)')
  for (let i = 0; i < N.ticks; i++) addTick.run(routine, ago(N.ticks - i))
  const worked = db.prepare("select id from tasks where title = 'Scale task 1 river'").get()?.id ?? routine
  const addSession = db.prepare("insert into sessions (id, task_id, started_at, ended_at, recap, kind) values (?, ?, ?, ?, '', 'focus')")
  const addLine = db.prepare('insert into session_log (id, session_id, at, text) values (?, ?, ?, ?)')
  for (let s = 0; s < N.sessions; s++) {
    const id = randomUUID()
    const start = Date.now() - (N.sessions - s) * DAY
    addSession.run(id, worked, new Date(start).toISOString(), new Date(start + 3600000).toISOString())
    for (let l = 0; l < N.lines; l++) addLine.run(randomUUID(), id, new Date(start + l * 30000).toISOString(), `Scale thought ${s * N.lines + l + 1}`)
  }
  // Done tasks over the years, for Stats.
  db.prepare("update tasks set status = 'done', completed_at = datetime('now', '-' || (number % 1800) || ' days') where title like 'Scale task %' and number % 5 = 0").run()
  const addPractice = db.prepare('insert into practices (id, name, created_at) values (?, ?, ?)')
  for (let i = 0; i < N.practices; i++) addPractice.run(randomUUID(), `Scale practice ${i + 1}`, ago(i))
  db.exec('commit')
  const count = (sql) => db.prepare(sql).get().n
  const said = {
    notes: count('select (select count(*) from captures) + (select count(*) from nuggets) as n'),
    tasks: count('select count(*) as n from tasks'),
    lines: count('select (select count(*) from task_done) + (select count(*) from session_log) as n'),
    glosses: count('select count(*) as n from glosses')
  }
  db.close()
  console.log(`wrote the book in ${Math.round((Date.now() - made) / 1000)}s: ${JSON.stringify(said)}`)
  return said
}

// --- Measures, run in the window.
// Until the page has finished drawing: the later of its last busy frame (one
// over 50ms) and the last time a batch of rows came in (25 or more elements
// at once), once 700ms pass with neither. A hint typing itself in, a number
// rolling or a dot fading is the page alive, not the page still drawing.
const settle = (h, page, t0Key) => h.evaluate(([page, t0Key]) => new Promise((resolve) => {
  const t0 = window[t0Key] ?? performance.now()
  let found = null
  let rows = t0
  let busy = t0
  let quiet = performance.now()
  const here = () => document.querySelector(`[data-page="${page}"]`)
  const observer = new MutationObserver((list) => {
    if (!here()) return
    const now = performance.now()
    found ??= now
    let added = 0
    for (const one of list) for (const node of one.addedNodes) if (node.nodeType === 1) added += 1 + node.querySelectorAll('*').length
    if (added >= 25) (rows = now, (quiet = now))
  })
  observer.observe(document.body, { childList: true, subtree: true })
  const frames = new PerformanceObserver((list) => {
    for (const one of list.getEntries()) if (one.duration >= 50 && one.startTime + one.duration > t0) (busy = Math.max(busy, one.startTime + one.duration), (quiet = performance.now()))
  })
  try { frames.observe({ type: 'long-animation-frame', buffered: true }) } catch {}
  const end = performance.now() + 12000
  const tick = () => {
    const now = performance.now()
    if (!found && here()) found = now
    if ((found && now - quiet > 700) || now > end) {
      observer.disconnect()
      frames.disconnect()
      const root = here()
      resolve({ ms: Math.round(Math.max(found ?? now, rows, busy) - t0), elements: root ? root.querySelectorAll('*').length : -1, timedOut: now > end })
    } else requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}), [page, t0Key])

const scroll = (h, page) => h.evaluate(async (page) => {
  const root = document.querySelector(`[data-page="${page}"]`)
  const box = root && [root, ...root.querySelectorAll('*')].filter((el) => el.scrollHeight > el.clientHeight + 1500 && /auto|scroll/.test(getComputedStyle(el).overflowY)).sort((a, b) => b.scrollHeight - a.scrollHeight)[0]
  if (!box) return null
  const pace = async (step) => {
    const gaps = []
    let last = performance.now()
    for (let i = 0; i < 40; i++) {
      step()
      await new Promise((go) => requestAnimationFrame(go))
      const now = performance.now()
      gaps.push(now - last)
      last = now
    }
    gaps.sort((a, b) => a - b)
    return gaps
  }
  const idle = await pace(() => {})
  const gaps = await pace(() => (box.scrollTop += 120))
  box.scrollTop = 0
  return { median: Math.round(gaps[20]), worst: Math.round(gaps.at(-1)), idle: Math.round(idle[20]), height: box.scrollHeight }
}, page)

// Typed key by key: each key to the frame its results changed in, and the longest frame meanwhile.
const typeTimed = async (h, text, results) => {
  await h.evaluate(() => {
    window.__frames = []
    window.__loaf = new PerformanceObserver((list) => { for (const one of list.getEntries()) window.__frames.push(Math.round(one.duration)) })
    try { window.__loaf.observe({ type: 'long-animation-frame', buffered: false }) } catch {}
  })
  const keys = []
  for (const ch of text) {
    // Watched where the results are: the last change to their words before 300ms of quiet is when they were drawn.
    await h.evaluate((results) => {
      const box = document.querySelector(results)?.closest('[role="dialog"], [data-page]') ?? document.body
      // Only the results' own words count: a hint typing itself in, or a row fading in, is not the search.
      const words = () => [...document.querySelectorAll(results)].map((one) => one.textContent).join('|')
      window.__typed = { t0: performance.now(), last: performance.now(), on: document.activeElement, was: words() }
      window.__typed.observer = new MutationObserver(() => {
        const now = words()
        if (now !== window.__typed.was) (window.__typed.was = now, (window.__typed.last = performance.now()))
      })
      window.__typed.observer.observe(box, { childList: true, subtree: true, characterData: true })
    }, results)
    await h.keyboard.press(ch === ' ' ? 'Space' : ch)
    const took = await h.evaluate(() => new Promise((resolve) => {
      const tick = () => {
        const typed = window.__typed
        if (performance.now() - typed.last > 300) (typed.observer.disconnect(), resolve({ ms: Math.round(typed.last - typed.t0), kept: document.activeElement === typed.on }))
        else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }))
    if (!took.kept) console.log(`  the keys left the box after “${ch}”: now on`, await h.evaluate(() => document.activeElement?.outerHTML.slice(0, 160)))
    keys.push(took.ms)
    await h.waitForTimeout(60)
  }
  const frames = await h.evaluate(() => (window.__loaf.disconnect(), window.__frames))
  return { keys, worst: Math.max(...keys), frame: Math.max(0, ...frames) }
}

try {
  let said = null
  if (!(process.env.KEEP && existsSync(FILE) && new DatabaseSync(FILE).prepare("select count(*) as n from nuggets where title like 'Scale writing%'").get().n)) {
    await seedTasks()
    said = seedRest()
    check('the book has 10,000 notes, 2,000 tasks, 5,000 log lines and 3,000 glosses', said.notes >= 10000 && said.tasks >= 2000 && said.lines >= 5000 && said.glosses >= 3000, JSON.stringify(said))
  }
  // App start, on the big book: launch to Home drawn.
  const t0 = Date.now()
  const c = await sandbox({ width: 1400, height: 900 })
  const { h } = c
  await h.waitForSelector('[data-page="home"]', { timeout: 30000 })
  const started = Date.now() - t0
  check(`the app starts on the big book under ${START} ms`, started < START, `${started} ms`)
  try {
    await h.waitForTimeout(2500)
    const PAGES = [
      // [view, what counts as the long list there, whether it scrolls a long list]
      ['all', true], ['inbox', true], ['articles', true], ['nuggets', true], ['discarded', true], ['archived', true],
      ['tags', true], ['review', false], ['map', false], ['stats', false], ['practices', false], ['today', true], ['later', true],
      ['calendar', false], ['week', false], ['upcoming', true], ['matrix', false], ['routines', false], ['day', false], ['home', false], ['sources', false], ['questions', false], ['goals', false], ['queue', false]
    ].filter(([id]) => !process.env.PAGES || process.env.PAGES.split(',').includes(id))
    const open = async (id) => {
      await h.evaluate(() => (window.__t0 = performance.now()))
      await c.send('view', id)
      return settle(h, id, '__t0')
    }
    for (const [id, long] of PAGES) {
      await c.go(id === 'home' ? 'inbox' : 'home')
      await h.waitForTimeout(600)
      const shown = await open(id)
      check(`${id}: opens and finishes drawing under ${OPEN} ms`, shown.ms < OPEN && !shown.timedOut, `${shown.ms} ms${shown.timedOut ? ', never settled' : ''}`)
      check(`${id}: draws under ${ELEMENTS} elements`, shown.elements > 0 && shown.elements < ELEMENTS, `${shown.elements}`)
      await shot(h, id)
      if (long) {
        const frames = await scroll(h, id)
        // Nothing long enough to scroll is fine: the list is capped or short.
        check(`${id}: a fast scroll adds under ${FRAME} ms a frame`, frames ? frames.median - frames.idle < FRAME : shown.elements < ELEMENTS, frames ? JSON.stringify(frames) : 'nothing long to scroll')
      }
    }
    // One thing with a long history: a gem with 500 glosses, a routine with
    // 3,000 ticks, a task with 2,000 lines of session log, a tag with 2,000 notes.
    const book = new DatabaseSync(FILE, { readOnly: true })
    const one = (sql) => book.prepare(sql).get()?.id
    const things = [
      ['gem with 500 glosses', 'nugget', one('select item_id as id from glosses group by item_id order by count(*) desc limit 1'), 'nuggets'],
      ['routine with 3,000 ticks', 'task', one("select id from tasks where title like 'Stretch%'"), 'today'],
      ['task with 2,000 log lines', 'task', one('select task_id as id from sessions group by task_id order by count(*) desc limit 1'), 'today'],
      ['tag with 2,000 notes', 'tag', 'scaletag', 'tags']
    ].filter(([, , , page]) => !process.env.PAGES || process.env.PAGES.split(',').includes(page))
    book.close()
    for (const [name, type, id, page] of things) {
      await c.go('home')
      await h.waitForTimeout(600)
      await h.evaluate(() => (window.__t0 = performance.now()))
      await c.send(type, id)
      const shown = await settle(h, page, '__t0')
      check(`${name}: opens and finishes drawing under ${OPEN} ms`, shown.ms < OPEN && !shown.timedOut, `${shown.ms} ms`)
      check(`${name}: draws under ${ELEMENTS} elements`, shown.elements > 0 && shown.elements < ELEMENTS, `${shown.elements}`)
      await shot(h, name)
      const frames = await scroll(h, page)
      if (frames) check(`${name}: a fast scroll adds under ${FRAME} ms a frame`, frames.median - frames.idle < FRAME, JSON.stringify(frames))
      // A gem's thoughts, opened above its composer: the newest twenty, not all 500.
      if (type === 'nugget') {
        await h.locator('[data-composer] button[aria-label="Thoughts so far"]').first().click({ timeout: 5000 }).catch(() => {})
        await h.waitForTimeout(500)
        const listed = await h.locator('ol[aria-label="Thoughts so far"] > li').count()
        check(`${name}: its thoughts open on the newest twenty and “Show more”`, listed > 0 && listed <= 21, `${listed} lines`)
        await shot(h, `${name} thoughts`)
      }
      // Everything it holds, asked for: "Show N more" pressed until it is all there.
      for (let i = 0; i < 3; i++) {
        const more = h.locator(`[data-page="${page}"] button`, { hasText: /^Show [\d,]+ more/ }).first()
        if (!(await more.count())) break
        const label = (await more.innerText()).trim()
        await h.evaluate(() => (window.__t1 = performance.now()))
        if (!(await more.click({ timeout: 5000 }).then(() => true, () => false))) { check(`${name}: “${label}” can be pressed`, false); break }
        const grown = await settle(h, page, '__t1')
        check(`${name}: “${label}” draws under ${OPEN} ms and ${ELEMENTS} elements`, grown.ms < OPEN && grown.elements < ELEMENTS, `${grown.ms} ms, ${grown.elements} elements`)
      }
    }
    // Switching pages straight from one to another, as G and a letter does.
    const route = ['all', 'today', 'nuggets', 'inbox', 'tags', 'articles', 'calendar', 'all'].filter((id) => PAGES.some(([one]) => one === id))
    for (let i = 1; i < route.length; i++) {
      const shown = await open(route[i])
      check(`switch ${route[i - 1]} to ${route[i]} under ${SWITCH} ms`, shown.ms < SWITCH, `${shown.ms} ms`)
    }
    if (!process.env.PAGES || process.env.PAGES.includes('search')) {
      // ⌘K, typed key by key.
      await c.go('home')
      await h.keyboard.press('Meta+k')
      await h.waitForSelector('[cmdk-input], [role=combobox], input[placeholder]', { timeout: 5000 })
      await h.waitForTimeout(400)
      const RESULTS = '[role="dialog"][aria-label="Search"] [data-row]'
      const palette = await typeTimed(h, 'orchard 12', RESULTS)
      check(`⌘K: each key's results drawn under ${TYPED} ms`, palette.worst < TYPED, JSON.stringify(palette.keys))
      check(`⌘K: no frame over ${BUSY} ms while typing`, palette.frame < BUSY, `${palette.frame} ms`)
      const rows = await h.locator(RESULTS).count()
      check('⌘K: draws a short list of results, not thousands', rows > 0 && rows < 200, `${rows}`)
      // A slip of the keys: nothing as typed, so the closest words are looked for.
      await h.keyboard.press('Meta+a')
      await h.keyboard.press('Backspace')
      await h.waitForTimeout(500)
      const slip = await typeTimed(h, 'lanterm', RESULTS)
      check(`⌘K, a misspelt word: each key's results drawn under ${TYPED} ms`, slip.worst < TYPED, JSON.stringify(slip.keys))
      await h.keyboard.press('Escape')
      await h.waitForTimeout(400)
      // A list's own search: Everything's, spread over the page.
      await c.go('all')
      await h.waitForTimeout(800)
      // Spread over the page, where the list has its own search (it may be already).
      const spread = h.locator('[data-page="all"] button[aria-label="Spread the list over the page"]').first()
      if (await spread.count()) await spread.click({ timeout: 5000 })
      await h.waitForTimeout(600)
      await h.locator('[data-page="all"] input[placeholder="Search in Everything"]').click().catch(() => {})
      const focused = await h.evaluate(() => document.activeElement?.tagName === 'INPUT')
      if (focused) {
        const list = await typeTimed(h, 'meadow', '[data-page="all"] [data-row], [data-page="all"] [data-index]')
        check(`Everything's search: each key's results drawn under ${TYPED} ms`, list.worst < TYPED, JSON.stringify(list.keys))
        check(`Everything's search: no frame over ${BUSY} ms while typing`, list.frame < BUSY, `${list.frame} ms`)
      } else check('Everything\'s search is there, spread over the page', false)
    }
    if (c.errors.length) console.log('errors:', c.errors.slice(0, 8))
  } finally {
    await c.close()
  }
} catch (error) {
  check('probe ran', false, error.stack)
}
done()

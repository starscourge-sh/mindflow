// A task you are in a focus session on says so in its row, and every task says the time spent on it (ask 47).
//
// The dot: on the row of the task the session is on, in the margin the day's three numbers stand in, the welcome's own
// breathing dot (.mf-listening). Nothing in the row moves as it comes and goes; paused it holds still and dims; with
// Motion off or Reduce motion it is a still dot; over (ended, abandoned, switched, called off) it is gone at once. Its
// tip says what it is, a press shows the session and never opens the row or starts a carry, and it takes focus, so a
// date picker up elsewhere closes (qa/one-floating-thing.mjs says why).
// The time: last in the row's small line, every kept session's time plus the running one's whole minutes, as the
// task's own page counts it under “Focus so far”; by the minute, from the first whole minute; against the task's
// length when it has one. Sessions here are made with known lengths: started, the clock moved on, ended.
//
//   QA_DATA=<a copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] [PART=dot,time,timer,lists,journal,box,sticky,week,matrix,tag,fits,everything,stats,search,page,bubble,look] [DAY=1|-1] node qa/task-in-session.mjs
import { mkdirSync, writeFileSync } from 'fs'
import { sandbox, shiftClock, CALM_HOUR } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.env.SHOTS ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const PART = (process.env.PART ?? 'dot,time,timer,lists,journal,box,sticky,week,matrix,tag,fits,everything,stats,search,page,bubble,look').split(',')
// The clock a day on or a day back (DAY=1, DAY=-1): which list a day's page draws a task in changes with the day.
const DAY = Number(process.env.DAY ?? 0)
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900, at: CALM_HOUR })
const { electron, h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const MIN = 60_000

// The clock, moved on in the main process and in every window: how a session gets a known length.
const base = c.now().getTime() - Date.now()
let ahead = 0
const forward = async (ms) => {
  ahead += ms
  await electron.evaluate((_, [code, by]) => new Function(`(${code})(${by})`)(), [shiftClock.toString(), base + ahead])
  await electron.context().addInitScript(`(${shiftClock.toString()})(${base + ahead})`)
  for (const page of electron.windows()) await page.evaluate(`(${shiftClock.toString()})(${base + ahead})`).catch(() => {})
}
const running = () => v('focus:now')
/** The list told to look again with nothing changed in the time worked: the clock moved under it, and only a change draws it again. */
const nudge = async () => { const now = await running(); if (now && !now.pausedAt) { await v('session:pause', now.id); await v('session:resume', now.id) } await wait(450) }
/** A session of a known length on a task: started, the clock moved on, then ended (kept), abandoned, or left running. */
const ran = async (task, ms, how = 'end', planned = null) => {
  const id = await v('session:start', task, '', planned)
  await forward(ms)
  if (how === 'end') await v('session:end', id, '', false)
  if (how === 'abandon') await v('session:abandon', id)
  return id
}

/** A task's time as the app adds it up, by the main process's clock: each kept session's, less its pauses, and the running one's so far. */
const totalMs = async (id) => {
  const now = await electron.evaluate(() => Date.now())
  return (await v('sessions', id)).filter((one) => !one.abandonedAt && !one.practice)
    .reduce((sum, one) => sum + Math.max(0, (one.endedAt ? Date.parse(one.endedAt) : now) - Date.parse(one.startedAt) - one.pausedMs - (one.pausedAt ? now - Date.parse(one.pausedAt) : 0)), 0)
}
/** The clock moved on until a task's time is exactly this much: the seconds a probe itself takes never change what a line expects. */
const until = async (id, ms) => forward(ms - (await totalMs(id)))
/** Minutes as the app says a length: “45 min”, “1 h 5 min”. */
const length = (minutes) => (minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`)
const row = (id) => `[data-task-row][data-id="${id}"]`
/** A row brought to the middle of the window: the list draws only the rows near what shows, so one far off is scrolled toward first. */
const see = async (id) => {
  await h.evaluate(async (sel) => {
    const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    let scroller = document.querySelector('[data-task-row]')?.parentElement
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement
    for (let at = 0; scroller && !document.querySelector(sel) && at <= scroller.scrollHeight; at += 300) { scroller.scrollTop = at; await frame() }
    document.querySelector(sel)?.scrollIntoView({ block: 'center' })
    await frame()
  }, row(id))
  await wait(350)
}
const dot = (id) => `${row(id)} [data-session-dot]`
const spent = (id) => h.evaluate((sel) => document.querySelector(`${sel} [data-task-spent]`)?.textContent ?? null, row(id))
/** Every box of a row a person would see move: the row, its tick, its name, its small line and each thing in it but the time. */
const boxes = (id) => h.evaluate((sel) => {
  const one = document.querySelector(sel)
  if (!one) return null
  const top = one.closest('.list-edge').getBoundingClientRect().top
  const box = (el, wide = true) => { if (!el) return null; const r = el.getBoundingClientRect(); return [r.left, r.top - top, ...(wide ? [r.width] : []), r.height].map((n) => Math.round(n * 100) / 100).join(' ') }
  const meta = one.querySelector('[data-task-meta]')
  return JSON.stringify({ row: box(one), tick: box(one.querySelector('[data-task-tick]')), title: box(one.querySelector('[data-title]')), name: box(one.querySelector('[data-task-title]'), false), meta: box(meta, false),
    parts: [...(meta?.children ?? [])].filter((el) => !el.matches('[data-task-spent]')).map(box), mark: box(one.querySelector('[data-mark]')) })
}, row(id))
const box = (sel) => h.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom } }, sel)
const centre = async (sel) => { const b = await box(sel); return b && [b.x + b.w / 2, b.y + b.h / 2] }
/** What the inner dot looks like now, as the page draws it. */
const drawn = (id) => h.evaluate((sel) => {
  const el = document.querySelector(`${sel} .mf-listening`)
  if (!el) return null
  const s = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  return { name: s.animationName, seconds: s.animationDuration, times: s.animationIterationCount, opacity: Number(s.opacity), transform: s.transform, colour: s.backgroundColor, w: r.width, h: r.height, state: s.animationPlayState }
}, dot(id))
/** The dot's opacity read every 50 ms for a while: a breath is seen as it goes, and stillness as nothing changing. */
const breath = async (id, ms) => { const seen = []; for (let t = 0; t < ms; t += 50) { seen.push((await drawn(id))?.opacity ?? -1); await wait(50) } return seen }
const tips = () => h.evaluate(() => [...document.querySelectorAll('[role="tooltip"], [data-slot="tooltip-content"]')].filter((one) => one.getBoundingClientRect().width > 2).map((one) => one.innerText.replace(/\s+/g, ' ').trim()).filter((text, at, all) => all.indexOf(text) === at))
const rest = async () => { await h.mouse.move(700, 4); await wait(250) }
const hoverTip = async (sel) => { await rest(); const at = await centre(sel); if (!at) return []; await h.mouse.move(at[0] - 3, at[1]); await h.mouse.move(at[0], at[1]); await wait(900); const said = await tips(); await rest(); return said }
const up = () => h.evaluate(() => [...new Set(document.querySelectorAll('[data-slot="popover-content"], [role="menu"]'))].filter((one) => one.getClientRects().length && one.getAttribute('data-state') !== 'closed').length)
/** A line of a row's right-click menu pressed with the pointer; `inside` is a line of the submenu it opens. */
const menu = async (id, label, inside) => {
  await rest()
  const at = await centre(`${row(id)} [data-title]`)
  await h.mouse.click(at[0], at[1], { button: 'right' })
  await wait(350)
  const line = h.locator('[role="menuitem"]', { hasText: inside ? new RegExp(`^${label}$`) : label }).first()
  if (!(await line.count())) { await h.keyboard.press('Escape'); await wait(200); return false }
  if (inside) {
    await line.hover()
    await wait(450)
    const within = h.locator('[role="menuitem"]', { hasText: inside }).last()
    // Opened by the pointer resting on it; by a press if that was not enough.
    if (!(await within.count())) { await line.click(); await wait(350) }
    if (!(await within.count())) { await h.keyboard.press('Escape'); await h.keyboard.press('Escape'); await wait(200); return false }
    await within.click()
  } else await line.click()
  await wait(600)
  return true
}
const pill = () => electron.evaluate(({ BrowserWindow }) => { const one = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=focus')); return !!one && !one.isDestroyed() && one.isVisible() })
const shot = async (name, clip) => SHOTS && h.screenshot({ path: `${SHOTS}/${name}.png`, ...(clip ? { clip } : {}) })
/**
 * Frames of a row through more than one breath, the welcome's own dot set beside it on the same line and started with
 * it; then the frames laid side by side in one picture, each with its time and the two opacities, to be read by eye.
 */
const film = async (name, id, n = 28) => {
  const r = await box(row(id))
  const clip = { x: Math.max(0, r.x - 46), y: r.y, width: 250, height: r.h }
  await h.evaluate((sel) => {
    const mine = document.querySelector(`${sel} .mf-listening`)
    const at = mine.getBoundingClientRect()
    const theirs = document.getElementById('t1-welcome-dot') ?? document.body.appendChild(Object.assign(document.createElement('span'), { id: 't1-welcome-dot', className: 'mf-listening' }))
    theirs.style.cssText = `position:fixed;left:${at.left - 22}px;top:${at.top}px`
    for (const one of [mine, theirs]) one.style.animationName = 'none'
    void document.body.offsetHeight
    for (const one of [mine, theirs]) one.style.animationName = ''
  }, row(id))
  const frames = []
  const from = Date.now()
  // At least this many frames, and for longer than one breath (1.6 s) whether or not pictures are kept.
  for (let i = 0; i < n || Date.now() - from < 1750; i++) {
    const at = Date.now() - from
    const seen = await h.evaluate((sel) => [document.querySelector(`${sel} .mf-listening`), document.getElementById('t1-welcome-dot')].map((one) => Number(Number(getComputedStyle(one).opacity).toFixed(2))), row(id))
    frames.push({ at, seen, png: SHOTS ? (await h.screenshot({ clip })).toString('base64') : '' })
    await wait(50)
  }
  if (SHOTS) {
    await h.evaluate((frames) => {
      const sheet = Object.assign(document.createElement('div'), { id: 't1-sheet' })
      sheet.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:var(--background);display:flex;flex-wrap:wrap;align-content:flex-start;gap:6px 10px;padding:10px;font:11px/1.3 ui-monospace,monospace;color:var(--foreground)'
      for (const one of frames) {
        const cell = document.createElement('div')
        const img = new Image()
        img.src = `data:image/png;base64,${one.png}`
        img.style.cssText = 'display:block;width:250px'
        cell.append(img, `${one.at} ms  row ${one.seen[0]}  welcome ${one.seen[1]}`)
        sheet.append(cell)
      }
      document.body.append(sheet)
    }, frames)
    await wait(500)
    await h.screenshot({ path: `${SHOTS}/${name}-sheet.png` })
    await h.evaluate(() => document.getElementById('t1-sheet')?.remove())
    writeFileSync(`${SHOTS}/${name}-frames.json`, JSON.stringify(frames.map(({ at, seen }) => ({ at, seen }))))
  }
  await h.evaluate(() => document.getElementById('t1-welcome-dot')?.remove())
  return frames.map(({ at, seen }) => ({ at, seen }))
}
/** One part of the probe: anything in it that cannot be driven is one failing line, whatever is up is put away, and the next part still runs. */
const part = async (name, run) => {
  const from = Date.now()
  try { await run() } catch (error) {
    check(`${name}: could be driven to its end`, false, String(error?.message ?? error).split('\n')[0].slice(0, 200))
    await h.mouse.up().catch(() => {})
    for (let n = 0; n < 2; n++) { await h.keyboard.press('Escape').catch(() => {}); await wait(200) }
  }
  console.log(`(${name}: ${Math.round((Date.now() - from) / 1000)} s)`)
}
const nowMs = () => Date.now() + base + ahead
const dayKeyOf = (ms) => { const at = new Date(ms); return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}` }
/**
 * A task's row in any list, in any window: where its dot stands and whether it is in sight there (nothing over it, not
 * cut off), what the row says of its time (in words, or in its name's tip), and the places of the things that must not
 * move as the dot comes: the row, its name and its tick or mark, told from the row's own corner so a scroll changes nothing.
 */
const rowIn = async (page, sel, parts) => {
  const got = await rowRead(page, sel, parts)
  // No such row: a picture of the window as it stands, to see why.
  if (!got && SHOTS) await page.screenshot({ path: `${SHOTS}/missing-${sel.replace(/[^a-z0-9]+/gi, '-').slice(0, 48)}.png` }).catch(() => {})
  return got
}
const rowRead = (page, sel, parts) => page.evaluate(([sel, parts]) => {
  const found = document.querySelector(sel)
  const rowEl = found && parts.up ? found.closest(parts.up) : found
  if (!rowEl) return null
  rowEl.scrollIntoView({ block: 'center' })
  const edge = rowEl.getBoundingClientRect()
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, cy: r.top + r.height / 2 } }
  const within = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [r.left - edge.left, r.top - edge.top, r.height].map((n) => Math.round(n * 100) / 100).join(' ') }
  const q = (one) => (one ? rowEl.querySelector(one) : null)
  const dotEl = q('[data-session-dot] .mf-listening')
  const dot = box(dotEl)
  const spent = q('[data-task-spent]')
  const meta = q('[data-task-meta]')
  const tipped = q('[data-task-spent-tip]')
  const top = dot ? document.elementFromPoint(dot.x + dot.w / 2, dot.cy) : null
  const main = rowEl.matches('button') ? rowEl : rowEl.querySelector('button[data-pick], button[data-row]') ?? rowEl.querySelector('button:last-of-type') ?? rowEl
  return { row: box(rowEl), dot, seen: !!top && !!top.closest('[data-session-dot]'), name: box(q(parts.name)), lead: box(q(parts.lead)),
    spent: spent?.textContent ?? null, spentLast: !!meta && !!spent && (meta.lastElementChild === spent || !!meta.lastElementChild?.contains(spent) || meta.textContent.trim().endsWith(spent.textContent)),
    lastInRow: !!spent && (main.lastElementChild === spent || !!main.lastElementChild?.contains(spent)), dotLeads: !!meta && !!dotEl && !!meta.firstElementChild?.contains(dotEl),
    tip: tipped?.getAttribute('data-task-spent-tip') ?? null, still: JSON.stringify({ row: [Math.round(edge.left * 100) / 100, Math.round(edge.width * 100) / 100, Math.round(edge.height * 100) / 100].join(' '), name: within(q(parts.name)), lead: within(q(parts.lead)) }) }
}, [sel, parts])
/** A session started on a task, its time parked five seconds past a whole minute so no row can turn while it is read; gives the time as a row says it. */
const inSession = async (id) => {
  await ran(id, 1000, 'run', 25 * MIN)
  await until(id, (Math.floor((await totalMs(id)) / MIN) + 1) * MIN + 5_000)
  await nudge()
  return length(Math.round((await totalMs(id)) / MIN))
}
const over = async () => { const now = await running(); if (now) await v('session:cancel', now.id); await wait(450) }
/** Today's own Matrix on or off, as a person turns it: “Urgent and important” in Today's “More” menu, with the pointer. */
const todayMatrix = async (on) => {
  await rest()
  const more = h.locator('button[aria-label="More"]:visible').first()
  if (!(await more.count())) return false
  await more.click()
  await wait(450)
  const line = h.locator('[role="menuitemcheckbox"], [role="menuitem"]', { hasText: 'Urgent and important' }).first()
  if (!(await line.count())) { await h.keyboard.press('Escape'); await wait(200); return false }
  if (((await line.getAttribute('aria-checked')) === 'true') !== on) await line.click()
  else await h.keyboard.press('Escape')
  await wait(900)
  return true
}
/** A chip pressed with the pointer, found by the name it is given (its label is drawn twice over as it rolls). */
const pressChip = async (sel) => {
  await h.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'center' }), sel)
  await wait(150)
  const at = await centre(sel)
  if (at) { await rest(); await h.mouse.click(at[0], at[1]); await wait(900) }
  return !!at
}
/** A picture of a row and what is round it, in both looks, kept for the two sheets drawn at the end (every list beside Tasks' own row). */
const clips = { light: [], dark: [] }
const snap = async (label, page, sel, up) => {
  if (!SHOTS) return
  const r = await page.evaluate(([sel, up]) => { const found = document.querySelector(sel); const one = found && up ? found.closest(up) : found; if (!one) return null; one.scrollIntoView({ block: 'center' }); const b = one.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, vw: innerWidth, vh: innerHeight } }, [sel, up ?? null])
  if (!r) return
  const x = Math.max(0, Math.floor(r.x - 64))
  const y = Math.max(0, Math.floor(r.y - 22))
  const clip = { x, y, width: Math.max(40, Math.min(620, r.vw - x, Math.ceil(r.w + 84))), height: Math.max(20, Math.min(r.vh - y, Math.ceil(r.h + 44))) }
  for (const look of ['light', 'dark']) {
    await c.look(look)
    await wait(350)
    clips[look].push({ label, wide: clip.width, png: (await page.screenshot({ clip })).toString('base64') })
  }
  await c.look('light')
}
const sheets = async () => {
  if (!SHOTS) return
  for (const look of ['light', 'dark']) {
    if (!clips[look].length) continue
    await c.look(look)
    await h.evaluate((frames) => {
      const sheet = Object.assign(document.createElement('div'), { id: 't1-sheet' })
      sheet.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:var(--background);display:flex;flex-wrap:wrap;align-content:flex-start;gap:10px 14px;padding:10px;font:11px/1.3 ui-monospace,monospace;color:var(--foreground);overflow:hidden'
      for (const one of frames) {
        const cell = document.createElement('div')
        const img = new Image()
        img.src = `data:image/png;base64,${one.png}`
        img.style.cssText = `display:block;width:${Math.round(one.wide * 0.7)}px;margin-bottom:2px`
        cell.append(img, one.label)
        sheet.append(cell)
      }
      document.body.append(sheet)
    }, clips[look])
    await wait(700)
    await h.screenshot({ path: `${SHOTS}/lists-${look}-sheet.png` })
    await h.evaluate(() => document.getElementById('t1-sheet')?.remove())
  }
  await c.look('light')
}
const around = async (id, pad = 28) => { const b = await box(row(id)); return b && { x: Math.max(0, b.x - 60), y: Math.max(0, b.y - pad), width: Math.min(760, b.w + 80), height: b.h + pad * 2 } }

try {
  if (DAY) {
    await forward(DAY * 86_400_000)
    await h.reload()
    await wait(2500)
    await c.page.reload().catch(() => {})
    await wait(500)
  }
  await v('settings:set', { focusTools: true, countIn: false })
  // The probe's own tasks, on Today: one with two kept sessions and an abandoned one, one with thirty and a length, one with a step, one new.
  const A = (await v('task:add', 't1 alpha', undefined, true)).id
  const B = (await v('task:add', 't1 thirty sessions', undefined, true)).id
  const C = (await v('task:add', 't1 new with a step', undefined, true)).id
  const E = (await v('task:add', 't1 under its length', undefined, true)).id
  const D = (await v('task:add', 't1 on another tab tomorrow')).id
  const F = (await v('task:add', 't1 in a session', undefined, true)).id
  await v('task:save', B, { estimate: 60 })
  await v('task:save', E, { estimate: 60 })
  await v('task:save', C, { subtasks: [{ text: 'a step of it', done: false }, { text: 'another', done: false }] })
  for (let n = 0; n < 30; n++) await ran(B, 2 * MIN + 10_000)          // 30 x 2:10 = 65 min
  await ran(A, 10 * MIN + 10_000)                                       // 10:10 kept
  await ran(A, 5 * MIN + 10_000, 'end', 25 * MIN)                       // 5:10 of 25: ended early, counts
  await ran(A, 7 * MIN, 'abandon', 25 * MIN)                            // abandoned: counts for nothing
  await ran(E, 40 * MIN + 10_000)                                       // 40:10 against 1 h
  // One whose small line is long enough to wrap in the smallest window: a day, who it waits on, steps, and 12:10 of time.
  const W = (await v('task:add', 't1 with a long small line', undefined, true)).id
  await v('task:save', W, { waitingOn: 'Hermione Granger at the library desk on the second floor', subtasks: [{ text: 'ask', done: false }] })
  await ran(W, 12 * MIN + 10_000)
  // For the other lists: one with a time today (a day's page draws it in its line by the hour), one with a tag, one
  // planned for yesterday and still open, and one kept session today, so the day's page has its line from the start.
  const atFour = new Date(nowMs())
  atFour.setHours(16, 0, 0, 0)
  const T = (await v('task:add', 't1 at four today', undefined, true)).id
  await v('task:save', T, { due: atFour.toISOString(), allDay: 0 })
  const G = (await v('task:add', 't1 tagged #t1tag', undefined, true)).id
  const noonBefore = new Date(nowMs() - 86_400_000)
  noonBefore.setHours(12, 0, 0, 0)
  const Y = (await v('task:add', 't1 gone by plan')).id
  await v('task:save', Y, { due: noonBefore.toISOString(), allDay: 1 })
  const Z = (await v('task:add', 't1 so the day has a session', undefined, true)).id
  await ran(Z, MIN + 5_000)
  await go('today')
  await wait(1200)
  // One of the day's three, its number in the margin, and what stands there.
  const three = await h.evaluate(() => { const one = document.querySelector('[data-task-row] > [data-three]'); return one ? one.closest('[data-task-row]').getAttribute('data-id') : null })
  const numberSel = `${row(three)} [data-three]`

  if (PART.includes('dot')) await part('the dot', async () => {
    await see(three)
    const number = await box(numberSel)
    const before = { three: await boxes(three) }
    await see(F)
    before.F = await boxes(F)
    // Started from the row's own menu, with the pointer.
    const started = await menu(F, 'Start a focus session')
    await wait(300)
    const dotA = await box(dot(F))
    const inner = await box(`${dot(F)} .mf-listening`)
    const tick = await box(`${row(F)} [data-task-tick]`)
    check('1 the row of the task in a session has a dot under its tick, where the day\'s numbers stand', started && !!inner && !!number && Math.abs((inner.x + inner.w / 2) - (tick.x + tick.w / 2)) < 1 && inner.y >= tick.b && (await h.evaluate(() => document.querySelectorAll('[data-session-dot]').length)) === 1, JSON.stringify({ inner, tick }))
    check('1 nothing in the row moved by a pixel as it came (row, tick, name, small line and each thing in it)', !!dotA && !!before.F && (await boxes(F)) === before.F, `${before.F} -> ${await boxes(F)}`)
    // The welcome's own piece beside it, to compare: the same class the welcome's key recorder draws.
    await h.evaluate(() => { const one = document.createElement('span'); one.className = 'mf-listening'; one.id = 't1-welcome-dot'; one.style.cssText = 'position:fixed;left:8px;bottom:8px'; document.body.append(one) })
    const mine = await drawn(F)
    const theirs = await h.evaluate(() => { const s = getComputedStyle(document.getElementById('t1-welcome-dot')); return { name: s.animationName, seconds: s.animationDuration, colour: s.backgroundColor, w: s.width, h: s.height } })
    await h.evaluate(() => document.getElementById('t1-welcome-dot')?.remove())
    const seen = await breath(F, 1700)
    check('2 it is the welcome\'s dot: its size (6px), its accent, its clock (one breath of 1.6 s, no quicker)', !!mine && mine.name === theirs.name && mine.name === 'mf-listen' && mine.seconds === '1.6s' && mine.seconds === theirs.seconds && mine.colour === theirs.colour && mine.w === 6 && mine.h === 6 && theirs.w === '6px', JSON.stringify({ mine, theirs }))
    check('2 it breathes by opacity alone: down to a quarter and back in a breath, nothing scaled or moved', Math.min(...seen) < 0.4 && Math.min(...seen) >= 0.24 && Math.max(...seen) > 0.9 && mine.transform === 'none' && (await boxes(F)) === before.F, `min ${Math.min(...seen)} max ${Math.max(...seen)}`)
    const filmed = mine ? await film('breath-light', F) : []
    check('2 beside the welcome\'s own dot, started together, the two are one in every frame for more than a breath', filmed.length >= 20 && filmed.at(-1).at >= 1600 && filmed.every((one) => Math.abs(one.seen[0] - one.seen[1]) <= 0.03) && Math.min(...filmed.map((one) => one.seen[0])) < 0.4, JSON.stringify(filmed.map((one) => `${one.at}:${one.seen.join('/')}`)))
    if (SHOTS) await shot('today-running-light')
    check('3 it has the hand, can take focus, and is a button by name', await h.evaluate((sel) => { const el = document.querySelector(sel); return !!el && getComputedStyle(el).cursor === 'pointer' && el.tabIndex === 0 && el.getAttribute('role') === 'button' && /focus session/i.test(el.getAttribute('aria-label') ?? '') }, dot(F)))
    const said = await hoverTip(dot(F))
    check('3 its tip says what it is in the app\'s words, with the time left', said.length === 1 && /^In a focus session · (24|25) min left\. Click to show it$/.test(said[0]), JSON.stringify(said))
    // A press on it: the pill put away first, so that showing it is seen.
    await h.evaluate(() => window.api.showFocus(false))
    await wait(300)
    const hidden = !(await pill())
    const chip = await centre(`${row(C)} [data-date-chip]`)
    await h.mouse.click(chip[0], chip[1])
    await wait(500)
    const pickerUp = await up()
    const at = await centre(dot(F))
    let carried = false
    if (at) {
      await h.mouse.move(at[0], at[1])
      await h.mouse.down()
      await h.mouse.move(at[0] + 9, at[1] + 14, { steps: 4 })
      carried = await h.evaluate(() => !!document.querySelector('[data-carried-card]'))
      await h.mouse.move(at[0], at[1], { steps: 2 })
      await h.mouse.up()
    }
    await wait(600)
    check('3 with a task\'s date picker up, a click on the dot leaves one floating thing or none', pickerUp === 1 && (await up()) <= 1 && !!dotA, `before ${pickerUp}, after ${await up()}`)
    await h.keyboard.press('Escape')
    await wait(300)
    check('3 a press on it shows the session, as the row\'s menu does', hidden && (await pill()), `hidden first ${hidden}, shown after ${await pill()}`)
    check('3 a press and a pull on it never start a carry, open the row or make a group', !!dotA && !carried && !(await h.evaluate((id) => !!document.querySelector(`.note-pane[data-open="${id}"]`), F)) && !(await h.evaluate(() => /new group|moved/i.test(document.querySelector('[role="status"]')?.textContent ?? ''))))
    await h.evaluate(() => window.api.showFocus(false))
    await wait(250)
    if (at) { await h.evaluate((sel) => document.querySelector(sel)?.focus(), dot(F)); await h.keyboard.press('Enter') }
    await wait(500)
    check('3 Enter on it shows the session too, and the row stays shut', !!at && (await pill()) && !(await h.evaluate((id) => !!document.querySelector(`.note-pane[data-open="${id}"]`), F)))
    await h.evaluate(() => document.activeElement?.blur())

    // Paused from the row's menu: still, dimmed, and said.
    const paused = await menu(F, 'Pause the session')
    const still = await breath(F, 600)
    const held = await drawn(F)
    check('2 paused, it holds still and dims to 40%, as the pill\'s ring does: no new colour', paused && !!held && held.name === 'none' && still.every((one) => Math.abs(one - 0.4) < 0.01) && held.colour === mine.colour && (await boxes(F)) === before.F, JSON.stringify({ held, still: [...new Set(still)] }))
    const pausedSaid = await hoverTip(dot(F))
    check('2 paused, its tip says so', pausedSaid.length === 1 && /^Focus session paused · (24|25) min left\. Click to show it$/.test(pausedSaid[0]), JSON.stringify(pausedSaid))
    if (SHOTS) await shot('paused-light', await around(F))
    const resumed = await menu(F, 'Resume the session')
    const again = await breath(F, 1700)
    check('paused and resumed: it breathes again', resumed && Math.min(...again) < 0.4 && Math.max(...again) > 0.9, `min ${Math.min(...again)} max ${Math.max(...again)}`)
    // Motion off, and Reduce motion: a still dot, whole.
    await h.evaluate(() => (document.documentElement.dataset.motion = 'off'))
    const off = await breath(F, 500)
    await h.evaluate(() => delete document.documentElement.dataset.motion)
    await h.emulateMedia({ reducedMotion: 'reduce' })
    await wait(150)
    const reduced = await breath(F, 500)
    await h.emulateMedia({ reducedMotion: 'no-preference' })
    check('2 Motion off, or Reduce motion: a still dot', off.length > 5 && off.every((one) => one === 1) && reduced.every((one) => one === 1), JSON.stringify({ off: [...new Set(off)], reduced: [...new Set(reduced)] }))

    // Switched to another task: one of the day's three. The dot stands where its number was.
    await see(three)
    const numberNow = await box(numberSel)
    const switched = await menu(three, 'Start a focus session')
    await wait(300)
    const onThree = await box(`${dot(three)} .mf-listening`)
    const dots = await h.evaluate(() => document.querySelectorAll('[data-session-dot]').length)
    await see(F)
    check('switched to another task: gone from the first row at once, and on the new one alone', switched && !(await box(dot(F))) && !!onThree && dots === 1 && (await boxes(F)) === before.F, `${dots} dots`)
    await see(three)
    check('1 on one of the day\'s three the dot stands where its number was, and nothing in that row moved', !!onThree && !(await box(numberSel)) && Math.abs(onThree.r - numberNow.r) < 0.6 && Math.abs(onThree.y + onThree.h / 2 - (numberNow.y + numberNow.h / 2)) < 2.5 && (await boxes(three)) === before.three, JSON.stringify({ onThree, numberNow }))
    if (SHOTS) await shot('three-running-light', await around(three))
    // Ended from the row's menu: every frame until it is gone, so "at once" is seen.
    await h.evaluate((sel) => {
      window.__t1 = []
      const look = () => { window.__t1.push([!!document.querySelector(`${sel} [data-session-dot]`), !!document.querySelector(`${sel} > [data-three]`)]); window.__t1go = requestAnimationFrame(look) }
      look()
    }, row(three))
    const ended = await menu(three, 'The session', 'End session early')
    await wait(500)
    const frames = await h.evaluate(() => { cancelAnimationFrame(window.__t1go); return window.__t1 })
    const neither = frames.filter(([dotOn, numberOn]) => !dotOn && !numberOn).length
    const both = frames.filter(([dotOn, numberOn]) => dotOn && numberOn).length
    await see(three)
    const back = await box(numberSel)
    const backTick = await box(`${row(three)} [data-task-tick]`)
    const backAt = back && backTick && (back.x + back.w / 2) - (backTick.x + backTick.w / 2)
    check('ended from the row\'s menu: the dot goes and the number is back in one frame, where it stood', ended && !(await box(dot(three))) && !!back && Math.abs(backAt) < 1 && neither === 0 && both === 0 && frames.some(([dotOn]) => dotOn) && (await boxes(three)) === before.three, `${frames.length} frames, ${neither} with neither, ${both} with both`)
    // Abandoned from the pill's own window, and called off: gone each time.
    await see(F)
    await menu(F, 'Start a focus session')
    const pillPage = electron.windows().find((one) => one.url().includes('view=focus'))
    const hadDot = !!(await box(dot(F)))
    const nowId = (await running())?.id
    await (pillPage ?? h).evaluate((id) => window.api.haligtree('session:abandon', id), nowId)
    await wait(500)
    check('abandoned from the pill\'s window: the dot is gone from the row in the main window', hadDot && !!pillPage && !(await box(dot(F))) && (await boxes(F)) === before.F)
    await menu(F, 'Start a focus session')
    const hadDot2 = !!(await box(dot(F)))
    await v('session:cancel', (await running())?.id)
    await wait(500)
    check('called off (deleted): gone', hadDot2 && !(await box(dot(F))))
    // Started on a task that is not in this tab: no row here says so, and its own tab does.
    await v('session:start', D, '', 25 * MIN)
    await wait(500)
    const noneHere = await h.evaluate(() => document.querySelectorAll('[data-session-dot]').length)
    await go('upcoming')
    await wait(900)
    await see(D)
    check('4 started on a task of another tab: no dot on Today, and the dot on its row in “Upcoming”', noneHere === 0 && !!(await box(dot(D))))
    await go('alltasks')
    await wait(900)
    await see(D)
    const inAll = !!(await box(dot(D)))
    await v('session:end', (await running())?.id, '', false)
    await wait(500)
    check('4 the same row in “All”: the dot, and gone when the session ends', inAll && !(await box(dot(D))))
    await go('today')
    await wait(900)
  })

  if (PART.includes('time')) await part('the time', async () => {
    await see(A)
    const last = (id) => h.evaluate((sel) => { const meta = document.querySelector(`${sel} [data-task-meta]`); return !!meta && !!meta.lastElementChild && (meta.lastElementChild.matches('[data-task-spent]') || !!meta.lastElementChild.querySelector('[data-task-spent]')) }, row(id))
    check('5 a task with time on it says it last in its small line: 10:10 and 5:10 kept, 7:00 abandoned, read “15 min so far”', (await spent(A)) === '15 min so far' && (await last(A)), `${await spent(A)}`)
    check('6 on any task with time, not only the one in a session: 40:10 against a length of 1 h reads “40 min of 1 h”', (await spent(E)) === '40 min of 1 h' && !(await box(dot(E))), `${await spent(E)}`)
    check('6 thirty sessions of 2:10, past its length of 1 h: “1 h 5 min of 1 h”, in the line\'s own quiet colour', (await spent(B)) === '1 h 5 min of 1 h' && (await h.evaluate((sel) => { const one = document.querySelector(`${sel} [data-task-spent]`); return !!one && getComputedStyle(one).color === getComputedStyle(one.closest('[data-task-meta]')).color }, row(B))), `${await spent(B)}`)
    const counts = await hoverTip(`${row(A)} [data-task-spent]`)
    check('7 its tip says what counts: “Across 2 focus sessions”, ended early counts, abandoned does not', counts.length === 1 && counts[0] === 'Across 2 focus sessions, pauses left out. A session ended early counts for the time it ran; an abandoned one does not.', JSON.stringify(counts))
    const many = await hoverTip(`${row(B)} [data-task-spent]`)
    check('7 thirty sessions: “Across 30 focus sessions”', many.length === 1 && /^Across 30 focus sessions/.test(many[0]), JSON.stringify(many))
    // Before the first whole minute, nothing; then “1 min so far”. The row with a step under it keeps its tree.
    if (await h.locator(`${row(C)} [data-steps-fold]`).count()) await h.locator(`${row(C)} [data-steps-fold]`).click()
    await wait(400)
    const tree = await h.evaluate((sel) => { const list = document.querySelector(`${sel} [data-steps-of]`); return list ? JSON.stringify([...list.querySelectorAll('li')].map((li) => { const r = li.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top - list.closest('[data-task-row]').getBoundingClientRect().top)] })) : null }, row(C))
    const cBefore = await boxes(C)
    await ran(C, 20_000, 'run', 25 * MIN)
    await nudge()
    const early = await spent(C)
    await forward(45_000)
    await nudge()
    const minute = await spent(C)
    const treeAfter = await h.evaluate((sel) => { const list = document.querySelector(`${sel} [data-steps-of]`); return list ? JSON.stringify([...list.querySelectorAll('li')].map((li) => { const r = li.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top - list.closest('[data-task-row]').getBoundingClientRect().top)] })) : null }, row(C))
    check('5 nothing before the first whole minute (0:20), then “1 min so far” (1:05)', early === null && minute === '1 min so far' && !!(await box(dot(C))), `${early} then ${minute}`)
    check('a task with a step open under it: the dot and the time come, its steps stay where they hung', !!tree && tree === treeAfter && (await boxes(C)) === cBefore && !!(await box(dot(C))) && minute !== null, `${tree} -> ${treeAfter}`)
    if (SHOTS) await shot('step-running-light', await around(C, 60))
    await v('session:end', (await running())?.id, '', false)
    // A running session's time is added: 15:20 kept and 2:50 running is 18:10, read “18 min so far”, in three sessions.
    await ran(A, 1000, 'run', 25 * MIN)
    await until(A, 18 * MIN + 10_000)
    await nudge()
    const run18 = await spent(A)
    const three3 = await hoverTip(`${row(A)} [data-task-spent]`)
    check('5 the running session\'s time is added: 15:20 kept and 2:50 running read “18 min so far”, across 3 sessions', run18 === '18 min so far' && /^Across 3 focus sessions/.test(three3[0] ?? ''), `${run18} ${JSON.stringify(three3)}`)
    // By the minute, never the second: at 19:23 of its time it reads 19 and waits; as 19:30 passes it turns to 20 by itself, once
    // (the minutes are the task's time rounded, as its page rounds it: what the page will say when the session ends).
    await until(A, 19 * MIN + 23_000)
    await nudge()
    await h.evaluate((sel) => {
      const one = document.querySelector(`${sel} [data-task-meta]`)
      window.__t1said = [one.querySelector('[data-task-spent]')?.textContent ?? null]
      new MutationObserver(() => { const now = one.querySelector('[data-task-spent]')?.textContent ?? null; if (now !== window.__t1said.at(-1)) window.__t1said.push(now) }).observe(one, { subtree: true, childList: true, characterData: true })
    }, row(A))
    await wait(11_000)
    const turned = await h.evaluate(() => window.__t1said)
    check('5 it moves by the minute, never the second: 19 at 19:23 of its time, and 20 by itself as 19:30 passes, one change in 11 s', JSON.stringify(turned) === JSON.stringify(['19 min so far', '20 min so far']), JSON.stringify(turned))
    // Paused: the pause does not count, and nothing flickers through pause, resume and the end.
    await h.evaluate(() => (window.__t1said = [window.__t1said.at(-1)]))
    await menu(A, 'Pause the session')
    await forward(6 * MIN)
    await v('task:save', E, { estimate: 60 })
    await wait(450)
    const whilePaused = await spent(A)
    await menu(A, 'Resume the session')
    const afterResume = await spent(A)
    check('a session paused for 6 minutes and resumed: the pause is not counted', whilePaused === '20 min so far' && afterResume === '20 min so far', `${whilePaused} ${afterResume}`)
    // The page agrees while it runs: the same minutes and the same count as the row and its tip.
    await h.locator(`${row(A)} [data-title]`).click()
    await wait(1200)
    const page = () => h.evaluate(() => (document.querySelector('[data-task-focus] p')?.innerText ?? '').replace(/\s+/g, ' ').trim())
    const pageRunning = await page()
    const tipRunning = await hoverTip(`${row(A)} [data-task-spent]`)
    check('7 the task\'s own page says the same while it runs: “20 min in 3 sessions” under “Focus so far”', /^20 min ?in 3 sessions$/.test(pageRunning) && (await spent(A)) === '20 min so far' && /^Across 3 focus sessions/.test(tipRunning[0] ?? ''), `page “${pageRunning}”, row “${await spent(A)}”`)
    // Ended from the pill's window: the row's time is what the page then says, with no number in between.
    const pillPage = electron.windows().find((one) => one.url().includes('view=focus'))
    await (pillPage ?? h).evaluate((id) => window.api.haligtree('session:end', id, '', false), (await running())?.id)
    await wait(700)
    const through = await h.evaluate(() => window.__t1said)
    const pageEnded = await page()
    check('8 ended from the pill\'s window: fresh at once, and through pause, resume and the end the row said only “20 min so far” (no flicker, no step at the end)', !!pillPage && JSON.stringify(through) === JSON.stringify(['20 min so far']) && !(await box(dot(A))), JSON.stringify(through))
    check('7 ended, the row and the page agree: three kept sessions of 19:4x in all read “20 min so far” and “20 min in 3 sessions”', (await spent(A)) === '20 min so far' && /^20 min ?in 3 sessions$/.test(pageEnded) && Math.round((await totalMs(A)) / MIN) === 20, `row “${await spent(A)}”, page “${pageEnded}”`)
    if (SHOTS) await shot('row-and-page-light')
    await h.keyboard.press('Escape')
    await wait(400)
    // A session deleted: its minutes go with it.
    await ran(A, 1000, 'run', 25 * MIN)
    await until(A, 22 * MIN + 10_000)
    await nudge()
    const with2 = await spent(A)
    await v('session:cancel', (await running())?.id)
    await wait(500)
    check('8 a running session called off (deleted): its minutes go, “22 min so far” back to “20 min so far”', with2 === '22 min so far' && (await spent(A)) === '20 min so far', `${with2} -> ${await spent(A)}`)
    // With no end set, the dot says how long it has run; past its length, that its time is up.
    await ran(E, 3 * MIN + 10_000, 'run', null)
    await nudge()
    const open = await hoverTip(dot(E))
    await v('session:cancel', (await running())?.id)
    await ran(E, 6 * MIN, 'run', 5 * MIN)
    await nudge()
    const over = await hoverTip(dot(E))
    await v('session:cancel', (await running())?.id)
    await wait(400)
    check('3 with no end set its tip says how long it has run, and past its length that the time is up', open[0] === 'In a focus session · 3 min so far. Click to show it' && over[0] === 'In a focus session · time’s up. Click to show it', JSON.stringify([open, over]))
    // One read for the whole list, never one a row: counted in the main process as the list opens afresh.
    await electron.evaluate(({ ipcMain }) => {
      globalThis.__t1calls = {}
      for (const [channel, run] of ipcMain._invokeHandlers) {
        if (!/^haligtree:(sessions|sessions:spent|focus:task)$/.test(channel) || run.__t1) continue
        const counted = (...args) => { globalThis.__t1calls[channel] = (globalThis.__t1calls[channel] ?? 0) + 1; return run(...args) }
        counted.__t1 = true
        ipcMain._invokeHandlers.set(channel, counted)
      }
    })
    await go('home')
    await wait(700)
    await electron.evaluate(() => (globalThis.__t1calls = {}))
    await go('today')
    await wait(1500)
    const calls = await electron.evaluate(() => globalThis.__t1calls)
    const rowsShown = await h.evaluate(() => document.querySelectorAll('[data-task-row]').length)
    await see(A)
    check('8 one read for the whole list, never one a row', (calls['haligtree:sessions:spent'] ?? 0) >= 1 && (calls['haligtree:sessions:spent'] ?? 0) <= 2 && !calls['haligtree:sessions'] && !calls['haligtree:focus:task'] && rowsShown > 5 && (await spent(A)) === '20 min so far', `${JSON.stringify(calls)} for ${rowsShown} rows`)
  })

  if (PART.includes('timer')) await part('a timer over the session', async () => {
    // A kettle timer started while a session runs: the pill then shows the timer, and the session runs on underneath it
    // (main: "a focus session running carries on underneath"). The row says what is true: still in a session, its minutes still counted.
    await go('today')
    await wait(900)
    await see(A)
    await ran(A, 1000, 'run', 25 * MIN)
    await until(A, (Math.floor((await totalMs(A)) / MIN) + 3) * MIN + 10_000)
    await nudge()
    const before = { dot: !!(await box(dot(A))), time: await spent(A) }
    const timer = await v('timer:start', 'tea', 5 * MIN)
    await wait(800)
    const top = await running()
    const under = { dot: !!(await box(dot(A))), time: await spent(A) }
    await v('session:cancel', timer)
    await wait(400)
    await v('session:cancel', (await running())?.id)
    await wait(400)
    check('a timer started over the session (the pill then shows the timer): the row keeps its dot and its minutes, the session running on underneath', before.dot && !!before.time && top?.id === timer && !top?.taskId && under.dot && under.time === before.time && !(await box(dot(A))), JSON.stringify({ before, top: top && { goal: top.goal, taskId: top.taskId }, under }))
  })

  if (PART.includes('lists')) await part('the other lists', async () => {
    // Tasks in its other shapes: Today grouped by tag and sorted by name, “Later” and “Routines”. One row draws them all.
    await ran(A, 1000, 'run', 25 * MIN)
    await h.evaluate(() => localStorage.setItem('view:tasks:today', JSON.stringify({ sort: 'name', group: 'tag' })))
    await go('home')
    await wait(500)
    await go('today')
    await wait(1000)
    await see(A)
    // A heading for each tag, where today's tasks have tags at all (a book whose tasks carry none draws one list).
    const byTag = { headings: await h.evaluate(() => document.querySelectorAll('[data-tag-fold]').length), tagged: await h.evaluate(() => document.querySelectorAll('[data-pane] [data-task-row] [data-tag]').length), dot: !!(await box(dot(A))), time: await spent(A) }
    check('4 Today grouped by tag and sorted by name: the same row, with its dot and its time', (byTag.headings > 0 || byTag.tagged === 0) && byTag.dot && /min so far$/.test(byTag.time ?? ''), JSON.stringify(byTag))
    await h.evaluate(() => localStorage.removeItem('view:tasks:today'))
    await v('session:cancel', (await running())?.id)
    const later = (await v('task:add', 't1 put off someday')).id
    const routine = (await v('task:add', 't1 routine every day')).id
    for (const [tab, name, id] of [['later', 'Later', later], ['routines', 'Routines', routine]]) {
      await v('session:start', id, '', 25 * MIN)
      await go(tab)
      await wait(900)
      await see(id)
      const on = !!(await box(dot(id)))
      await v('session:cancel', (await running())?.id)
      await wait(500)
      check(`4 “${name}”: the row of the task in a session has the dot, and it goes as the session is called off`, on && !(await box(dot(id))) && !!(await box(row(id))))
    }
    // The Journal's day: whichever task its list shows first, given a kept session of 2:10 and one running for 3:10.
    await go('day')
    await wait(1500)
    const name = await h.evaluate(() => [...document.querySelectorAll('li [data-task-tick]')].find((one) => one.getAttribute('aria-checked') !== 'true')?.closest('li')?.querySelector('[data-task-title]')?.textContent ?? null)
    const J = name && (await v('tasks')).find((one) => one.status === 'open' && one.title.includes(name))
    const dayRow = () => h.evaluate((name) => {
      const li = [...document.querySelectorAll('li [data-task-tick]')].map((one) => one.closest('li')).find((one) => one?.querySelector('[data-task-title]')?.textContent === name)
      if (!li) return null
      li.scrollIntoView({ block: 'center' })
      const dot = li.querySelector('[data-session-dot] .mf-listening')?.getBoundingClientRect()
      const t = li.querySelector('[data-task-tick]').getBoundingClientRect()
      const r = li.getBoundingClientRect()
      return { dot: dot ? { x: dot.left, r: dot.right, y: dot.top + dot.height / 2, w: dot.width } : null, tick: { x: t.left, y: t.top + t.height / 2 }, meta: li.querySelector('[data-task-meta]')?.textContent ?? '', spent: li.querySelector('[data-task-spent]')?.textContent ?? null, row: [r.left, r.width, r.height].join(' '), name: li.querySelector('[data-task-title]').getBoundingClientRect().left }
    }, name)
    const dayBefore = await dayRow()
    if (J) { await ran(J.id, 2 * MIN + 10_000); await ran(J.id, 3 * MIN, 'run', 25 * MIN); await nudge() }
    const onDay = await dayRow()
    const dayMinutes = J ? Math.round((await totalMs(J.id)) / MIN) : 0
    check('4 the Journal\'s day: its row there has the dot in its margin, level with its tick, and the row did not move', !!onDay?.dot && onDay.dot.w === 6 && onDay.dot.x >= 2 && onDay.dot.r <= onDay.tick.x - 3 && Math.abs(onDay.dot.y - onDay.tick.y) < 2.5 && onDay.row === dayBefore.row && onDay.name === dayBefore.name && onDay.tick.x === dayBefore.tick.x, JSON.stringify({ name, onDay, dayBefore }))
    check(`5 the Journal's day: 2:10 kept and 3:00 running more read “${length(dayMinutes)} …”, last in its small line`, !!onDay?.spent && dayMinutes >= 5 && (onDay.spent === `${length(dayMinutes)} so far` || onDay.spent.startsWith(`${length(dayMinutes)} of `)) && onDay.meta.endsWith(onDay.spent), JSON.stringify(onDay))
    if (SHOTS) await shot('journal-day-light')
    if (J) await v('session:end', (await running())?.id, '', false)
    await wait(600)
    const dayEnded = await dayRow()
    check('4 the Journal\'s day: gone when the session ends, and the row did not move', !!onDay?.dot && !!dayEnded && !dayEnded.dot && dayEnded.row === onDay.row && dayEnded.tick.x === onDay.tick.x, JSON.stringify(dayEnded))
    // Ticked there, the same row says its final time, without “so far”.
    const tickAt = await h.evaluate((name) => { const li = [...document.querySelectorAll('li [data-task-tick]')].map((one) => one.closest('li')).find((one) => one?.querySelector('[data-task-title]')?.textContent === name); li?.scrollIntoView({ block: 'center' }); const r = li?.querySelector('[data-task-tick]').getBoundingClientRect(); return r ? [r.left + r.width / 2, r.top + r.height / 2] : null }, name)
    if (tickAt) await h.mouse.click(tickAt[0], tickAt[1])
    await wait(900)
    const doneRow = await dayRow()
    check('9 a done task\'s row on the day\'s page says its final time the same way, without “so far”', !!doneRow?.spent && /^Done · /.test(doneRow.meta) && doneRow.spent.startsWith(`${length(dayMinutes)} of `) && !/so far/.test(doneRow.meta), JSON.stringify(doneRow))
    if (SHOTS) await shot('journal-done-light')
    if (tickAt) { await rest(); await h.mouse.click(tickAt[0], tickAt[1]) }
    await wait(900)
    // Home's Next up: the dot on whichever task is first there.
    await go('home')
    await wait(1500)
    const first = await h.evaluate(() => { const tick = document.querySelector('.group\\/row [data-task-tick]'); const open = tick?.closest('.group\\/row')?.querySelector('[data-drag-open^="task:"]'); return open ? open.getAttribute('data-drag-open').slice(5) : null })
    const homeRow = () => h.evaluate((id) => {
      const rowEl = document.querySelector(`[data-drag-open="task:${id}"]`)?.closest('.group\\/row')
      if (!rowEl) return null
      rowEl.scrollIntoView({ block: 'center' })
      const dot = rowEl.querySelector('[data-session-dot] .mf-listening')?.getBoundingClientRect()
      const t = rowEl.querySelector('[data-task-tick]').getBoundingClientRect()
      const r = rowEl.getBoundingClientRect()
      return { dot: dot ? { r: dot.right, x: dot.left, y: dot.top + dot.height / 2, w: dot.width } : null, tick: { x: t.left, y: t.top + t.height / 2 }, row: [r.left, r.top, r.width, r.height].join(' '), name: rowEl.querySelector('[data-task-title]').getBoundingClientRect().left, tip: rowEl.querySelector('[data-task-spent-tip]')?.getAttribute('data-task-spent-tip') ?? null }
    }, first)
    const homeBefore = first && (await homeRow())
    if (first) { await ran(first, 2 * MIN + 10_000); await v('session:start', first, '', 25 * MIN) }
    await wait(600)
    const onHome = first && (await homeRow())
    const homeMinutes = first ? Math.round((await totalMs(first)) / MIN) : 0
    check('4 Home\'s “Next up”: the row of the task in a session has the dot in its margin, level with its tick, and the row did not move', !!onHome?.dot && onHome.dot.w === 6 && onHome.dot.r <= onHome.tick.x - 3 && onHome.dot.x >= 2 && Math.abs(onHome.dot.y - onHome.tick.y) < 2.5 && onHome.row === homeBefore.row && onHome.name === homeBefore.name, JSON.stringify({ first, onHome, homeBefore }))
    check('2 Home\'s “Next up”: the row has no small line, so the time is in its name\'s tip', !!onHome && homeMinutes >= 2 && onHome.tip === String(homeMinutes), JSON.stringify({ tip: onHome?.tip, homeMinutes }))
    if (SHOTS) await shot('home-light')
    // The same session, in the Tasks list: “All” has every open task, so the same task's row is there with its dot.
    await go('alltasks')
    await wait(900)
    if (first) await see(first)
    check('4 the same task in “All”: its row has the dot too (one session, every list that shows the row)', !!first && !!(await box(dot(first))))
    if (first) await v('session:cancel', (await running())?.id)
    await wait(400)
  })

  // ---- Every other list that shows a task (ask 47, second stage). In each: the dot where that list has room for it,
  // nothing of the row moved as it came, and the time last in the row's small line, or in its name's tip where it has none.

  if (PART.includes('journal')) await part('the Journal’s day, whole', async () => {
    // Today by the hour: a task with a time today is drawn in the day's line, not in the list of the day's tasks.
    await go('day')
    await wait(1500)
    const line = `li[data-line-task="${T}"]`
    const lineParts = { name: '[data-task-title]', lead: '[data-task-tick]' }
    const lineBefore = await rowIn(h, line, lineParts)
    let said = await inSession(T)
    const inLine = await rowIn(h, line, lineParts)
    check('1 the Journal’s day, “Today by the hour”: a task with a time has the dot in the page’s margin, level with its tick, nothing moved, and its time last in its small line', !!inLine?.dot && inLine.dot.w === 6 && inLine.seen && inLine.dot.x >= 2 && inLine.dot.r <= inLine.lead.x - 2 && Math.abs(inLine.dot.cy - inLine.lead.cy) < 3 && inLine.still === lineBefore?.still && inLine.spent === `${said} so far` && inLine.spentLast, JSON.stringify({ inLine, before: lineBefore?.still, said }))
    await snap('the day, by the hour', h, line)
    await over()
    // “Today’s tasks”: a task with no time stays in the list under the line; whichever open one it shows first.
    const todaysName = await h.evaluate(() => { const li = [...document.querySelectorAll('li:not([data-line-task])')].find((one) => one.querySelector('[data-task-meta]') && one.querySelector('[data-task-tick]')?.getAttribute('aria-checked') === 'false'); li?.setAttribute('data-t1', 'todays'); return li?.querySelector('[data-task-title]')?.textContent ?? null })
    const K = todaysName && (await v('tasks')).find((one) => one.status === 'open' && one.title.includes(todaysName))
    const todays = 'li[data-t1="todays"]'
    const todaysBefore = await rowIn(h, todays, lineParts)
    said = K ? await inSession(K.id) : ''
    const inTodays = await rowIn(h, todays, lineParts)
    check('1 the Journal’s day, “Today’s tasks”: a task with no time has the dot in the page’s margin, level with its tick, nothing moved, and its time last in its small line', !!K && !!inTodays?.dot && inTodays.dot.w === 6 && inTodays.seen && inTodays.dot.x >= 2 && inTodays.dot.r <= inTodays.lead.x - 2 && Math.abs(inTodays.dot.cy - inTodays.lead.cy) < 3 && inTodays.still === todaysBefore?.still && (inTodays.spent === `${said} so far` || inTodays.spent?.startsWith(`${said} of `)) && inTodays.spentLast, JSON.stringify({ name: todaysName, inTodays, before: todaysBefore?.still, said }))
    await snap('the day, its tasks', h, todays)
    await over()
    // What was done: its line in the day's log, and its row in “Done” (or struck in the day's tasks), say its final time.
    await v('task:done', E)
    await wait(900)
    const done = await h.evaluate((id) => {
      const log = [...document.querySelectorAll('li[data-log-row="done"]')].find((one) => one.textContent.includes('t1 under its length'))
      log?.scrollIntoView({ block: 'center' })
      const brief = [...document.querySelectorAll('li')].find((one) => one.querySelector('[data-task-tick]') && one.querySelector('[data-task-title]')?.textContent === 't1 under its length')
      return { log: log?.querySelector('[data-task-spent]')?.textContent ?? null, logLast: !!log && !!log.querySelector('button')?.lastElementChild?.querySelector('[data-task-spent]'), island: document.querySelector(`[data-pick="task:${id}"] [data-task-spent]`)?.textContent ?? null, brief: brief?.querySelector('[data-task-meta]')?.textContent ?? null }
    }, E)
    check('1 the Journal’s day, what was done: its line in “The day, hour by hour” and its row in “Done” (or struck among the day’s tasks) both say “40 min of 1 h”, last, as Tasks says it', done.log === '40 min of 1 h' && done.logLast && (done.island === '40 min of 1 h' || /^Done · 40 min of 1 h$/.test(done.brief ?? '')), JSON.stringify(done))
    await h.evaluate(() => [...document.querySelectorAll('li[data-log-row="done"]')].find((one) => one.textContent.includes('t1 under its length'))?.setAttribute('data-t1', 'done-log'))
    await snap('the day, hour by hour and done', h, 'li[data-t1="done-log"]')
    if (SHOTS) await shot('journal-log-done-light')
    // A day still to come: what is planned for it.
    await c.send('day', dayKeyOf(nowMs() + 86_400_000))
    await wait(1500)
    const ahead = `[data-day-ahead] [data-pick="task:${D}"]`
    const aheadParts = { name: '.truncate', lead: 'svg' }
    const aheadBefore = await rowIn(h, ahead, aheadParts)
    said = await inSession(D)
    const onAhead = await rowIn(h, ahead, aheadParts)
    check('1 the Journal, a day ahead, “Planned”: the dot stands before the row’s mark in the room its own edge gives, level with it, nothing moved, and the time is last in the row', !!onAhead?.dot && onAhead.dot.w === 6 && onAhead.seen && onAhead.dot.x >= onAhead.row.x + 2 && onAhead.dot.r <= onAhead.lead.x - 2 && Math.abs(onAhead.dot.cy - onAhead.lead.cy) < 3 && onAhead.still === aheadBefore?.still && onAhead.spent === `${said} so far` && onAhead.lastInRow, JSON.stringify({ onAhead, before: aheadBefore?.still, said }))
    await snap('a day ahead', h, ahead)
    await over()
    // Another day, gone by: a task planned for it and still open, in that day's log.
    await c.send('day', dayKeyOf(nowMs() - 86_400_000))
    await wait(1500)
    // A busy day shows its latest lines, the rest under “Show all”: an all-day task goes first, so it may be there.
    if (await h.evaluate(() => ![...document.querySelectorAll('li[data-log-row]')].some((one) => one.textContent.includes('t1 gone by plan')))) await pressChip('button[data-log-more]')
    await h.evaluate(() => [...document.querySelectorAll('li[data-log-row]')].find((one) => one.textContent.includes('t1 gone by plan'))?.setAttribute('data-t1', 'gone-by'))
    const gone = 'li[data-t1="gone-by"]'
    const goneParts = { name: '.private-text', lead: 'svg' }
    const goneBefore = await rowIn(h, gone, goneParts)
    said = await inSession(Y)
    await h.evaluate(() => [...document.querySelectorAll('li[data-log-row]')].find((one) => one.textContent.includes('t1 gone by plan'))?.setAttribute('data-t1', 'gone-by'))
    const onGone = await rowIn(h, gone, goneParts)
    // And every task that day's “Done” holds says its time, if it has any: read against the app's own sum for each.
    const sums = (await v('sessions:spent').catch(() => null))?.spent ?? {}
    const doneThen = await h.evaluate(() => [...document.querySelectorAll('button[data-pick^="task:"]')].map((one) => ({ id: one.getAttribute('data-pick').slice(5), spent: one.querySelector('[data-task-spent]')?.textContent ?? null })))
    const unsaid = doneThen.filter((one) => Math.round((sums[one.id]?.[0] ?? 0) / MIN) >= 1 && !one.spent)
    check('1 the Journal, another day’s page: a task planned for that day has the dot in the margin of “The day, hour by hour”, nothing moved, and its time last in its line; every task in that day’s “Done” with time on it says it', !!onGone?.dot && onGone.dot.w === 6 && onGone.seen && onGone.dot.x >= 2 && onGone.dot.r <= onGone.row.x && Math.abs(onGone.dot.cy - onGone.lead.cy) < 4 && onGone.still === goneBefore?.still && onGone.spent === `${said} so far` && onGone.lastInRow && !unsaid.length, JSON.stringify({ onGone, before: goneBefore?.still, said, done: doneThen.length, unsaid }))
    await snap('another day', h, gone)
    await over()
  })

  if (PART.includes('box')) await part('quick capture’s Today', async () => {
    await v('settings:set', { boxOneLine: false })
    await c.page.evaluate(() => window.api.showPrompt())
    await wait(1300)
    if (!(await c.page.locator('[aria-label="Hide the side panel"]').count())) await c.page.locator('[aria-label="Show the side panel"]').click()
    await wait(900)
    const tab = c.page.locator('[data-box-panel] [role="tab"]', { hasText: /^Tasks/ }).first()
    if (await tab.count()) { await tab.click(); await wait(700) }
    const sel = `[data-box-panel] div:has(> [data-row][data-id="${A}"])`
    const parts = { name: '[data-task-title]', lead: '[data-task-tick]' }
    const before = await rowIn(c.page, sel, parts)
    const said = await inSession(A)
    const now = await rowIn(c.page, sel, parts)
    check('2 quick capture’s Today: the dot stands in the day’s number column (or leads the small line where the list keeps no column), left of the name, the name and tick unmoved, and the time is last in the small line', !!now?.dot && now.dot.w === 6 && now.seen && now.dot.x >= now.row.x + 1 && now.dot.r <= now.name.x && now.still === before?.still && now.spent === `${said} so far` && now.spentLast, JSON.stringify({ now, before: before?.still, said }))
    await snap('quick capture’s Today', c.page, sel)
    await over()
  })

  if (PART.includes('sticky')) await part('the desk sticky', async () => {
    await go('today')
    await wait(600)
    await h.evaluate(() => window.api.stick('today', 'today', true))
    let sticky
    for (let n = 0; n < 40 && !sticky; n++) { sticky = electron.windows().find((one) => /view=sticky/.test(one.url()) && /type=today/.test(one.url())); if (!sticky) await wait(250) }
    if (!sticky) throw new Error('no sticky of Today came up')
    await sticky.evaluate(`(${shiftClock.toString()})(${base + ahead})`).catch(() => {})
    await wait(1500)
    const sel = `li:has([data-sticky-task="${A}"])`
    const parts = { name: '[data-sticky-task]', lead: '[data-task-tick]' }
    const before = await rowIn(sticky, sel, parts)
    await inSession(A)
    const minutes = Math.round((await totalMs(A)) / MIN)
    const now = await rowIn(sticky, sel, parts)
    check('2 the desk sticky: the dot stands in the paper’s side room, level with the tick, nothing moved, and the time is in the name’s tip (the row has no small line)', !!now?.dot && now.dot.w === 6 && now.seen && now.dot.x >= 2 && now.dot.r <= now.lead.x - 2 && Math.abs(now.dot.cy - now.lead.cy) < 3 && now.still === before?.still && now.tip === String(minutes) && now.spent === null, JSON.stringify({ now, before: before?.still, minutes }))
    await snap('the desk sticky', sticky, sel)
    if (SHOTS) await sticky.screenshot({ path: `${SHOTS}/sticky-light.png` })
    await over()
    await h.evaluate(() => window.api.stick('today', 'today', false))
    await wait(500)
  })

  if (PART.includes('week')) await part('the week’s tasks', async () => {
    await go('weekpage')
    await wait(1500)
    const sel = `[data-week-task="${A}"]`
    const parts = { name: '.private-text', lead: 'button' }
    const before = await rowIn(h, sel, parts)
    const said = await inSession(A)
    const now = await rowIn(h, sel, parts)
    check('2 the week’s tasks: the dot in the page’s margin, level with the tick, nothing moved, and the time last in the small line', !!now?.dot && now.dot.w === 6 && now.seen && now.dot.x >= 2 && now.dot.r <= now.lead.x - 2 && Math.abs(now.dot.cy - now.lead.cy) < 3 && now.still === before?.still && now.spent === `${said} so far` && now.spentLast, JSON.stringify({ now, before: before?.still, said }))
    await snap('the week’s tasks', h, sel)
    await over()
  })

  if (PART.includes('matrix')) await part('the Matrix', async () => {
    await go('today')
    await wait(900)
    if (!(await todayMatrix(true))) throw new Error('no “Urgent and important” in Today’s “More” menu')
    try {
      const sel = `button[data-row][data-id="${A}"]`
      const parts = { name: '[data-task-title]', lead: null }
      const before = await rowIn(h, sel, parts)
      const said = await inSession(A)
      const now = await rowIn(h, sel, parts)
      check('2 the Matrix: a card has no margin, so the dot leads its small line under the name; the name and the card did not move, and the time is last in that line', !!now?.dot && now.dot.w === 6 && now.seen && now.dotLeads && now.dot.x >= now.row.x + 4 && now.still === before?.still && now.spent === `${said} so far` && now.spentLast, JSON.stringify({ now, before: before?.still, said }))
      await snap('the Matrix', h, sel)
      await over()
    } finally {
      await todayMatrix(false)
    }
  })

  if (PART.includes('tag')) await part('a tag’s page', async () => {
    await c.send('tag', 't1tag')
    await h.waitForSelector('[data-tag-page]', { timeout: 15000 }).catch(() => {})
    await wait(900)
    const sel = `[data-tag-page] [data-id="${G}"]`
    const parts = { name: '.private-text', lead: null }
    const before = await rowIn(h, sel, parts)
    const said = await inSession(G)
    const now = await rowIn(h, sel, parts)
    check('2 a tag’s page: a task there is a row with a picture tile and no tick, so the dot leads its small line, under the start of its name (never at the row’s far end); the name did not move, and the time is last in its small line', !!now?.dot && now.dot.w === 6 && now.seen && now.dot.x >= now.name.x - 2 && now.dot.x <= now.name.x + 12 && now.dot.y >= now.name.b - 2 && now.still === before?.still && now.spent === `${said} so far`, JSON.stringify({ now, before: before?.still, said }))
    await snap('a tag’s page', h, sel)
    if (SHOTS) await shot('tag-page-light')
    // The same tag under “Manage”, where what it holds is a plain list of one-line rows.
    if (await pressChip('button[aria-label="Manage"]')) {
      const line = `button[data-pick="task:${G}"]`
      const minutes = Math.round((await totalMs(G)) / MIN)
      const managed = await rowIn(h, line, { name: '.private-text', lead: 'svg' })
      check('2 the Tags page, “Manage”: a task’s one-line row has the dot in the margin beside it, level with its mark, and its time in its name’s tip', !!managed?.dot && managed.dot.w === 6 && managed.seen && managed.dot.x >= 2 && managed.dot.r <= managed.row.x && Math.abs(managed.dot.cy - managed.lead.cy) < 3 && managed.tip === String(minutes), JSON.stringify({ managed, minutes }))
      await snap('Tags, “Manage”', h, line)
      await pressChip('button[aria-label="Read"]')
    } else check('2 the Tags page, “Manage”: its chip is there to press', false)
    await over()
  })

  if (PART.includes('fits')) await part('“What fits”', async () => {
    await go('today')
    await wait(700)
    await inSession(B)
    const minutes = Math.round((await totalMs(B)) / MIN)
    await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:fits', { detail: 60 })))
    await wait(1200)
    const sel = `[data-fit-row="${B}"]`
    const now = await rowIn(h, sel, { name: '.line-clamp-2', lead: '[data-quad]' })
    check('2 “What fits”: the task already in a session has the dot with the row’s marks, after its box’s mark and before its name, and its time in the name’s tip', !!now?.dot && now.dot.w === 6 && now.seen && now.dot.x >= now.lead.r && now.dot.r <= now.name.x && now.tip === String(minutes), JSON.stringify({ now, minutes }))
    await snap('“What fits”', h, sel)
    await h.keyboard.press('Escape')
    await wait(500)
    await over()
  })

  if (PART.includes('everything')) await part('Everything', async () => {
    await go('all')
    await wait(1500)
    const parts = { name: null, lead: '[data-task-tick]', up: 'div.relative' }
    const sel = `[data-id="${A}"]`
    const before = await rowIn(h, sel, parts)
    const said = await inSession(A)
    const now = await rowIn(h, sel, parts)
    check('2 Everything: the dot stands beside the tick, in the room the row keeps for a note’s picture, level with it, nothing moved, and the time is last in the small line', !!now?.dot && now.dot.w === 6 && now.seen && now.dot.x >= now.lead.r + 2 && Math.abs(now.dot.cy - now.lead.cy) < 3 && now.still === before?.still && !!now.spent && now.spent === `${said} so far`, JSON.stringify({ now, before: before?.still, said }))
    await snap('Everything', h, sel, 'div.relative')
    await over()
  })

  if (PART.includes('stats')) await part('Stats’ lists of tasks', async () => {
    await go('stats')
    await wait(600)
    // The lists of focus time are on “Your month”, a chip away from “At a glance”.
    await pressChip('[data-chips="stats"] [data-chip="month"]')
    let id = null
    for (let n = 0; n < 40 && !id; n++) { await wait(250); id = await h.evaluate(() => document.querySelector('[data-task-time]')?.getAttribute('data-task-time') ?? null) }
    if (!id) { if (SHOTS) await h.screenshot({ path: `${SHOTS}/missing-stats.png` }); throw new Error('Stats shows no “How long each task took” list') }
    const sel = `[data-task-time="${id}"]`
    const parts = { name: '.truncate', lead: null }
    const before = await rowIn(h, sel, parts)
    await inSession(id)
    const now = await rowIn(h, sel, parts)
    check('2 Stats, “How long each task took”: the dot stands in the card’s side room before the task’s name, level with it, and nothing moved (the row says its own time already)', !!now?.dot && now.dot.w === 6 && now.seen && now.dot.r <= now.name.x - 2 && Math.abs(now.dot.cy - now.name.cy) < 4 && now.still === before?.still, JSON.stringify({ now, before: before?.still }))
    await snap('Stats', h, sel)
    await over()
  })

  if (PART.includes('search')) await part('⌘K', async () => {
    await go('today')
    await wait(700)
    const said = await inSession(A)
    await h.keyboard.press('Meta+k')
    await wait(800)
    await h.keyboard.type('t1 alpha')
    await wait(1500)
    await h.evaluate(() => [...document.querySelectorAll('[data-row-title]')].find((one) => one.textContent.trim() === 't1 alpha')?.closest('button')?.setAttribute('data-t1', 'found'))
    const sel = 'button[data-t1="found"]'
    const at = await centre(`${sel} [data-row-title]`)
    if (at) { await h.mouse.move(at[0] + 2, at[1] + 1); await h.mouse.move(at[0], at[1]); await wait(700) }
    const now = await rowIn(h, sel, { name: '[data-row-title]', lead: 'svg' })
    const facts = await h.evaluate(() => document.querySelector('[data-task-facts]')?.textContent ?? null)
    check('2 ⌘K: the dot stands with the task’s marks after its words (a title there starts where a note’s does), and its time is last of the facts in its preview', !!now?.dot && now.dot.w === 6 && now.seen && now.dot.x >= now.name.r && (facts ?? '').endsWith(`${said} so far`), JSON.stringify({ now, facts, said }))
    await snap('⌘K', h, sel)
    await h.keyboard.press('Escape')
    await wait(500)
    await over()
  })

  if (PART.includes('page')) await part('the task’s own page', async () => {
    await go('today')
    await wait(900)
    await see(A)
    await inSession(A)
    await snap('Tasks’ own row', h, row(A))
    await h.locator(`${row(A)} [data-title]`).click()
    await wait(1300)
    const read = () => h.evaluate(() => {
      const part = document.querySelector('[data-task-sessions]')
      const live = part?.querySelector('[data-live-dot]')
      const style = live && getComputedStyle(live)
      return { dot: !!live && live.classList.contains('mf-listening'), name: style?.animationName ?? null, opacity: style ? Number(style.opacity) : null, colour: style?.backgroundColor ?? null, red: !!part?.querySelector('.animate-pulse'),
        heading: (part?.innerText.match(/Sessions\s*·\s*([\d,]+)/) ?? [])[1] ?? null, focus: ((document.querySelector('[data-task-focus] p')?.innerText ?? '').match(/in ([\d,]+) sessions?/) ?? [])[1] ?? null,
        row: (() => { const one = document.querySelector('[data-task-row] [data-session-dot] .mf-listening'); return one ? getComputedStyle(one).backgroundColor : null })() }
    })
    const live = await read()
    await v('session:pause', (await running())?.id)
    await wait(500)
    const held = await read()
    await v('session:resume', (await running())?.id)
    await wait(300)
    check('3 the task’s own page marks a running session with the same dot as its row (the welcome’s, the accent, breathing), still and dimmed when paused; no red pulse', live.dot && live.name === 'mf-listen' && !live.red && live.colour === live.row && held.dot && held.name === 'none' && Math.abs(held.opacity - 0.4) < 0.01, JSON.stringify({ live, held }))
    check('3 “Sessions · N” and “in N sessions” on the task’s page are one number', !!live.heading && live.heading === live.focus, JSON.stringify({ heading: live.heading, focus: live.focus }))
    await snap('the task’s own page', h, '[data-task-sessions]')
    await h.keyboard.press('Escape')
    await wait(400)
    await over()
  })

  if (PART.includes('bubble')) await part('the dot goes when the bubble goes', async () => {
    await go('today')
    await wait(900)
    await see(A)
    // Twice: once read by main every few milliseconds for the two times, once with a picture of each window at every step to look at.
    const watch = async (pictures) => {
      await inSession(A)
      await h.evaluate(() => window.api.showFocus(true))
      await wait(900)
      const id = (await running())?.id
      const clip = pictures ? await h.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: Math.max(0, Math.round(r.left - 46)), y: Math.round(r.top), width: 260, height: Math.round(r.height) } }, row(A)) : null
      return electron.evaluate(async ({ BrowserWindow }, [rowSel, id, clip]) => {
        const all = BrowserWindow.getAllWindows()
        const home = all.find((one) => one.webContents.getURL().includes('view=home'))
        const pill = all.find((one) => one.webContents.getURL().includes('view=focus'))
        if (!home || !pill) return null
        const dotThere = `!!document.querySelector(${JSON.stringify(`${rowSel} [data-session-dot]`)})`
        const bubbleSaid = `(() => { const one = document.querySelector('[data-island]'); return one ? 'session:' + (one.getAttribute('data-over') ?? '') : document.querySelector('[data-after]') ? 'after' : 'none' })()`
        const from = performance.now()
        const seen = []
        let ended = null
        for (let n = 0; performance.now() - from < (clip ? 1600 : 2200); n++) {
          const [dot, bubble] = await Promise.all([home.webContents.executeJavaScript(dotThere), pill.webContents.executeJavaScript(bubbleSaid)])
          const at = Math.round((performance.now() - from) * 10) / 10
          const soon = (shot) => Promise.race([shot.then((image) => image.toPNG().toString('base64')), new Promise((none) => setTimeout(() => none(''), 300))])
          const shots = clip ? await Promise.all([soon(home.webContents.capturePage(clip)), soon(pill.webContents.capturePage())]) : ['', '']
          seen.push({ at, dot, bubble, home: shots[0], pill: shots[1] })
          if (ended === null && at > (clip ? 250 : 300)) { ended = at; void pill.webContents.executeJavaScript(`window.api.haligtree('session:end', ${JSON.stringify(id)}, '', false)`) }
        }
        return { seen, ended }
      }, [row(A), id, clip])
    }
    const read = await watch(false)
    const first = (list, gone) => list.find((one) => one.at > read.ended && gone(one))?.at ?? null
    const dotGone = read && first(read.seen, (one) => !one.dot)
    const start = read?.seen.find((one) => one.at <= read.ended)?.bubble
    const bubbleGone = read && first(read.seen, (one) => one.bubble !== start)
    const apart = dotGone !== null && bubbleGone !== null ? Math.round((dotGone - bubbleGone) * 10) / 10 : null
    const step = read ? Math.round((read.seen.at(-1).at / read.seen.length) * 10) / 10 : null
    check(`4 the dot goes when the bubble goes: read by the main process every ${step} ms, the row’s dot left ${apart} ms after the bubble’s session did (two windows, one change notice: each draws it with its own reads, so not one frame; under a tenth of a second)`, apart !== null && start?.startsWith('session') && Math.abs(apart) <= 100, JSON.stringify({ ended: read?.ended, dotGone, bubbleGone, start, steps: read?.seen.length }))
    await wait(600)
    const filmed = await watch(true)
    if (filmed && SHOTS) {
      await h.evaluate((frames) => {
        const sheet = Object.assign(document.createElement('div'), { id: 't1-sheet' })
        sheet.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:var(--background);display:flex;flex-wrap:wrap;align-content:flex-start;gap:8px 12px;padding:10px;font:11px/1.3 ui-monospace,monospace;color:var(--foreground);overflow:hidden'
        for (const one of frames) {
          const cell = document.createElement('div')
          for (const [png, wide] of [[one.home, 260], [one.pill, 200]]) { if (!png) { cell.append('(put away: no picture) '); continue } const img = new Image(); img.src = `data:image/png;base64,${png}`; img.style.cssText = `display:block;width:${wide}px;margin-bottom:2px`; cell.append(img) }
          cell.append(`${one.at} ms  dot ${one.dot ? 'there' : 'gone'}  bubble ${one.bubble}`)
          sheet.append(cell)
        }
        document.body.append(sheet)
        // From a little before the end was sent: the frames that show the two going, not the ones before them.
      }, filmed.seen.filter((one) => one.at >= filmed.ended - 80))
      await wait(600)
      await h.screenshot({ path: `${SHOTS}/bubble-and-dot-sheet.png` })
      await h.evaluate(() => document.getElementById('t1-sheet')?.remove())
    }
    const lastBoth = filmed?.seen.filter((one) => one.dot && one.bubble.startsWith('session')).at(-1)?.at ?? null
    const firstNeither = filmed?.seen.find((one) => one.at > filmed.ended && !one.dot && !one.bubble.startsWith('session'))?.at ?? null
    const mixed = filmed?.seen.filter((one) => one.at > filmed.ended && one.dot !== one.bubble.startsWith('session')).length ?? -1
    check('4 pictures of both windows at each step, stamped by the main process: both show the session, then neither, with at most two steps between where one has gone and the other not yet', !!filmed && lastBoth !== null && firstNeither !== null && mixed <= 2, JSON.stringify({ ended: filmed?.ended, lastBoth, firstNeither, mixed, steps: filmed?.seen.map((one) => `${one.at}:${one.dot ? 'd' : '-'}${one.bubble.startsWith('session') ? 'b' : '-'}`) }))
    await over()
  })

  if (PART.includes('look')) await part('the looks and sizes', async () => {
    // Both looks, the brutal style, the smallest window and the interface a size up: the dot keeps its shape and place, the time stays last.
    await go('today')
    await wait(700)
    await ran(B, 2 * MIN + 10_000, 'run', 25 * MIN)
    await nudge()
    await see(B)
    const shape = async (name) => {
      const d = await box(`${dot(B)} .mf-listening`)
      const t = await box(`${row(B)} [data-task-tick]`)
      const page = await h.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      const when = await box(`${row(B)} [data-task-when]`)
      const time = await box(`${row(B)} [data-task-spent]`)
      const rowBox = await box(row(B))
      return check(`${name}: the dot is a round ${d ? d.w : '?'}px dot under the tick, in the window; the date keeps its place and the time is last, inside the row`,
        !!d && Math.abs(d.w - d.h) < 0.01 && Number.isInteger(d.w) && d.x >= 2 && Math.abs((d.x + d.w / 2) - (t.x + t.w / 2)) < 1 && d.y >= t.b && page <= 0 && !!when && !!time && when.x >= rowBox.x && time.r <= rowBox.r + 0.5 && (time.y > when.y + 4 || time.x > when.r), JSON.stringify({ d, tick: t && t.x, when, time, page }))
    }
    await shape('light')
    if (SHOTS) await shot('look-light', await around(B))
    await snap('Tasks’ own row', h, row(B))
    await c.look('dark')
    await shape('dark')
    const filmedDark = (await box(dot(B))) ? await film('breath-dark', B) : []
    check('dark: beside the welcome\'s own dot the two are one in every frame for more than a breath', filmedDark.length >= 20 && filmedDark.every((one) => Math.abs(one.seen[0] - one.seen[1]) <= 0.03) && Math.min(...filmedDark.map((one) => one.seen[0])) < 0.4)
    if (SHOTS) await shot('today-running-dark')
    await c.look('light')
    await h.evaluate(() => (document.documentElement.dataset.style = 'brutal'))
    await wait(400)
    await shape('the brutal style')
    if (SHOTS) await shot('look-brutal', await around(B))
    await h.evaluate(() => delete document.documentElement.dataset.style)
    await h.keyboard.press('Meta+Equal')
    await h.keyboard.press('Meta+Equal')
    await wait(600)
    await see(B)
    await shape('the interface two sizes up')
    if (SHOTS) await shot('look-size-up', await around(B))
    await h.keyboard.press('Meta+0')
    await wait(500)
    await c.size(560, 400)
    await wait(600)
    await see(B)
    await shape('560 by 400')
    if (SHOTS) await shot('look-560')
    // A small line too long for the row there: it wraps, the time last and whole on a later line, the date where a short line has it.
    await see(W)
    const wrapped = await h.evaluate(([long, short]) => {
      const at = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, lines: el.getClientRects().length } }
      const meta = document.querySelector(`${long} [data-task-meta]`)
      return { when: at(`${long} [data-task-when]`), time: at(`${long} [data-task-spent]`), row: at(long), other: at(`${short} [data-task-when]`), said: document.querySelector(`${long} [data-task-spent]`)?.textContent ?? null,
        last: !!meta && meta.lastElementChild === document.querySelector(`${long} [data-task-spent]`), over: document.documentElement.scrollWidth - document.documentElement.clientWidth }
    }, [row(W), row(E)])
    check('560 by 400, a small line that wraps: the time is last, whole, on a later line and inside the row; the date stays on the edge every row\'s date starts on', !!wrapped.time && wrapped.said === '12 min so far' && wrapped.last && wrapped.time.lines === 1 && wrapped.time.y >= wrapped.when.b - 2 && wrapped.time.r <= wrapped.row.r && wrapped.time.x >= wrapped.when.x - 0.5 && (!wrapped.other || Math.abs(wrapped.other.x - wrapped.when.x) < 0.5) && wrapped.over <= 0, JSON.stringify(wrapped))
    if (SHOTS) await shot('look-560-wrapped')
    await c.size(1400, 900)
    await v('session:cancel', (await running())?.id)
  })
  await part('the sheets of every list', sheets)
} finally {
  await c.close()
}
done()

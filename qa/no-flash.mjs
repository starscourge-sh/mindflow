// A page opened cold draws once, as it will stay: never a plain list that
// then sorts into groups, a box that pops in above it, an empty state or a
// "0" that shows before the real thing, or a picture that pushes text down.
//
// Each frame from the moment a page is asked for, its whole visible structure
// is written down: every element with words of its own (headings, rows,
// chips, boxes, counts, empty-state text), each field, and each picture's box
// size, with where it sits in the page's layout (transforms left out, so a
// row sliding in is not a move). Anything ever drawn must still be there in
// the last frame, at the same place, saying the same thing. Rows may still
// be added below what was drawn; words may type in (one text growing into the
// next). Every page and panel is covered: each page of the main window, a
// group's page, a tag's page, the calendar at day, week and month, the
// sidebar and Home as the window comes up, quick capture's box and its tabs,
// a note in its own window, and the bubble.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 UNEVEN=1 node qa/no-flash.mjs
//   PAGES=home,today ROUNDS=3 ... to run some pages several times (each round its own random speeds).
//   MOMENTS=0 leaves out the other moments (book switch, sandbox Reset, ⌘Z after a Bin move, sort, theme).
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, page: box, send, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const ROUNDS = Number(process.env.ROUNDS ?? 1)
const REPORT_ONLY = new Set(['powers'])

/**
 * In a window: `__flashWatch(selector, ms)` writes down the shape of what the
 * selector finds, every frame for `ms`, into `__flashFrames` (only frames
 * that differ). Installed in every window before its own code runs, so a
 * window opened or reloaded is watched from its very first frame.
 */
const RECORDER = () => {
  if (window.__flashWatch) return
  const layoutOf = (el) => {
    let x = 0, y = 0
    for (let n = el; n instanceof HTMLElement; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop }
    // A long list's rows are placed by a transform (VirtualList): that is where they sit, not a motion.
    for (let n = el; n; n = n.parentElement) if (n.dataset?.index !== undefined) y += Number(n.style.transform.match(/translateY\((-?[\d.]+)px/)?.[1] ?? 0)
    return { x, y }
  }
  // A root inside another (quick capture's side panel in its window) is judged on its own: the outer one leaves it out.
  const shape = (root, inner = []) => {
    const base = layoutOf(root)
    const out = []
    // A rolling number (slot-text) is one thing, said by its label, not a column of letters.
    const rolls = new Set([...[...root.querySelectorAll('.char-slot')].map((one) => one.closest('[aria-label]')), ...root.querySelectorAll('[data-rolling]')].filter(Boolean))
    for (const el of root.querySelectorAll('*')) {
      if (!(el instanceof HTMLElement) || out.length >= 400) continue
      if (!rolls.has(el) && el.closest('.char-slot')) continue
      if (inner.some((one) => one.contains(el))) continue
      // A page waiting, unseen, for its reads (lib/reads-in.tsx) is not drawn yet.
      if (el.closest('[style*="visibility: hidden"]')) continue
      const tag = rolls.has(el) ? 'roll' : el.localName
      const pic = tag === 'img' || tag === 'video' || tag === 'canvas' || tag === 'iframe'
      const field = (tag === 'input' && !['hidden', 'checkbox', 'radio', 'range'].includes(el.type)) || tag === 'textarea'
      let own = ''
      if (tag === 'roll') own = el.getAttribute('aria-label')
      else if (!pic) for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue
      own = own.replace(/\s+/g, ' ').trim()
      if (!own && !pic && !field) continue
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      // Watched only where it can be seen; a long list's rows far below are not drawn yet anyway.
      if (r.top > innerHeight + 400) continue
      const at = layoutOf(el)
      // A picture's laid-out box, not its drawn one: one easing in by a scale is not resized.
      const text = pic ? `${el.offsetWidth}x${el.offsetHeight}` : field ? `[${el.placeholder ?? ''}]` : own.slice(0, 80)
      out.push([tag, Math.round(at.x - base.x), Math.round(at.y - base.y), text])
    }
    return out
  }
  window.__flashWatch = (selector, ms = 3200) => {
    const frames = []
    window.__flashFrames = frames
    const t0 = performance.now()
    let last = ''
    const tick = () => {
      // Named by which selector found them, so a root that comes later does not renumber the rest.
      const outer = selector.split(',').flatMap((one, n) => [...document.querySelectorAll(one.trim())].map((el, k) => [`${n}.${k}`, el]))
      // A part that says it comes in whole on its own (`data-apart`: a list beside the note it was
      // opened onto, what sits under a note's words) is judged as a root of its own, by its name:
      // a panel that comes in whole beside what was drawn is one step of its own.
      const found = [...outer, ...outer.flatMap(([name, root]) => [...root.querySelectorAll('[data-apart]')].map((el) => [`${name}:${el.dataset.apart}`, el]))]
      const roots = found.map(([, el]) => el)
      // The window's own size too: a window that grows or shrinks as it opens moves everything in it.
      const els = [['w', 'window', 0, 0, `${innerWidth}x${innerHeight}`], ...found.flatMap(([name, root]) => shape(root, roots.filter((one) => one !== root && root.contains(one))).map((one) => [name, ...one]))]
      // The rows in the order they show, and the group heads over them: a list sorted a beat late keeps its words but not its order.
      // Each row once, under the innermost root holding it.
      const rows = roots.flatMap((root) => [...root.querySelectorAll('[data-id]')].filter((one) => !roots.some((other) => other !== root && root.contains(other) && other.contains(one))).filter((one) => one.getBoundingClientRect().height > 0 && !one.closest('[style*="visibility: hidden"]')).map((one) => [one.getAttribute('data-id'), one.getBoundingClientRect().top]))
        .sort((a, b) => a[1] - b[1]).slice(0, 12).map((one) => one[0])
      const heads = roots.flatMap((root) => [...root.querySelectorAll('[data-island-head], [data-group-row], [data-group-block]')].filter((one) => !one.closest('[style*="visibility: hidden"]')).map((one) => one.getAttribute('data-island-head') || one.textContent.trim().slice(0, 30)))
      const now = JSON.stringify([els, rows, heads])
      if (now !== last && els.length > 1) frames.push({ at: Math.round(performance.now() - t0), els, rows, heads }), (last = now)
      if (performance.now() - t0 < ms) requestAnimationFrame(after)
    }
    // Read just after each frame is painted: read at the frame's start, a state the frame's own
    // layout and size observers put right before painting it (a line folding its buttons) was
    // counted as drawn though it never was.
    const paint = new MessageChannel()
    paint.port1.onmessage = tick
    const after = () => paint.port2.postMessage(0)
    tick()
    requestAnimationFrame(after)
  }
  // A window loaded while `flash-auto` names what to watch is watched from its first frame.
  try {
    const auto = JSON.parse(localStorage.getItem('flash-auto') ?? 'null')
    const mine = auto && Object.entries(auto).find(([url]) => location.href.includes(url))
    if (mine) {
      const start = () => window.__flashWatch(mine[1], 3600)
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
      else start()
    }
  } catch { /* Nothing to watch. */ }
}

/**
 * What changed between drawn frames and the last: each thing drawn that is
 * gone, moved, resized or says something else by the end. Rows added below,
 * and words typing in, are fine.
 */
function faults(frames, { window: sized = true, orderOnly = false, settled = false } = {}) {
  if (!frames?.length) return ['nothing drawn']
  // A window put at its size in steps as it opens (the run parks it out of sight): judged from the frame its size settles.
  if (settled) {
    const size = (frame) => frame.els.find((one) => one[0] === 'w')?.[4]
    const end = size(frames.at(-1))
    frames = frames.slice(frames.findLastIndex((frame) => size(frame) !== end) + 1)
  }
  // A list that changes width as a pane closes moves every word on purpose: only its rows' order and heads are judged then.
  if (orderOnly) frames = frames.map((frame) => ({ ...frame, els: frame.els.filter((one) => one[0] === 'w') }))
  // The window's own size left out where it is meant to change (the bubble opens a moment as a session starts, then folds).
  if (!sized) frames = frames.map((frame) => ({ ...frame, els: frame.els.filter((one) => one[0] !== 'w') }))
  const last = frames.at(-1).els
  const said = new Set()
  const out = []
  const say = (at, what) => {
    const tag = what.replace(/-?\d+px/g, '')
    if (said.has(tag)) return
    said.add(tag)
    out.push(`${at}ms ${what}`)
  }
  const keyOf = (one) => `${one[0]}|${one[1]}|${one[4]}`
  const near = (a, b) => a[0] === b[0] && Math.abs(a[2] - b[2]) <= 3 && Math.abs(a[3] - b[3]) <= 3
  const lastBy = new Map()
  for (const one of last) lastBy.set(keyOf(one), [...(lastBy.get(keyOf(one)) ?? []), one])
  // The rows, in order, and their heads: what was drawn first keeps its place.
  const end = frames.at(-1)
  const firstRows = frames.find((one) => one.rows.length)
  if (firstRows && (JSON.stringify(firstRows.heads) !== JSON.stringify(end.heads) || !firstRows.rows.every((id, i) => end.rows[i] === id)))
    say(firstRows.at, `rows or heads drawn ${JSON.stringify([firstRows.rows.slice(0, 4), firstRows.heads.slice(0, 4)])} then ${JSON.stringify([end.rows.slice(0, 4), end.heads.slice(0, 4)])}`)
  frames.forEach((frame, f) => {
    if (f === frames.length - 1) return
    for (const one of frame.els) {
      const same = lastBy.get(keyOf(one)) ?? []
      if (same.some((two) => near(one, two))) continue
      if (same.length) {
        const to = same.reduce((a, b) => (Math.abs(b[3] - one[3]) + Math.abs(b[2] - one[2]) < Math.abs(a[3] - one[3]) + Math.abs(a[2] - one[2]) ? b : a))
        say(frame.at, `"${one[4].slice(0, 40)}" moved ${to[3] - one[3]}px down${to[2] !== one[2] ? `, ${to[2] - one[2]}px right` : ''}`)
        continue
      }
      // Something at the same place saying something else: changed, unless it only typed on.
      const there = last.find((two) => two[1] === one[1] && near(one, two))
      if (there && there[4].startsWith(one[4])) continue
      // A clock turning over ("09:33" to "09:34") is the time passing, not a late read.
      // In a line too ("22 October · 16:34 · 38°C" to "· 16:35 ·"): only the time differs.
      const clockless = (words) => words.replace(/\b\d{1,2}:\d{2}\b/g, '0:00')
      if (there && /\d:\d{2}/.test(one[4]) && clockless(one[4]) === clockless(there[4])) continue
      say(frame.at, there ? `${one[1]} "${one[4].slice(0, 40)}" became "${there[4].slice(0, 40)}"` : `${one[1]} "${one[4].slice(0, 40)}" at ${one[3]}px drawn then gone`)
    }
    // Popped in among what was already drawn, above its last line: a box, a chip, a line that came a beat late.
    const next = frames[f + 1]
    // Each root on its own: a panel that comes in whole beside what was drawn is one step of its own.
    const bottomOf = (root) => Math.max(-Infinity, ...frame.els.filter((one) => one[0] === root).map((one) => one[3]))
    const before = new Set(frame.els.map(keyOf))
    for (const one of next.els) {
      // A picture filling in where it was going to be is a picture loading, not a late read; if it pushed anything, that thing moved.
      if (before.has(keyOf(one)) || one[3] >= bottomOf(one[0]) - 3 || ['img', 'video', 'canvas', 'iframe'].includes(one[1])) continue
      if (frame.els.some((two) => two[1] === one[1] && near(one, two))) continue
      say(next.at, `${one[1]} "${one[4].slice(0, 40)}" popped in at ${one[3]}px, among what was drawn`)
    }
  })
  return out
}

const report = (name, frames, only = false, options) => {
  const found = faults(frames, options)
  // DUMP=1: each frame that changed, as its lines (tag, x, y, words), to see what moved.
  if (process.env.DUMP && found.length) for (const frame of frames) console.log(`  -- ${frame.at}ms\n` + frame.els.map((one) => `     ${one[0]} ${one[1]} ${one[2]},${one[3]} ${one[4].slice(0, 60)}`).join('\n'))
  const ok = !found.length
  if (only) return console.log(`NOTE  ${name}: ${ok ? 'drawn once' : found.slice(0, 6).join('; ')}`)
  return check(`${name}: drawn once as it stays`, ok, ok ? `${frames.length} frame(s)` : `${found.length} change(s): ${found.slice(0, 6).join('; ')}`)
}

/** Each window loaded from now on is watched from its first frame, by its address. */
const autoWatch = async (map) => {
  for (const win of electron.windows()) await win.evaluate((m) => localStorage.setItem('flash-auto', JSON.stringify(m)), map).catch(() => {})
}
const framesOf = (win) => win.evaluate(() => window.__flashFrames ?? null)
const winBy = async (match, tries = 40) => {
  for (let i = 0; i < tries; i++) {
    const found = electron.windows().find((w) => match(w.url()))
    if (found) return found
    await wait(250)
  }
  return null
}

try {
  await electron.context().addInitScript(`(${RECORDER.toString()})()`)
  await h.evaluate(RECORDER)
  // Writing with a group of its own, as an imported book has: the case that flashed as a plain list first.
  const notes = []
  for (const title of ['Flash one', 'Flash two', 'Flash three']) { const id = await v('article:new'); await v('item:save', id, { title }); notes.push(id) }
  await v('groups:arrange', 'article', { top: ['g:nf', notes[2]], groups: { nf: notes.slice(0, 2) }, make: { id: 'nf', name: 'Drawn once' } })
  const tag = (await v('tags'))[0]?.tag
  // A big book answers its reads a beat apart: slowed here, as there.
  await electron.evaluate(({ ipcMain }, uneven) => {
    // UNEVEN=1: every read answers at its own speed, up to 300ms, the way a big book does.
    const names = uneven ? [...ipcMain._invokeHandlers.keys()].filter((one) => one.startsWith('haligtree:')) : ['haligtree:groups', 'haligtree:tasks:sources']
    for (const name of names) {
      const was = ipcMain._invokeHandlers?.get(name)
      if (!was) continue
      ;(globalThis.__flashWas ??= new Map()).set(name, was)
      ipcMain.removeHandler(name)
      ipcMain.handle(name, async (...args) => { await new Promise((ok) => setTimeout(ok, uneven ? Math.random() * 300 : 250)); return was(...args) })
    }
  }, !!process.env.UNEVEN)

  // Every page of the main window, opened cold. `store`: a remembered choice set first (the calendar's scale).
  const ALL = [
    // Tomorrow and This week's tasks are the top of Upcoming now; Everything (all) is the Inbox with "Show sorted too" on.
    'home', 'inbox', 'all', 'archived', 'lookups', 'articles', 'nuggets', 'questions', 'goals', 'today', 'upcoming', 'routines', 'later',
    'calendar@day', 'calendar@week', 'calendar@month', 'matrix', 'review', 'queue', 'tags', 'tag', 'sources', 'stats', 'map', 'settings', 'practices',
    'day', 'weekpage', 'monthpage', 'yearpage', 'discarded', 'group',
    // A note opened cold, beside its list: one in Pages, a gem, a question, a goal, a capture in the Inbox, a task.
    'open:article', 'open:nugget', 'open:question', 'open:goal', 'open:capture', 'open:task'
  ]
  const PAGES = (process.env.PAGES ?? ALL.join(',')).split(',').filter((one) => !['window', 'box', 'note', 'bubble', 'moments'].includes(one))
  const also = (name) => !process.env.PAGES || process.env.PAGES.split(',').includes(name)
  const specOf = (name) => {
    const [id, mode] = name.includes(':') ? name.split(':') : name.split('@')
    if (mode && id !== 'open') return { id, root: `[data-page="${id}"]`, open: () => send('view', id), store: ['vigil.calendar.mode', mode] }
    if (id === 'tag') return { id, root: '[data-page="tags"]', open: () => send('tag', tag) }
    if (id === 'day') return { id, root: '[data-page="day"]', open: () => send('day', new Date().toISOString().slice(0, 10)) }
    // A group's page: Writing opened warm, then the group's own page asked for cold.
    if (id === 'group') return { id, base: 'articles', group: true }
    if (id === 'open') {
      const page = { article: 'articles', nugget: 'nuggets', question: 'questions', goal: 'goals', capture: 'inbox', task: 'today' }[mode]
      return { id, root: `[data-page="${page}"]`, open: async () => {
        const one = mode === 'task' ? (await v('tasks')).find((t) => t.status === 'open') : mode === 'capture' ? (await h.evaluate(() => window.api.captures.list())).find((c) => c.status === 'open') : (await v('items', mode))[0]
        await send(mode, one.id)
      } }
    }
    return { id, root: `[data-page="${id === 'all' ? 'inbox' : id}"]`, open: () => send('view', id) }
  }
  for (let round = 0; round < ROUNDS; round++) {
    // Back to its size each round: the windows opened at the end of a round (a note's, the bubble) can leave it another.
    await c.size(1300, 900)
    for (const name of PAGES) {
      const spec = specOf(name)
      // From a page that reads little, so nothing the page asks for is warm already.
      const base = spec.base ?? (spec.id === 'settings' ? 'map' : 'settings')
      await send('view', base); await wait(400)
      if (spec.store) await h.evaluate(([k, value]) => localStorage.setItem(k, value), spec.store)
      // A group opens as a page from its heading, which Writing shows as a list.
      if (spec.group) await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ ...JSON.parse(localStorage.getItem('view:article') ?? '{}'), density: 'list', group: 'none' })))
      await h.reload(); await wait(1800)
      if (spec.group) {
        // Its page opened from its own heading's menu, "Open as a page", in Writing (a reload opens on Home).
        await send('view', 'articles'); await wait(1500)
        await h.locator('[data-group-row]').filter({ hasText: 'Drawn once' }).first().click({ button: 'right' }).catch(() => {})
        await wait(400)
        await h.evaluate(() => window.__flashWatch('[data-group-page]'))
        const item = h.locator('[data-group-open-page]').first()
        if (!(await item.count())) console.log('  (group: no "Open as a page" in the menu:', await h.evaluate(() => document.querySelector('[role="menu"]')?.textContent?.slice(0, 200) ?? 'no menu'), ')')
        await item.click().catch(() => {})
        await wait(3400)
        report(`${name}${ROUNDS > 1 ? ` (round ${round + 1})` : ''}`, await framesOf(h))
        continue
      }
      await h.evaluate((root) => window.__flashWatch(root), spec.root)
      await spec.open()
      await wait(3400)
      report(`${name}${ROUNDS > 1 ? ` (round ${round + 1})` : ''}`, await framesOf(h), REPORT_ONLY.has(spec.id))
    }

    // The sidebar and the page it opens on, as the window first comes up.
    if (also('window')) {
      await send('view', 'home'); await wait(400)
      await autoWatch({ 'view=home': 'aside[data-chrome], [data-page]' })
      await h.reload(); await wait(4200)
      report('main window coming up (sidebar and Home)', await framesOf(h))
      await autoWatch({})
    }

    // Quick capture's box, reloaded cold, and each of its tabs.
    if (also('box')) {
      await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !/[?&](view|note)=/.test(w.webContents.getURL()))?.show())
      // No hint or nudge: each is a card that comes in on purpose, with its own sound, a beat after the box opens.
      const was = await v('settings')
      await v('settings:set', { hintRate: 0, dailyTidy: false, weeklyReview: false, goalNudges: false })
      // The box and its side panel, each on its own: what you type in is there at once, the panel once it is read.
      await autoWatch({ 'index.html': 'body, [data-box-panel], [data-waiting]' })
      await box.reload(); await box.waitForTimeout(4200)
      report('quick capture coming up', await framesOf(box))
      await autoWatch({})
      const tabs = await box.evaluate(() => [...document.querySelectorAll('[data-box-tab-id]')].map((one) => [one.dataset.boxTabId, one.textContent.trim()]))
      // Each tab from a cold window, so nothing it reads is warm from a tab before.
      for (const [id, label] of tabs) {
        await box.reload(); await box.waitForTimeout(2500)
        // Clicked, then watched from the frame the click draws: only the tab coming in, not the one fading out.
        await box.evaluate((one) => (document.querySelector(`[data-box-tab-id="${one}"]`)?.click(), window.__flashWatch(`[data-box-tab="${one}"]`)), id)
        await box.waitForTimeout(3400)
        report(`quick capture's "${label}" tab`, await framesOf(box))
      }
      await box.keyboard.press('Escape').catch(() => {})
      await v('settings:set', { hintRate: was.hintRate, dailyTidy: was.dailyTidy, weeklyReview: was.weeklyReview, goalNudges: was.goalNudges })
    }

    // A note in its own window, watched from its first frame.
    if (also('note')) {
      // Still, so the window does not glide to its size: a window growing reflows its words, which is not a late read.
      const motion = (await v('settings')).motion
      await v('settings:set', { motion: false })
      await autoWatch({ 'note=': 'body' })
      const note = (await h.evaluate(() => window.api.captures.list())).find((one) => one.status === 'open')?.id
      await v('notes:window', 'capture', note)
      const nw = await winBy((u) => u.includes('note='))
      if (nw) {
        await nw.waitForTimeout(4000)
        report('a note in its own window', await framesOf(nw), false, { settled: true })
        await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('note='))?.close())
      } else check('a note in its own window: opens', false)
      await autoWatch({})
      await v('settings:set', { motion })
    }

    // The bubble for a focus session, watched from its first frame.
    if (also('bubble')) {
      // No count-in: "Starting in 3, 2, 1" is a clock you watch, not a read coming late.
      const countIn = (await v('settings')).countIn
      await v('settings:set', { countIn: false })
      await autoWatch({ 'view=focus': 'body' })
      const task = (await v('tasks')).find((one) => one.status === 'open' && one.title)
      const id = await v('session:start', task.id, 'Warm up', 25 * 60000)
      await h.evaluate(() => window.api.showFocus(true))
      const pill = await winBy((u) => u.includes('view=focus'))
      if (pill) {
        await pill.waitForTimeout(4000)
        report('the focus bubble', await framesOf(pill), false, { window: false })
      } else check('the focus bubble: opens', false)
      await v('session:cancel', id)
      await h.evaluate(() => window.api.showFocus(false))
      await autoWatch({})
      await v('settings:set', { countIn })
    }
  }

  // Other moments that redraw a page: each must change it in one step, never two.
  // (Switching books and the sandbox's Reset start a new run, whose window comes up cold: "main window coming up".
  // A sort, Display or theme change redraws from what is already read, in one render.)
  if (process.env.MOMENTS !== '0' && also('moments')) {
    // At the app's own speed: a change's reads answer within a few ms of each other, and a wave holds
    // them for one frame; slowed apart by hundreds of ms, as above, a slow one is let answer on its own.
    await electron.evaluate(({ ipcMain }) => {
      for (const [name, was] of globalThis.__flashWas ?? []) (ipcMain.removeHandler(name), ipcMain.handle(name, was))
    })
    const moment = async (name, page, ready, act, options) => {
      await send('view', page); await wait(2500)
      await ready?.()
      await h.evaluate((p) => window.__flashWatch(`[data-page="${p}"]`, 3200), page === 'all' ? 'inbox' : page)
      await act()
      await wait(3400)
      const frames = await framesOf(h)
      // The first frame is the page before the act: judged from the first one the act changed.
      report(name, frames.length > 1 ? frames.slice(1) : frames, false, options)
    }
    // ⌘A and ⌫ send everything on show to the Bin; ⌘Z brings it all back in one step.
    await moment('The Inbox with sorted too, after ⌘Z of a big Bin move', 'all', async () => {
      await h.keyboard.press('Escape')
      await h.keyboard.press('Meta+a'); await wait(300)
      await h.keyboard.press('Backspace'); await wait(1500)
    }, () => h.keyboard.press('Meta+z'))
    // A note closed back to its list: the list is the one it was, in its order, with its heads.
    await moment('Pages after a note is closed', 'articles', async () => {
      await h.locator('[data-page="articles"] [data-id]').first().click(); await wait(1500)
    }, () => h.keyboard.press('Escape'), { orderOnly: true })
  }
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
done()

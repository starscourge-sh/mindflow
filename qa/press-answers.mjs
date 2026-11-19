// How soon each common press is answered. Run on a COPY of a book or of the seeded sandbox, through the timing queue:
//
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/press-answers.mjs
//
// About forty real presses and keys (every sidebar page twice, tabs, rows opened in each list, a row's right-click
// menu, a header's "⋯", the sidebar's menu, ⌘K opened, typed in and closed, a switch, a chip, a task ticked, a
// group folded, "Details", Back and Forward, a theme worn). For each, from the press itself:
//   first    the first change to the page, painted (the task after the frame that drew it)
//   shown    what the press was for (the page, the menu, the note, the switch flipped) in the page, painted
//   paint    the browser's own Event Timing for the press: the time to the next painted frame
//   handler  how long the press's own handlers ran
//   frame    the longest gap between two frames until the page went quiet
//   forced   style and layout forced by script inside the press's long frames (Long Animation Frames, which the
//            browser keeps only for frames of 50ms and more: "-" means no frame was that long)
//   draws    React commits, and components drawn; the busiest are named (real names in a dev-mode build)
// Bars: shown (or first, where a press has nothing more to show) within FIRST_MS (100 plain, 150 dev-mode), and no
// forced layout over 5ms. Prints the table worst first. ONLY=<words> runs the presses whose names hold them.
// SHORT=1 stops after the sidebar's pages (22 presses). REST=<ms> is how long the pointer rests on a thing before
// it is pressed (350).
//
// A dev-mode build only: React's development build records where each element was made (an "owner stack": an
// Error and a console task apiece) for the first 10,000 elements after any second in which it drew nothing, and
// makes the rest plainly. So what a press costs there depends on what was drawn in the second before it: a
// pointer that draws the window as it comes onto a row (the hover light did, before it was one element) spends
// that allowance ahead of the press, and the press then looks about 70ms cheaper than it is. The `made` column
// says how many elements the press made and how many of them were recorded so. OWNER_STACKS=off turns the
// recording off for the run, to see the times without it (the app itself turns it off since 12 Nov, main.tsx:
// OWNER_STACKS=on puts it back for the run, to see what it costs). WHY=<component> lists, under each press, what made that
// component draw each time it did: which of its states changed (numbered in the order its hooks run), from what to what.
import { loadavg } from 'os'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const ONLY = (process.env.ONLY ?? '').toLowerCase()
const load = () => `load ${loadavg()[0].toFixed(1)}`

/** In the page before React starts: counts its commits and the components drawn, and times each armed press. */
const INSTRUMENT = `(() => {
  if (window.__pa) return
  const react = (window.__qaReact = { on: false, commits: 0, drawn: {}, why: [] })
  const named = (f) => { const t = f.type; return typeof t === 'function' ? t.displayName || t.name || 'anonymous' : t && typeof t === 'object' ? t.displayName || t.render?.displayName || t.render?.name || t.type?.displayName || t.type?.name || null : null }
  const brief = (v) => { try { if (v instanceof Element) return '<' + v.tagName.toLowerCase() + '>'; if (typeof v === 'function') return 'fn'; const s = JSON.stringify(v, (k, x) => (x instanceof Element ? '<el>' : typeof x === 'function' ? 'fn' : x)); return s === undefined ? String(v) : s.slice(0, 90) } catch { return typeof v } }
  // Why a component drew: each state of its own that changed since it last drew (those with a queue: useState, useReducer, a store).
  const whyOf = (fiber) => {
    const prev = fiber.alternate
    if (!prev) return 'first drawn'
    const out = []
    for (let a = fiber.memoizedState, b = prev.memoizedState, at = 0; a && b; a = a.next, b = b.next, at++) if (a.queue && a.memoizedState !== b.memoizedState) out.push('state ' + at + ': ' + brief(b.memoizedState) + ' -> ' + brief(a.memoizedState))
    if (fiber.memoizedProps !== prev.memoizedProps) out.push('new props')
    return out.join(' | ') || 'no state of its own changed (its parent, a context, or a state set to an equal value)'
  }
  const walk = (next, prev) => {
    const name = named(next)
    if (name && next.flags & 1) react.drawn[name] = (react.drawn[name] || 0) + 1
    if (name && name === window.__paWhy && next.flags & 1) react.why.push(whyOf(next))
    if (prev && next.child === prev.child) return
    for (let c = next.child; c; c = c.sibling) walk(c, c.alternate)
  }
  if (!window.__paNoHook) window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(), supportsFiber: true, checkDCE() {},
    inject(r) { const id = this.renderers.size + 1; this.renderers.set(id, r); return id },
    onScheduleFiberRoot() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, setStrictMode() {},
    onCommitFiberRoot(id, root) { if (!react.on) return; react.commits++; try { walk(root.current, root.current.alternate) } catch {} }
  }
  const pa = (window.__pa = { armed: false })
  // React's own count of the elements it has made since it last started the count over (a dev-mode build).
  const made = () => { for (const r of window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers?.values?.() ?? []) { const n = r.currentDispatcherRef?.recentlyCreatedOwnerStacks; if (typeof n === 'number') return n } return null }
  pa.ownerStacksOff = () => { for (const r of window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers?.values?.() ?? []) if (r.currentDispatcherRef && 'recentlyCreatedOwnerStacks' in r.currentDispatcherRef) { Object.defineProperty(r.currentDispatcherRef, 'recentlyCreatedOwnerStacks', { get: () => 1e9, set() {} }); return true } return false }
  // Counted in the task after the frame that draws a change: that frame's own style, layout and paint are in the number.
  const stamp = (set) => requestAnimationFrame(() => { const m = new MessageChannel(); m.port1.onmessage = () => set(performance.now()); m.port2.postMessage(0) })
  const onShow = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth }
  pa.find = (sel, pick = 0) => { const all = [...document.querySelectorAll(sel)].filter(onShow); return all[pick < 0 ? all.length + pick : pick] ?? null }
  const NOTE = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain), [data-first-screen]'
  // What a press is for, told without measuring anything: each is asked as the page changes.
  pa.kinds = {
    any: () => null,
    page: () => { const was = new Set(document.querySelectorAll('[data-page]')); return () => [...document.querySelectorAll('[data-page]')].some((p) => !was.has(p) && p.getElementsByTagName('*').length >= 12) },
    menu: () => { const was = new Set(document.querySelectorAll('[role="menu"]')); return () => [...document.querySelectorAll('[role="menu"]')].some((m) => !was.has(m) && m.querySelector('[role^="menuitem"]')) },
    dialog: () => { const was = new Set(document.querySelectorAll('[role="dialog"]')); return () => [...document.querySelectorAll('[role="dialog"]')].some((m) => !was.has(m) && m.querySelector('input')) },
    // Gone, or going: a menu told to close plays a short fade before it leaves the page.
    gone: (sel) => { const was = [...document.querySelectorAll(sel)]; return was.length ? () => was.every((one) => !one.isConnected || one.getAttribute('data-state') === 'closed') : () => false },
    flip: (sel, attr, pick) => { const el = pa.find(sel, pick); const was = el?.getAttribute(attr); return () => !!el && (!el.isConnected || el.getAttribute(attr) !== was) },
    note: () => { const was = new Set(document.querySelectorAll(NOTE)); return () => [...document.querySelectorAll(NOTE)].some((one) => !was.has(one)) },
    theme: () => { const root = document.documentElement; const worn = () => root.className + '|' + root.getAttribute('data-theme') + '|' + root.getAttribute('style'); const was = worn(); return () => worn() !== was }
  }
  const changes = new MutationObserver(() => {
    if (!pa.armed || pa.down === null) return
    const now = performance.now()
    pa.batches++
    if (pa.firstAt === null) { pa.firstAt = now; stamp((t) => (pa.firstPaint = t)) }
    if (pa.shown && pa.shownAt === null && pa.shown()) { pa.shownAt = now; stamp((t) => (pa.shownPaint = t)) }
    if (!pa.lastAsked) { pa.lastAsked = true; stamp((t) => { pa.lastAsked = false; pa.lastPaint = t }) }
  })
  for (const type of ['pointerdown', 'pointerup', 'keydown']) addEventListener(type, (e) => {
    if (!pa.armed || !e.isTrusted) return
    if (type === 'pointerup') pa.up ??= performance.now()
    else if (pa.down === null) { pa.down = performance.now(); pa.madeBefore = made() }
  }, true)
  pa.can = { loaf: false, events: false }
  try { new PerformanceObserver((list) => { if (pa.armed) for (const e of list.getEntries()) pa.loaf.push({ start: e.startTime, duration: e.duration, blocking: e.blockingDuration, scripts: e.scripts.map((s) => ({ what: s.sourceFunctionName || s.invoker, file: (s.sourceURL || '').split('/').pop().slice(0, 28), duration: s.duration, forced: s.forcedStyleAndLayoutDuration })) }) }).observe({ type: 'long-animation-frame' }); pa.can.loaf = true } catch {}
  try { new PerformanceObserver((list) => { if (pa.armed) for (const e of list.getEntries()) pa.events.push({ name: e.name, start: e.startTime, wait: e.processingStart - e.startTime, run: e.processingEnd - e.processingStart, duration: e.duration }) }).observe({ type: 'event', durationThreshold: 16 }); pa.can.events = true } catch {}
  const tick = (t) => { if (!pa.armed) return; if (pa.frame !== null) pa.gaps.push([t, t - pa.frame]); pa.frame = t; requestAnimationFrame(tick) }
  let watching = false
  pa.arm = (kind, args) => {
    // The page has no root yet when this is first read, so the watch starts with the first press.
    if (!watching) { watching = true; changes.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true }) }
    Object.assign(pa, { madeBefore: null, down: null, up: null, firstAt: null, firstPaint: null, shownAt: null, shownPaint: null, lastPaint: null, lastAsked: false, batches: 0, loaf: [], events: [], gaps: [], frame: null })
    pa.shown = pa.kinds[kind](...args)
    pa.already = !!pa.shown && pa.shown()
    react.commits = 0
    react.drawn = {}
    react.why = []
    react.on = true
    pa.armed = true
    requestAnimationFrame(tick)
  }
  pa.ready = () => pa.down !== null && (pa.shown ? pa.shownPaint !== null : pa.firstPaint !== null)
  pa.collect = () => {
    pa.armed = false
    react.on = false
    const drawn = Object.entries(react.drawn).sort((a, b) => b[1] - a[1])
    // The app's own components among them (a dev-mode build keeps their names), the libraries' wrappers left out.
    const own = drawn.filter(([name]) => !/[.]|^(Presence|Popper|Portal|Slot|Tooltip|Menu|Dropdown|ContextMenu|Dismissable|FocusScope|Collection|Roving|Primitive|Provider|anonymous|Anonymous|Dialog|Popover|Switch|Checkbox|Direction|Motion|LayoutGroup|PresenceChild|PopChild|MeasureLayout|Alive)/.test(name) && !/Provider$|Context$|Impl$|Slot$/.test(name))
    pa.own = own.slice(0, 10).map(([name, n]) => name + ' x' + n).join(', ')
    return { why: react.why, madeBefore: pa.madeBefore, madeAfter: made(), down: pa.down, up: pa.up, firstAt: pa.firstAt, firstPaint: pa.firstPaint, shownAt: pa.shownAt, shownPaint: pa.shownPaint, lastPaint: pa.lastPaint, asked: !!pa.shown, already: pa.already, batches: pa.batches, loaf: pa.loaf, events: pa.events, gaps: pa.gaps, commits: react.commits, drawn: drawn.reduce((n, one) => n + one[1], 0), top: drawn.slice(0, 5).map(([name, n]) => name + ' x' + n).join(', '), own: pa.own }
  }
})()`

const c = await sandbox({ width: 1400, height: 900, seeded: false })
const { h, electron } = c
const table = []
const skipped = []
try {
  await h.waitForTimeout(2500)
  // NO_HOOK=1 leaves React's devtools hook out (no count of what React drew), to see the times without it.
  if (process.env.NO_HOOK) await electron.context().addInitScript('window.__paNoHook = true')
  if (process.env.OWNER_STACKS === 'on') await electron.context().addInitScript(`localStorage.setItem('haligtree:owner-stacks', 'on')`)
  if (process.env.WHY) await electron.context().addInitScript(`window.__paWhy = ${JSON.stringify(process.env.WHY)}`)
  await electron.context().addInitScript(INSTRUMENT)
  await h.reload()
  await h.waitForSelector('aside[data-chrome] [data-side-row]', { timeout: 60000 })
  await h.waitForTimeout(5000)
  const dev = process.env.DEV === '1' || (await h.evaluate(() => [...(window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers?.values?.() ?? [])].some((r) => r.bundleType === 1)))
  const BAR = Number(process.env.FIRST_MS ?? (dev ? 150 : 100))
  const REST = Number(process.env.REST ?? 350)
  const SHORT = !!process.env.SHORT
  if (process.env.OWNER_STACKS === 'off') console.log(`React's owner stacks ${(await h.evaluate(() => window.__pa.ownerStacksOff())) ? 'turned off for this run' : 'not found (not a dev-mode build, or NO_HOOK)'}`)
  const can = await h.evaluate(() => window.__pa.can)
  console.log(`${dev ? 'dev-mode' : 'plain'} build; bar ${BAR}ms; Event Timing ${can.events ? 'on' : 'missing'}, Long Animation Frames ${can.loaf ? 'on' : 'missing'}  (${load()})`)

  const point = (sel, pick = 0, across = 0.5) => h.evaluate(async ([sel, pick, across]) => {
    let el = window.__pa.find(sel, pick)
    if (!el) {
      // Scrolled out of its list (a long sidebar): brought into view as a person would, then found again.
      const hidden = [...document.querySelectorAll(sel)].find((one) => one.getClientRects().length)
      hidden?.scrollIntoView({ block: 'center', behavior: 'instant' })
      await new Promise((next) => requestAnimationFrame(() => requestAnimationFrame(next)))
      el = hidden ? window.__pa.find(sel, pick) : null
    }
    if (!el) return null
    const r = el.getBoundingClientRect()
    // Pressed only where the thing itself is on top: under a sheet or a faded edge the press would go elsewhere.
    const x = r.left + Math.min(r.width * across, across < 0.5 ? 220 : r.width * across)
    const y = r.top + r.height / 2
    const top = document.elementFromPoint(x, y)
    return top && (el.contains(top) || top.contains(el)) ? { x, y } : null
  }, [sel, pick, across])

  /** One press, timed: `act` is the real input, `shown` says what it is for (a kind above and what it needs). */
  async function press(name, act, shown = ['any'], settle = 500) {
    if (ONLY && !name.toLowerCase().includes(ONLY)) return void (await act())
    await h.evaluate(([kind, ...args]) => window.__pa.arm(kind, args), shown)
    await act()
    await h.waitForFunction(() => window.__pa.ready(), null, { timeout: 4000 }).catch(() => {})
    await h.waitForTimeout(settle)
    const r = await h.evaluate(() => window.__pa.collect())
    // A press that acts as the button goes down (a menu) is counted from there; one that acts on the click, from the
    // release. Told by when what the press was for came, not by the first change of any kind: a row's preview card
    // closing as the button goes down is a change too, and made a page press count from the button going down.
    const acted = r.asked ? r.shownAt : r.firstAt
    const t0 = r.up !== null && (acted === null || acted >= r.up) ? r.up : r.down
    const since = (t) => (t === null || t0 === null ? null : t - t0)
    const until = r.shownPaint ?? r.firstPaint ?? (t0 ?? 0) + 300
    const frames = r.loaf.filter((one) => one.start + one.duration >= (r.down ?? 0) && one.start <= until)
    const scripts = frames.flatMap((one) => one.scripts)
    const longest = scripts.sort((a, b) => b.duration - a.duration)[0]
    table.push({
      name, first: since(r.firstPaint), shown: r.asked ? since(r.shownPaint) : since(r.firstPaint), asked: r.asked, already: r.already, settled: since(r.lastPaint),
      paint: Math.max(0, ...r.events.filter((e) => e.start >= (r.down ?? 0) - 20).map((e) => e.duration)), handler: r.events.filter((e) => e.start >= (r.down ?? 0) - 20).reduce((n, e) => Math.max(n, e.run), 0),
      frame: Math.max(0, ...r.gaps.filter(([t]) => t >= (r.down ?? 0) && t <= (r.lastPaint ?? until) + 20).map(([, gap]) => gap)),
      forced: frames.length ? scripts.reduce((n, s) => n + s.forced, 0) : null, long: frames.length ? Math.max(...frames.map((one) => one.duration)) : null,
      why: longest ? `${longest.what || '?'} ${Math.round(longest.duration)}ms${longest.file ? ` (${longest.file})` : ''}` : '',
      commits: r.commits, drawn: r.drawn, top: dev && r.own ? r.own : r.top, heard: r.down !== null, drew: r.why,
      // The count started over during the press when it reads lower after than before.
      made: r.madeAfter === null || r.madeBefore === null || r.madeBefore > 1e8 ? null : r.madeAfter < r.madeBefore ? { all: r.madeAfter, stacked: Math.min(r.madeAfter, 1e4), fresh: true } : { all: r.madeAfter - r.madeBefore, stacked: Math.max(0, Math.min(r.madeAfter, 1e4) - Math.min(r.madeBefore, 1e4)), fresh: false }
    })
  }
  const click = async (name, sel, shown, { pick = 0, button = 'left', across = 0.5, settle } = {}) => {
    const p = await point(sel, pick, across)
    if (!p) return void (name.startsWith('to ') || skipped.push(`${name}: nothing on show to press for ${sel}`))
    await h.mouse.move(p.x, p.y)
    await h.waitForTimeout(REST)
    await press(name, () => h.mouse.click(p.x, p.y, { button }), shown, settle)
  }
  const key = (name, keys, shown, settle) => press(name, () => h.keyboard.press(keys), shown, settle)
  const side = (label) => `aside[data-chrome] [data-side-row][aria-label="${label}"]`
  const calm = () => h.waitForTimeout(500)

  // Every sidebar page, the first time this run and again.
  const LIBRARY = '[data-side-section-handle="library"]'
  const unfolded = await h.evaluate((sel) => document.querySelector(sel)?.getAttribute('aria-expanded'), LIBRARY)
  for (const name of unfolded === 'false' ? ['Sidebar: unfold “Library” (the run’s first press)', 'Sidebar: fold “Library”', 'Sidebar: unfold “Library” again'] : ['Sidebar: fold “Library” (the run’s first press)', 'Sidebar: unfold “Library”']) await click(name, LIBRARY, ['flip', LIBRARY, 'aria-expanded', 0])
  const pages = ['Inbox', 'Home', 'Journal', 'Writing', 'Review', 'Tasks', 'Calendar', 'Goals', 'Gems', 'Files']
  for (const round of ['first', 'again']) for (const label of pages) await click(`Page: ${label} (${round})`, side(label), ['page'])

  rest: {
  if (SHORT) break rest

  // Tabs: a new one, a page in it, and back and forth between the two.
  await click('Tab: new tab', '[data-tab-add]', ['any'])
  await click('Tab: a page in the new tab', side('Writing'), ['page'])
  await click('Tab: switch to the first', '[role="tab"]', ['flip', '[role="tab"]', 'aria-selected', 0], { pick: 0 })
  await click('Tab: switch to the second', '[role="tab"]', ['flip', '[role="tab"]', 'aria-selected', 1], { pick: 1 })
  await click('Tab: close it', '[role="tab"][aria-selected="true"] ~ [data-tab-close], [data-tab-close]', ['any'], { pick: -1 })

  // Rows: opened in each list, and the way back.
  for (const label of ['Inbox', 'Writing', 'Gems', 'Tasks', 'Files']) {
    await click(`to ${label}`, side(label), ['page'])
    table.pop()
    await calm()
    const row = label === 'Tasks' ? '[data-page] [data-task-row]' : label === 'Files' ? '[data-page] [data-row-menu]' : '[data-page] [data-row]'
    await click(`Row: open one in ${label}`, row, [label === 'Tasks' || label === 'Files' ? 'any' : 'note'], { across: 0.3 })
    await calm()
    if (label === 'Writing') {
      await click('Note: “Details”', 'button[aria-label="Details"]', ['flip', 'button[aria-label="Details"]', 'aria-pressed', 0])
      await click('Note: “Details” away', 'button[aria-label="Details"]', ['flip', 'button[aria-label="Details"]', 'aria-pressed', 0])
    }
    if (label === 'Inbox' || label === 'Writing') {
      await key(`Back from the row in ${label} (⌘[)`, 'Meta+BracketLeft', ['any'])
      await key(`Forward to it in ${label} (⌘])`, 'Meta+BracketRight', ['any'])
      await click(`Back from the row in ${label} (button)`, '[data-tab-step="back"]', ['any'])
    }
    await calm()
  }

  // Menus: a row's, a header's, the sidebar's.
  await click('to Writing', side('Writing'), ['page'])
  table.pop()
  await calm()
  await click('Menu: right-click a row', '[data-page] [data-row]', ['menu'], { button: 'right', across: 0.3 })
  await key('Menu: Esc closes the row menu', 'Escape', ['gone', '[role="menu"]'])
  await click('to Inbox', side('Inbox'), ['page'])
  table.pop()
  await calm()
  await click('Menu: a header’s (“Go through…” or “⋯”)', '[data-page] button[aria-haspopup="menu"], [data-page] button[aria-label="More"]', ['menu'])
  await key('Menu: Esc closes the header menu', 'Escape', ['gone', '[role="menu"]'])
  await click('Menu: the sidebar’s own', 'button[aria-label="Haligtree menu"]', ['menu'])
  await key('Menu: Esc closes the sidebar menu', 'Escape', ['gone', '[role="menu"]'])
  await click('Display: open', '[data-page] [data-display]', ['flip', '[data-page] [data-display]', 'aria-expanded', 0])
  await key('Display: Esc closes it', 'Escape', ['flip', '[data-page] [data-display]', 'aria-expanded', 0])

  // ⌘K: opened, typed in, closed.
  await key('⌘K: open', 'Meta+KeyK', ['dialog'])
  await key('⌘K: type a letter', 'KeyA', ['any'])
  await key('⌘K: type another', 'KeyN', ['any'])
  await key('⌘K: Esc closes', 'Escape', ['gone', '[role="dialog"]'])

  // A switch and a chip (the Inbox's), each put back.
  await click('to Inbox', side('Inbox'), ['page'])
  table.pop()
  await calm()
  for (const name of ['Switch: on', 'Switch: back']) await click(name, '[data-page] [role="switch"]', ['flip', '[data-page] [role="switch"]', 'aria-checked', 0])
  for (const name of ['Chip: on', 'Chip: back']) await click(name, '[data-page] button[aria-pressed]', ['flip', '[data-page] button[aria-pressed]', 'aria-pressed', 0])

  // A group folded and opened: the sidebar's, and one in a list.
  for (const name of ['Fold: Writing’s folders in the sidebar', 'Fold: open them again']) await click(name, '[data-folders-fold="article"]', ['flip', '[data-folders-fold="article"]', 'aria-expanded', 0])
  for (const name of ['Fold: a group in the list', 'Fold: open it again']) await click(name, '[data-page] button[aria-expanded]:not([aria-haspopup])', ['flip', '[data-page] button[aria-expanded]:not([aria-haspopup])', 'aria-expanded', 0])

  // A task ticked, and unticked.
  await click('to Tasks', side('Tasks'), ['page'])
  table.pop()
  await calm()
  await click('Task: tick one', '[data-page] [data-task-tick]', ['any'], { settle: 900 })
  await key('Task: ⌘Z brings it back', 'Meta+KeyZ', ['any'], 900)

  // A theme worn from ⌘K, and put back.
  await h.keyboard.press('Meta+KeyK')
  await h.waitForTimeout(500)
  await h.keyboard.type('change theme')
  await h.waitForTimeout(600)
  await h.keyboard.press('Enter')
  await h.waitForTimeout(600)
  if (await h.evaluate(() => !!document.querySelector('input[placeholder^="Pick a theme"]'))) {
    await key('Theme: wear the next one', 'ArrowDown', ['theme'])
    await key('Theme: and the one after', 'ArrowDown', ['theme'])
  } else skipped.push('Theme: ⌘K did not turn into the themes')
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)
  }

  // The table, worst first.
  const ms = (n) => (n === null || n === undefined ? '-' : String(Math.round(n)))
  const pad = (s, n) => String(s).padEnd(n)
  const lead = (s, n) => String(s).padStart(n)
  table.forEach((row, at) => (row.n = at + 1))
  // The whole run in a line, and the same from the 8th press on (the first few of a run are the app still warming).
  const median = (list) => { const s = list.filter((n) => n !== null).sort((a, b) => a - b); return s.length ? Math.round(s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null }
  const sum = (rows) => `${rows.length} presses: shown median ${median(rows.map((r) => r.shown))}ms, handler median ${median(rows.map((r) => r.handler))}ms, ${rows.filter((r) => r.shown === null || r.shown > BAR).length} over ${BAR}ms`
  const lines = [`all ${sum(table)}`, `from the 8th press on, ${sum(table.filter((r) => r.n >= 8))}`]
  table.sort((a, b) => (b.shown ?? 9999) - (a.shown ?? 9999))
  const madeOf = (row) => (row.made ? `${row.made.all}/${row.made.stacked}${row.made.fresh ? '' : '*'}` : '-')
  console.log(`\n${lead('#', 3)} ${pad('press', 44)}${lead('first', 6)}${lead('shown', 6)}${lead('paint', 6)}${lead('handler', 8)}${lead('frame', 6)}${lead('forced', 7)}${lead('settled', 8)}${lead('made', 13)}  draws`)
  for (const row of table) console.log(`${lead(row.n, 3)} ${pad(row.name.slice(0, 43), 44)}${lead(ms(row.first), 6)}${lead(row.already ? 'was' : ms(row.shown), 6)}${lead(ms(row.paint), 6)}${lead(ms(row.handler), 8)}${lead(ms(row.frame), 6)}${lead(ms(row.forced), 7)}${lead(ms(row.settled), 8)}${lead(madeOf(row), 13)}  ${row.commits} commits, ${row.drawn} drawn${row.top ? `: ${row.top}` : ''}${row.why ? `  [longest script: ${row.why}]` : ''}`)
  if (process.env.WHY) for (const row of [...table].sort((a, b) => a.n - b.n)) console.log(`\n${row.n} ${row.name}: ${process.env.WHY} drew ${row.drew.length} times${row.drew.map((one, at) => `\n    ${at + 1}. ${one}`).join('')}`)
  if (dev) console.log('\nmade: elements the press made / of them recorded with an owner stack (dev-mode only); * the count was not started over at the press, something drew in the second before it')
  for (const line of lines) console.log(line)
  if (skipped.length) console.log(`\nnot pressed:\n  ${skipped.join('\n  ')}`)
  console.log(`\n(${load()})`)
  for (const row of table) {
    if (!row.heard) { check(`${row.name}: the press was heard`, false); continue }
    if (row.already) { check(`${row.name}: the probe could tell what it was for`, false, 'already so before the press'); continue }
    check(`${row.name}: shown within ${BAR}ms`, row.shown !== null && row.shown <= BAR, `${ms(row.shown)}ms${row.why ? `, longest script ${row.why}` : ''}; ${row.commits} commits, ${row.drawn} drawn`)
    if (row.forced !== null && row.forced > 5) check(`${row.name}: no forced layout over 5ms`, false, `${ms(row.forced)}ms forced`)
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()

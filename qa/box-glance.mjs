// Glance tabs on quick capture's one line (Settings: “One line to start” with “Glance tabs”): Write, Notes and Today
// standing on the pill, each with its own line and, under the pill, its glance. The pill itself never moves or
// changes size, on screen or in its page; Write is the pill as it was; a note is found, opened and made; a task is
// added for today (a day in its words wins), ticked in place, and still ticked when the app is opened again; Esc goes
// back to Write and then puts the box away; with the switch off the pill is as it was.
//   cp -cR <seeded sandbox> <copy>; QA_ARGS=--sandbox QA_DATA=<copy> QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-glance.mjs
// PART=tabs|swap|notes|today|looks|off runs one part, or several joined by commas (all of them without it).
// QA_SHOTS=dir saves pictures; QA_FILM=dir saves every frame the page drew through each change (PART=film, and
// PART=swap's every change of tab).
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const PART = process.env.PART ?? 'all'
const part = (name) => PART === 'all' || PART.split(',').includes(name)
// PART=foot puts the box near the screen's foot: each window keeps the place it is given while parked off screen.
if (PART === 'foot') process.env.HALIGTREE_QA_VIRTUAL ??= '1'
const shots = process.env.QA_SHOTS
const film = process.env.QA_FILM
if (shots) mkdirSync(shots, { recursive: true })
if (film) mkdirSync(film, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 500)})` : ''}`), !!ok)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const LINES = { write: 'Write a thought, a quote, a link… or type / for more', notes: 'Find a note, or name a new one…', today: 'Add a task for today…' }

let c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
let { page, v, electron, h } = c
const wait = (ms) => page.waitForTimeout(ms)
// The card on screen, as main holds it (its window less the room round it), and the box's window itself.
const onScreen = () => electron.evaluate(({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && /\/index\.html/.test(w.webContents.getURL()) && !/view=/.test(w.webContents.getURL()))
  return win ? { card: win.getBounds(), window: win.getContentBounds(), visible: win.isVisible() } : null
})
// The card, the tabs, the line and the glance as the page draws them.
const drawn = () => page.evaluate(() => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }
  const card = document.querySelector('.app-container')
  const input = document.querySelector('[data-glance-line] input')
  const first = document.querySelector('.tiptap.ProseMirror.haligtree-editor p')
  const words = document.querySelector('.tiptap.ProseMirror.haligtree-editor')
  return {
    pill: !!document.querySelector('.app-container[data-pill]'),
    card: box(card),
    inner: [innerWidth, innerHeight],
    tabs: [...document.querySelectorAll('[data-glance-tab]')].map((one) => ({ id: one.dataset.glanceTab, on: one.getAttribute('aria-selected') === 'true', ...box(one), hand: getComputedStyle(one).cursor, foot: (one.querySelector('[data-glance-shape]') ?? one).getBoundingClientRect().bottom })),
    line: input ? { placeholder: input.placeholder, focused: document.activeElement === input, value: input.value, ...box(input), size: getComputedStyle(input).fontSize, font: getComputedStyle(input).fontFamily } : null,
    writing: first ? { placeholder: first.getAttribute('data-placeholder'), hidden: getComputedStyle(words).visibility === 'hidden', focused: !!document.activeElement?.closest('.ProseMirror'), text: words.innerText.trim(), ...box(first), size: getComputedStyle(first).fontSize, font: getComputedStyle(first).fontFamily, lh: parseFloat(getComputedStyle(first).lineHeight) } : null,
    ends: !!document.querySelector('[data-pill-ends] [data-pill-kind]'),
    panel: (() => { const el = document.querySelector('[data-glance-panel]'); return el ? { on: el.dataset.glancePanel, ...box(el), rows: el.querySelectorAll('[data-row], [data-glance-event]').length, lit: el.querySelectorAll('[data-cursor]').length } : null })(),
    floating: document.querySelectorAll('[role=tooltip], [role=menu], [role=dialog], [data-radix-popper-content-wrapper]').length
  }
})
const chosen = (now) => now.tabs.find((one) => one.on)?.id ?? null
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex').slice(0, 16)
const look = (name) => page.evaluate((t) => (localStorage.setItem('theme', t), window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))), name)
const shoot = async (name, themes = ['paper', 'dark']) => {
  if (!shots) return
  for (const theme of themes) {
    await look(theme)
    await wait(900)
    await page.screenshot({ path: `${shots}/glance-${name}-${theme}.png` }).catch(() => {})
  }
  await look('paper')
  await wait(300)
}
const fresh = async () => {
  await page.evaluate(() => window.api.showPrompt())
  await wait(700)
  await page.click(EDITOR)
  await page.keyboard.press('Meta+a')
  await page.keyboard.press('Backspace')
  await wait(600)
}
const pick = async (id, by = 'pointer') => {
  if (by === 'pointer') await page.click(`[data-glance-tab="${id}"]`)
  else await page.keyboard.press(by)
  await wait(350)
}
const tasks = () => v('tasks')
const notes = () => h.evaluate(() => window.api.captures.list())
// What main was asked to open in the main window, from now on.
const spyOpens = () => electron.evaluate(({ ipcMain }) => { globalThis.__opened = []; ipcMain.on('home:open', (_event, type, id) => globalThis.__opened.push([type, id])) })
const opened = () => electron.evaluate(() => globalThis.__opened ?? [])

await v('settings:set', { hintRate: 0, rotCount: 0, boxHideButtons: false, boxOneLine: true, boxGlance: true })
await wait(900)
await fresh()
const start = { screen: await onScreen(), page: await drawn() }
console.log(`the pill: on screen ${JSON.stringify(start.screen?.card)}, in its page ${JSON.stringify(start.page.card)}, window ${start.page.inner.join('x')}`)

if (part('first')) {
  // The first Notes open since the app started (so before any other part opens it), read in the page at every frame
  // from the press: each row with a picture (its own, or its paper drawing) has it loaded, whole and at its resting
  // look in the first frame the row is seen, never a frame of an empty square or a picture still fading in.
  // QA_FILM=dir keeps the page's own frames of it (qa/cast-lib.mjs).
  const { pictureWatch, pictureVerdict } = await import('./picture-frames.mjs')
  // THEME=dark: the same, in the dark look.
  if (process.env.THEME) (await look(process.env.THEME), await wait(900))
  await pictureWatch(page, '[data-glance-panel] [data-row]')
  const act = () => page.click('[data-glance-tab="notes"]')
  if (film) await (await import('./cast-lib.mjs')).castFrames(page, film, `notes-first-open-${process.env.THEME ?? 'paper'}`, act, 700)
  else await act()
  await wait(1300)
  const { rows, pictured, late, frames, shownAfter } = await pictureVerdict(page)
  console.log(`NOTE  the first Notes open: its rows first seen ${shownAfter} ms after the press`)
  check(`the first Notes open: each of its ${pictured} rows with a picture has it, whole, in the first frame the row is seen (${rows} rows, ${frames} frames read)`, pictured > 0 && late.length === 0,
    `${late.length} late: ${JSON.stringify(late.slice(0, 4))}`)
  await pick('write')
}

if (part('tabs')) {
  const now = start.page
  check('on: the pill opens on Write, with Write, Notes and Today standing on it', now.pill && same(now.tabs.map((one) => one.id), ['write', 'notes', 'today']) && chosen(now) === 'write', JSON.stringify(now.tabs.map((one) => `${one.id}${one.on ? '*' : ''}`)))
  const on = now.tabs.find((one) => one.on)
  const rest = now.tabs.filter((one) => !one.on)
  check('the chosen tab stands on the pill (its foot on the top edge, not over it), the others just clear of it', !!on && Math.abs(on.foot - now.card.y) <= 0.6 && rest.every((one) => one.y + one.h <= now.card.y - 4), JSON.stringify({ card: now.card.y, on: on && on.foot, rest: rest.map((one) => one.y + one.h) }))
  check('the row starts past the pill\'s round end by a tab\'s foot (36px in) and stops short of the grabber at its middle', now.tabs.every((one) => one.x >= now.card.x + 35.5 && one.x + one.w <= now.card.x + now.card.w / 2 - 32), JSON.stringify(now.tabs.map((one) => [Math.round(one.x - now.card.x), Math.round(one.x + one.w - now.card.x)])))
  check('every tab shows the hand and is at least 24px tall', now.tabs.every((one) => one.hand === 'pointer' && one.h >= 24), JSON.stringify(now.tabs.map((one) => [one.hand, one.h])))
  check('Write is the pill as it was: its kind icon and ⌘↵, its own prompt, no glance under it', now.ends && now.writing?.placeholder === LINES.write && !now.writing.hidden && !now.panel && !now.line, JSON.stringify({ ends: now.ends, said: now.writing?.placeholder, panel: now.panel }))
  // Its hint keeps to its one line at every text size, the end dropped where it would wrap: wrapped, the pill cut the
  // second line off under the first (the user's "clipped things under the 'W'").
  const hint = []
  for (const textSize of [1, 1.25, 1.4, 1.6]) {
    await v('settings:set', { textSize })
    await wait(500)
    hint.push(await page.evaluate((size) => {
      const p = document.querySelector('.app-container[data-pill] .tiptap.ProseMirror p.is-editor-empty')
      if (!p) return { size, none: true }
      const lh = parseFloat(getComputedStyle(p).lineHeight)
      const said = parseFloat(getComputedStyle(p, '::before').height)
      const card = document.querySelector('.app-container').getBoundingClientRect()
      const line = p.getBoundingClientRect()
      // Each control standing in the pill (its kind, Keep, a round button beside it): its middle, less the pill's.
      const mid = card.top + card.height / 2
      const off = [...document.querySelectorAll('[data-pill-kind], [data-pill-keep], .mf-top .mf-pill button, .mf-top [data-aside] > *')]
        .map((one) => one.getBoundingClientRect()).filter((r) => r.height && r.bottom > card.top && r.top < card.bottom).map((r) => Math.round(r.top + r.height / 2 - mid))
      return { size, lh: Math.round(lh), p: p.offsetHeight, said: Math.round(said), card: Math.round(card.height), room: [Math.round(line.top - card.top), Math.round(card.bottom - line.bottom)], off }
    }, textSize))
    if (textSize === 1 || textSize === 1.6) await shoot(`hint-${Math.round(textSize * 100)}`)
  }
  await v('settings:set', { textSize: 1 })
  await wait(500)
  check('the empty line\'s hint is one line tall at text sizes 100% to 160%, nothing of it under the line', hint.every((one) => !one.none && one.p <= one.lh * 1.2 && one.said <= one.lh + 0.5), JSON.stringify(hint))
  // The pill grows with the text size: its line whole inside it, as far from its top as from its foot (to 4px), 56px at 100%.
  check('the pill is as tall as its line at every text size (56px at 100%), the line whole inside it and in its middle', hint.every((one) => !one.none && one.room[0] >= 8 && one.room[1] >= 8 && Math.abs(one.room[0] - one.room[1]) <= 4) && hint[0].card === 56, JSON.stringify(hint.map((one) => [one.size, one.card, one.room])))
  check('…every control in the pill (its kind, Keep, a round button beside it) has its middle within 2px of the pill\'s', hint.every((one) => one.off?.length >= 2 && one.off.every((d) => Math.abs(d) <= 2)), JSON.stringify(hint.map((one) => [one.size, one.off])))
  // A draft on the line waits behind the other tabs' lines, and is there again on Write.
  await page.click(EDITOR)
  await page.keyboard.type('Call Mu')
  await wait(300)
  const steps = [['notes', 'pointer'], ['today', 'pointer'], ['write', 'pointer'], ['notes', 'Meta+Shift+BracketRight'], ['today', 'Meta+Shift+BracketRight'], ['write', 'Meta+Shift+BracketRight'], ['today', 'Meta+Shift+BracketLeft'], ['notes', 'Meta+Shift+BracketLeft'], ['today', 'Control+Alt+Digit3'], ['write', 'Control+Alt+Digit1'], ['notes', 'Control+Alt+Digit2']]
  for (const [id, by] of steps) {
    await pick(id, by)
    const at = await drawn()
    const screen = await onScreen()
    const how = by === 'pointer' ? 'pointer' : by.replace('Meta+Shift+Bracket', '⇧⌘').replace('Right', ']').replace('Left', '[').replace('Control+Alt+Digit', '⌃⌥')
    if (by === 'pointer' && id !== 'write') console.log(`  ${id}: tabs ${JSON.stringify(at.tabs.map((one) => [one.id, one.x, one.y, one.w, one.h]))} line ${JSON.stringify(at.line && [at.line.x, at.line.y, at.line.w, at.line.h, at.line.size])} writing ${JSON.stringify([start.page.writing.x, start.page.writing.y, start.page.writing.w, start.page.writing.h, start.page.writing.size])} glance ${JSON.stringify(at.panel)}`)
    check(`${how}: ${id} is chosen`, chosen(at) === id, `chosen ${chosen(at)}`)
    check(`…the pill has not moved or changed size, on screen or in its page (to the pixel)`, same(screen?.card, start.screen?.card) && same(screen?.window, start.screen?.window) && same(at.card, start.page.card) && at.pill, JSON.stringify({ screen: screen?.card, page: at.card }))
    check(`…no tab has moved sideways or changed width`, same(at.tabs.map((one) => [one.x, one.w]), start.page.tabs.map((one) => [one.x, one.w])), JSON.stringify(at.tabs.map((one) => [one.x, one.w])))
    if (id === 'write') {
      check('…Write: the writing is back with its draft and the caret in it, no glance', !at.writing?.hidden && at.writing?.text === 'Call Mu' && at.writing.focused && !at.panel && !at.line && at.ends, JSON.stringify({ text: at.writing?.text, focused: at.writing?.focused, panel: !!at.panel }))
    } else {
      check(`…its line says “${LINES[id]}”, empty, with the caret in it, the writing out of sight`, at.line?.placeholder === LINES[id] && at.line.focused && at.line.value === '' && at.writing?.hidden && !at.ends, JSON.stringify({ said: at.line?.placeholder, focused: at.line?.focused, value: at.line?.value }))
      check(`…its words stand on the writing's first line (to a pixel), at the writing's size and face`, !!at.line && Math.abs(at.line.x - start.page.writing.x) <= 1 && at.line.size === start.page.writing.size && at.line.font === start.page.writing.font && Math.abs((at.line.y + at.line.h / 2) - (start.page.writing.y + start.page.writing.lh / 2)) <= 1, JSON.stringify({ line: at.line && [at.line.x, at.line.y, at.line.h, at.line.size], writing: [start.page.writing.x, start.page.writing.y, start.page.writing.h, start.page.writing.size] }))
      check(`…its glance hangs 8px under the pill, as wide as it, whole inside the window`, at.panel?.on === id && Math.abs(at.panel.y - (at.card.y + at.card.h + 8)) <= 0.6 && Math.abs(at.panel.x - at.card.x) <= 0.6 && Math.abs(at.panel.w - at.card.w) <= 0.6 && at.panel.y + at.panel.h <= at.inner[1] - 16 && at.panel.h >= 30, JSON.stringify(at.panel))
    }
  }
  // A list open in the writing (the / menu) does not outlive the writing going out of sight behind a tab's line.
  await pick('write')
  await page.keyboard.type(' /')
  await wait(900)
  const slashUp = await page.evaluate(() => { const pop = document.querySelector('.tiptap-suggestion-popup'); return !!pop && getComputedStyle(pop).visibility !== 'hidden' })
  await pick('notes')
  const slashAfter = await page.evaluate(() => { const pop = document.querySelector('.tiptap-suggestion-popup'); return !!pop && getComputedStyle(pop).visibility !== 'hidden' && pop.getClientRects().length > 0 })
  check('the / menu open in the writing, then a tab pressed: the menu is gone, the tab chosen', slashUp && !slashAfter && chosen(await drawn()) === 'notes', JSON.stringify({ slashUp, slashAfter }))
  // Back on Write the / menu is not up again (an Esc here would put the box away): ⌫ twice takes the " /" back.
  await pick('write')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await wait(500)
  await pick('notes')
  // A tab's tip says what it is for and its key: one floating thing, no more.
  await page.hover('[data-glance-tab="today"]')
  await wait(900)
  const tip = await page.evaluate(() => [...document.querySelectorAll('[role=tooltip]')].map((one) => one.textContent))
  check('pointing at a tab shows one tip, with what it is for and its key', (await drawn()).floating <= 2 && tip.some((one) => /Today’s events and tasks/.test(one ?? '') && /⌃\s*⌥\s*3/.test(one ?? '')), JSON.stringify(tip))
  await page.mouse.move(5, 5)
  await wait(300)
  const upBefore = (await onScreen())?.visible
  // How many times the page asks main to put the box away, from here.
  await electron.evaluate(({ ipcMain }) => { globalThis.__hides = 0; if (!globalThis.__hideSpy) (globalThis.__hideSpy = true, ipcMain.on('window:hide', () => globalThis.__hides++)) })
  // Esc: the glance first (back to Write, the box still up), then the box.
  await page.keyboard.press('Escape')
  await wait(400)
  let at = await drawn()
  const still = await onScreen()
  check('Esc on a tab shuts its glance first: Write again, the box still up, the pill where it was, the caret in the writing', chosen(at) === 'write' && !at.panel && still?.visible && same(at.card, start.page.card) && at.writing?.focused, JSON.stringify({ chosen: chosen(at), panel: !!at.panel, upBefore, hidesAsked: await electron.evaluate(() => globalThis.__hides), visible: still?.visible, card: at.card, focused: at.writing?.focused, active: await page.evaluate(() => `${document.activeElement?.tagName}.${document.activeElement?.className}`.slice(0, 80)) }))
  await page.keyboard.press('Escape')
  await wait(900)
  check('Esc again puts the box away', (await onScreen())?.visible === false)
  // Every open starts on Write, and its first frame back on screen is already Write: put back as it hides, never
  // as it shows (the user's "it snaps abruptly to 'write'"). Each frame the page draws on screen says its tab.
  await page.evaluate(() => window.api.showPrompt())
  await wait(700)
  await pick('today')
  await page.evaluate(() => window.api.hideWindow())
  await wait(700)
  const away = await drawn()
  check('put away on Today, it is on Write before it is shown again (no glance, the writing not hidden)', chosen(away) === 'write' && !away.panel && !away.writing?.hidden, JSON.stringify({ chosen: chosen(away), panel: !!away.panel }))
  await page.evaluate(() => {
    window.__back = []
    const tick = () => {
      if (window.__back.length > 40) return
      if (document.visibilityState === 'visible') window.__back.push(document.querySelector('[data-glance-tab][aria-selected="true"]')?.getAttribute('data-glance-tab') ?? 'none')
      requestAnimationFrame(tick)
    }
    tick()
  })
  const reopen = () => page.evaluate(() => window.api.showPrompt())
  if (film) await (await import('./cast-lib.mjs')).castFrames(page, film, 'reopen-after-today', reopen, 700)
  else await reopen()
  await wait(900)
  const back = await page.evaluate(() => window.__back)
  check('…and every frame from its first back on screen shows Write', back.length > 3 && back.every((one) => one === 'write'), back.join(' '))
  at = await drawn()
  check('opened again, it is on Write', chosen(at) === 'write' && !at.panel, `chosen ${chosen(at)}`)
  // A second line still grows it into the box, and the tabs go with the pill.
  await page.click(EDITOR)
  await page.keyboard.press('Meta+a')
  await page.keyboard.type('Call Mu')
  await page.keyboard.press('Enter')
  await page.keyboard.type('about the trip')
  await wait(1200)
  at = await drawn()
  check('a second line still grows the pill into the box, and the tabs go with the pill', !at.pill && at.tabs.length === 0 && at.card.h >= 280, JSON.stringify({ pill: at.pill, tabs: at.tabs.length, h: at.card.h }))
  // ⌘A grows the pick a step at a time, as Obsidian's does (obsidian-shortcuts.ts): the line, then the note. Pressed
  // once it took only the second line's words, and the empty second line rightly kept the box grown.
  for (let i = 0; i < 4; i++) await page.keyboard.press('Meta+a')
  await page.keyboard.press('Backspace')
  await wait(1700)
  at = await drawn()
  check('…back to one line, the pill and its tabs are as they were', at.pill && same(at.tabs.map((one) => [one.x, one.y, one.w, one.h]), start.page.tabs.map((one) => [one.x, one.y, one.w, one.h])) && same(at.card, start.page.card), JSON.stringify(at.tabs.map((one) => [one.x, one.y])))
}

if (part('swap')) {
  // Every change of tab, by pointer and by key, in both looks: each tab's fill read from every frame the page drew
  // through the change (its screencast), at two points inside the tab, beside the pill's own fill in the same frame.
  // A tab with no fill (a bare ring) or a doubled one at any frame fails.
  const cdp = await page.context().newCDPSession(page)
  // What carries an unchosen tab's fill, and how it changes: on the button it fades by every button's 120ms.
  console.log(`NOTE  an unchosen tab's fill: ${await page.evaluate(() => {
    const tab = document.querySelector('[data-glance-tab]:not([aria-selected="true"])')
    const holder = tab?.querySelector('[data-glance-round]') ?? tab
    if (!holder) return 'no tab'
    const style = getComputedStyle(holder)
    return `on ${holder === tab ? 'the button' : 'its own round'}, ${style.backgroundColor}, changes by “${style.transitionProperty}” over ${style.transitionDuration}`
  })}`)
  const changes = [['notes', 'pointer'], ['today', 'pointer'], ['write', 'pointer'], ['today', 'pointer'], ['notes', 'pointer'], ['write', 'pointer'],
    ['notes', 'Control+Alt+Digit2'], ['today', 'Control+Alt+Digit3'], ['write', 'Control+Alt+Digit1'],
    ['notes', 'Meta+Shift+BracketRight'], ['today', 'Meta+Shift+BracketRight'], ['write', 'Meta+Shift+BracketRight'],
    ['today', 'Meta+Shift+BracketLeft'], ['notes', 'Meta+Shift+BracketLeft'], ['write', 'Meta+Shift+BracketLeft']]
  for (const theme of ['paper', 'dark']) {
    await look(theme)
    await wait(1200)
    await fresh()
    const bad = []
    let frames = 0
    let from = 'write'
    for (const [to, by] of changes) {
      const got = []
      const onFrame = ({ data, sessionId }) => { got.push(data); cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}) }
      cdp.on('Page.screencastFrame', onFrame)
      await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 })
      await wait(150)
      if (by === 'pointer') await page.click(`[data-glance-tab="${to}"]`)
      else await page.keyboard.press(by)
      await wait(450)
      await cdp.send('Page.stopScreencast')
      cdp.off('Page.screencastFrame', onFrame)
      const at = await drawn()
      const row = await page.evaluate(() => document.querySelector('[data-glance-tabs]')?.getBoundingClientRect().bottom ?? 0)
      // The pill's fill clear of its words, then 5px in from each end of each tab, where its round or its tab shape is.
      const points = [[at.card.x + at.card.w * 0.7, at.card.y + 5], ...at.tabs.flatMap((one) => [[one.x + 5, row - 19], [one.x + one.w - 5, row - 19]])]
      const alphas = await electron.evaluate(({ nativeImage }, { list, points, inner }) => list.map((data) => {
        const image = nativeImage.createFromBuffer(Buffer.from(data, 'base64'))
        const { width } = image.getSize()
        const scale = width / inner
        const bits = image.toBitmap()
        return points.map(([x, y]) => bits[(Math.round(y * scale) * width + Math.round(x * scale)) * 4 + 3])
      }), { list: got, points, inner: at.inner[0] })
      frames += alphas.length
      const how = by === 'pointer' ? 'pointer' : by.replace('Meta+Shift+Bracket', '⇧⌘').replace('Right', ']').replace('Left', '[').replace('Control+Alt+Digit', '⌃⌥')
      alphas.forEach(([pill, ...tabs], index) => {
        const off = tabs.flatMap((alpha, k) => (Math.abs(alpha - pill) > 16 ? [`${at.tabs[k >> 1].id} ${alpha}`] : []))
        if (off.length) bad.push(`${from} to ${to} by ${how}, frame ${index} of ${alphas.length}: ${[...new Set(off)].join(', ')} beside the pill's ${pill}`)
      })
      if (film) got.forEach((data, index) => writeFileSync(`${film}/swap-${theme}-${from}-to-${to}-${how.replace(/[^a-z0-9]/gi, (sign) => ({ '⇧': 'S', '⌘': 'M', '⌃': 'C', '⌥': 'A', ']': 'next', '[': 'back' })[sign] ?? '')}-${String(index).padStart(2, '0')}.png`, Buffer.from(data, 'base64')))
      from = to
    }
    check(`${theme}: every tab wears its fill in every frame of ${changes.length} changes, by pointer and by key (${frames} frames read)`, frames >= changes.length && bad.length === 0, `${bad.length} frames with a tab bare or doubled: ${bad.slice(0, 6).join(' | ')}`)
  }
  await cdp.detach().catch(() => {})
  await look('paper')
  await wait(600)
}

if (part('notes')) {
  await fresh()
  await spyOpens()
  await page.keyboard.type('Call Mu')
  await pick('notes', 'Control+Alt+Digit2')
  let at = await drawn()
  const all = (await notes()).filter((one) => one.status !== 'discarded' && !one.archivedAt)
  const latest = [...all].sort((a, b) => (b.editedAt ?? b.capturedAt).localeCompare(a.editedAt ?? a.capturedAt))
  const rows = () => page.evaluate(() => [...document.querySelectorAll('[data-glance-panel] [data-row]')].map((one) => ({ id: one.dataset.id ?? one.closest('[data-id]')?.dataset.id ?? null, text: one.textContent?.trim().slice(0, 80), lit: one.hasAttribute('data-cursor') || !!one.closest('[data-cursor]') })))
  let list = await rows()
  check('Notes: the notes changed most recently, newest first, the first one lit', list.length > 0 && list.length <= 30 && list[0].id === latest[0]?.id && list.filter((one) => one.lit).length === 1 && list[0].lit, JSON.stringify({ shown: list.length, first: list[0], latest: latest[0]?.label }))
  // A name typed narrows them, by ⌘K's matcher: every row left has the words in its name.
  const target = latest.find((one) => /^[A-Za-z]{5,}/.test(one.label)) ?? latest[0]
  const word = target.label.match(/[A-Za-z]{4,}/)?.[0] ?? target.label.slice(0, 4)
  await page.keyboard.type(word)
  await wait(700)
  list = await rows()
  const named = all.filter((one) => one.label.toLowerCase().includes(word.toLowerCase())).map((one) => one.id)
  check(`typing “${word}” narrows them to the notes with it in their name`, list.length > 0 && list.every((one) => named.includes(one.id)) && list.some((one) => one.id === target.id), JSON.stringify({ shown: list.length, named: named.length }))
  check('…the pill has not moved, and the first match is lit', same((await drawn()).card, start.page.card) && list[0]?.lit)
  // ↓ walks the rows from the line; ↵ opens the lit one in the main window.
  if (list.length > 1) await page.keyboard.press('ArrowDown')
  await wait(200)
  list = await rows()
  const lit = list.find((one) => one.lit)
  check('↓ moves the light down a row, the caret still in the line', (list.length < 2 || list[1].lit) && (await drawn()).line?.focused, JSON.stringify(list.slice(0, 3)))
  await page.keyboard.press('Enter')
  await wait(1500)
  let asked = await opened()
  check('↵ opens the lit note in the main window', asked.length === 1 && asked[0][0] === 'capture' && asked[0][1] === lit?.id, JSON.stringify(asked))
  // A name no note has: said so, and the words start a note, by ↵, ⌘↵ or its own button.
  await page.evaluate(() => window.api.showPrompt())
  await wait(800)
  await pick('notes')
  const name = `Glance probe ${Date.now() % 100000}`
  await page.keyboard.type(name)
  await wait(900)
  const none = await page.evaluate(() => ({ said: document.querySelector('[data-glance-panel] [data-glance-empty]')?.textContent ?? null, offer: document.querySelector('[data-glance-make]')?.textContent ?? null, rows: document.querySelectorAll('[data-glance-panel] [data-row]').length }))
  check('a name no note has: said so in one line, with a button that starts a note called it', none.rows === 0 && /No note has that name/.test(none.said ?? '') && (none.offer ?? '').includes(name), JSON.stringify(none))
  await shoot('notes-none')
  // A worst-case name (long, with marks, another script and emoji): the offer stays one line inside the glance, the pill unmoved.
  await page.keyboard.press('Meta+a')
  await page.keyboard.type('Aleksandra Wiśniewska-Kowalczyk’s reading notes on مرحبا بالعالم and the Odyssey 🌿🌿, second draft for the seminar in the spring term')
  await wait(900)
  const long = await page.evaluate(() => {
    const make = document.querySelector('[data-glance-make]')?.getBoundingClientRect()
    const panel = document.querySelector('[data-glance-panel]')?.getBoundingClientRect()
    return make && panel ? { inside: make.left >= panel.left && make.right <= panel.right && make.bottom <= panel.bottom, h: make.height, sideways: document.querySelector('[data-glance-scroll]').scrollWidth > document.querySelector('[data-glance-scroll]').clientWidth } : null
  })
  check('a very long name: the offer stays one line inside the glance, nothing scrolls sideways, the pill has not moved', !!long && long.inside && long.h <= 40 && !long.sideways && same((await drawn()).card, start.page.card), JSON.stringify(long))
  await shoot('notes-long', ['paper'])
  await page.keyboard.press('Meta+a')
  await page.keyboard.type(name)
  await wait(900)
  const before = (await notes()).length
  await page.keyboard.press('Meta+Enter')
  await wait(1800)
  const after = await notes()
  const made = after.find((one) => one.label === name)
  asked = await opened()
  check('⌘↵ starts a note with that name, kept once, and opens it in the main window', !!made && after.length === before + 1 && made.kind === 'note' && asked.at(-1)?.[0] === 'capture' && asked.at(-1)?.[1] === made.id, JSON.stringify({ made: made && [made.kind, made.status], count: [before, after.length], asked: asked.at(-1) }))
  check('…the draft on Write was not sent by that ⌘↵', !after.some((one) => /Call Mu/.test(one.label)))
  await page.evaluate(() => window.api.showPrompt())
  await wait(800)
  at = await drawn()
  check('…and it is still on the line, on Write, when the box comes back', chosen(at) === 'write' && at.writing?.text === 'Call Mu', JSON.stringify({ chosen: chosen(at), text: at.writing?.text }))
}

if (part('today')) {
  // An event later today, by the page's own clock (the probe's calm hour), so the glance has one to put first.
  const seminar = await page.evaluate(() => { const at = new Date(); at.setHours(16, 0, 0, 0); return [at.toISOString(), new Date(at.getTime() + 3600e3).toISOString()] })
  await v('event:add', { title: 'Glance probe seminar', start: seminar[0], end: seminar[1], calendarId: 'personal', allDay: false })
  await fresh()
  await spyOpens()
  await pick('today', 'Control+Alt+Digit3')
  const today = await page.evaluate(() => new Date().toDateString())
  const dayOf = (iso) => (iso ? new Date(iso).toDateString() : null)
  // What the list should hold: open tasks placed today or before, as the side panel's Today has them.
  const rows = () => page.evaluate(() => ({
    order: [...document.querySelectorAll('[data-glance-panel] :is([data-glance-event], [data-row])')].map((one) => (one.hasAttribute('data-glance-event') ? 'event' : 'task')),
    tasks: [...document.querySelectorAll('[data-glance-panel] [data-row]')].map((one) => ({ id: one.dataset.id, title: one.querySelector('[data-task-title]')?.textContent ?? '', struck: !!one.querySelector('.mf-strike'), late: /^Late/.test(one.querySelector('[data-task-when]')?.textContent ?? '') })),
    empty: document.querySelector('[data-glance-panel] [data-glance-empty]')?.textContent ?? null
  }))
  let list = await rows()
  console.log(`Today's glance at the start: ${list.order.filter((one) => one === 'event').length} events, ${list.tasks.length} tasks${list.empty ? `, saying “${list.empty}”` : ''}`)
  const lateness = list.tasks.map((task) => task.late)
  check('what is late comes first, then today\'s tasks', lateness.includes(true) && lateness.includes(false) && lateness.lastIndexOf(true) < lateness.indexOf(false), JSON.stringify(list.tasks.map((task) => `${task.late ? 'LATE ' : ''}${task.title.slice(0, 30)}`)))
  // A task for today, from the line.
  const one = `Water the ferns ${Date.now() % 100000}`
  await page.keyboard.type(one)
  await wait(200)
  await page.keyboard.press('Enter')
  await wait(1200)
  let made = (await tasks()).find((task) => task.title.includes(one))
  list = await rows()
  check('↵ adds the words as a task for today, and it is in the glance at once', !!made && made.status === 'open' && dayOf(made.dueAt ?? made.scheduledAt) === today && list.tasks.some((task) => task.id === made.id), JSON.stringify({ made: made && [made.title, made.dueAt, made.scheduledAt], shown: list.tasks.length }))
  check('…the line is empty again with the caret in it, the pill where it was', (await drawn()).line?.value === '' && (await drawn()).line?.focused && same((await drawn()).card, start.page.card))
  // A day in the words wins over today, and lights as it is typed. (A weekday three days on: "friday" typed on a Friday is today.)
  const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const want = (await page.evaluate(() => new Date().getDay()) + 3) % 7
  const two = `Call the bank ${Date.now() % 100000}`
  await page.keyboard.type(`${two} ${names[want]}`)
  await wait(400)
  const lit = await page.evaluate(() => [...document.querySelectorAll('[data-glance-line] mark')].map((mark) => mark.textContent))
  check(`“${names[want]}” lights in the line as it is typed`, lit.some((mark) => (mark ?? '').toLowerCase() === names[want]), JSON.stringify(lit))
  await shoot('today-typed')
  await page.keyboard.press('Enter')
  await wait(1200)
  const later = (await tasks()).find((task) => task.title.includes(two))
  list = await rows()
  check(`…and ↵ puts it on ${names[want]}, not today: out of today's glance, said where it went`, !!later && new Date(later.dueAt ?? later.scheduledAt).getDay() === want && dayOf(later.dueAt ?? later.scheduledAt) !== today && !list.tasks.some((task) => task.id === later.id), JSON.stringify(later && [later.title, later.dueAt, later.scheduledAt]))
  const said = await page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast], [role=status]')].map((one) => one.textContent?.trim()).filter(Boolean))
  check('…a notice says where it went, with Undo, clear of the glance\'s rows', said.some((text) => /Undo/.test(text ?? '')), JSON.stringify(said))
  // Today's events come before the tasks.
  check('today\'s event is there, and the events come before the tasks', list.order[0] === 'event' && list.order.lastIndexOf('event') < (list.order.indexOf('task') < 0 ? Infinity : list.order.indexOf('task')), list.order.join(' '))
  // ↓ from the empty line walks the rows.
  await wait(3500)
  await page.keyboard.press('ArrowDown')
  await wait(250)
  const walked = await page.evaluate(() => ({ lit: document.querySelectorAll('[data-glance-panel] [data-row][data-cursor]').length, focused: document.activeElement === document.querySelector('[data-glance-line] input') }))
  check('↓ from the line lights a row, the caret still in the line', walked.lit === 1 && walked.focused, JSON.stringify(walked))
  // A tag begun on the line: the tags in use are offered under the pill, whole and on top of the glance.
  await page.keyboard.type('#')
  await wait(500)
  const offers = await page.evaluate(() => {
    const list = document.querySelector('[data-glance-line] [data-tag-offers]')
    if (!list) return null
    const r = list.getBoundingClientRect()
    const card = document.querySelector('.app-container').getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 14))
    return { rows: list.querySelectorAll('[data-tag-offer]').length, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), cardBottom: card.bottom, seen: !!hit && list.contains(hit), inWindow: r.bottom <= innerHeight }
  })
  check('a # typed on Today\'s line: the tags in use are offered under the pill, whole and on top of the glance', !!offers && offers.rows > 0 && offers.top >= offers.cardBottom && offers.seen && offers.inWindow, JSON.stringify(offers))
  if (shots) await page.screenshot({ path: `${shots}/glance-today-tag.png` }).catch(() => {})
  // Esc shuts the offers alone (the line's own), then ⌫ takes the # back.
  await page.keyboard.press('Escape')
  await page.keyboard.press('Backspace')
  await wait(300)
  check('…Esc there shuts the offers only: still on Today, the box up', chosen(await drawn()) === 'today' && (await onScreen())?.visible && !(await page.$('[data-tag-offers]')))
  // A row's right-click menu, then a real press where a tab is: the menu goes, as a Mac menu does at a press outside
  // it (one floating thing, or none).
  const quiet = { panel: (await drawn()).panel, window: (await onScreen())?.window }
  await page.click(`[data-glance-panel] [data-row][data-id="${made.id}"]`, { button: 'right' })
  await wait(500)
  const menuUp = await page.evaluate(() => document.querySelectorAll('[role=menu]').length)
  const withMenu = { panel: (await drawn()).panel, window: (await onScreen())?.window }
  check('a row\'s menu open in the glance: the glance keeps its size and place, the pill too (room for the menu only grows under them)', menuUp === 1 && same(withMenu.panel, quiet.panel) && same((await drawn()).card, start.page.card), JSON.stringify({ quiet, withMenu }))
  const notesTab = await page.locator('[data-glance-tab="notes"]').boundingBox()
  await page.mouse.click(notesTab.x + notesTab.width / 2, notesTab.y + notesTab.height / 2)
  await wait(500)
  const menuAfter = await page.evaluate(() => ({ menus: document.querySelectorAll('[role=menu]').length, floating: document.querySelectorAll('[data-slot="popover-content"], [role=dialog]').length, on: document.querySelector('[data-glance-tab][aria-selected=true]')?.dataset.glanceTab }))
  check('a row\'s menu open, then a press on a tab: the menu goes, nothing else floats', menuUp === 1 && menuAfter.menus === 0 && menuAfter.floating === 0, JSON.stringify({ menuUp, ...menuAfter }))
  await pick('today')
  // One floating thing (qa/one-floating-thing.mjs): a row's date picker up, then a real press on a tab, another or
  // its own, leaves nothing floating or one thing that is not the picker.
  const floating = () => page.evaluate(() => [...new Set(document.querySelectorAll('[data-slot="popover-content"], [role="menu"], [role="dialog"]'))]
    .filter((one) => one.getClientRects().length && one.getAttribute('data-state') !== 'closed').length)
  for (const then of ['notes', 'today']) {
    const chip = page.locator(`[data-glance-panel] [data-row][data-id="${made.id}"] [data-date-chip]`).first()
    if (!(await chip.count())) { check(`a date picker up in the glance, then ${then}: the row has its date chip`, false); continue }
    await chip.click()
    await wait(500)
    const pickerUp = await floating()
    const tab = await page.locator(`[data-glance-tab="${then}"]`).boundingBox()
    await page.mouse.click(tab.x + tab.width / 2, tab.y + tab.height / 2)
    await wait(500)
    const left = await floating()
    check(`a row's date picker up, then the “${then === 'notes' ? 'Notes' : 'Today'}” tab pressed: nothing is left floating`, pickerUp === 1 && left === 0, JSON.stringify({ pickerUp, left }))
    await pick('today')
  }
  // Ticked in place: its own tick, struck, then gone from the glance; done in the book.
  await page.hover(`[data-glance-panel] [data-row][data-id="${made.id}"]`)
  const tick = page.locator(`[data-glance-panel] [data-row][data-id="${made.id}"]`).locator('xpath=ancestor::*[.//button[@data-task-tick]][1]').locator('[data-task-tick]').first()
  // Watched in the page itself from the press on, every frame for a second: struck, then gone.
  const seen = page.evaluate((id) => new Promise((done) => {
    const marks = []
    const from = performance.now()
    const look = () => {
      const row = document.querySelector(`[data-glance-panel] [data-row][data-id="${id}"]`)
      marks.push(!row ? 'gone' : row.querySelector('.mf-strike') ? 'struck' : 'plain')
      if (performance.now() - from < 1000) requestAnimationFrame(look)
      else done(marks)
    }
    requestAnimationFrame(look)
  }), made.id)
  await tick.click()
  const marks = await seen
  await wait(700)
  list = await rows()
  made = (await tasks()).find((task) => task.id === made.id)
  const order = marks.filter((mark, at) => mark !== marks[at - 1])
  check('a task is ticked in place: struck through, then out of the glance, done in the book', order.includes('struck') && order.indexOf('struck') < order.lastIndexOf('gone') && !list.tasks.some((task) => task.id === made?.id) && made?.status === 'done', JSON.stringify({ order, status: made?.status }))
  check('…the pill has not moved through any of it', same((await drawn()).card, start.page.card) && same((await onScreen())?.card, start.screen?.card))
  await shoot('today')
  // Opened again: still ticked.
  const id = made?.id
  await c.close()
  c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
  ;({ page, v, electron, h } = c)
  const again = (await tasks()).find((task) => task.id === id)
  check('the app opened again: the task is still ticked', again?.status === 'done', JSON.stringify(again && [again.title, again.status]))
  await v('settings:set', { hintRate: 0, rotCount: 0, boxHideButtons: false, boxOneLine: true, boxGlance: true })
  await wait(900)
  await fresh()
}

if (part('looks')) {
  // The smallest and the largest text size, and each theme family: the tabs stand on the pill, the pill is one line,
  // each tab's line and glance sit as in Paper at the usual size.
  for (const [size, theme] of [[0.8, 'paper'], [1.6, 'paper'], [1, 'github'], [1, 'dark'], [1, 'paper']]) {
    await v('settings:set', { textSize: size })
    await look(theme)
    await wait(1200)
    await fresh()
    const base = await drawn()
    const said = []
    for (const id of ['notes', 'today']) {
      await pick(id)
      const at = await drawn()
      const on = at.tabs.find((one) => one.on)
      const ok = at.pill && same(at.card, base.card) && !!on && Math.abs(on.foot - at.card.y) <= 0.6 && at.tabs.every((one) => one.x + one.w <= at.card.x + at.card.w / 2 - 32) &&
        !!at.line && Math.abs(at.line.x - base.writing.x) <= 1 && at.line.size === base.writing.size && Math.abs((at.line.y + at.line.h / 2) - (base.writing.y + base.writing.lh / 2)) <= 1 &&
        !!at.panel && at.panel.y + at.panel.h <= at.inner[1] - 16 && Math.abs(at.panel.w - at.card.w) <= 0.6
      said.push(`${id} ${ok ? 'ok' : JSON.stringify({ card: at.card, base: base.card, on, line: at.line && [at.line.x, at.line.y, at.line.h, at.line.size], writing: [base.writing.x, base.writing.y, base.writing.h, base.writing.size], panel: at.panel })}`)
      if (shots) await page.screenshot({ path: `${shots}/glance-look-${theme}-${size}-${id}.png` }).catch(() => {})
    }
    await pick('write')
    check(`text size ${size}, ${theme}: the pill is one line (${base.card.h}px), the tabs stand on it, each line and glance in place`, base.card.h === 56 && said.every((one) => one.endsWith('ok')), said.join(' | '))
  }
}

if (part('off')) {
  // The switch off: today's pill, nothing more, and its keys do nothing.
  await v('settings:set', { boxGlance: false, textSize: 1 })
  await look('paper')
  await wait(1200)
  await fresh()
  let at = await drawn()
  const screen = await onScreen()
  check('“Glance tabs” off: the pill alone, no tabs, where and as big as it is with them', at.pill && at.tabs.length === 0 && !at.panel && at.ends && same(at.card, start.page.card) && same(screen?.card, start.screen?.card), JSON.stringify({ tabs: at.tabs.length, card: at.card }))
  // The same picture as the build before this one draws (its own run of this part prints the same line to compare),
  // taken before any key, the caret hidden so its blink cannot tell two pictures apart.
  await page.mouse.move(5, 5)
  await wait(600)
  const caret = await page.addStyleTag({ content: '* { caret-color: transparent !important; }' })
  await wait(300)
  console.log(`the pill with the tabs off, as drawn: ${sha(await page.screenshot({ animations: 'disabled' }))}`)
  await caret.evaluate((tag) => tag.remove())
  await page.keyboard.press('Meta+Shift+BracketRight')
  await page.keyboard.press('Control+Alt+Digit3')
  await wait(400)
  at = await drawn()
  check('…and the tabs\' keys do nothing (no side panel either: ⌃⌥3 is not ⌃3)', at.pill && at.tabs.length === 0 && !at.panel && !at.line && at.writing?.focused, JSON.stringify({ pill: at.pill, tabs: at.tabs.length, panel: !!at.panel, line: !!at.line, focused: at.writing?.focused }))
  if (shots) await page.screenshot({ path: `${shots}/glance-off-paper.png` })
  await v('settings:set', { boxGlance: true })
  await wait(900)
  await fresh()
  at = await drawn()
  check('on again: the tabs are back on the pill', at.tabs.length === 3 && chosen(at) === 'write')
  await shoot('write')
  await pick('notes')
  await shoot('notes')
  await pick('write')
  // Settings: the switch sits under “One line to start”, with its own sample; pressed, the tabs go and come back.
  await c.go('settings')
  await h.click('[data-section="Appearance"]').catch(() => {})
  await h.waitForTimeout(700)
  const row = h.locator('[data-setting-title="Glance tabs"]')
  await row.scrollIntoViewIfNeeded().catch(() => {})
  await h.waitForTimeout(300)
  const beside = await h.evaluate(() => {
    const line = document.querySelector('[data-setting-title="One line to start"]')
    const tabs = document.querySelector('[data-setting-title="Glance tabs"]')
    return line && tabs ? { under: line.nextElementSibling === tabs, sample: !!tabs.querySelector('[data-glance-sample]') } : null
  })
  check('Settings: “Glance tabs” sits right under “One line to start”, with a sample of its own', beside?.under && beside.sample, JSON.stringify(beside))
  const sample = () => h.evaluate(() => getComputedStyle(document.querySelector('[data-glance-sample] > span')).opacity)
  if (shots) await row.screenshot({ path: `${shots}/glance-setting-on.png` }).catch(() => {})
  await row.locator('[role=switch]').click()
  await h.waitForTimeout(700)
  check('…its switch off: the sample shows the pill alone, and the box has no tabs', (await v('settings')).boxGlance === false && (await sample()) === '0' && (await drawn()).tabs.length === 0, JSON.stringify({ setting: (await v('settings')).boxGlance, sample: await sample(), tabs: (await drawn()).tabs.length }))
  if (shots) await row.screenshot({ path: `${shots}/glance-setting-off.png` }).catch(() => {})
  await row.locator('[role=switch]').click()
  await h.waitForTimeout(700)
  check('…and on again: the sample has its tabs, and so has the box', (await v('settings')).boxGlance === true && (await sample()) === '1' && (await drawn()).tabs.length === 3)
  await v('settings:set', { boxOneLine: false })
  await h.waitForTimeout(700)
  const why = await row.textContent()
  check('with “One line to start” off, the row says why the tabs wait, and the box is the whole box', /“One line to start” is off/.test(why ?? '') && (await drawn()).tabs.length === 0 && !(await drawn()).pill, (why ?? '').slice(0, 200))
  await v('settings:set', { boxOneLine: true })
  await h.waitForTimeout(700)
  // The Keys page: every key the tabs answer.
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:shortcuts')))
  await h.waitForTimeout(900)
  const keys = await h.evaluate(() => document.querySelector('[role=dialog][aria-label="Keyboard shortcuts"]')?.textContent ?? '')
  check('the list of keys has the tabs\' five: next, before, and one each', ['the next tab', 'the tab before', 'Glance tab: Write', 'Glance tab: Notes', 'Glance tab: Today'].every((one) => keys.includes(one)), `${keys.length} characters read`)
  await h.keyboard.press('Escape')
}

if (PART === 'foot') {
  // Dragged near the screen's foot, then opened again: too little room under the pill for a glance, so it hangs
  // above the tabs instead, whole, in the room the window keeps there; the pill stays where it was put.
  const put = await electron.evaluate(({ BrowserWindow, screen }) => {
    const box = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && /\/index\.html/.test(w.webContents.getURL()) && !/view=/.test(w.webContents.getURL()))
    if (!box) return null
    const at = box.getBounds()
    const area = screen.getDisplayMatching(at).workArea
    const y = area.y + area.height - at.height - 60
    box.setPosition(at.x, y)
    return { x: at.x, y }
  })
  await wait(500)
  await page.evaluate(() => window.api.hideWindow())
  await wait(800)
  await page.evaluate(() => window.api.showPrompt())
  await wait(1400)
  const room = await page.evaluate(() => ({ under: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mf-room')), over: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mf-room-top')) }))
  const low = await onScreen()
  console.log(`put low: ${JSON.stringify(put)}, on screen ${JSON.stringify(low?.card)}, room ${JSON.stringify(room)}`)
  for (const id of ['notes', 'today']) {
    await pick(id)
    const at = await drawn()
    const tabs = await page.evaluate(() => document.querySelector('[data-glance-tabs]')?.getBoundingClientRect().top ?? null)
    check(`near the screen's foot (${Math.round(room.under)}px under the pill): ${id}'s glance hangs above the tabs, 8px clear, whole in the window, at least 100px tall`,
      room.under < 120 && !!at.panel && tabs !== null && Math.abs(at.panel.y + at.panel.h - (tabs - 8)) <= 0.6 && at.panel.y >= 11.5 && at.panel.h >= 100 && Math.abs(at.panel.w - at.card.w) <= 0.6,
      JSON.stringify({ panel: at.panel, tabs, card: at.card, room }))
    check('…the pill has not moved on screen', same((await onScreen())?.card, low?.card), JSON.stringify((await onScreen())?.card))
    if (shots) await page.screenshot({ path: `${shots}/glance-foot-${id}.png` }).catch(() => {})
  }
  // A tag begun on Today's line there: offered above the tabs, whole, on top of the glance; the pill as it was.
  await page.keyboard.type('#')
  await wait(500)
  const footOffers = await page.evaluate(() => {
    const list = document.querySelector('[data-glance-line] [data-tag-offers]')
    if (!list) return null
    const r = list.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 14))
    return { rows: list.querySelectorAll('[data-tag-offer]').length, top: Math.round(r.top), bottom: Math.round(r.bottom), card: Math.round(document.querySelector('.app-container').getBoundingClientRect().top), seen: !!hit && list.contains(hit), inWindow: r.top >= 0 && r.bottom <= innerHeight }
  })
  check('…a # typed there: the tags in use are offered above the tabs, whole and on top', !!footOffers && footOffers.rows > 0 && footOffers.bottom <= footOffers.card - 30 && footOffers.seen && footOffers.inWindow && same((await onScreen())?.card, low?.card), JSON.stringify(footOffers))
  if (shots) await page.screenshot({ path: `${shots}/glance-foot-tag.png` }).catch(() => {})
  await page.keyboard.press('Escape')
  await page.keyboard.press('Backspace')
  await wait(300)
  // A notice there (a task added for a later day) stays clear of the line and of the rows nearest it.
  await page.keyboard.type(`Post the parcel ${Date.now() % 100000} in 3 days`)
  await page.keyboard.press('Enter')
  await wait(900)
  const notice = await page.evaluate(() => {
    const toast = [...document.querySelectorAll('[role=status]')].filter((one) => /Undo/.test(one.textContent ?? '')).at(-1)?.getBoundingClientRect()
    const card = document.querySelector('.app-container').getBoundingClientRect()
    return toast ? { top: toast.top, bottom: toast.bottom, cardTop: card.top, cardBottom: card.bottom } : null
  })
  check('…a notice there lies clear of the pill', !!notice && (notice.bottom <= notice.cardTop - 4 || notice.top >= notice.cardBottom + 4), JSON.stringify(notice))
  await page.keyboard.press('Escape')
  await wait(400)
}

if (part('siblings') && shots) {
  // Pictures to set beside each other, light and dark: each glance, the box's own side panel on its Tasks, and the
  // main window's tab row, whose shape the chosen tab wears.
  await v('settings:set', { boxGlance: true, boxOneLine: true, textSize: 1 })
  await wait(900)
  await fresh()
  await shoot('sib-write')
  await pick('notes')
  await shoot('sib-notes')
  await pick('today')
  await shoot('sib-today')
  await page.hover('[data-glance-panel] [data-row]').catch(() => {})
  await wait(700)
  await page.screenshot({ path: `${shots}/glance-sib-today-hover-paper.png` }).catch(() => {})
  await page.mouse.move(5, 5)
  await pick('write')
  await page.keyboard.press('Control+Digit2')
  await wait(1500)
  await shoot('sib-side-panel')
  await page.keyboard.press('Meta+Backslash')
  await wait(1200)
  for (const theme of ['light', 'dark']) {
    await c.look(theme)
    await h.screenshot({ path: `${shots}/glance-sib-main-tabs-${theme}.png`, clip: { x: 0, y: 0, width: 1100, height: 120 } }).catch(() => {})
  }
  await c.look('light')
}

if (part('film') && film) {
  // Every frame the page drew through each change, to read by eye: tab to tab, the glance opening and shutting, a row ticked.
  const cdp = await page.context().newCDPSession(page)
  const takes = [
    ['1-write-to-notes-pointer', () => page.click('[data-glance-tab="notes"]')],
    ['2-notes-to-today-pointer', () => page.click('[data-glance-tab="today"]')],
    ['3-today-ticked', async () => { const tick = page.locator('[data-glance-panel] [data-task-tick]').first(); if (await tick.count()) await tick.click() }],
    ['4-today-to-write-esc', () => page.keyboard.press('Escape')],
    ['5-write-to-notes-key', () => page.keyboard.press('Control+Alt+Digit2')],
    ['6-notes-to-write-key', () => page.keyboard.press('Control+Alt+Digit1')]
  ]
  for (const theme of ['paper', 'dark']) {
    await look(theme)
    await wait(1200)
    await fresh()
    for (const [name, act] of takes) {
      const frames = []
      const onFrame = ({ data, sessionId, metadata }) => { frames.push({ t: metadata.timestamp, data }); cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}) }
      cdp.on('Page.screencastFrame', onFrame)
      await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 })
      await wait(120)
      const from = frames.length
      await act()
      await wait(700)
      await cdp.send('Page.stopScreencast')
      cdp.off('Page.screencastFrame', onFrame)
      const kept = frames.slice(Math.max(0, from - 1))
      kept.forEach((frame, index) => writeFileSync(`${film}/${theme}-${name}-${String(index).padStart(2, '0')}-${Math.round((frame.t - kept[0].t) * 1000)}ms.png`, Buffer.from(frame.data, 'base64')))
      console.log(`film ${theme} ${name}: ${kept.length} frames over ${Math.round((kept.at(-1).t - kept[0].t) * 1000)}ms`)
    }
  }
  await look('paper')
}

console.log(c.errors.length ? c.errors.join('\n') : 'no page errors')
console.log(`${results.filter(Boolean).length}/${results.length}`)
await c.close()
process.exit(results.every(Boolean) ? 0 : 1)

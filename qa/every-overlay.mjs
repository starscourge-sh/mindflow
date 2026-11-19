// Every shortcut and menu opened from every window, light and dark, with a picture of each to read by eye:
// ⌘K, ⌘P, ⌘/, ⌃L, / # @, the kind chip, Display (F), the gear menu, Settings (⌘,), and the right-click menus on a row
// and on picked words. Windows: the main window in Home (with a painting), Today, Writing, Journal, Feed, Map and
// Review; quick capture's one-line pill and its grown box; and a sticky (Today's). Also every kind of row on Home
// right-clicked (one of each kind), words picked on Home right-clicked, and ⌃L in the main window with a capture open.
// For each pair it checks what any overlay must be: whole inside its window, no row cut off without a way to scroll
// to it, an opaque surface (never see-through over the page), one at a time, and gone again after Esc. A shortcut
// that has nothing to open in a place (a kind chip where there is no kind) is listed as "none" and passes.
// Pictures go to QA_SHOTS (default $QA_DATA/every-overlay), one per window, overlay and look, plus a table (table.txt).
// With HALIGTREE_QA_ONSCREEN=1 the capture window's pictures are of the window on screen (by its id), so a window
// box or a blur shape left behind shows too.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/every-overlay.mjs
import { execFileSync } from 'child_process'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.QA_SHOTS ?? join(process.env.QA_DATA ?? '/tmp', 'every-overlay')
mkdirSync(shots, { recursive: true })
const only = process.env.QA_ONLY?.split(',')
const { check, done } = checks()
const c = await sandbox({ width: 1180, height: 800, at: CALM_HOUR })
const { page: box, electron, h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const LINE = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'

/** Every overlay open in a window now: its box, whether it fits, cut rows, and whether its surface is opaque. */
const overlays = (win) => win.evaluate(() => {
  const SEL = '[role=dialog], [role=alertdialog], [role=menu], [role=listbox], [data-slot=popover-content], .tiptap-suggestion-popup, [cmdk-dialog], [data-slot=dialog-content], [data-radix-popper-content-wrapper] > *'
  const seen = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && Number(s.opacity) > 0.1 }
  // A part inside another one found (a menu in its popper, a list in its dialog) is the same overlay.
  const all = [...document.querySelectorAll(SEL)].filter(seen)
  const tops = all.filter((el) => !all.some((other) => other !== el && other.contains(el)))
  const alpha = (color) => { const m = color.match(/rgba?\(([^)]+)\)/); if (!m) return color === 'transparent' ? 0 : 1; const p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length > 3 ? Number(p[3]) : 1 }
  return tops.map((el) => {
    const r = el.getBoundingClientRect()
    // The surface: this or the first part inside it that is drawn (a wrapper can be bare, its card inside).
    let surface = 0
    for (const one of [el, ...el.querySelectorAll('*')].slice(0, 6)) { const a = alpha(getComputedStyle(one).backgroundColor); if (a > surface) surface = a; if (a >= 0.9) break }
    const list = el.querySelector('[cmdk-list], [data-radix-scroll-area-viewport]') ?? el
    const lr = list.getBoundingClientRect()
    const rows = [...el.querySelectorAll('[cmdk-item], [role=menuitem], [role=option], [role=menuitemcheckbox], [role=menuitemradio]')].map((row) => row.getBoundingClientRect())
    const cut = rows.filter((row) => row.top < lr.bottom - 1 && row.bottom > lr.bottom + 1).length
    return {
      kind: el.getAttribute('role') ?? el.dataset.slot ?? String(el.className).slice(0, 24),
      box: [r.left, r.top, r.width, r.height].map(Math.round),
      inWindow: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      cut, scrolls: [list, ...el.querySelectorAll('*')].some((one) => one.scrollHeight > one.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(one).overflowY)), rows: rows.length, surface: Math.round(surface * 100) / 100,
      words: el.innerText.replace(/\s+/g, ' ').slice(0, 60)
    }
  })
}).catch(() => [])

/** Clicks the first thing drawn that matches, inside the window, or says it found none. Only what a pointer would
 * press there counts: never a part faded out under another (the pill's kind mark, hidden in the grown box). */
const clickFirst = (win, sel, options = {}) => win.evaluate((s) => {
  for (const one of document.querySelectorAll(s)) {
    const r = one.getBoundingClientRect()
    if (!(r.width > 2 && r.height > 2 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth) || one.disabled) continue
    const at = [r.left + Math.min(r.width / 2, 40), r.top + r.height / 2]
    if (one.contains(document.elementFromPoint(at[0], at[1]))) return at
  }
  return null
}, sel).then(async (at) => { if (!at) return false; await win.mouse.click(at[0], at[1], options); return true })

/** Focus the window's writing, at its end: a note, the day's page, or the capture box. False if it has none. */
const toWriting = (win) => win.evaluate(() => {
  const ed = [...document.querySelectorAll('.ProseMirror[contenteditable=true]')].find((one) => { const r = one.getBoundingClientRect(); return r.width > 40 && r.height > 8 && r.top >= 0 && r.bottom <= innerHeight + 200 })
  if (!ed) return false
  ed.focus()
  const range = document.createRange(); range.selectNodeContents(ed); range.collapse(false)
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range)
  return true
})
/** A word picked in the window's writing (or in any text, if it has none), and the point to right-click it. */
const pickWords = (win) => win.evaluate(() => {
  const ed = [...document.querySelectorAll('.ProseMirror[contenteditable=true] p, .ProseMirror[contenteditable=true] li, [data-row] *')].find((one) => { const r = one.getBoundingClientRect(); return one.firstChild?.nodeType === 3 && one.textContent.trim().length > 3 && r.top >= 40 && r.bottom <= innerHeight - 40 })
  if (!ed) return null
  const text = ed.firstChild
  const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, Math.min(text.textContent.length, Math.max(3, text.textContent.indexOf(' ') > 0 ? text.textContent.indexOf(' ') : 4)))
  ed.closest('[contenteditable=true]')?.focus()
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range)
  const r = range.getBoundingClientRect()
  return [r.left + r.width / 2, r.top + r.height / 2]
})

/** A key as the Mac sends it, through the window's own input (so main's shortcuts, like ⌘, hear it too). */
const realKey = (win, keyCode, modifiers) => electron.evaluate(({ BrowserWindow }, [url, keyCode, modifiers]) => {
  const one = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === url)
  if (!one) return false
  one.focus()
  one.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
  one.webContents.sendInputEvent({ type: 'char', keyCode, modifiers })
  one.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
  return true
}, [win.url(), keyCode, modifiers])

// Each overlay: how a person opens it. `open` returns false when the window has nothing to open it from.
const OVERLAYS = [
  { id: 'cmd-k', label: '⌘K', open: (win) => realKey(win, 'k', ['meta']) },
  { id: 'cmd-p', label: '⌘P', open: (win) => realKey(win, 'p', ['meta']) },
  { id: 'cmd-slash', label: '⌘/', open: (win) => realKey(win, '/', ['meta']) },
  { id: 'ctrl-l', label: '⌃L', open: async (win) => { await toWriting(win); return realKey(win, 'l', ['control']) } },
  { id: 'slash', label: '/', open: async (win) => (await toWriting(win)) && (await win.keyboard.type(' /'), true), writes: 2 },
  { id: 'tag', label: '#', open: async (win) => (await toWriting(win)) && (await win.keyboard.type(' #'), true), writes: 2 },
  { id: 'mention', label: '@', open: async (win) => (await toWriting(win)) && (await win.keyboard.type(' @'), true), writes: 2 },
  // The pill's kind mark grows the pill into the box to show its kind chip ("Kind, and more"): then the chip, as a person would.
  { id: 'kind', label: 'kind chip', open: async (win) => {
    if (!(await clickFirst(win, '[data-pill-kind], [data-kind-chip]'))) return false
    await win.waitForTimeout(900)
    if (!(await overlays(win)).length) await clickFirst(win, '[data-kind-chip]')
    return true
  } },
  { id: 'display', label: 'Display (F)', open: async (win) => { await win.evaluate(() => document.activeElement?.blur?.()); await win.keyboard.press('f'); await win.waitForTimeout(500); if ((await overlays(win)).length) return true; return clickFirst(win, '[data-display]') } },
  { id: 'gear', label: 'gear menu', open: (win) => clickFirst(win, 'button[aria-label="Options"], button[aria-label="Settings"], [data-gear]') },
  { id: 'settings', label: 'Settings ⌘,', open: (win) => realKey(win, ',', ['meta']), settings: true },
  { id: 'row-menu', label: 'right-click a row', open: (win) => clickFirst(win, '[data-row], [data-task-row], [data-pin], [data-recent-row], [data-reading-row], [data-deck-row], [data-zen-row] > *', { button: 'right' }) },
  { id: 'words-menu', label: 'right-click picked words', open: async (win) => { const at = await pickWords(win); if (!at) return false; await win.mouse.click(at[0], at[1], { button: 'right' }); return true } }
]

const table = []
const onscreen = !!process.env.HALIGTREE_QA_ONSCREEN

/** A picture of the window: the page, or (on screen, for the capture window) the window itself by its id. */
async function picture(win, file, isBox) {
  if (isBox && onscreen) {
    const id = await electron.evaluate(({ BrowserWindow }) => {
      const one = BrowserWindow.getAllWindows().find((w) => /index\.html/.test(w.webContents.getURL()) && !/view=/.test(w.webContents.getURL()))
      one.setContentProtection(false)
      return one.getMediaSourceId().split(':')[1]
    })
    await wait(250)
    try { execFileSync('screencapture', ['-x', '-o', `-l${id}`, file]); return } catch {}
  }
  await win.screenshot({ path: file }).catch(() => {})
}
const homeOverlays = () => overlays(h)
const homeView = () => h.evaluate(() => document.querySelector('[data-view]')?.getAttribute('data-view') ?? location.hash)

async function judge(where, win, one, look, { isBox, reset }) {
  await reset()
  const before = await overlays(win)
  const opened = await one.open(win)
  await win.waitForTimeout(isBox ? 1100 : 800)
  const here = await overlays(win)
  // From the capture window, the big ones open in the main window: read them there.
  const there = win === h ? [] : await homeOverlays()
  const name = `${where} ${one.label} (${look})`
  const file = join(shots, `${where.replace(/\W+/g, '-')}-${one.id}-${look}.png`)
  await picture(win, file, isBox)
  if (there.length) await h.screenshot({ path: file.replace('.png', '-main.png') }).catch(() => {})
  let cell
  if (!opened) cell = 'none (nothing to open it from)'
  else if (one.settings) {
    const s = await h.evaluate(() => [...document.querySelectorAll('h1, h2, header *')].some((el) => el.textContent.trim() === 'Settings')).catch(() => false)
    cell = s ? 'opens Settings in the main window' : 'nothing'
    check(`${name}: opens Settings`, s)
  } else if (!here.length && !there.length) {
    // ⌃L picks a kind only on a capture or gem: none open in the main window's views or a sticky.
    const fine = one.id === 'ctrl-l' && win !== box && where !== 'Capture'
    cell = fine ? 'none (⌃L picks a kind only on an open capture or gem)' : 'nothing opened'
    if (!fine) check(`${name}: opens something`, false)
  } else {
    const all = [...here.map((o) => ({ ...o, in: 'here' })), ...there.map((o) => ({ ...o, in: 'main' }))]
    const fits = all.every((o) => o.inWindow)
    const whole = all.every((o) => !o.cut || o.scrolls)
    const solid = all.every((o) => o.surface >= 0.85)
    const single = here.length <= 1 || before.length >= here.length
    const wrong = [!fits && 'runs out of its window', !whole && 'a row cut off', !solid && 'see-through surface', !single && `${here.length} overlays at once`].filter(Boolean)
    cell = wrong.length ? wrong.join(', ') : `pass${there.length ? ' (in the main window)' : ''}`
    check(`${name}: whole, opaque, one at a time`, !wrong.length, JSON.stringify(all))
  }
  // Gone again with Esc (twice: a suggestion first, then its writing), nothing left over.
  await win.keyboard.press('Escape'); await win.waitForTimeout(150); await win.keyboard.press('Escape'); await win.waitForTimeout(350)
  if (win !== h) { await h.keyboard.press('Escape').catch(() => {}); await h.keyboard.press('Escape').catch(() => {}) }
  if (opened && !one.settings) {
    const left = (await overlays(win)).length + (win === h ? 0 : (await homeOverlays()).length)
    check(`${name}: Esc closes it`, left === 0, `${left} left`)
    if (left) cell += ', Esc leaves it open'
  }
  if (opened && one.writes) { await toWriting(win); for (let i = 0; i < one.writes; i++) await win.keyboard.press('Backspace') }
  table.push([where, one.label, look, cell])
  console.log(`  ${where} | ${one.label} | ${look} | ${cell}`)
}

/** Every kind of row on Home that has a right-click menu (one of each kind, by the marks it carries), never the sidebar's. */
const homeRowKinds = () => h.evaluate(() => {
  const kinds = new Map()
  for (const one of document.querySelectorAll('[data-row-menu]')) {
    if (one.closest('aside')) continue
    const r = one.getBoundingClientRect()
    if (r.width < 8 || r.height < 8) continue
    const sig = `${one.tagName.toLowerCase()}:${Object.keys(one.dataset).filter((key) => !/^(rowMenu|state|slot|active|open)$/.test(key)).sort().join(',')}`
    if (!kinds.has(sig)) kinds.set(sig, one)
  }
  document.querySelectorAll('[data-qa-kind]').forEach((one) => one.removeAttribute('data-qa-kind'))
  return [...kinds].map(([sig, one], at) => (one.setAttribute('data-qa-kind', String(at)), sig))
})
/** Words picked on Home itself (a card's or a row's words, never the sidebar's), and the point to right-click them. */
// Only words a person can pick: the app's labels, rows and dates do not select (main.css, body), so a range set on
// them by script is gone at the press, and nothing could open on it.
const pickHomeWords = () => h.evaluate(() => {
  const walk = document.createTreeWalker(document.querySelector('main') ?? document.body, NodeFilter.SHOW_TEXT)
  for (let text = walk.nextNode(); text; text = walk.nextNode()) {
    const el = text.parentElement
    if (!el || el.closest('aside, button, [role=button], input, textarea') || getComputedStyle(el).userSelect === 'none' || text.textContent.trim().length < 12) continue
    const r = el.getBoundingClientRect()
    if (r.top < 60 || r.bottom > innerHeight - 40 || r.width < 40) continue
    const start = text.textContent.search(/\S/)
    const range = document.createRange(); range.setStart(text, start); range.setEnd(text, Math.min(text.textContent.length, start + 8))
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range)
    const b = range.getBoundingClientRect()
    if (b.width < 4) continue
    return [b.left + b.width / 2, b.top + b.height / 2]
  }
  return null
})

const VIEWS = [['Home', 'home'], ['Today', 'today'], ['Writing', 'articles'], ['Journal', 'day'], ['Feed', 'feed'], ['Map', 'map'], ['Review', 'review']]

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true, scenery: true, sceneryRest: true, sceneryToday: true, sceneryRecap: true })
  for (const look of ['light', 'dark']) {
    await c.look(look)
    for (const [where, view] of VIEWS) {
      if (only && !only.includes(where)) continue
      for (const one of OVERLAYS) await judge(where, h, one, look, { reset: async () => { await h.keyboard.press('Escape'); await go(view); if (view === 'home') await h.evaluate(() => { const card = [...document.querySelectorAll('div, p, span')].find((el) => el.childElementCount === 0 && /ago today$/.test(el.textContent.trim())); card?.scrollIntoView({ block: 'start' }) }) } })
    }
    if (!only || only.includes('Home rows')) {
      const reset = async () => { await h.keyboard.press('Escape'); await go('home'); await h.waitForTimeout(300) }
      await reset()
      const kinds = await homeRowKinds()
      check(`Home has rows with right-click menus (${look}): ${kinds.length} kinds`, kinds.length > 0, kinds.join(' '))
      for (const [at, sig] of kinds.entries()) {
        await judge('Home rows', h, { id: `home-row-${at}`, label: `right-click ${sig}`, open: async (win) => { await homeRowKinds(); await win.evaluate((n) => document.querySelector(`[data-qa-kind="${n}"]`)?.scrollIntoView({ block: 'center' }), at); return clickFirst(win, `[data-qa-kind="${at}"]`, { button: 'right' }) } }, look, { reset })
      }
      await judge('Home rows', h, { id: 'home-words', label: 'right-click picked words', open: async (win) => { const point = await pickHomeWords(); if (!point) return false; await win.mouse.click(point[0], point[1], { button: 'right' }); return true } }, look, { reset })
    }
    if (!only || only.includes('Capture')) {
      const made = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A capture opened in the main window' }] }] } }))
      const id = typeof made === 'string' ? made : made?.id
      const reset = async () => { await h.keyboard.press('Escape'); await c.send('capture', id); await h.waitForTimeout(900) }
      for (const one of OVERLAYS.filter((o) => ['ctrl-l', 'words-menu', 'slash'].includes(o.id))) await judge('Capture', h, one, look, { reset })
    }
    if (!only || only.includes('Pill') || only.includes('Grown')) {
      for (const shape of ['Pill', 'Grown']) {
        if (only && !only.includes(shape)) continue
        const reset = async () => {
          await box.evaluate(() => window.api.revealPrompt()); await box.waitForTimeout(700)
          await box.click(LINE).catch(() => {})
          await box.keyboard.press('Meta+a'); await box.keyboard.press('Backspace')
          await box.keyboard.type(shape === 'Grown' ? 'Grown box words' : 'Pill words')
          if (shape === 'Grown') { await box.keyboard.press('Shift+Enter'); await box.keyboard.type('two lines') }
          await box.waitForTimeout(700)
        }
        for (const one of OVERLAYS) await judge(shape === 'Pill' ? 'One-line pill' : 'Grown box', box, one, look, { isBox: true, reset })
        await box.evaluate(() => window.api.hidePrompt()); await box.waitForTimeout(400)
      }
    }
    if (!only || only.includes('Sticky')) {
      let sticky = electron.windows().find((w) => w.url().includes('type=today'))
      if (!sticky) {
        await h.evaluate(() => window.api.openSticky('view', 'today', 'Today', false))
        for (let i = 0; i < 40 && !(sticky = electron.windows().find((w) => w.url().includes('type=today'))); i++) await wait(200)
      }
      check(`a Today sticky opens (${look})`, !!sticky)
      if (sticky) {
        await sticky.waitForTimeout(1200)
        for (const one of OVERLAYS) await judge('Sticky', sticky, one, look, { reset: async () => { await sticky.keyboard.press('Escape'); await sticky.bringToFront().catch(() => {}); await sticky.waitForTimeout(200) } })
      }
    }
  }
} finally {
  writeFileSync(join(shots, 'table.txt'), table.map((row) => row.join(' | ')).join('\n'))
  console.log(`pictures and table.txt in ${shots}`)
  await c.close()
}
done()

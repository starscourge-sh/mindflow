// Split view in the main window: up to three panes side by side, each with
// its own Back and Forward. Opens three panes (⌥-click, ⌥⌘\ and ⌘K's ⌥↵),
// moves each one somewhere, and checks every pane's Back is its own; ⌃H and
// ⌃L move the keys between them, with Vim off and on; ⌃W closes one; a
// divider drags and double-clicks; the panes come back after a restart; a
// narrow window shows one pane at a time with a switcher. Screenshots in
// light and dark go to SHOTS (default scratchpad/split).
//
//   npx electron-vite build --outDir out-split
//   QA_ARGS=--sandbox QA_ENTRY=out-split/main/index.js node qa/split.mjs
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'vigil-split-'))
process.env.QA_ARGS ??= '--sandbox'
const shots = process.env.SHOTS ?? 'scratchpad/split'
mkdirSync(shots, { recursive: true })
const { sandbox } = await import('./sandbox-lib.mjs')

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

/** Every pane, read off the screen: which has the keys, what it shows, how wide it is. */
const panes = (h) => h.evaluate(() => [...document.querySelectorAll('[data-pane]')].map((el) => {
  const page = el.querySelector('[class*="@container/page"]')
  const pane = page?.querySelector('.note-pane')
  const words = (pane?.querySelector('textarea.font-heading, input.font-heading')?.value || pane?.querySelector('.ProseMirror')?.firstElementChild?.textContent || '').trim()
  const box = el.getBoundingClientRect()
  return {
    key: el.getAttribute('data-pane'),
    front: el.hasAttribute('data-pane-front'),
    shown: box.width > 0,
    width: Math.round(box.width),
    open: page?.querySelector('[data-open][data-id]')?.getAttribute('data-id') ?? null,
    note: words.slice(0, 30)
  }
}))
/** Each pane's trail as the app keeps it (written as the page changes, while split). */
const trails = (h) => h.evaluate(() => JSON.parse(localStorage.getItem('split') ?? 'null'))
const where = (trail) => trail.views[trail.at]
const show = (list) => list.map((one, i) => `${i + 1}${one.front ? '*' : ''}:${one.note || '-'} [${one.open?.slice(0, 6) ?? ''}]`).join(' | ')

let c = await sandbox({ width: 1500, height: 900 })
let { h, send } = c
const wait = (ms = 900) => h.waitForTimeout(ms)
const blur = () => h.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur())
const press = async (...keys) => { for (const key of keys) { await h.keyboard.press(key); await h.waitForTimeout(120) } await wait(600) }
/** The nth pane (from 1), by its key: dividers sit between panes, so nth-of-type would count them. */
const paneSel = async (n) => `[data-pane="${await h.evaluate((i) => document.querySelectorAll('[data-pane]')[i - 1]?.getAttribute('data-pane'), n)}"]`
const rowIn = async (pane, n) => h.locator(`${await paneSel(pane)} [data-row][data-id]`).nth(n)

// REPORTS_ONLY=1 runs just the checks for the reports of 10 October, at the end.
if (!process.env.REPORTS_ONLY) try {
  await h.evaluate(() => { localStorage.setItem('theme', 'light'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'light' })) })
  // --- One pane: the page as always ---------------------------------------------------
  await send('view', 'inbox'); await wait()
  let list = await panes(h)
  check('one pane to begin with, no split saved', list.length === 1 && !(await trails(h)), show(list))
  await h.locator('[data-pane] [data-row][data-id]').nth(0).click(); await wait()
  await h.locator('[data-pane] [data-row][data-id]').nth(1).click(); await wait()
  const firstNote = (await panes(h))[0]

  // --- ⌥-click a row: that note to the side ------------------------------------------
  await (await rowIn(1, 3)).click({ modifiers: ['Alt'] }); await wait(1200)
  list = await panes(h)
  check('⌥-click on a row opens a second pane, in front', list.length === 2 && list[1].front && !!list[1].note && list[0].note === firstNote.note && list[1].note !== firstNote.note, show(list))

  // --- Pane 2 goes elsewhere: Ideas, and one idea open ----------------------------------
  await send('view', 'nuggets'); await wait()
  await (await rowIn(2, 0)).click(); await wait()
  list = await panes(h)
  check('the sidebar and sends go to the pane in front', list[0].note === firstNote.note && !!list[1].note, show(list))
  const ideaNote = list[1].note

  // --- ⌥⌘\: the front page again, beside it (the list, the note staying in one pane) ----
  await blur()
  await press('Alt+Meta+Backslash')
  list = await panes(h)
  check('⌥⌘\\ opens a third pane, in front', list.length === 3 && list[2].front, show(list))
  let t = await trails(h)
  check('the copy shows the same page with nothing open', t && where(t.panes[2].trail).id === 'nuggets' && !where(t.panes[2].trail).focus, JSON.stringify(t && where(t.panes[2].trail)))
  // Pane 3 moves on: Questions, then a question.
  await send('view', 'questions'); await wait()
  await (await rowIn(3, 0)).click(); await wait()

  // --- ⌘K, ⌥↵: with three panes, the next pane over takes it as a step ------------------
  await blur()
  await press('Meta+k')
  await h.keyboard.type('Dorian Gray', { delay: 40 }); await wait(1400)
  const asideHint = await h.evaluate(() => /to the side/.test(document.querySelector('[role="dialog"][aria-label="Search"]')?.textContent ?? ''))
  await h.keyboard.press('Alt+Enter'); await wait(1200)
  list = await panes(h)
  t = await trails(h)
  check('⌘K shows ⌥↵ to the side, and ⌥↵ with three panes opens it in the pane beside', asideHint && list.length === 3 && list[1].front && list[1].note !== ideaNote && !!list[1].note, `${asideHint} ${show(list)}`)

  // --- Back in each pane is its own ------------------------------------------------------
  const before = (await trails(h)).panes.map((one) => JSON.stringify(where(one.trail)))
  // Pane 2 (in front): Back undoes the ⌘K open only.
  await blur(); await press('Meta+BracketLeft')
  t = await trails(h)
  let after = t.panes.map((one) => JSON.stringify(where(one.trail)))
  check('⌘[ in pane 2 steps back in pane 2 only', after[0] === before[0] && after[2] === before[2] && after[1] !== before[1] && (await panes(h))[1].note === ideaNote, `${after[1]} note:${(await panes(h))[1].note}`)
  // ⌃L to pane 3; Back there: the question closes, Questions stays.
  await press('Control+l')
  list = await panes(h)
  check('⌃L moves the keys right', list[2].front, show(list))
  const q = (await trails(h)).panes.map((one) => JSON.stringify(where(one.trail)))
  await press('Meta+BracketLeft')
  t = await trails(h)
  after = t.panes.map((one) => JSON.stringify(where(one.trail)))
  check('⌘[ in pane 3 steps back in pane 3 only', after[0] === q[0] && after[1] === q[1] && where(t.panes[2].trail).id === 'questions' && !where(t.panes[2].trail).focus, after[2])
  // The header's Back follows the front pane: pane 3 can go back once more (to Ideas), then pane 1 still has its own.
  await h.click('header button[aria-label="Back"]'); await wait()
  t = await trails(h)
  check('the header Back button acts on the pane in front', where(t.panes[2].trail).id === 'nuggets', JSON.stringify(where(t.panes[2].trail)))
  await press('Control+h', 'Control+h')
  list = await panes(h)
  check('⌃H twice moves the keys to pane 1', list[0].front, show(list))
  await press('Meta+BracketLeft')
  list = await panes(h)
  t = await trails(h)
  check('⌘[ in pane 1 goes back to its first note', list[0].note !== firstNote.note && !!list[0].note && where(t.panes[2].trail).id === 'nuggets', show(list))
  await press('Meta+BracketRight')
  list = await panes(h)
  check('⌘] in pane 1 comes forward again', list[0].note === firstNote.note, show(list))
  await press('Control+h')
  check('⌃H at the left edge stays put', (await panes(h))[0].front)

  // --- The front pane: a firmer hairline and a shadow; the others a fainter one, no shadow, nothing coloured ---
  const looks = await h.evaluate(() => [...document.querySelectorAll('[data-pane]')].map((el) => {
    const card = getComputedStyle(el.querySelector('[data-pane-card]') ?? el.firstElementChild)
    // The colour's alpha, whatever space it is written in: "/ 0.12)" or rgba's fourth number.
    const alpha = (colour) => Number(/\/\s*([\d.]+)\)$/.exec(colour)?.[1] ?? /rgba\([^)]*,\s*([\d.]+)\)$/.exec(colour)?.[1] ?? 1)
    return { border: card.borderTopColor, edge: alpha(card.borderTopColor), shadow: card.boxShadow !== 'none', dim: Number(card.opacity), strip: !!el.querySelector(':scope > div > span[aria-hidden].absolute') }
  }))
  check('the front pane has the firmer border and a shadow; the others a fainter border, no shadow, no coloured strip', looks[0].shadow && !looks[1].shadow && !looks[2].shadow && looks[0].edge > looks[1].edge && looks.every((one) => !one.strip) && looks[0].dim === 1 && looks[1].dim < 1 && looks[1].dim > 0.9, JSON.stringify(looks))
  await h.screenshot({ path: `${shots}/three-light.png` })

  // --- Vim on: ⌃L from inside a note in normal mode, nothing typed -------------------------
  await h.evaluate(() => { localStorage.setItem('vim', 'on'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: 'on' })) })
  await wait(400)
  const editor = h.locator('[data-pane]:nth-of-type(1) .note-pane .ProseMirror').first()
  await editor.click(); await wait(300)
  const vimMode = await h.evaluate(() => document.querySelector('[data-pane]:nth-of-type(1) .note-pane .ProseMirror')?.getAttribute('data-vim-mode'))
  if (vimMode && vimMode !== 'normal') await press('Escape')
  const text1 = await editor.textContent()
  await press('Control+l')
  list = await panes(h)
  check('Vim on: ⌃L in normal mode moves the keys, the note untouched', list[1].front && (await editor.textContent()) === text1, `${vimMode} ${show(list)}`)
  await press('Control+h')
  list = await panes(h)
  const back = await h.evaluate(() => !!document.activeElement?.closest('[data-pane]:nth-of-type(1) .ProseMirror'))
  check('Vim on: ⌃H comes back, the caret in the note again', list[0].front && back, `${back} ${show(list)}`)
  await h.evaluate(() => { localStorage.setItem('vim', 'off'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: 'off' })) })
  await wait(400)
  // --- Vim off: typing in a note, ⌃L still moves and types nothing ---------------------------
  await editor.click(); await wait(300)
  const text2 = await editor.textContent()
  await press('Control+l')
  list = await panes(h)
  check('Vim off: ⌃L while typing moves the keys, the note untouched', list[1].front && (await editor.textContent()) === text2, show(list))
  await press('Control+h')

  // --- Focus arriving in a pane brings it forward only when Tab moved it -----------------
  // Tried from a few of pane 2's buttons, since where Tab goes next depends on the page.
  let tabbedIn = null
  let leftAlone = true
  for (let n = 0; n < 6 && !tabbedIn; n++) {
    await blur()
    const focused = await h.evaluate((i) => {
      const all = [...document.querySelectorAll('[data-pane]')[1].querySelectorAll('button:not([disabled])')].filter((el) => el.offsetParent !== null && !el.closest('[inert]'))
      const el = all[i]
      el?.focus()
      return !!el && document.activeElement === el
    }, n)
    if (!focused) continue
    await wait(300)
    if (!(await panes(h))[0].front) leftAlone = false
    await press('Tab')
    const landed = await h.evaluate(() => [...document.querySelectorAll('[data-pane]')].findIndex((p) => p.contains(document.activeElement)))
    if (landed === 1) tabbedIn = await panes(h)
    else await press('Control+h')
  }
  check('focus moved by the app (as a menu closing does) leaves the front pane where it is', leftAlone)
  check('Tab moving within pane 2 brings it to the front', !!tabbedIn && tabbedIn[1].front, tabbedIn ? show(tabbedIn) : 'Tab never stayed in pane 2')
  await press('Control+h')

  // --- J in one pane's list never moves another's ---------------------------------------------
  await press('Control+l', 'Control+l')
  await blur()
  await press('j', 'j')
  const cursors = await h.evaluate(() => [...document.querySelectorAll('[data-pane]')].map((el) => !!el.querySelector('[data-cursor]')))
  check('J moves the list cursor in the front pane only', cursors[2] && !cursors[0] && !cursors[1], JSON.stringify(cursors))

  // --- Resize: drag the first divider, then double-click the second ---------------------------
  // The app can put its window back where it was; the test's own size again.
  await c.size(1500, 900)
  const widths0 = (await panes(h)).map((one) => one.width)
  const divider = h.locator('[data-pane-divider]').nth(0)
  const box = await divider.boundingBox()
  await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await h.mouse.down()
  await h.mouse.move(box.x + 90, box.y + box.height / 2, { steps: 8 })
  await h.mouse.up()
  await wait(500)
  const widths1 = (await panes(h)).map((one) => one.width)
  check('dragging a divider widens the left pane and narrows the right one', widths1[0] - widths0[0] > 70 && widths0[1] - widths1[1] > 70 && Math.abs(widths1[2] - widths0[2]) < 4, `${widths0} → ${widths1}`)
  await h.screenshot({ path: `${shots}/resized-light.png` })

  // --- Dark --------------------------------------------------------------------------------------
  await h.evaluate(() => { localStorage.setItem('theme', 'dark'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'dark' })) })
  await wait(800)
  await h.screenshot({ path: `${shots}/three-dark.png` })
  const darkLooks = await h.evaluate(() => [...document.querySelectorAll('[data-pane]')].map((el) => { const card = getComputedStyle(el.querySelector('[data-pane-card]') ?? el.firstElementChild); return { bg: card.backgroundColor, dim: Number(card.opacity) } }))
  check('dark: the front pane is raised a step lighter, the others dimmed to about 85%, nothing coloured', new Set(darkLooks.map((one) => one.bg)).size === 2 && darkLooks.find((one) => one.dim === 1)?.bg !== 'rgba(0, 0, 0, 0)' && darkLooks.filter((one) => one.dim === 1).length === 1 && darkLooks.filter((one) => Math.abs(one.dim - 0.85) < 0.01).length === 2, JSON.stringify(darkLooks))

  // --- Restart: the panes, their pages and their widths come back -------------------------------
  const kept = (await panes(h)).map((one) => ({ width: one.width, open: one.open, note: one.note }))
  const keptTrails = await trails(h)
  await c.close()
  c = await sandbox({ width: 1500, height: 900 }); ({ h, send } = c)
  await wait(2500)
  // The app puts its window back where it was last; the test's own size again.
  await c.size(1500, 900)
  await wait(800)
  const again = await panes(h)
  const againTrails = await trails(h)
  check('after a restart: three panes, the same pages, the same widths', again.length === 3 && again.every((one, i) => Math.abs(one.width - kept[i].width) < 12 && one.note === kept[i].note) && JSON.stringify(againTrails.panes.map((one) => where(one.trail))) === JSON.stringify(keptTrails.panes.map((one) => where(one.trail))), `${show(again)} ${again.map((one) => one.width)} vs ${kept.map((one) => one.width)}`)
  // Back still works per pane after the restart.
  await press('Control+h', 'Control+h')
  await blur(); await press('Meta+BracketLeft')
  const backAfter = await trails(h)
  check('after a restart each pane still has its Back', backAfter.panes.some((one, i) => one.trail.at !== againTrails.panes[i].trail.at), '')

  // --- Double-click a divider: equal shares --------------------------------------------------------
  await c.size(1500, 900)
  await h.locator('[data-pane-divider]').nth(1).dblclick(); await wait(500)
  const even = (await panes(h)).map((one) => one.width)
  check('double-clicking a divider shares the room equally', Math.max(...even) - Math.min(...even) < 6, `${even}`)

  // --- Narrow: one pane at a time, with a switcher ------------------------------------------------
  await c.size(820, 760)
  await wait(600)
  list = await panes(h)
  const tabs = await h.locator('[role="tablist"][aria-label="Panes"] [role="tab"]').count()
  check('a narrow window shows one pane and a switcher', list.filter((one) => one.shown).length === 1 && tabs === 3, `${tabs} tabs, ${list.filter((one) => one.shown).length} shown`)
  await h.screenshot({ path: `${shots}/narrow-dark.png` })
  await h.locator('[role="tablist"][aria-label="Panes"] [role="tab"]').nth(2).click(); await wait(500)
  list = await panes(h)
  check('the switcher brings another pane to the front', list[2].front && list[2].shown && !list[0].shown, show(list))
  await press('Control+h')
  list = await panes(h)
  check('narrow, ⌃H still moves between panes', list[1].front && list[1].shown, show(list))
  await c.size(1500, 900)

  // --- ⌃W closes the front pane; the one beside takes the keys --------------------------------------
  await h.evaluate(() => { localStorage.setItem('theme', 'light'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'light' })) })
  await blur()
  await press('Control+w')
  list = await panes(h)
  check('⌃W closes the pane in front, the one to its left comes to the front', list.length === 2 && list[0].front, show(list))
  // Row menu: Open to the side.
  const keysBefore = (await panes(h)).map((one) => one.key)
  await h.locator('[data-pane] [data-row][data-id]:visible').first().click({ button: 'right' }); await wait(400)
  // Open to the side sits under Open in… beside Open in a new window.
  const openIn = h.locator('[role="menuitem"]', { hasText: 'Open in…' })
  if (await openIn.count()) { await openIn.first().click(); await wait(400) }
  const offered = await h.locator('[role="menuitem"]', { hasText: 'Open to the side' }).count()
  if (offered) await h.locator('[role="menuitem"]', { hasText: 'Open to the side' }).first().click()
  await wait(1000)
  list = await panes(h)
  check("a row's menu offers Open to the side, and it opens a pane in front", offered > 0 && list.length === 3 && !keysBefore.includes(list.find((one) => one.front)?.key), `${offered} ${show(list)}`)
  await h.screenshot({ path: `${shots}/menu-opened-light.png` })
  await press('Control+w', 'Control+w')
  list = await panes(h)
  check('⌃W down to one pane; the split is no longer kept', list.length === 1 && !(await trails(h)), show(list))
  const alone = await h.evaluate(() => { const card = getComputedStyle(document.querySelector('[data-pane] [data-pane-card]') ?? document.querySelector('[data-pane]').firstElementChild); return { shadow: card.boxShadow, dim: card.opacity } })
  check('one pane alone shows no front-pane look at all', alone.shadow === 'none' && alone.dim === '1', JSON.stringify(alone))
  await h.screenshot({ path: `${shots}/single-light.png` })
  await press('Control+w')
  check('⌃W with one pane does nothing', (await panes(h)).length === 1)
} finally {
  await c.close()
}

// --- The reports of 10 October ----------------------------------------------------------------
// One doc open but three tabs all named after the list; Details opening in every
// pane; no plain way to close a pane; the split showing up among Pinned; a second
// Open to the side folding the split into tabs; the L/M/R mark over a picture.
if (process.env.REPORTS_ONLY) await c.close()
c = await sandbox({ width: 1500, height: 900 }); ({ h, send } = c)
try {
  let list
  /** A pane's name is the note it shows: its title is somewhere in that pane, and it is not the list's name. */
  const named = (name, text) => !!name && !['Gems', 'Questions', 'Page'].includes(name) && text.includes(name.slice(0, 24))
  /** Every word in each pane, typed fields too, hidden or not. */
  const texts = () => h.evaluate(() => [...document.querySelectorAll('[data-pane]')].map((el) => (el.querySelector('[data-pane-card]') ?? el).textContent + [...el.querySelectorAll('textarea, input')].map((one) => one.value).join(' ')))
  const v = (channel, ...args) => h.evaluate(([ch, a]) => window.api.vigil(ch, ...a), [channel, args])
  const seen = () => h.evaluate(() => ({
    tabs: [...document.querySelectorAll('[role="tablist"][aria-label="Panes"] [role="tab"]')].map((one) => one.textContent.trim()),
    heads: [...document.querySelectorAll('[data-pane-head]')].map((one) => one.textContent.trim()),
    closes: document.querySelectorAll('[data-pane-close]').length,
    marks: document.querySelectorAll('[data-pane-mark]').length,
    live: document.querySelectorAll('[data-pair-row="live"]').length,
    details: [...document.querySelectorAll('[data-pane]')].map((el) => el.querySelectorAll('.mf-details').length)
  }))
  /** Open to the side from a row's own menu, the way the user did it. */
  const asideFromMenu = async (row) => {
    await row.click({ button: 'right' }); await wait(400)
    const openIn = h.locator('[role="menuitem"]', { hasText: 'Open in…' })
    if (await openIn.count()) { await openIn.first().click(); await wait(400) }
    await h.locator('[role="menuitem"]', { hasText: 'Open to the side' }).first().click()
    await wait(1200)
  }
  await h.evaluate(() => { localStorage.removeItem('split'); localStorage.setItem('theme', 'dark'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'dark' })) })
  await send('view', 'nuggets'); await wait()
  // A separate pinned note, as the user has.
  const pinnedId = await (await rowIn(1, 5)).getAttribute('data-id')
  await v('pin', 'nuggets', pinnedId, true); await wait(800)
  await (await rowIn(1, 0)).click(); await wait()
  const pinsBefore = await h.evaluate(() => [...document.querySelectorAll('aside [data-drag-open]')].length)
  let s1 = await seen()
  check('report 1: one pane open shows no tabs, no pane header, no L/M/R mark and no side-by-side row', s1.tabs.length === 0 && s1.heads.length === 0 && s1.closes === 0 && s1.marks === 0 && s1.live === 0, JSON.stringify(s1))

  // One Open to the side adds exactly one pane, never two.
  await asideFromMenu(await rowIn(1, 1))
  list = await panes(h)
  s1 = await seen()
  check('report 1: one Open to the side adds exactly one pane', list.length === 2, show(list))
  check('report 1: each pane is named by the note it shows', s1.heads.length === 2 && (await texts()).every((text, i) => named(s1.heads[i], text)) && s1.heads[0] !== s1.heads[1], `${JSON.stringify(s1.heads)} vs ${list.map((one) => one.note)}`)

  // --- report 4a: Pinned holds only what was pinned -------------------------------------------
  const order = await h.evaluate(() => {
    const live = document.querySelector('[data-pair-row="live"]')
    const pinned = [...document.querySelectorAll('aside button[aria-expanded]')].find((one) => one.textContent.trim() === 'Pinned')
    const pins = pinned?.parentElement?.nextElementSibling
    return { live: !!live, pinned: !!pinned, liveInPinned: !!(live && pins?.contains(live)), liveAfterPinned: !!(live && pinned && pinned.compareDocumentPosition(live) & Node.DOCUMENT_POSITION_FOLLOWING), pinnedRows: pins ? pins.querySelectorAll('[data-drag-open], [data-pair-row]').length : 0 }
  })
  check('report 4a: the open split is not shown among Pinned, which keeps just the pinned note', order.live && order.pinned && !order.liveInPinned && !order.liveAfterPinned && order.pinnedRows === pinsBefore, `${JSON.stringify(order)} pinned before: ${pinsBefore}`)
  await h.screenshot({ path: `${shots}/report-sidebar-dark.png` })

  // --- report 3: each pane closes from its own × ----------------------------------------------
  check('report 3: each of two panes has its own ×', s1.closes === 2, JSON.stringify(s1))
  if (await h.locator('[data-pane-close]').count()) await h.locator('[data-pane-close]').nth(0).hover(); await wait(900)
  const tip = await h.evaluate(() => [...document.querySelectorAll('[data-slot="tooltip-content"], [role="tooltip"]')].map((one) => one.textContent.trim()).join(' | '))
  check('report 3: its tooltip says Close this pane ⌃W', /Close this pane\s*⌃W/.test(tip), tip)
  await h.mouse.move(5, 300); await wait(300)

  // --- report 2: Details in one pane only -------------------------------------------------------
  const detailsAt = async (n) => h.locator(`${await paneSel(n)} button[aria-label="Details"]`).first()
  await (await detailsAt(1)).click(); await wait(700)
  s1 = await seen()
  check('report 2: Details turned on in the left pane opens it there only', s1.details[0] > 0 && s1.details[1] === 0, JSON.stringify(s1.details))
  const pressed = await h.evaluate(() => [...document.querySelectorAll('[data-pane]')].map((el) => el.querySelector('button[aria-label="Details"]')?.getAttribute('aria-pressed')))
  check('report 2: only that pane\'s button reads Hide details', pressed[0] === 'true' && pressed[1] === 'false', JSON.stringify(pressed))
  await h.screenshot({ path: `${shots}/report-details-dark.png` })
  await (await detailsAt(1)).click(); await wait(500)

  // --- report 4b: Open to the side again never folds the split away ----------------------------
  // Back to one pane, on the Ideas list with nothing open, in a window with room
  // for two panes side by side but not three.
  const closeAt = async (n) => { const x = h.locator(`${await paneSel(n)} [data-pane-close]`); if (await x.count()) await x.click(); else { await h.locator(await paneSel(n)).click({ position: { x: 30, y: 30 } }); await blur(); await press('Control+w') } await wait(900) }
  await closeAt(2)
  await c.size(1100, 800); await wait(700)
  await send('view', 'questions'); await wait()
  await send('view', 'nuggets'); await wait()
  await asideFromMenu(await rowIn(1, 1))
  const keysTwo = (await panes(h)).map((one) => one.key)
  const otherId = await (await rowIn(1, 3)).getAttribute('data-id')
  await asideFromMenu(await rowIn(1, 3))
  list = await panes(h)
  s1 = await seen()
  const t2 = await trails(h)
  check('report 4b: with two panes and no room for a third, Open to the side again keeps both in view, the right one showing the new note', list.length === 2 && list.every((one) => one.shown) && s1.tabs.length === 0 && t2 && where(t2.panes[1].trail).focus === otherId && list.map((one) => one.key).join() === keysTwo.join(), `${show(list)} tabs:${s1.tabs.length}`)
  await h.screenshot({ path: `${shots}/report-aside-again-dark.png` })
  // With room for three: a third pane; then with three, the rightmost takes the next.
  await c.size(1500, 900); await wait(700)
  if (list.length === 3) await closeAt(3)
  await asideFromMenu(await rowIn(1, 4))
  list = await panes(h)
  check('report 4b: with room, Open to the side adds a third pane', list.length === 3 && list.every((one) => one.shown), show(list))
  const middle = (await trails(h)).panes[1]
  const lastId = await (await rowIn(1, 6)).getAttribute('data-id')
  await asideFromMenu(await rowIn(1, 6))
  const t3 = await trails(h)
  list = await panes(h)
  check('report 4b: with three panes, Open to the side replaces the rightmost, the middle untouched', list.length === 3 && where(t3.panes[2].trail).focus === lastId && JSON.stringify(where(t3.panes[1].trail)) === JSON.stringify(where(middle.trail)), JSON.stringify(t3.panes.map((one) => where(one.trail))))

  // --- report 1: narrow, the switcher's tabs name what each pane shows ---------------------------
  const wide = (await seen()).heads
  await c.size(820, 760); await wait(800)
  list = await panes(h)
  s1 = await seen()
  check('report 1: narrow, each tab is named by its pane\'s note, not all after the list', s1.tabs.length === 3 && new Set(s1.tabs).size === 3 && s1.tabs.join('|') === wide.join('|') && s1.tabs[0] === 'Gems', `${JSON.stringify(s1.tabs)} vs ${list.map((one) => one.note)}`)
  await h.screenshot({ path: `${shots}/report-tabs-dark.png` })
  await c.size(1500, 900); await wait(600)

  // --- report 3: a pane's × closes just that pane -----------------------------------------------
  const before3 = (await panes(h)).map((one) => one.key)
  await closeAt(2)
  list = await panes(h)
  check('report 3: the middle pane\'s × closes just that pane', list.length === 2 && list[0].key === before3[0] && list[1].key === before3[2], show(list))
  await closeAt(2)
  s1 = await seen()
  check('report 3: down to one pane, no × and no header line are left', (await panes(h)).length === 1 && s1.closes === 0 && s1.heads.length === 0 && s1.marks === 0, JSON.stringify(s1))
  check('no page errors in the reports run', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}

const failed = results.filter((one) => !one.ok)
console.log(`\n${results.length - failed.length} of ${results.length} passed.`)
if (failed.length) console.log(`Failed: ${failed.map((one) => one.name).join('; ')}`)
process.exit(failed.length ? 1 : 0)

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

try {
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
    const card = getComputedStyle(el.firstElementChild)
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
  const offered = await h.locator('[role="menuitem"]', { hasText: 'Open to the side' }).count()
  if (offered) await h.locator('[role="menuitem"]', { hasText: 'Open to the side' }).first().click()
  await wait(1000)
  list = await panes(h)
  check("a row's menu offers Open to the side, and it opens a pane in front", offered > 0 && list.length === 3 && !keysBefore.includes(list.find((one) => one.front)?.key), `${offered} ${show(list)}`)
  await h.screenshot({ path: `${shots}/menu-opened-light.png` })
  await press('Control+w', 'Control+w')
  list = await panes(h)
  check('⌃W down to one pane; the split is no longer kept', list.length === 1 && !(await trails(h)), show(list))
  const alone = await h.evaluate(() => { const card = getComputedStyle(document.querySelector('[data-pane]').firstElementChild); return { shadow: card.boxShadow, dim: card.opacity } })
  check('one pane alone shows no front-pane look at all', alone.shadow === 'none' && alone.dim === '1', JSON.stringify(alone))
  await h.screenshot({ path: `${shots}/single-light.png` })
  await press('Control+w')
  check('⌃W with one pane does nothing', (await panes(h)).length === 1)
} finally {
  await c.close()
}

const failed = results.filter((one) => !one.ok)
console.log(`\n${results.length - failed.length} of ${results.length} passed.`)
if (failed.length) console.log(`Failed: ${failed.map((one) => one.name).join('; ')}`)
process.exit(failed.length ? 1 : 0)

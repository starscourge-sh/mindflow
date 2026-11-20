// Asks 26, 29 and 32 of 17 Nov, second round (PART=near|vim|thought):
// - near: a sticky's window takes the pointer back from the room round its card as the pointer comes within 12 points
//   of the card, so the card's own cursors (the hand on its corner buttons) are the window's by the time it is on them.
//   Off screen this checks the window's hold (main's through state, as the page asks it), never the Mac's cursor itself.
// - vim: with Vim on, Escape cancels a half-typed f (the next key is a command, not the character to find).
// - thought: the "Add a thought…" field under a note follows the Vim switch: opened, it writes (insert); Escape goes
//   to normal mode first and keeps the words, a second Escape puts the field away; Enter keeps a thought.
//   QA_ARGS=--sandbox QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 PART=near node qa/q4b-asks.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'
const PART = process.env.PART ?? 'near'
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go, send } = c
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
const until = async (test, ms) => { for (const end = Date.now() + ms; Date.now() < end; await wait(100)) if (await test()) return true; return test() }
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  if (PART === 'near') {
    const goalWin = () => c.electron.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((one) => !one.isDestroyed() && one.isVisible() && /view=sticky/.test(one.webContents.getURL()) && one.webContents.getURL().includes('type=goal&'))
      return w ? { id: w.id, url: w.webContents.getURL() } : null
    })
    // On paper, the look with clear room round the card (a glass card fills its window: no room to pass through).
    await v('settings:set', { stickiesFrosted: false, stickiesGlass: false })
    check('a paper goal card is up on the desk', await until(async () => { const one = await goalWin(); return !!one && !/glass=1/.test(one.url) }, 15_000))
    await wait(1500)
    const goal = await goalWin()
    const page = c.electron.windows().find((p) => p.url() === goal.url)
    // Folded into its pill at the screen's edge (the sandbox's way): a click on the pill keeps the card out.
    const pill = await page.evaluate(() => { const p = document.querySelector('[data-desk-pill]'); if (!p || getComputedStyle(p).visibility === 'hidden') return null; const r = p.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })
    if (pill) {
      await page.mouse.click(pill[0], pill[1])
      await until(() => page.evaluate(() => getComputedStyle(document.getElementById('root')).visibility !== 'hidden' && !document.querySelector('[data-desk-pill]')), 5000)
      await wait(800)
    }
    const card = await page.evaluate(() => { const r = document.querySelector('[data-goal-card]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
    const through = () => c.electron.evaluate((_, id) => globalThis.haligtreeThrough?.(id), goal.id)
    // From far out in the room round the card, toward its top right corner, where its buttons are.
    const cornerY = card.y + 12
    const far = [card.x + card.w + 18, cornerY]
    const near = [card.x + card.w + 6, cornerY]
    await page.mouse.move(far[0], far[1]); await wait(300)
    const atFar = await through()
    check('18 points out from the card, clicks still pass through to the app behind', atFar === true, String(atFar))
    await page.mouse.move(near[0], near[1]); await wait(300)
    const atNear = await through()
    check('6 points out, before the pointer reaches the corner buttons, the window has the pointer back', atNear === false, String(atNear))
    await page.mouse.move(card.x + card.w - 14, cornerY); await wait(300)
    const onButtons = await page.evaluate(([x, y]) => { const one = document.elementFromPoint(x, y); return { cursor: one ? getComputedStyle(one).cursor : null, button: !!one?.closest('button') } }, [card.x + card.w - 14, cornerY])
    check('on the corner, the window still holds the pointer and the page under it shows the hand', (await through()) === false && onButtons.cursor === 'pointer', JSON.stringify(onButtons))
    await page.mouse.move(far[0] - 1, far[1] + 60); await wait(300)
    check('back out in the room, clicks pass through again', (await through()) === true)
  }
  if (PART === 'tabs') {
    // Two panes, one tab each: the Day on the left, Tasks on the right (⌥-click opens it in a pane to the right).
    const SHOTS = process.env.SHOTS
    await go('day'); await h.waitForTimeout(800)
    await h.locator('[data-side-row][aria-label="Tasks"]').first().click({ modifiers: ['Alt'] }); await h.waitForTimeout(1200)
    const state = () => h.evaluate(() => [...document.querySelectorAll('[data-split-area] [data-pane]')].map((el) => ({ key: el.getAttribute('data-pane'), tabs: [...el.querySelectorAll('[data-tab]')].map((one) => one.getAttribute('data-drag-title')) })))
    let s = await state()
    check('two panes, one tab each', s.length === 2 && s.every((one) => one.tabs.length === 1), JSON.stringify(s))
    const [left, right] = s
    const mid = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
    const drag = async (from, to, steps = 10) => { await h.mouse.move(from.x, from.y); await h.mouse.down(); for (let i = 1; i <= steps; i++) (await h.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps), await h.waitForTimeout(40)) }
    const rightTab = h.locator(`[data-pane="${right.key}"] [data-tab]`).first()
    const area = await h.locator('[data-split-area]').boundingBox()
    // 1. Down over the page: only what changes something; no split that rebuilds these two panes.
    await drag(await mid(rightTab), { x: area.x + area.width * 0.75, y: area.y + area.height / 2 })
    await h.waitForTimeout(300)
    const halves = () => h.evaluate(() => [...document.querySelectorAll('[data-split-half]')].map((one) => one.getAttribute('data-split-half')))
    check('a pane\'s only tab carried over its own page offers no split beside its own pane', (await halves()).length === 0, JSON.stringify(await halves()))
    await h.mouse.move(area.x + 30, area.y + area.height / 2); await h.waitForTimeout(300)
    check('the far side is still offered, to swap the panes', JSON.stringify(await halves()) === '["left"]', JSON.stringify(await halves()))
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/q4b-only-tab-over-page.png` })
    await h.keyboard.press('Escape'); await h.waitForTimeout(200); await h.mouse.up(); await h.waitForTimeout(500)
    // 2. Over the left pane's row of tabs: a room opens with the one drop line, the card rides under the row.
    const leftRow = h.locator(`[data-tab-row="${left.key}"]`)
    const leftTab = await h.locator(`[data-pane="${left.key}"] [data-tab]`).first().boundingBox()
    await drag(await mid(rightTab), { x: leftTab.x + leftTab.width + 30, y: leftTab.y + leftTab.height / 2 })
    await h.waitForTimeout(500)
    const over = await h.evaluate((pane) => {
      const gap = document.querySelector(`[data-tab-row="${pane}"] [data-tab-gap]`)
      const row = document.querySelector(`[data-tab-row="${pane}"]`)?.getBoundingClientRect()
      const card = document.querySelector('[data-split-card]')
      const lifted = document.querySelector('[data-tab-lifted]')?.getBoundingClientRect()
      return { gap: !!gap, line: !!gap?.querySelector('[data-drop-line]'), room: !!gap?.querySelector('[data-drop-room]'), halves: document.querySelectorAll('[data-split-half]').length, card: !!card && Number(getComputedStyle(card.parentElement).opacity) > 0.5, liftedTop: lifted && Math.round(lifted.top), rowTop: row && Math.round(row.top), rowBottom: row && Math.round(row.bottom) }
    }, left.key)
    check('over the other pane\'s tabs, a room opens there with the app\'s one drop line', over.gap && over.line && over.room && over.halves === 0, JSON.stringify(over))
    check('the tab itself rides in that row, the card put away', !over.card && over.liftedTop >= over.rowTop - 6 && over.liftedTop < over.rowBottom, JSON.stringify(over))
    if (SHOTS) for (const look of ['light', 'dark']) (await c.look(look), await h.waitForTimeout(250), await h.screenshot({ path: `${SHOTS}/q4b-tab-room-${look}.png` }))
    await c.look('light')
    await h.mouse.up(); await h.waitForTimeout(800)
    s = await state()
    check('let go there, it lands right after the left tab, and the right pane closes', s.length === 1 && s[0].tabs.length === 2 && s[0].tabs[1] === right.tabs[0], JSON.stringify(s))
  }
  if (PART === 'vim') {
    await h.evaluate(() => localStorage.setItem('vim', 'on'))
    await h.reload(); await h.waitForTimeout(2500)
    await go('monthpage'); await h.waitForTimeout(1500)
    const field = h.locator('[data-plain-field="Focus"] [contenteditable="true"]')
    await field.scrollIntoViewIfNeeded()
    await field.click(); await h.waitForTimeout(300)
    const before = await field.textContent()
    await h.keyboard.press('0')
    await h.keyboard.type('f'); await h.keyboard.press('Escape'); await h.keyboard.type('x'); await h.waitForTimeout(200)
    const after = await field.textContent()
    check('f, then Escape, then x: Escape cancelled the f, and x deleted the first letter', after === before.slice(1), JSON.stringify({ before: before.slice(0, 20), after: after.slice(0, 20) }))
    await h.keyboard.type('u'); await h.waitForTimeout(200)
    check('u puts it back', (await field.textContent()) === before)
  }
  if (PART === 'thought') {
    await h.evaluate(() => localStorage.setItem('vim', 'on'))
    await h.reload(); await h.waitForTimeout(2500)
    const pages = await v('items', 'article')
    const page = pages.find((one) => one.title.startsWith('The Rosetta Stone')) ?? pages[0]
    await send('article', page.id); await h.waitForTimeout(2500)
    const field = h.locator('[data-gloss] [data-plain-field] [contenteditable="true"]').first()
    check('the note\'s "Add a thought" is written in the editor', await field.count() === 1, String(await field.count()))
    await field.click(); await h.waitForTimeout(300)
    check('with Vim on, opened it writes at once (insert)', (await field.getAttribute('data-vim-mode')) === 'insert', String(await field.getAttribute('data-vim-mode')))
    await h.keyboard.type('A thought kept from the probe'); await h.waitForTimeout(150)
    await h.keyboard.press('Escape'); await h.waitForTimeout(200)
    const mode = await field.getAttribute('data-vim-mode')
    const kept = await field.textContent()
    const focused = await field.evaluate((el) => el.contains(document.activeElement) || el === document.activeElement)
    check('Escape goes to normal mode first, the words and the caret kept', mode === 'normal' && kept === 'A thought kept from the probe' && focused, JSON.stringify({ mode, kept, focused }))
    await h.keyboard.press('Escape'); await h.waitForTimeout(300)
    const gone = { text: await field.textContent(), focused: await field.evaluate((el) => el.contains(document.activeElement) || el === document.activeElement) }
    check('a second Escape puts it away, empty', !gone.focused && !gone.text.trim(), JSON.stringify(gone))
    const count = (await v('glosses', page.id)).length
    await field.click(); await h.waitForTimeout(300)
    await h.keyboard.type('Kept with Enter'); await h.keyboard.press('Enter'); await h.waitForTimeout(900)
    const now = await v('glosses', page.id)
    check('Enter keeps it as a thought, and the field empties', now.length === count + 1 && now.some((one) => one.body === 'Kept with Enter') && !(await field.textContent()).trim(), `${count} → ${now.length}; ${JSON.stringify(now.map((one) => one.body).slice(-2))}; field ${JSON.stringify(await field.textContent())}`)
  }
} catch (error) {
  check('ran without an error', false, String(error).slice(0, 300))
} finally {
  if (c.errors.length) console.log('page errors:', c.errors.slice(0, 5).join(' | '))
  await c.close()
  const passed = results.filter(Boolean).length
  console.log(`\n${passed}/${results.length} passed`)
  process.exit(passed === results.length ? 0 : 1)
}

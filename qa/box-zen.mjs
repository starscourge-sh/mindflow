// Quick capture's one menu and its quiet while you write.
// One gear menu in three parts ("This note", "Quick capture", "Window"), the
// note's part only with a note to act on, no separate ··· button; its items
// still work, and a right click on the note away from its lines opens them too.
// Typing fades the footer and the window's buttons out, and they come back
// when the pointer moves or after a pause; a kind other than Note stays.
// ⌥⌘, keeps them hidden until pointed at, and ⌘↵ still creates. Motion off: at once.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-zen.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1100, height: 760 })
const { page, h, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const shots = process.env.QA_SHOTS
await v('settings:set', { hintRate: 0, rotCount: 0, motion: true, boxHideButtons: false })

/** How see-through each part is now: the Create button, the kind chip, the window's pill. */
const look = () => page.evaluate(() => {
  const alpha = (el) => { let o = 1; for (let one = el; one; one = one.parentElement) o *= Number(getComputedStyle(one).opacity); return el ? Math.round(o * 100) / 100 : null }
  const row = document.querySelector('[data-zen-row]')
  const create = [...(row?.querySelectorAll('button') ?? [])].find((b) => b.querySelector('kbd'))
  const kind = row?.firstElementChild
  const pill = document.querySelector('.mf-pill')
  return { zen: document.documentElement.hasAttribute('data-zen'), hide: document.documentElement.hasAttribute('data-zen-hide'), hover: [...document.querySelectorAll(':hover')].map((e) => e.tagName + (e.dataset.zenRow !== undefined ? '[row]' : '')).slice(-3).join('>'), toast: !!document.querySelector('[role=status]'), create: alpha(create), kind: alpha(kind), pill: alpha(pill), createClicks: create ? getComputedStyle(create.closest('[data-zen-row] > *')).pointerEvents : null }
})
const fresh = async () => {
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(500)
  await page.click(EDITOR)
  await page.keyboard.press('Meta+a')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(200)
  // Parked off screen, the pointer is never over the window: say it is, so the pill shows as it would.
  await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view='))?.webContents.send('window:pointer', true))
  await page.waitForTimeout(200)
}
const gear = async () => {
  await page.getByRole('button', { name: 'Actions', exact: true }).click()
  await page.waitForTimeout(400)
}
const groups = () => page.evaluate(() => [...document.querySelectorAll('[role=menu] [role=group]')].map((g) => ({ label: g.getAttribute('aria-label'), items: [...g.querySelectorAll('[role^=menuitem]')].map((i) => i.innerText.split('\n')[0].trim()) })))
const escape = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(300) }

try {
  // --- one menu ---
  await fresh()
  await gear()
  const empty = await groups()
  check('empty box: the gear menu has “Quick capture” and “Window”, no “This note”', empty.map((g) => g.label).join(',') === 'Quick capture,Window', JSON.stringify(empty.map((g) => g.label)))
  await escape()
  await page.keyboard.type('Notes on the garden plan', { delay: 10 })
  await page.mouse.move(300, 300)
  await page.waitForTimeout(300)
  check('no separate ··· menu under the note', (await page.getByRole('button', { name: 'This note' }).count()) === 0)
  await gear()
  const full = await groups()
  if (shots) await page.screenshot({ path: `${shots}/zen-menu.png` }).catch(() => {})
  check('with words: three parts in order', full.map((g) => g.label).join(',') === 'This note,Quick capture,Window', JSON.stringify(full.map((g) => g.label)))
  const note = full.find((g) => g.label === 'This note')?.items ?? []
  check('“This note” has Lock, Private and Outline, and no Raw data (it is for the technical)', ['Lock', 'Private', 'Outline'].every((one) => note.some((n) => n.startsWith(one))) && !note.some((n) => n.startsWith('Raw data')), JSON.stringify(note))
  const icons = await page.evaluate(() => Object.fromEntries(['Lock', 'Private'].map((name) => [name, [...document.querySelectorAll('[role=menu] [role=menuitemcheckbox]')].find((one) => one.textContent.trim() === name)?.querySelector('svg')?.getAttribute('class') ?? ''])))
  check('Lock and Private have their own drawings (a lock, a closed eye)', /lock/.test(icons.Lock) && /eye-off/.test(icons.Private), JSON.stringify(icons))
  const box = full.find((g) => g.label === 'Quick capture')?.items ?? []
  check('“Quick capture” has every switch in plain sight, with no submenu', ['Sounds', 'Theme', 'Hide buttons', 'Vim keys', 'Word count', 'Show in screen recordings', 'Show private titles', 'Raw data'].every((one) => box.some((b) => b.startsWith(one))) && !box.some((b) => b.startsWith('More settings')), JSON.stringify(box))
  const win = full.find((g) => g.label === 'Window')?.items ?? []
  check('“Window” has New capture, Open the main window, Expand, Settings', ['New capture', 'Open in main window', 'Expand the window', 'Settings'].every((one) => win.includes(one)), JSON.stringify(win))
  check('the section headings are drawn as labels', (await page.locator('[role=menu] [data-slot=dropdown-menu-label]').count()) === 3)

  // --- its items still work ---
  await page.getByRole('menuitemcheckbox', { name: 'Lock', exact: true }).click()
  await page.waitForTimeout(300)
  check('Lock makes the note read only', (await page.locator(EDITOR).getAttribute('contenteditable')) === 'false')
  await page.getByRole('menuitemcheckbox', { name: 'Lock', exact: true }).click()
  await page.waitForTimeout(300)
  check('and again, writable', (await page.locator(EDITOR).getAttribute('contenteditable')) === 'true')
  await page.getByRole('menuitemcheckbox', { name: /^Raw data/ }).click()
  await page.waitForTimeout(600)
  check('Raw data opens the source', await page.getByRole('dialog').filter({ hasText: 'Source' }).isVisible().catch(() => false))
  await escape()
  // Up again in case that Escape went on to put the box away.
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(400)

  // A right click below the words, away from any line.
  const room = await page.locator(EDITOR).boundingBox()
  await page.mouse.click(room.x + room.width / 2, room.y + room.height - 20, { button: 'right' })
  await page.waitForTimeout(400)
  const right = await groups()
  check('right-click on empty note space opens “This note”', right.length === 1 && right[0].label === 'This note' && right[0].items.some((n) => n.startsWith('Lock')), JSON.stringify(right))
  await escape()
  // On a line, the line's own menu instead.
  const line = await page.locator(`${EDITOR} p`).first().boundingBox()
  await page.mouse.click(line.x + 20, line.y + line.height / 2, { button: 'right' })
  await page.waitForTimeout(400)
  check('right-click on a line keeps the line’s own menu', !(await groups()).some((g) => g.label === 'This note'))
  await escape()

  // --- fading while typing ---
  await page.click(EDITOR)
  await page.keyboard.press('End')
  await page.waitForTimeout(400)
  const before = await look()
  check('at rest, the footer is in full view', before.create === 1, JSON.stringify(before))
  await page.keyboard.type(' and more', { delay: 20 })
  await page.waitForTimeout(350)
  const typing = await look()
  if (shots) await page.screenshot({ path: `${shots}/zen-typing.png` }).catch(() => {})
  check('typing: Create, the kind chip and the pill fade to nothing', typing.create === 0 && typing.kind === 0 && typing.pill === 0, JSON.stringify(typing))
  check('typing: the faded footer cannot be clicked', typing.createClicks === 'none')
  await page.mouse.move(400, 320)
  await page.mouse.move(420, 340)
  await page.waitForTimeout(350)
  check('the pointer moving brings them back', (await look()).create === 1)
  await page.keyboard.type(' again', { delay: 20 })
  await page.waitForTimeout(300)
  const againAll = await look()
  const again = againAll.create
  await page.waitForTimeout(1400)
  const paused = await look()
  check('a pause brings them back too', again === 0 && paused.create === 1, `${again} ${JSON.stringify(paused)}`)

  // A kind other than Note stays in sight.
  await page.keyboard.press('Meta+2')
  await page.waitForTimeout(300)
  await page.click(EDITOR)
  await page.keyboard.press('End')
  await page.keyboard.type(' x', { delay: 20 })
  await page.waitForTimeout(300)
  const kinded = await look()
  check('a chosen kind other than Note stays while the rest fades', kinded.kind === 1 && kinded.create === 0, JSON.stringify(kinded))
  await page.waitForTimeout(1400)

  // --- Hide buttons, ⌥⌘, ---
  await page.keyboard.press('Meta+Alt+Comma')
  await page.waitForTimeout(600)
  check('⌥⌘, turns “Hide buttons” on and keeps it', (await v('settings')).boxHideButtons === true && (await page.evaluate(() => document.documentElement.hasAttribute('data-zen-hide'))))
  await page.mouse.move(400, 200)
  await page.mouse.move(410, 210)
  await page.waitForTimeout(1600)
  const hidden = await look()
  if (shots) await page.screenshot({ path: `${shots}/zen-hidden.png` }).catch(() => {})
  check('on: the buttons stay hidden while not typing', hidden.create === 0 && hidden.pill === 0, JSON.stringify(hidden))
  const foot = await page.locator('[data-zen-row]').boundingBox()
  await page.mouse.move(foot.x + foot.width - 40, foot.y + foot.height / 2)
  await page.waitForTimeout(400)
  check('pointing at the footer shows it', (await look()).create === 1)
  const pill = await page.locator('.mf-pill').boundingBox()
  await page.mouse.move(pill.x + pill.width / 2, pill.y + pill.height / 2)
  await page.waitForTimeout(400)
  check('pointing at the window’s buttons shows them', (await look()).pill === 1)
  await gear()
  await page.mouse.move(400, 300)
  await page.waitForTimeout(400)
  const held = await look()
  check('a menu it opened keeps the pill in view', held.pill === 1, JSON.stringify(held))
  const ticked = await page.getByRole('menuitemcheckbox', { name: /^Hide buttons/ }).getAttribute('aria-checked')
  check('the gear menu shows “Hide buttons” ticked, with ⌥⌘,', ticked === 'true' && (await page.getByRole('menuitemcheckbox', { name: /^Hide buttons/ }).innerText()).includes('⌥⌘,'))
  await escape()
  const count = (await h.evaluate(() => window.api.captures.list())).length
  await page.click(EDITOR)
  await page.keyboard.press('Meta+a')
  await page.keyboard.type('Zen probe capture', { delay: 10 })
  await page.keyboard.press('Meta+Enter')
  await page.waitForTimeout(1500)
  const after = await h.evaluate(() => window.api.captures.list())
  check('with buttons hidden, ⌘↵ still creates', after.length === count + 1 && after.some((one) => (one.label ?? '').includes('Zen probe capture')), `${count} → ${after.length}`)
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(500)
  await page.keyboard.press('Meta+Alt+Comma')
  await page.waitForTimeout(600)
  check('⌥⌘, again turns it off', (await v('settings')).boxHideButtons === false)

  // --- Motion off: at once ---
  await v('settings:set', { motion: false })
  await page.waitForTimeout(400)
  await fresh()
  await page.keyboard.type('quick', { delay: 10 })
  await page.waitForTimeout(40)
  const instant = await look()
  const duration = await page.evaluate(() => getComputedStyle(document.querySelector('[data-zen-row] > :last-child')).transitionDuration)
  check('Motion off: gone at once, no fade', instant.create === 0 && /^0s/.test(duration), `${JSON.stringify(instant)} ${duration}`)
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)

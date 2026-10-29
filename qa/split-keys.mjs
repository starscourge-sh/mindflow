// Obsidian's pair of keys: ⌘B hides and shows the sidebar from a list and
// while writing (the note's words untouched, nothing bolded), and is Bold for
// words selected in a note; ⌘\ opens a new pane right of the front one on a
// picker (⌘K's search, in the pane), where typing a page's name and ↵ opens it
// there, and Esc on the empty pane closes it. The menu bar shows ⌘B and ⌘\ on
// the right items. Screenshots of the empty pane in light and dark, beside the
// Inbox's own empty state, go to SHOTS (default scratchpad/split-keys).
//
//   npx electron-vite build --outDir out-sk
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-sk/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/split-keys.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.SHOTS ?? 'scratchpad/split-keys'
mkdirSync(shots, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 880 })
const { h, go, v } = c
const wait = (ms = 600) => h.waitForTimeout(ms)
const side = () => h.evaluate(() => Math.round(document.querySelector('aside[data-chrome]')?.getBoundingClientRect().width ?? 0))
const panes = () => h.evaluate(() => [...document.querySelectorAll('[data-pane]')].map((el) => ({
  key: el.getAttribute('data-pane'),
  front: el.hasAttribute('data-pane-front'),
  picker: !!el.querySelector('[data-pane-picker]'),
  page: el.querySelector('[data-page]')?.getAttribute('data-page') ?? null,
  open: el.querySelector('[data-open][data-id]')?.getAttribute('data-id') ?? null,
  title: (el.querySelector('.note-pane textarea.font-heading, .note-pane input.font-heading')?.value ?? el.querySelector('.note-pane .ProseMirror')?.firstElementChild?.textContent ?? '').trim().slice(0, 40)
})))

try {
  await v('settings:set', { sounds: false, hintRate: 0 })

  // --- ⌘B from a list ---------------------------------------------------------------
  await go('inbox')
  await h.evaluate(() => document.activeElement?.blur?.())
  const open0 = await side()
  await h.keyboard.press('Meta+b'); await wait()
  const shut = await side()
  await h.keyboard.press('Meta+b'); await wait()
  check(`⌘B on a list hides the sidebar and shows it again (${open0} to ${shut} to ${await side()})`, open0 > 0 && shut === 0 && (await side()) === open0)

  // --- ⌘B while writing: the sidebar, the words untouched -----------------------------
  await h.locator('[data-pane] [data-row][data-id]').nth(0).click(); await wait(1200)
  const editor = h.locator('[data-pane] .note-pane .ProseMirror').first()
  await editor.locator('p:not(:empty)').last().click(); await wait(200)
  await h.keyboard.press('End')
  const before = await editor.innerHTML()
  await h.keyboard.press('Meta+b'); await wait()
  const writingShut = await side()
  const still = await h.evaluate(() => !!document.activeElement?.closest('.ProseMirror'))
  const after = await editor.innerHTML()
  const bolded = await editor.evaluate((el) => el.querySelectorAll('strong').length)
  await h.keyboard.press('Meta+b'); await wait()
  check(`⌘B while writing hides and shows the sidebar (${writingShut}, then ${await side()})`, writingShut === 0 && (await side()) === open0)
  check('and the note is unchanged, nothing bolded, the caret still in it', still && before === after && bolded === (before.match(/<strong/g)?.length ?? 0), `${before.length} vs ${after.length} chars`)

  // --- ⌘B with words selected: Bold, the sidebar stays --------------------------------
  await editor.locator('p:not(:empty)').last().click(); await wait(200)
  await h.keyboard.press('End')
  await h.keyboard.press('Shift+Alt+ArrowLeft'); await wait(150)
  const picked = await h.evaluate(() => getSelection()?.toString() ?? '')
  const strongs = await editor.evaluate((el) => el.querySelectorAll('strong').length)
  await h.keyboard.press('Meta+b'); await wait()
  const strongsAfter = await editor.evaluate((el) => el.querySelectorAll('strong').length)
  check(`⌘B with “${picked.trim()}” selected bolds it and leaves the sidebar (${await side()}px)`, picked.trim().length > 0 && strongsAfter > strongs && (await side()) === open0, `${strongs} to ${strongsAfter}`)
  await h.keyboard.press('Meta+z'); await wait(300)

  // --- ⌘\: a new pane on the right, on the picker, with the keys -----------------------
  await go('inbox')
  await h.evaluate(() => document.activeElement?.blur?.())
  const left = (await panes())[0]
  await h.keyboard.press('Meta+Backslash'); await wait(400)
  let list = await panes()
  const focused = await h.evaluate(() => !!document.activeElement?.closest('[data-pane-picker]') && document.activeElement?.tagName === 'INPUT')
  check('⌘\\ opens a second pane on the right, in front, on the picker', list.length === 2 && list[1].picker && list[1].front && !list[0].picker, JSON.stringify(list))
  check('the picker has the keys', focused)
  // Keyed: the pane is simply there, no fade.
  const fade = await h.evaluate(() => getComputedStyle(document.querySelectorAll('[data-pane]')[1]).opacity)
  check(`by a key the pane is simply there (opacity ${fade})`, fade === '1')

  // Screenshots: the empty pane, light and dark, beside the Inbox's own empty state further down.
  await h.screenshot({ path: `${shots}/picker-light.png` })
  await c.theme('dark'); await wait(600)
  await h.screenshot({ path: `${shots}/picker-dark.png` })
  await c.theme('light'); await wait(600)
  check('the picker comes back after a reload, as the pane it was', (await panes()).some((one) => one.picker))

  // --- type a page's name, ↵ opens it there --------------------------------------------
  const page = await h.evaluate(() => window.api.captures.find('').then((list) => list.find((one) => one.type === 'article' && one.label?.trim()) ?? list.find((one) => one.type === 'nugget' && one.label?.trim())))
  const name = page?.label?.trim() ?? ''
  await h.locator('[data-pane-picker] input').click()
  await h.keyboard.type(name.split(/\s+/).slice(0, 3).join(' ')); await wait(1200)
  await h.keyboard.press('Enter'); await wait(1500)
  list = await panes()
  check(`typing “${name}” and ↵ opens it in that pane: two panes, the left unchanged`, list.length === 2 && !list[1].picker && list[1].front && list[0].page === left.page && list[0].title === left.title, JSON.stringify(list))
  // Back in that pane does not return to the picker.
  check('the picker is not a step to go Back to', await h.evaluate(() => !JSON.parse(localStorage.getItem('split') ?? 'null')?.panes?.some((pane) => pane.trail.views.some((one) => one.id === 'pick'))))

  // --- ⌘\ again: a third pane beside the front one; Esc closes it, the keys go left -----
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('Meta+Backslash'); await wait(400)
  list = await panes()
  check('⌘\\ while split adds another pane right of the front one', list.length === 3 && list[2].picker && list[2].front, JSON.stringify(list.map((one) => one.picker)))
  await h.keyboard.press('Escape'); await wait(500)
  list = await panes()
  check('Esc on the empty pane closes it, the pane on its left in front', list.length === 2 && !list.some((one) => one.picker) && list[1].front, JSON.stringify(list))

  // --- ⌘\ from the left pane: the new one goes between ---------------------------------
  await h.locator('[data-pane]').first().click({ position: { x: 200, y: 20 } }); await wait(300)
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('Meta+Backslash'); await wait(400)
  list = await panes()
  check('⌘\\ from the left pane puts the new one right of it, between', list.length === 3 && list[1].picker && list[1].front, JSON.stringify(list.map((one) => one.picker)))
  await h.keyboard.press('Escape'); await wait(500)
  list = await panes()
  check('and Esc gives the keys back to the left pane', list.length === 2 && list[0].front, JSON.stringify(list.map((one) => one.front)))

  // --- a place from the picker: Go to Calendar ---------------------------------------
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('Meta+Backslash'); await wait(400)
  await h.keyboard.type('calendar'); await wait(900)
  await h.keyboard.press('Enter'); await wait(1200)
  list = await panes()
  check('a place typed in the picker opens in that pane (the Calendar)', list.length === 3 && list[1].page === 'calendar' && list[1].front, JSON.stringify(list.map((one) => one.page)))

  // --- the menu: ⌘B and ⌘\ on the right items; a click fades in -------------------------
  const view = await c.electron.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find((top) => top.label === 'View').submenu.items.filter((one) => one.type !== 'separator').map((one) => [one.label, one.accelerator ?? '']))
  const acc = Object.fromEntries(view)
  check(`View has “Show or Hide Sidebar” on ⌘B and “Open in a split to the right” on ⌘\\ (${acc['Show or Hide Sidebar']}, ${acc['Open in a split to the right']})`, acc['Show or Hide Sidebar'] === 'Command+B' && acc['Open in a split to the right'] === 'Command+\\')
  await h.keyboard.press('Control+w'); await wait(400)
  await h.keyboard.press('Control+w'); await wait(400)
  const count = (await panes()).length
  await c.electron.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find((top) => top.label === 'View').submenu.items.find((one) => one.label === 'Open in a split to the right').click())
  const frames = []
  for (let i = 0; i < 8; i++) (frames.push(await h.evaluate(() => Number(getComputedStyle(document.querySelector('[data-pane]:has([data-pane-picker])') ?? document.body).opacity))), await h.waitForTimeout(25))
  list = await panes()
  check(`the menu item opens a picker pane, fading in (${frames.map((one) => one.toFixed(2)).join(' ')})`, list.length === count + 1 && list.some((one) => one.picker) && frames.some((one) => one < 1) && frames.at(-1) === 1)
  await h.keyboard.press('Escape'); await wait(400)

  const errors = c.errors.filter((one) => !/net::|Failed to load resource/.test(one))
  check('no page errors', !errors.length, errors.slice(0, 3).join(' / '))
} finally {
  await c.close()
}
done()

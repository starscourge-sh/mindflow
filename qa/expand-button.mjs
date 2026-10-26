// The window's bar has no "Fill the screen" (the green button does that, ⌃⇧F too); each open note's head has
// "Read" (the book), which opens that note alone, full window, and Esc closes it. There is no separate
// "Expanded view" any more: Read opens a note's links in place (L).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/expand-button.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1440, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await c.go('inbox'); await wait(1500)
  await h.click('[data-capture-row], [data-row]').catch(() => {})
  await wait(900)
  check('no "Fill the screen" in the window\'s bar', (await h.locator('button[aria-label="Fill the screen"]').count()) === 0)
  check('the open note\'s head has no "Expanded view"', (await h.locator('[data-expand-note], [data-note-head] button[aria-label="Expanded view"]').count()) === 0)
  const reading = '[role="dialog"][aria-label="Reading"]'
  await h.click('[data-note-head] button[aria-label="Read"]')
  await wait(900)
  check('its "Read" opens the note alone', (await h.locator(reading).count()) === 1)
  check('Read has the links-in-place button', (await h.locator(`${reading} [data-read-links-toggle]`).count()) === 1)
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/read.png` })
  await h.keyboard.press('Escape'); await wait(600)
  check('Esc closes it', (await h.locator(reading).count()) === 0)
  // "…": the ways to look at it, together at its top, each saying how it differs.
  await h.click('[data-note-head] button[aria-label="More"]'); await h.waitForTimeout(500)
  const views = await h.evaluate(() => [...document.querySelectorAll('[data-view]')].map((one) => ({ name: one.getAttribute('data-view'), says: one.querySelector('span.text-xs')?.textContent ?? '', icon: !!one.querySelector('svg[data-menu-icon]') })))
  const read = views.find((one) => one.name === 'Read')
  check('"…" opens with a View group, each with a line', (await h.locator('[data-view-group]').count()) === 1 && views.length >= 3 && views.every((one) => one.says.length > 5 && one.icon), JSON.stringify(views))
  check('Read\'s line says ⌘L edits and L opens its links in place', /⌘L/.test(read?.says ?? '') && /L opens its links in place/.test(read?.says ?? ''), read?.says)
  const named = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role^="menuitem"]')].map((one) => one.textContent ?? ''))
  check('no "Expanded view" anywhere in "…", and "Read" once', !named.some((one) => /Expanded view/.test(one)) && views.filter((one) => one.name === 'Read').length === 1 && named.filter((one) => /^Read(Read it through|$)/.test(one)).length === 1, JSON.stringify(named))
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/view-group.png` })
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)
  // A Writing page's "…" stays short: its writing tools, the reading queue and the ways out each one submenu.
  const page = await v('article:new')
  await v('item:save', page, { title: 'Menu', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Words.' }] }] } })
  await c.send('article', page); await h.waitForTimeout(1500)
  await h.click('[data-note-head] button[aria-label="More"]'); await h.waitForTimeout(500)
  const lines = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] > * [role="menuitem"], [role="menu"] [role="menuitem"], [role="menu"] [role="menuitemcheckbox"]')].filter((one) => !one.closest('[data-slot="dropdown-menu-sub-content"]')).map((one) => one.textContent.trim().split(/\s{2,}|(?=[A-Z][a-z]+ [a-z]+ [a-z])/)[0]))
  const subs = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [data-slot="dropdown-menu-sub-trigger"]')].map((one) => one.textContent.trim()))
  check('a Writing page\'s "…" groups its tools into submenus', ['Writing tools', 'Reading queue', 'Export'].every((one) => subs.some((sub) => sub.startsWith(one))), JSON.stringify(subs))
  check('and has 20 lines or fewer at its top', lines.length <= 20, `${lines.length}: ${JSON.stringify(lines)}`)
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)
  check('no page errors', !c.errors?.some((one) => /PAGEERROR/.test(one)), (c.errors ?? []).slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()

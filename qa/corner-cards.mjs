// Corner cards never sit over what you are using: a milestone ("100 captures kept") that comes while the
// [[ note picker is open waits for it to close, one already up steps away when a menu opens and comes back
// after, and in the main window it lands at the sidebar's foot, over no page. And the [[ and @ pickers
// forgive a slip: "Gatsbx" finds "Gatsby" when nothing is spelt that way.
//
//   npx electron-vite build --outDir out-wr
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-wr/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/corner-cards.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 860 })
const { h, v, go, close, errors } = s
const shots = process.env.QA_SHOTS
const celebrate = () => h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:celebrate', { detail: { id: 'try:kept', kind: 'kept', rank: 0, line: 'Each one out of your head.', headline: '100 captures kept', mark: '100', tint: 'var(--tt-color-text-blue)' } })))
const card = () => h.evaluate(() => {
  const one = document.querySelector('[data-celebration] [role="status"]')
  if (!one) return null
  const r = one.getBoundingClientRect()
  const page = document.querySelector('[role="main"]')?.getBoundingClientRect()
  return { left: Math.round(r.left), right: Math.round(r.right), docked: !!one.closest('[data-corner-dock]'), overPage: !!page && r.right > page.left + 1 }
})
const picker = () => h.evaluate(() => [...document.querySelectorAll('.tiptap-suggestion-popup, [role=listbox]')].some((one) => one.checkVisibility() && one.getBoundingClientRect().width > 0))
try {
  await v('settings:set', { hintRate: 0 })
  // The page the picker should find, and another to write the link in (a picker never offers the note it is in).
  const target = await v('article:new')
  await v('item:save', target, { title: 'Gatsby and the green light' })
  const writing = await v('article:new')
  await v('item:save', writing, { title: 'Quokka essay' })
  await go('articles')
  await h.locator('[data-row]', { hasText: 'Quokka essay' }).first().click()
  await h.waitForTimeout(900)
  await h.locator('.tiptap.ProseMirror').first().click()
  await h.keyboard.press('Meta+ArrowDown')
  await h.keyboard.press('Enter')
  await h.keyboard.type('[[')
  await h.waitForTimeout(500)
  check('the [[ picker is open', await picker())
  await celebrate()
  await h.waitForTimeout(1500)
  if (shots) await h.screenshot({ path: `${shots}/picker-open.png` })
  check('a milestone that comes while the picker is open does not show', (await card()) === null, JSON.stringify(await card()))
  // A slip: nothing is spelt "Gatsbx", and the picker still finds the page.
  await h.keyboard.type('Gatsbx')
  await h.waitForTimeout(900)
  const rows = await h.evaluate(() => [...document.querySelectorAll('.tiptap-suggestion-popup [role=option], .tiptap-suggestion-popup button')].map((one) => one.textContent.trim()).filter(Boolean))
  if (shots) await h.screenshot({ path: `${shots}/picker-slip.png` })
  check('“Gatsbx” in the [[ picker finds “Gatsby and the green light”', rows.some((one) => /Gatsby and the green light/.test(one)), rows.slice(0, 6).join(' | '))
  await h.keyboard.press('Escape')
  await h.waitForTimeout(1200)
  const after = await card()
  check('once the picker closes, the milestone shows', !!after)
  check('in the main window it sits at the sidebar’s foot, over no page', !!after && after.docked && !after.overPage, JSON.stringify(after))
  if (shots) await h.screenshot({ path: `${shots}/docked.png` })
  // A menu opened while it is up: it steps away, and comes back after.
  await h.locator('[data-row]', { hasText: 'Quokka essay' }).first().click({ button: 'right' })
  await h.waitForTimeout(400)
  check('a right-click menu opened: the card steps away', (await card()) === null)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(600)
  check('the menu closed: the card is back', !!(await card()))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()

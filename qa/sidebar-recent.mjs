// Run with: QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out/main/index.js MINDFLOW_QA_AWAY=1 node qa/sidebar-recent.mjs
// Recent lives in ⌘K now, not the sidebar: no Recent section under Pinned, no
// switch for it in Customize or Settings, and ⌘K, before anything is typed,
// lists the notes you opened last first, newest on top, under “Recent”.
// Typing searches as before. The sidebar's previews keep their example tasks.
// SHOTS=<dir> saves pictures.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1200, height: 860 })
const { h, v, go, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const shoot = async (name) => SHOTS && (await h.screenshot({ path: `${SHOTS}/${name}.png` }))
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await go('home')
  const sidebar = await h.evaluate(() => document.querySelector('aside')?.innerText ?? '')
  check('the sidebar has no Recent section', !/\bRecent\b/.test(sidebar), sidebar.match(/.{0,20}Recent.{0,20}/)?.[0] ?? '')
  // Customize lists the pages only.
  await h.locator('aside').hover(); await wait(300)
  const wrench = h.locator('button:has(svg.lucide-wrench)').first()
  if (await wrench.count()) {
    await wrench.click({ force: true }); await wait(500)
    const said = await h.evaluate(() => document.querySelector('[data-slot=popover-content]')?.textContent ?? '')
    check('Customize has no Recent switch', said.length > 0 && !/Recent/.test(said), said.slice(0, 60))
    await h.keyboard.press('Escape'); await wait(300)
  } else check('Customize opens from the sidebar', false)
  // Settings has no "Recent in the sidebar".
  await go('settings')
  await h.evaluate(() => document.querySelector('[data-page=settings] input')?.focus())
  await h.keyboard.type('recent'); await wait(600)
  const found = await h.evaluate(() => document.querySelector('[data-page=settings]')?.innerText ?? '')
  check('Settings has no “Recent in the sidebar”', !/Recent in the sidebar/.test(found))
  // Open three notes, then ⌘K with nothing typed.
  const caps = (await h.evaluate(() => window.api.captures.list())).filter((one) => one.status === 'open' && !one.archivedAt).slice(0, 3)
  for (const one of caps) { await send('capture', one.id); await wait(700) }
  await go('home'); await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('Meta+k'); await wait(900)
  const list = await h.evaluate(() => {
    const at = [...document.querySelectorAll('[role=dialog][aria-label=Search] *')].find((one) => one.children.length === 0 && one.textContent.trim() === 'Recent')
    const rows = [...document.querySelectorAll('[role=dialog][aria-label=Search] [data-drag-open]')].map((one) => one.dataset.dragOpen)
    return { heading: !!at, first: rows.slice(0, 3) }
  })
  await shoot('cmdk-recent')
  const want = caps.map((one) => `capture:${one.id}`).reverse()
  check('⌘K, before typing, has a Recent heading', list.heading)
  check('⌘K lists the three notes opened last first, newest on top', JSON.stringify(list.first) === JSON.stringify(want), `${list.first.join(', ')} vs ${want.join(', ')}`)
  await h.keyboard.type('the'); await wait(900)
  const typed = await h.evaluate(() => [...document.querySelectorAll('[role=dialog][aria-label=Search] *')].some((one) => one.children.length === 0 && one.textContent.trim() === 'Recent'))
  check('typing searches as before: no Recent heading', !typed)
  await h.keyboard.press('Escape'); await wait(400)
  // The sidebar's previews still show their example tasks.
  const today = h.locator('aside nav button[aria-label="Today"]').first()
  await today.hover(); await wait(1300)
  const peek = await h.evaluate(() => [...document.querySelectorAll('[data-slot=tooltip-content]')].map((one) => one.textContent).join(' '))
  check('pointing at Today in the sidebar still shows its example tasks', /Today:/.test(peek) && peek.length > 40, peek.slice(0, 60))
  if (c.errors.length) console.log('ERRORS\n' + c.errors.slice(0, 6).join('\n'))
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)

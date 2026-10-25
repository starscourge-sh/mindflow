// A Review card has the menu every card has, by right-click or its quiet ⋯:
// Open, Copy link, Pause, then a rule and "Move to the Bin" last with the
// trash icon, which comes back with ⌘Z.
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/review-card-menu.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const menu = () => h.evaluate(() => {
  const box = document.querySelector('[data-slot="context-menu-content"]')
  const kids = [...(box?.querySelectorAll('[role="menuitem"], [data-slot="context-menu-separator"]') ?? [])].map((one) => one.getAttribute('role') === 'menuitem' ? one.textContent.trim() : '---')
  const last = [...(box?.querySelectorAll('[role="menuitem"]') ?? [])].pop()
  return { kids, icon: !!last?.querySelector('svg') }
})
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { pageHints: false })
  await go('review'); await wait(1500)
  const face = h.locator('[data-review-card] h2').first()
  check('Review shows a card', await face.count() === 1)
  await face.click({ button: 'right' }); await wait(400)
  const shown = await menu()
  check('right-click opens its menu: Open, Copy link, Pause, a rule, Move to the Bin',
    JSON.stringify(shown.kids.map((one) => one.replace(/⌫$/, ''))) === JSON.stringify(['Open', 'Copy link', 'Pause', '---', 'Move to the Bin']), JSON.stringify(shown.kids))
  check('the Bin line has the trash icon', shown.icon)
  await h.keyboard.press('Escape'); await wait(300)
  await h.locator('[data-review-more]').click(); await wait(400)
  check('the ⋯ opens the same menu', JSON.stringify((await menu()).kids) === JSON.stringify(shown.kids))
  const before = (await v('items', 'nugget')).length
  const title = await face.textContent()
  await h.locator('[role="menuitem"]', { hasText: 'Move to the Bin' }).click(); await wait(900)
  check('Move to the Bin bins it', (await v('items', 'nugget')).length === before - 1)
  check('and the next card shows', (await h.locator('[data-review-card] h2').first().textContent().catch(() => '')) !== title)
  await h.keyboard.press('Meta+z'); await wait(900)
  check('⌘Z brings it back', (await v('items', 'nugget')).length === before)
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)

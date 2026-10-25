// Every card's menu ends with "Move to the Bin", after a rule, with the trash
// icon, and it comes back with ⌘Z: Gems' cards and Home's cards.
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/card-bin.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const menu = () => h.evaluate(() => {
  const box = document.querySelector('[data-slot="context-menu-content"]')
  const kids = [...(box?.querySelectorAll('[role="menuitem"], [role="separator"], [data-slot="context-menu-separator"]') ?? [])].map((one) => one.getAttribute('role') === 'menuitem' ? one.textContent.trim() : '---')
  const last = [...(box?.querySelectorAll('[role="menuitem"]') ?? [])].pop()
  return { kids, icon: !!last?.querySelector('svg') }
})
const ends = async (where) => {
  const shown = await menu()
  const kids = shown.kids.filter(Boolean)
  check(`${where}: the menu ends with "Move to the Bin"`, kids[kids.length - 1]?.startsWith('Move to the Bin'), JSON.stringify(kids.slice(-3)))
  check(`${where}: after a rule`, kids[kids.length - 2] === '---')
  check(`${where}: and only there`, kids.filter((one) => one.startsWith("Move to the Bin")).length === 1, JSON.stringify(kids))
  check(`${where}: with the trash icon`, shown.icon)
}
const gemsLeft = async () => (await v('items', 'nugget')).length
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { pageHints: false })
  const [gem] = await v('items', 'nugget')
  const before = await gemsLeft()
  await h.evaluate(() => localStorage.setItem('view:nugget', JSON.stringify({ sort: 'newest', group: 'none', filter: {}, density: 'grid', wideDensity: 'grid', pane: 'list' })))
  await h.reload(); await wait(1500)
  await go('nuggets'); await wait(1200)
  const tile = h.locator('[data-row]').first()
  await tile.click({ button: 'right' }); await wait(400)
  await ends('Gems card')
  await h.locator('[role="menuitem"]', { hasText: 'Move to the Bin' }).last().click(); await wait(900)
  check('Gems card: it goes to the Bin', (await gemsLeft()) === before - 1, `${await gemsLeft()} / ${before - 1}`)
  await h.keyboard.press('Meta+z'); await wait(900)
  check('Gems card: ⌘Z brings it back', (await gemsLeft()) === before)

  // Home: a gem opened lately.
  await h.evaluate((id) => window.api.openInHome('nugget', id), gem.id); await wait(1200)
  await go('home'); await wait(1500)
  const card = h.locator('[data-drag-open^="nugget:"], [data-drag-open^="capture:"]').first()
  if (await card.count()) {
    await card.click({ button: 'right' }); await wait(400)
    await ends('Home card')
    await h.keyboard.press('Escape')
  } else check('Home card: a card is on Home', false)
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)

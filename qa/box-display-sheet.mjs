// Quick capture's lists and their Display (notes 97e52120, 81d0c7a2). Display opened from "Newest" in the box
// comes in as a sheet inside the card, its shade over the card alone: never hung off the card's side over the
// desktop with the whole window dimmed. The Inbox, which no task ever reaches, has no Task chip, even when Task
// was picked there before, and that old pick never holds the list at "Nothing matches".
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-display-sheet.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const shots = process.env.QA_SHOTS ?? process.env.QA_DATA
try {
  await v('settings:set', { hintRate: 0, rotCount: 0 })
  // Task picked in the box's Inbox once, as the user's had been.
  await page.evaluate(() => localStorage.setItem('view:prompt:captures', JSON.stringify({ sort: 'newest', group: 'kind', filter: { status: ['open'], kind: ['task'] } })))
  await page.reload(); await page.waitForTimeout(1500)
  await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(900)
  const toggle = page.locator('button[aria-label="Show the side panel"]')
  if (await toggle.count()) { await toggle.first().click(); await page.waitForTimeout(800) }
  await page.keyboard.press('Control+1'); await page.waitForTimeout(800)
  const chips = await page.evaluate(() => [...document.querySelectorAll('[data-filter-chips] button[aria-pressed]')].map((one) => one.textContent.trim()))
  check('the Inbox offers no Task chip', !chips.includes('Task'), chips.join(', '))
  const nothing = await page.evaluate(() => /Nothing matches/.test(document.body.innerText))
  check('an old Task pick does not hold the Inbox at "Nothing matches"', !nothing)
  await page.screenshot({ path: `${shots}/box-inbox-chips.png` })

  // Display from its button ("Newest"), on each list of the box that has one.
  for (const tab of ['Control+1', 'Control+4']) {
    await page.keyboard.press(tab); await page.waitForTimeout(800)
    const button = page.locator('[data-display]').first()
    if (!(await button.count())) { check(`${tab}: a Display button`, false); continue }
    await button.click(); await page.waitForTimeout(700)
    const at = await page.evaluate(() => {
      const card = document.querySelector('.app-container')?.getBoundingClientRect()
      const sheet = document.querySelector('[data-slot="sheet-content"]')?.getBoundingClientRect()
      const pop = document.querySelector('[data-slot="popover-content"]')?.getBoundingClientRect()
      const shade = document.querySelector('[data-slot="sheet-overlay"]')?.getBoundingClientRect()
      const r = (b) => b && { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }
      return { card: r(card), sheet: r(sheet), pop: r(pop), shade: r(shade) }
    })
    const inside = (b) => !b || (b.l >= at.card.l - 1 && b.t >= at.card.t - 1 && b.r <= at.card.r + 1 && b.b <= at.card.b + 1)
    check(`${tab}: Display opens over the card, never off its side`, (at.sheet || at.pop) && inside(at.sheet) && inside(at.shade), JSON.stringify(at))
    await page.screenshot({ path: `${shots}/box-display-${tab.slice(-1)}.png` })
    await page.keyboard.press('Escape'); await page.waitForTimeout(500)
  }
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)

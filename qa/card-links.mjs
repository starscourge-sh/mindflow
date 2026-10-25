// Gems' cards show a body's @ links as links, as the Feed does: a click opens
// the linked note, and a rest shows its hover card.
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/card-links.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { pageHints: false })
  const gems = await v('items', 'nugget')
  const [gem, other] = gems
  check('the sandbox has two gems', gem && other)
  await v('item:save', gem.id, { body: `Cardlink words first.\n\nConnected to: [[@nugget:${other.id}|${other.title}]]` })
  await h.evaluate(() => localStorage.setItem('view:nugget', JSON.stringify({ sort: 'newest', group: 'none', filter: {}, density: 'grid', wideDensity: 'grid', pane: 'list' })))
  await h.reload(); await wait(1500)
  await go('nuggets'); await wait(1200)
  const link = h.locator(`[data-card-link="nugget:${other.id}"]`).first()
  check('the card shows the link as a link', await link.count() === 1, await link.textContent().catch(() => ''))
  check('with no link marks left in the words', !(await h.evaluate(() => document.body.innerText.includes('[[@'))))
  const box = await link.boundingBox()
  await h.mouse.move(box.x - 30, box.y - 30)
  await h.mouse.move(box.x + 4, box.y + box.height / 2, { steps: 4 })
  await wait(1000)
  check('a rest shows its hover card', (await h.locator('[data-note-preview] [data-preview-title]').textContent().catch(() => '')) === other.title)
  await h.keyboard.press('Escape'); await h.mouse.move(5, 5); await wait(400)
  // The linked gem's own words, which only its open page shows.
  const words = await h.evaluate(async (id) => { const body = await window.api.captures.peek('nugget', id); const walk = (n) => typeof n === 'string' ? n : n?.text ?? (n?.content ?? []).map(walk).join(' '); return walk(body).replace(/\s+/g, ' ').trim().slice(0, 24) }, other.id)
  const shows = () => h.evaluate((w) => [...document.querySelectorAll('.ProseMirror')].some((one) => one.innerText.replace(/\s+/g, ' ').includes(w)), words)
  check('before the click its page is not open', !(await shows()), words)
  await link.click(); await wait(1500)
  check('a click opens the linked gem', await shows())
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)

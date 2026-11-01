// A board's ⋯ and a right click open the same menu: on a card, and on a list's heading. Before, a right
// click on either opened nothing of the board's.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/board-menus.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 860 })
const { h, v, send } = s
const wait = (ms = 300) => h.waitForTimeout(ms)
const lines = () => h.evaluate(() => {
  const menu = [...document.querySelectorAll('[role="menu"]')].at(-1)
  return menu ? [...menu.querySelectorAll(':scope [role^="menuitem"]')].map((one) => one.textContent.trim()).join(' | ') : ''
})
const shut = async () => { await h.keyboard.press('Escape'); await wait(300) }
try {
  const id = await v('article:new')
  await v('item:save', id, { title: 'Moves', body: '## Todo\n\n- [ ] pack the van\n- [ ] book the ferry\n\n## Done\n\n- [x] sell the sofa\n' })
  await v('notes:fields:set', 'nuggets', id, 'kanban-plugin', 'board')
  await send('view', 'articles')
  await wait(1200)
  await send('article', id)
  await wait(1600)
  check('the page is a board', await h.evaluate(() => !!document.querySelector('[data-board] section')))

  const card = h.locator('[data-board] [data-sortable-id] .group\\/card, [data-board] .group\\/card').first()
  await card.hover()
  await h.locator('[data-board] button[aria-label="Card menu"]').first().click()
  await wait()
  const byDots = await lines()
  await shut()
  await card.click({ button: 'right', position: { x: 40, y: 10 } })
  await wait()
  const byRight = await lines()
  await shut()
  check('a card: ⋯ and right-click open the same lines', !!byDots && byDots === byRight, `⋯: ${byDots}\n    right: ${byRight}`)

  const head = h.locator('[data-board] section header').first()
  await head.locator('button[aria-label$=" menu"]').click()
  await wait()
  const laneDots = await lines()
  await shut()
  await head.locator('h3').click({ button: 'right' })
  await wait()
  const laneRight = await lines()
  await shut()
  check('a list heading: ⋯ and right-click open the same lines', !!laneDots && laneDots === laneRight, `⋯: ${laneDots}\n    right: ${laneRight}`)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await s.close()
}
done()

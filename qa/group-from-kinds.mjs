// Grouped by kind, your groups wait in the plain list: making one there (⌃⌘N
// on two picked rows, or "Move to group") goes to the plain list, so the new
// group shows at once instead of nothing seeming to happen.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/group-from-kinds.mjs
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')
import { checks } from './harness.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
try {
  await c.v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  await c.h.evaluate(() => localStorage.setItem('view:nugget', JSON.stringify({ sort: 'newest', group: 'kind', filter: {}, density: 'list' })))
  await c.h.reload(); await c.h.waitForTimeout(1500)
  await c.go('nuggets'); await c.h.waitForTimeout(900)
  const grouping = () => c.h.evaluate(() => JSON.parse(localStorage.getItem('view:nugget') ?? '{}').group)
  check('starts grouped by kind', (await grouping()) === 'kind', await grouping())
  const rows = c.h.locator('[data-row]')
  await rows.nth(0).click({ modifiers: ['Meta'] })
  await rows.nth(1).click({ modifiers: ['Meta'] })
  await c.h.keyboard.press('Control+Meta+n')
  await c.h.waitForTimeout(700)
  const made = (await c.v('groups', 'nugget')).filter((one) => one.members.length === 2)
  check('the group is made', made.length === 1, JSON.stringify(made.map((one) => one.name)))
  check('the list goes plain: grouped by nothing', (await grouping()) === 'none', await grouping())
  await c.h.keyboard.press('Enter'); await c.h.waitForTimeout(600)
  check('and the new group shows as a group row', (await c.h.locator('[data-group-row], [data-group-block]').count()) >= 1, String(await c.h.locator('[data-group-row], [data-group-block]').count()))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()

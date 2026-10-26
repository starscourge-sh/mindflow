// Show on Home: a goal chosen on its page (or from its row menu) comes first
// in the strip at the top of Home, ahead of the nearest; taken off, the
// nearest show again. Two rows, three once two are chosen, and how many more.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-g/main/index.js HALIGTREE_QA_AWAY=1 node qa/goal-home.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { h, v, go, send, errors } = c
const strip = () => h.evaluate(() => ({ ids: [...document.querySelectorAll('[data-strip-goal]')].map((one) => one.getAttribute('data-strip-goal')), more: document.querySelector('[data-goal-more-count]')?.textContent ?? '' }))
try {
  const open = (await v('items', 'goal')).filter((one) => !one.closedAt && !one.archivedAt && one.goalAt).sort((a, b) => a.goalAt.localeCompare(b.goalAt))
  check('the sandbox has at least four open goals', open.length >= 4, open.length)
  // From none chosen: the sandbox shows its Odyssey goal on Home, taken off here.
  for (const one of open) if (one.starredAt) await v('review:star', one.id, false)
  await go('home')
  let now = await strip()
  check('at first the strip shows the two nearest', now.ids.join() === open.slice(0, 2).map((one) => one.id).join(), JSON.stringify(now))
  const far = open.at(-1)
  await send('goal', far.id)
  await h.waitForTimeout(1200)
  check('the goal page offers “Show on Home”', (await h.locator('[data-goal-home="off"]').count()) === 1)
  await h.locator('[data-goal-home]').click()
  await h.waitForTimeout(600)
  check('clicked, it says “Shown on Home”', (await h.locator('[data-goal-home="on"]').count()) === 1)
  await go('home')
  now = await strip()
  check('Home shows the chosen goal first, then the nearest', now.ids[0] === far.id && now.ids[1] === open[0].id && now.ids.length === 2, JSON.stringify(now))
  check('and says how many more', now.more.startsWith(`${open.length - 2} more`), now.more)
  // A second chosen from its row menu: three rows.
  const second = open.at(-2)
  await go('goals')
  await h.locator(`[data-row][data-id="${second.id}"]`).first().click({ button: 'right' })
  await h.waitForTimeout(300)
  const item = h.locator('[role="menuitem"]', { hasText: 'Show on Home' })
  check('the row menu has “Show on Home”', (await item.count()) === 1)
  await item.first().click()
  await h.waitForTimeout(500)
  await go('home')
  now = await strip()
  check('two chosen: three rows, both chosen first', now.ids.length === 3 && now.ids.slice(0, 2).sort().join() === [far.id, second.id].sort().join() && now.ids[2] === open[0].id, JSON.stringify(now))
  check('the count of more follows', open.length === 3 || now.more.startsWith(`${open.length - 3} more`), now.more)
  await v('review:star', far.id, false)
  await v('review:star', second.id, false)
  await h.waitForTimeout(600)
  now = await strip()
  check('taken off, the nearest show again', now.ids.join() === open.slice(0, 2).map((one) => one.id).join(), JSON.stringify(now))
  check('no errors', !errors.length, errors.join('\n'))
} finally {
  await c.close()
}
done()

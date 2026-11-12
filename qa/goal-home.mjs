// Goals on Home are asked for, never just there (the user, 12 Nov: "showing goals on home should be opt in and i
// should be able to pick , do i want the closes x or just this one or two specifically and in what order").
// A new book shows none. “Nearest” shows the next 1, 2 or 3 by their day. “Show on Home” on a goal (its page, its
// row's menu) turns Home to the chosen ones only, in the order they were chosen, three at most; a chosen goal moves
// up and down from its row on Home (menu, ⌥↑ and ⌥↓) and from Settings, and is taken off from either. The same strip
// is on today's Journal page. Settings, ⌘K and the strip's own right-click all say and set the same thing.
//   QA_DATA=<a copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-g/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/goal-home.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { h, v, go, send, errors } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.SHOTS
const strip = () => h.evaluate(() => ({ ids: [...document.querySelectorAll('[data-strip-goal]')].map((one) => one.getAttribute('data-strip-goal')), mode: document.querySelector('[data-goals-home]')?.getAttribute('data-goals-home') ?? null, more: document.querySelector('[data-goal-more-count]')?.textContent ?? '' }))
const kept = async () => { const now = await v('settings'); return { mode: now.goalsOnHome, nearest: now.goalsNearest, ids: now.goalsChosen } }
const menu = async (id, label) => {
  await h.locator(`[data-strip-goal="${id}"]`).click({ button: 'right' })
  // By how its name starts: a line may carry its keys or a hint after it.
  const item = h.getByRole('menuitem', { name: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first()
  await item.waitFor({ timeout: 3000 })
  await item.click()
  await wait(500)
}
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  const open = (await v('items', 'goal')).filter((one) => !one.closedAt && !one.archivedAt && one.goalAt).sort((a, b) => a.goalAt.localeCompare(b.goalAt))
  check('the sandbox has at least four open goals with a day', open.length >= 4, open.length)
  const [near1, near2, near3] = open
  const far = open.at(-1), second = open.at(-2)

  // 1. Off, as a new book starts.
  await v('settings:set', { goalsOnHome: 'off', goalsNearest: 2, goalsChosen: [] })
  await go('home'); await wait(900)
  let now = await strip()
  check('off: Home shows no goals', now.ids.length === 0 && now.mode === null, JSON.stringify(now))

  // 2. The nearest few.
  await v('settings:set', { goalsOnHome: 'nearest' }); await wait(600)
  now = await strip()
  check('“Nearest”: the two nearest, soonest first', now.ids.join() === [near1.id, near2.id].join() && now.mode === 'nearest', JSON.stringify(now))
  check('...and how many more', now.more.startsWith(`${open.length - 2} more`), now.more)
  await v('settings:set', { goalsNearest: 3 }); await wait(500)
  check('“How many” 3: three', (await strip()).ids.join() === [near1.id, near2.id, near3.id].join(), JSON.stringify(await strip()))
  await v('settings:set', { goalsNearest: 1 }); await wait(500)
  check('“How many” 1: one', (await strip()).ids.join() === near1.id, JSON.stringify(await strip()))
  await v('settings:set', { goalsNearest: 2 }); await wait(300)

  // 3. Chosen from a goal's page: Home turns to the chosen only.
  await send('goal', far.id); await wait(1200)
  check('a goal\'s page offers “Show on Home”', (await h.locator('[data-goal-home="off"]').count()) === 1)
  await h.locator('[data-goal-home]').click(); await wait(600)
  check('clicked, it says “Take off Home”', (await h.locator('[data-goal-home="on"]').count()) === 1)
  check('Home\'s choice is now “Chosen”, with that goal', JSON.stringify(await kept()) === JSON.stringify({ mode: 'chosen', nearest: 2, ids: [far.id] }), JSON.stringify(await kept()))
  await go('home'); await wait(700)
  now = await strip()
  check('Home shows only the chosen goal', now.ids.join() === far.id, JSON.stringify(now))
  check('...and how many more', now.more.startsWith(`${open.length - 1} more`), now.more)

  // 4. A second from its row's menu: in the order chosen.
  await go('goals'); await wait(600)
  await h.locator(`[data-row][data-id="${second.id}"]`).first().click({ button: 'right' }); await wait(300)
  const item = h.locator('[role="menuitem"]', { hasText: 'Show on Home' })
  check('a goal\'s row menu has “Show on Home”', (await item.count()) === 1)
  await item.first().click(); await wait(500)
  await go('home'); await wait(700)
  check('two chosen: in the order they were chosen', (await strip()).ids.join() === [far.id, second.id].join(), JSON.stringify(await strip()))
  if (shots) await h.screenshot({ path: `${shots}/goal-home-chosen.png` })

  // 5. Your own order: from the row's menu, then by key; kept.
  await menu(second.id, 'Move up')
  check('“Move up” on the second: it is first', (await strip()).ids.join() === [second.id, far.id].join(), JSON.stringify(await strip()))
  await h.locator(`[data-strip-goal="${second.id}"]`).focus()
  await h.keyboard.press('Alt+ArrowDown'); await wait(500)
  check('⌥↓ on it: second again', (await strip()).ids.join() === [far.id, second.id].join(), JSON.stringify(await strip()))
  check('...and the same row still has the keys', await h.evaluate((id) => document.activeElement?.getAttribute('data-strip-goal') === id, second.id))
  check('the order is kept in Settings', (await kept()).ids.join() === [far.id, second.id].join(), JSON.stringify(await kept()))

  // 6. Three at most.
  await v('settings:set', { goalsChosen: [far.id, second.id, near1.id] }); await wait(500)
  check('three chosen: three rows', (await strip()).ids.length === 3, JSON.stringify(await strip()))
  await go('goals'); await wait(600)
  await h.locator(`[data-row][data-id="${near2.id}"]`).first().click({ button: 'right' }); await wait(300)
  await h.locator('[role="menuitem"]', { hasText: 'Show on Home' }).first().click(); await wait(600)
  check('a fourth is refused, and says why', (await kept()).ids.length === 3 && await h.evaluate(() => /3 goals at most/.test(document.body.innerText)), JSON.stringify(await kept()))

  // 7. Settings says the same, and changes it: opened at its row from the strip's own menu.
  await go('home'); await wait(700)
  await menu(far.id, 'Choose what shows here…')
  await wait(900)
  const row = h.locator('[data-setting-title="Goals on Home"]')
  check('“Choose what shows here…” opens Settings at “Goals on Home”', await row.isVisible().catch(() => false))
  const rows = async () => h.evaluate(() => [...document.querySelectorAll('[data-home-goal-off]')].map((one) => one.getAttribute('data-home-goal-off')))
  check('Settings lists the chosen goals in their order', (await rows()).join() === [far.id, second.id, near1.id].join(), JSON.stringify(await rows()))
  check('“Add a goal…” is greyed at three, and the row says why', await h.locator('[data-home-goal-add]').isDisabled() && await h.evaluate(() => /shows 3 at most/.test(document.body.innerText)))
  if (shots) await h.screenshot({ path: `${shots}/goal-home-settings.png` })
  await h.locator(`[data-home-goal-down="${far.id}"]`).click(); await wait(500)
  check('“Down” on the first: it is second', (await kept()).ids.join() === [second.id, far.id, near1.id].join(), JSON.stringify(await kept()))
  check('...its buttons stayed where they were (the row moved, nothing shifted under the pointer)', (await rows()).join() === [second.id, far.id, near1.id].join())
  await h.locator(`[data-home-goal-off="${near1.id}"]`).click(); await wait(500)
  check('“Take off” in Settings: two left', (await kept()).ids.join() === [second.id, far.id].join(), JSON.stringify(await kept()))
  await h.locator('[data-home-goal-add]').click(); await wait(300)
  await h.locator(`[data-home-goal-pick="${near2.id}"]`).click(); await wait(500)
  check('“Add a goal…” adds it last', (await kept()).ids.join() === [second.id, far.id, near2.id].join(), JSON.stringify(await kept()))

  // 8. Taken off from the strip; the last one off leaves none.
  await go('home'); await wait(700)
  await menu(near2.id, 'Take off Home')
  await menu(far.id, 'Take off Home')
  check('taken off on Home: one left', (await strip()).ids.join() === second.id, JSON.stringify(await strip()))
  await menu(second.id, 'Take off Home')
  now = await strip()
  check('the last one off: no goals on Home, and it says none is chosen', now.ids.length === 0 && await h.evaluate(() => /none is chosen/.test(document.body.innerText)), JSON.stringify(now))

  // 9. ⌘K sets it too.
  await h.keyboard.press('Meta+k'); await wait(400)
  await h.keyboard.type('Goals on Home', { delay: 10 }); await wait(400)
  await h.keyboard.press('Enter'); await wait(400)
  const offered = await h.evaluate(() => [...document.querySelectorAll('[cmdk-item], [role="option"]')].map((one) => one.textContent.trim().slice(0, 40)))
  check('⌘K “Goals on Home…” offers the choices', offered.some((one) => one.startsWith('The nearest 3 goals')) && offered.some((one) => one.startsWith('No goals on Home')), JSON.stringify(offered.slice(0, 8)))
  await h.keyboard.type('nearest 3', { delay: 10 }); await wait(300)
  await h.keyboard.press('Enter'); await wait(700)
  check('chosen there: Home shows the nearest three', JSON.stringify(await kept()).includes('"mode":"nearest","nearest":3') && (await strip()).ids.join() === [near1.id, near2.id, near3.id].join(), JSON.stringify([await kept(), await strip()]))

  // 10. “Nearest” rows offer to keep one; “Hide goals here” turns it off.
  await menu(near2.id, 'Show only this one')
  check('“Show only this one”: Home shows it alone, chosen', (await strip()).ids.join() === near2.id && (await kept()).mode === 'chosen', JSON.stringify(await kept()))
  await menu(near2.id, 'Hide goals here')
  check('“Hide goals here”: off, kept as the setting', (await strip()).ids.length === 0 && (await kept()).mode === 'off', JSON.stringify(await kept()))

  // 11. Today's Journal page shows the same.
  await v('settings:set', { goalsOnHome: 'nearest', goalsNearest: 2 })
  await go('today'); await wait(1200)
  check('today\'s Journal page shows the same goals', (await strip()).ids.join() === [near1.id, near2.id].join(), JSON.stringify(await strip()))
  await v('settings:set', { goalsOnHome: 'off' }); await wait(600)
  check('...and none when off', (await strip()).ids.length === 0)
  check('no errors', !errors.length, errors.join('\n'))
} catch (error) {
  check('the run finished', false, String(error?.stack ?? error).slice(0, 400))
} finally {
  await c.close()
}
done()

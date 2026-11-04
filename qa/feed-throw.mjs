// Throwing a post away: ⌫ on the J/K cursor's post moves its note to the Bin, the post gone at once and back with
// Undo; the × at a post's top right opens a small menu of two rows, "Less of this" and "Move to the Bin", with no
// tip on either. A Journal day has no ×.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/feed-throw.mjs
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')
const { checks } = await import('./harness.mjs')
const { check, done } = checks()
const SHOTS = process.env.QA_SHOTS ?? '/tmp'
const c = await sandbox({ width: 1300, height: 860 })
const { h, v, go, errors } = c
const binned = async (id) => !!(await v('item', id))?.binnedAt
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  await go('feed'); await h.waitForTimeout(1200)
  const posts = (await v('feed')).posts
  // ⌫ on the cursor.
  const at = posts.findIndex((one) => one.type === 'nugget')
  const gem = posts[at]
  await h.mouse.move(5, 5)
  for (let i = 0; i <= at; i++) { await h.keyboard.press('j'); await h.waitForTimeout(60) }
  check('the cursor is on the gem', (await h.locator(`[data-feed-at="${at}"] [data-feed-cursor]`).count()) === 1)
  await h.keyboard.press('Backspace')
  await h.waitForTimeout(600)
  check('⌫: the post goes at once', (await h.locator(`[data-feed-id="${gem.id}"]`).count()) === 0)
  check('⌫: its gem is in the Bin', await binned(gem.id))
  const toast = await h.evaluate(() => (document.body.innerText.match(/Moved to the Bin[^\n]*/) ?? [''])[0] + ([...document.querySelectorAll('button')].some((one) => /^Undo/.test(one.textContent?.trim() ?? '')) ? ' + Undo' : ''))
  check('⌫: the same toast as "Move to the Bin", with Undo', /Bin/.test(toast) && /Undo/.test(toast), toast)
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(900)
  check('⌘Z brings the gem and its post back', !(await binned(gem.id)) && (await h.locator(`[data-feed-id="${gem.id}"]`).count()) === 1, `binned ${await binned(gem.id)}, posts ${await h.locator(`[data-feed-id="${gem.id}"]`).count()}, toast now: ${await h.locator('[role="status"]').last().innerText().catch(() => '')}`)
  // The × menu.
  const other = posts.find((one) => one.type === 'nugget' && one.id !== gem.id) ?? posts.find((one) => one.type === 'capture')
  const card = h.locator(`[data-feed-id="${other.id}"]`).first()
  await card.scrollIntoViewIfNeeded()
  await card.locator('[data-feed-hide] [data-menu="hide"]').click()
  await h.waitForTimeout(350)
  const rows = await h.locator('[role="menu"] [role="menuitem"]').allTextContents()
  check('× opens a menu of two rows: "Less of this" and "Move to the Bin"', rows.length === 2 && /Less of this/.test(rows[0]) && /Move to the Bin/.test(rows[1]), rows.join(' / '))
  for (const row of await h.locator('[role="menu"] [role="menuitem"]').all()) { await row.hover(); await h.waitForTimeout(700) }
  check('no tip over the menu rows (one hover, one surface)', (await h.locator('[role="tooltip"]:visible').count()) === 0)
  await h.screenshot({ path: `${SHOTS}/feed-x-menu.png` })
  await c.look('dark'); await h.waitForTimeout(300); await h.screenshot({ path: `${SHOTS}/feed-x-menu-dark.png` }); await c.look('light')
  await h.locator('[role="menu"] [data-menu-item="bin"]').click()
  await h.waitForTimeout(600)
  check('"Move to the Bin" from the × takes the post away', (await h.locator(`[data-feed-id="${other.id}"]`).count()) === 0)
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(900)
  check('and ⌘Z brings it back', (await h.locator(`[data-feed-id="${other.id}"]`).count()) === 1)
  const day = posts.find((one) => one.type === 'day')
  if (day) check('a Journal day has no ×', (await h.locator(`[data-feed-id="${day.id}"] [data-menu="hide"]`).count()) === 0)
  check('no errors', !errors.length, errors.join('\n'))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()

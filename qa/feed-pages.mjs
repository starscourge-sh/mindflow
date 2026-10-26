// The Feed's Notes is gems and notes to start; pages come in only once asked
// for, by the "Pages too" switch at the Feed's top (or Settings).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/feed-pages.mjs
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')
const { checks } = await import('./harness.mjs')
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const kinds = async () => [...new Set((await c.v('feed')).posts.map((one) => one.type))]
try {
  await c.v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  check('to start, no pages in the Feed', !(await kinds()).includes('article'), (await kinds()).join())
  await c.h.reload(); await c.h.waitForTimeout(1500)
  await c.go('feed'); await c.h.waitForTimeout(1200)
  const toggle = c.h.locator('[data-feed-pages] [role="switch"], [data-feed-pages] button').first()
  check('the Feed has a "Pages too" switch, off', (await toggle.count()) === 1 && (await toggle.getAttribute('aria-checked')) === 'false')
  await toggle.click(); await c.h.waitForTimeout(900)
  check('switched on, the setting is saved', (await c.v('settings')).feedPages === true)
  check('and pages come into the Feed', (await kinds()).includes('article'), (await kinds()).join())
  await toggle.click(); await c.h.waitForTimeout(600)
  check('off again, they go', !(await kinds()).includes('article'))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()

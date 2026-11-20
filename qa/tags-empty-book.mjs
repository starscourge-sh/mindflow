// On a fresh book with no tags yet, the Tags page is a place you can be: its heading in the sidebar is lit there,
// the one light, as every other page's row is.
//   QA_DATA=<empty folder> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/tags-empty-book.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= ''
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, seeded: false })
const { h, v } = c
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await v('settings:set', { sounds: false, hintRate: 0, rotCount: 0 })
  await h.waitForTimeout(1200)
  check('a fresh book has no tags', (await v('tags')).length === 0, JSON.stringify(await v('tags')))
  await h.locator('[data-tags-fold]').click()
  await h.waitForTimeout(900)
  const lit = await h.evaluate(() => [...document.querySelectorAll('aside [data-side-row][aria-current="page"]:not([inert] *)')].map((one) => (one.hasAttribute('data-tags-fold') ? 'Tags heading' : one.getAttribute('aria-label') || one.textContent.trim().slice(0, 30))))
  check('its "Tags" heading opens the Tags page and is lit there, the one light', lit.length === 1 && lit[0] === 'Tags heading', JSON.stringify(lit))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('ran to the end', false, error.stack.split('\n').slice(0, 3).join(' / '))
} finally {
  await c.close()
}
done()

// "Smooth scrolling" in a note's "…" menu turns the page's glide off and on for the whole app (11 Nov).
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/smooth-scroll-switch.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const smooth = () => h.evaluate(() => ({ word: document.documentElement.dataset.smoothScroll, lenis: !!document.querySelector('.lenis') }))
try {
  for (let i = 0; i < 60 && (await h.evaluate(() => document.body.innerText.includes('Setting out the examples'))); i++) await wait(500)
  await go('writing'); await wait(1500)
  check('on to start: pages glide', (await smooth()).word === 'on' && (await smooth()).lenis, JSON.stringify(await smooth()))
  const id = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Smooth' }] }] } }))
  await c.send('capture', id); await wait(1500)
  const menu = h.locator('[aria-label="More"], [aria-label="More actions"], [data-note-more]').last()
  await menu.click(); await wait(500)
  const item = h.locator('[data-smooth-scroll-toggle]')
  check('the note\'s "…" menu has "Smooth scrolling", ticked', (await item.count()) === 1 && (await item.locator('svg').count()) === 1)
  await item.click(); await wait(800)
  check('chosen, it turns the glide off app-wide', (await v('settings')).smoothScroll === false && (await smooth()).word === 'off' && !(await smooth()).lenis, JSON.stringify(await smooth()))
  check('the menu stays open, its tick gone', (await item.count()) === 1 && (await item.locator('svg').count()) === 0)
  await item.click(); await wait(800)
  check('chosen again, the glide is back', (await smooth()).word === 'on' && (await smooth()).lenis, JSON.stringify(await smooth()))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally { await c.close() }
done()

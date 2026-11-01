// "Read the back aloud" per tag: on a tag's page, a language chosen (by the Mac's own voices) says a line in it
// at once; in Review, a card with that tag (or one under it) has its answer said as it shows, without its #tags,
// and P says it again. Silent here: under HALIGTREE_QA_AWAY nothing is spoken, what would be is kept.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/read-aloud.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900 })
const { h } = c
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const said = () => h.evaluate(() => window.__readAloud ?? [])
try {
  check('a test run is quiet', await h.evaluate(() => window.api.quiet === true))
  await call('cards:list', [{ term: 'hello', meaning: 'hola #spanish-basics' }])
  await call('tag:set', 'spanish', {})
  await h.evaluate(() => window.api.openInHome('tag', 'spanish-basics'))
  // With the tag's other Review settings, under "Manage".
  await waitFor(() => h.evaluate(() => [...document.querySelectorAll('[role="tab"]')].some((one) => one.textContent === 'Manage')))
  await h.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((one) => one.textContent === 'Manage').click())
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-tag-speak]')))
    await h.evaluate(() => [...document.querySelectorAll('[data-tag-speak] button[aria-pressed]')].find((one) => one.getAttribute('aria-label') === 'Spanish')?.click())
  check('choosing a language keeps it for the tag', await waitFor(async () => (await call('tag:speak'))['spanish-basics'] === 'es'), JSON.stringify(await call('tag:speak')))
  check('and says a line in it, to hear the voice', await waitFor(async () => (await said()).some((one) => one.language === 'es')))
  if (process.env.QA_SHOTS) await h.screenshot({ path: join(process.env.QA_SHOTS, 'read-aloud-tag.png') })
  // In Review: study the tag, show the answer.
  await c.go('review', ':today')
  await h.evaluate(() => window.api.openInHome('study', 'spanish-basics'))
  await waitFor(() => h.evaluate(() => /hello/.test(document.querySelector('h2')?.textContent ?? '')))
  const before = (await said()).length
  await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('Space')
  check('the answer is said as it shows, without its #tags', await waitFor(async () => { const now = await said(); return now.length > before && now.at(-1).text === 'hola' && now.at(-1).language === 'es' }), JSON.stringify((await said()).at(-1)))
  const again = (await said()).length
  await h.keyboard.press('p')
  check('P says it again', await waitFor(async () => (await said()).length === again + 1))
  // Off again: nothing said.
  await call('tag:set', 'spanish-basics', { speak: null })
  check('"Off" stops it', !(await call('tag:speak'))['spanish-basics'])
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()

// Review's keys, as Anki users reach for them: Space shows the answer, E rewrites the question right there
// without leaving Review (Enter keeps it), 1 to 4 grade and the next card comes.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/review-keys.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900 })
const { h } = c
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
const asked = () => h.evaluate(() => document.querySelector('h2')?.textContent ?? '')
try {
  await c.go('review', ':today')
  await waitFor(async () => (await asked()).length > 3)
  const first = await asked()
  await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('e')
  check('E puts the question into editing, in place', await waitFor(() => h.evaluate(() => document.activeElement?.tagName === 'H2')))
  await h.keyboard.type('Rewritten in Review?')
  await h.keyboard.press('Enter')
  check('Enter keeps the new words', await waitFor(async () => (await h.evaluate(() => window.api.haligtree('items', 'nugget'))).some((one) => one.prompt === 'Rewritten in Review?')), first)
  await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('Space')
  check('Space shows the answer', await waitFor(() => h.evaluate(() => !!document.querySelector('.tiptap'))))
  await h.keyboard.press('3')
  check('3 grades it Good and the next card comes', await waitFor(async () => (await asked()) !== 'Rewritten in Review?'), await asked())
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()

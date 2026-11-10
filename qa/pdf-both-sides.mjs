// A PDF on its own in a wide window opens with both sides, the pages' rail at the left and Details at the right;
// at 560 wide the pages keep the room and Details waits. Says the widths it saw.
//   BOOK=/path/crime.pdf QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pdf-both-sides.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const BOOK = process.env.BOOK
const { check, done } = checks()
if (!BOOK) throw new Error('BOOK=/path/to/a.pdf')
const c = await sandbox({ width: 1600, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const sides = () => h.evaluate(() => ({ rail: !!document.querySelector('.pdf-reader .pdf-rail'), details: !!document.querySelector('.pdf-reader .read-details'), body: Math.round(document.querySelector('.pdf-reader-body')?.getBoundingClientRect().width ?? 0), inner: innerWidth }))
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const [book] = (await v('media:add', [{ path: BOOK }])).added
  await h.evaluate(() => localStorage.setItem('pdf-rail', ''))
  await h.evaluate((src) => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name: 'crime.pdf' } })), book.src)
  await wait(2500)
  check('opened in a wide window: both sides', ((s) => s.rail && s.details)(await sides()), JSON.stringify(await sides()))
  await h.reload(); await wait(3000)
  check('after a reload: both sides still', ((s) => s.rail && s.details)(await sides()), JSON.stringify(await sides()))
  await c.size(560, 400); await wait(1200)
  check('at 560 wide: Details waits', !(await sides()).details, JSON.stringify(await sides()))
  await c.size(1600, 900); await wait(1500)
  check('wide again: Details back', (await sides()).details, JSON.stringify(await sides()))
} finally {
  await c.close()
}
done()

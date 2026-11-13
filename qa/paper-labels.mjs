// In Paper, a small heading that only names a group stays in the text font, as Soft has it; titles keep the serif
// (the user, 13 Nov, the Tasks Matrix in Paper and in Soft: "why does the font get messed up when i go from soft to
// paper?": "Do now · 0 tasks" and the other three quadrants' labels came out in the display serif, cramped).
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/paper-labels.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, go, v } = c
const shots = process.env.QA_SHOTS
const serif = (family) => /Fraunces/i.test(family)
const wear = (style) => h.evaluate((style) => { if (style === 'soft') delete document.documentElement.dataset.style; else document.documentElement.dataset.style = style }, style)
// The Matrix's four labels, as drawn.
const labels = () => h.evaluate(() => [...document.querySelectorAll('[data-quadrant] h2')].map((one) => ({ text: one.textContent.replace(/\s+/g, ' ').trim(), family: getComputedStyle(one).fontFamily })))
// Headings of each kind, set into the page for a moment and read.
const kinds = () => h.evaluate(() => {
  const made = [
    ['a page title (h1)', '<h1>Title</h1>'],
    ['a large section heading (h2.text-title)', '<h2 class="text-title">Section</h2>'],
    ['a heading marked a title (h2.font-heading.text-heading)', '<h2 class="font-heading text-heading">Close the day</h2>'],
    ['a group label (h2.text-heading)', '<h2 class="text-heading">Do now</h2>'],
    ['a group label (h2.text-body)', '<h2 class="text-body">This week’s tasks</h2>'],
    ['a group label (h2.text-meta)', '<h2 class="text-meta">Overdue</h2>']
  ]
  const box = document.createElement('div')
  box.style.cssText = 'position:fixed;left:-9999px;top:0'
  box.innerHTML = made.map(([, html]) => html).join('')
  document.body.append(box)
  const read = [...box.children].map((one, i) => ({ kind: made[i][0], family: getComputedStyle(one).fontFamily }))
  box.remove()
  return read
})
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { pageHints: false })
  // The Matrix as its own page (Tasks › Today grouped by the Matrix shows the same four boxes).
  await go('matrix')
  await h.waitForSelector('[data-quadrant] h2', { timeout: 15000 })
  await h.waitForTimeout(400)
  await wear('paper')
  await h.waitForTimeout(300)
  const paper = await labels()
  if (shots) await h.screenshot({ path: `${shots}/matrix-paper.png` })
  await wear('soft')
  await h.waitForTimeout(300)
  const soft = await labels()
  if (shots) await h.screenshot({ path: `${shots}/matrix-soft.png` })
  check('Paper: the Matrix\'s four labels (and their counts) stay in the text font, as in Soft', paper.length === 4 && paper.every((one) => !serif(one.family)) && paper.every((one, i) => one.family === soft[i]?.family), JSON.stringify(paper.map((one) => [one.text, one.family.split(',')[0]])))
  await wear('paper')
  const read = await kinds()
  const want = (kind) => !/group label/.test(kind)
  check('Paper: titles keep the serif, group labels take the text font', read.every((one) => serif(one.family) === want(one.kind)), JSON.stringify(read.map((one) => [one.kind, one.family.split(',')[0]])))
  await wear('soft')
  const plain = await kinds()
  check('…each group label in Paper wears the font it wears in Soft', read.filter((one) => !want(one.kind)).every((one) => one.family === plain.find((other) => other.kind === one.kind)?.family), JSON.stringify(plain.map((one) => [one.kind, one.family.split(',')[0]])))
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, String(error?.message ?? error).split('\n')[0])
} finally {
  await c.close()
}
done()

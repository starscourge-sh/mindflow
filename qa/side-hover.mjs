// One hover, one surface, on the rows this pass added to the sidebar: Questions under Writing and a group
// after the folders, pointed at with a real pointer (its name, then its count): never a preview and a tip at
// once. And each shows the hand.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-wr2/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/side-hover.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 860 })
const { h, v, go, close, errors } = s
const floating = () => h.evaluate(() => [...document.querySelectorAll('[role="tooltip"]:not(:has([data-peek-card])), [data-peek-card]')].filter((one) => one.checkVisibility() && one.getBoundingClientRect().width > 0).length)
try {
  await v('settings:set', { hintRate: 0, smartGroups: [{ id: 'g1', list: 'article', name: 'Rome', tag: 'rome' }] })
  await h.evaluate(() => localStorage.setItem('sidebar:folders:article', 'true'))
  await go('articles')
  for (const [name, row] of [['Writing (a sibling, for comparison)', 'aside [data-side-row][aria-label="Writing"]'], ['Questions', 'aside [data-side-questions]'], ['the group', 'aside [data-side-group]']]) {
    const box = await h.locator(row).first().boundingBox()
    for (const [part, x] of [['name', box.x + 40], ['count', box.x + box.width - 14]]) {
      await h.mouse.move(5, 5)
      await h.waitForTimeout(400)
      await h.mouse.move(x, box.y + box.height / 2, { steps: 4 })
      await h.waitForTimeout(1300)
      const n = await floating()
      const cursor = await h.evaluate(([px, py]) => getComputedStyle(document.elementFromPoint(px, py)).cursor, [x, box.y + box.height / 2])
      check(`${name}, pointed at on its ${part}: at most one floating surface (${n})`, n <= 1, n)
      check(`${name}, on its ${part}: the hand`, cursor === 'pointer', cursor)
    }
  }
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()

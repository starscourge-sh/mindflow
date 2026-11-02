// Groups at scale: 5, 50 and 500 new pages in Writing, every five in a group, light and dark. The list draws, no two
// rows sit over each other, every group's panel holds its notes, and folding the first group is quick.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=<dir> node qa/groups-scale.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, v, go, close, errors } = s
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const M = '[role="main"]'
const overlaps = () => h.evaluate(() => {
  const boxes = [...document.querySelectorAll('[role="main"] [data-row], [role="main"] [data-group-row]')].map((el) => el.getBoundingClientRect()).filter((b) => b.height > 0)
  let bad = 0
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j]
    if (a.top < b.bottom - 1 && b.top < a.bottom - 1 && a.left < b.right - 1 && b.left < a.right - 1) bad++
  }
  return bad
})
try {
  await v('settings:set', { hintRate: 0 })
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'newest', group: 'none', filter: {}, density: 'list' })))
  let made = 0
  for (const n of [5, 50, 500]) {
    const ids = []
    for (; made < n; made++) {
      const id = await v('article:new')
      await v('item:save', id, { title: `Scale page ${made + 1} with a longer title that runs on past the middle of the row` })
      ids.push(id)
    }
    // Every five of the new ones in a group (a group is two or more).
    const before = (await v('groups', 'article')).filter((one) => !one.folder).length
    for (let at = 0; at + 1 < ids.length; at += 5) {
      const group = await v('groups:make', 'article', `Group of ${made} · ${at / 5 + 1}`, null, false)
      await v('groups:place', ids.slice(at, at + 5).map((id) => ({ id, group })))
    }
    const groups = (await v('groups', 'article')).filter((one) => !one.folder)
    await go('nuggets'); await go('articles'); await wait(1500)
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await s.theme('dark')
      else if (n !== 5) await s.theme('light')
      await go('nuggets'); await go('articles'); await wait(1200)
      if (shots) await h.screenshot({ path: `${shots}/scale-${n}-${theme}.png` })
      const panels = await h.evaluate(() => [...document.querySelectorAll('[role="main"] [data-group-block]:not([data-folder-row])')].map((el) => el.querySelectorAll('[data-row]').length))
      check(`${n} pages, ${theme}: groups drawn as panels with their notes inside (${groups.length - before} new, ${panels.length} on screen)`, panels.length > 0 && panels.every((k) => k >= 1), JSON.stringify(panels.slice(0, 6)))
      check(`${n} pages, ${theme}: no two rows drawn over each other`, (await overlaps()) === 0)
    }
    const first = h.locator(`${M} [data-group-block]:not([data-folder-row]) [data-group-row]`).first()
    const t0 = Date.now()
    await first.click()
    await wait(300)
    const took = Date.now() - t0
    check(`${n} pages: the first group folds (in ${took} ms)`, (await first.getAttribute('aria-expanded')) === 'false' && took < 1500)
    await first.click()
    await wait(300)
  }
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()

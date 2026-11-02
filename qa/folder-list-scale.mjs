// Pictures of the folder list at scale, light and dark, wide and at a phone's width (390): the sample book (12 pages,
// 4 folders), then 50 pages in 30 folders, then 500 pages in 30 folders. Each step also checks nothing runs off sideways.
//
//   QA_SHOTS=dir QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/folder-list-scale.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 860 })
const { h, v, go, close, errors } = s
const shots = process.env.QA_SHOTS
const shoot = async (name) => {
  for (const theme of ['light', 'dark']) {
    await s.theme(theme)
    for (const [w, hh] of [[1300, 860], [390, 844]]) {
      await s.size(w, hh)
      await go('nuggets')
      await go('articles')
      await h.waitForTimeout(700)
      const wide = await h.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      check(`${name}, ${theme}, ${w}px: nothing runs off sideways`, wide <= 0, wide)
      if (shots) await h.screenshot({ path: `${shots}/scale-${name}-${theme}-${w}.png` })
    }
  }
  await s.size(1300, 860)
}
try {
  await v('settings:set', { hintRate: 0 })
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'newest', group: 'none', filter: {}, density: 'list' })))
  await shoot('sample')
  const folders = []
  for (let i = 0; i < 26; i++) folders.push(await v('groups:make', 'article', i % 7 === 0 ? `Folder ${i + 1} with a rather long name that will not fit a phone` : `Folder ${i + 1}`, null))
  const add = async (n) => {
    const ids = []
    for (let i = 0; i < n; i++) {
      const id = await v('article:new')
      await v('item:save', id, { title: `Page ${i + 1} about something worth keeping` })
      ids.push(id)
    }
    // Half go into folders, the rest stay loose.
    await v('groups:place', ids.filter((_, at) => at % 2 === 0).map((id, at) => ({ id, group: folders[at % folders.length] })))
  }
  await add(38)
  await shoot('50-30')
  // The list's folders stand in the sidebar's order.
  const orders = await h.evaluate(() => {
    const list = [...document.querySelectorAll('[role="main"] [data-group-row]')].map((one) => one.getAttribute('data-group-row'))
    const side = [...document.querySelectorAll('aside [data-side-folder]')].map((one) => one.getAttribute('data-side-folder')).filter((id) => list.includes(id))
    return { list, side }
  })
  check('the list\'s folders stand in the sidebar\'s order', orders.list.length > 10 && orders.list.join() === orders.side.join(), JSON.stringify({ list: orders.list.length, side: orders.side.length }))
  await add(450)
  await shoot('500-30')
  // 5,000 pages: QA_BIG=1 (it takes minutes to make them one by one).
  if (process.env.QA_BIG) {
    await add(4500)
    await shoot('5000-30')
  }
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()

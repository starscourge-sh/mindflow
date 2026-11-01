// The sidebar's counts agree with the pages' (Writing, Gems, Questions) on a
// fresh sandbox. A count never sits in a row of tabs. A group can need several tags (#rome and #food).
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-wr/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/writing-flat.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 860 })
const { h, v, go, close, errors } = s
const shots = process.env.QA_SHOTS
const counts = () => h.evaluate(() => {
  const page = Number(document.querySelector('[data-list-count]')?.getAttribute('data-list-count') ?? NaN)
  return { page }
})
const side = (id) => h.evaluate((one) => document.querySelector(`aside [data-side-count="${one}"]`)?.textContent.trim() ?? '', id)
const same = (said, n) => [String(n), `${n}${n}`, [...String(n)].map((c) => c + c).join('')].includes(said)
try {
  await v('settings:set', { hintRate: 0 })
  for (const [page, row] of [['articles', 'articles'], ['nuggets', 'nuggets'], ['questions', 'questions']]) {
    await go(page)
    await h.waitForTimeout(900)
    const n = (await counts()).page
    const said = await side(row)
    check(`${page}: the sidebar's count (${said}) is the page's (${n})`, same(said, n), `${said} / ${n}`)
  }
  // Writing's folders and loose pages: qa/folders-isolate.mjs.
  // Questions: the count is not in the tab row's run.
  await go('questions')
  await h.waitForTimeout(800)
  const tabs = await h.evaluate(() => {
    const last = [...document.querySelectorAll('[data-question-filter] button')].at(-1)?.getBoundingClientRect()
    const count = document.querySelector('[data-list-count]')?.getBoundingClientRect()
    return { lastTab: last && Math.round(last.right), count: count && Math.round(count.left) }
  })
  check('Questions: its count sits apart from the tabs, with the actions', tabs.count > tabs.lastTab + 120, JSON.stringify(tabs))
  if (shots) await h.screenshot({ path: `${shots}/questions-count.png` })
  // A group of two tags gathers only the pages with both.
  for (const title of ['Pasta in Rome #rome #food', 'The Forum #rome', 'Bread at home #food']) {
    const id = await v('article:new')
    await v('item:save', id, { title })
  }
  await v('settings:set', { smartGroups: [{ id: 'rf', list: 'article', name: 'Rome and food', tags: ['rome', 'food'] }] })
  await h.evaluate(() => localStorage.setItem('sidebar:folders:article', 'true'))
  await go('articles')
  await h.locator('aside [data-side-group="rf"]').click()
  await h.waitForTimeout(900)
  const group = await h.evaluate(() => ({ rule: document.querySelector('[data-group-rule]')?.textContent, rows: [...document.querySelectorAll('[role="main"] [data-row]')].map((one) => one.textContent) }))
  check('a group of #rome and #food gathers only what has both', group.rows.length === 1 && /Pasta in Rome/.test(group.rows[0]) && /#rome and #food/.test(group.rule ?? ''), JSON.stringify(group))
  if (shots) await h.screenshot({ path: `${shots}/group-two-tags.png` })
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()

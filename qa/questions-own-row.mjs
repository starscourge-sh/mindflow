// Questions is a sidebar row of its own, with its own icon, beside Writing, not a child row hung
// under Writing's folders: a Writing folder called "Questions" (an Obsidian folder of that name)
// is then the only "Questions" under Writing, and the two can be told apart at a glance.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<dir> node qa/questions-own-row.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, errors } = c
const shots = process.env.QA_SHOTS
const shot = (name) => shots && h.screenshot({ path: `${shots}/${name}.png` }).catch(() => {})
try {
  const id = await v('article:new')
  await v('item:save', id, { title: 'Why is the sky blue' })
  await v('groups:arrange', 'article', { top: ['g:f-questions'], groups: { 'f-questions': [id] }, make: { id: 'f-questions', name: 'Questions' } })
  await h.waitForTimeout(900)
  // Writing's folders unfolded, so the folder called Questions shows.
  const fold = h.locator('aside [data-folders-fold="article"]')
  if ((await fold.getAttribute('aria-expanded').catch(() => 'true')) === 'false') await fold.click({ force: true })
  await h.waitForTimeout(500)
  const read = () => h.evaluate(() => {
    const page = [...document.querySelectorAll('aside [data-side-row][aria-label="Questions"]')]
    const folders = document.querySelector('aside [data-side-folders="article"]')
    return {
      pages: page.length,
      pageUnderWriting: page.some((one) => folders?.contains(one)),
      folder: !!document.querySelector('aside [data-side-folder="f-questions"]'),
      pageIcon: page[0]?.querySelector('svg, .mf-emoji-icon')?.outerHTML ?? '',
      folderIcon: document.querySelector('aside [data-folder-icon="f-questions"]')?.innerHTML ?? '',
      current: page[0]?.getAttribute('aria-current'),
      writingCurrent: document.querySelector('aside [data-side-row][aria-label="Writing"]')?.getAttribute('aria-current')
    }
  })
  const before = await read()
  await shot('sidebar')
  check('1. one Questions page row in the sidebar', before.pages === 1, before.pages)
  check('2. it is not hung under Writing\'s folders', !before.pageUnderWriting)
  check('3. the Writing folder named Questions still shows under Writing', before.folder)
  check('4. the page row and the folder have different icons', !!before.pageIcon && before.pageIcon !== before.folderIcon)
  await h.locator('aside [data-side-row][aria-label="Questions"]').click()
  await h.waitForTimeout(700)
  const on = await read()
  check('5. clicked, Questions is the row lit, not Writing', on.current === 'page' && on.writingCurrent !== 'page', JSON.stringify([on.current, on.writingCurrent]))
  await shot('questions-open')
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await c.close()
}
done()

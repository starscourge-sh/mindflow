// "Open folders on their page": Writing's folders unfold while Writing (or one
// of its folders) is open and fold away when you go elsewhere; Gems' the same;
// the tags follow the Tags page. The arrow still turns them by hand until you
// leave the page. Off, they stay as you left them. Its setting is in Settings,
// with a sample that changes as it is pointed at.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-p/main/index.js HALIGTREE_QA_AWAY=1 node qa/folders-auto.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1100, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)

const money = await v('groups:make', 'article', 'Money', null)
const quotes = await v('groups:make', 'nugget', 'Quotes', null)
await v('settings:set', { hintRate: 0, foldersFollow: true })
await wait(600)
const shown = (list) => h.evaluate((list) => {
  const box = document.querySelector(`aside [data-side-folders="${list}"]`)
  return !!box && !box.closest('[inert]') && box.getBoundingClientRect().height > 0
}, list)
const tagsShown = () => h.evaluate(() => document.querySelector('aside [data-tags-fold]')?.getAttribute('aria-expanded') === 'true')
const fold = (list) => h.locator(`aside [data-folders-fold="${list}"]`).first()

await c.go('today')
check('on: elsewhere, Writing\'s and Gems\' folders are folded', !(await shown('article')) && !(await shown('nugget')))
check('on: elsewhere, the tags are folded', !(await tagsShown()))
await c.go('articles')
check('on Writing, its folders unfold, and Gems\' stay folded', (await shown('article')) && !(await shown('nugget')))
await h.locator(`aside [data-side-folder="${money}"]`).first().click()
await wait(700)
check('in one of Writing\'s folders, they stay open', await shown('article'))
await fold('article').hover()
await fold('article').click()
await wait(500)
check('the arrow still folds them by hand on the page', !(await shown('article')))
await fold('article').hover()
await fold('article').click()
await wait(500)
check('and opens them again', await shown('article'))
await c.go('nuggets')
check('on Gems, Gems\' unfold and Writing\'s fold away', (await shown('nugget')) && !(await shown('article')))
await fold('nugget').hover()
await fold('nugget').click()
await wait(500)
await c.go('today')
await c.go('nuggets')
check('the hand is forgotten once you leave: back on Gems they are open', await shown('nugget'))
await c.go('tags')
check('on Tags, the tags unfold', await tagsShown())
await c.go('today')
check('and fold away when you leave', !(await tagsShown()))

await v('settings:set', { foldersFollow: false })
await wait(600)
await c.go('articles')
const wasOpen = await shown('article')
await c.go('today')
check('off: the folders stay as they were left when you go elsewhere', (await shown('article')) === wasOpen)

// The setting: beside "Show groups in the sidebar", its sample following the pointer.
await c.go('settings')
await h.evaluate(() => [...document.querySelectorAll('button')].find((one) => one.textContent.trim() === 'Appearance')?.click())
await wait(600)
const setting = h.locator('text=Open folders on their page').first()
check('Settings has "Open folders on their page"', (await setting.count()) === 1)
await v('settings:set', { foldersFollow: true })
await wait(400)
const sample = h.locator('[data-follow-sample]').first()
await sample.scrollIntoViewIfNeeded()
const gemsFolder = () => sample.evaluate((el) => getComputedStyle(el.children[3]).opacity)
const before = await gemsFolder()
await sample.hover()
await wait(400)
const after = await gemsFolder()
check('its sample opens Gems\' folder as it is pointed at', before === '0' && after === '1', `${before} → ${after}`)
await h.mouse.move(5, 5)

if (c.errors.length) console.log(c.errors.slice(0, 5).join('\n'))
await c.close()
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)

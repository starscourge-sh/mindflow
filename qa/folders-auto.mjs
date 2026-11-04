// "Open folders on their page": Writing's folders unfold as Writing (or one
// of its folders) opens, and going elsewhere never folds them; Gems' the same;
// the tags unfold with the Tags page. Only the arrow folds them. Off, they stay as you left them. Its setting is in Settings,
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

// Folded to start, so arriving has something to do.
await c.go('today')
for (const list of ['article', 'nugget']) if (await shown(list)) { await fold(list).hover(); await fold(list).click(); await wait(500) }
check('folded by hand, elsewhere', !(await shown('article')) && !(await shown('nugget')))
await c.go('articles')
check('on Writing, its folders unfold, and Gems\' stay folded', (await shown('article')) && !(await shown('nugget')))
await h.locator(`aside [data-side-folder="${money}"]`).first().click()
await wait(700)
check('in one of Writing\'s folders, they stay open', await shown('article'))
await c.go('nuggets')
check('on Gems, Gems\' unfold and Writing\'s stay open (a click elsewhere never folds a tab)', (await shown('nugget')) && (await shown('article')))
await c.go('today')
check('leaving for Today folds nothing', (await shown('nugget')) && (await shown('article')))
await fold('article').hover()
await fold('article').click()
await wait(500)
check('the arrow still folds them by hand', !(await shown('article')))
await c.go('inbox')
check('and they stay folded where the hand left them', !(await shown('article')))
await c.go('tags')
check('on Tags, the tags unfold', await tagsShown())
await c.go('today')
check('and stay open when you leave', await tagsShown())

await v('settings:set', { foldersFollow: false })
await wait(600)
await c.go('articles')
const wasOpen = await shown('article')
await c.go('today')
check('off: the folders stay as they were left when you go elsewhere', (await shown('article')) === wasOpen)

// The setting: beside "Show groups in the sidebar", its sample following the pointer.
await c.go('settings')
await h.click('[data-section="Appearance"]')
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
check('its sample opens Gems\' folder as it is pointed at, Writing\'s staying open', before === '0' && after === '1' && (await sample.evaluate((el) => getComputedStyle(el.children[1]).opacity)) === '1', `${before} → ${after}`)
await h.mouse.move(5, 5)

if (c.errors.length) console.log(c.errors.slice(0, 5).join('\n'))
await c.close()
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)

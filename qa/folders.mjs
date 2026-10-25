// Writing's and Gems' groups as folders in the sidebar (side-folders.tsx):
// the tree with its counts and fold, a click opening the group alone, New
// making a note inside it, the setting hiding it, and the icon changed and kept.
//
//   npx electron-vite build --outDir out-f
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-f/main/index.js HALIGTREE_QA_AWAY=1 node qa/folders.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

const c = await sandbox({ width: 1100, height: 760 })
try {
  const ids = []
  for (const title of ['Budget 2026', 'Pay rise notes', 'Rent in Lisbon', 'Rent in Porto', 'Startup ideas', 'App ideas', 'Loose one', 'Loose two']) {
    const id = await c.v('article:new')
    await c.v('item:save', id, { title })
    ids.push(id)
  }
  const [b1, b2, r1, r2, i1, i2, l1, l2] = ids
  // Money holds two notes and Rent (two more); Ideas holds two.
  const money = 'f-money', rent = 'f-rent', ideas = 'f-ideas'
  await c.v('groups:arrange', 'article', { top: [`g:${money}`, l1, l2], groups: { [money]: [b1, b2] }, make: { id: money, name: 'Money' } })
  await c.v('groups:arrange', 'article', { top: [`g:${money}`, `g:${ideas}`, l1, l2], groups: { [money]: [b1, b2], [ideas]: [i1, i2] }, make: { id: ideas, name: 'Ideas' } })
  await c.v('groups:arrange', 'article', { top: [`g:${money}`, `g:${ideas}`, l1, l2], groups: { [money]: [b1, b2, `g:${rent}`], [rent]: [r1, r2], [ideas]: [i1, i2] }, make: { id: rent, name: 'Rent' } })
  await c.h.waitForTimeout(800)

  const folder = (id) => c.h.locator(`[data-side-folder="${id}"]`)
  const text = async (id) => (await folder(id).textContent())?.trim()
  // A name and count are each drawn twice (Weighted, Count), one shown.
  const reads = async (id, name, n) => new RegExp(`^(${name})+(${n})+$`).test(await text(id))
  check('the tree shows Writing\'s groups', (await folder(money).count()) === 1 && (await folder(ideas).count()) === 1 && (await folder(rent).count()) === 1)
  check('Money counts its own notes and Rent\'s: 4', await reads(money, 'Money', 4), await text(money))
  check('Rent: 2, Ideas: 2', (await reads(rent, 'Rent', 2)) && (await reads(ideas, 'Ideas', 2)), `${await text(rent)} / ${await text(ideas)}`)
  const indent = async (id) => (await folder(id).evaluate((one) => parseFloat(getComputedStyle(one).paddingLeft)))
  check('a subgroup sits indented under its group', (await indent(rent)) > (await indent(money)), `${await indent(money)} → ${await indent(rent)}`)
  const countRight = await c.h.evaluate(([m]) => {
    const a = document.querySelector(`[data-side-folder="${m}"]`).lastElementChild.getBoundingClientRect().right
    const b = document.querySelector('[data-side-count]')?.getBoundingClientRect().right
    return [Math.round(a), Math.round(b ?? a)]
  }, [money])
  check('its count lines up on the right with the other sidebar counts', Math.abs(countRight[0] - countRight[1]) <= 1, countRight.join(' vs '))

  // The fold, kept.
  const writingRow = c.h.locator('[data-side-row][aria-label="Writing"]')
  await writingRow.hover()
  await c.h.locator('[data-folders-fold="article"]').click()
  await c.h.waitForTimeout(500)
  check('the chevron folds the folders away', !(await folder(money).isVisible()))
  check('folded is remembered', (await c.h.evaluate(() => localStorage.getItem('sidebar:folders:article'))) === 'shut')
  await c.h.reload()
  await c.h.waitForTimeout(1500)
  check('after a reload they stay folded', !(await folder(money).isVisible()))
  await writingRow.hover()
  await c.h.locator('[data-folders-fold="article"]').click()
  await c.h.waitForTimeout(500)
  check('and unfold again', await folder(money).isVisible())

  // A click opens the group alone, named in the header, marked in the sidebar.
  await folder(rent).click()
  await c.h.waitForTimeout(900)
  check('a click opens that group alone', (await c.h.locator(`[data-group-page="${rent}"]`).count()) === 1)
  check('its name is in the header', ((await c.h.locator('[data-group-page-back]').textContent()) ?? '').includes('Rent'))
  check('its row is marked as the page you are on', (await folder(rent).getAttribute('aria-current')) === 'page' && (await writingRow.getAttribute('aria-current')) === null)
  await c.h.waitForTimeout(600)
  check('it shows only its notes', (await c.h.locator('[data-group-note]').count()) === 2, `${await c.h.locator('[data-group-note]').count()}`)

  // New, inside.
  await c.h.locator('button[data-new]').click()
  await c.h.waitForTimeout(900)
  const rentNow = (await c.v('groups', 'article')).find((one) => one.id === rent)
  check('New in a folder makes the note there', rentNow?.members.length === 3, `${rentNow?.members.length}`)
  await folder(rent).click()
  await c.h.waitForTimeout(700)
  await c.h.waitForTimeout(1500)
  await c.h.keyboard.press('Meta+n')
  await c.h.waitForTimeout(900)
  check('⌘N there does too', (await c.v('groups', 'article')).find((one) => one.id === rent)?.members.length === 4)
  check('and Rent counts 4 now', await reads(rent, 'Rent', 4), await text(rent))

  // Back to everything.
  await folder(money).click()
  await c.h.waitForTimeout(700)
  await c.h.locator('[data-group-page-back]').click()
  await c.h.waitForTimeout(700)
  check('back goes to the whole list', (await c.h.locator('[data-group-page]').count()) === 0 && (await writingRow.getAttribute('aria-current')) === 'page')

  // The icon, changed from the sidebar and kept.
  await c.h.locator(`[data-folder-icon="${ideas}"]`).click()
  await c.h.waitForTimeout(400)
  await c.h.locator('[data-radix-popper-content-wrapper] button').nth(1).click()
  await c.h.waitForTimeout(500)
  const icon = (await c.v('groups', 'article')).find((one) => one.id === ideas)?.icon
  check('a click on the icon changes it', !!icon, `${icon}`)
  await c.h.reload()
  await c.h.waitForTimeout(1500)
  check('and it is kept after a reload', (await c.h.locator(`[data-folder-icon="${ideas}"] svg`).count()) === 1 && (await c.v('groups', 'article')).find((one) => one.id === ideas)?.icon === icon)

  // A row carried onto a folder goes in, with a toast and Undo; two picked go together.
  await c.go('articles')
  await c.h.waitForTimeout(800)
  const listRow = (title) => c.h.locator('[data-pane] [data-row][data-id]', { hasText: title }).first()
  const carryTo = async (from, to) => {
    await from.scrollIntoViewIfNeeded()
    await c.h.waitForTimeout(300)
    const a = await from.boundingBox()
    const b = await to.boundingBox()
    await c.h.mouse.move(a.x + 60, a.y + a.height / 2)
    await c.h.mouse.down()
    await c.h.mouse.move(a.x + 60, a.y + a.height / 2 + 8, { steps: 4 })
    await c.h.waitForTimeout(150)
    await c.h.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 24 })
    await c.h.waitForTimeout(500)
    const hot = await to.evaluate((one) => one.dataset.queueHot !== undefined)
    await c.h.mouse.up()
    await c.h.waitForTimeout(800)
    return hot
  }
  const membersOf = async (id) => (await c.v('groups', 'article')).find((one) => one.id === id)?.members ?? []
  const hot = await carryTo(listRow('Loose one'), folder(ideas))
  check('the folder lights while a row is over it', hot)
  check('let go, the note is in the folder', (await membersOf(ideas)).includes(l1))
  check('a toast says so', (await c.h.getByText('Moved note to Ideas').count()) > 0)
  await c.h.getByRole('button', { name: 'Undo' }).first().click()
  await c.h.waitForTimeout(800)
  check('Undo takes it back out', !(await membersOf(ideas)).includes(l1))
  await listRow('Loose one').click({ modifiers: ['Meta'] })
  await listRow('Loose two').click({ modifiers: ['Meta'] })
  await c.h.waitForTimeout(300)
  await carryTo(listRow('Loose two'), folder(money))
  const both = await membersOf(money)
  check('two picked rows go in together', both.includes(l1) && both.includes(l2), `${both.length}`)

  // The setting: off, the sidebar is as it was.
  const settings = await c.v('settings')
  await c.v('settings:set', { sidebarFolders: { ...settings.sidebarFolders, article: false } })
  await c.h.waitForTimeout(700)
  check('"Show groups in the sidebar" off hides Writing\'s folders', (await folder(money).count()) === 0 && (await c.h.locator('[data-folders-fold="article"]').count()) === 0)
  await c.v('settings:set', { sidebarFolders: { ...settings.sidebarFolders, article: true } })
  await c.h.waitForTimeout(700)
  check('on, they are back', (await folder(money).count()) === 1)
  check('no errors', c.errors.length === 0, c.errors.slice(0, 2).join(' | '))
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)

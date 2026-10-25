// Folders put in order in the sidebar (side-folders.tsx): carried, a folder
// is the app's own lifted row under the pointer (the browser's picture is
// blank); by another's top or bottom edge a line shows where it lands, and
// let go there it moves before or after it in your own order, at that one's
// level; ⌘Z puts it back. Over the middle it still goes inside.
//
//   npx electron-vite build --outDir out-r
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-r/main/index.js HALIGTREE_QA_AWAY=1 node qa/folder-reorder.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

const c = await sandbox({ width: 1100, height: 760 })
try {
  const ids = []
  for (const title of ['Budget 2026', 'Pay rise notes', 'Rent in Lisbon', 'Rent in Porto', 'Startup ideas', 'App ideas', 'Loose one']) {
    const id = await c.v('article:new')
    await c.v('item:save', id, { title })
    ids.push(id)
  }
  const [b1, b2, r1, r2, i1, i2, l1] = ids
  const money = 'f-money', rent = 'f-rent', ideas = 'f-ideas'
  await c.v('groups:arrange', 'article', { top: [`g:${money}`, l1], groups: { [money]: [b1, b2] }, make: { id: money, name: 'Money' } })
  await c.v('groups:arrange', 'article', { top: [`g:${money}`, `g:${rent}`, l1], groups: { [money]: [b1, b2], [rent]: [r1, r2] }, make: { id: rent, name: 'Rent' } })
  await c.v('groups:arrange', 'article', { top: [`g:${money}`, `g:${rent}`, `g:${ideas}`, l1], groups: { [money]: [b1, b2], [rent]: [r1, r2], [ideas]: [i1, i2] }, make: { id: ideas, name: 'Ideas' } })
  await c.go('articles')
  await c.h.waitForTimeout(900)

  const order = () => c.h.evaluate(() => [...document.querySelectorAll('[data-side-folders="article"] [data-side-folder]')].map((one) => one.dataset.sideFolder))
  const folder = (id) => c.h.locator(`[data-side-folder="${id}"]`)
  check('the sidebar shows the folders in your own order', (await order()).join() === [money, rent, ideas].join(), (await order()).join())

  /** Carry one folder to `at` (0 top, 1 bottom) of another; `hold` runs before letting go. */
  const carry = async (from, to, at, hold) => {
    const a = await folder(from).boundingBox()
    await c.h.mouse.move(a.x + 40, a.y + a.height / 2)
    await c.h.mouse.down()
    await c.h.mouse.move(a.x + 40, a.y + a.height / 2 + 6, { steps: 3 })
    const b = await folder(to).boundingBox()
    await c.h.mouse.move(b.x + 40, b.y + b.height * at, { steps: 12 })
    await c.h.waitForTimeout(200)
    if (hold) await hold()
    await c.h.mouse.up()
    await c.h.waitForTimeout(700)
  }

  // Ideas by Money's top edge: before it.
  await carry(ideas, money, 0.1, async () => {
    const seen = await c.h.evaluate(() => ({
      ghost: document.querySelector('[data-folder-ghost]')?.textContent ?? null,
      line: document.querySelector('[data-drop-line]')?.getAttribute('data-drop-line') ?? null
    }))
    check('carried, the folder is the app\'s own lifted row, named', seen.ghost === 'Ideas', JSON.stringify(seen))
    check('by a folder\'s top edge, a line says it lands before it', seen.line === 'before', JSON.stringify(seen))
  })
  check('let go there, it moves before Money', (await order()).join() === [ideas, money, rent].join(), (await order()).join())
  check('and the ghost and line are gone', (await c.h.locator('[data-folder-ghost], [data-side-folders] [data-drop-line]').count()) === 0)
  const saved = await c.v('notes:order', 'article')
  check('kept in your own order', saved.indexOf(`g:${ideas}`) < saved.indexOf(`g:${money}`), saved.filter((one) => one.startsWith('g:')).join())
  check('its notes stay in it', (await c.v('groups', 'article')).find((one) => one.id === ideas)?.members.length === 2)

  await c.h.mouse.move(700, 400)
  await c.h.keyboard.press('Meta+z')
  await c.h.waitForTimeout(800)
  check('⌘Z puts it back', (await order()).join() === [money, rent, ideas].join(), (await order()).join())

  // Rent by Money's bottom edge... Ideas after Money: between Money and Rent.
  await carry(ideas, money, 0.9)
  check('by a bottom edge, after it', (await order()).join() === [money, ideas, rent].join(), (await order()).join())

  // Into Money by its middle (it still nests), then Rent by Ideas' top edge inside Money: Money's own, before Ideas.
  await carry(ideas, money, 0.5)
  check('over the middle, it still goes inside', (await c.v('groups', 'article')).find((one) => one.id === ideas)?.parent === money)
  await carry(rent, ideas, 0.1)
  const rentNow = (await c.v('groups', 'article')).find((one) => one.id === rent)
  check('by the edge of a folder inside another, it goes in beside it, before it', rentNow?.parent === money && (await order()).join() === [money, rent, ideas].join(), `${rentNow?.parent} ${(await order()).join()}`)
} catch (error) {
  check('ran to the end', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)

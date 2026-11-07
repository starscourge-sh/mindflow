// What a drag in a kept list means, from a tester's report: a note dragged to
// the left to take it out of its folder made a new folder of it and the note
// it was let go on. Now:
//  - a quick drag over another row's middle only moves it (a line shows, no folder forms);
//  - carried left, out of its folder's rows, it leaves the folder and lands just under it
//    (short of the page's edge: there a row is offered to open beside, split-drop's own place);
//  - only resting on a row's middle makes a folder, and it says so before letting go
//    (the row lit, "New folder with ..." by the pointer), then a toast with Undo;
//  - that Undo takes the folder away again.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/drag-intent.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const SHOTS = process.env.SHOTS ?? ''
const shot = (name) => SHOTS && h.screenshot({ path: `${SHOTS}/${name}.png` })
const TITLES = ['Alpha study', 'Beta study', 'Gamma study', 'Loose one', 'Loose two']
const c = await sandbox({ width: 1200, height: 1000 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const ids = {}
const row = (title) => h.locator('button[data-row]:not([data-lifted] *)', { hasText: title }).first()
const said = () => h.evaluate(() => document.querySelector('[data-drag-label]')?.textContent ?? '')
const previews = () => h.locator('[data-preview]').count()
const lines = () => h.locator('[data-drop-line]').count()
const groups = () => v('groups', 'article')
const groupOf = async (id) => (await groups()).find((one) => one.members.includes(id))?.id ?? null
const toastText = () => h.evaluate(() => [...document.querySelectorAll('[role=status], [data-sonner-toast]')].map((one) => one.textContent).join(' | '))

/** A folder, Music Studies, holding three notes, and two loose notes under it. */
async function scene() {
  for (const group of await groups()) await v('groups:delete', group.id)
  await v('groups:arrange', 'article', {
    // Ours first, the sandbox's own pages after them.
    top: ['g:mu', ids['Loose one'], ids['Loose two'], ...(await v('items', 'article')).map((one) => one.id).filter((id) => !Object.values(ids).includes(id))],
    groups: { mu: [ids['Alpha study'], ids['Beta study'], ids['Gamma study']] },
    revive: [{ id: 'mu', name: 'Music Studies', icon: null, color: null, folded: 0, folder: 0 }]
  })
  await c.go('articles')
  await wait(900)
}

/** Take hold of a row and carry it to `at` (0 top, 1 bottom) of another, `left` pixels to the left of where it was held. */
async function carry(from, to, at, left = 0) {
  const a = await row(from).boundingBox()
  const b = await row(to).boundingBox()
  await h.mouse.move(a.x + 220, a.y + a.height / 2)
  await h.mouse.down()
  await h.mouse.move(a.x + 220, a.y + a.height / 2 + (b.y < a.y ? -8 : 8), { steps: 4 })
  await h.mouse.move(a.x + 220 - left, b.y + b.height * at, { steps: 16 })
}

try {
  await c.theme('light')
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  for (const title of TITLES) {
    ids[title] = await v('article:new')
    await v('item:save', ids[title], { title })
  }
  await scene()

  // 1. A quick drag across a loose row's middle: a move, never a folder.
  await carry('Loose two', 'Loose one', 0.32)
  await wait(120)
  await shot('quick')
  check('a quick pass over a row\'s middle shows a drop line, no folder', (await lines()) === 1 && (await previews()) === 0 && !/folder/i.test(await said()), `${await said()}, ${await lines()} line, ${await previews()} preview`)
  await h.mouse.up()
  await wait(700)
  let list = await groups()
  const top = await h.evaluate(() => [...document.querySelectorAll('[data-row]:not([data-lifted] *)')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map((one) => one.textContent).filter((t) => /Loose/.test(t)).map((t) => t.match(/Loose (one|two)/)[0]))
  check('let go there, it reorders and makes no folder', list.length === 1 && top.join('|') === 'Loose two|Loose one', `${list.length} folders, ${top.join(' | ')}`)

  // 2. The tester's case: a note in a folder, quickly over its neighbour's middle: moved, no folder inside the folder.
  await scene()
  await carry('Gamma study', 'Alpha study', 0.55)
  await wait(120)
  check('inside a folder, a quick pass says a move', (await previews()) === 0 && !/folder/i.test(await said()), await said())
  await h.mouse.up()
  await wait(700)
  list = await groups()
  check('let go, still one folder, the note still in it', list.length === 1 && (await groupOf(ids['Gamma study'])) === 'mu', `${list.length} folders`)

  // 3. Carried to the left over its own folder's rows: out of the folder.
  await scene()
  await carry('Beta study', 'Alpha study', 0.5, 70)
  await wait(150)
  await shot('left')
  check('carried left, it says it leaves the folder, and no folder forms', (await said()) === 'Remove from Music Studies' && (await previews()) === 0, await said())
  await wait(900)
  check('held there, it still only leaves the folder', (await said()) === 'Remove from Music Studies' && (await previews()) === 0, await said())
  await h.mouse.up()
  await wait(700)
  list = await groups()
  const layoutTop = await h.evaluate(() => [...document.querySelectorAll('[data-row]:not([data-lifted] *), [data-group-row]')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map((one) => (one.dataset.groupRow ? 'folder' : one.textContent.match(/^\S+ study|Loose (one|two)/)?.[0])).filter(Boolean))
  check('let go, it is out of the folder, just under it, and no folder was made', list.length === 1 && (await groupOf(ids['Beta study'])) === null && layoutTop.indexOf('Beta study') === layoutTop.lastIndexOf('Gamma study') + 1, `${list.length} folders, ${layoutTop.join(' | ')}`)

  // 4. Resting on a row's middle: first a move, then the row lights and says the folder, then the folder.
  await scene()
  await carry('Loose two', 'Loose one', 0.5)
  await wait(150)
  check('just arrived on the middle, not yet a folder', (await previews()) === 0 && !/folder/i.test(await said()), await said())
  await wait(800)
  await shot('rested')
  check('rested there, the row lights and the label names the folder to be', (await previews()) === 1 && (await said()) === 'New folder with Loose one', await said())
  await h.mouse.up()
  await wait(900)
  list = await groups()
  const made = list.find((one) => one.id !== 'mu')
  check('let go, a folder of the two forms', list.length === 2 && made?.members.length === 2, `${list.length} folders`)
  const words = await toastText()
  check('and a toast says a folder was made, with Undo', /Made a new folder/.test(words) && /Undo/.test(words), words)

  // 5. Its Undo takes the folder away and puts both notes back.
  await h.locator('[data-sonner-toast] button, [role=status] button', { hasText: 'Undo' }).first().click()
  await wait(900)
  list = await groups()
  check('Undo takes the folder made by the drop away again', list.length === 1 && (await groupOf(ids['Loose one'])) === null && (await groupOf(ids['Loose two'])) === null, `${list.length} folders`)
} finally {
  if (c.errors.length) console.log(c.errors.join('\n'))
  await c.close()
}
done()

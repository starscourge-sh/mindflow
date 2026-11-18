// The handover's list asks walked by the pointer (asks 2, 18, 24, 25): Writing's "New folder" beside "New page", and a
// right-click on the list's empty space offering New page, New folder and Sort; a group made a folder and back from
// its right-click menu; Separate saying it takes the groups in a group out too; a goal made someday from its menu.
//   QA_DATA=<copy of sandbox-seed.noindex/c-tip> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/handover-menus.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.SHOTS
const M = '[role="main"]'
const menu = () => h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((one) => one.textContent.trim()))
const choose = async (label) => {
  const item = h.locator('[role="menu"] [role="menuitem"]', { hasText: label }).first()
  const box = await item.boundingBox()
  await h.mouse.move(box.x + 12, box.y + box.height / 2)
  await wait(120)
  await h.mouse.click(box.x + 12, box.y + box.height / 2)
  await wait(600)
}
const rightClick = async (selector, at) => {
  const box = await h.locator(selector).first().boundingBox()
  const x = at?.x ?? box.x + box.width / 2
  const y = at?.y ?? box.y + box.height / 2
  await h.mouse.click(x, y, { button: 'right' })
  await wait(500)
}
const toastSaid = () => h.evaluate(() => [...document.querySelectorAll('[data-toast], [role="status"]')].map((one) => one.textContent.trim()).filter(Boolean).join(' | '))

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'newest', group: 'none', filter: {}, density: 'list' })))
  await go('articles')
  await wait(800)

  // Ask 2: "New folder" beside "New page".
  const header = await h.evaluate(() => {
    const page = document.querySelector('[data-new-writing]')?.getBoundingClientRect()
    const folder = document.querySelector('[data-new-folder]')?.getBoundingClientRect()
    return page && folder ? { page: Math.round(page.right), folder: Math.round(folder.left), same: Math.abs(page.top - folder.top) < 2 } : null
  })
  check('2: Writing has "New folder" beside "New page"', !!header && header.same && header.folder >= header.page, JSON.stringify(header))
  if (shots) for (const look of ['light', 'dark']) (await c.look(look), await h.screenshot({ path: `${shots}/02-writing-${look}.png`, clip: { x: 0, y: 0, width: 1300, height: 220 } }))
  await c.look('light')

  // Ask 2: the list's own right-click, on its empty space under the rows.
  const before = (await v('groups', 'article')).length
  const space = await h.locator(`${M} [data-list-space]`).boundingBox()
  await h.mouse.click(space.x + space.width / 2, space.y + space.height - 30, { button: 'right' })
  await wait(500)
  const lines = await menu()
  check('2: a right-click on the list\'s empty space offers New page, New folder and Sort', ['New page', 'New folder', 'Sort'].every((one) => lines.some((line) => line.startsWith(one))), lines.join(' | '))
  if (shots) await h.screenshot({ path: `${shots}/02-list-menu.png` })
  await choose('New folder')
  await h.keyboard.press('Escape')
  await wait(400)
  check('2: its "New folder" makes a folder in Writing', (await v('groups', 'article')).length === before + 1, `${before} → ${(await v('groups', 'article')).length}`)
  await h.mouse.click(space.x + space.width / 2, space.y + space.height - 30, { button: 'right' })
  await wait(500)
  await choose('Sort')
  await choose('A to Z')
  const sorted = await h.evaluate(() => JSON.parse(localStorage.getItem('view:article') ?? '{}').sort)
  check('2: its "Sort", "A to Z" sorts the list', sorted === 'name', String(sorted))
  await h.keyboard.press('Escape')

  // Ask 24: a group made a folder, and back.
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  const all = await v('groups', 'article')
  const group = all.find((one) => !one.folder && !one.parent)
  if (!group) check('24: the sandbox has a group in Writing to convert', false, all.map((one) => `${one.name}:${one.folder}`).join(', '))
  else {
    await go('nuggets')
    await go('articles')
    await wait(900)
    await rightClick(`${M} [data-group-row="${group.id}"]`)
    const groupMenu = await menu()
    check(`24: ${group.name}'s menu offers "Make it a folder"`, groupMenu.some((one) => one.startsWith('Make it a folder')), groupMenu.join(' | '))
    if (shots) await h.screenshot({ path: `${shots}/24-group-menu.png` })
    await choose('Make it a folder')
    const made = (await v('groups', 'article')).find((one) => one.id === group.id)
    check(`24: ${group.name} is a folder now, said with Undo`, made?.folder === 1 && /is a folder now/.test(await toastSaid()), JSON.stringify({ folder: made?.folder, said: await toastSaid() }))
    await wait(500)
    await rightClick(`${M} [data-group-row="${group.id}"]`)
    const folderMenu = await menu()
    check(`24: as a folder its menu offers "Make it a group"`, folderMenu.some((one) => one.startsWith('Make it a group')), folderMenu.join(' | '))
    await choose('Make it a group')
    const back = (await v('groups', 'article')).find((one) => one.id === group.id)
    check(`24: ${group.name} is a group again`, back?.folder === 0, JSON.stringify(back))
  }

  // Ask 25: Separate on a group holding a group says it takes that out too.
  const now = await v('groups', 'article')
  const outer = now.find((one) => !one.folder && now.some((sub) => sub.parent === one.id && !sub.folder))
  if (outer) {
    await go('nuggets')
    await go('articles')
    await wait(900)
    await rightClick(`${M} [data-group-row="${outer.id}"]`)
    const sep = await menu()
    check(`25: Separate on ${outer.name}, which holds a group, says the groups in it stay in the list`, sep.some((one) => one.includes('Separate') && one.includes('and the groups in it stay in the list')), sep.join(' | '))
    await h.keyboard.press('Escape')
  } else console.log('(25: no group holding a group in this sandbox; its words were not read)')

  // Ask 18: a dated goal made someday from its right-click menu.
  await go('goals')
  await wait(900)
  const goal = (await v('items', 'goal')).find((one) => one.goalAt && !one.closedAt)
  const row = h.locator(`${M} button, ${M} [role="button"], ${M} [data-row]`, { hasText: goal.title }).first()
  const at = await row.boundingBox()
  await h.mouse.click(at.x + 40, at.y + at.height / 2, { button: 'right' })
  await wait(500)
  const goalMenu = await menu()
  check('18: a dated goal\'s right-click menu offers "Make it someday"', goalMenu.some((one) => one.startsWith('Make it someday')), goalMenu.join(' | '))
  if (shots) await h.screenshot({ path: `${shots}/18-goal-menu.png` })
  await choose('Make it someday')
  const after = (await v('items', 'goal')).find((one) => one.id === goal.id)
  check('18: "Make it someday" takes its day away, said as the panel says it', !after?.goalAt && /No day now/.test(await toastSaid()), JSON.stringify({ goalAt: after?.goalAt, said: await toastSaid() }))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, error.stack?.split('\n').slice(0, 4).join(' | '))
} finally {
  await c.close()
}
done()

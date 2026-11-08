// "Move group and notes to the Bin": the group, its subgroup and every note in them go, with one notice and one Undo that
// brings it all back as it was. Separate still keeps the notes; a folder's menu and an empty group's don't offer it.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=/abs/dir node qa/group-to-bin.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 880 })
const { h, v, go, close } = s
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const M = '[data-pane]'
const head = (id) => h.locator(`${M} [data-group-row="${id}"]`).first()
const ITEM = '[data-group-bin]'
const state = async (ids, id) => {
  const items = new Set((await v('items', 'article')).map((one) => one.id))
  const groups = await v('groups', 'article')
  return { live: ids.filter((one) => items.has(one)).length, group: groups.find((one) => one.id === id), sub: groups.find((one) => one.name === 'Inner') }
}
try {
  await v('settings:set', { hintRate: 0 })
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  const groups = await v('groups', 'article')
  const inFolders = new Set(groups.flatMap((one) => one.members))
  const ids = []
  for (const title of ['Outer one', 'Outer two', 'Inner one', 'Inner two']) { const id = await v('article:new'); await v('item:save', id, { title }); ids.push(id) }
  const loose = (await v('items', 'article')).filter((one) => !inFolders.has(one.id) && !ids.includes(one.id) && !one.archivedAt).map((one) => one.id)
  const outer = await v('groups:make', 'article', 'Outer', null, false)
  const inner = await v('groups:make', 'article', 'Inner', outer, false)
  const empty = await v('groups:make', 'article', 'Nothing yet', null, false)
  await v('groups:arrange', 'article', { top: [`g:${outer}`, `g:${empty}`, ...groups.filter((one) => !one.parent).map((one) => `g:${one.id}`), ...loose], groups: { [outer]: [ids[0], ids[1], `g:${inner}`], [inner]: [ids[2], ids[3]] } })
  await go('articles')
  await wait(1000)
  await head(outer).click({ button: 'right' })
  await wait(300)
  if (shots) await h.screenshot({ path: `${shots}/menu.png` })
  const item = h.locator(ITEM)
  check('the group\'s menu offers "Delete group", saying its notes go to the Bin too', /^Delete group\s*Its notes go to the Bin too$/.test((await item.innerText()).trim()), await item.innerText())
  const box = await item.boundingBox()
  const menu = await h.locator('[role="menu"]').first().boundingBox()
  check('its words and hint fit inside the menu', box.height < 56 && box.x + box.width <= menu.x + menu.width, JSON.stringify(box))
  await item.click()
  await wait(1000)
  if (shots) await h.screenshot({ path: `${shots}/binned.png` })
  let now = await state(ids, outer)
  check('every note in it goes, the subgroup\'s too', now.live === 0, now.live)
  check('the group and its subgroup go', !now.group && !now.sub)
  const bin = await v('bin:list')
  check('all four are in the Bin', ids.every((id) => bin.some((one) => one.id === id)), bin.length)
  check('one notice, with the number and Undo', await h.getByText('Moved 4 to the Bin').count() === 1)
  await h.keyboard.press('Meta+z')
  await wait(1200)
  if (shots) await h.screenshot({ path: `${shots}/undone.png` })
  now = await state(ids, outer)
  check('⌘Z: every note is back', now.live === 4, now.live)
  check('⌘Z: the group is back, with its subgroup in it', !!now.group && now.sub?.parent === outer || now.sub?.parentId === outer, JSON.stringify(now.sub))
  const fresh = await v('groups', 'article')
  const count = (id) => fresh.find((one) => one.id === id)?.members?.filter((one) => ids.includes(one)).length
  check('each note is back in its own group', count(outer) === 2 && count(inner) === 2, `${count(outer)}, ${count(inner)}`)
  await head(empty).click({ button: 'right' }); await wait(300)
  check('an empty group offers a plain "Delete group", nothing to send to the Bin', (await item.innerText()).trim() === 'Delete group')
  await h.keyboard.press('Escape'); await wait(200)
  const folder = groups.find((one) => one.name === 'History')
  await head(folder.id).click({ button: 'right' }); await wait(300)
  check('a folder\'s menu says "Delete folder" (its notes to the Bin) and "Delete folder, keep its notes"', /^Delete folder\s*Its notes go to the Bin too$/.test((await item.innerText()).trim()) && /^Delete folder, keep its notes\s*They move up a level$/.test((await h.locator('[data-folder-delete]').innerText()).trim()))
  await h.keyboard.press('Escape'); await wait(200)
  await head(outer).hover(); await wait(300)
  await h.locator(`${M} [data-group-block="${outer}"] [data-group-separate]`).first().click(); await wait(1300)
  const after = await state(ids, outer)
  check('Separate still keeps the notes', after.live === 4 && !after.group, JSON.stringify(after.live))
} finally {
  await close()
}
done()

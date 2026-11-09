// "Rename…" on a group that only counts ("Group 4") offers Apple Intelligence's name for it in the open field, as a
// new group does: picked, so typing replaces it; Enter keeps it; Esc keeps the old name. A group with a real name is
// left alone. Faked answers (HALIGTREE_QA_GROUP_NAME, items-view.tsx onRenaming), never the real model.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js QA_ARGS=--sandbox HALIGTREE_QA_AWAY=1 node qa/group-rename-ai.mjs
process.env.HALIGTREE_QA_CAPS ??= 'ai'
process.env.HALIGTREE_QA_GROUP_NAME ??= 'Data Tools'
const { checks } = await import('./harness.mjs')
const { sandbox } = await import('./sandbox-lib.mjs')

const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 880 })
const { h, v, go, close, errors } = s
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const FIELD = '[data-name-in-place]'
const OFFER = process.env.HALIGTREE_QA_GROUP_NAME
const value = () => h.evaluate((sel) => document.querySelector(sel)?.value ?? null, FIELD)
const picked = () => h.evaluate((sel) => { const f = document.querySelector(sel); return !!f && f.selectionStart === 0 && f.selectionEnd === f.value.length }, FIELD)
const names = async () => (await v('groups', 'article')).map((one) => one.name)
const head = (name) => h.locator('[data-pane] [data-group-row]', { hasText: name }).first()
const rename = async (name) => {
  await head(name).click({ button: 'right' })
  await wait(400)
  await h.locator('[role="menuitem"]', { hasText: 'Rename…' }).first().click()
  // The field takes the keys once the menu has gone: what is typed from then on goes into it.
  const at = Date.now()
  await h.waitForFunction((sel) => document.activeElement?.matches(sel), FIELD, { timeout: 3000 }).catch(() => {})
  return Date.now() - at
}
try {
  await v('settings:set', { hintRate: 0, sounds: false })
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  // Two groups made as a drop would leave them: one named only by its count, one with a name of its own.
  const groups = await v('groups', 'article')
  const inFolders = new Set(groups.flatMap((one) => one.members))
  const make = async (titles) => { const ids = []; for (const title of titles) { const id = await v('article:new'); await v('item:save', id, { title }); ids.push(id) } return ids }
  const counted = await make(['Apples and pears', 'Quarterly invoices'])
  const named = await make(['Tide tables', 'Moon phases'])
  const loose = (await v('items', 'article')).filter((one) => !inFolders.has(one.id) && ![...counted, ...named].includes(one.id) && !one.archivedAt).map((one) => one.id)
  const kept = groups.filter((one) => !one.parent).map((one) => `g:${one.id}`)
  await v('groups:arrange', 'article', { top: ['g:qa-count', ...kept, ...loose], groups: { 'qa-count': counted }, make: { id: 'qa-count', name: 'Group 4' } })
  await v('groups:arrange', 'article', { top: ['g:qa-count', 'g:qa-named', ...kept, ...loose], groups: { 'qa-count': counted, 'qa-named': named }, make: { id: 'qa-named', name: 'Sea' } })
  await go('articles')
  await wait(1000)
  check('both groups are in the list', await head('Group 4').count() === 1 && await head('Sea').count() === 1, (await names()).join())

  // 1. Rename… on "Group 4": the field opens on its name at once, then the offer arrives in it, picked.
  await rename('Group 4')
  const first = await value()
  check('"Rename…" opens the name in place at once, on its own name', first === 'Group 4', first)
  if (shots) await h.screenshot({ path: `${shots}/rename-first.png` })
  await wait(700)
  check('Apple Intelligence\'s name arrives in the open field', (await value()) === OFFER, await value())
  check('it is picked, so typing replaces it', await picked())
  if (shots) await h.screenshot({ path: `${shots}/rename-offered.png` })
  // Esc: nothing changes.
  await h.keyboard.press('Escape'); await wait(500)
  check('Esc keeps the old name', (await names()).includes('Group 4') && !(await names()).includes(OFFER), (await names()).join())
  check('and the field closes', (await value()) === null)

  // 2. Again, and Enter keeps the offer.
  await rename('Group 4')
  await wait(700)
  check('asked again, the offer comes again', (await value()) === OFFER, await value())
  await h.keyboard.press('Enter'); await wait(600)
  check('Enter keeps it', (await names()).includes(OFFER) && !(await names()).includes('Group 4'), (await names()).join())
  check('the row says it', await head(OFFER).count() === 1)

  // 3. Back to a counted name, then typed over before the answer: never overwritten.
  await v('groups:set', 'qa-count', { name: 'Group 4' })
  await go('articles'); await wait(800)
  const took = await rename('Group 4')
  check('the field has the keys as the menu closes', took < 600, `${took}ms`)
  await h.keyboard.type('Fruit', { delay: 15 })
  await wait(800)
  check('what you type is never overwritten by the offer', (await value()) === 'Fruit', await value())
  await h.keyboard.press('Enter'); await wait(500)
  check('and what you typed is kept', (await names()).includes('Fruit'), (await names()).join())

  // 4. A group with a name of its own: no offer.
  await rename('Sea')
  await wait(900)
  check('a group with a real name is not offered another', (await value()) === 'Sea', await value())
  await h.keyboard.press('Escape'); await wait(400)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()

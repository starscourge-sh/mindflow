// A group is named from its notes by the Mac's own model, the way the real one answers: a name, then a line on why
// ("Ambition and Habits \nall explore human struggles", 19 Nov). A "Group 3" already in the list is named as the list
// opens; a new group made with ⌘G takes the name in its open field, picked for typing; one whose field was left before
// the answer still takes it. Real pointer and keys only.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-q2/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/group-ai-name.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

process.env.HALIGTREE_QA_CAPS = 'ai'
process.env.HALIGTREE_QA_GROUP_NAME = 'Ambition and Habits  \nall explore human struggles'
process.env.HALIGTREE_QA_GROUP_NAME_MS = '1200'
const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, v, go, close } = s
const wait = (ms) => h.waitForTimeout(ms)
const nameOf = async (id) => (await v('groups', 'article')).find((one) => one.id === id)?.name
const page = async (title) => { const id = await v('article:new'); await v('item:save', id, { title }); return id }
try {
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  // 1. A "Group 3" made before, named as the list opens.
  const old = [await page('On ambition and failure'), await page('On habits and addiction')]
  const before = await v('groups', 'article')
  const loose = (await v('items', 'article')).filter((one) => !before.some((g) => g.members.includes(one.id)) && !old.includes(one.id)).map((one) => one.id)
  await v('groups:arrange', 'article', { top: ['g:qa-old', ...before.filter((one) => !one.parent).map((one) => `g:${one.id}`), ...loose], groups: { ...Object.fromEntries(before.map((one) => [one.id, one.members])), 'qa-old': old }, make: { id: 'qa-old', name: 'Group 3' } })
  await go('home'); await go('articles'); await wait(2600)
  check('a "Group 3" already there is named from its notes as the list opens', (await nameOf('qa-old')) === 'Ambition and Habits', await nameOf('qa-old'))
  // Each name once in a list: the next group may take the same answer only once this one is called something else.
  await v('groups:set', 'qa-old', { name: 'Kept apart one' })

  // 2. ⌘G on two picked pages: the field opens, and the model's name arrives in it, picked.
  const two = [await page('Courage at dawn'), await page('Fear before sleep')]
  await go('home'); await go('articles'); await wait(1200)
  const row = (id) => h.locator(`[role="main"] [data-sortable-id="${id}"]`)
  // Picked as the list picks (⌘-click each), the pointer then away from them, as qa/groups.mjs does.
  await row(two[0]).click({ modifiers: ['Meta'] }); await row(two[1]).click({ modifiers: ['Meta'] }); await h.mouse.move(900, 700)
  await h.keyboard.press('Meta+g'); await wait(400)
  const field = () => h.evaluate(() => { const f = document.querySelector('[role="main"] [data-name-in-place]'); return f && document.activeElement === f ? { value: f.value, picked: f.selectionEnd - f.selectionStart } : null })
  const at = await field()
  check('⌘G opens the new group\'s name for typing', !!at, JSON.stringify(at))
  await wait(1500)
  const later = await field()
  check('the model\'s name arrives in the open field, its first line only', later?.value === 'Ambition and Habits', JSON.stringify(later))
  check('and is picked, so typing replaces it', later?.picked === 'Ambition and Habits'.length, JSON.stringify(later))
  await h.keyboard.press('Enter'); await wait(700)
  const made = (await v('groups', 'article')).find((one) => one.members.includes(two[0]))
  check('Enter keeps it', made?.name === 'Ambition and Habits', made?.name)
  if (made) await v('groups:set', made.id, { name: 'Kept apart two' })

  // 3. A new group whose field is left before the answer: it takes the name all the same.
  const three = [await page('Patience with friends'), await page('Anger in winter')]
  await go('home'); await go('articles'); await wait(1200)
  // Picked as the list picks (⌘-click each), the pointer then away from them, as qa/groups.mjs does.
  await row(three[0]).click({ modifiers: ['Meta'] }); await row(three[1]).click({ modifiers: ['Meta'] }); await h.mouse.move(900, 700)
  await h.keyboard.press('Meta+g'); await wait(300)
  await h.keyboard.press('Enter'); await wait(2200)
  const left = (await v('groups', 'article')).find((one) => one.members.includes(three[0]))
  check('a group whose field was left before the answer is named all the same', left?.name === 'Ambition and Habits', left?.name)
} finally {
  await close()
}
done()

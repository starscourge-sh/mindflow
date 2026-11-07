// A new group's first name on every kind of Mac: nothing waits for it, nothing overwrites what you typed, and any Mac
// that cannot suggest behaves exactly as before. Faked answers (HALIGTREE_QA_GROUP_NAME), never the real model.
//   QA_CASE=offer HALIGTREE_QA_CAPS=ai HALIGTREE_QA_GROUP_NAME="Data Tools" QA_DATA=$(mktemp -d) QA_ENTRY=... QA_ARGS=--sandbox HALIGTREE_QA_AWAY=1 node qa/group-name.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 880 })
const { h, v, go, close } = s
const CASE = process.env.QA_CASE
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const row = (title) => h.locator('[data-pane] [data-sortable-id]', { hasText: title }).first()
const FIELD = '[data-name-in-place]'
const value = () => h.evaluate((sel) => document.querySelector(sel)?.value ?? null, FIELD)
const names = async () => (await v('groups', 'article')).map((one) => one.name)
const titles = process.env.QA_TITLES === 'shared' ? ['NumPy Deep Dive', 'Pandas Deep Dive'] : ['Apples and pears', 'Quarterly invoices']
try {
  await v('settings:set', { hintRate: 0, ...(CASE === 'setting-off' ? { aiStudy: false } : {}) })
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  const groups = await v('groups', 'article')
  const inFolders = new Set(groups.flatMap((one) => one.members))
  const ids = []
  for (const title of titles) { const id = await v('article:new'); await v('item:save', id, { title }); ids.push(id) }
  const loose = (await v('items', 'article')).filter((one) => !inFolders.has(one.id) && !ids.includes(one.id) && !one.archivedAt).map((one) => one.id)
  await v('groups:arrange', 'article', { top: [...ids, ...groups.filter((one) => !one.parent).map((one) => `g:${one.id}`), ...loose], groups: {} })
  await go('articles')
  await wait(900)
  const a = await row(titles[1]).boundingBox()
  const b = await row(titles[0]).boundingBox()
  await h.mouse.move(a.x + 80, a.y + a.height / 2); await h.mouse.down()
  await h.mouse.move(a.x + 80, a.y + 10, { steps: 4 })
  await h.mouse.move(b.x + 80, b.y + b.height / 2, { steps: 8 })
  for (let i = 0; i < 12; i++) { await h.mouse.move(b.x + 80 + (i % 2), b.y + b.height / 2); await wait(120) }
  await h.mouse.up()
  await wait(120)
  const first = await value()
  check('the group is made and its name open at once', !!first, first)
  if (shots) await h.screenshot({ path: `${shots}/${CASE}-first.png` })
  const plain = /^Group \d+$/
  if (CASE === 'offer' || CASE === 'esc' || CASE === 'enter-after') {
    await wait(700)
    const later = await value()
    if (shots) await h.screenshot({ path: `${shots}/${CASE}-offered.png` })
    check('the suggested name arrives in the open field', later === process.env.HALIGTREE_QA_GROUP_NAME, later)
    check('it is picked, so typing replaces it', await h.evaluate((sel) => { const f = document.querySelector(sel); return f.selectionStart === 0 && f.selectionEnd === f.value.length }, FIELD))
    check('it was not there first', plain.test(first), first)
    if (CASE === 'esc') {
      await h.keyboard.press('Escape'); await wait(400)
      check('Esc takes it back: the plain name stays', (await names()).includes(first) && !(await names()).includes(later), (await names()).join())
    } else {
      await h.keyboard.press('Enter'); await wait(500)
      check('Enter keeps it', (await names()).includes(later), (await names()).join())
    }
  }
  if (CASE === 'typed') {
    await h.keyboard.type('My own', { delay: 15 })
    await wait(800)
    check('what you typed is never overwritten', (await value()) === 'My own', await value())
    await h.keyboard.press('Enter'); await wait(500)
    check('and it is kept', (await names()).includes('My own'), (await names()).join())
  }
  if (CASE === 'gone') {
    await h.keyboard.press('Enter'); await wait(1000)
    check('left before the answer: it is thrown away', (await names()).includes(first) && !(await names()).includes(process.env.HALIGTREE_QA_GROUP_NAME), (await names()).join())
    check('and no field comes back', (await value()) === null)
  }
  if (CASE === 'nothing' || CASE === 'setting-off') {
    await wait(Number(process.env.QA_WAIT ?? 900))
    check('no suggestion: the plain name stays, field open, no error', plain.test(await value() ?? ''), await value())
    check('nothing is said about it', !(await h.evaluate(() => /apple intelligence/i.test(document.body.innerText.replace(/Sandbox/g, '')))))
  }
  if (CASE === 'shared') {
    await wait(700)
    check('titles that share words name it, on any Mac', (await value()) === 'Deep Dive', await value())
  }
} finally {
  await close()
}
done()

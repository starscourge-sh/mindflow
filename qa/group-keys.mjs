// Groups as they were before groups became folders, with Figma's keys: ⌘-click two notes and ⌘G makes a group of them
// in place (the panel, both inside it, its name open as "Group N"), ⌘Z takes it back; a third carried onto a member
// joins; one carried out leaves; ⇧⌘G (and the × on its row) takes it apart, its notes staying, with Undo. A folder row
// has no chevron and a click opens it. Every row's leading mark (a thumbnail, a folder, a group's icon) takes one box.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/group-keys.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, v, go, size, close, errors } = s
if (process.env.QA_THEME) await s.theme(process.env.QA_THEME)
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const M = '[role="main"]'
const loose = () => h.evaluate(() => [...document.querySelectorAll('[role="main"] [data-sortable-id]')].filter((el) => !el.getAttribute('data-sortable-id').startsWith('g:') && !el.parentElement.closest('[data-group-block]')).map((el) => { const r = el.getBoundingClientRect(); return { id: el.getAttribute('data-sortable-id'), x: r.x, y: r.y, h: r.height } }))
const groupsNow = async () => (await v('groups', 'article')).filter((one) => !one.folder)
// Frames every 50 ms while a key changes the list, for looking at by eye (QA_SHOTS).
const film = async (name, n = 8) => { for (let i = 0; i < n; i++) { if (shots) await h.screenshot({ path: `${shots}/${name}-${String(i).padStart(2, '0')}.png` }); await wait(50) } }
// Two of the list's own rows drawn over each other, across and down.
const overlaps = () => h.evaluate(() => {
  const boxes = [...document.querySelectorAll('[role="main"] [data-row]:not([data-lifted] *), [role="main"] [data-group-row]:not([data-lifted] *)')].filter((el) => !el.closest('[data-open]')).map((el) => ({ name: el.textContent.slice(0, 20), box: el.getBoundingClientRect() })).filter((one) => one.box.height > 0)
  const bad = []
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i].box, b = boxes[j].box
    if (a.top < b.bottom - 1 && b.top < a.bottom - 1 && a.left < b.right - 1 && b.left < a.right - 1) bad.push(`${boxes[i].name} / ${boxes[j].name}`)
  }
  return bad
})
const carry = async (from, toY) => {
  await h.mouse.move(from.x + 80, from.y + from.h / 2)
  await h.mouse.down()
  for (let i = 1; i <= 16; i++) { await h.mouse.move(from.x + 80, from.y + from.h / 2 + (toY - from.y - from.h / 2) * i / 16); await wait(30) }
  await wait(800)
  await h.mouse.up()
  await wait(900)
}
try {
  await v('settings:set', { hintRate: 0 })
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'newest', group: 'none', filter: {}, density: 'list' })))
  await go('nuggets'); await go('articles'); await wait(900)
  // Every row's leading mark takes the same box, folders' and notes' alike, at 1300 and at 390 wide.
  for (const width of [1300, 390]) {
    await size(width, 900)
    const marks = await h.evaluate(() => [...document.querySelectorAll('[role="main"] [data-row-mark]')].map((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.width), Math.round(r.height)].join(',') }))
    check(`${width} wide: every row's leading mark has one left edge, width and height (${new Set(marks).size} shape of ${marks.length})`, marks.length > 3 && new Set(marks).size === 1, [...new Set(marks)].join(' | '))
  }
  await size(1300, 900)
  // A folder row: no chevron; a click opens it.
  const folderRow = h.locator(`${M} [data-folder-row] [data-group-row]`).first()
  check('a folder row has no chevron', (await folderRow.locator('svg.lucide-chevron-right').count()) === 0 && (await folderRow.getAttribute('aria-expanded')) === null)
  const fid = await folderRow.getAttribute('data-group-row')
  await folderRow.click()
  await wait(800)
  check('a click on a folder row opens the folder', await h.evaluate((id) => !!document.querySelector(`[data-path-part="${id}"][aria-current="page"]`), fid))
  await go('nuggets'); await go('articles'); await wait(900)

  // ⌘G: two picked notes grouped in place.
  let rows = await loose()
  // Picked as a person picks: ⌘-click one, then (the list laid out again around what opened) ⌘-click the next.
  await h.locator(`${M} [data-row][data-id="${rows[0].id}"]`).first().click({ modifiers: ['Meta'] })
  await wait(600)
  await h.locator(`${M} [data-row][data-id="${rows[1].id}"]`).first().click({ modifiers: ['Meta'] })
  await wait(400)
  await h.keyboard.press('Meta+g')
  await film('cmd-g')
  await wait(500)
  const named = await h.evaluate(() => ({ label: document.activeElement?.getAttribute('aria-label'), value: document.activeElement?.value }))
  await h.keyboard.press('Escape')
  await wait(400)
  let made = (await groupsNow())[0]
  if (shots) await h.screenshot({ path: `${shots}/cmd-g.png` })
  check('⌘G groups the two picked notes into one group, named "Group 1", its name open', !!made && made.members.length === 2 && named.label === 'Group name' && named.value === 'Group 1', JSON.stringify({ named, made }))
  const panel = await h.evaluate((id) => document.querySelectorAll(`[role="main"] [data-group-block="${id}"] [data-row]`).length, made?.id)
  check('the group shows as a panel with both notes inside it in the list', panel === 2)
  await h.keyboard.press('Meta+z')
  await wait(900)
  check('⌘Z takes the group back, the notes loose again', (await groupsNow()).length === 0)

  // A drop on a note's middle makes it too; a third carried onto a member joins; one carried out leaves.
  rows = await loose()
  await carry(rows[1], rows[2].y + rows[2].h / 2)
  await h.keyboard.press('Escape')
  await wait(400)
  made = (await groupsNow())[0]
  check('a note dropped on another\'s middle makes a group of the two', made?.members.length === 2, JSON.stringify(made))
  rows = await loose()
  const member = await h.evaluate((id) => { const el = [...document.querySelectorAll(`[role="main"] [data-group-block="${id}"] [data-sortable-id]:not([data-sortable-id^="g:"])`)].pop(); const r = el.getBoundingClientRect(); return { y: r.y, h: r.height } }, made.id)
  if (shots) await h.screenshot({ path: `${shots}/before-join.png` })
  await carry(rows.at(-1), member.y + member.h / 2)
  check('a third carried onto a member joins the group', (await groupsNow())[0]?.members.length === 3)
  const inside = await h.evaluate((id) => [...document.querySelectorAll(`[role="main"] [data-group-block="${id}"] [data-sortable-id]`)].filter((el) => !el.getAttribute('data-sortable-id').startsWith('g:')).map((el) => { const r = el.getBoundingClientRect(); return { id: el.getAttribute('data-sortable-id'), x: r.x, y: r.y, h: r.height } }), made.id)
  // Out over the group's own top edge: it lands loose, just above it.
  const top = await h.evaluate((id) => document.querySelector(`[role="main"] [data-group-block="${id}"]`).getBoundingClientRect().top, made.id)
  await carry(inside.at(-1), top - 4)
  check('one carried out of the group leaves it', (await groupsNow())[0]?.members.length === 2)

  // ⇧⌘G with a member picked takes the group apart; its notes stay; ⌘Z puts it together again.
  const kept = (await groupsNow())[0]
  await h.locator(`${M} [data-group-block="${kept.id}"] [data-row][data-id="${kept.members[0]}"]`).first().click({ modifiers: ['Meta'] })
  await wait(300)
  await h.keyboard.press('Meta+Shift+g')
  await film('shift-cmd-g')
  await wait(500)
  console.log('said', await h.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.textContent).join(' | ')), JSON.stringify(await groupsNow()))
  const all = await v('items', 'article')
  check('⇧⌘G ungroups it, both notes still in the list', (await groupsNow()).length === 0 && kept.members.every((id) => all.some((one) => one.id === id)))
  await h.keyboard.press('Meta+z')
  await wait(900)
  check('⌘Z puts the group together again', (await groupsNow())[0]?.members.length === 2)
  await h.keyboard.press('Escape')
  // The × on its row separates it too.
  await h.locator(`${M} [data-group-block="${kept.id}"] [data-group-row]`).hover()
  await wait(300)
  await h.locator(`${M} [data-group-block="${kept.id}"] [data-group-separate]`).click()
  await wait(1200)
  check('the × on the group\'s row separates it', (await groupsNow()).length === 0)

  // "Open as a page" on a group's right-click opens it alone, as the old menu did.
  await h.keyboard.press('Meta+z')
  await wait(900)
  const again = (await groupsNow())[0]
  await h.locator(`${M} [data-group-row="${again.id}"]`).click({ button: 'right' })
  await wait(300)
  const lines = await h.evaluate(() => [...document.querySelectorAll('[data-slot="context-menu-content"] [role="menuitem"]')].map((m) => m.textContent.trim() || 'dot'))
  check('the group\'s menu is the old one: Open as a page, New note in group, Separate, Duplicate group, the colours, Rename…, Change icon…, Archive group', ['Open as a page', 'New note in group', 'Separate', 'Duplicate group', 'Rename…', 'Change icon…', 'Archive group'].every((one) => lines.includes(one)) && lines.filter((one) => one === 'dot').length === 8, lines.join(' | '))
  await h.locator('[role="menuitem"]', { hasText: 'Open as a page' }).click()
  await wait(900)
  check('"Open as a page" opens the group alone, its two notes shown', await h.evaluate((id) => !!document.querySelector(`[data-path-part="${id}"][aria-current="page"]`), again.id) && (await h.locator(`${M} [data-row]`).count()) === 2)

  // Several picked carried past two open groups in a short window: no two rows are ever drawn over each other.
  await go('nuggets'); await go('articles'); await wait(900)
  await size(1100, 760)
  for (let i = 0; i < 3; i++) await v('article:new').then((id) => v('item:save', id, { title: `Probe loose ${i + 1}` }))
  await wait(900)
  rows = await loose()
  await h.locator(`${M} [data-row][data-id="${rows[0].id}"]`).first().click({ modifiers: ['Meta'] })
  await wait(300)
  await h.locator(`${M} [data-row][data-id="${rows[1].id}"]`).first().click({ modifiers: ['Meta'] })
  await h.keyboard.press('Meta+g')
  await wait(700)
  await h.keyboard.press('Escape')
  await wait(400)
  rows = await loose()
  const a = rows.at(-1), b = rows.at(-2)
  await h.locator(`${M} [data-row][data-id="${a.id}"]`).first().click({ modifiers: ['Meta'] })
  await h.locator(`${M} [data-row][data-id="${b.id}"]`).first().click({ modifiers: ['Meta'] })
  await wait(300)
  rows = await loose()
  const from = rows.find((one) => one.id === a.id), target = rows[0]
  const seen = []
  await h.mouse.move(from.x + 80, from.y + from.h / 2)
  await h.mouse.down()
  for (let i = 1; i <= 24; i++) {
    await h.mouse.move(from.x + 80, from.y + from.h / 2 + (target.y + target.h * 0.1 - from.y - from.h / 2) * i / 24)
    await wait(50)
    seen.push(...(await overlaps()))
    if (shots && i % 3 === 0) await h.screenshot({ path: `${shots}/carry-two-${String(i).padStart(2, '0')}.png` })
  }
  await wait(400)
  seen.push(...(await overlaps()))
  await h.mouse.up()
  await wait(900)
  seen.push(...(await overlaps()))
  check('carrying two picked rows past the groups, no two rows are ever drawn over each other', seen.length === 0, [...new Set(seen)].slice(0, 4).join('; '))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()

// A group (the panel made by dropping a note on a note, or ⌘G) renamed every way a person would, on every list that
// shows groups (Writing, Gems): double-click its name, its right-click "Rename…", F2 on its row. Typing a name and
// Enter keeps it, Esc leaves it as it was, a click away keeps it, ⌘Z takes it back, and the name survives a reload.
// Driven with real mouse and keys only. QA_SHOTS films one rename every 50ms, light and dark.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-gr/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/group-rename.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, v, go, close, look } = s
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const wait = (ms) => h.waitForTimeout(ms)
const FIELD = '[role="main"] [data-name-in-place]'
const head = (id) => h.locator(`[role="main"] [data-group-row="${id}"]`)
const nameOf = async (list, id) => (await v('groups', list)).find((one) => one.id === id)?.name
const shown = (id) => h.evaluate((gid) => document.querySelector(`[role="main"] [data-group-row="${gid}"]`)?.textContent ?? null, id)
const fieldOpen = () => h.evaluate((sel) => { const f = document.querySelector(sel); return !!f && document.activeElement === f }, FIELD)
const film = async (name, n = 10) => { if (!shots) return; for (let i = 0; i < n; i++) { await h.screenshot({ path: `${shots}/${name}-${String(i).padStart(2, '0')}.png` }); await wait(50) } }
const menuRename = async (id) => {
  await head(id).click({ button: 'right' }); await wait(300)
  const line = h.locator('[role="menuitem"]', { hasText: 'Rename…' })
  if (!(await line.count())) return void (await h.keyboard.press('Escape'))
  await line.click(); await wait(400)
}

async function surface(list, view, label, { sort = 'manual', density = 'list', open = false } = {}) {
  await h.evaluate(([k, view]) => localStorage.setItem(k, JSON.stringify(view)), [`view:${list}`, { sort, group: 'none', filter: {}, density }])
  // Two notes of this list made into a group, at the top.
  const before = await v('groups', list)
  const inFolders = new Set(before.flatMap((one) => one.members))
  let ids = []
  if (list === 'article') for (const title of [`${label} one`, `${label} two`]) { const id = await v('article:new'); await v('item:save', id, { title }); ids.push(id) }
  else ids = (await v('items', list)).filter((one) => !inFolders.has(one.id) && !one.archivedAt).slice(0, 2).map((one) => one.id)
  const gid = `qa-${list}-${label.replace(/\W+/g, '-')}`
  const loose = (await v('items', list)).filter((one) => !inFolders.has(one.id) && !ids.includes(one.id) && !one.archivedAt).map((one) => one.id)
  const groups = Object.fromEntries(before.map((one) => [one.id, one.members]))
  await v('groups:arrange', list, { top: [`g:${gid}`, ...before.filter((one) => !one.parent).map((one) => `g:${one.id}`), ...loose], groups: { ...groups, [gid]: ids }, make: { id: gid, name: 'Group 1' } })
  await go('home'); await go(view); await wait(900)
  // With a note open beside the list, as Writing usually is.
  if (open) { await h.locator('[role="main"] [data-sortable-id]:not([data-sortable-id^="g:"])').first().click(); await wait(900) }
  check(`${label}: the group shows`, (await head(gid).count()) === 1)

  // Double-click its name, type, Enter.
  const box = await head(gid).boundingBox()
  await h.mouse.dblclick(box.x + 60, box.y + box.height / 2); await wait(400)
  check(`${label}: a double-click opens the name for typing`, await fieldOpen())
  if (shots && list === 'article') await film(`${label}-dblclick-open`, 4)
  await h.keyboard.type('Double clicked', { delay: 20 })
  if (shots && list === 'article') await film(`${label}-typed`, 2)
  await h.keyboard.press('Enter'); if (shots && list === 'article') await film(`${label}-enter`, 6); await wait(600)
  check(`${label}: Enter keeps the name`, (await nameOf(list, gid)) === 'Double clicked', await nameOf(list, gid))
  check(`${label}: and the row shows it`, (await shown(gid))?.includes('Double clicked'), await shown(gid))

  // Right-click "Rename…", type, Esc: as it was.
  await menuRename(gid)
  check(`${label}: "Rename…" opens the name for typing`, await fieldOpen())
  await h.keyboard.type('Thrown away', { delay: 20 }); await h.keyboard.press('Escape'); await wait(500)
  check(`${label}: Esc leaves it as it was`, (await nameOf(list, gid)) === 'Double clicked' && !(await fieldOpen()), await nameOf(list, gid))

  // "Rename…" again, type, click away: kept.
  await menuRename(gid)
  check(`${label}: "Rename…" opens it a second time`, await fieldOpen())
  await h.keyboard.type('From the menu', { delay: 20 })
  await h.mouse.click(1250, 880); await wait(600)
  check(`${label}: a click away keeps it`, (await nameOf(list, gid)) === 'From the menu', await nameOf(list, gid))

  // F2 on its row (reached with the keyboard focus on it), type, Enter.
  await head(gid).focus(); await h.keyboard.press('F2'); await wait(400)
  check(`${label}: F2 opens the name for typing`, await fieldOpen())
  await h.keyboard.type('With F2', { delay: 20 }); await h.keyboard.press('Enter'); await wait(600)
  check(`${label}: F2 then Enter keeps it`, (await nameOf(list, gid)) === 'With F2', await nameOf(list, gid))

  // ⌘Z takes the last name back.
  await h.mouse.click(1250, 880); await wait(200)
  await h.keyboard.press('Meta+z'); await wait(800)
  check(`${label}: ⌘Z takes it back`, (await nameOf(list, gid)) === 'From the menu', await nameOf(list, gid))
  check(`${label}: and the row shows the old name again`, (await shown(gid))?.includes('From the menu'), await shown(gid))

  // A reload: the name stays.
  await h.reload(); await wait(1500); await go(view); await wait(900)
  check(`${label}: the name survives a reload`, (await shown(gid))?.includes('From the menu'), await shown(gid))
  return gid
}

try {
  await v('settings:set', { hintRate: 0 })
  const gid = process.env.QA_SIDE ? null : await surface('article', 'articles', 'Writing')
  if (!process.env.QA_SIDE) await surface('article', 'articles', 'Writing, newest first, compact, a note open', { sort: 'newest', density: 'compact', open: true })
  if (!process.env.QA_SIDE) await surface('nugget', 'nuggets', 'Gems')
  if (!process.env.QA_SIDE) await surface('nugget', 'nuggets', 'Gems, a gem open', { sort: 'newest', open: true })

  // The sidebar: a folder's "Rename…" (right click), typed, Enter; Esc; ⌘Z.
  await go('home'); await go('articles'); await wait(900)
  const sideRename = async (row, words, key = 'Enter') => {
    await h.locator(row).first().click({ button: 'right' }); await wait(300)
    const line = h.locator('[role="menuitem"]', { hasText: 'Rename…' })
    if (!(await line.count())) return (await h.keyboard.press('Escape'), false)
    await line.click(); await wait(400)
    const open = await h.evaluate(() => document.activeElement?.hasAttribute('data-name-in-place') ?? false)
    await h.keyboard.type(words, { delay: 20 }); await h.keyboard.press(key); await wait(700)
    return open
  }
  const fid = await h.locator('aside [data-side-folders="article"] [data-side-folder]').first().getAttribute('data-side-folder')
  check('sidebar folder: "Rename…" opens the name for typing', await sideRename(`aside [data-side-folder="${fid}"]`, 'Renamed folder'))
  check('sidebar folder: Enter keeps it', (await nameOf('article', fid)) === 'Renamed folder', await nameOf('article', fid))
  check('sidebar folder: the row shows it', (await h.locator(`aside [data-side-folder="${fid}"]`).textContent())?.includes('Renamed folder'))
  await h.mouse.click(1250, 880); await h.keyboard.press('Meta+z'); await wait(800)
  check('sidebar folder: ⌘Z takes it back', (await nameOf('article', fid)) !== 'Renamed folder', await nameOf('article', fid))

  // Review's decks: a deck's right click "Rename…", typed in its tile, Enter.
  await go('review'); await wait(1200)
  const deck = h.locator('[data-own-deck]').first()
  if (await deck.count()) {
    const tag = await deck.getAttribute('data-own-deck')
    check('deck: "Rename…" opens the name for typing', await sideRename(`[data-own-deck="${tag}"]`, 'Renamed deck'))
    const tags = await h.evaluate(() => [...document.querySelectorAll('[data-own-deck]')].map((el) => el.textContent).join(' | '))
    check('deck: Enter keeps it, and its tile shows it', /Renamed deck/i.test(tags), tags)
  } else check('deck: an own deck shows in Review', false)
  if (shots) {
    // One more rename filmed in dark, from the menu.
    await look('dark'); await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' }))); await go('home'); await go('articles'); await wait(900)
    await menuRename(gid); await film('dark-menu-open', 4)
    await h.keyboard.type('Night name', { delay: 20 }); await film('dark-typed', 2)
    await h.keyboard.press('Enter'); await film('dark-enter', 6)
    await look('light')
  }
} finally {
  await close()
}
done()

// Writing opens on a grid of folders over its loose notes (folder-grid.tsx). Pointed at, a folder
// floats out its first four titles (subfolders first), "and N more" past that; an empty one says
// "Empty" and floats nothing. A click opens it, its subfolders a grid inside. No folder is a row; ⌘A
// picks loose notes only; a note carried onto a folder goes in. 30 folders, one of 500 pages,
// light and dark, desktop and narrow, every animation frame of the float read.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<dir> node qa/folder-grid.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, v, go, size, both, errors } = c
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const page = async (title) => { const id = await v('article:new'); await v('item:save', id, { title }); return id }

try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await v('settings:set', { hintRate: 0 })
  // Loose pages, a big folder (500), an empty one, one with two subfolders, and the rest small.
  const loose = [await page('A loose page about tides'), await page('Another loose page')]
  const big = []
  for (let k = 0; k < 500; k++) big.push(await page(`Field note ${String(k + 1).padStart(3, '0')}: the long walk along the estuary at dawn`))
  const small = []
  for (let k = 0; k < 27; k++) small.push(await page(`Draft ${k + 1}`))
  const inner = [await page('Inside the first subfolder'), await page('Inside the second subfolder')]
  const top = []
  const groups = {}
  const arrange = (make) => v('groups:arrange', 'article', { top: [...top, ...loose], groups, make })
  top.push('g:f-big'); groups['f-big'] = big; await arrange({ id: 'f-big', name: 'Estuary field notes' })
  top.push('g:f-empty'); groups['f-empty'] = []; await arrange({ id: 'f-empty', name: 'Someday' })
  top.push('g:f-nest'); groups['f-nest'] = ['g:f-sub1', 'g:f-sub2']; groups['f-sub1'] = [inner[0]]; groups['f-sub2'] = [inner[1]]
  await arrange({ id: 'f-nest', name: 'Essays' }); await arrange({ id: 'f-sub1', name: 'On walking' }); await arrange({ id: 'f-sub2', name: 'On rivers' })
  for (let k = 0; k < 27; k++) { top.push(`g:f-${k}`); groups[`f-${k}`] = [small[k]]; await arrange({ id: `f-${k}`, name: k === 3 ? 'A folder with a rather long name that will not fit' : `Folder ${k + 1}` }) }
  await h.reload()
  await wait(1500)
  await go('articles')
  await wait(1500)
  const read = () => h.evaluate(() => ({
    tiles: document.querySelectorAll('[data-folder-tile]').length,
    folderRows: document.querySelectorAll('[role="main"] [data-group-row], [role="main"] [data-group-head]').length,
    rows: [...document.querySelectorAll('[role="main"] [data-row]')].map((one) => one.textContent.trim().slice(0, 30)),
    more: document.querySelector('[data-folders-more]')?.textContent ?? null,
    sideways: document.scrollingElement.scrollWidth - innerWidth
  }))
  const first = await read()
  if (shots) await both(`${shots}/folders-30`)
  // A new book's welcome adds its own few folders to the 30 made here.
  check('1. Writing opens on a grid of folders: 12 shown, the rest behind "Show all N folders"', first.tiles === 12 && /^Show all 3\d folders$/.test(first.more ?? ''), JSON.stringify(first))
  check('2. no folder is a row; the loose pages are the list', first.folderRows === 0 && first.rows.some((one) => one.startsWith('A loose page')) && !first.rows.some((one) => one.startsWith('Field note')), JSON.stringify(first.rows.slice(0, 5)))
  // Pointed at: the big folder floats four titles and "and 496 more", frame by frame.
  const tile = (id) => h.locator(`[data-folder-tile="${id}"]`)
  await h.mouse.move(1250, 880)
  await h.evaluate(() => { window.__f = []; const end = performance.now() + 1200; const tick = () => { const s = document.querySelector('[data-folder-tile="f-big"] [data-folder-float]'); if (s) { const r = s.getBoundingClientRect(); window.__f.push(`${Number(getComputedStyle(s).opacity).toFixed(2)}@${Math.round(r.top)}`) } if (performance.now() < end) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
  await tile('f-big').locator('button').first().hover()
  await wait(500)
  console.log('float frames:', (await h.evaluate(() => window.__f)).join(' '))
  const floats = await tile('f-big').evaluate((one) => ({ shown: [...one.querySelectorAll('[data-folder-float]')].filter((s) => getComputedStyle(s).opacity === '1').map((s) => s.textContent.slice(0, 15)), more: one.querySelector('[data-folder-more-float]')?.textContent, held: one.querySelector('[data-folder-held]')?.textContent }))
  if (shots) await both(`${shots}/folders-hover`)
  check('3. pointed at: four titles float out and "and 496 more"', floats.shown.length === 4 && floats.more === 'and 496 more', JSON.stringify(floats))
  check('4. its count says what it holds: "500 pages"', floats.held === '500 pages', floats.held)
  // Readable: solid paper chips, none over another or over "and N more", none above the folder's own row. Pointed at again:
  // the light and dark pictures above let the pointer go.
  await h.mouse.move(5, 5)
  await tile('f-big').locator('button').first().hover()
  await wait(600)
  const chips = await tile('f-big').evaluate((one) => {
    const boxes = [...one.querySelectorAll('[data-folder-float]'), one.querySelector('[data-folder-more-float]')].filter(Boolean).map((el) => el.getBoundingClientRect())
    const over = boxes.some((a, i) => boxes.some((b, j) => j > i && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5 && a.left < b.right && b.left < a.right))
    const bg = getComputedStyle(one.querySelector('[data-folder-float]')).backgroundColor
    const opaque = !/rgba\(.*,\s*0?\.\d+\)$/.test(bg) && bg !== 'transparent'
    const top = Math.min(...boxes.map((b) => b.top)), tileTop = one.getBoundingClientRect().top
    return { over, opaque, bg, above: Math.round(tileTop - top) }
  })
  check('4b. the titles are solid chips, none over another, inside the folder\'s own room', !chips.over && chips.opaque && chips.above <= 14, JSON.stringify(chips))
  check('5. pointing makes no other floating surface (no tip)', (await h.evaluate(() => document.querySelectorAll('[role="tooltip"], [data-note-preview]').length)) === 0)
  await tile('f-empty').locator('button').first().hover()
  await wait(400)
  const empty = await tile('f-empty').evaluate((one) => ({ said: one.querySelector('[data-folder-empty]')?.textContent, floats: one.querySelectorAll('[data-folder-float]').length }))
  check('6. an empty folder says "Empty" and floats nothing', empty.said === 'Empty' && empty.floats === 0, JSON.stringify(empty))
  const nest = await tile('f-nest').evaluate((one) => ({ held: one.querySelector('[data-folder-held]')?.textContent, floats: [...one.querySelectorAll('[data-folder-float]')].map((s) => s.textContent) }))
  check('7. a folder with subfolders says so, and floats them first', nest.held === '2 folders · 2 pages' && nest.floats[0] === 'On walking' && nest.floats[1] === 'On rivers', JSON.stringify(nest))
  // ⌘A: loose pages only.
  await h.locator('[role="main"] [data-row]').first().click()
  await wait(300)
  await h.keyboard.press('Meta+a')
  await wait(400)
  const picked = await h.evaluate(() => ({ picked: document.querySelectorAll('[role="main"] [data-picked]').length, rows: document.querySelectorAll('[role="main"] [data-row]').length, folders: document.querySelectorAll('[data-folder-tile] [data-picked]').length }))
  check('8. ⌘A picks every loose page, never a folder', picked.picked > 0 && picked.picked === picked.rows && picked.folders === 0, JSON.stringify(picked))
  await h.keyboard.press('Escape')
  // Keyboard: Tab to a folder, Enter opens it.
  await tile('f-nest').locator('button').first().focus()
  await h.keyboard.press('Enter')
  await wait(1200)
  const inside = await read()
  if (shots) await both(`${shots}/folders-inside`)
  check('9. Enter on a folder opens it; its subfolders are a grid inside', inside.tiles === 2, JSON.stringify(inside))
  // Drag a loose page onto a folder: it goes in.
  await go('articles')
  await wait(1200)
  const row = h.locator('[data-pane] [data-row][data-id]', { hasText: 'A loose page about tides' }).first()
  await row.scrollIntoViewIfNeeded()
  const from = await row.boundingBox()
  const target = tile('f-1').locator('button').first()
  await target.scrollIntoViewIfNeeded()
  const to = await target.boundingBox()
  await h.evaluate(() => { window.__x = []; const end = performance.now() + 4000; const tick = () => { const r = document.querySelector('[data-folder-tile="f-1"] button')?.getBoundingClientRect(); const g = document.querySelector('[data-folder-grid]')?.getBoundingClientRect(); window.__x.push(`${Math.round(r?.x ?? -1)}/${Math.round(g?.x ?? -1)},${Math.round(g?.width ?? -1)}${document.documentElement.dataset.splitDrag ? '+S' : ''}`); if (performance.now() < end) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
  await h.mouse.move(from.x + 60, from.y + from.height / 2)
  await h.mouse.down()
  await h.mouse.move(from.x + 60, from.y + from.height / 2 + 8, { steps: 4 })
  await wait(150)
  await h.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 24 })
  await wait(300)
  // The list may scroll itself while a row is carried up it: aim again at where the folder is now, as an eye would.
  const now = await target.boundingBox()
  await h.mouse.move(now.x + now.width / 2, now.y + now.height / 2, { steps: 6 })
  await wait(400)
  console.log('f-1 x/grid x,width per frame:', [...new Set(await h.evaluate(() => window.__x))].join(' '))
  const lit = await target.evaluate((one) => one.dataset.queueHot !== undefined)
  const under = await h.evaluate(([x, y]) => ({ carrying: document.documentElement.dataset.splitDrag ?? null, at: document.elementsFromPoint(x, y).map((el) => el.tagName.toLowerCase() + (el.dataset.folderDrop ? `[drop=${el.dataset.folderDrop}]` : '') + (el.dataset.row !== undefined ? '[row]' : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').filter((c) => /drag|overlay|pane|split|list/.test(c)).join('.') : '')).slice(0, 14).join(' > '), box: (() => { const r = document.querySelector('[data-folder-tile="f-1"] button')?.getBoundingClientRect(); return r && [Math.round(r.x), Math.round(r.y), Math.round(r.width)] })(), pointer: [Math.round(x), Math.round(y)] }), [now.x + now.width / 2, now.y + now.height / 2])
  await h.mouse.up()
  await wait(1200)
  check('10a. the folder lights while a page is over it', lit, JSON.stringify(under))
  const moved = await v('groups', 'article')
  check('10. a page carried onto a folder goes in', moved.find((one) => one.id === 'f-1')?.members.length === 2, JSON.stringify(moved.find((one) => one.id === 'f-1')?.members))
  // Narrow.
  await size(560, 844)
  await wait(800)
  const narrow = await read()
  if (shots) await both(`${shots}/folders-narrow`)
  check('11. narrow: nothing runs off the side', narrow.sideways <= 0, narrow.sideways)
  const visible = await h.evaluate(() => [...document.querySelectorAll('[data-folder-tile]')].filter((one) => one.getBoundingClientRect().width > 0).length)
  check('12. narrow: two rows of folders (6) before "Show all", so the loose pages are in reach', visible === 6, visible)
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (e) {
  console.log('ERR', e.message.slice(0, 300))
} finally {
  await c.close()
}
done()

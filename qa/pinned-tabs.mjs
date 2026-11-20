// Favorites and pinned tabs (20 Nov): the sidebar's old "Pinned" is "Favorites" everywhere, its notes kept; a tab's menu
// pins it: it moves to the left, small (its icon, no ✕), survives a reload, is never closed by "Close others", and drags
// only among pinned tabs. ⌘W on it asks in place ("Close this pinned tab?", Keep and Close): Esc keeps it, a second ⌘W
// closes it. Each pane has its own. A note can be a favorite and a pinned tab at once. Frames to QA_SHOTS.
//   QA_DATA=<copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/pinned-tabs.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const shots = `${process.env.QA_SHOTS ?? process.env.QA_DATA}/pinned-tabs`
mkdirSync(shots, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 880 })
const { h, v, go, look } = c
const wait = (ms = 400) => h.waitForTimeout(ms)
const tabs = (pane = 0) => h.evaluate((at) => [...document.querySelectorAll('[data-tab-row]')][at] ? [...[...document.querySelectorAll('[data-tab-row]')][at].querySelectorAll('[data-tab]')].map((one) => ({
  key: one.getAttribute('data-tab'), title: one.getAttribute('data-drag-title'), pinned: one.hasAttribute('data-tab-pinned'),
  width: Math.round(one.getBoundingClientRect().width), close: !!one.querySelector('[data-tab-close]'), named: !!one.querySelector('[data-tab-name]')
})) : [], pane)
const tabAt = (key) => h.locator(`[data-tab="${key}"]`).first()
const menuOf = async (key) => {
  await tabAt(key).locator('[role="tab"]').click({ button: 'right' }); await wait(300)
  return h.locator('[role="menuitem"]').allInnerTexts()
}
const pick = async (name) => { await h.getByRole('menuitem', { name }).first().click(); await wait(400) }
const closeFront = () => h.evaluate(() => { if (window.dispatchEvent(new Event('haligtree:close-front', { cancelable: true }))) window.__closedWindow = true })
const asking = () => h.locator('[data-sure="pinned-tab"]').count()
const rowShot = async (name) => {
  const bar = await h.locator('[data-tabs]').first().boundingBox()
  for (const theme of ['light', 'dark']) {
    await look(theme)
    await h.screenshot({ path: `${shots}/${name}-${theme}.png`, clip: { x: 0, y: 0, width: Math.min(1400, bar.x + bar.width), height: 240 } })
  }
  await look('light')
}

try {
  await v('settings:set', { hintRate: 0 })
  // --- 1. Favorites: the old Pinned, its notes kept (the seed pinned one), every word changed.
  await go('day')
  const side = await h.evaluate(() => document.querySelector('aside')?.innerText ?? '')
  const favs = await h.locator('[data-side-section="pinned"] [data-drag-open]').count()
  check('the sidebar says Favorites, not Pinned', /\bFavorites\b/i.test(side) && !/\bPinned\b/i.test(side), side.split('\n').filter((one) => /Pinned|Favorites/.test(one)).join(' | ') || side.slice(0, 120))
  check('the notes pinned before are in Favorites (saved data kept)', favs >= 1, `${favs} rows`)
  const favKey = await h.locator('[data-side-section="pinned"] [data-drag-open]').first().getAttribute('data-drag-open')
  await h.locator('[data-side-section="pinned"] [data-drag-open]').first().click({ button: 'right' }); await wait(300)
  const favMenu = await h.locator('[role="menuitem"]').allInnerTexts()
  await h.keyboard.press('Escape'); await wait(200)
  check('a favorite\'s menu says "Remove from Favorites", no Pin or Unpin', favMenu.some((one) => one.startsWith('Remove from Favorites')) && !favMenu.some((one) => /\b(Unpin|Pin to the sidebar)\b/.test(one)), favMenu.join(' | '))

  // --- 2. Four tabs, two pinned.
  const pages = ['calendar', 'tasks', 'captures']
  for (const page of pages) { await h.locator('[data-tab-add]').first().click(); await wait(300); await go(page) }
  let row = await tabs()
  check('four tabs to start, none pinned', row.length === 4 && row.every((one) => !one.pinned), JSON.stringify(row))
  const [first, , third, fourth] = row
  let menu = await menuOf(third.key)
  check('a tab\'s menu offers "Pin tab"', menu.some((one) => one.startsWith('Pin tab')), menu.join(' | '))
  await pick(/^Pin tab/)
  row = await tabs()
  check('pinned: it moves to the left of the row', row[0].key === third.key && row[0].pinned, JSON.stringify(row))
  check('pinned: compact, its icon alone, no ✕', row[0].width <= 44 && !row[0].close && !row[0].named, JSON.stringify(row[0]))
  await menuOf(fourth.key); await pick(/^Pin tab/)
  row = await tabs()
  check('a second pinned tab lands after the first', row[0].key === third.key && row[1].key === fourth.key && row[1].pinned, JSON.stringify(row.map((one) => one.title)))
  await rowShot('two-pinned')

  // --- 3. Pinned and a favorite at once: the same note, both kept.
  if (favKey) {
    const [type, id] = favKey.split(':')
    // From an unpinned tab: opened in a pinned one, the note would take that tab's place.
    await tabAt((await tabs()).find((one) => !one.pinned).key).locator('[role="tab"]').click(); await wait(300)
    await h.locator('[data-side-section="pinned"] [data-drag-open]').first().click(); await wait(600)
    const frontKey = await h.evaluate(() => document.querySelector('[data-tab-on]')?.getAttribute('data-tab'))
    menu = await menuOf(frontKey)
    check('a favorite open in a tab: the tab offers both "Pin tab" and "Remove from Favorites"', menu.some((one) => one.startsWith('Pin tab')) && menu.some((one) => one.startsWith('Remove from Favorites')), menu.join(' | '))
    await pick(/^Pin tab/)
    const still = await h.locator(`[data-side-section="pinned"] [data-drag-open="${type}:${id}"]`).count()
    row = await tabs()
    check('pinning its tab leaves it in Favorites', still === 1 && row.filter((one) => one.pinned).length === 3, JSON.stringify(row.map((one) => [one.title, one.pinned])))
    await menuOf(frontKey); await pick(/^Unpin tab/)
    row = await tabs()
    check('"Unpin tab": back among the others, named, with its ✕, just after the pinned ones', row[2].key === frontKey && !row[2].pinned && row[2].named, JSON.stringify(row.map((one) => [one.title, one.pinned])))
  }

  // --- 4. Close others keeps the pinned ones.
  row = await tabs()
  const loose = row.find((one) => !one.pinned)
  await menuOf(loose.key); await pick(/^Close others/)
  row = await tabs()
  check('"Close others" closes only the unpinned others', row.length === 3 && row[0].key === third.key && row[1].key === fourth.key && row[2].key === loose.key, JSON.stringify(row.map((one) => one.title)))
  await h.locator('[data-tab-add]').first().click(); await wait(300); await go('day')

  // --- 5. Survives a reload.
  await h.reload(); await wait(2200)
  row = await tabs()
  check('after a reload: both still pinned, at the left, in order', row[0].key === third.key && row[0].pinned && row[1].key === fourth.key && row[1].pinned && !row[0].close, JSON.stringify(row.map((one) => [one.title, one.pinned])))

  // --- 6. Drag: among pinned ones only.
  const a = await tabAt(third.key).boundingBox(), b = await tabAt(fourth.key).boundingBox()
  const dragTo = async (from, x, y) => {
    await h.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await h.mouse.down()
    for (let i = 1; i <= 12; i++) { await h.mouse.move(from.x + from.width / 2 + ((x - from.x - from.width / 2) * i) / 12, from.y + from.height / 2 + ((y - from.y - from.height / 2) * i) / 12); await wait(40) }
    await h.mouse.up(); await wait(600)
  }
  await dragTo(b, a.x + 4, a.y + a.height / 2)
  row = await tabs()
  check('a pinned tab dragged before the other pinned one: they swap', row[0].key === fourth.key && row[1].key === third.key, JSON.stringify(row.map((one) => one.title)))
  const last = row[row.length - 1]
  const lastBox = await tabAt(last.key).boundingBox(), firstBox = await tabAt(row[0].key).boundingBox()
  await dragTo(lastBox, firstBox.x + 2, firstBox.y + firstBox.height / 2)
  row = await tabs()
  check('an unpinned tab dragged to the far left lands after the pinned ones', row[0].pinned && row[1].pinned && row[2].key === last.key && !row[2].pinned, JSON.stringify(row.map((one) => [one.title, one.pinned])))

  // --- 7. ⌘W on a pinned tab: asks in place; Esc keeps; Keep keeps; a second ⌘W closes.
  await tabAt(row[0].key).locator('[role="tab"]').click(); await wait(400)
  const count = row.length
  await closeFront(); await wait(400)
  const words = await h.locator('[data-sure="pinned-tab"]').innerText().catch(() => '')
  check('⌘W once: "Close this pinned tab?" asked, with Keep and Close, the tab still there', (await asking()) === 1 && /Close this pinned tab\?/.test(words) && /Keep/.test(words) && /Close/.test(words) && (await tabs()).length === count, words.replace(/\n/g, ' / '))
  await rowShot('asking')
  await h.keyboard.press('Escape'); await wait(400)
  check('Esc keeps it', (await asking()) === 0 && (await tabs()).length === count)
  await closeFront(); await wait(400)
  await h.locator('[data-sure="pinned-tab"] [data-ask-cancel]').click(); await wait(400)
  check('Keep keeps it', (await asking()) === 0 && (await tabs()).length === count)
  await h.keyboard.press('Control+w'); await wait(400)
  check('⌃W asks the same', (await asking()) === 1 && (await tabs()).length === count)
  await closeFront(); await wait(500)
  row = await tabs()
  check('a second ⌘W while it asks closes it', (await asking()) === 0 && row.length === count - 1 && row.filter((one) => one.pinned).length === 1, JSON.stringify(row.map((one) => one.title)))
  check('the window was never closed', !(await h.evaluate(() => window.__closedWindow)))

  // --- 8. Each pane its own.
  await h.keyboard.press('Meta+Backslash'); await wait(800)
  const second = await tabs(1)
  check('a new split\'s pane has no pinned tab of its own yet', second.length === 1 && !second[0].pinned, JSON.stringify(second))
  await menuOf(second[0].key); await pick(/^Pin tab/)
  check('pinned in the second pane, the first keeps its own one', (await tabs(1))[0].pinned && (await tabs(0)).filter((one) => one.pinned).length === 1)

  // --- 9. No "Pinned" words left for Favorites in what the window shows.
  const body = await h.evaluate(() => document.body.innerText)
  check('no "Pinned" / "Pin to the sidebar" / "Unpin" words on the page', !/\bPinned\b|Pin to the sidebar|\bUnpin\b/.test(body))
  console.log(`frames: ${shots}`)
} catch (error) {
  check('ran to the end', false, error.stack ?? String(error))
} finally {
  if (c.errors.length) console.log('page errors:', c.errors.slice(0, 5).join('\n'))
  await c.close()
  done()
}

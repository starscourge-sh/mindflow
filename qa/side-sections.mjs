// The sidebar's sections (Pinned, Recent, Library, Tags) move whole: a heading dragged down past another section
// takes its section there, saved and said with Undo; a heading's menu moves it up or down too. Library hangs on a trunk.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/side-sections.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 1300 })
const { h, v, go, close } = s
const wait = (ms) => h.waitForTimeout(ms)
const order = () => h.evaluate(() => [...document.querySelectorAll('aside nav [data-side-section]')].filter((one) => one.offsetHeight).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map((one) => one.dataset.sideSection).filter((one, n, all) => all.indexOf(one) === n))
try {
  await v('settings:set', { hintRate: 0 })
  await go('home'); await wait(1500)
  const first = await order()
  check('sections in their usual order: Library and Look back, then Pinned, Recent and Tags', /^library,look,pinned(,recent)?,tags$/.test(first.join()), first.join())
  check('Bin, Archived and the powers sit in the foot as icons, not in the list', (await h.locator('aside [data-side-foot]').count()) === 3 && !(await h.locator('aside nav [data-place="discarded"], aside nav [aria-label="Bin"]').count()))
  if (process.env.QA_SHOTS) await h.screenshot({ path: `${process.env.QA_SHOTS}/side-new.png`, clip: { x: 0, y: 0, width: 260, height: 1300 } })
  await h.locator('[data-side-section-handle="library"]').click(); await wait(500)
  const twigs = await h.evaluate(() => document.querySelectorAll('aside nav [data-side-section="library"] svg path').length)
  check('Library hangs on a trunk, a twig per row', twigs >= 4, String(twigs))
  // Drag Library's heading down past Pinned.
  const lib = await h.locator('[data-side-section-handle="library"]').boundingBox()
  await h.mouse.move(lib.x + 30, lib.y + lib.height / 2); await h.mouse.down()
  // Lifted, an open section folds to its heading in the hand, as a group does (13 Nov), and the sections under it come
  // up: Pinned is read where it then stands, as a person sees it, and the pointer goes just past it.
  await h.mouse.move(lib.x + 30, lib.y + lib.height / 2 + 10, { steps: 3 }); await wait(250)
  const pin = await h.locator('[data-side-section="pinned"]').first().boundingBox()
  for (let i = 1; i <= 14; i++) { await h.mouse.move(lib.x + 30, lib.y + lib.height / 2 + 10 + ((pin.y + pin.height + 4 - lib.y - lib.height / 2 - 10) * i) / 14); await wait(30) }
  await wait(300)
  // The one line every list draws (carry.tsx), through the room the sections open.
  check('carried, a line shows where it lands', (await h.locator('[data-drop-line]').count()) === 1 && (await h.locator('[data-drop-room]').count()) === 1)
  check('carried, a lifted card named Library follows the pointer', /Library/.test((await h.locator('[data-section-card]').textContent().catch(() => '')) ?? ''))
  check('carried, the hover light stands still (the drag flag is up)', await h.evaluate(() => document.documentElement.hasAttribute('data-dragging')))
  if (process.env.QA_SHOTS) await h.screenshot({ path: `${process.env.QA_SHOTS}/side-drag.png`, clip: { x: 0, y: 0, width: 260, height: 1300 } })
  await h.mouse.up(); await wait(900)
  const moved = await order()
  check('let go past Pinned: Library comes after it', moved.indexOf('library') > moved.indexOf('pinned'), moved.join())
  check('and is saved', (await v('settings')).sideSections?.indexOf('library') > (await v('settings')).sideSections?.indexOf('pinned'), JSON.stringify((await v('settings')).sideSections))
  check('the heading was not folded by the drag', (await h.locator('[data-side-section-handle="library"]').getAttribute('aria-expanded')) === 'true')
  // Its menu moves it back down.
  await h.locator('[data-side-section-handle="library"]').click({ button: 'right' }); await wait(400)
  await h.locator('[role="menuitem"]', { hasText: 'Move section up' }).click(); await wait(900)
  check('"Move section up" from its menu puts it back above Pinned', (await order()).indexOf('library') < (await order()).indexOf('pinned'), (await order()).join())
  if (process.env.QA_SHOTS) await h.screenshot({ path: `${process.env.QA_SHOTS}/side-after.png`, clip: { x: 0, y: 0, width: 260, height: 1300 } })
  // Favourite tags: none to start; the heading opens the Tags page; a heart on a Tags row (or its menu) makes one.
  const sideTags = () => h.evaluate(() => [...document.querySelectorAll('aside [data-side-tag]')].map((one) => one.getAttribute('data-side-tag')))
  // How many is the book's to say (four on 8 Nov, five since the Greek myth deck came on the 9th: main/sandbox.ts):
  // a few, and each one a row in the sidebar, which is what they are kept for.
  const kept = (await v('settings')).sideTags ?? []
  const rows = await sideTags()
  check('the example book keeps a few favourites, each a row in the sidebar', kept.length >= 3 && kept.length <= 6 && kept.every((tag) => rows.includes(tag)), `kept ${kept.join()} :: shown ${rows.join()}`)
  await v('settings:set', { sideTags: [] }); await wait(800)
  check('with none: none in the sidebar', !(await sideTags()).length, (await sideTags()).join())
  check('no favourites: the Tags heading has no fold chevron', (await h.locator('[data-tags-fold]').getAttribute('aria-expanded')) === null)
  await h.locator('[data-tags-fold]').click(); await wait(1200)
  const tagOne = await h.locator('[data-tag-row]').first().getAttribute('data-tag-row')
  check('no favourites: the heading opens the Tags page', !!tagOne)
  const heart = h.locator(`[data-tag-fav="${tagOne}"]`)
  check('a Tags row’s heart is hidden until pointed at', Number(await heart.evaluate((one) => getComputedStyle(one).opacity)) === 0)
  await h.locator(`[data-tag-row="${tagOne}"]`).hover(); await wait(300)
  check('pointed at, its heart shows', Number(await heart.evaluate((one) => getComputedStyle(one).opacity)) === 1)
  if (process.env.QA_SHOTS) await h.screenshot({ path: `${process.env.QA_SHOTS}/tags-heart-hover.png` })
  await heart.click(); await wait(900)
  check('the heart makes it a favourite: in the sidebar', (await sideTags()).includes(tagOne), (await sideTags()).join())
  check('and its heart stays, filled', Number(await heart.evaluate((one) => getComputedStyle(one).opacity)) === 1 && (await heart.getAttribute('aria-pressed')) === 'true')
  check('the toast says favourite', /favourite/.test(await h.locator('body').innerText()))
  if (process.env.QA_SHOTS) await h.screenshot({ path: `${process.env.QA_SHOTS}/tags-fav.png` })
  await h.locator(`aside [data-side-tag="${tagOne}"]`).click({ button: 'right' }); await wait(400)
  const line = h.locator('[role="menuitem"]', { hasText: 'Remove from favourites' })
  check('the sidebar row’s menu says "Remove from favourites"', (await line.count()) === 1)
  if (process.env.QA_SHOTS) await h.screenshot({ path: `${process.env.QA_SHOTS}/side-fav-menu.png`, clip: { x: 0, y: 0, width: 520, height: 1300 } })
  await line.click(); await wait(800)
  check('"Remove from favourites": it leaves the sidebar', !(await sideTags()).includes(tagOne), (await sideTags()).join())
  await h.locator(`[data-tag-row="${tagOne}"]`).click({ button: 'right' }); await wait(400)
  await h.locator('[role="menuitem"]', { hasText: 'Add to favourites' }).click(); await wait(800)
  check('a Tags row’s menu "Add to favourites" brings it back', (await sideTags()).includes(tagOne), (await sideTags()).join())
} catch (e) { check('ran', false, e.message.split('\n')[0]) }
await close()
done()

// A new page from the sidebar, Notion's way (the user, 15 Nov 2026: "what if i want to add a new page?", then "yes" to
// Notion's "+" "Add a page inside" and "···"): the "+" beside Writing makes a page and opens it; a folder's "+" makes
// it inside that folder; Writing's right-click menu says "New page" (and still "New folder"); the "···" beside the "+"
// opens that same menu; a folder's menu says "New page inside"; Writing's own "New page", inside a folder, makes it
// there; Gems' "+" still makes a folder. Each new page is opened, and both buttons show the hand.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/side-new-page.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { h, v } = c
const pages = async () => new Set((await v('items', 'article')).map((one) => one.id))
// What one act made: the one page that was not there before, opened, and the folder it is in (null for none).
const made = async (before) => {
  await h.waitForTimeout(1200)
  const fresh = [...(await pages())].filter((id) => !before.has(id))
  const id = fresh[0]
  const opened = id ? (await h.locator(`[data-open="${id}"]`).count()) > 0 : false
  const folder = id ? ((await v('groups', 'article')).find((one) => one.members.includes(id))?.id ?? null) : undefined
  return { count: fresh.length, id, opened, folder }
}
const menuLine = (words) => h.locator('[role=menu] [role=menuitem]', { hasText: words }).first()
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const trips = await v('groups:make', 'article', 'Trips', null)
  await h.waitForTimeout(800)
  const writing = h.locator('[data-side-row][aria-label="Writing"]')

  // 1. The "+" beside Writing: a new page, opened, at the top level.
  await writing.hover()
  await h.waitForTimeout(300)
  const plus = h.locator('[data-folder-new="article"]')
  const more = h.locator('[data-side-more="article"]')
  check('pointed at, Writing shows a "+" and a "···"', (await plus.isVisible()) && (await more.isVisible()))
  check('both show the hand', (await plus.evaluate((el) => getComputedStyle(el).cursor)) === 'pointer' && (await more.evaluate((el) => getComputedStyle(el).cursor)) === 'pointer')
  let before = await pages()
  await plus.click()
  let got = await made(before)
  check('the "+" makes one page and opens it, in no folder', got.count === 1 && got.opened && got.folder === null, JSON.stringify(got))

  // 2. A folder's "+": the page is made inside it.
  const folderRow = h.locator(`[data-side-folder="${trips}"]`)
  await folderRow.hover()
  await h.waitForTimeout(300)
  before = await pages()
  await h.locator(`[data-folder-new-page="${trips}"]`).click()
  got = await made(before)
  check('a folder\'s "+" makes the page inside that folder, opened', got.count === 1 && got.opened && got.folder === trips, JSON.stringify(got))

  // 3. Writing's right-click menu: "New page" and "New folder".
  await writing.click({ button: 'right' })
  await h.waitForTimeout(500)
  check('Writing\'s menu has "New page" and "New folder"', (await menuLine('New page').count()) === 1 && (await menuLine('New folder').count()) === 1)
  before = await pages()
  await menuLine('New page').click()
  got = await made(before)
  check('its "New page" makes one page and opens it', got.count === 1 && got.opened && got.folder === null, JSON.stringify(got))

  // 4. The "···": the same menu.
  await writing.hover()
  await h.waitForTimeout(300)
  await more.click()
  await h.waitForTimeout(500)
  check('the "···" opens Writing\'s menu', (await menuLine('New page').count()) === 1 && (await menuLine('New folder').count()) === 1)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(400)

  // 5. A folder's own menu: "New page inside".
  await folderRow.click({ button: 'right' })
  await h.waitForTimeout(500)
  before = await pages()
  await menuLine('New page inside').click()
  got = await made(before)
  check('a folder\'s "New page inside" makes the page in it, opened', got.count === 1 && got.opened && got.folder === trips, JSON.stringify(got))

  // 6. Writing's own "New page" button, with the folder open: the page goes in the folder. The page made last is
  // still open over the list at this width, so Esc first, back to the folder's list, as a person would.
  await folderRow.click()
  await h.waitForTimeout(1200)
  const newButton = h.locator('[data-new-writing="article"] >> visible=true')
  if (!(await newButton.count())) { await h.keyboard.press('Escape'); await h.waitForTimeout(800) }
  before = await pages()
  await newButton.first().click()
  got = await made(before)
  check('Writing\'s own "New page", inside a folder, makes the page in it', got.count === 1 && got.opened && got.folder === trips, JSON.stringify(got))

  // 7. Gems' "+" still makes a folder, named at once.
  const gems = h.locator('[data-side-row][aria-label="Gems"]')
  if (await gems.count()) {
    await gems.hover()
    await h.waitForTimeout(300)
    const gemsPlus = h.locator('[data-folder-new="nugget"]')
    if (await gemsPlus.count()) {
      await gemsPlus.click()
      await h.waitForTimeout(700)
      check('Gems\' "+" still makes a folder, its name open for typing', (await h.locator('aside input[data-folder-name]').count()) === 1)
      await h.keyboard.press('Escape')
    } else check('Gems shows its "+" when pointed at', false)
  } else check('Gems is in the sidebar', false)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()

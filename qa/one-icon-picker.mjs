// One icon picker at a time, and a press in the sidebar's folders shuts whatever popover is up. Reported 12 Nov with
// a picture: two emoji pickers open at once, one under “Obsidian” and one under “YouTube”, Writing's folders in the
// sidebar. Each folder's row keeps its own picker, and the sidebar stopped every press inside its folders from
// travelling on (home.tsx, `stopPropagation`, so that a folder pressed on is not Writing carried away): the document
// never heard it, and that is where every open popover listens for a press outside itself. The row's carry now
// ignores those presses (lib/own-press.ts) and the press itself goes on.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [QA_SHOTS=<dir>] node qa/one-icon-picker.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS
/** The icon pickers up now: where each stands. */
const pickers = () => h.evaluate(() => [...document.querySelectorAll('[data-slot="popover-content"]')].filter((one) => one.querySelector('input[placeholder^="Search emoji"]') && one.getClientRects().length).map((one) => { const box = one.getBoundingClientRect(); return { top: Math.round(box.top), left: Math.round(box.left) } }))
/** A real press at an element's middle, as a hand makes it: down and up where it is, whatever is drawn over it. */
const press = async (locator) => { const box = await locator.boundingBox(); await h.mouse.click(box.x + box.width / 2, box.y + box.height / 2) }

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  await go('home'); await wait(1200)
  const icons = h.locator('aside [data-folder-icon]')
  const n = await icons.count()
  check('the sidebar shows two folders or more, each with its icon', n >= 2, String(n))
  // The lower folder first (its picker opens under it), then the one above, which nothing covers.
  const lower = icons.nth(1), upper = icons.nth(0)
  const [lowerBox, upperBox] = [await lower.boundingBox(), await upper.boundingBox()]
  await press(lower); await wait(500)
  let up = await pickers()
  check('a folder\'s icon pressed: its picker, one', up.length === 1 && up[0].top > lowerBox.y, JSON.stringify(up))
  await press(upper); await wait(600)
  up = await pickers()
  if (shots) await h.screenshot({ path: `${shots}/one-icon-picker.png` })
  check('another folder\'s icon pressed: still one picker', up.length === 1, JSON.stringify(up))
  check('...and it is that folder\'s, under its row', up.length === 1 && up[0].top > upperBox.y && up[0].top < lowerBox.y + lowerBox.height + 12, JSON.stringify({ up, upperBox, lowerBox }))
  await h.keyboard.press('Escape'); await wait(400)
  check('Esc: none', (await pickers()).length === 0)

  // A press on a folder's own row (not its icon) shuts a picker that is up, and opens the folder.
  await press(lower); await wait(500)
  check('a picker is up again', (await pickers()).length === 1)
  const row = h.locator('aside [data-side-folder]').nth(0)
  const name = await row.getAttribute('data-folder-name')
  const rowBox = await row.boundingBox()
  await h.mouse.click(rowBox.x + rowBox.width - 30, rowBox.y + rowBox.height / 2); await wait(700)
  check('a folder\'s row pressed: the picker shuts', (await pickers()).length === 0, JSON.stringify(await pickers()))
  check('...and the folder opens', await h.evaluate((name) => document.querySelector('aside [data-side-folder][aria-current="page"]')?.getAttribute('data-folder-name') === name, name), String(name))

  // The reason the press used to be stopped still holds: a folder carried is the folder, never the section's row.
  const before = await h.evaluate(() => [...document.querySelectorAll('aside [data-side-folder]')].map((one) => one.getAttribute('data-folder-name')))
  const from = await h.locator('aside [data-side-folder]').nth(0).boundingBox()
  await h.mouse.move(from.x + from.width - 40, from.y + from.height / 2)
  await h.mouse.down()
  await h.mouse.move(from.x + from.width - 40, from.y + from.height / 2 + 8, { steps: 3 })
  await h.mouse.move(from.x + from.width - 40, from.y + from.height / 2 + 30, { steps: 6 })
  await wait(300)
  const mid = await h.evaluate(() => ({ folder: !!document.querySelector('aside [data-carried-folder]'), section: !!document.querySelector('aside [data-sortable-id][aria-pressed="true"], aside [data-carry-hand]') }))
  await h.keyboard.press('Escape'); await h.mouse.up(); await wait(500)
  check('a folder dragged: the folder is what is carried', mid.folder === true, JSON.stringify(mid))
  const after = await h.evaluate(() => [...document.querySelectorAll('aside [data-side-folder]')].map((one) => one.getAttribute('data-folder-name')))
  check('Esc puts it back: the folders as they were', JSON.stringify(after) === JSON.stringify(before), JSON.stringify({ before, after }))
  const sections = await h.evaluate(() => [...document.querySelectorAll('aside [data-side-row][data-side-section], aside [data-side-row][data-side-view]')].map((one) => one.textContent.trim().slice(0, 12)))
  check('no page errors', c.errors.length === 0, c.errors.join(' | '))
  void sections
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error).slice(0, 400))
} finally {
  await c.close()
}
done()

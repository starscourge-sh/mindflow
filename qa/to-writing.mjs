// A capture can be moved to Writing (11 Nov): by W on a lit row, by its right-click menu, by a selection's menu
// ("Move 2 to Writing"), by the button on an open capture, and by carrying it onto Writing or one of its folders in
// the sidebar. Each time it leaves the Inbox, a page with its words is in Writing, one notice says where it went with
// Undo, ⌘Z takes it back, and a link to the capture opens the page. Real keys and a real pointer throughout.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/to-writing.mjs
// On a copy of a real book: QA_ARGS= QA_DATA=<the copy> (it uses whatever captures are open there).
import { sandbox } from './sandbox-lib.mjs'
const c = await sandbox({ width: 1440, height: 900, at: '14:10' })
const { h, v, go } = c
let ok = true
const check = (name, pass, detail = '') => { ok &&= !!pass; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => h.waitForTimeout(ms)
const dir = process.env.SHOT
const shoot = async (name) => { if (dir) await h.screenshot({ path: `${dir}-${name}.png` }) }
const open = async () => (await h.evaluate(() => window.api.captures.list())).filter((one) => one.status === 'open' && !one.archivedAt)
const pages = () => v('items', 'article')
const said = () => h.evaluate(() => document.querySelector('[role="status"]')?.textContent ?? '')
const row = (id) => h.locator(`[data-pane] [data-row][data-id="${id}"]`).first()
const undoKey = async () => { await h.keyboard.press('Meta+z'); await wait(700) }
// The rows on the page that are open captures, top to bottom.
const rowsShown = () => h.evaluate(() => [...document.querySelectorAll('[data-pane] [data-row][data-type="capture"][data-id]')].filter((one) => one.offsetParent).map((one) => one.dataset.id))
const pageOf = async (capture) => (await v('lineage', capture)).became.find((one) => one.type === 'article')

try {
  await v('settings:set', { hintRate: 0 })
  await go('inbox'); await wait(1500)
  const before = { open: (await open()).length, pages: (await pages()).length }
  const openIds = new Set((await open()).map((one) => one.id))
  const shown = (await rowsShown()).filter((id) => openIds.has(id))
  check('the Inbox shows open captures to work with', shown.length >= 6, `${shown.length} rows, ${before.open} open, ${before.pages} pages`)

  // 1. W on the lit row.
  {
    const id = shown[0]
    await row(id).hover(); await wait(200)
    await h.keyboard.press('w'); await wait(900)
    await shoot('key')
    const page = await pageOf(id)
    check('W: the notice says where it went', /^Moved to Writing/.test(await said()), await said())
    check('W: the capture left the Inbox and a page holds its words', (await open()).length === before.open - 1 && (await pages()).length === before.pages + 1 && !!page)
    check('W: its row is gone from the list', !(await rowsShown()).includes(id))
    check('W: the notice offers Open and Undo', await h.evaluate(() => { const t = document.querySelector('[role="status"]'); return /Open/.test(t?.textContent ?? '') && /Undo/.test(t?.textContent ?? '') }), await said())
    // A link to the capture, followed: the page opens.
    const kept = await h.evaluate((id) => window.api.captures.get(id).then((one) => one?.status), id)
    check('W: the capture is kept behind the page, so links to it still open', kept === 'promoted' && !!page, `${kept}`)
    await undoKey()
    check('⌘Z: the capture is back in the Inbox and the page is gone', (await open()).length === before.open && (await pages()).length === before.pages && (await rowsShown()).includes(id), `${(await open()).length} open, ${(await pages()).length} pages`)
  }

  // 2. The row's right-click menu, "Turn it into", "Move to Writing"; undone by the notice's own Undo.
  {
    const id = shown[1]
    await row(id).click({ button: 'right' }); await wait(400)
    await h.getByRole('menuitem', { name: /Turn it into/ }).hover(); await wait(400)
    await shoot('menu')
    const line = h.getByRole('menuitem', { name: /Move to Writing/ })
    check('menu: "Move to Writing" is beside the other things it can become, with its key', (await line.count()) === 1 && /W/.test(await line.textContent()), await line.textContent().catch(() => 'none'))
    await line.click(); await wait(900)
    check('menu: moved, and said', /^Moved to Writing/.test(await said()) && (await open()).length === before.open - 1 && !!(await pageOf(id)), await said())
    await h.locator('[role="status"]').getByRole('button', { name: /Undo/ }).click(); await wait(700)
    check('Undo in the notice: back in the Inbox', (await open()).length === before.open && (await pages()).length === before.pages)
  }

  // 3. Two picked, their menu counts them.
  {
    const [a, b] = [shown[2], shown[3]]
    await row(a).click({ modifiers: ['Meta'] }); await wait(150)
    await row(b).click({ modifiers: ['Meta'] }); await wait(250)
    await row(b).click({ button: 'right' }); await wait(400)
    await shoot('many-menu')
    const line = h.getByRole('menuitem', { name: /^Move 2 to Writing/ })
    check('selection: the menu says "Move 2 to Writing"', (await line.count()) === 1)
    await line.click(); await wait(1200)
    check('selection: both moved, one notice counting them', /^Moved 2 to Writing/.test(await said()) && (await open()).length === before.open - 2 && (await pages()).length === before.pages + 2, await said())
    await undoKey()
    check('selection: ⌘Z brings both back', (await open()).length === before.open && (await pages()).length === before.pages)
    await h.keyboard.press('Escape'); await wait(200)
  }

  // 4. Carried onto Writing in the sidebar, and onto one of its folders.
  const carry = async (id, target, name) => {
    const from = await row(id).boundingBox()
    const to = await target.boundingBox()
    await h.mouse.move(from.x + 60, from.y + from.height / 2)
    await h.mouse.down()
    for (let i = 1; i <= 12; i++) { await h.mouse.move(from.x + 60 + ((to.x + to.width / 2 - from.x - 60) * i) / 12, from.y + from.height / 2 + ((to.y + to.height / 2 - from.y - from.height / 2) * i) / 12); await wait(30) }
    await wait(250)
    const label = await h.evaluate(() => document.querySelector('[data-split-card] [data-drag-label]')?.textContent ?? '')
    const lit = await target.evaluate((el) => el.dataset.queueHot !== undefined)
    await shoot(name)
    await h.mouse.up(); await wait(1100)
    return { label, lit }
  }
  {
    const id = shown[4]
    const writing = h.locator('[data-writing-drop]').first()
    check('the sidebar shows Writing', (await writing.count()) === 1)
    const got = await carry(id, writing, 'drag-writing')
    check('drag: Writing lights and the card says what letting go will do', got.lit && got.label === 'Move to Writing', `lit ${got.lit}, "${got.label}"`)
    check('drag: moved, and said', /^Moved to Writing/.test(await said()) && (await open()).length === before.open - 1 && !!(await pageOf(id)), await said())
    await undoKey()
    check('drag: ⌘Z brings it back', (await open()).length === before.open)
    const folder = h.locator('[data-folder-drop][data-folder-list="article"]').first()
    if (await folder.count()) {
      const name = await folder.getAttribute('data-folder-name')
      const into = await carry(id, folder, 'drag-folder')
      check('drag to a folder: it lights and the card names the folder', into.lit && into.label === `Move to “${name}”`, `lit ${into.lit}, "${into.label}"`)
      const page = await pageOf(id)
      const inFolder = page && (await pages()).find((one) => one.id === page.id)
      check('drag to a folder: the notice names the folder and the page is in it', (await said()).startsWith(`Moved to “${name}”`) && !!inFolder, `${await said()} ${JSON.stringify(inFolder && { group: inFolder.groupId ?? inFolder.group })}`)
      await undoKey()
      check('drag to a folder: ⌘Z brings it back', (await open()).length === before.open && (await pages()).length === before.pages)
    } else check('Writing has a folder in the sidebar to carry onto', false, 'none shown')
  }

  // 5. The button on an open capture, in its details.
  {
    const id = shown[5]
    await row(id).click(); await wait(900)
    let button = h.locator('[data-to-writing-prop]').first()
    if (!(await button.count())) { await h.getByRole('button', { name: /Details/ }).first().click(); await wait(600); button = h.locator('[data-to-writing-prop]').first() }
    await shoot('open-capture')
    check('open capture: "Move to Writing" is among its ways out', (await button.count()) === 1)
    await button.click(); await wait(1000)
    check('open capture: moved, and said', /^Moved to Writing/.test(await said()) && (await open()).length === before.open - 1 && !!(await pageOf(id)), await said())
    // The notice's Open goes to the page.
    await h.locator('[role="status"]').getByRole('button', { name: /Open/ }).click(); await wait(1200)
    await shoot('opened-page')
    const page = await pageOf(id)
    const tabs = await h.evaluate(() => [...document.querySelectorAll('[data-tab][data-tab-open]')].map((one) => one.dataset.tabOpen))
    check('Open in the notice shows the page, in a tab of its own', !!page && tabs.includes(`article:${page.id}`), tabs.join(' '))
    await go('inbox'); await wait(900)
    check('counts agree: one fewer in the Inbox, one more page', (await open()).length === before.open - 1 && (await pages()).length === before.pages + 1)
  }
} catch (error) { check('the run finished', false, String(error.message).split('\n')[0]) }
const errs = c.errors.filter((one) => !/Autofill|DevTools/.test(one))
check('no errors on the page', !errs.length, errs.slice(0, 2).join(' | '))
console.log(ok ? 'all passed' : 'some failed')
await c.close(); process.exit(ok ? 0 : 1)

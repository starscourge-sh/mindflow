// An everyday user keeps a task linked to a web page (the user, 22 Nov: "why this is done well but after task created
// it's back to raw link", "how then does one remove the link?", "would Apple or Dia style the associated details box
// like this?"). A Fandom link pasted into the add bar is a chip with the page's title; the task made from it shows
// the SAME chip on its row and on its page, never the raw address; hovering the chip shows its ×, which takes the
// link off with an Undo that puts it back; ⇧↵ grows the add bar itself downward into a details area (one border,
// not a second box), and ⌘↵ adds the task with its description. Main's link lookup is stood in for: nothing is asked
// of the web, and pastes are synthetic events, so the Mac's clipboard is never touched.
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [QA_SHOTS=/abs/dir] node qa/task-link-chip.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { electron, h, go, both, errors } = c
const wait = (ms) => h.waitForTimeout(ms)
const sql = (q, ...args) => electron.evaluate((_, [q, args]) => globalThis.qaFeedSql(q, ...args), [q, args])
const FANDOM = 'https://harrypotter.fandom.com/wiki/Harry_Potter'
const WIKI = 'https://en.wikipedia.org/wiki/Commonplace_book'
const ADD = 'form input[data-task-input]'
// Pictures for the lead to read by eye: the bar shut and open, the row with its chip, the task's page.
const SHOT = process.env.QA_SHOTS ?? process.env.SHOTS
// Each pair written is said, so a missing one shows in the run's own output.
const shoot = async (name) => { if (!SHOT) return; await both(`${SHOT}/${name}`); console.log(`  picture ${SHOT}/${name}-light.png, -dark.png`) }
const ICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#fa005a"/></svg>')}`
const paste = (text) => h.evaluate((t) => {
  const data = new DataTransfer()
  data.setData('text/plain', t)
  document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
}, text)
const rawShown = (text) => /https?:\/\/|harrypotter\.fandom\.com\/|wikipedia\.org\//.test(text)
try {
  await electron.evaluate(({ ipcMain }, icon) => {
    ipcMain.removeHandler('fetch-link-metadata')
    ipcMain.handle('fetch-link-metadata', (_event, href) => ({ href, title: /fandom/.test(href) ? 'Harry Potter' : 'Commonplace book', description: '', image: '', icon, site: '' }))
  }, ICON)
  await go('today')

  // 1 Pasted into the add bar: a chip with the page's title, the address not in the words.
  await h.click(ADD)
  await h.keyboard.type('Reread the first chapter ', { delay: 10 })
  await paste(FANDOM)
  await wait(700)
  const barChip = await h.locator('form [data-task-link] [data-link-title]').innerText().catch(() => '')
  check('1 the add bar shows the link as a chip titled by its page', barChip === 'Harry Potter' && !rawShown(await h.$eval(ADD, (el) => el.value)), barChip)
  await h.keyboard.press('Enter')
  await wait(1500)

  // 2 The task made: its row and its page show the same chip, never the raw address.
  const made = (await sql('select id, title, link, link_title as linkTitle from tasks where link = ?', FANDOM))[0]
  check('2 the task keeps the link and the page\'s title beside its own name', made?.title === 'Reread the first chapter' && made.linkTitle === 'Harry Potter', JSON.stringify(made))
  const row = h.locator('[data-task-row]', { hasText: 'Reread the first chapter' }).first()
  await row.scrollIntoViewIfNeeded()
  const rowText = await row.innerText()
  check('2 the row shows the chip ("Harry Potter" with its icon), no raw address', (await row.locator('[data-task-link] [data-link-title]').innerText()) === 'Harry Potter' && (await row.locator('[data-task-link] img').count()) === 1 && !rawShown(rowText), rowText)
  // Hovered, its × comes up in room it already had: nothing beside it moves.
  const chip = row.locator('[data-task-link]')
  const before = await chip.boundingBox()
  const hidden = await row.locator('[data-link-remove]').evaluate((el) => getComputedStyle(el).opacity)
  await chip.hover()
  await wait(300)
  const after = await chip.boundingBox()
  const shown = await row.locator('[data-link-remove]').evaluate((el) => getComputedStyle(el).opacity)
  check('3 hovering the chip shows its × without the chip changing size', hidden === '0' && shown === '1' && Math.abs(before.width - after.width) < 0.5, JSON.stringify({ hidden, shown, w: [before.width, after.width] }))
  await shoot('lc1-row-hover')

  await row.locator('[data-title]').click()
  await h.waitForSelector('[data-task-name]', { timeout: 5000 })
  await wait(400)
  const pageRow = h.locator('[data-task-link-row]')
  check('4 the task\'s page shows the same chip under its name, no raw address', (await pageRow.locator('[data-link-title]').innerText()) === 'Harry Potter' && !rawShown(await pageRow.innerText()))
  await shoot('lc2-page')

  // 5 The × on the page takes the link off; Undo puts it back, title and icon too.
  await pageRow.locator('[data-task-link]').hover()
  await wait(250)
  await pageRow.locator('[data-link-remove]').click()
  await wait(800)
  const gone = (await sql('select link, link_title as linkTitle from tasks where id = ?', made.id))[0]
  check('5 the × removes the link, its chip folding away on the page and the row', gone?.link === null && (await h.locator('[data-task-link-row]').count()) === 0 && (await row.locator('[data-task-link]').count()) === 0, JSON.stringify(gone))
  await h.getByRole('button', { name: /^Undo/ }).first().click()
  await wait(900)
  const back = (await sql('select link, link_title as linkTitle, link_icon as icon from tasks where id = ?', made.id))[0]
  check('5 Undo puts the link back as it was, its chip again', back?.link === FANDOM && back.linkTitle === 'Harry Potter' && !!back.icon && (await h.locator('[data-task-link-row] [data-link-title]').innerText().catch(() => '')) === 'Harry Potter', JSON.stringify(back))
  await h.keyboard.press('Escape'); await wait(500)

  // 5b Taken off from the row's own ×: the chip folds away over frames (its width gliding), never gone in one.
  await row.locator('[data-task-link]').hover()
  await wait(250)
  await row.locator('[data-link-remove]').click()
  // What the click did, said in the output: whether it reached unlinkTask, the link in the book, the notices up, where the page is.
  const widths = []
  for (let n = 0; n < 8; n++) { widths.push(Math.round((await row.locator('[data-task-link-wrap]').boundingBox({ timeout: 100 }).catch(() => null))?.width ?? 0)); await wait(30) }
  check('5b removed from the row, the chip glides away rather than vanishing', widths[0] > 0 ? widths.some((one, n) => n > 0 && one > 0 && one < widths[0] - 2) : false, JSON.stringify(widths))
  // The row's removal says so with Undo too; it is taken back by its button, or ⌘Z if the notice has gone.
  const undo = h.getByRole('button', { name: /^Undo/ }).first()
  if (await undo.waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false)) await undo.click()
  else await h.keyboard.press('Meta+z')
  await wait(900)
  check('5c the row\'s removal is undone too: the link is back', (await sql('select link from tasks where id = ?', made.id))[0]?.link === FANDOM)

  // 6 ⇧↵ grows the add bar into one surface with a details area; ⌘↵ adds the task with its description.
  await h.click(ADD)
  await paste(WIKI)
  await wait(500)
  const form = h.locator('form:has(input[data-task-input])').first()
  const shut = (await form.boundingBox()).height
  await shoot('lc0-bar-shut')
  await h.keyboard.press('Shift+Enter')
  // Read through the opening: the height moves in steps, never all at once.
  const heights = []
  for (let n = 0; n < 8; n++) { heights.push(Math.round((await form.boundingBox()).height)); await wait(40) }
  const open = (await form.boundingBox()).height
  const surface = await h.evaluate(() => {
    const box = document.querySelector('[data-task-details-box]')
    const form = box?.closest('form')
    // Any drawn line inside the field but the link chips' own pills: a side with width and colour, on something on show.
    const lined = (el) => {
      const look = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 && look.visibility !== 'hidden' && ['Top', 'Right', 'Bottom', 'Left'].some((side) => parseFloat(look[`border${side}Width`]) > 0 && look[`border${side}Style`] !== 'none' && !/rgba\(.*,\s*0\)$|transparent/.test(look[`border${side}Color`]))
    }
    // Keycaps (kbd) are the app's drawings of keys, not boxes: left out, the rest held strictly.
    const borders = [...(form?.querySelectorAll('*') ?? [])].filter((el) => lined(el) && !el.closest('[data-task-link], kbd'))
    return { inside: !!form, borders: borders.map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')}`), typing: !!document.activeElement?.closest('[data-task-details-box] .ProseMirror'), chrome: !!box?.querySelector('.tiptap-drag-handle, .tiptap-word-count') }
  })
  check('6 ⇧↵ grows the add bar itself: the details sit inside its one border, no second box', surface.inside && surface.borders.length === 0 && open > shut + 16 && surface.typing && !surface.chrome, JSON.stringify({ surface, shut, open }))
  check('6 it grows smoothly: frames between shut and open', heights.some((one) => one > shut + 2 && one < open - 2), JSON.stringify(heights))
  await h.keyboard.type('Start one in the new notebook.', { delay: 10 })
  await shoot('lc3-details')
  await h.keyboard.press('Meta+Enter')
  await wait(1500)
  const withNotes = (await sql('select title, notes, link, link_title as linkTitle from tasks where link = ?', WIKI))[0]
  check('7 ⌘↵ adds the task with its description, its link titled by the page', String(withNotes?.notes ?? '').includes('Start one in the new notebook') && withNotes.linkTitle === 'Commonplace book', JSON.stringify(withNotes))
  // Named by the page's own title, the task's chip says the site instead: "Commonplace book" never twice in its row.
  const wikiRow = h.locator('[data-task-row]', { hasText: 'Commonplace book' }).first()
  check('8 a task named by its page\'s title: the chip says the site, so the title is not said twice', withNotes.title === 'Commonplace book' && (await wikiRow.locator('[data-link-title]').innerText().catch(() => '')) === 'en.wikipedia.org', await wikiRow.innerText().catch(() => ''))
  await shoot('lc4-row-site')
  check('7 the bar folds back to one line, empty', !(await h.$('[data-task-details-box]')) && !(await h.$('form [data-task-link]')) && Math.abs((await form.boundingBox()).height - shut) < 2)

  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the probe ran to its end', false, error.message)
} finally {
  await c.close()
  done()
}

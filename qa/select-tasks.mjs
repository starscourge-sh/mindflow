// Lines selected and made tasks, walked as a person would, first in a fresh
// install (so the first capture's celebration is real) and then in the sandbox.
// In quick capture: a bullet list with #tags and a step, picked with ⇧-arrows
// or a mouse drag, offers “3 tasks, 1 step”; taking it makes those tasks, and
// the lines leave the box (the box stays up, nothing kept as a note, no
// checkbox-and-bullet lines left); Undo brings them back. A note sent from the
// box then earns “Your first capture”, which shows in the main window, never
// half drawn in the box as it goes, and is not there when the box is reopened.
// In a note: each selected bullet becomes its own linked to-do, steps nested,
// never one to-do wrapping the list. The box with its side panel fills its
// width, both columns with even margins, after the box was promoted (⌘O) too.
//   npx electron-vite build --outDir out-x
//   QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=<dir> node qa/select-tasks.mjs
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { _electron } from 'playwright'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const folders = []

async function launch(sandbox) {
  const data = mkdtempSync(join(tmpdir(), 'mindflow-seltasks-'))
  folders.push(data)
  const app = await _electron.launch({ args: [resolve(process.env.QA_ENTRY ?? '.'), ...(sandbox ? ['--sandbox'] : [])], env: { ...process.env, MINDFLOW_QA_AWAY: '1', MINDFLOW_USER_DATA: data } })
  let box, home
  for (let i = 0; i < 80 && !(box && home); i++) {
    await new Promise((r) => setTimeout(r, 250))
    box = app.windows().find((w) => !w.url().includes('view='))
    home = app.windows().find((w) => w.url().includes('view=home'))
  }
  const errors = []
  for (const [name, page] of [['box', box], ['home', home]]) page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  await box.waitForSelector('.tiptap.ProseMirror', { timeout: 20000 })
  const v = (channel, ...args) => home.evaluate(([c, a]) => window.api.vigil(c, ...a), [channel, args])
  if (sandbox) for (let i = 0; i < 150; i++) { const s = await v('sandbox:state').catch(() => null); if (s?.seeded) break; await home.waitForTimeout(200) }
  const boxShown = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view='))?.isVisible())
  const close = () => { try { app.process().kill('SIGKILL') } catch {} }
  return { app, box, home, errors, v, boxShown, close }
}
const shot = (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, timeout: 8000 }).catch(() => {})
const editorText = (page) => page.evaluate(() => document.querySelector('.tiptap.ProseMirror')?.innerText.trim())
const celebration = (page) => page.evaluate(() => [...document.querySelectorAll('[data-celebration]')].map((one) => one.innerText.trim()).filter(Boolean).join(' '))
const LINES = [['- #home buy oat milk', 0], ['#work send the invoice', 0], ['print it first', 1], ['#home fix the bike light', -1]]
async function typeList(page) {
  await page.click('.tiptap.ProseMirror')
  for (const [i, [line, indent]] of LINES.entries()) {
    if (i) await page.keyboard.press('Enter')
    if (indent > 0) await page.keyboard.press('Tab')
    if (indent < 0) await page.keyboard.press('Shift+Tab')
    await page.keyboard.type(line, { delay: 12 })
  }
  await page.waitForTimeout(400)
}
async function selectUp(page) {
  await page.keyboard.down('Shift')
  for (let i = 0; i < LINES.length - 1; i++) await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Home')
  await page.keyboard.up('Shift')
  await page.waitForTimeout(600)
}
const make = (page) => page.locator('[data-make-tasks]')
const ourTasks = async (v) => (await v('tasks')).filter((one) => /oat milk|invoice|bike light/.test(one.title) && one.status !== 'dropped')

try {
  // ---------- a fresh install
  const one = await launch(false)
  const { box, home, v } = one
  await home.waitForTimeout(2500)
  const skip = home.getByRole('button', { name: /Skip the welcome/ })
  if (await skip.count()) {
    await skip.click()
    await home.waitForTimeout(1200)
    // Skipping goes to the welcome's last page; "Start without the tour" there closes it.
    await home.getByRole('button', { name: /Start without the tour|Skip the tips/ }).first().click()
    await home.waitForTimeout(1200)
  }
  await box.evaluate(() => window.api.showPrompt())
  await box.waitForTimeout(900)
  // Read once the box is shown: it settles the welcome's line each time it comes up (lib/welcome-box.ts).
  check('fresh: past the welcome', !(await box.evaluate(() => document.documentElement.hasAttribute('data-welcome-ph'))))
  await typeList(box)
  await selectUp(box)
  // Its words are its name (the button may show only part of them).
  const said = `${await make(box).innerText().catch(() => '')} ${await make(box).getAttribute('aria-label').catch(() => '')}`
  check('⇧-arrows over the list offer “3 tasks, 1 step”', /3 tasks, 1 step/i.test(said), said)
  await shot(box, 'fresh-1-selected')
  const notices = []
  const listen = setInterval(async () => { try { const text = (await box.locator('[role=status]').allInnerTexts()).filter((one) => one.trim()).join(' / ').replace(/\s+/g, ' '); if (text && notices.at(-1) !== text) notices.push(text) } catch {} }, 50)
  await make(box).click()
  await box.waitForTimeout(1500)
  clearInterval(listen)
  let tasks = await ourTasks(v)
  check('three tasks made', tasks.length === 3, tasks.map((one) => one.title).join(' | '))
  const invoice = tasks.find((one) => /invoice/.test(one.title))
  check('the indented line is a step of the task above', invoice?.subtasks?.length === 1 && /print it first/.test(invoice.subtasks[0].text ?? invoice.subtasks[0].title ?? ''), JSON.stringify(invoice?.subtasks))
  check('the box stays up', await one.boxShown())
  check('the lines left the box', !(await editorText(box)), JSON.stringify(await editorText(box)))
  check('no line left as a to-do with a bullet inside it', !(await box.locator('.tiptap li[data-checked] ul:not([data-type="taskList"])').count()))
  check('nothing kept as a note', (await box.evaluate(() => window.api.captures.list())).length === 0)
  check('the notice says “Made 3 tasks, with 1 step”', /^Made 3 tasks, with 1 step/.test(notices.at(-1) ?? ''), notices.join(' | '))
  await shot(box, 'fresh-2-made')
  await box.locator('[role=status]', { hasText: 'Made 3 tasks' }).getByRole('button', { name: /undo/i }).click()
  await box.waitForTimeout(1200)
  check('Undo takes the tasks back', (await ourTasks(v)).length === 0)
  check('and the lines come back into the box', /oat milk[\s\S]*invoice[\s\S]*print it first[\s\S]*bike light/.test(await editorText(box)), JSON.stringify(await editorText(box)))
  // A mouse drag over the same lines.
  const rows = box.locator('.tiptap.ProseMirror li p')
  const first = await rows.first().boundingBox()
  const last = await rows.last().boundingBox()
  await box.mouse.move(first.x + 2, first.y + first.height / 2)
  await box.mouse.down()
  await box.mouse.move(last.x + last.width - 2, last.y + last.height / 2, { steps: 10 })
  await box.mouse.up()
  await box.waitForTimeout(700)
  check('a mouse drag offers the same', /3 tasks, 1 step/i.test(`${await make(box).innerText().catch(() => '')} ${await make(box).getAttribute('aria-label').catch(() => '')}`))
  await make(box).click()
  await box.waitForTimeout(1500)
  check('made again by the drag', (await ourTasks(v)).length === 3 && !(await editorText(box)))
  // A note sent from the box: the first capture, celebrated in the main window.
  await box.click('.tiptap.ProseMirror')
  await box.keyboard.type('A thought worth keeping about the bike shop', { delay: 10 })
  await box.waitForTimeout(400)
  const seen = []
  const watch = setInterval(async () => { try { const text = await celebration(box); if (text) seen.push(text) } catch {} }, 40)
  await box.keyboard.press('Meta+Enter')
  await box.waitForTimeout(2500)
  clearInterval(watch)
  check('the note is kept', (await box.evaluate(() => window.api.captures.list())).length === 1)
  check('the box goes as a send does', !(await one.boxShown()))
  check('no card drawn in the box as it goes', !seen.length, seen.slice(0, 2).join(' / '))
  await home.evaluate(() => window.dispatchEvent(new Event('focus')))
  await home.waitForTimeout(1500)
  const there = await celebration(home)
  check('“Your first capture” shows in the main window', /Your first capture/.test(there), there)
  await shot(home, 'fresh-3-home-celebrates')
  await box.evaluate(() => window.api.showPrompt())
  await box.waitForTimeout(1500)
  check('reopened, the box has no card left in it', !(await celebration(box)), await celebration(box))
  check('reopened, the box is fresh', !(await editorText(box)))
  await shot(box, 'fresh-4-reopened')
  check('fresh: no errors', !one.errors.length, one.errors.slice(0, 3).join(' | '))
  one.close()

  // ---------- the sandbox
  const two = await launch(true)
  {
    const { box, home, v, app } = two
    await v('settings:set', { hintRate: 0 })
    // A note in the main window: each bullet its own linked to-do, steps nested.
    const id = await home.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Weekend' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Wash the van' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Plant the bulbs' }] }, { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Buy compost' }] }] }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Return the ladder' }] }] }] },
      { type: 'paragraph' }
    ] } }))
    await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.webContents.send('home:open', 'capture', id), id)
    await home.waitForTimeout(1500)
    // Selected from the first bullet on into the empty line after the list, as a drag past its end does.
    await home.evaluate(() => {
      const root = document.querySelector('.tiptap.ProseMirror[contenteditable="true"]')
      const items = [...root.querySelectorAll(':scope > ul p')]
      const after = root.querySelector(':scope > p:last-of-type')
      const range = document.createRange()
      range.setStart(items[0].firstChild, 0)
      range.setEnd(after, 0)
      getSelection().removeAllRanges()
      getSelection().addRange(range)
    })
    await home.waitForTimeout(700)
    const offer = home.locator('[data-make-tasks]')
    const offered = `${await offer.innerText().catch(() => '')} ${await offer.getAttribute('aria-label').catch(() => '')}`
    check('a note: the bullets offer “3 tasks, 1 step”', /3 tasks, 1 step/i.test(offered), offered)
    await offer.click()
    await home.waitForTimeout(1500)
    const root = home.locator('.tiptap.ProseMirror[contenteditable="true"]').first()
    check('a note: each line its own linked to-do', (await root.locator('li[data-task-id]').count()) === 3, `${await root.locator('li[data-task-id]').count()}`)
    check('a note: no to-do wraps a bullet list', !(await root.locator('li[data-checked] ul:not([data-type="taskList"])').count()))
    check('a note: the step stays nested under its task', (await root.locator('li[data-checked] ul[data-type="taskList"] li').count()) === 1)
    check('a note: the line above the list is left as it was', (await root.locator(':scope > p').first().innerText()) === 'Weekend')
    await shot(home, 'note-linked')

    // The box with its side panel: both columns fill, with even margins, also after a promote.
    const widths = () => box.evaluate(() => {
      const panels = document.querySelectorAll('[data-slot="resizable-panel"]')
      // The tab bar: the smallest thing in the panel holding all its tabs.
      const bar = [...(panels[panels.length - 1]?.querySelectorAll('*') ?? [])].filter((one) => ['Inbox', 'Tasks', 'Review', 'Saved'].every((tab) => one.innerText?.includes(tab))).at(-1)
      const column = panels[panels.length - 1]?.getBoundingClientRect()
      const at = bar?.getBoundingClientRect()
      return { window: innerWidth, group: document.querySelector('[data-slot="resizable-panel-group"]')?.getBoundingClientRect().width, column: column && Math.round(column.width), left: at && column ? Math.round(at.left - column.left) : null, right: at && column ? Math.round(column.right - at.right) : null }
    })
    await box.evaluate(() => window.api.showPrompt())
    await box.waitForTimeout(1200)
    if (!(await box.getByRole('tab', { name: /^Saved/ }).count())) (await box.keyboard.press('Meta+Backslash'), await box.waitForTimeout(1200))
    let w = await widths()
    check('box: the panel row fills the window', Math.abs((w.group ?? 0) - w.window) <= 1, JSON.stringify(w))
    check('box: the tab bar has even margins in its column', w.left !== null && Math.abs(w.left - w.right) <= 4, JSON.stringify(w))
    await shot(box, 'box-panel')
    await box.click('.tiptap.ProseMirror')
    await box.keyboard.type('Open this one in the main window', { delay: 10 })
    await box.waitForTimeout(500)
    await box.keyboard.press('Meta+o')
    await box.waitForTimeout(1500)
    await box.evaluate(() => window.api.showPrompt())
    await box.waitForTimeout(1500)
    const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view='))?.getSize())
    w = await widths()
    check('box after ⌘O: back to its own width', bounds[0] === 1080, `${bounds}`)
    check('box after ⌘O: the panel still fills, evenly', Math.abs((w.group ?? 0) - w.window) <= 1 && w.left !== null && Math.abs(w.left - w.right) <= 4, JSON.stringify(w))
    await shot(box, 'box-panel-after-promote')
    // Left wider than its own width by anything at all, it comes back at its own width, the panel filling it.
    await box.keyboard.press('Escape')
    await box.waitForTimeout(800)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view='))?.setSize(1230, 600))
    await box.evaluate(() => window.api.showPrompt())
    await box.waitForTimeout(1500)
    const wide = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view='))?.getSize())
    w = await widths()
    check('box left too wide: summoned at its own width, evenly filled', wide[0] === 1080 && Math.abs((w.group ?? 0) - w.window) <= 1 && w.left !== null && Math.abs(w.left - w.right) <= 4, `${wide} ${JSON.stringify(w)}`)
    check('sandbox: no errors', !two.errors.length, two.errors.slice(0, 3).join(' | '))
  }
  two.close()
} catch (error) {
  console.log('FAIL  ran to the end', error.message.split('\n')[0])
  results.push(false)
}
for (const folder of folders) rmSync(folder, { recursive: true, force: true })
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)

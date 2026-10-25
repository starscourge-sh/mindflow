// A task opened in quick capture gives its own content the room: its notes
// grow with what they hold (a link card, a picture) and are never cut off by a
// short inner box, Subtasks sits below them, and Sessions and Log come after
// in the same scroll. Checked in the box at 300, 360 and 700 tall, and in the
// main window's task panel, wide and narrow.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<dir>] node qa/box-task-room.mjs
import { mkdirSync, writeFileSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const c = await sandbox({ width: 1200, height: 800 })
const { page, electron, h } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => page.waitForTimeout(ms)
// The box by its own address: the stickies on the desk have no view= either.
const BOX = page.url()
const box = (fn, arg) => electron.evaluate(({ BrowserWindow }, [code, a, url]) => new Function('win', 'a', code)(BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === url), a), [fn, arg, BOX])
const shot = async (name, home = false) => {
  const png = await electron.evaluate(async ({ BrowserWindow }, [home, url]) => (await BrowserWindow.getAllWindows().find((w) => (home ? w.webContents.getURL().includes('view=home') : w.webContents.getURL() === url)).webContents.capturePage()).toPNG().toString('base64'), [home, BOX])
  writeFileSync(`${SHOT}/${name}.png`, Buffer.from(png, 'base64'))
}
// A picture with no network: a tall striped SVG, so a clipped bottom shows.
const art = (w, hh, colour) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hh}"><rect width="100%" height="100%" fill="${colour}"/><rect y="${hh - 20}" width="100%" height="20" fill="#111"/></svg>`)}`

// Each card and picture in the open task's notes, scrolled to its bottom: is the
// bottom inside the window, drawn there (nothing over it), and is any ancestor
// clipping it (overflow other than visible on the y axis, cutting it short)?
const measure = (win) => win.evaluate(() => {
  const pane = document.querySelector('.note-pane[data-open]')
  if (!pane) return null
  const things = [...pane.querySelectorAll('.tiptap-bookmark, .tiptap.ProseMirror img:not(.tiptap-bookmark-icon):not(.tiptap-bookmark-image)')]
  const out = things.map((one) => {
    one.scrollIntoView({ block: one.getBoundingClientRect().height < innerHeight - 40 ? 'center' : 'end' })
    const r = one.getBoundingClientRect()
    let clipper = null
    for (let up = one.parentElement; up && up !== pane; up = up.parentElement) {
      const s = getComputedStyle(up)
      const u = up.getBoundingClientRect()
      if (s.overflowY !== 'visible' && u.bottom < r.bottom - 1) { clipper = up.className.toString().slice(0, 60); break }
    }
    const atBottom = document.elementFromPoint(r.left + Math.min(30, r.width / 2), r.bottom - 3)
    return { kind: one.tagName === 'IMG' ? 'picture' : 'card', bottom: Math.round(r.bottom), h: Math.round(r.height), inView: r.bottom <= innerHeight - 2, drawn: !!atBottom && (one === atBottom || one.contains(atBottom)), clipper }
  })
  const notes = pane.querySelector('[data-grow] .haligtree-editor-wrapper')?.getBoundingClientRect()
  const subtasks = [...pane.querySelectorAll('h3')].find((one) => one.textContent.startsWith('Subtasks'))?.getBoundingClientRect()
  const reach = (word) => {
    const head = [...pane.querySelectorAll('aside *')].find((one) => one.children.length === 0 && one.textContent.trim().startsWith(word))
    if (!head) return false
    head.scrollIntoView({ block: 'center' })
    const r = head.getBoundingClientRect()
    const top = document.elementFromPoint(r.left + 4, r.top + r.height / 2)
    return r.top >= 0 && r.bottom <= innerHeight && !!top && (head === top || head.contains(top) || top.contains(head))
  }
  const sessions = reach('Sessions'), log = reach('Log')
  pane.querySelectorAll('*').forEach((one) => one.scrollTop && (one.scrollTop = 0))
  pane.scrollTop = 0
  return { things: out, notesBottom: notes && Math.round(notes.bottom), subtasksTop: subtasks && Math.round(subtasks.top), sessions, log }
})
const judge = (where, m) => {
  check(`${where}: the task is open, with a card and a picture in its notes`, m && m.things.filter((t) => t.kind === 'card').length >= 1 && m.things.filter((t) => t.kind === 'picture').length >= 1, JSON.stringify(m?.things))
  if (!m) return
  check(`${where}: each card's and picture's bottom can be scrolled into view, drawn, with nothing clipping it`, m.things.every((t) => t.inView && t.drawn && !t.clipper), JSON.stringify(m.things))
  check(`${where}: no picture is shrunk to a sliver (at least 100px tall)`, m.things.every((t) => t.h >= 100), JSON.stringify(m.things.map((t) => t.h)))
  check(`${where}: Subtasks starts below the notes, never over them`, m.subtasksTop != null && m.notesBottom != null && m.subtasksTop >= m.notesBottom - 1, `notes end ${m.notesBottom}, Subtasks at ${m.subtasksTop}`)
  check(`${where}: Sessions and Log can be reached`, m.sessions && m.log, JSON.stringify({ sessions: m.sessions, log: m.log }))
}

try {
  await c.v('settings:set', { hintRate: 0, motion: false })
  const { id } = await c.v('task:add', 'design the custom catalog and its owner logic today', undefined, true)
  const notes = { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'The walkthrough of how the catalog import and its pricing run:' }] },
    { type: 'bookmark', attrs: { href: 'https://www.loom.com/share/0000', title: 'Catalog Import and Pricing Workflow', description: 'How a catalog comes in, is priced, and who owns it.', image: art(1280, 720, '#6a5acd'), icon: '', site: 'Loom' } },
    { type: 'paragraph', content: [{ type: 'text', text: 'And the sketch of who owns what:' }] },
    { type: 'image', attrs: { src: art(600, 420, '#2e8b57') } },
    { type: 'paragraph', content: [{ type: 'text', text: 'Last line of the notes.' }] }
  ] }
  await c.v('task:save', id, { notes, subtasks: [{ text: 'List the catalog owners', done: false }, { text: 'Draft the import rules', done: false }] })

  // The box: the Today tab in its panel, the task opened from there.
  await page.evaluate(() => window.api.showPrompt())
  await wait(900)
  if (!(await page.locator('[aria-label="Hide the side panel"]').count())) await page.locator('[aria-label="Show the side panel"]').click().catch(() => {})
  await wait(400)
  await page.locator('[data-home="task"]').first().click()
  await wait(700)
  await page.locator(`[data-row][data-id="${id}"]`).first().click()
  await wait(1200)
  check('the box opened the task, with "Back to your note"', await page.getByText('Back to your note').count() > 0)
  for (const height of [300, 360, 700]) {
    await box('const b = win.getBounds(); win.setMinimumSize(200, a); win.setMaximumSize(b.width, a); win.setBounds({ ...b, height: a })', height)
    await wait(700)
    if (SHOT) await shot(`box-${height}`)
    judge(`the box at ${height} tall`, await measure(page))
    if (SHOT) {
      await page.evaluate(() => { const p = document.querySelector('.note-pane[data-open]'); p.querySelector('.tiptap-bookmark').scrollIntoView({ block: 'end' }) })
      await wait(200); await shot(`box-${height}-card`)
      await page.evaluate(() => { const p = document.querySelector('.note-pane[data-open]'); [...p.querySelectorAll('h3')].find((one) => one.textContent.startsWith('Subtasks')).scrollIntoView({ block: 'end' }) })
      await wait(200); await shot(`box-${height}-subtasks`)
      await page.evaluate(() => { const p = document.querySelector('.note-pane[data-open]'); p.scrollTop = 0 })
    }
  }
  await page.keyboard.press('Escape').catch(() => {})

  // The main window: the task's panel beside Today, wide, then narrow enough to stack.
  for (const [w, hh] of [[1400, 900], [1000, 640], [760, 640]]) {
    await electron.evaluate(({ BrowserWindow }, [w, hh]) => { const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home')); win.setBounds({ x: 40, y: 40, width: w, height: hh }); win.show() }, [w, hh])
    await h.waitForTimeout(500)
    await electron.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home')).webContents.send('home:open', 'task', id), id)
    await h.waitForTimeout(1500)
    if (SHOT) await shot(`main-${w}x${hh}`, true)
    judge(`the main window at ${w}x${hh}`, await measure(h))
  }
} catch (error) {
  check('ran without error', false, String(error).slice(0, 300))
} finally {
  await c.close()
}
const failed = results.filter((one) => !one).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)

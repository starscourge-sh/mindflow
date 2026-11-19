// A photo of a page read whole (row 6 of "What macOS Gives Haligtree"; macOS 26, Vision's RecognizeDocumentsRequest,
// on this Mac): a picture's right-click “Make it a note” gives a note whose page keeps its shape, the title a heading,
// a list a list, a table a table, with the notice “Made a note of the page, with a list and a table”. On an older Mac
// (HALIGTREE_QA_CAPS=macos15) the same line gives the words line by line, as before. The page is drawn by the app itself
// in a hidden window and kept as a picture; nothing leaves the Mac.
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [HALIGTREE_QA_CAPS=macos15] [QA_SHOTS=dir] node qa/mac-page-read.mjs
import { join } from 'node:path'
import { checks } from './harness.mjs'

const OLD = process.env.HALIGTREE_QA_CAPS === 'macos15'
const { sandbox } = await import('./sandbox-lib.mjs')
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, send, electron } = c
const PAGE = `<!doctype html><body style="margin:0;padding:60px 70px;background:#fff;color:#111;font:22px/1.5 Georgia,serif;width:900px">
<h1 style="font-size:44px;margin:0 0 24px">Making a Sourdough Starter</h1>
<p>Flour and water left warm for a week grow the yeast that raises the bread.</p>
<ul style="margin:18px 0"><li>Mix equal weights of flour and water</li><li>Keep the jar somewhere warm</li><li>Feed it every morning</li></ul>
<table style="border-collapse:collapse;margin-top:18px;font-size:22px">${[['Day', 'Flour', 'Water'], ['One', '50 g', '50 g'], ['Two', '50 g', '50 g'], ['Three', '100 g', '100 g']].map((row) => `<tr>${row.map((cell) => `<td style="border:2px solid #111;padding:8px 22px">${cell}</td>`).join('')}</tr>`).join('')}</table>
</body>`

try {
  await c.v('settings:set', { sounds: false, celebrate: false })
  // The page, drawn and photographed by a hidden window of the app's own.
  const png = await electron.evaluate(async ({ BrowserWindow }, html) => {
    const win = new BrowserWindow({ show: false, width: 1040, height: 900, webPreferences: { offscreen: true } })
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    await new Promise((next) => setTimeout(next, 400))
    const shot = await win.webContents.capturePage()
    win.destroy()
    return Array.from(shot.toPNG())
  }, PAGE)
  const src = await h.evaluate((bytes) => window.api.saveImage('image/png', new Uint8Array(bytes)), png)
  const holder = await h.evaluate((src) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A photo of a page' }] }, { type: 'image', attrs: { src } }] } }), src)
  const read = await h.evaluate((src) => window.api.imagePage?.(src) ?? 'no imagePage', src)
  console.log(`(the Mac's reading: ${JSON.stringify(read).slice(0, 400)})`)
  await send('capture', holder)
  await h.waitForTimeout(1500)
  const before = await h.evaluate(() => window.api.captures.list().then((all) => all.map((one) => one.id)))
  // The picture's right-click, “Text in it”, then “Make it a note”.
  await h.click('.ProseMirror img', { button: 'right' })
  await h.locator('[role=menuitem]', { hasText: 'Text in it' }).last().hover()
  if (process.env.QA_SHOTS) await h.screenshot({ path: join(process.env.QA_SHOTS, 'page-read-menu.png') })
  await h.locator('[role=menuitem]', { hasText: 'Make it a note' }).last().click({ timeout: 8000 })
  // Vision takes a moment over a page: looked for until it is kept, a minute at most.
  let made = null
  for (let t = 0; t < 60000 && !made; t += 400) (await h.waitForTimeout(400), (made = await h.evaluate((was) => window.api.captures.list().then((all) => all.find((one) => !was.includes(one.id))), before)))
  await h.waitForTimeout(300)
  const notice = await h.evaluate(() => [...document.querySelectorAll('[data-sonner-toast], [role="status"]')].map((el) => el.textContent).join(' | '))
  const body = (await h.evaluate((id) => window.api.captures.get(id), made?.id))?.body
  if (!body) console.log(`(no new note: ${JSON.stringify(made ?? null).slice(0, 200)})`)
  const kinds = (body?.content ?? []).map((one) => one.type)
  const text = JSON.stringify(body ?? '')
  console.log(`(the note made: ${kinds.join(', ')}; the notice: ${notice.slice(0, 120)})`)
  if (OLD) {
    check('an older Mac: the words line by line, as before', kinds[0] === 'image' && kinds.slice(1).every((one) => one === 'paragraph') && text.includes('Sourdough'), kinds.join(' '))
    check('and says how many lines', /Made a note of its \d+ lines/.test(notice), notice)
  } else {
    check('the title comes back a heading', body?.content?.some((one) => one.type === 'heading' && JSON.stringify(one).includes('Sourdough Starter')), kinds.join(' '))
    check('the list a list of its three lines', body?.content?.some((one) => one.type === 'bulletList' && one.content.length === 3 && JSON.stringify(one).includes('every morning')), kinds.join(' '))
    const table = body?.content?.find((one) => one.type === 'table')
    check('the table a table, four rows of three', table?.content?.length === 4 && table.content.every((row) => row.content.length === 3) && JSON.stringify(table).includes('100 g'), JSON.stringify(table ?? null).slice(0, 300))
    check('the paragraph its own, not repeated in the list or table', (text.match(/raises the bread/g) ?? []).length === 1)
    check('the notice says what came back: “Made a note of the page, with a list and a table”', /Made a note of the page, with a list and a table/.test(notice), notice)
  }
  if (process.env.QA_SHOTS && made) {
    await send('capture', made.id)
    await h.waitForTimeout(1500)
    await c.both(join(process.env.QA_SHOTS, `page-read-${OLD ? 'old' : 'new'}`))
  }
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()

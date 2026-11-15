// "Copy text from image" (the tracker: "add a copy text from image option in
// the context menu of images using apple hardware"): right-click a picture in a
// note, and the words in it, read by the Mac (Apple's Vision), are on the
// clipboard as plain lines, with a notice. A picture with no words says so.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/image-text.mjs
// QA_SHOTS=dir saves the menu, light and dark.
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
import { copiedText, putOnBoard } from './pasteboard.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { h, electron, send, both } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => h.waitForTimeout(ms)
// A picture of words, drawn here: two lines on a page.
const src = await h.evaluate(async () => {
  const canvas = Object.assign(document.createElement('canvas'), { width: 900, height: 220 })
  const g = canvas.getContext('2d')
  g.fillStyle = '#fff'; g.fillRect(0, 0, 900, 220); g.fillStyle = '#111'; g.font = '44px Helvetica'
  g.fillText('Move to a new page and', 30, 90); g.fillText('sync with the page', 30, 160)
  const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'))
  return window.api.saveImage('image/png', new Uint8Array(await blob.arrayBuffer()))
})
const bare = await h.evaluate(async () => {
  const canvas = Object.assign(document.createElement('canvas'), { width: 400, height: 200 })
  const g = canvas.getContext('2d')
  g.fillStyle = '#7a9'; g.fillRect(0, 0, 400, 200)
  const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'))
  return window.api.saveImage('image/png', new Uint8Array(await blob.arrayBuffer()))
})
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const made = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [para('A picture of words'), { type: 'image', attrs: { src } }, para('And one of none'), { type: 'image', attrs: { src: bare } }] })
await send('capture', made)
await wait(1800)
await putOnBoard(electron, 'before')

const menuFor = async (one) => {
  await h.locator(`.ProseMirror img[src="${one}"]`).first().click({ button: 'right' })
  await wait(500)
  // The words' lines sit under “Text in it ›”: pointed at, as a person would.
  await h.hover('[data-clicked="image-words"]').catch(() => {})
  await wait(500)
  return h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((row) => row.textContent.trim()))
}
const rows = await menuFor(src)
check('right-clicking a picture offers "Copy text from image"', rows.some((one) => /^Copy text from image/.test(one)), rows.join(' / '))
const icon = await h.evaluate(() => { const row = [...document.querySelectorAll('[role="menuitem"]')].find((one) => /^Copy text from image/.test(one.textContent.trim())); return row?.querySelector('svg')?.getAttribute('class') ?? '' })
check('it has its own icon (not the fallback dot)', /scan-text/.test(icon), icon)
const cursor = await h.evaluate(() => { const row = [...document.querySelectorAll('[role="menuitem"]')].find((one) => /^Copy text from image/.test(one.textContent.trim())); return row ? getComputedStyle(row).cursor : '' })
check('the row shows the hand', cursor === 'pointer', cursor)
if (process.env.QA_SHOTS) await both(`${process.env.QA_SHOTS}/image-text-menu`)
// Pictures taken in light and dark close the menu: opened again as a person would.
if (process.env.QA_SHOTS) (await h.keyboard.press('Escape'), await wait(300), await menuFor(src))
await h.getByRole('menuitem', { name: /Copy text from image/ }).click()
let copied = ''
for (let i = 0; i < 40 && !/move to a new page/i.test(copied); i++) (await wait(250), (copied = await copiedText(electron)))
check('the words in the picture are on the clipboard', /move to a new page/i.test(copied) && /sync with/i.test(copied), JSON.stringify(copied.slice(0, 120)))
const notice = await h.evaluate(() => document.body.innerText.match(/Copied (\d+ lines from|the words in) the picture/)?.[0] ?? '')
check('a notice says how much was copied', !!notice, notice)

await h.keyboard.press('Escape')
await putOnBoard(electron, 'kept')
await menuFor(bare)
await h.getByRole('menuitem', { name: /Copy text from image/ }).click()
await wait(2500)
const none = await h.evaluate(() => document.body.innerText.match(/No words in this picture|Could not read the picture/)?.[0] ?? '')
const kept = await copiedText(electron)
check('a picture with no words says so, and leaves the clipboard alone', none === 'No words in this picture' && kept === 'kept', `${none} ${kept}`)

console.log(`${results.filter(Boolean).length} of ${results.length} passed`)
await c.close()
process.exit(results.every(Boolean) ? 0 : 1)

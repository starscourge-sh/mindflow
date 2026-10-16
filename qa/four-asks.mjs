// Four checks, with made-up notes:
//   1. In the Bin, deleting for good is held, never clicked: ⌘A then ⌫ asks with “Hold to delete N”;
//      a plain click on it deletes nothing; held, it deletes them all. One row's own ask holds too.
//   2. A picture or file dragged out of a note is handed to the system as a real file under its
//      own name (the drag is cancelled for the page and the named copy is made); a picture
//      that is not in Vigil's store is left to the editor.
//   3. Home leaves out what is settled: a capture marked done, one made a task, and a task ticked
//      off are not in its tiles or rows, even though they were opened last; a pinned one stays.
//   4. A note with a picture and more lines, made a task, gives the task those lines and the
//      picture in its notes; so does one made from a single capture by “tasks:from”.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/four-asks.mjs
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1400, height: 900 })
const { h, go, v, send, electron } = c
const wait = (ms) => h.waitForTimeout(ms)

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false })
  if (process.env.THEME) await c.theme(process.env.THEME)
  await v('onboarding:set', { pageHints: false, welcomed: new Date().toISOString(), newsSeen: true })
  const create = (kind, body) => h.evaluate(([k, b]) => window.api.captures.create({ kind: k, body: b }).then((one) => one.id ?? one), [kind, body])
  const save = (id, patch) => h.evaluate(([i, p]) => window.api.captures.save(i, p), [id, patch])
  const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
  // A small picture, stored as a pasted one would be.
  const src = await h.evaluate(async () => {
    const canvas = new OffscreenCanvas(120, 80)
    const g = canvas.getContext('2d'); g.fillStyle = '#4a8'; g.fillRect(0, 0, 120, 80)
    return window.api.saveImage('image/png', new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()))
  })
  check('a picture is stored', /^mindflow:\/\/assets\/[a-f0-9]{64}\.png$/.test(src), src)

  // --- 4. the task carries the note's body
  const N = await create('note', { type: 'doc', content: [p('Fix the garden shed door'), { type: 'image', attrs: { src, alt: 'Shed door' } }, p('The hinge on the left is loose.')] })
  const made = await v('toTask', N)
  const task = await v('task', made.id)
  const notes = JSON.stringify(task?.notes ?? null)
  check('a note made a task keeps its picture', notes.includes(src))
  check('and its other lines', notes.includes('The hinge on the left is loose.'))
  check('but not its first line again, which is the task’s name', !notes.includes('Fix the garden shed door'), task?.title)
  const M = await create('note', { type: 'doc', content: [p('Plan the bake sale'), p('Ask about the hall on Friday.')] })
  const fromOne = await v('tasks:from', [M], 'Plan the bake sale')
  check('one capture made a task from a selection of one keeps its lines too', JSON.stringify((await v('task', fromOne.id))?.notes ?? null).includes('Ask about the hall'))
  const plain = await create('note', { type: 'doc', content: [p('Only a name here')] })
  const bare = await v('toTask', plain)
  check('a note that is only its name gives no notes', (await v('task', bare.id))?.notes == null)
  // The task page shows the picture.
  await send('task', made.id); await wait(1500)
  check('the task page shows the picture', await h.locator(`img[src="${src}"]`).count() > 0)

  // --- 2. dragging a picture out
  const D = await create('note', { type: 'doc', content: [p('Drag test page'), { type: 'image', attrs: { src, alt: 'Green card' } }, p('After the picture.')] })
  await send('capture', D); await wait(1600)
  const img = h.locator(`.tiptap.ProseMirror img[src="${src}"]`).first()
  check('the picture is in the note', await img.count() > 0)
  const cancelled = await img.evaluate((el) => !el.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() })))
  check('dragging the picture itself is handed to the system', cancelled)
  await wait(600)
  const tmp = await electron.evaluate(({ app }) => app.getPath('temp'))
  const hash = src.split('/').pop().slice(0, 12)
  const dir = join(tmp, 'vigil-drag', hash)
  check('as a real file under its own name', existsSync(join(dir, 'Green card.png')), existsSync(dir) ? readdirSync(dir).join(', ') : 'no folder')
  // A picture from the web is the editor's own business.
  const W = await create('note', { type: 'doc', content: [p('Web picture page'), { type: 'image', attrs: { src: 'https://example.com/a.png', alt: 'web' } }] })
  await send('capture', W); await wait(1500)
  const web = h.locator('.tiptap.ProseMirror img[src="https://example.com/a.png"]').first()
  if (await web.count()) check('a picture not in Vigil’s store is left to the editor', !(await web.evaluate((el) => !el.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() })))))

  // --- 3. Home leaves out what is settled
  const word = 'quillmoor'
  const R = await create('note', { type: 'doc', content: [p(`${word} resolved one`)] })
  const T = await create('note', { type: 'doc', content: [p(`${word} made a task`)] })
  const K = await create('note', { type: 'doc', content: [p(`${word} still open`)] })
  const Pn = await create('note', { type: 'doc', content: [p(`${word} pinned and done`)] })
  for (const id of [R, T, K, Pn]) await v('home:opened', 'capture', id)
  await save(R, { status: 'resolved' })
  await v('toTask', T)
  await v('pin', 'captures', Pn, true).catch(() => null)
  await save(Pn, { status: 'resolved' })
  const doneTask = await v('task:add', `${word} task ticked off`)
  await v('home:opened', 'task', doneTask.id)
  await v('task:done', doneTask.id)
  await go('home'); await wait(1500)
  const home = await h.evaluate(() => document.body.innerText)
  check('Home still shows an open capture opened lately', home.includes(`${word} still open`))
  check('Home leaves out a capture marked done', !home.includes(`${word} resolved one`))
  check('Home leaves out a capture made a task', !home.includes(`${word} made a task`))
  check('Home leaves out a task ticked off', !home.includes(`${word} task ticked off`))
  const pinned = (await v('pins').catch(() => [])).some?.((one) => one.id === Pn)
  if (pinned) check('a pinned one stays, since a pin is asked for', home.includes(`${word} pinned and done`))

  // --- 1. the Bin holds
  const B = [await create('note', { type: 'doc', content: [p('Bin probe one')] }), await create('note', { type: 'doc', content: [p('Bin probe two')] }), await create('note', { type: 'doc', content: [p('Bin probe three')] })]
  for (const id of B) await save(id, { status: 'discarded', bin: true })
  const count = async () => (await v('bin:list')).length
  const before = await count()
  await go('discarded'); await wait(1200)
  await h.locator('[data-bin]').click({ position: { x: 5, y: 5 } }).catch(() => null)
  await h.keyboard.press('Meta+a'); await wait(300)
  await h.keyboard.press('Backspace'); await wait(500)
  const ask = h.locator('[data-bin-ask]').first()
  const holdBtn = ask.locator('button', { hasText: /^Hold to delete/ }).first()
  check('⌘A then ⌫ asks with a hold button', await holdBtn.count() > 0, await ask.innerText().catch(() => 'no ask'))
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/bin-ask-${process.env.THEME ?? 'light'}.png` })
  check('no plain “Delete N for good” click button is left', await ask.locator('button', { hasText: /^Delete \d+ for good$/ }).count() === 0)
  await holdBtn.click(); await wait(800)
  check('a plain click deletes nothing', (await count()) === before)
  const box = await holdBtn.boundingBox()
  await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await h.mouse.down(); await wait(1700); await h.mouse.up(); await wait(1200)
  check('held, it deletes them for good', (await count()) === 0, `${before} → ${await count()}`)
  // One row's own ask.
  const one = await create('note', { type: 'doc', content: [p('Bin probe single')] })
  await save(one, { status: 'discarded', bin: true }); await go('home'); await go('discarded'); await wait(1200)
  const row = h.locator('[data-bin] li', { hasText: 'Bin probe single' }).first()
  await row.click({ button: 'right' }); await wait(400)
  await h.locator('[role=menu] [role=menuitem]', { hasText: 'Delete for good' }).first().click(); await wait(500)
  const rowHold = h.locator('[data-bin-ask] button', { hasText: /^Hold to delete$/ }).first()
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/bin-row-ask-${process.env.THEME ?? 'light'}.png` })
  check('one row’s ask holds too', await rowHold.count() > 0)
  check('and Return held on it is the way by keys: it has the focus', await rowHold.evaluate((el) => el === document.activeElement).catch(() => false))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close()
  const ok = results.filter(Boolean).length
  console.log(`\n${ok}/${results.length} passed`)
  process.exit(ok === results.length ? 0 : 1)
}

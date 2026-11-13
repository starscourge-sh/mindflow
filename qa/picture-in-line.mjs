// A picture stored inside a line of words, as old Obsidian imports kept it (`{paragraph: [rule, "\n", picture]}`):
// opened, it stands on a line of its own, so its delete works and stays done after a reload, words typed right
// before and after it stay, a paste beside it lands, its block drags alone, and "Turn into" on the line after it
// keeps it. No page error anywhere. Opening and leaving it without typing writes nothing.
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/picture-in-line.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, send, errors } = c
const wait = (ms) => h.waitForTimeout(ms)
const ED = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const words = (text) => ({ type: 'text', text })
const picture = (src) => ({ type: 'image', attrs: { src, alt: '' } })
/** The shapes found in the user's notes: words, a line break and a picture in one line; a rule, a line break and a picture. */
const stuck = (a, b) => ({ type: 'doc', content: [
  { type: 'heading', attrs: { level: 1 }, content: [words('Picture in a line')] },
  { type: 'paragraph', content: [words('Words before it'), words('\n'), picture(a), words('\n'), words('Words after it')] },
  { type: 'paragraph', content: [{ type: 'horizontalRule' }, words('\n'), picture(b)] },
  { type: 'paragraph', content: [words('The last line')] },
] })
/** In the open editor: the top-level blocks in order (a picture by its colour), and how many of each picture. */
const read = () => h.evaluate(([sel, a, b]) => {
  const ed = [...document.querySelectorAll(sel)].find((one) => one.editor && one.isConnected)?.editor
  if (!ed) return null
  const name = (src) => (src === a ? 'A' : src === b ? 'B' : '?')
  const count = { A: 0, B: 0 }
  ed.state.doc.descendants((node) => void (node.type.name === 'image' && count[name(node.attrs.src)]++))
  const tops = []
  ed.state.doc.forEach((node) => tops.push(node.type.name === 'image' ? `[${name(node.attrs.src)}]` : `${node.type.name}${node.attrs.level ?? ''}:${node.textContent}`))
  return { count, tops, text: ed.state.doc.textContent }
}, [ED, A, B])
const pageErrors = () => errors.filter((one) => /PAGEERROR|contentMatchAt|Invalid content/.test(one))
const caretAt = (text, end) => h.evaluate(([sel, text, end]) => {
  const ed = [...document.querySelectorAll(sel)].find((one) => one.editor && one.isConnected).editor
  let at = -1
  ed.state.doc.descendants((node, pos) => { if (at < 0 && node.isText && node.text.includes(text)) at = pos + node.text.indexOf(text) + (end ? text.length : 0) })
  ed.chain().focus().setTextSelection(at).run()
}, [ED, text, end])

// Two small pictures kept in the book, as an import keeps them: a red one (A) and a blue one (B).
const keep = (colour) => h.evaluate(async (colour) => {
  const canvas = Object.assign(document.createElement('canvas'), { width: 240, height: 120 })
  const pen = canvas.getContext('2d')
  pen.fillStyle = colour
  pen.fillRect(0, 0, 240, 120)
  const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'))
  return window.api.saveImage('image/png', new Uint8Array(await blob.arrayBuffer()))
}, colour)
let A = ''
let B = ''
const fresh = async (title) => {
  const id = await v('article:new')
  await v('item:save', id, { title, body: stuck(A, B) })
  await send('article', id)
  await h.locator(ED).first().waitFor({ timeout: 15000 })
  await wait(1500)
  return id
}
/** What the app says from now on, by its notices' own words. */
const listen = () => h.evaluate(() => { window.__said = []; addEventListener('haligtree:toast', (event) => window.__said.push(event.detail.text)) })
// SHOTS=<folder>: pictures of the window as the note opens and through the delete, to look at.
const shot = async (name) => process.env.SHOTS && h.screenshot({ path: `${process.env.SHOTS}/${name}.png` }).catch(() => {})
const clean = (label) => {
  const seen = pageErrors()
  check(`${label}: no page error`, !seen.length, seen.join(' | ').slice(0, 300))
  errors.length = 0
}

try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await v('settings:set', { sounds: false, hintRate: 0 })
  // Plain keys: the letters typed below are words, not Vim's commands.
  await h.evaluate(() => { localStorage.setItem('vim', 'off'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: 'off' })) })
  A = await keep('#c0392b')
  B = await keep('#2457a6')
  check('two pictures are kept in the book', /^haligtree:\/\/assets\//.test(A) && /^haligtree:\/\/assets\//.test(B) && A !== B, `${A} ${B}`)

  // 1. Opened and left without typing: nothing is written, the stored shape is as it was.
  const quiet = await fresh('Opened only')
  if (process.env.SHOTS) await c.both(`${process.env.SHOTS}/opened`).catch(() => {})
  const opened = await read()
  check('opened: each picture stands on a line of its own', JSON.stringify(opened?.tops) === JSON.stringify(['heading1:Picture in a line', 'paragraph:Words before it', '[A]', 'paragraph:Words after it', 'horizontalRule:', '[B]', 'paragraph:The last line']), JSON.stringify(opened?.tops))
  await send('view', 'home'); await wait(1500)
  const kept = await v('item', quiet)
  check('opened and left without typing: the stored note is just as it was', JSON.stringify(kept?.body) === JSON.stringify(stuck(A, B)), JSON.stringify(kept?.body).slice(0, 200))
  clean('opened and left')

  // 2. The rule-and-picture line's picture, deleted from its toolbar: gone, and still gone after a reload.
  const gone = await fresh('Delete it')
  const second = h.locator(`${ED} img[src="${B}"]`).first()
  await second.scrollIntoViewIfNeeded(); await wait(300)
  await second.click(); await wait(600)
  await shot('delete-0-picked')
  await listen()
  await h.locator('[aria-label="Delete image"]').first().click()
  for (const [at, after] of [[150, 150], [700, 550], [1500, 800], [3500, 2000]]) (await wait(after), await shot(`delete-${at}ms`))
  let now = await read()
  check('delete: the picture leaves the note', now?.count.B === 0 && now?.count.A === 1, JSON.stringify(now?.count))
  check('delete: its toolbar goes with it', !(await h.locator('[aria-label="Delete image"]').first().isVisible().catch(() => false)))
  console.log('  the notice:', JSON.stringify(await h.evaluate(() => window.__said)))
  clean('delete')
  await wait(1200)
  await h.reload(); await wait(2500)
  await send('article', gone); await h.locator(ED).first().waitFor({ timeout: 15000 }); await wait(1500)
  now = await read()
  check('delete: still gone after the window reloads', now?.count.B === 0 && now?.count.A === 1, JSON.stringify(now?.count))
  clean('reload')

  // 3. Words typed right before the picture and right after it.
  await fresh('Type beside it')
  await caretAt('Words before it', true)
  await h.keyboard.type('X'); await wait(300)
  await caretAt('Words after it', false)
  await h.keyboard.type('Y'); await wait(600)
  now = await read()
  check('typing right before and after the picture: the letters stay, the picture too', now?.text.includes('Words before itX') && now?.text.includes('YWords after it') && now?.count.A === 1, JSON.stringify(now?.tops))
  clean('typing')

  // 4. Words pasted right beside it.
  await fresh('Paste beside it')
  await caretAt('Words before it', true)
  await h.evaluate((sel) => {
    const ed = [...document.querySelectorAll(sel)].find((one) => one.editor && one.isConnected).editor
    const data = new DataTransfer()
    data.setData('text/plain', ' and pasted words')
    ed.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, ED)
  await wait(600)
  now = await read()
  check('pasting right beside the picture: the words land, the picture stays', now?.text.includes('Words before it and pasted words') && now?.count.A === 1, JSON.stringify(now?.tops))
  clean('paste')

  // 5. Its block dragged by the grip under the last line: the picture alone moves, the words stay in their order.
  await fresh('Drag it')
  // As qa/block-carry.mjs carries a block: hover its line, take the grip, move in steps a frame apart, let go low on the target.
  await h.locator(`${ED} > *`, { has: h.locator(`img[src="${A}"]`) }).first().hover(); await wait(300)
  const grip = await h.locator('.tiptap-drag-handle-grip').boundingBox()
  const last = await h.locator(`${ED} p`, { hasText: 'The last line' }).first().boundingBox()
  if (grip && last) {
    const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }
    const to = { x: last.x + 60, y: last.y + last.height * 0.8 }
    await h.mouse.move(start.x, start.y)
    await h.mouse.down()
    for (let i = 1; i <= 14; i++) (await h.mouse.move(start.x + ((to.x - start.x) * i) / 14, start.y + ((to.y - start.y) * i) / 14), await wait(50))
    await h.mouse.up(); await wait(700)
  }
  now = await read()
  const order = now?.tops ?? []
  check('dragging its block: the picture alone moves under the last line', !!grip && order.indexOf('[A]') > order.indexOf('paragraph:The last line') && order.indexOf('paragraph:Words before it') < order.indexOf('paragraph:Words after it') && order.indexOf('paragraph:Words before it') >= 0, `${JSON.stringify(order)} grip ${JSON.stringify(grip)}`)
  clean('drag')

  // 6. The other way in by hand: the words-and-picture line's picture picked and ⌫ pressed.
  await fresh('Backspace it')
  await h.locator(`${ED} img[src="${A}"]`).first().click(); await wait(500)
  await h.keyboard.press('Backspace'); await wait(700)
  now = await read()
  check('⌫ on the picked picture takes it out, the words round it stay', now?.count.A === 0 && now?.text.includes('Words before it') && now?.text.includes('Words after it'), JSON.stringify(now?.tops))
  clean('backspace')

  // 7. "Turn into" on the line right after the picture: that line becomes a heading, the picture stays.
  await fresh('Turn the line after it')
  await h.locator(`${ED} p`, { hasText: 'Words after it' }).first().click({ button: 'right', position: { x: 30, y: 6 } })
  await wait(500)
  await h.locator('[data-turn-into-sub]').first().hover(); await wait(500)
  await h.locator('.tiptap-block-menu-sub button', { hasText: 'Heading 2' }).first().click(); await wait(600)
  now = await read()
  check('"Turn into" on the line after it: that line is a heading, the picture stays', (now?.tops ?? []).includes('heading2:Words after it') && now?.count.A === 1 && (now?.tops ?? []).includes('paragraph:Words before it'), JSON.stringify(now?.tops))
  clean('turn into')

  // 8. A delete that fails for any reason (made to here: the editor refuses the change once): the picture shows again
  // where it was, picked with its toolbar as before, and a notice says it could not be removed.
  await fresh('A delete that fails')
  await listen()
  const failing = h.locator(`${ED} img[src="${B}"]`).first()
  await failing.scrollIntoViewIfNeeded(); await wait(300)
  await failing.click(); await wait(600)
  await h.evaluate((sel) => {
    const view = [...document.querySelectorAll(sel)].find((one) => one.editor && one.isConnected).editor.view
    const own = view.dispatch.bind(view)
    let once = true
    view.dispatch = (tr) => {
      if (once && tr.docChanged) {
        once = false
        throw new Error('a delete made to fail by the probe')
      }
      return own(tr)
    }
  }, ED)
  await h.locator('[aria-label="Delete image"]').first().click()
  await wait(3500)
  await shot('failed-delete-3500ms')
  now = await read()
  const after = await h.evaluate(([sel, b]) => {
    const img = document.querySelector(`${sel} img[src="${b}"]`)
    let hidden = !img
    for (let el = img; el && el !== document.body; el = el.parentElement) if (getComputedStyle(el).visibility === 'hidden' || el.hasAttribute('inert')) hidden = true
    const { selection } = [...document.querySelectorAll(sel)].find((one) => one.editor && one.isConnected).editor.state
    return { shown: !hidden, picked: selection.node?.type.name === 'image' && selection.node.attrs.src === b, said: window.__said }
  }, [ED, B])
  check('a delete that fails: the picture is still in the note', now?.count.B === 1, JSON.stringify(now?.count))
  check('a delete that fails: it shows again where it was, picked', after.shown && after.picked, JSON.stringify(after))
  check('a delete that fails: its toolbar is up as before', await h.locator('[aria-label="Delete image"]').first().isVisible().catch(() => false))
  check('a delete that fails: a notice says it could not be removed', after.said.includes('Could not remove the picture'), JSON.stringify(after.said))
  // The made-up failure is logged as an error on purpose.
  errors.length = 0
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()

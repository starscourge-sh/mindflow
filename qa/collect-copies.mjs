// Collect what you copy: started from ⌘K, copies made elsewhere land in the open note, each in its own quote
// with where it came from; a password manager's concealed copy never lands; a picture comes as a picture; Esc stops.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/collect-copies.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
// Copied as another app would, onto the app's stand-in clipboard (qa/pasteboard.mjs), never the Mac's: words, a page it
// came from, or a password manager's mark.
const copy = (what) => electron.evaluate(async ({ ClipboardItem, nativeImage }, what) => {
  const raw = (f) => `electron application/osclipboard;format="${f}"`
  const blob = (text, type = 'text/plain') => new Blob([text], { type })
  const parts = {}
  if (what.text) parts['text/plain'] = blob(what.text)
  if (what.url) parts[raw('org.chromium.source-url')] = blob(what.url)
  if (what.secret) parts[raw('org.nspasteboard.ConcealedType')] = blob('')
  if (what.picture) parts['image/png'] = new Blob([nativeImage.createFromBitmap(Buffer.alloc(16 * 16 * 4, 180), { width: 16, height: 16 }).toPNG()], { type: 'image/png' })
  await globalThis.qaPasteboard.write([new ClipboardItem(parts)])
}, what)
const doc = () => h.evaluate(() => document.querySelector('[data-open] .tiptap').editor.getJSON())
const quotes = async () => (await doc()).content.filter((one) => one.type === 'blockquote')
const textOf = (node) => JSON.stringify(node)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Research', body: { type: 'doc', content: [p('Reading about tides.')] } })
  await c.send('article', id); await wait(1500)
  await h.evaluate(() => document.querySelector('[data-open] .tiptap').editor.commands.focus('end'))
  await h.keyboard.press('Meta+k'); await wait(500)
  await h.keyboard.type('Collect what I copy'); await wait(400)
  await h.keyboard.press('Enter'); await wait(800)
  check('⌘K “Collect what I copy” shows the Collecting pill', await h.locator('[data-collecting]').isVisible(), '')
  // Copies are made in other apps: Haligtree is not in front.
  await electron.evaluate(({ app }) => app.hide()); await wait(400)
  await copy({ text: 'The moon pulls the sea twice a day.', url: 'https://example.com/tides' }); await wait(1600)
  let found = await quotes()
  check('a copy lands in the note in its own quote', found.length === 1 && textOf(found[0]).includes('The moon pulls the sea twice a day.'), textOf(found))
  check('with where it came from: the app and the page as a link', textOf(found[0] ?? {}).includes('https://example.com/tides') && /From [^"]+ · /.test(textOf(found[0] ?? {})), textOf(found[0] ?? {}))
  await copy({ text: 'hunter2-password', secret: true }); await wait(1600)
  check('a concealed copy (a password manager) never lands', !textOf(await doc()).includes('hunter2'), String((await quotes()).length))
  await copy({ text: 'Spring tides come at the full moon.' }); await wait(1600)
  found = await quotes()
  check('the next copy after a secret one lands', found.length === 2 && textOf(found[1]).includes('Spring tides'), textOf(found.at(-1)))
  await copy({ picture: true }); await wait(2000)
  found = await quotes()
  check('a picture comes as a picture', found.length === 3 && textOf(found[2]).includes('"type":"image"'), textOf(found.at(-1)))
  check('the pill counts what came in', /3 so far/.test(await h.locator('[data-collecting]').textContent()), await h.locator('[data-collecting]').textContent())
  await copy({ picture: true }); await wait(1600)
  check('copying the same thing twice in a row lands it once', (await quotes()).length === 3, String((await quotes()).length))
  await electron.evaluate(({ app }) => app.show()); await wait(800)
  await c.both(`${shots}/collect-copies`)
  await h.locator('[data-open] .tiptap').click({ position: { x: 20, y: 10 } }); await wait(200)
  await h.keyboard.press('Escape'); await wait(500)
  check('Esc stops collecting', !(await h.locator('[data-collecting]').count()), '')
  await electron.evaluate(({ app }) => app.hide()); await wait(300)
  await copy({ text: 'Neap tides at the half moon.' }); await wait(1600)
  check('after Stop nothing more lands', !textOf(await doc()).includes('Neap'), '')
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()

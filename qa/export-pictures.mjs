// 10 Nov: a graph (and a drawing) exported as HTML or PDF is the picture you see, with its formulas, not an empty box.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/export-pictures.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const c = await sandbox({ width: 1300, height: 900 })
const { h, electron, send } = c
let ok = true
const check = (name, pass, detail = '') => { ok &&= pass; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
try {
  await electron.evaluate(({ ipcMain }) => {
    for (const ch of ['export-text', 'export-pdf']) { ipcMain.removeHandler(ch); ipcMain.handle(ch, (_e, _name, text) => ((globalThis.__exported = text), true)) }
  })
  const made = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Export with a graph' }] },
    { type: 'graph', attrs: { expressions: [{ id: 'a', text: 'y=x^2', color: 'blue' }], sliders: {}, view: null, height: 320 } },
    { type: 'paragraph', content: [{ type: 'text', text: 'after' }] }] } }))
  await c.go('captures'); await send('capture', made); await h.waitForTimeout(3500)
  for (const format of ['HTML', 'PDF']) {
    await electron.evaluate(() => { globalThis.__exported = null })
    await h.locator('[data-open] .ProseMirror > p').last().click(); await h.keyboard.press('End'); await h.keyboard.press('Enter')
    await h.keyboard.type(`/export as ${format.toLowerCase()}`, { delay: 20 }); await h.waitForTimeout(600); await h.keyboard.press('Enter'); await h.waitForTimeout(1500)
    const out = await electron.evaluate(() => globalThis.__exported)
    check(`${format}: the graph is a picture`, /<img[^>]+src="data:image\/png;base64,/.test(out ?? ''), (out ?? 'nothing').slice(0, 120))
    check(`${format}: its formula is under it`, /<figcaption>y=x\^2<\/figcaption>/.test(out ?? ''))
    check(`${format}: no empty graph box left`, !/data-graph=""/.test(out ?? ''))
  }
} catch (error) { check('the run finished', false, error.message.split('\n')[0]) }
console.log(ok ? 'all passed' : 'some failed')
await c.close(); process.exit(0)

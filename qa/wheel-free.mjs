// The wheel over a note is free: no listener on the window, the document, the body or anything above the note may
// stop a wheel event. One that may makes the browser hold the first move of every wheel gesture until the page's
// script has seen it, so a push of the fingers over a long note waits for whatever the note is busy drawing.
// Asked of the browser itself (its list of listeners), on the largest note of a copy of a real book:
//   QA_DATA=<book copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/wheel-free.mjs
import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync } from 'fs'
import { SourceMap } from 'node:module'
import { dirname, join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const root = process.env.QA_DATA
const shelf = JSON.parse(readFileSync(join(root, 'books.json'), 'utf8'))
const db = new DatabaseSync(join(root, 'books', shelf.last, 'haligtree.db'), { readOnly: true })
const note = db.prepare("select id, body from captures where status = 'open' and kind = 'note' and body is not null order by length(body) desc limit 1").get()
db.close()
const size = JSON.parse(note.body).content.length
const ED = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const maps = new Map()
const assets = join(dirname(dirname(process.env.QA_ENTRY)), 'renderer', 'assets')
function sourceOf(url, line, column) {
  const name = url.split('/').pop()?.split('?')[0] ?? ''
  const file = name && existsSync(join(assets, `${name}.map`)) ? join(assets, name) : null
  if (!file) return `${name}:${line + 1}`
  if (!maps.has(file)) maps.set(file, new SourceMap(JSON.parse(readFileSync(`${file}.map`, 'utf8'))))
  const at = maps.get(file).findEntry(line, column)
  return at?.originalSource ? `${at.originalSource.replace(/^.*?(src|node_modules)\//, '$1/')}:${at.originalLine + 1}` : `${name}:${line + 1}`
}
let failed = true
const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, send } = c
try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0, smoothScroll: true }))
  await h.waitForTimeout(1200)
  await send('capture', note.id)
  await h.waitForFunction(([sel, count]) => [...document.querySelectorAll(sel)].some((one) => one.editor && one.isConnected && one.editor.state.doc.childCount >= count), [ED, size - 1], { timeout: 120000 })
  await h.waitForTimeout(1500)
  const cdp = await c.electron.context().newCDPSession(h)
  const urls = new Map()
  cdp.on('Debugger.scriptParsed', (script) => urls.set(script.scriptId, script.url))
  await cdp.send('Debugger.enable')
  const targets = [['window', 'window'], ['document', 'document'], ['body', 'document.body']]
  const chain = await h.evaluate((sel) => { const ed = [...document.querySelectorAll(sel)].filter((one) => one.editor).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]; const out = []; window.__chain = []; for (let at = ed; at && at !== document.body; at = at.parentElement) { window.__chain.push(at); out.push(`${at.tagName.toLowerCase()}${at.id ? '#' + at.id : ''}.${String(at.className).split(' ').slice(0, 2).join('.')}`) } return out }, ED)
  chain.forEach((name, i) => targets.push([name, `window.__chain[${i}]`]))
  let blocking = 0
  for (const [name, expression] of targets) {
    const { result } = await cdp.send('Runtime.evaluate', { expression })
    if (!result.objectId) continue
    const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })
    for (const one of listeners.filter((one) => one.type === 'wheel' || one.type === 'mousewheel')) {
      if (!one.passive) blocking++
      console.log(`${one.passive ? 'passive ' : 'MAY STOP'}  ${one.type}${one.useCapture ? ' (capture)' : ''} on ${name}: ${sourceOf(urls.get(one.scriptId) ?? '', one.lineNumber, one.columnNumber)}`)
    }
  }
  console.log(`\n${blocking ? 'FAIL' : 'PASS'}  no wheel listener over the note may stop the wheel  (${blocking} may)`)
  failed = blocking > 0
} finally {
  await Promise.race([c.close(), new Promise((done) => setTimeout(done, 8000))])
}
process.exit(failed ? 1 : 0)

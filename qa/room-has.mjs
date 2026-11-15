// What the writing room's page-wide rule (main.css, `:root[data-in-room] :has([data-room])`, and its two
// partners) costs while typing in a long piece in the room. The longest Writing piece of a book COPY is opened, a
// line on the screen is pressed, ⌘⇧↩ opens the room, and words and new lines are typed with real keys, in turns: the
// rules in the page, then taken out of its sheets (put back after), four turns, A B A B. For each turn the browser's
// own style and layout time per key (Performance.getMetrics). A timing: run it through `solo --quiet`.
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/room-has.mjs
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const ED = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const root = process.env.QA_DATA
if (!root) throw new Error('QA_DATA must be a copy of a book')
const shelf = JSON.parse(readFileSync(join(root, 'books.json'), 'utf8'))
const db = new DatabaseSync(join(root, 'books', shelf.last, 'haligtree.db'), { readOnly: true })
const piece = db.prepare("select id, body, title from nuggets where tier = 'article' and body is not null order by length(body) desc limit 1").get()
db.close()
const size = JSON.parse(piece.body).content.length
const load = () => `load ${loadavg()[0].toFixed(1)}`
const KEYS = 'the shell reads a line\nand runs it at once\n'

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, send } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0 }))
  await wait(1200)
  await send('article', piece.id)
  await h.waitForFunction(([sel, count]) => [...document.querySelectorAll(sel)].some((one) => one.editor && one.editor.state.doc.childCount >= count), [ED, size - 1], { timeout: 90000, polling: 100 })
  await wait(2500)
  const spot = await h.evaluate((sel) => {
    const ed = [...document.querySelectorAll(sel)].filter((one) => one.editor).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]
    // A line of words on the screen: a paragraph, else any block with words.
    const on = (one) => { const r = one.getBoundingClientRect(); return r.height > 0 && r.top > 80 && r.bottom < innerHeight - 80 && one.textContent.trim().length > 20 }
    const line = [...ed.querySelectorAll('p')].find(on) ?? [...ed.children].find(on)
    const r = line?.getBoundingClientRect()
    return r ? { x: r.left + Math.min(r.width - 4, 120), y: r.top + Math.min(r.height / 2, 12) } : null
  }, ED)
  if (!spot) throw new Error('no line of the piece on the screen to press')
  await h.mouse.click(spot.x, spot.y)
  await wait(400)
  await h.keyboard.press('End')
  await h.keyboard.press('Meta+ArrowRight')
  await h.keyboard.press('Meta+Shift+Enter')
  await h.waitForFunction(() => document.documentElement.hasAttribute('data-in-room') && !!document.querySelector('[data-room]'), null, { timeout: 10000 })
  await wait(1500)
  const rules = () => h.evaluate(() => {
    let n = 0
    for (const sheet of document.styleSheets) { let all; try { all = sheet.cssRules } catch { continue } for (const rule of all) if (rule.selectorText?.includes(':has([data-room])')) n++ }
    return n
  })
  const before = await rules()
  console.log(`"${piece.title.slice(0, 40)}": ${size} blocks; the room open, ${before} rules with :has([data-room]) in the page  (${load()})`)
  const cdp = await c.electron.context().newCDPSession(h)
  await cdp.send('Performance.enable')
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((one) => [one.name, one.value]))
  const turns = []
  for (const [i, kept] of [[1, true], [2, false], [3, true], [4, false]]) {
    // Out: each such rule taken from its sheet, kept to be put back where it was.
    if (!kept) await h.evaluate(() => {
      window.__out = []
      for (const sheet of document.styleSheets) {
        let all
        try { all = sheet.cssRules } catch { continue }
        for (let at = all.length - 1; at >= 0; at--) if (all[at].selectorText?.includes(':has([data-room])')) (window.__out.push([sheet, at, all[at].cssText]), sheet.deleteRule(at))
      }
    })
    await wait(600)
    const was = await metrics()
    await h.keyboard.type(KEYS, { delay: 35 })
    await wait(300)
    const now = await metrics()
    if (!kept) await h.evaluate(() => { for (const [sheet, at, text] of window.__out.reverse()) sheet.insertRule(text, at) })
    const per = (name) => Math.round(((now[name] - was[name]) * 1000 / KEYS.length) * 100) / 100
    const turn = { i, kept, styles: per('RecalcStyleDuration'), restyles: Math.round((now.RecalcStyleCount - was.RecalcStyleCount) / KEYS.length * 10) / 10, layout: per('LayoutDuration'), script: per('ScriptDuration'), task: per('TaskDuration') }
    turns.push(turn)
    console.log(`turn ${i}, the rules ${kept ? 'in the page' : 'taken out'}: a key costs styles ${turn.styles} ms (${turn.restyles} restyles), layout ${turn.layout} ms, script ${turn.script} ms, all tasks ${turn.task} ms  (${load()})`)
  }
  const mean = (kept, name) => Math.round((turns.filter((one) => one.kept === kept).reduce((sum, one) => sum + one[name], 0) / 2) * 100) / 100
  console.log(`per key, the rules in: styles ${mean(true, 'styles')} ms, all tasks ${mean(true, 'task')} ms; taken out: styles ${mean(false, 'styles')} ms, all tasks ${mean(false, 'task')} ms`)
  check('the rules were in the page while the room was open, and put back after', before >= 1 && (await rules()) === before, `${before} before, ${await rules()} after`)
  check('the room stayed open through the typing', await h.evaluate(() => document.documentElement.hasAttribute('data-in-room')))
  const faults = c.errors.filter((line) => !/ERR_FILE_NOT_FOUND|ERR_BLOCKED_BY_RESPONSE|status of 40\d/.test(line))
  check('no page errors', !faults.length, faults.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()

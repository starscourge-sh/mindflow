// Where the main window is stuck, on a copy of a real book: the app is
// launched, a note is asked for (NOTE=type:id, or none to watch the launch
// itself), and the window's script is paused a dozen times through the
// debugger, each stack printed with its source file and line (from the
// build's source maps), most seen first. A hang that never ends still says
// what it is.
//
//   QA_DATA=<copy of a book> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 NOTE=capture:<id> node qa/where-stuck.mjs
//
// THEN=<script> runs in the window once the note is up (a scroll, a key typed), so what follows it is what is watched.
import { existsSync, readFileSync } from 'fs'
import { SourceMap } from 'node:module'
import { loadavg } from 'os'
import { dirname, join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const maps = new Map()
// A script is found in the build by its file name, whatever address the page was served from.
const assets = process.env.QA_ENTRY ? join(dirname(dirname(process.env.QA_ENTRY)), 'renderer', 'assets') : join(process.cwd(), 'out', 'renderer', 'assets')
function sourceOf(url, line, column) {
  const name = url.split('/').pop()?.split('?')[0] ?? ''
  const file = name && existsSync(join(assets, `${name}.map`)) ? join(assets, name) : null
  if (!file) return `${name}:${line + 1}:${column}`
  if (!maps.has(file)) maps.set(file, new SourceMap(JSON.parse(readFileSync(`${file}.map`, 'utf8'))))
  const at = maps.get(file).findEntry(line, column)
  return at?.originalSource ? `${at.originalSource.replace(/^.*?(src|node_modules)\//, '$1/')}:${at.originalLine + 1}` : `${name}:${line + 1}:${column}`
}

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, send } = c
const cdp = await c.electron.context().newCDPSession(h)
// Each script's address, told as the debugger is switched on: a paused frame names only its script.
const urls = new Map()
cdp.on('Debugger.scriptParsed', (script) => urls.set(script.scriptId, script.url))
await cdp.send('Debugger.enable')
const answers = () => Promise.race([h.evaluate(() => 1).then(() => true, () => false), new Promise((done) => setTimeout(() => done(false), 3000))])
try {
  console.log(`launched, the window ${await answers() ? 'answers' : 'does NOT answer'}  (load ${loadavg()[0].toFixed(1)})`)
  if (process.env.NOTE) {
    const [type, id] = process.env.NOTE.split(':')
    await send(type, id)
    console.log(`asked for ${type} ${id}`)
  }
  await new Promise((done) => setTimeout(done, Number(process.env.AFTER ?? 6) * 1000))
  // THEN=<script>: run in the window once the note is up (a scroll, a key), and the pauses follow it.
  if (process.env.THEN) {
    void h.evaluate((code) => new Function(code)(), process.env.THEN).catch(() => {})
    await new Promise((done) => setTimeout(done, 1500))
  }
  const rounds = Number(process.env.ROUNDS ?? 14)
  const seen = new Map()
  let idle = 0
  for (let round = 0; round < rounds; round++) {
    const hit = await new Promise((done) => {
      const timer = setTimeout(() => done(null), 2500)
      cdp.once('Debugger.paused', (params) => (clearTimeout(timer), done(params)))
      cdp.send('Debugger.pause').catch(() => done(null))
    })
    if (!hit) { idle++; continue }
    const stack = hit.callFrames.slice(0, 26).map((frame) => `${frame.functionName || '(anon)'} ${sourceOf(frame.url || urls.get(frame.location.scriptId) || '', frame.location.lineNumber, frame.location.columnNumber)}`)
    for (const line of new Set(stack)) seen.set(line, (seen.get(line) ?? 0) + 1)
    if (round < 3) console.log(`pause ${round + 1}:\n    ${stack.join('\n    ')}`)
    // Stopped in the editor's page watcher: which change it is reading, and how many it has read, so a flood says what makes it.
    if (hit.callFrames[0]?.functionName === 'registerMutation') {
      const expression = `(() => { const m = arguments[0], a = arguments[1]; const say = (n) => n ? n.nodeName + (typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\\s+/).slice(0, 3).join('.') : '') : 'null'; return m.type + ' on ' + say(m.target) + ' < ' + say(m.target.parentNode) + ' < ' + say(m.target.parentNode && m.target.parentNode.parentNode) + ' +' + [...m.addedNodes].slice(0, 3).map(say) + ' -' + [...m.removedNodes].slice(0, 3).map(say) + ' attr ' + m.attributeName + '; nodes added so far ' + a.length })()`
      const said = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: hit.callFrames[0].callFrameId, expression, returnByValue: true }).then((one) => String(one.result.value ?? one.result.description), (error) => String(error))
      console.log(`  change ${round + 1}: ${said}`)
    }
    await cdp.send('Debugger.resume').catch(() => {})
    await new Promise((done) => setTimeout(done, 300))
  }
  console.log(`${idle} of ${rounds} pauses found no script running (idle, or held in layout or paint)`)
  console.log(`seen:\n${[...seen].sort((a, b) => b[1] - a[1]).slice(0, 45).map(([line, n]) => `  ${String(n).padStart(2)}  ${line}`).join('\n')}`)
  console.log(`the window ${await answers() ? 'answers' : 'does NOT answer'} now  (load ${loadavg()[0].toFixed(1)})`)
  // The long frames the window itself noted (lib/freeze-notes.ts): which callbacks ran in each, and how much of each was forced layout.
  for (let i = 0; i < 60 && !(await answers()); i++) await new Promise((done) => setTimeout(done, 1000))
  console.log(await Promise.race([h.evaluate(() => window.__freezeNotes?.() ?? '(no notes)'), new Promise((done) => setTimeout(() => done('(the window never answered)'), 5000))]))
} finally {
  await c.close()
}
process.exit(0)

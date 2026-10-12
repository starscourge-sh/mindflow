// The main window's full screen, checked without ever entering it (that
// would take over a Space on the screen of whoever runs this): the Mac's own
// calls are stood in for, and the window's events are sent by hand.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out/main/index.js MINDFLOW_QA_AWAY=1 node qa/fullscreen.mjs
import { sandbox } from './sandbox-lib.mjs'

const { electron, h, errors, close } = await sandbox()
let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); if (!ok) failed++ }
const main = (fn, arg) => electron.evaluate(fn, arg)

try {
  // Stand-ins for the Mac's full screen and for every window's bounds, so nothing moves for real.
  await main(({ BrowserWindow }) => {
    const log = (globalThis.fsLog = { full: [], bounds: [] })
    const home = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))
    globalThis.fsHome = home
    let full = false
    home.isFullScreen = () => full
    home.setFullScreen = (on) => { log.full.push(on); full = on }
    globalThis.fsSet = (on) => { full = on }
    for (const win of BrowserWindow.getAllWindows()) {
      const setBounds = win.setBounds.bind(win)
      win.setBounds = (b) => { log.bounds.push(win === home ? 'home' : 'other'); setBounds(b) }
    }
  })
  const log = () => main(() => JSON.parse(JSON.stringify(globalThis.fsLog)))
  const reset = () => main(() => { globalThis.fsLog.full = []; globalThis.fsLog.bounds = [] })

  check(await main(() => globalThis.fsHome.isFullScreenable()), 'the main window can go full screen (green button live)')

  await h.evaluate(() => window.api.fillHome(true))
  check(JSON.stringify((await log()).full) === '[true]', 'the fill button asks for the Mac\'s own full screen')

  // Entered: the window is covered and moved on the way, which used to read as a put-away.
  await reset()
  await main(() => { const w = globalThis.fsHome; w.emit('enter-full-screen'); w.emit('hide'); w.emit('resize'); w.emit('resized'); w.emit('moved'); w.emit('show') })
  await h.waitForTimeout(300)
  let now = await log()
  check(now.full.length === 0, `nothing takes it back out of full screen once in (calls: ${JSON.stringify(now.full)})`)
  check(now.bounds.length === 0, `no window is re-sized or moved during or after entering (calls: ${JSON.stringify(now.bounds)})`)
  check(await h.evaluate(() => document.documentElement.hasAttribute('data-fullscreen')), 'the page knows it is full screen')
  const spacer = await h.evaluate(() => document.querySelector('aside[data-chrome] > div')?.getBoundingClientRect().height)
  check(spacer < 12, `the sidebar's room for the traffic lights closes up (${spacer}px)`)

  await h.evaluate(() => window.api.fillHome('toggle'))
  check(JSON.stringify((await log()).full) === '[false]', 'the fill button (and ⌃⇧F) comes back out')
  await main(() => { globalThis.fsHome.emit('leave-full-screen') })
  await h.waitForTimeout(200)
  check(!(await h.evaluate(() => document.documentElement.hasAttribute('data-fullscreen'))), 'the page knows it is back')
  const spacerBack = await h.evaluate(() => document.querySelector('aside[data-chrome] > div')?.getBoundingClientRect().height)
  check(spacerBack > 36, `the room for the traffic lights is back (${spacerBack}px)`)

  // The red dot while full screen: out first, then put away.
  await reset()
  await main(() => { globalThis.fsSet(true); globalThis.fsHome.close() })
  await h.waitForTimeout(200)
  check(JSON.stringify((await log()).full) === '[false]' && (await main(() => globalThis.fsHome.isVisible())), 'the red dot in full screen leaves full screen first, still shown')
  await main(() => { globalThis.fsSet(false); globalThis.fsHome.emit('leave-full-screen') })
  await h.waitForTimeout(200)
  check(!(await main(() => globalThis.fsHome.isVisible())), 'then the window is put away')
  check(errors.length === 0, `no page errors ${errors.join(' | ')}`)
} finally {
  await close()
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)

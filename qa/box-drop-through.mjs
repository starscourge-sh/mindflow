// A file dragged in from another app onto quick capture: such a drag sends no pointer moves while the window lets
// clicks through, so main asks the page where the pointer is (window:probe). Over the card the window must take the
// pointer (and so the drop); over the clear room round it, clicks pass on to the app behind.
// (The user, 5 Nov: a screenshot dropped on the box opened in the browser under it.)
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-drop-through.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const url = c.page.url()
const through = () => c.electron.evaluate(({ BrowserWindow }, url) => {
  const win = BrowserWindow.getAllWindows().find((one) => !one.isDestroyed() && one.webContents.getURL() === url)
  return win ? globalThis.haligtreeThrough(win.id) : 'no window'
}, url)
const probe = (x, y) => c.electron.evaluate(({ BrowserWindow }, [url, x, y]) => {
  const win = BrowserWindow.getAllWindows().find((one) => !one.isDestroyed() && one.webContents.getURL() === url)
  win?.webContents.send('window:probe', x, y)
}, [url, x, y])
try {
  await wait(1500)
  const card = await c.page.evaluate(() => { const r = document.querySelector('.ProseMirror')?.getBoundingClientRect(); return r && { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })
  check('the box has its card', !!card, JSON.stringify(card))
  await probe(2, 2); await wait(300)
  check('over the clear room, clicks pass through', (await through()) === true, String(await through()))
  await probe(card.x, card.y); await wait(300)
  check('a drag from another app over the card: the window takes the pointer, and the drop', (await through()) === false, String(await through()))
  await probe(2, 2); await wait(300)
  check('and off the card again, clicks pass through', (await through()) === true, String(await through()))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
  done()
}

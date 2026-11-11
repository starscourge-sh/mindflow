// Quick capture and the stickies are panels that take the keys and clicks while the app you were in stays the front
// app. Electron's `type: 'panel'` only claimed it: the window server was never told (its prevents-activation switch
// read NO), so Haligtree could become the front app and AeroSpace followed it to the main window's workspace.
// Checked off screen: every panel says it prevents activation (glass.ts nonActivating), the main window does not.
// The on-screen proof (TextEdit staying in front while the box is summoned and put away) was a one-off, by hand.
//
//   npx electron-vite build --outDir out-x
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-stays-behind.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const c = await sandbox()
try {
  await c.page.evaluate(() => window.api.showPrompt())
  const id = await c.h.evaluate(() => window.api.captures.create({ title: 'Stays behind', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A sticky' }] }] } }))
  await c.h.evaluate((id) => window.api.stick('capture', id, true), id)
  await wait(2500)
  const seen = await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).map((w) => {
    const url = w.webContents.getURL()
    const kind = url.includes('view=home') ? 'home' : url.includes('view=sticky') ? 'sticky' : /\/index\.html(\?|$)/.test(url) && !url.includes('view=') ? 'box' : url.replace(/^.*view=/, '').slice(0, 20)
    return { kind, behind: globalThis.haligtreeBehind.get(w.id) }
  }))
  const one = (kind) => seen.find((w) => w.kind === kind)
  check('quick capture prevents activation', one('box')?.behind === true, JSON.stringify(seen))
  check('a sticky prevents activation', one('sticky')?.behind === true, JSON.stringify(seen))
  check('the main window is an ordinary window, left as it is', one('home')?.behind === false, JSON.stringify(seen))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()

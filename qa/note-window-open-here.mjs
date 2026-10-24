// A note's own window: "Open in Haligtree" sits with the note's tools on the
// right, clear of the traffic lights (it sat beside them, over the drag strip).
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/note-window-open-here.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 900 })
const { h, electron, close } = s
try {
  const gem = (await s.v('items', 'nugget'))[0]
  const capture = await h.evaluate(() => window.api.captures.list?.().then((all) => all[0]).catch(() => null) ?? null)
  for (const [type, id] of [['nugget', gem.id], ...(capture ? [['capture', capture.id]] : [])]) {
    await h.evaluate(([t, i]) => window.api.haligtree('notes:window', t, i, null, null), [type, id]).catch(() => undefined)
    await h.waitForTimeout(2500)
    const at = await electron.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => /[?&]note=/.test(w.webContents.getURL()))
      if (!win) return null
      return win.webContents.executeJavaScript(`(() => { const b = document.querySelector('[data-open-in-haligtree]'); const head = b?.closest('[data-note-head]'); if (!b) return null; const r = b.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), width: innerWidth, inHead: !!head, label: b.getAttribute('aria-label') } })()`)
    })
    const bar = await electron.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => /[?&]note=/.test(w.webContents.getURL()))
      return win?.webContents.executeJavaScript(`(() => { const hits = []; for (let y = 100; y < 240; y += 6) { const el = document.elementFromPoint(20, y); if (el) hits.push(el.tagName + '.' + String(el.className).slice(0, 90) + (el.getAttribute('data-slot') ? '[' + el.getAttribute('data-slot') + ']' : '')) } return [...new Set(hits)] })()`)
    })
    check(`${type}: "Open in Haligtree" is there`, !!at, JSON.stringify(at))
    if (at) check(`${type}: it sits on the right, with the note's tools`, at.inHead && at.left > at.width / 2, JSON.stringify(at))
    await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => /[?&]note=/.test(w.webContents.getURL())).forEach((w) => w.close()))
    await h.waitForTimeout(800)
  }
} finally {
  await close()
}
done()

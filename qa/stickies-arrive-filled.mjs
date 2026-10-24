// Stickies come onto the desktop filled: the main window first, then each card
// once its page has drawn what it holds (the goal's numbers and dots), never a
// blank card that fills in after.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/stickies-arrive-filled.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 900 })
const { electron, close } = s
try {
  // Each sticky taken off and put on again (the way a launch or "Show sticky notes" makes them), its first show watched.
  const keys = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => /[?&]view=sticky/.test(w.webContents.getURL()))
    .map((w) => { const u = new URL(w.webContents.getURL()); return [u.searchParams.get('type'), u.searchParams.get('id')] }))
  await electron.evaluate(({ app }) => {
    globalThis.__seen = []
    app.on('browser-window-created', (_e, w) => w.once('show', async () => {
      if (!/[?&]view=sticky/.test(w.webContents.getURL())) return
      const key = new URL(w.webContents.getURL()).searchParams.get('type')
      const words = await w.webContents.executeJavaScript('document.body.innerText.trim().length').catch(() => -1)
      const dots = await w.webContents.executeJavaScript(`document.querySelectorAll('svg circle, [data-dot]').length`).catch(() => -1)
      globalThis.__seen.push({ key, words, dots })
    }))
  })
  for (const [type, id] of keys) await s.h.evaluate(([t, i]) => window.api.stick(t, i, false), [type, id])
  await s.h.waitForTimeout(1500)
  for (const [type, id] of keys) await s.h.evaluate(([t, i]) => window.api.stick(t, i, true), [type, id])
  await s.h.waitForTimeout(5000)
  const seen = await electron.evaluate(() => globalThis.__seen)
  console.log(JSON.stringify(seen))
  check(`stickies came back (${seen.length})`, seen.length >= 2)
  // Its words when it first showed against its words once settled: all there from the start.
  const settled = await electron.evaluate(async ({ BrowserWindow }) => Object.fromEntries(await Promise.all(BrowserWindow.getAllWindows().filter((w) => /[?&]view=sticky/.test(w.webContents.getURL()))
    .map(async (w) => [new URL(w.webContents.getURL()).searchParams.get('type'), await w.webContents.executeJavaScript('document.body.innerText.trim().length')]))))
  for (const one of seen) check(`${one.key}: shown with its words in (${one.words} of ${settled[one.key]} characters)`, one.words >= settled[one.key] * 0.95)
  const goal = seen.find((one) => one.key === 'goal')
  if (goal) check(`goal: its dots drawn as it shows (${goal.dots})`, goal.dots > 10)
  check('no page errors', !s.errors.length, s.errors.join(' | '))
} finally {
  await close()
}
done()

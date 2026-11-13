// Quick capture opens on the AeroSpace workspace you are on, whatever AeroSpace made of it (the user, 13 Nov: "if in
// workspace 3 (where i put haligtree) i open and close the prompt, everthing is fine, if i then move to any other
// workspace, and open the prompt, it takes me back to workspace three").
//
// AeroSpace decides once, the first time it sees a window, and keeps to it: seen over Haligtree's own window the box
// is filed under that workspace, and from then on each opening anywhere else took you back there; seen while summoned
// from another app it is a popup that belongs to no workspace. A hidden window is left out of AeroSpace's list, so the
// app never found the filed box to move it before it showed. Never the real AeroSpace here: a stand-in that answers
// as it does (it lists the box only while it is up, and only when "filed"), and writes down what it was asked, so
// nothing on the screen moves.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-aerospace.mjs
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-aerospace-'))
const dir = mkdtempSync(join(process.env.QA_DATA, 'aerospace-'))
const fake = join(dir, 'aerospace')
writeFileSync(fake, `#!/bin/bash
S="$(dirname "$0")"
echo "$*" >> "$S/calls.log"
case "$1" in
  list-workspaces) echo 5 ;;
  list-windows) if [ -f "$S/visible" ] && [ -f "$S/filed" ]; then cat "$S/filed"; fi ;;
esac
exit 0
`)
chmodSync(fake, 0o755)
process.env.HALIGTREE_AEROSPACE = fake
process.env.HALIGTREE_QA_FOLLOW = '1'
const { open } = await import('./harness.mjs')

const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
const calls = () => { try { return readFileSync(join(dir, 'calls.log'), 'utf8').split('\n').filter(Boolean) } catch { return [] } }
const clear = () => writeFileSync(join(dir, 'calls.log'), '')

const run = await open()
const app = run.electron
try {
  const home = await (async () => {
    for (let i = 0; i < 100; i++) {
      const found = app.windows().find((w) => w.url().includes('view=home'))
      if (found) return found
      await wait(200)
    }
    throw new Error('no main window')
  })()
  await home.waitForLoadState('domcontentloaded')
  await home.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  // The box, with what the stand-in needs to answer as AeroSpace would: whether it is up.
  let id = null
  for (let i = 0; i < 100 && !id; i++) {
    id = await app.evaluate(({ BrowserWindow }, dir) => {
      const box = BrowserWindow.getAllWindows().find((one) => !one.webContents.getURL().includes('view='))
      if (!box) return null
      const fs = process.getBuiltinModule('fs')
      const path = process.getBuiltinModule('path')
      const note = (line) => fs.appendFileSync(path.join(dir, 'calls.log'), `${line}\n`)
      box.on('show', () => (fs.writeFileSync(path.join(dir, 'visible'), ''), note('SHOW')))
      box.on('hide', () => (fs.rmSync(path.join(dir, 'visible'), { force: true }), note('HIDE')))
      // A test run shows the box as it loads (main's ready-to-show), before this hook was on.
      if (box.isVisible()) fs.writeFileSync(path.join(dir, 'visible'), '')
      return box.getMediaSourceId().split(':')[1]
    }, dir)
    if (!id) await wait(200)
  }
  if (!id) throw new Error('no box window')
  const summon = () => app.evaluate(({ app }) => app.dock?.getMenu()?.items.find((item) => item.label === 'Quick capture')?.click())
  const putAway = () => app.evaluate(({ ipcMain }) => ipcMain.emit('prompt:hide', {}))
  /** Up long enough for AeroSpace to have taken it in, put away, then summoned again: what AeroSpace was asked before it showed. */
  const again = async () => {
    await summon()
    await wait(1200)
    await putAway()
    await wait(400)
    clear()
    await summon()
    await wait(800)
    const all = calls()
    const shown = all.indexOf('SHOW')
    return { before: shown < 0 ? all : all.slice(0, shown), shown: shown >= 0, all }
  }

  await putAway()
  await wait(400)

  // A popup (seen first while summoned from another app): never listed, so never moved, and nothing is asked of
  // AeroSpace on the way up.
  const popup = await again()
  check('a popup box (of no workspace) is never moved, since AeroSpace would tile it into one', popup.shown && !popup.all.some((line) => line.startsWith('move-node-to-workspace')), JSON.stringify(popup.all))
  check('…and it opens without asking AeroSpace anything first', popup.shown && popup.before.length === 0, JSON.stringify(popup.before))
  await putAway()
  await wait(400)

  // Filed (seen first over Haligtree's own window): listed while up, then moved to the workspace in view before each
  // showing. (A window AeroSpace has filed stays filed while that AeroSpace runs, so this comes second.)
  writeFileSync(join(dir, 'filed'), `${id}\n`)
  const filed = await again()
  check('filed by AeroSpace under a workspace, the box is moved to the one in view before it shows, so AeroSpace never takes you to its own',
    filed.shown && filed.before.includes(`move-node-to-workspace --window-id ${id} 5`), JSON.stringify(filed.all))
} catch (error) {
  check('the run finished', false, String(error?.message ?? error).split('\n')[0])
} finally {
  await run.close?.().catch(() => {})
  await app.close().catch(() => {})
  rmSync(dir, { recursive: true, force: true })
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)

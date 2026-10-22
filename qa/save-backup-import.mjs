// Failures said, and imports ended in the app: a save the database refuses
// keeps its words, says so in one line, retries and ticks away once in; two
// failed backups in a row warn with "Choose another folder", Settings says
// when the last one was and why they stopped, and they say when they work
// again; an import counts as it goes and ends on a card, never the system's
// "Imported" dialog, naming the pictures it could not find; a restore is said
// after the restart.
//
//   npx electron-vite build --outDir out-x && QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/save-backup-import.mjs
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const root = mkdtempSync(join(tmpdir(), 'haligtree-sbi-'))
process.env.QA_DATA = root
process.env.QA_ARGS = ''
const shots = process.env.SHOTS
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

// The backup folder is a file, so every backup fails; and a restore was just done.
writeFileSync(join(root, 'backups'), 'not a folder')
writeFileSync(join(root, 'restored.json'), JSON.stringify({ made: new Date(Date.now() - 86400000 * 2).toISOString(), name: 'haligtree-x.db' }))

const c = await sandbox({ seeded: false, width: 1100, height: 760 })
const { h, electron, v } = c
const shot = async (name) => shots && (await h.screenshot({ path: join(shots, `${name}.png`) }))
const toastText = () => h.evaluate(() => document.querySelector('[role=status][aria-live=polite]')?.textContent ?? '')
const waitFor = async (test, ms = 6000) => { for (let t = 0; t < ms; t += 100) { if (await test()) return true; await h.waitForTimeout(100) } return false }

try {
  // --- A restore, said after the restart ---------------------------------------------------
  check('a restore is said once the app is back', await waitFor(async () => /Restored from/.test(await toastText())), await toastText())
  // Past the welcome, as if Haligtree had been used before.
  await v('onboarding:set', { welcomed: new Date().toISOString() })
  await h.reload()
  await h.waitForTimeout(1500)

  // --- Backups ------------------------------------------------------------------------------
  let status = await v('backups:status')
  check('one failed backup is in Settings, with its reason', /can't be written/.test(status.failing ?? ''), JSON.stringify(status))
  await h.waitForTimeout(3500)
  // A second run, the way Settings starts one: the second failure in a row warns.
  await v('backups:choose', true)
  check('two failures in a row warn, with Choose another folder', await waitFor(async () => /Backups have stopped: the backup folder can't be written to/.test(await toastText())), await toastText())
  check('the warning offers Choose another folder', await h.evaluate(() => [...document.querySelectorAll('button')].some((one) => one.textContent?.includes('Choose another folder'))))
  await c.go('settings')
  await h.evaluate(() => [...document.querySelectorAll('[data-section="Import and backups"]')][0]?.click())
  await h.waitForTimeout(700)
  await h.evaluate(() => document.querySelector('[data-backup-status]')?.scrollIntoView({ block: 'center' }))
  await h.waitForTimeout(400)
  check('Settings says backups have stopped, in red, on its own line', await h.evaluate(() => document.querySelector('[data-backup-status="failing"]')?.textContent?.includes('Backups have stopped')))
  await shot('backup-failing')
  rmSync(join(root, 'backups'))
  await v('backups:choose', true)
  check('working again is said', await waitFor(async () => /Backups are running again/.test(await toastText())), await toastText())
  status = await v('backups:status')
  check('Settings then says when the last one was', await waitFor(() => h.evaluate(() => /Last backup just now/.test(document.querySelector('[data-backup-status="ok"]')?.textContent ?? ''))) && !status.failing, JSON.stringify(status))
  await shot('backup-ok')

  // --- A save the database refuses ------------------------------------------------------------
  const id = await h.evaluate(() => window.api.captures.create({ body: 'A note to write in' }))
  await c.send('capture', id)
  await h.waitForTimeout(1200)
  await electron.evaluate(({ ipcMain }) => {
    globalThis.__save = ipcMain._invokeHandlers.get('captures:save')
    ipcMain.removeHandler('captures:save')
    ipcMain.handle('captures:save', () => { throw new Error('SQLITE_FULL: database or disk is full') })
  })
  const editor = h.locator('.ProseMirror[contenteditable=true]').first()
  await editor.click()
  await h.keyboard.press('End')
  await h.keyboard.type(' and more words', { delay: 20 })
  check('a refused save says so in one line, with why', await waitFor(() => h.evaluate(() => /Not saved yet.*disk is full/.test(document.querySelector('[data-save-trouble="failing"]')?.textContent ?? ''))))
  await h.waitForTimeout(400)
  await shot('save-failing')
  check('no "Not saved" error toast as well', !(await h.evaluate(() => [...document.querySelectorAll('[role=status]')].some((one) => one.textContent?.startsWith('Not saved:')))))
  await electron.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('captures:save')
    ipcMain.handle('captures:save', globalThis.__save)
  })
  check('the retry lands and the line says Saved', await waitFor(() => h.evaluate(() => !!document.querySelector('[data-save-trouble="saved"]')), 8000))
  await shot('save-landed')
  check('then the line goes', await waitFor(() => h.evaluate(() => !document.querySelector('[data-save-trouble]')), 4000))
  const body = JSON.stringify((await h.evaluate((one) => window.api.captures.get(one), id)).body)
  check('the words typed while it failed are saved', body.includes('and more words'), body.slice(0, 120))

  // --- An import -----------------------------------------------------------------------------
  const vault = mkdtempSync(join(tmpdir(), 'haligtree-sbi-vault-'))
  mkdirSync(join(vault, 'Codex'))
  for (let i = 1; i <= 240; i++) writeFileSync(join(vault, 'Codex', `Note ${i}.md`), `# Note ${i}\n\nSome words about ${i}, linking [[Note ${i + 1}]].\n`)
  writeFileSync(join(vault, 'Diagram.md'), '# Diagram\n\n![[missing.png]] and ![[gone.jpg]]\n')
  await electron.evaluate(({ dialog }, out) => {
    globalThis.__boxes = 0
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [out] })
    dialog.showMessageBox = async () => (globalThis.__boxes++, { response: 0 })
  }, vault)
  await h.evaluate(() => {
    window.__progress = []
    window.api.onImportProgress((at) => window.__progress.push(at))
  })
  await h.evaluate(() => void window.api.importFrom('vault', null))
  check('the import ends on a card in the app', await waitFor(() => h.evaluate(() => !!document.querySelector('[data-import-done]')), 20000))
  const progress = await h.evaluate(() => window.__progress)
  check('it counted as it went, "n of 241", and cleared', progress.some((one) => one?.total === 241 && one.done > 0) && progress.at(-1) === null, `${progress.length} updates`)
  await h.waitForTimeout(500)
  const card = await h.evaluate(() => document.querySelector('[data-import-done]')?.textContent ?? '')
  check('it says how many came in', card.includes('241 notes are in.'), card.slice(0, 120))
  check('it names the pictures it could not find', card.includes("2 pictures couldn't be found"))
  check('no system "Imported" dialog', (await electron.evaluate(() => globalThis.__boxes)) === 0)
  await shot('import-done')
  await h.click('[data-missing-toggle]')
  await h.waitForTimeout(500)
  check('Show them lists the note and its pictures', await h.evaluate(() => /Diagram\s*missing\.png, gone\.jpg/.test(document.querySelector('[data-import-done] ul')?.textContent ?? '')))
  await shot('import-missing')
  await h.keyboard.press('Escape')
  check('Esc puts it away', await waitFor(() => h.evaluate(() => !document.querySelector('[data-import-done]'))))
  await c.theme('dark')
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:import-done', { detail: { from: 'Engineering Codex', made: 1240, inbox: 1240, pictures: 212, files: 14, links: 3020, missing: [{ link: 'x', title: 'Diagram', names: ['missing.png'] }], notes: ['18 were already here, from an earlier import, and were left as they were.'] } })))
  await h.waitForTimeout(700)
  await shot('import-done-dark')
  rmSync(vault, { recursive: true, force: true })
} finally {
  const errors = c.errors.filter((one) => !/Failed to load resource|net::/.test(one))
  check('no page errors', !errors.some((one) => one.includes('PAGEERROR')), errors.slice(0, 3).join(' | '))
  await c.close()
  rmSync(root, { recursive: true, force: true })
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)

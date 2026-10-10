// The vault picker: Import offers Obsidian's vaults by name, path and note
// count, from a made-up Obsidian config (never the real one), and the folder
// dialog as its last row.
//
//   npx electron-vite build --outDir out-misc
//   QA_ENTRY=out-misc/main/index.js node qa/vault-picker.mjs [shots folder]
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const shots = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'vault-picker-shots-'))
mkdirSync(shots, { recursive: true })
const root = mkdtempSync(join(tmpdir(), 'vault-picker-'))
const vault = (name, notes) => {
  const path = join(root, name)
  mkdirSync(join(path, '.obsidian'), { recursive: true })
  mkdirSync(join(path, 'deep', 'er'), { recursive: true })
  writeFileSync(join(path, '.obsidian', 'not-a-note.md'), 'settings, never counted')
  notes.forEach((words, at) => writeFileSync(join(path, at % 2 ? 'deep/er' : '', `Note ${at + 1}.md`), `# Note ${at + 1}\n\n${words}\n`))
  return path
}
const work = vault('Work Notes', ['Ship the thing', 'Plan the week', 'Call the bank'])
const study = vault('Study', ['Mitochondria make energy', 'Storage is cheap'])
const config = join(root, 'obsidian.json')
writeFileSync(config, JSON.stringify({ vaults: {
  a: { path: study, ts: 10 },
  b: { path: work, ts: 5, open: true },
  c: { path: join(root, 'Gone vault'), ts: 20 }
} }))
process.env.MINDFLOW_OBSIDIAN_CONFIG = config

const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

process.env.QA_ARGS ??= '--sandbox'
const c = await sandbox()
try {
  const { h, electron } = c
  const before = (await h.evaluate(() => window.api.captures.list())).length
  await h.evaluate(() => void window.api.importFrom('vault'))
  await h.waitForSelector('[data-vault-picker]', { timeout: 8000 })
  await h.waitForTimeout(400)
  const rows = await h.$$eval('[data-vault]', (all) => all.map((one) => one.textContent))
  check('two vaults listed, the gone one left out', rows.length === 2, JSON.stringify(rows))
  check('the open vault first', rows[0]?.startsWith('Work Notes'), rows[0])
  check('note counts leave out settings', rows[0]?.includes('3 notes') && rows[1]?.includes('2 notes'), rows.join(' | '))
  check('a path under each name', rows.every((row) => row.includes('vault-picker-')))
  check('Choose another folder is the last row', !!(await h.$('[data-vault-other]')))
  await h.screenshot({ path: join(shots, 'vault-picker.png') })
  await c.theme('dark').catch(() => undefined)
  await h.evaluate(() => void window.api.importFrom('vault'))
  await h.waitForSelector('[data-vault-picker]', { timeout: 8000 })
  await h.waitForTimeout(400)
  await h.screenshot({ path: join(shots, 'vault-picker-dark.png') })

  // Esc puts it away and imports nothing.
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)
  check('Esc closes the picker', !(await h.$('[data-vault-picker]')))

  // A path that is not one of Obsidian's vaults is refused without the dialog.
  await h.evaluate(() => window.api.importFrom('vault', '/etc'))
  check('a folder that is not a vault is refused', (await h.evaluate(() => window.api.captures.list())).length === before)

  // Choose another folder: the folder dialog, here answered as cancelled.
  await electron.evaluate(({ dialog }) => {
    globalThis.__asked = 0
    dialog.showOpenDialog = async () => (globalThis.__asked++, { canceled: true, filePaths: [] })
  })
  await h.evaluate(() => void window.api.importFrom('vault'))
  await h.waitForSelector('[data-vault-picker]', { timeout: 8000 })
  await h.click('[data-vault-other]')
  await h.waitForTimeout(500)
  check('Choose another folder opens the folder dialog', (await electron.evaluate(() => globalThis.__asked)) === 1)

  // Enter on the first row brings the open vault in.
  await h.evaluate(() => void window.api.importFrom('vault'))
  await h.waitForSelector('[data-vault-picker]', { timeout: 8000 })
  await h.waitForTimeout(300)
  await h.keyboard.press('Enter')
  let after = before
  for (let i = 0; i < 40 && after < before + 3; i++) {
    await h.waitForTimeout(250)
    after = (await h.evaluate(() => window.api.captures.list())).length
  }
  check('Enter imports the first vault, its three notes', after === before + 3, `${before} -> ${after}`)
  check('no page errors', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
}
console.log(`${results.filter(Boolean).length}/${results.length} passed; shots in ${shots}`)
process.exit(results.every(Boolean) ? 0 : 1)

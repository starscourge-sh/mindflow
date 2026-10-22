// Quitting closes the database cleanly: its log of saves (haligtree.db-wal) is
// folded into the file and removed, so the folder copies whole and the
// other-book backup does not see a change every day. A save made just before
// quitting is in the file afterwards.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/db-quit.mjs
import { existsSync } from 'fs'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import { sandbox } from './sandbox-lib.mjs'

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ seeded: false })
let folder = ''
try {
  folder = await c.electron.evaluate(({ app }) => app.getPath('userData'))
  if (['haligtree', 'mindflow'].some((name) => folder.includes(`Application Support/${name}`))) throw new Error('never the real data folder')
  const file = join(folder, 'haligtree.db')
  await c.v('settings:set', { quitProbe: 'kept' })
  check('the log of saves is there while the app runs', existsSync(`${file}-wal`))
  const gone = new Promise((done) => c.electron.process().once('exit', done))
  await c.electron.evaluate(({ app }) => setTimeout(() => app.quit(), 100))
  const how = await Promise.race([gone.then(() => 'exited'), new Promise((done) => setTimeout(() => done('still running'), 10_000))])
  check('quit: the app ends', how === 'exited', how)
  check('quit: no -wal left beside the database', !existsSync(`${file}-wal`))
  check('quit: no -shm left beside the database', !existsSync(`${file}-shm`))
  const db = new DatabaseSync(file)
  const row = db.prepare("select value from settings where key = 'quitProbe'").get()
  db.close()
  check('the last save before quitting is in the file', row?.value === '"kept"', JSON.stringify(row))
} catch (error) {
  console.log('FAIL  the probe threw: ' + (error?.stack ?? error))
  results.push(false)
} finally {
  await c.close()
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)

// A picture added to a scenery folder turns up within a few seconds, without
// waiting for the ten-minute look; one taken out goes.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/scenery-watch.mjs
import { mkdtempSync, copyFileSync, rmSync, readdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { sandbox } from './sandbox-lib.mjs'
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const pics = 'src/renderer/src/assets/sandbox'
const some = readdirSync(pics, { recursive: true }).map(String).filter((one) => /\.(jpe?g|png|webp)$/i.test(one)).slice(0, 2)
const folder = mkdtempSync(join(tmpdir(), 'scenery-watch-'))
copyFileSync(join(pics, some[0]), join(folder, 'first' + some[0].slice(some[0].lastIndexOf('.'))))
const c = await sandbox({ width: 1100, height: 800 })
const { h, v } = c
const count = async () => { for (let i = 0; i < 20; i++) { const got = await v('scenery', [folder], 'scenery'); if (!got.scanning) return got.scenes.length; await h.waitForTimeout(500) } return -1 }
try {
  check('the folder starts with its one picture', (await count()) === 1)
  const second = join(folder, 'second' + some[1].slice(some[1].lastIndexOf('.')))
  copyFileSync(join(pics, some[1]), second)
  await h.waitForTimeout(5000)
  const after = await count()
  check('a picture added turns up within seconds', after === 2, `${after}`)
  rmSync(second)
  await h.waitForTimeout(5000)
  check('and one taken out goes', (await count()) === 1)
} finally { await c.close(); rmSync(folder, { recursive: true, force: true }) }
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)

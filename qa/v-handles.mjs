// Note numbers read V-, and an old MF- number still finds its note.
import { sandbox } from './sandbox-lib.mjs'
const c = await sandbox({ width: 1000, height: 700 })
let bad = 0
const check = (name, ok, detail = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const first = (await c.h.evaluate(() => window.api.captures.list()))[0]
const n = first.number
for (const typed of [`v-${n}`, `V-${n}`, `mf-${n}`, `MF-${n}`]) {
  const found = await c.h.evaluate((q) => window.api.captures.search(q), typed).catch(() => null)
  check(`${typed} finds note ${n}`, Array.isArray(found) && found.some((one) => one.id === first.id), JSON.stringify(found?.map?.((one) => one.number)))
}
// What the app draws never makes an MF- handle (an old link's MF- is turned into V- as it is shown).
const { readFileSync, readdirSync } = await import('fs')
const dir = new URL('../' + (process.env.QA_ENTRY ?? 'out/main/index.js').replace(/main\/index\.js$/, 'renderer/assets/'), import.meta.url)
const left = readdirSync(dir).filter((f) => f.endsWith('.js')).flatMap((f) => readFileSync(new URL(f, dir), 'utf8').match(/MF-\$\{|Merge into MF|MF-\d+/g) ?? [])
check('nothing on screen is numbered MF-', left.length === 0, left.join(' '))
await c.close()
process.exit(bad ? 1 : 0)

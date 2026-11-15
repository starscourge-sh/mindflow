// Main's one thread answers every window, so nothing a page asks may hold it (the user, 15 Nov 2026: "note that the
// app freezes randomly, i want this to never happen"). Four asks that held it, each made here as a page makes it, with
// how late main's event loop ran while it was answered (stalls.ts) and what came back, so the answer is the same:
//   1. the welcome's state, which ran `id -F` in step: 418 ms in the user's own freeze logs (a slow `id` stands in
//      here, first on PATH);
//   2. a HEIC added to Files, decoded and turned into a PNG on main's thread;
//   3. a big picture dragged out of a note to another app (the system drag itself is stubbed: it needs the real pointer);
//   4. the Feed's side column, which read every note of the book (263 ms on the user's book).
// Run on a COPY of a book (part 4 needs a real one) or of the seeded sandbox:
//   QA_DATA=<copy> QA_ARGS= QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/main-holds.mjs
import { execFileSync } from 'child_process'
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { loadavg, tmpdir } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const LATE_MS = Number(process.env.LATE_MS ?? 150)
const load = () => `load ${loadavg()[0].toFixed(1)}`
const dir = mkdtempSync(join(tmpdir(), 'main-holds-'))
// A slow `id`, as on a busy Mac: the account's name comes after 0.6 s.
writeFileSync(join(dir, 'id'), '#!/bin/sh\nsleep 0.6\necho "Ada Lovelace"\n')
chmodSync(join(dir, 'id'), 0o755)
process.env.PATH = `${dir}:${process.env.PATH}`
// A 24-megapixel HEIC, made by the Mac from the fixture.
const big = join(dir, 'big.jpg')
const heic = join(dir, 'Harbour at dusk.heic')
execFileSync('sips', ['-z', '4000', '6000', join(import.meta.dirname, 'fixtures', 'long-note-pic.jpg'), '--out', big], { stdio: 'ignore' })
execFileSync('sips', ['-s', 'format', 'heic', big, '--out', heic], { stdio: 'ignore' })

const c = await sandbox({ width: 1100, height: 760, seeded: false })
const { h, v, electron } = c
/** Main's stall table read now; reading it starts its loop's delay afresh. */
const stalls = () => electron.evaluate(() => globalThis.mainStalls())
const rowOf = (table, name) => table.rows.find((one) => one.name === name)
try {
  // 1. The welcome's state, as each page asks it as it loads.
  await h.waitForTimeout(1500)
  const asked = await v('onboarding:state')
  const named = rowOf(await stalls(), 'haligtree:onboarding:state')
  check(`the welcome's state never holds main while the Mac reads your name (held under ${LATE_MS} ms)`, named && named.worst < LATE_MS, `worst ${named?.worst} ms over ${named?.calls} asks  [${load()}]`)
  check('and still signs with your first name', asked?.name === 'Ada', `name ${JSON.stringify(asked?.name)}`)

  // 2. A HEIC into Files.
  await stalls()
  const added = await v('media:add', [{ path: heic }])
  const afterAdd = await stalls()
  const src = added?.added?.[0]?.src ?? ''
  const store = await electron.evaluate(({ app }) => require('path').join(app.getPath('userData'), 'assets'))
  const kept = join(store, src.split('/').pop() ?? '')
  const size = existsSync(kept) ? execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', kept]).toString().match(/\d+(?=\n)/g)?.join(' x ') : null
  check(`a 24-megapixel HEIC added to Files never holds main (its loop under ${LATE_MS} ms late)`, afterAdd.delay.worst < LATE_MS, `${afterAdd.delay.worst} ms late at worst  [${load()}]`)
  check('and it is kept as a PNG of its own size, under its own name', /\.png$/.test(src) && size === '6000 x 4000' && added.added[0].name === 'Harbour at dusk.heic', `${src.slice(-20)} ${size} “${added?.added?.[0]?.name}”; refused ${JSON.stringify(added?.refused)}`)

  // 3. That picture dragged out of a note to another app.
  await electron.evaluate(({ webContents }) => {
    globalThis.__dragged = null
    for (const one of webContents.getAllWebContents()) one.startDrag = (item) => void (globalThis.__dragged = { file: item.file, empty: item.icon.isEmpty(), ...item.icon.getSize() })
  })
  await stalls()
  await h.evaluate((src) => window.api.dragOut(src, 'Harbour at dusk'), src)
  let dragged = null
  for (let t = 0; t < 40 && !dragged; t++) (await h.waitForTimeout(150), (dragged = await electron.evaluate(() => globalThis.__dragged)))
  const afterDrag = await stalls()
  check(`a 24-megapixel picture dragged out never holds main (its loop under ${LATE_MS} ms late)`, dragged && afterDrag.delay.worst < LATE_MS, `${afterDrag.delay.worst} ms late at worst  [${load()}]`)
  check('and the drag carries the file under its name, with a small picture of it', dragged && !dragged.empty && dragged.width > 0 && dragged.width <= 96 && /Harbour at dusk\.png$/.test(dragged.file), JSON.stringify(dragged))

  // 4. The Feed's side column.
  await stalls()
  const side = await v('feed:side')
  const afterSide = await stalls()
  const sideRow = rowOf(afterSide, 'haligtree:feed:side')
  check(`the Feed's side column never holds main (under ${LATE_MS} ms)`, sideRow && sideRow.worst < LATE_MS && afterSide.delay.worst < LATE_MS, `held ${sideRow?.worst} ms, loop ${afterSide.delay.worst} ms late  [${load()}]`)
  console.log(`  (the side column says: quiet ${JSON.stringify(side?.quiet?.map((one) => `${one.kind}:${one.name}`))}; this week ${JSON.stringify(side?.week)})`)
} finally {
  await c.close()
  rmSync(dir, { recursive: true, force: true })
}
done()

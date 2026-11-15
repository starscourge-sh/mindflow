// Main's one thread answers every window, so nothing a page asks may hold it (the user, 15 Nov 2026: "note that the
// app freezes randomly, i want this to never happen"). Five asks that held it, and a HEIC that came in as no picture,
// each made here as a page makes it, with how late main's event loop ran while it was answered (stalls.ts) and what
// came back:
//   1. the welcome's state, which ran `id -F` in step: 418 ms in the user's own freeze logs (a slow `id` stands in
//      here, first on PATH, 0.4 s);
//   2. a HEIC and a TIFF added to Files: the TIFF decoded and turned into a PNG on main's thread, the HEIC not read
//      at all (kept as an unreadable file, no picture);
//   3. a big photograph dragged out of a note to another app, opened whole on main for the picture under the pointer
//      (the system drag itself is stubbed: it needs the real pointer);
//   4. "Copy image" on the same photograph, read whole and written out again as a PNG on main's thread;
//   5. the Feed's side column, which read every note of the book (263 ms on the user's book).
// Run on a COPY of a book (part 4 needs a real one) or of the seeded sandbox:
//   QA_DATA=<copy> QA_ARGS= QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/main-holds.mjs
import { execFileSync } from 'child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { loadavg, tmpdir } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const LATE_MS = Number(process.env.LATE_MS ?? 150)
const load = () => `load ${loadavg()[0].toFixed(1)}`
const dir = mkdtempSync(join(tmpdir(), 'main-holds-'))
// A slow `id`, as on a busy Mac: the account's name comes after 0.4 s (well inside the 2 s the app gives it).
writeFileSync(join(dir, 'id'), '#!/bin/sh\nsleep 0.4\necho "Ada Lovelace"\n')
chmodSync(join(dir, 'id'), 0o755)
process.env.PATH = `${dir}:${process.env.PATH}`
// A 24-megapixel photograph, and the same as a HEIC and a TIFF, made by the Mac from the fixture.
const big = join(dir, 'Harbour at dusk.jpg')
const heic = join(dir, 'Harbour at dusk.heic')
const tiff = join(dir, 'Harbour at dawn.tiff')
execFileSync('sips', ['-z', '4000', '6000', join(import.meta.dirname, 'fixtures', 'long-note-pic.jpg'), '--out', big], { stdio: 'ignore' })
execFileSync('sips', ['-s', 'format', 'heic', big, '--out', heic], { stdio: 'ignore' })
execFileSync('sips', ['-s', 'format', 'tiff', big, '--out', tiff], { stdio: 'ignore' })

const c = await sandbox({ width: 1100, height: 760, seeded: false })
const { h, v, electron } = c
/** Main's stall table read now; reading it starts its loop's delay afresh. */
const stalls = () => electron.evaluate(() => globalThis.mainStalls())
/** What main was asked between two readings of its table, the busiest first: each name's time on its thread then. */
const between = (before, after) => after.rows.map((row) => ({ row, was: before.rows.find((one) => one.name === row.name) }))
  .map(({ row, was }) => ({ name: row.name, calls: row.calls - (was?.calls ?? 0), ms: row.ms - (was?.ms ?? 0) })).filter((one) => one.calls > 0).sort((a, b) => b.ms - a.ms).slice(0, 4)
  .map((one) => `${one.name} ×${one.calls} ${one.ms} ms`).join(', ')
const rowOf = (table, name) => table.rows.find((one) => one.name === name)
try {
  // 1. The welcome's state, as each page asks it as it loads.
  await h.waitForTimeout(1500)
  const asked = await v('onboarding:state')
  const named = rowOf(await stalls(), 'haligtree:onboarding:state')
  check(`the welcome's state never holds main while the Mac reads your name (held under ${LATE_MS} ms)`, named && named.worst < LATE_MS, `worst ${named?.worst} ms over ${named?.calls} asks  [${load()}]`)
  check('and still signs with your first name', asked?.name === 'Ada', `name ${JSON.stringify(asked?.name)}`)

  // 2. A HEIC and a TIFF into Files, one at a time, once the windows have had their say about the last.
  const store = join(await electron.evaluate(({ app }) => app.getPath('userData')), 'assets')
  const sizeOf = (file) => (existsSync(file) ? execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file]).toString().match(/\d+(?=\n)/g)?.join(' x ') : null)
  const add = async (path) => {
    await h.waitForTimeout(2500)
    const before = await stalls()
    const added = await v('media:add', [{ path }])
    const after = await stalls()
    const one = added?.added?.[0]
    return { late: after.delay.worst, asked: between(before, after), one, size: one ? sizeOf(join(store, one.src.split('/').pop())) : null, refused: added?.refused }
  }
  // The HEIC by its bytes too, as a drag from Photos brings it (no path): turned the same way, it is met as the picture
  // already kept, under the name it came with.
  const bytes = [...readFileSync(heic)]
  for (const [kind, path, name] of [['HEIC', heic, 'Harbour at dusk.heic'], ['TIFF', tiff, 'Harbour at dawn.tiff'], ['HEIC by its bytes', null, 'Harbour at night.heic']]) {
    const got = path ? await add(path) : await (async () => {
      await h.waitForTimeout(2500)
      const before = await stalls()
      const added = await h.evaluate(([b, n]) => window.api.haligtree('media:add', [{ name: n, bytes: new Uint8Array(b) }]), [bytes, name])
      const after = await stalls()
      const one = added?.added?.[0] ?? added?.met?.[0]
      return { late: after.delay.worst, asked: between(before, after), one, size: one ? sizeOf(join(store, one.src.split('/').pop())) : null, refused: added?.refused }
    })()
    check(`a 24-megapixel ${kind} added to Files never holds main (its loop under ${LATE_MS} ms late)`, got.late < LATE_MS, `${got.late} ms late at worst; main was asked: ${got.asked ?? '-'}  [${load()}]`)
    check(`and the ${kind} is kept as a PNG of its own size, a picture every window can draw, under its own name`, /\.png$/.test(got.one?.src ?? '') && got.size === '6000 x 4000' && got.one.name === name, `${(got.one?.src ?? '').slice(-20)} ${got.size} “${got.one?.name}”; refused ${JSON.stringify(got.refused)}`)
  }

  // 3. A 24-megapixel photograph in the store (or BIG=<a picture of your own>, such as the 10,446 by 13,522 painting of
  // the user's sandbox), dragged out of a note to another app: only the drag is measured.
  const photo = (await add(process.env.BIG ?? big)).one?.src ?? ''
  await h.waitForTimeout(2500)
  await electron.evaluate(({ webContents }) => {
    globalThis.__dragged = null
    for (const one of webContents.getAllWebContents()) one.startDrag = (item) => void (globalThis.__dragged = { file: item.file, empty: item.icon.isEmpty(), ...item.icon.getSize() })
  })
  const beforeDrag = await stalls()
  // PROF=1: where main's own time went while the drag began (its CPU profile, stalls.ts), the busiest first.
  if (process.env.PROF) await electron.evaluate(() => globalThis.mainProfile(true))
  await h.evaluate((src) => window.api.dragOut(src, 'Harbour at dusk'), photo)
  let dragged = null
  for (let t = 0; t < 40 && !dragged; t++) (await h.waitForTimeout(150), (dragged = await electron.evaluate(() => globalThis.__dragged)))
  const afterDrag = await stalls()
  if (process.env.PROF) {
    const { profile } = await electron.evaluate(() => globalThis.mainProfile(false))
    const self = new Map()
    const byId = new Map(profile.nodes.map((node) => [node.id, node]))
    profile.samples.forEach((id, i) => { const f = byId.get(id).callFrame; const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`; self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000) })
    console.log(`  (main's own time while the drag began: ${[...self].filter(([k]) => !/^\((idle|program|root)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, ms]) => `${k} ${Math.round(ms)} ms`).join(', ')})`)
  }
  check(`a ${process.env.BIG ? 'big' : '24-megapixel'} photograph dragged out never holds main (its loop under ${LATE_MS} ms late)`, dragged && afterDrag.delay.worst < LATE_MS, `${afterDrag.delay.worst} ms late at worst; main was asked: ${between(beforeDrag, afterDrag)}  [${load()}]`)
  check('and the drag carries the file under its name, with a small picture of it', dragged && !dragged.empty && dragged.width > 0 && dragged.width <= 96 && /Harbour at dusk\.(jpg|png)$/.test(dragged.file), JSON.stringify(dragged))

  // 4. "Copy image" on the same photograph, as a picture's menu asks it. The clipboard is the app's stand-in under a
  // test run (src/main/pasteboard.ts), so the Mac's own is never touched; its PNG's size is read from its header.
  await h.waitForTimeout(2500)
  await electron.evaluate(() => globalThis.qaPasteboard.clear())
  const beforeCopy = await stalls()
  const copied = await h.evaluate((src) => window.api.copyImage(src), photo)
  const afterCopy = await stalls()
  const onBoard = await electron.evaluate(async () => {
    for (const item of await globalThis.qaPasteboard.read()) {
      if (!item.types.includes('image/png')) continue
      const head = new DataView(await (await item.getType('image/png')).arrayBuffer())
      return `${head.getUint32(16)} x ${head.getUint32(20)}`
    }
    return null
  })
  check(`"Copy image" on a ${process.env.BIG ? 'big' : '24-megapixel'} photograph never holds main (its loop under ${LATE_MS} ms late)`, copied && afterCopy.delay.worst < LATE_MS, `${afterCopy.delay.worst} ms late at worst; main was asked: ${between(beforeCopy, afterCopy)}  [${load()}]`)
  check('and the clipboard holds it as a PNG of its own size', process.env.BIG ? !!onBoard : onBoard === '6000 x 4000', `copied ${copied}; on the clipboard: ${onBoard ?? 'no PNG'}`)

  // 5. The Feed's side column.
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

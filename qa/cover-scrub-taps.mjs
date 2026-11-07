// A book's cover in Files: rested on, then swept across, it turns through the pages, and each page crossed is a
// light trackpad tap (the last firm), as a scrubbed number is. Main only logs taps here (HALIGTREE_QA_AWAY).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/cover-scrub-taps.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, electron, go, close } = c
const wait = (ms) => h.waitForTimeout(ms)
const kinds = () => electron.evaluate(() => globalThis.haligtreeTapKinds?.() ?? [])
const dir = mkdtempSync(join(tmpdir(), 'cover-taps-'))
try {
  await v('settings:set', { hintRate: 0 })
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 6; n++) doc.addPage([300, 420]).drawText(`Page ${n}`, { x: 40, y: 300, size: 30, font })
  const path = join(dir, 'Six pages.pdf'); writeFileSync(path, await doc.save())
  await h.evaluate(async (p) => window.api.haligtree('media:add', [{ path: p }]), path)
  await go('media'); await wait(1500)
  const tile = h.locator('[data-pdf-peek]', { hasText: /Six pages/ }).first()
  const hit = (await tile.count()) ? tile : h.locator('[data-pdf-peek]').first()
  const b = await hit.boundingBox()
  check('a book to rest on', !!b)
  await h.mouse.move(b.x + 4, b.y + b.height / 2); await wait(900)
  const before = (await kinds()).length
  for (let i = 1; i <= 24; i++) { await h.mouse.move(b.x + 4 + ((b.width - 8) * i) / 24, b.y + b.height / 2); await wait(40) }
  await wait(300)
  const taps = (await kinds()).slice(before)
  check('swept across a six-page cover: a tap for each page crossed', taps.length >= 4 && taps.length <= 6, JSON.stringify(taps))
  check('the last page is the firm one', taps.at(-1) === 'level', JSON.stringify(taps))
} catch (e) { check('ran', false, e.message.split('\n')[0]) }
await close()
rmSync(dir, { recursive: true, force: true })
done()

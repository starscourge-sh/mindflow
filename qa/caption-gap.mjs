// The gap between a picture and its caption, at S, M, L, each alignment, a
// narrow window and a banded picture.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-fly/main/index.js SHOT=<dir> node qa/caption-gap.mjs
import { sandbox } from './sandbox-lib.mjs'
import { deflateSync, crc32 } from 'zlib'
// A 4:3 picture with black bands over and under a 16:9 one, as a YouTube thumbnail has.
function banded(width = 480, height = 360, band = 45) {
  const chunk = (type, data) => { const head = Buffer.alloc(8); head.writeUInt32BE(data.length); head.write(type, 4); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data]))); return Buffer.concat([head, data, crc]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr.set([8, 2, 0, 0, 0], 8)
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const at = y * (width * 3 + 1) + 1 + x * 3; const on = y >= band && y < height - band; raw[at] = on ? 200 : 0; raw[at + 1] = on ? 80 + (x % 100) : 0; raw[at + 2] = on ? 60 : 0 }
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64')
}
const c = await sandbox({ width: Number(process.env.W ?? 1100), height: 800 })
const { h, send } = c
const SHOT = process.env.SHOT
try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true }))
  const rows = await h.evaluate(() => window.api.captures.list())
  const id = rows.find((row) => (row.label ?? '').startsWith("Leonardo's"))?.id
  await send('capture', id); await h.waitForTimeout(2500)
  const measure = () => h.evaluate(() => [...document.querySelectorAll('.tiptap.ProseMirror.haligtree-editor:not(.is-line) img + .mf-caption')].map((cap) => {
    const img = cap.previousElementSibling
    const box = img.getBoundingClientRect()
    const r = img.naturalWidth / img.naturalHeight
    // The picture as drawn inside its box (object-fit: contain).
    const drawnH = Math.min(box.height, box.width / r)
    const drawnBottom = box.top + (box.height + drawnH) / 2
    return { w: img.getAttribute('width') ?? img.style.width, box: `${Math.round(box.width)}x${Math.round(box.height)}`, nat: `${img.naturalWidth}x${img.naturalHeight}`, boxGap: Math.round(cap.getBoundingClientRect().top - box.bottom), seenGap: Math.round(cap.getBoundingClientRect().top - drawnBottom), mb: getComputedStyle(img).marginBottom, ar: img.style.aspectRatio, ovb: img.style.objectViewBox || getComputedStyle(img).objectViewBox }
  }))
  // A banded thumbnail at the top, captioned.
  await h.evaluate((src) => {
    const ed = document.querySelector('.tiptap.ProseMirror.haligtree-editor:not(.is-line)').editor
    ed.view.dispatch(ed.state.tr.insert(ed.state.doc.child(0).nodeSize, ed.schema.nodes.image.create({ src, caption: 'hey jude' })))
  }, banded()); await h.waitForTimeout(800)
  console.log('as seeded', JSON.stringify(await measure(), null, 1))
  const size = (width, align) => h.evaluate(([width, align]) => {
    const ed = document.querySelector('.tiptap.ProseMirror.haligtree-editor:not(.is-line)').editor
    const tr = ed.state.tr
    ed.state.doc.descendants((node, pos) => { if (node.type.name === 'image') { tr.setNodeAttribute(pos, 'width', width); tr.setNodeAttribute(pos, 'align', align) } })
    ed.view.dispatch(tr)
  }, [width, align])
  for (const [label, width] of [['S', '35%'], ['M', '60%'], ['L', '100%']]) for (const align of ['left', 'center', 'right']) {
    await size(width, align); await h.waitForTimeout(400)
    console.log(label, align, JSON.stringify((await measure()).map((m) => [m.box, m.boxGap, m.seenGap])))
    if (SHOT && align === 'center') { await h.evaluate(() => document.querySelector('.mf-caption').scrollIntoView({ block: 'center' })); await h.waitForTimeout(300); await h.screenshot({ path: `${SHOT}/caption-${label}-${process.env.TAG ?? ''}.png` }) }
  }
  await size(null, null)
  await c.size(560, 800); await h.waitForTimeout(600)
  console.log('narrow', JSON.stringify((await measure()).map((m) => [m.box, m.boxGap, m.seenGap])))
  if (SHOT) { await h.evaluate(() => document.querySelector('.mf-caption').scrollIntoView({ block: 'center' })); await h.waitForTimeout(300); await h.screenshot({ path: `${SHOT}/caption-narrow-${process.env.TAG ?? ''}.png` }) }
  console.log('errors', c.errors.length, c.errors.slice(0, 3))
} finally { await c.close() }
process.exit(0)

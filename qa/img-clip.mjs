// No picture in a note is cut at a side: portrait, landscape, square, a JPEG
// turned by its camera, a PNG with clear margins, a wide screenshot, a photo
// with dark edges and a true letterboxed 4:3 (the only one whose top and
// bottom may go), at no size, S, M and L, with Postcards off and on.
//
// Each picture has bright strips along its edges and grey inside. What is
// on the screen is read back: the strips must all be there, as thick as they
// should be, and the drawn picture the shape of the real one.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-imgclip/main/index.js MINDFLOW_QA_AWAY=1 SHOT=<dir> TAG=after node qa/img-clip.mjs
// READ=1 checks the same in Read; LONG=1 in a note long enough to be drawn a band at a time.
import { sandbox } from './sandbox-lib.mjs'

const SHOT = process.env.SHOT
const TAG = process.env.TAG ?? ''
const c = await sandbox({ width: 1200, height: Number(process.env.H ?? 900) })
const { h } = c
let failed = 0
try {
  await h.evaluate(() => window.api.vigil('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true }))
  // Made in the page: each stored as a pasted picture would be.
  const pictures = await h.evaluate(async () => {
    const STRIP = 0.08
    const make = async ({ w, h, type = 'image/png', paint }) => {
      const canvas = new OffscreenCanvas(w, h)
      const g = canvas.getContext('2d')
      paint(g, w, h)
      return new Uint8Array(await (await canvas.convertToBlob({ type, quality: 0.95 })).arrayBuffer())
    }
    // Grey inside, a strip of its own colour along each edge (of the box given).
    const framed = (g, x, y, w, h, strip = STRIP) => {
      const grad = g.createLinearGradient(x, y, x + w, y + h)
      grad.addColorStop(0, '#777'); grad.addColorStop(1, '#bbb')
      g.fillStyle = grad; g.fillRect(x, y, w, h)
      const s = Math.round(Math.min(w, h) * strip)
      g.fillStyle = '#f00'; g.fillRect(x, y, s, h)
      g.fillStyle = '#0f0'; g.fillRect(x + w - s, y, s, h)
      g.fillStyle = '#00f'; g.fillRect(x, y, w, s)
      g.fillStyle = '#f0f'; g.fillRect(x, y + h - s, w, s)
    }
    // The Orientation 6 tag (turned a quarter clockwise) put into a JPEG.
    const turned = (jpeg) => {
      const exif = [0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0]
      const out = new Uint8Array(jpeg.length + exif.length)
      out.set(jpeg.subarray(0, 2)); out.set(exif, 2); out.set(jpeg.subarray(2), 2 + exif.length)
      return out
    }
    const list = [
      { name: 'portrait', w: 600, h: 900, paint: (g, w, h) => framed(g, 0, 0, w, h) },
      { name: 'landscape', w: 1600, h: 1000, type: 'image/jpeg', paint: (g, w, h) => framed(g, 0, 0, w, h) },
      { name: 'square', w: 700, h: 700, paint: (g, w, h) => framed(g, 0, 0, w, h) },
      // Stored 480x320, shown 320x480.
      { name: 'exif-turned', w: 480, h: 320, type: 'image/jpeg', exif: true, ratio: 320 / 480, paint: (g, w, h) => framed(g, 0, 0, w, h) },
      { name: 'clear-margins', w: 800, h: 600, paint: (g, w, h) => { g.clearRect(0, 0, w, h); framed(g, w * 0.3, h * 0.3, w * 0.4, h * 0.4, 0.15); g.fillStyle = '#f00'; g.fillRect(0, 0, 6, h); g.fillStyle = '#0f0'; g.fillRect(w - 6, 0, 6, h); g.fillStyle = '#00f'; g.fillRect(0, 0, w, 6); g.fillStyle = '#f0f'; g.fillRect(0, h - 6, w, 6) }, thin: true },
      { name: 'wide-screenshot', w: 2880, h: 900, paint: (g, w, h) => framed(g, 0, 0, w, h, 0.12) },
      // A 3:2 photo, black over and under, dark at the sides: not a letterbox, never cut.
      // Its marks run its whole height a tenth in from each side (clear of the round corners), so the seen shape is 0.8 of its width by all its height.
      { name: 'dark-edges', w: 900, h: 600, ratio: 1.2, paint: (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); const grad = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, h * 0.4); grad.addColorStop(0, '#c84'); grad.addColorStop(1, '#000'); g.fillStyle = grad; g.fillRect(0, h * 0.12, w, h * 0.76); g.fillStyle = '#f00'; g.fillRect(w * 0.1, 0, 5, h); g.fillStyle = '#0f0'; g.fillRect(w * 0.9 - 5, 0, 5, h) }, thin: true },
      // A film still in a 3:2 frame: clear black bands over and under, but not 4:3, so they stay.
      { name: 'banded-3x2', w: 900, h: 600, ratio: 1.2, paint: (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); const grad = g.createLinearGradient(0, 0, w, 0); grad.addColorStop(0, '#999'); grad.addColorStop(1, '#ddd'); g.fillStyle = grad; g.fillRect(0, 72, w, h - 144); g.fillStyle = '#f00'; g.fillRect(w * 0.1, 0, 5, h); g.fillStyle = '#0f0'; g.fillRect(w * 0.9 - 5, 0, 5, h) }, thin: true },
      // 16:9 with black bands baked in over and under: the bands may go, nothing else.
      { name: 'letterboxed-4x3', w: 480, h: 360, type: 'image/jpeg', ratio: 16 / 9, paint: (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); framed(g, 0, 45, w, 270) } },
    ]
    const out = []
    for (const one of list) {
      let bytes = await make(one)
      if (one.exif) bytes = turned(bytes)
      const src = await window.api.saveImage(one.type ?? 'image/png', bytes)
      out.push({ name: one.name, src, ratio: one.ratio ?? one.w / one.h, thin: !!one.thin })
    }
    return out
  })
  const body = { type: 'doc', content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Pictures' }] },
    ...pictures.flatMap((p) => [{ type: 'paragraph', content: [{ type: 'text', text: p.name }] }, { type: 'image', attrs: { src: p.src } }]),
    // A long note (past 200,000 positions) is drawn a band at a time (extensions/long-document.ts).
    ...(process.env.LONG ? [{ type: 'paragraph', content: [{ type: 'text', text: 'word '.repeat(41000) }] }] : []),
  ] }
  const id = await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }).then((one) => one.id ?? one), body)
  await c.send('capture', id); await h.waitForTimeout(2500)
  console.log('long note:', await h.evaluate(() => document.querySelector('.tiptap.ProseMirror.mindflow-editor:not(.is-line)').hasAttribute('data-long')))

  // READ=1: the same pictures in Read, the page that is only for reading.
  const EDITOR = process.env.READ ? '.mf-read .tiptap.ProseMirror.mindflow-editor:not(.is-line)' : '.tiptap.ProseMirror.mindflow-editor:not(.is-line)'
  if (process.env.READ) { await h.evaluate(() => document.querySelector('button[aria-label="Read"]').click()); await h.waitForTimeout(2000) }
  const size = (width) => h.evaluate(([width, EDITOR]) => {
    const ed = document.querySelector(EDITOR).editor
    const tr = ed.state.tr
    ed.state.doc.descendants((node, pos) => { if (node.type.name === 'image') tr.setNodeAttribute(pos, 'width', width) })
    ed.view.dispatch(tr)
  }, [width, EDITOR])
  // What is on the screen where the picture is: the coloured strips' extent and thickness.
  const read = async (index) => {
    const box = await h.evaluate(([index, EDITOR]) => {
      const img = document.querySelectorAll(`${EDITOR} img`)[index]
      img.scrollIntoView({ block: 'center', behavior: 'instant' })
      return null
    }, [index, EDITOR])
    await h.mouse.move(5, 5)
    await h.waitForTimeout(350)
    const at = await h.evaluate(([index, EDITOR]) => {
      const img = document.querySelectorAll(`${EDITOR} img`)[index]
      const r = img.getBoundingClientRect()
      const s = getComputedStyle(img)
      return { x: r.x, y: r.y, w: r.width, h: r.height, natural: [img.naturalWidth, img.naturalHeight], fit: s.objectFit, box: s.objectViewBox, ratio: img.style.aspectRatio, banded: img.hasAttribute('data-banded'), dpr: devicePixelRatio }
    }, [index, EDITOR])
    // Only the pictures drawn while they are read: no header, toast or button over them.
    await h.evaluate((EDITOR) => { const s = document.createElement('style'); s.id = 'qa-only-pictures'; s.textContent = `body * { visibility: hidden !important } ${EDITOR} img { visibility: visible !important }`; document.head.append(s) }, EDITOR)
    const pad = 8
    const clip = { x: Math.max(0, at.x - pad), y: Math.max(0, at.y - pad), width: at.w + pad * 2, height: at.h + pad * 2 }
    const png = (await h.screenshot({ clip })).toString('base64')
    await h.evaluate(() => document.getElementById('qa-only-pictures')?.remove())
    // Read back with the system's own decoder, in the main process (BGRA).
    const { width, height, bgra } = await c.electron.evaluate(({ nativeImage }, png) => {
      const image = nativeImage.createFromBuffer(Buffer.from(png, 'base64'))
      const { width, height } = image.getSize()
      return { width, height, bgra: image.toBitmap().toString('base64') }
    }, png)
    const data = Buffer.from(bgra, 'base64')
    const seen = (() => {
      const bright = (x, y) => { const i = (y * width + x) * 4; const [b, gg, r] = [data[i], data[i + 1], data[i + 2]]; return Math.max(r, gg, b) - Math.min(r, gg, b) > 140 }
      let left = width, right = -1, top = height, bottom = -1
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (bright(x, y)) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y) }
      if (right < 0) return null
      const midY = Math.round((top + bottom) / 2), midX = Math.round((left + right) / 2)
      const run = (x, y, dx, dy) => { let n = 0; while (x >= 0 && y >= 0 && x < width && y < height && bright(x, y)) { n++; x += dx; y += dy } return n }
      return { w: right - left + 1, h: bottom - top + 1, l: run(left, midY, 1, 0), r: run(right, midY, -1, 0), t: run(midX, top, 0, 1), b: run(midX, bottom, 0, -1) }
    })()
    return { at, seen, png }
  }
  for (const postcards of [false, true]) {
    await h.evaluate((on) => window.api.vigil('settings:set', { postcards: on }), postcards); await h.waitForTimeout(500)
    for (const [label, width] of [['auto', null], ['S', '35%'], ['M', '60%'], ['L', '100%']]) {
      await size(width); await h.waitForTimeout(500)
      for (const [index, p] of pictures.entries()) {
        const { at, seen } = await read(index)
        const problems = []
        if (!seen) problems.push('nothing seen')
        else {
          const ratio = seen.w / seen.h
          if (Math.abs(ratio / p.ratio - 1) > 0.04) problems.push(`shape ${ratio.toFixed(3)} not ${p.ratio.toFixed(3)}`)
          if (!p.thin) {
            const want = Math.min(seen.w, seen.h) * (p.name === 'wide-screenshot' ? 0.12 : 0.08)
            for (const side of ['l', 'r', 't', 'b']) if (seen[side] < want * 0.8) problems.push(`${side} strip ${seen[side]}px of ${want.toFixed(0)}`)
          }
        }
        if (at.banded !== (p.name === 'letterboxed-4x3') && p.name !== 'letterboxed-4x3') problems.push('marked banded')
        if (problems.length) failed++
        console.log(`${postcards ? 'postcard' : 'plain   '} ${label.padEnd(4)} ${p.name.padEnd(16)} ${problems.length ? 'CUT ' + problems.join(', ') : 'ok'}  box ${Math.round(at.w)}x${Math.round(at.h)} nat ${at.natural.join('x')} ar ${at.ratio || '-'} ovb ${at.box}${seen ? ` seen ${seen.w}x${seen.h}` : ''}`)
      }
      if (SHOT && (label === 'auto' || label === 'M')) {
        await h.evaluate(([EDITOR]) => document.querySelectorAll(`${EDITOR} img`)[0].scrollIntoView({ block: 'start' }), [EDITOR]); await h.waitForTimeout(300)
        for (let page = 0; page < 3; page++) {
          await h.screenshot({ path: `${SHOT}/${TAG}-${postcards ? 'postcard' : 'plain'}-${label}-${page}.png` })
          await h.mouse.move(600, 450); await h.mouse.wheel(0, 800); await h.waitForTimeout(350)
        }
      }
    }
  }
  await h.evaluate(() => window.api.vigil('settings:set', { postcards: false }))
  // Tilt and the following caption, two switches in Settings: tilt off by
  // default (always on in Focus), the caption following on by default, and
  // each working without the other.
  await size(null)
  await h.evaluate((EDITOR) => {
    const ed = document.querySelector(EDITOR).editor
    let at = -1
    ed.state.doc.descendants((node, pos) => { if (at < 0 && node.type.name === 'image') at = pos })
    ed.view.dispatch(ed.state.tr.setNodeAttribute(at, 'caption', 'A picture with a caption'))
  }, EDITOR); await h.waitForTimeout(400)
  const hover = async () => {
    const r = await h.evaluate((EDITOR) => { const im = document.querySelectorAll(`${EDITOR} img`)[0]; im.scrollIntoView({ block: 'center', behavior: 'instant' }); const b = im.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height } }, EDITOR)
    await h.mouse.move(5, 5); await h.waitForTimeout(250)
    await h.mouse.move(r.x + r.w * 0.3, r.y + r.h * 0.4, { steps: 8 }); await h.waitForTimeout(500)
    return h.evaluate((EDITOR) => { const im = document.querySelectorAll(`${EDITOR} img`)[0]; return { tips: !!im.style.transform, follows: im.nextElementSibling?.hasAttribute('data-following') ?? false } }, EDITOR)
  }
  const cases = [
    ['as it comes', {}, false, false, true],
    ['tilt on, caption on', { tiltPictures: true, captionFollows: true }, false, true, true],
    ['tilt on, caption off', { tiltPictures: true, captionFollows: false }, false, true, false],
    ['tilt off, caption off', { tiltPictures: false, captionFollows: false }, false, false, false],
    ['tilt off, caption on', { tiltPictures: false, captionFollows: true }, false, false, true],
    ['tilt off, in Focus', { tiltPictures: false, captionFollows: true }, true, true, true],
  ]
  for (const [what, set, focus, tips, follows] of cases) {
    if (Object.keys(set).length) await h.evaluate((set) => window.api.vigil('settings:set', set), set)
    await h.evaluate((on) => (document.documentElement.dataset.focus = on ? 'on' : 'off'), focus); await h.waitForTimeout(400)
    const got = await hover()
    const right = got.tips === tips && got.follows === follows
    if (!right) failed++
    console.log(`${what}: ${got.tips ? 'tips' : 'flat'}, caption ${got.follows ? 'follows' : 'stays'} ${right ? 'ok' : 'WRONG'}`)
  }
  await h.evaluate(() => { document.documentElement.dataset.focus = 'off'; return window.api.vigil('settings:set', { tiltPictures: false, captionFollows: true }) })
  console.log(failed ? `FAILED ${failed}` : 'ALL OK', 'errors', c.errors.length, c.errors.slice(0, 3))
} finally { await c.close() }
process.exit(failed ? 1 : 0)

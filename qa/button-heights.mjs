// Every Button variant paints the same height at each size: default, ghost
// (in its hover fill), secondary and outline, read from the pixels, not the box.
// Also drawn the way they were before (the fill clipped to the padding box), to
// show the 2px a filled button lost. Then the monthly wrap offer's row: its
// three controls one height.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/button-heights.mjs
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-button-heights-'))
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')
const { checks } = await import('./harness.mjs')
const { check, done } = checks()

const button = readFileSync(new URL('../src/renderer/src/components/ui/button.tsx', import.meta.url), 'utf8')
const BASE = button.match(/cva\(\s*"([^"]+)"/)[1]
const pick = (name) => button.match(new RegExp(`\\b"?${name}"?:\\s*"([^"]+)"`))[1]
const SIZES = { xs: pick('xs'), sm: pick('sm'), default: button.match(/size: \{\s*default:\s*"([^"]+)"/)[1], lg: pick('lg') }
// Ghost is drawn in its hover fill (hover:bg-muted), the look the user saw.
const VARIANTS = { default: pick('default'), ghost: 'bg-muted text-foreground', secondary: pick('secondary'), outline: pick('outline') }

// Rows of the picture that differ from the page behind, in CSS pixels.
const painted = async (h, locator) => {
  const box = await locator.boundingBox()
  const shot = await h.screenshot({ clip: { x: box.x - 4, y: box.y - 4, width: box.width + 8, height: box.height + 8 } })
  return h.evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode()
    const canvas = new OffscreenCanvas(img.width, img.height)
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0)
    const { data } = ctx.getImageData(0, 0, img.width, img.height)
    const bg = [data[0], data[1], data[2]]
    // A band of columns between the rounded corner and the words.
    let rows = 0
    for (let y = 0; y < img.height; y++) {
      let hit = false
      for (let x = Math.floor(img.width * 0.15); x < Math.floor(img.width * 0.25) && !hit; x++) {
        const i = (y * img.width + x) * 4
        if (Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) > 6) hit = true
      }
      if (hit) rows++
    }
    return rows / devicePixelRatio
  }, shot.toString('base64'))
}

const c = await sandbox({ width: 1200, height: 800 })
const { h, v, look, close } = c
try {
  for (const theme of ['paper', 'dark']) {
    await look(theme)
    const table = {}
    for (const clip of ['before', 'after']) {
      for (const [size, sizeCls] of Object.entries(SIZES)) {
        const heights = {}
        for (const [variant, variantCls] of Object.entries(VARIANTS)) {
          await h.evaluate(({ cls, clip }) => {
            document.querySelector('#mf-probe-button')?.remove()
            const holder = Object.assign(document.createElement('div'), { id: 'mf-probe-button' })
            holder.style.cssText = 'position:fixed;left:300px;top:300px;z-index:99999;padding:20px;background:var(--background)'
            const b = Object.assign(document.createElement('button'), { className: cls, textContent: 'Not now' })
            b.style.width = '120px'
            if (clip === 'before') b.style.backgroundClip = 'padding-box'
            holder.append(b); document.body.append(holder)
          }, { cls: `${BASE} ${variantCls} ${sizeCls}`, clip })
          heights[variant] = await painted(h, h.locator('#mf-probe-button > button'))
        }
        table[`${clip} ${size}`] = heights
        if (clip === 'after') check(`[${theme}] ${size}: every variant paints one height`, new Set(Object.values(heights)).size === 1, JSON.stringify(heights))
      }
    }
    await h.evaluate(() => document.querySelector('#mf-probe-button')?.remove())
    console.log(`[${theme}] painted heights (px):`)
    console.table(table)
  }

  // The wrap offer: a month that has not been offered yet, two months back.
  await look('dark')
  const back = new Date(); back.setDate(1); back.setMonth(back.getMonth() - 2)
  await v('settings:set', { wrapOffered: `${back.getFullYear()}-${String(back.getMonth() + 1).padStart(2, '0')}`, wrapOffer: true })
  await h.reload(); await h.waitForTimeout(1500)
  await h.locator('[data-wrap-offer]').waitFor({ timeout: 15000 }).catch(() => {})
  const row = h.locator('[data-wrap-offer] > div').last()
  const controls = row.locator('button')
  const n = await controls.count()
  check('the wrap offer shows with its row of three', n === 3, String(n))
  // "Not now" in its hover fill, as in the user's picture.
  await controls.nth(1).hover(); await h.waitForTimeout(300)
  const boxes = []
  for (let i = 0; i < n; i++) boxes.push({ text: await controls.nth(i).innerText(), box: (await controls.nth(i).boundingBox()).height, paint: i < 2 ? await painted(h, controls.nth(i)) : null })
  check('its three controls are one height', new Set(boxes.map((b) => b.box)).size === 1, JSON.stringify(boxes))
  check('Open and Not now paint one height', boxes[0]?.paint === boxes[1]?.paint, JSON.stringify(boxes))
  const words = await h.locator('[data-wrap-offer] p').nth(1).innerText().catch(() => '')
  check('the offer reads as a sentence', /where your focus went, and what you planned against what you did/.test(words), words)
  await h.locator('[data-wrap-offer]').screenshot({ path: `${process.env.QA_SHOTS ?? tmpdir()}/wrap-offer-dark.png` })
} catch (e) {
  check('ran without an error', false, e.message)
} finally {
  await close()
}
done()

// “Pictures in notes”: a picture with no size of its own shows full width,
// medium or small as Settings says; one sized from its own menu keeps its size.
// Settings shows the three choices, each a picture of what it does.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-small/main/index.js HALIGTREE_QA_AWAY=1 node qa/picture-size.mjs
import zlib from 'node:zlib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

/** A wide plain PNG, 1600 by 400, so full width is the column's width. */
const png = () => {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body)); return Buffer.concat([len, body, sum]) }
  const w = 1600, ht = 400
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(ht, 4); head[8] = 8; head[9] = 2
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 120)])
  return `data:image/png;base64,${Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: ht }, () => row)))), chunk('IEND', Buffer.alloc(0))]).toString('base64')}`
}

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const ratios = () => h.evaluate(() => {
  const editor = document.querySelector('[data-open] .tiptap')
  const width = [...editor.querySelectorAll('p')].pop().getBoundingClientRect().width
  const imgs = [...editor.querySelectorAll('img')]
  return imgs.map((img) => Math.round((img.getBoundingClientRect().width / width) * 100))
})

try {
  await v('settings:set', { sounds: false, hintRate: 0, pictureSize: 'full' })
  const src = png()
  const id = await v('article:new')
  await v('item:save', id, { title: 'Pictured', body: { type: 'doc', content: [
    { type: 'image', attrs: { src } },
    { type: 'image', attrs: { src, width: '35%' } },
    { type: 'paragraph' }
  ] } })
  await c.send('article', id); await wait(1500)
  const full = await ratios()
  check('full width: the picture fills the column', full[0] >= 95, JSON.stringify(full))
  await v('settings:set', { pictureSize: 'medium' }); await wait(600)
  const medium = await ratios()
  check('medium: the picture is about 60% wide', medium[0] >= 57 && medium[0] <= 63, JSON.stringify(medium))
  check('a picture sized from its menu keeps its size', medium[1] >= 32 && medium[1] <= 38, JSON.stringify(medium))
  await v('settings:set', { pictureSize: 'small' }); await wait(600)
  const small = await ratios()
  check('small: the picture is about 35% wide', small[0] >= 32 && small[0] <= 38, JSON.stringify(small))
  // Clicked, a picture following the setting shows which size that is in its menu.
  // Picked as a click picks it: the whole picture.
  await h.evaluate(() => document.querySelector('[data-open] .tiptap').editor.chain().focus().setNodeSelection(0).run()); await wait(600)
  const lit = await h.evaluate(() => [...document.querySelectorAll('[aria-label$=" width"][data-active-state="on"]')].map((one) => `${one.getAttribute('aria-label')}${one.hasAttribute('data-following') ? ' following' : ''}`))
  check('its menu lights “S”, the size it follows from Settings', lit.join() === 'S width following', `${lit.join()} ${await h.evaluate(() => document.documentElement.dataset.pictureSize)}`)
  await h.screenshot({ path: `${shots}/picture-size-small.png` })

  await c.go('settings'); await h.click('[data-section="Appearance"]'); await wait(700)
  await h.evaluate(() => document.querySelector('[data-choices="Pictures in notes"]')?.scrollIntoView({ block: 'center' })); await wait(400)
  const tiles = await h.evaluate(() => [...document.querySelectorAll('[data-choices="Pictures in notes"] [data-choice]')].map((one) => `${one.dataset.choice}:${one.getAttribute('aria-checked')}`))
  check('Settings shows the three choices, “Small” picked', tiles.join(' ') === 'full:false medium:false small:true', tiles.join(' '))
  await h.click('[data-choices="Pictures in notes"] [data-choice="medium"]'); await wait(500)
  check('picking one in Settings keeps it', (await v('settings'))?.pictureSize === 'medium', '')
  await h.screenshot({ path: `${shots}/picture-size-settings.png` })
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close?.()
  done()
}

// Media's "Recent pictures" row looks like it works: a round "Previous" and "Next" button either side, in the
// swipe-back arrow's look, each turning it one picture (disabled at the ends of a short row, never hidden), ← and →
// doing the same, and the picked picture's title on its own row under the pictures in the editor's caption look,
// never over a picture, at 1280 and 1600 wide. 103 pictures, the first titled as long as the user's. Light and dark
// frames with SHOT=<dir>.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<dir>] node qa/media-carousel.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const LONG = '#bug-report #haligtree i copied noted from the sandbox into my own notes and the pictures came with them but the titles did not'
const picture = (n) => h.evaluate(async (n) => {
  const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 300
  const pen = canvas.getContext('2d'); pen.fillStyle = `hsl(${(n * 47) % 360} 70% 50%)`; pen.fillRect(0, 0, 400, 300)
  const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/png'))
  return window.api.saveImage('image/png', new Uint8Array(await blob.arrayBuffer()))
}, n)
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const make = (body) => h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), { type: 'doc', content: body })
const active = () => h.evaluate(() => Number(document.querySelector('[data-recent-pictures] [data-flex-carousel]')?.dataset.active ?? -1))
// The title's box, and how many strongly coloured pixels (the pictures are vivid; the page and its words are not)
// lie inside it, read from a picture of the window.
const overlap = async () => {
  const box = await h.evaluate(() => {
    const row = document.querySelector('[data-recent-pictures]')
    const title = row?.querySelector('[data-flex-carousel-title]') ?? row?.querySelector('[data-flex-carousel] [aria-hidden=true] span')
    if (!title) return null
    const range = document.createRange(); range.selectNodeContents(title)
    const r = range.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height, text: title.textContent }
  })
  if (!box || !box.width) return { box, vivid: -1 }
  const png = await h.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } })
  const vivid = await h.evaluate(async (data) => {
    const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode()
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
    const pen = canvas.getContext('2d'); pen.drawImage(image, 0, 0)
    const px = pen.getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    for (let i = 0; i < px.length; i += 4) { const hi = Math.max(px[i], px[i + 1], px[i + 2]), lo = Math.min(px[i], px[i + 1], px[i + 2]); if (hi - lo > 90) count++ }
    return count
  }, png.toString('base64'))
  return { box, vivid }
}
try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: true })
  for (let n = 102; n >= 1; n--) await make([para(`Picture note ${n}`), { type: 'image', attrs: { src: await picture(n) } }])
  await make([para(LONG), { type: 'image', attrs: { src: await picture(0) } }])
  for (const width of [1280, 1600]) {
    await c.size(width, 860)
    await go('home'); await go('media'); await wait(800)
    await h.locator('[data-page=media] [data-media-kinds] button', { hasText: 'Pictures' }).first().click(); await wait(3500)
    const seen = await overlap()
    console.log(width, JSON.stringify(seen))
    check(`${width} wide: the title sits clear of every picture`, seen.box && seen.vivid === 0, `${seen.vivid} picture pixels under "${seen.box?.text?.slice(0, 40)}"`)
    if (SHOT) await c.both(`${SHOT}/recent-${width}`)
  }
  const buttons = await h.evaluate(() => [...document.querySelectorAll('[data-recent-pictures] [data-flex-carousel-turn]')].map((b) => ({ way: b.dataset.flexCarouselTurn, cursor: getComputedStyle(b).cursor, disabled: b.disabled })))
  check('a "Previous" and a "Next" button either side of the pictures', buttons.length === 2 && buttons[0].way === 'previous' && buttons[1].way === 'next', JSON.stringify(buttons))
  check('they show the hand', buttons.every((b) => b.disabled || b.cursor === 'pointer'), JSON.stringify(buttons))
  // The button's middle level with the pictures' middle.
  const level = await h.evaluate(() => {
    const row = document.querySelector('[data-recent-pictures]')
    const b = row.querySelector('[data-flex-carousel-turn=next]').getBoundingClientRect(), car = row.querySelector('[data-flex-carousel]').getBoundingClientRect()
    return { button: b.y + b.height / 2 - car.y, row: car.height }
  })
  check('the buttons are level with the pictures, not the whole row', level.button > 20 && level.button < level.row * 0.7, JSON.stringify(level))
  // How many pictures the row holds (the sandbox's own and the 103 made here), from its counter "01 / 126".
  const total = await h.evaluate(() => Number(document.querySelector('[data-recent-pictures] [data-flex-carousel-caption]').textContent.match(/\/ ([\d,]+)/)[1].replace(',', '')))
  const a0 = await active()
  await h.click('[data-recent-pictures] [data-flex-carousel-turn=next]'); await wait(700)
  const a1 = await active()
  await h.click('[data-recent-pictures] [data-flex-carousel-turn=previous]'); await wait(700)
  const a2 = await active()
  check('"Next" turns it one on, "Previous" one back', a1 === (a0 + 1) % total && a2 === a0, `${a0} → ${a1} → ${a2}`)
  const t1 = await h.evaluate(() => document.querySelector('[data-recent-pictures] [data-flex-carousel-title]')?.textContent)
  await h.keyboard.press('ArrowRight'); await wait(700)
  const k1 = await active()
  await h.keyboard.press('ArrowLeft'); await h.keyboard.press('ArrowLeft'); await wait(700)
  const k2 = await active()
  check('→ and ← turn it too', k1 === (a2 + 1) % total && k2 === (a2 + total - 1) % total, `${a2} → ${k1} → ${k2}`)
  const t2 = await h.evaluate(() => document.querySelector('[data-recent-pictures] [data-flex-carousel-title]')?.textContent)
  check('the title changes with it', t1 && t2 && t1 !== t2, `${t1} / ${t2}`)
  // The caption look: the editor's caption size and colour, not a second style.
  const look = await h.evaluate(() => { const s = getComputedStyle(document.querySelector('[data-recent-pictures] [data-flex-carousel-title]')); return { size: s.fontSize, colour: s.color, clamp: s.webkitLineClamp } })
  check('the title wears the editor\'s caption look, two lines at most', look.clamp === '2', JSON.stringify(look))
  // Frames every 50ms through a turn by the button, light and dark.
  if (SHOT) for (const name of ['light', 'dark']) {
    await c.look(name)
    const cdp = await h.context().newCDPSession(h)
    let n = 0
    const { writeFileSync } = await import('fs')
    cdp.on('Page.screencastFrame', async ({ data, sessionId }) => { await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}); writeFileSync(`${SHOT}/turn-${name}-${String(n++).padStart(3, '0')}.jpg`, Buffer.from(data, 'base64')) })
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70 })
    await h.click('[data-recent-pictures] [data-flex-carousel-turn=next]'); await wait(900)
    await cdp.send('Page.stopScreencast'); await cdp.detach()
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()

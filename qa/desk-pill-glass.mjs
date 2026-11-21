// A desk pill on glass (ask 73, 14 Nov: "is there a reason this does not follow the standard of having a frosted/blured
// background?"): a glass card folded into its pill has the Mac's own blur under the pill, told to main as the pill's
// shape, and its words on the page's own colour over it, opaque (21 Nov: a see-through pill let another app's words
// show through), at 4.5:1 with a white or a black desktop behind (the Mac's own tint left out). Opened out of its pill, the card stays solid
// while it grows by its clip out of the pill's own shape, the pill hidden meanwhile (one surface, no blur told);
// pinned, the card wears its glass again.
// A paper card's pill stays solid. In both looks; with QA_SHOTS, the pill laid over a white page and a dark one.
//
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [QA_SHOTS=<dir>] node qa/desk-pill-glass.mjs
import { writeFileSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (test, ms) => {
  for (const end = Date.now() + ms; Date.now() < end; await wait(50)) if (await test()) return true
  return test()
}
const shots = process.env.QA_SHOTS
const luminance = ([r, g, b]) => [r, g, b].map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }

const c = await sandbox()
const pageOf = (url) => c.electron.windows().find((p) => p.url() === url)
/** The goal's card window: its id, address and bounds. */
const goalWin = () => c.electron.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows().find((one) => !one.isDestroyed() && one.isVisible() && /view=sticky/.test(one.webContents.getURL()) && one.webContents.getURL().includes('type=goal&'))
  return w ? { id: w.id, url: w.webContents.getURL(), bounds: w.getBounds() } : null
})
/** The pill as its page draws it, the glass shapes main was told for its window, and the window's picture. */
const state = (id) => c.electron.evaluate(async ({ BrowserWindow }, id) => {
  const w = BrowserWindow.fromId(id)
  if (!w || w.isDestroyed()) return null
  const told = (globalThis.haligtreeGlass?.() ?? []).find(([wid]) => wid === id)?.[1]?.shapes ?? []
  const page = await w.webContents.executeJavaScript(`(() => {
    const p = document.querySelector('[data-desk-pill]')
    const card = document.querySelector('[data-goal-card]')
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }
    const pen = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
    const rgb = (c) => { pen.clearRect(0, 0, 1, 1); pen.fillStyle = '#000'; pen.fillStyle = c; pen.fillRect(0, 0, 1, 1); return [...pen.getImageData(0, 0, 1, 1).data].slice(0, 3) }
    return {
      pill: p && { ...box(p), state: p.dataset.deskPill, hidden: getComputedStyle(p).visibility === 'hidden', words: rgb(getComputedStyle(p.querySelector('[data-pill-words]') ?? p).color), number: p.querySelector('[data-pill-number]') ? rgb(getComputedStyle(p.querySelector('[data-pill-number]')).color) : null },
      card: box(card), glass: document.documentElement.dataset.glass ?? null, open: document.documentElement.getAttribute('data-pill-open'),
      wash: getComputedStyle(document.documentElement).getPropertyValue('--mf-glass-wash').trim(), zoom: devicePixelRatio
    }
  })()`)
  const image = await w.webContents.capturePage()
  return { told, ...page, bounds: w.getBounds(), png: image.toDataURL(), size: image.getSize() }
}, id)
/** The window's picture laid over a white page and a black one, as an eye would see it with nothing blurred: the
 * pixels at `points` (window points) read back over each. */
const over = (s, points) => c.h.evaluate(async ([png, size, bounds, points]) => {
  const image = await new Promise((done) => { const one = new Image(); one.onload = () => done(one); one.onerror = () => done(null); one.src = png })
  if (!image) return null
  const scale = size.width / bounds.width
  const canvas = new OffscreenCanvas(size.width, size.height)
  const pen = canvas.getContext('2d', { willReadFrequently: true })
  const out = {}
  for (const [name, colour] of [['white', '#ffffff'], ['black', '#000000']]) {
    pen.fillStyle = colour
    pen.fillRect(0, 0, size.width, size.height)
    pen.drawImage(image, 0, 0)
    out[name] = points.map(([x, y]) => [...pen.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data].slice(0, 3))
  }
  // How much of the window's own picture is there at each point: 255 is a ground with nothing behind showing.
  pen.clearRect(0, 0, size.width, size.height)
  pen.drawImage(image, 0, 0)
  out.alpha = points.map(([x, y]) => pen.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data[3])
  return out
}, [s.png, s.size, s.bounds, points])
/** A frame of the window over a page of `colour`, for the eye. */
const frame = (s, colour, file) => shots && c.h.evaluate(async ([png, size, colour]) => {
  const image = await new Promise((done) => { const one = new Image(); one.onload = () => done(one); one.onerror = () => done(null); one.src = png })
  const canvas = new OffscreenCanvas(size.width, size.height)
  const pen = canvas.getContext('2d')
  pen.fillStyle = colour
  pen.fillRect(0, 0, size.width, size.height)
  if (image) pen.drawImage(image, 0, 0)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return new Promise((done) => { const r = new FileReader(); r.onload = () => done(String(r.result).split(',')[1]); r.readAsDataURL(blob) })
}, [s.png, s.size, colour]).then((data) => { writeFileSync(join(shots, file), Buffer.from(data, 'base64')); console.log(`picture: ${join(shots, file)}`) })
/** Whether a told shape covers the pill (window points, the page's zoom applied by main). */
const covers = (shape, pill, zoom = 1) => !!shape && !!pill && Math.abs(shape[0] / zoom - pill.x) <= 1.5 && Math.abs(shape[1] / zoom - pill.y) <= 1.5 && Math.abs(shape[2] / zoom - pill.w) <= 1.5 && Math.abs(shape[3] / zoom - pill.h) <= 1.5

try {
  await wait(2500)
  await c.v('settings:set', { stickiesFrosted: true, stickiesGlass: true })
  check('a glass goal card is up', await until(async () => /glass=1/.test((await goalWin())?.url ?? ''), 10_000))
  await wait(1500)
  let goal = await goalWin()
  const page = pageOf(goal.url)
  await page.hover('[data-goal-card]').catch(() => {})
  await page.locator('[aria-label="Fold it into its pill"]').first().dispatchEvent('click')
  check('its “–” folds it into its pill', await until(async () => (await state(goal.id))?.pill?.state === 'folded', 4000))
  await wait(900)

  for (const look of ['light', 'dark']) {
    await c.look(look)
    await wait(700)
    const s = await state(goal.id)
    const pill = s.pill
    // The pill's ground, clear of its words and its lit top edge: a row 5 points down, between its round ends.
    const ground = [[pill.x + pill.h / 2 + 2, pill.y + 5], [pill.x + pill.w / 2, pill.y + 5], [pill.x + pill.w - pill.h / 2 - 2, pill.y + 5]]
    const seen = await over(s, ground)
    const glassUnder = s.told.length === 1 && covers(s.told[0], pill, 1)
    check(`${look}: folded, the Mac's blur is told to main under the pill, its shape and nowhere else`, glassUnder, JSON.stringify({ told: s.told, pill: [pill.x, pill.y, pill.w, pill.h].map(Math.round) }))
    // Opaque on glass too (21 Nov: another app's words showed through a frosted pill).
    check(`${look}: its ground is opaque: nothing behind it shows through`, !!seen && seen.alpha.every((a) => a === 255), JSON.stringify(seen?.alpha))
    const inks = [pill.words, ...(pill.number ? [pill.number] : [])]
    const worst = seen ? Math.min(...inks.flatMap((ink) => [...seen.white, ...seen.black].map((g) => contrast(ink, g)))) : 0
    check(`${look}: its words keep 4.5:1 with a white or a black desktop straight through it`, worst >= 4.5, `${worst.toFixed(2)}:1 (words rgb(${pill.words}), ground over white rgb(${seen?.white[1]}), over black rgb(${seen?.black[1]}))`)
    await frame(s, '#ffffff', `desk-pill-${look}-over-white.png`)
    await frame(s, '#1c1c1e', `desk-pill-${look}-over-dark.png`)
  }
  // Paper, which prints everything flat: still frosted, as its glass card is, but square and with no shadow.
  await c.h.evaluate(() => { localStorage.setItem('style', 'paper'); window.dispatchEvent(new StorageEvent('storage', { key: 'style' })) })
  await wait(900)
  {
    const s = await state(goal.id)
    const flat = await c.electron.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).webContents.executeJavaScript(`(() => { const p = document.querySelector('[data-desk-pill]'); const s = p && getComputedStyle(p); return s && { shadow: s.boxShadow, filter: s.filter, radius: s.borderTopLeftRadius } })()`), goal.id).catch(() => null)
    check('Paper: the pill still frosted, square, no shadow and no lift', s.told.length === 1 && s.told[0][4] === 0 && flat?.shadow === 'none' && flat?.filter === 'none' && flat?.radius === '0px', JSON.stringify({ told: s.told, flat }))
    await frame(s, '#ffffff', 'desk-pill-paper-style-over-white.png')
  }
  await c.h.evaluate(() => { localStorage.setItem('style', 'soft'); window.dispatchEvent(new StorageEvent('storage', { key: 'style' })) })
  await c.look('light')
  await wait(500)

  // Rested on: the card grows out of its pill beside the stack, solid, the blur under the pill alone; the pill lit.
  goal = await goalWin()
  let s = await state(goal.id)
  await page.mouse.move(s.pill.x + s.pill.w / 2, s.pill.y + s.pill.h / 2)
  const seenOpen = []
  for (let n = 0; n < 16; n++) {
    const one = await state(goal.id)
    seenOpen.push(one)
    if (shots && n % 3 === 0) await frame(one, '#ffffff', `desk-pill-open-${String(n * 50).padStart(4, '0')}ms.png`)
    await wait(50)
  }
  const opened = seenOpen.at(-1)
  check('rested on, its card opens out of the pill', opened?.open && opened.card && opened.card.w > 200, JSON.stringify(opened?.card))
  check('while it grows and stands open, no blur under the card: every shape told is the pill\'s', seenOpen.every((one) => one.told.every((shape) => shape[3] <= 30)), JSON.stringify([...new Set(seenOpen.map((one) => JSON.stringify(one.told)))]))
  check('and the card is solid meanwhile (its paper whole: no wash let through)', seenOpen.filter((one) => one.open).every((one) => one.wash === '100%'), JSON.stringify([...new Set(seenOpen.map((one) => one.wash))]))
  const centre = opened?.card ? await over(opened, [[opened.card.x + opened.card.w / 2, opened.card.y + 40]]) : null
  check('the open card\'s ground is opaque', centre?.alpha[0] === 255, JSON.stringify(centre?.alpha))
  // One surface: the pill grew into the card, so it is not left standing beside it, nor its blur.
  check('the pill is hidden while its card is out, and no blur is told for it', !!opened?.pill && opened.pill.hidden && opened.told.length === 0, JSON.stringify({ told: opened?.told, pill: opened?.pill }))
  // A press on the card pins it: it wears its glass again, the pill gone.
  await page.mouse.click(opened.card.x + opened.card.w / 2, opened.card.y + opened.card.h - 12)
  await page.mouse.move(-40, -40)
  check('pinned, the card wears its glass again, the pill gone', await until(async () => { const one = await state(goal.id); return !one?.pill && one?.told.length > 0 && one.told.every((shape) => shape[2] > 200) }, 4000), JSON.stringify((await state(goal.id))?.told))

  // Paper: a paper card's pill is solid, with no blur told.
  await c.v('settings:set', { stickiesFrosted: false, stickiesGlass: false })
  check('made again as paper', await until(async () => { const one = await goalWin(); return !!one && !/glass=1/.test(one.url) }, 10_000))
  await wait(1500)
  goal = await goalWin()
  const paper = pageOf(goal.url)
  await paper.hover('[data-goal-card]').catch(() => {})
  await paper.locator('[aria-label="Fold it into its pill"]').first().dispatchEvent('click')
  check('the paper card folds into its pill', await until(async () => (await state(goal.id))?.pill?.state === 'folded', 4000))
  await wait(900)
  s = await state(goal.id)
  const solid = await over(s, [[s.pill.x + s.pill.w / 2, s.pill.y + 5]])
  check('a paper card\'s pill is solid: no blur told, its ground opaque', !s.told.length && solid?.alpha[0] === 255, JSON.stringify({ told: s.told, alpha: solid?.alpha }))
  await frame(s, '#ffffff', 'desk-pill-paper-over-white.png')
  // Rested on, a paper card grows out of its pill too, the pill hidden, its paper whole everywhere (ask 32's card
  // showed Settings through it).
  await paper.mouse.move(s.pill.x + s.pill.w / 2, s.pill.y + s.pill.h / 2)
  let out = null
  for (let n = 0; n < 30 && !(out?.open && out.card?.w > 200); n++) (out = await state(goal.id)), await wait(100)
  await wait(700)
  out = await state(goal.id)
  const spots = out?.card ? [[0.1, 0.1], [0.5, 0.15], [0.9, 0.5], [0.5, 0.5], [0.15, 0.85], [0.85, 0.9]].map(([fx, fy]) => [out.card.x + out.card.w * fx, out.card.y + out.card.h * fy]) : []
  const ground = out?.card ? await over(out, spots) : null
  check('a paper card grown out of its pill is opaque all over, its pill hidden', !!ground && ground.alpha.every((a) => a === 255) && !!out.pill?.hidden, JSON.stringify({ alpha: ground?.alpha, hidden: out?.pill?.hidden, card: out?.card }))
  if (out) await frame(out, '#ffffff', 'desk-pill-paper-open-over-white.png')
} catch (error) {
  check('ran to the end', false, String(error?.message ?? error).split('\n')[0])
} finally {
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  done()
}

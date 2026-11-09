// Raycast's guides: quick capture and a sticky, dragged near the screen's
// middle, another card's edge or a margin in from the screen's edge, show a
// faint dashed line there with one haptic tick, and the line goes when they
// are let go. Quick capture is drawn onto the line as it is carried (main
// moves it, window:grab); a sticky is moved by the Mac under your hand, so it
// follows the pointer exactly and lands on the line as it is let go.
//
// The pointer and the button are the probe's, never the person's at the Mac;
// windows keep their places as their own while parked (HALIGTREE_QA_VIRTUAL).
// The guide window's own picture is kept in QA_SHOTS (default the temp folder).
//
//   npx electron-vite build --outDir out-snap
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-snap/main/index.js HALIGTREE_QA_AWAY=1 node qa/snap-guides.mjs
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'
const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const shots = process.env.QA_SHOTS ?? tmpdir()

const c = await sandbox()
const { electron, h, v, page } = c
try {
  await electron.evaluate(({ screen }) => {
    globalThis.qaCursor = null
    globalThis.qaButton = false
    const real = screen.getCursorScreenPoint.bind(screen)
    screen.getCursorScreenPoint = () => globalThis.qaCursor ?? real()
    const cp = process.getBuiltinModule('child_process')
    const exec = cp.execFile
    cp.execFile = function (file, args, ...rest) {
      if (file !== 'osascript' || !String(args).includes('pressedMouseButtons')) return exec.call(this, file, args, ...rest)
      const done = rest.find((one) => typeof one === 'function')
      setTimeout(() => done(null, globalThis.qaButton ? '1\n' : '0\n', ''), 60)
      return { kill() {} }
    }
  })
  const stickyWins = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.webContents.getURL().includes('view=sticky')).map((w) => ({ id: w.id, url: w.webContents.getURL() })))
  await v('settings:set', { stickiesGlass: false, motion: true })
  await wait(2000)
  for (let i = 0; i < 20 && (await stickyWins()).length; i++) {
    for (const one of await stickyWins()) {
      const u = new URL(one.url)
      await h.evaluate(([t, id]) => window.api.stick(t, id, false), [u.searchParams.get('type'), u.searchParams.get('id')])
    }
    await wait(600)
  }
  const id = await h.evaluate(() => window.api.captures.create({ title: 'Line me up', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A note to line up' }] }] } }))
  await h.evaluate((id) => window.api.stick('capture', id, true), id)
  let sticky = null
  for (let i = 0; i < 40 && !sticky; i++) {
    sticky = (await stickyWins()).find((one) => one.url.includes(`id=${id}`)) ?? null
    if (!sticky) await wait(250)
  }
  await wait(1500)
  const boxUrl = page.url()
  const boxId = await electron.evaluate(({ BrowserWindow }, url) => {
    const w = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL() === url)
    if (!w.isVisible()) w.showInactive()
    return w.id
  }, boxUrl)
  await wait(400)

  const read = () => electron.evaluate(({ BrowserWindow, screen }, [box, st]) => {
    const b = BrowserWindow.fromId(box).getBounds()
    const s = BrowserWindow.fromId(st).getBounds()
    return {
      box: b, sticky: s,
      card: { x: s.x + 20, y: s.y + 20, width: s.width - 40, height: s.height - 40 },
      work: screen.getDisplayMatching(b).workArea,
      guides: JSON.parse(JSON.stringify(globalThis.haligtreeGuides)),
      taps: globalThis.haligtreeTapKinds().length,
      focused: BrowserWindow.getFocusedWindow()?.id ?? null,
      sheets: globalThis.haligtreeGuideSheets().map((w) => ({ id: w.id, visible: w.isVisible(), focusable: w.isFocusable() }))
    }
  }, [boxId, sticky.id])

  const place = (winId, x, y) => electron.evaluate(({ BrowserWindow }, [id, x, y]) => BrowserWindow.fromId(id).setPosition(x, y), [winId, x, y])
  const s0 = await read()
  const { work } = s0
  const midX = Math.round(work.x + work.width / 2)
  // The sticky well away from every line: lower right, not near any margin or the middle.
  await place(sticky.id, work.x + Math.round(work.width * 0.62), work.y + Math.round(work.height * 0.55))
  // The box up and to the left, clear of every line.
  await place(boxId, work.x + 140, work.y + 120)
  await wait(300)

  // ---- Quick capture, carried by its grabber (main moves it).
  const boxDrag = async (to) => {
    const start = await read()
    await electron.evaluate((_, p) => { globalThis.qaCursor = p }, { x: start.box.x + 50, y: start.box.y - 5 })
    await page.evaluate(() => window.api.grab())
    await wait(40)
    await electron.evaluate((_, p) => { globalThis.qaCursor = p }, { x: to.x + 50, y: to.y - 5 })
    await wait(80)
    return read()
  }
  const boxLetGo = async () => { await page.evaluate(() => window.api.letGo()); await wait(80); return read() }
  const focus0 = (await read()).focused
  const taps0 = (await read()).taps
  const b = s0.box
  const centreLeft = Math.round(midX - b.width / 2)
  let s = await boxDrag({ x: centreLeft + 5, y: work.y + 140 })
  check('box: 5 points from the middle, it is drawn onto it', s.box.x === centreLeft, `${s.box.x - centreLeft}`)
  check('box: a guide down the screen\'s middle shows while carried', s.guides.shown && s.guides.lines.some((l) => l.axis === 'x' && l.at === midX), JSON.stringify(s.guides.lines))
  check('box: one haptic tick coming onto the line', s.taps === taps0 + 1, `${s.taps - taps0}`)
  const sheet = s.sheets.find((one) => one.visible)
  check('box: the guide window is shown, never focusable', !!sheet && s.sheets.every((one) => !one.focusable), JSON.stringify(s.sheets))
  // Its picture, as the guide window draws it.
  const picture = async (name) => {
    const png = await electron.evaluate(async ({ BrowserWindow }) => {
      const w = globalThis.haligtreeGuideSheets().find((one) => one.isVisible())
      if (!w) return null
      await new Promise((r) => setTimeout(r, 200))
      // A sheet just made has no frame to take for a moment (UnknownVizError): asked again a little later.
      const later = async () => { w.webContents.invalidate(); await new Promise((r) => setTimeout(r, 250)); return w.webContents.capturePage() }
      const tries = [() => w.webContents.capturePage(), later, later, later]
      const said = []
      for (const one of tries) {
        try {
          const image = await one()
          if (image.isEmpty()) { said.push('empty'); continue }
          // How many of its pixels hold ink: a guide drawn, not a blank sheet.
          const bits = image.toBitmap()
          let inked = 0
          for (let i = 3; i < bits.length; i += 4) if (bits[i] > 0) inked++
          return JSON.stringify({ png: image.toPNG().toString('base64'), inked })
        } catch (error) { said.push(String(error.message)) }
      }
      return 'ERR ' + said.join(' | ')
    })
    if (!png) return null
    if (png.startsWith('ERR')) return void console.log(`no picture (${name}): ${png}`)
    const { png: data, inked } = JSON.parse(png)
    const file = join(shots, `snap-guides-${name}.png`)
    writeFileSync(file, Buffer.from(data, 'base64'))
    console.log(`picture: ${file}`)
    check(`${name}: the guide window's own picture holds the dashed line`, inked > 0, `${inked} pixels inked`)
    return file
  }
  await picture('box-middle')
  // Held there while the hand goes on a little, then left: it follows exactly again, the line gone.
  await electron.evaluate((_, p) => { globalThis.qaCursor = p }, { x: centreLeft + 12 + 50, y: work.y + 140 - 5 })
  await wait(60)
  s = await read()
  check('box: 12 points on, still held to the line (no stutter)', s.box.x === centreLeft, `${s.box.x - centreLeft}`)
  await electron.evaluate((_, p) => { globalThis.qaCursor = p }, { x: centreLeft + 40 + 50, y: work.y + 140 - 5 })
  await wait(60)
  s = await read()
  check('box: 40 points on, it follows the pointer exactly, no guide', s.box.x === centreLeft + 40 && !s.guides.shown, `${s.box.x - centreLeft} shown ${s.guides.shown}`)
  s = await boxLetGo()

  // Toward a margin in from the left edge.
  const t1 = s.taps
  s = await boxDrag({ x: work.x + 16 + 6, y: work.y + 140 })
  check('box: 6 points from the 16-point margin, it lines up there', s.box.x === work.x + 16, `${s.box.x - work.x}`)
  check('box: the margin guide shows', s.guides.lines.some((l) => l.axis === 'x' && l.at === work.x + 16), JSON.stringify(s.guides.lines))
  check('box: one tick for the margin', s.taps === t1 + 1, `${s.taps - t1}`)
  await picture('box-margin')
  s = await boxLetGo()
  check('box: let go, it stays on the line and the guides go', s.box.x === work.x + 16 && !s.guides.shown && s.sheets.every((one) => !one.visible), `x ${s.box.x - work.x} shown ${s.guides.shown}`)

  // Toward the sticky's left edge, the box below it.
  const card = s.card
  s = await boxDrag({ x: card.x - 4, y: card.y + card.height + 60 })
  check('box: 4 points from a sticky\'s left edge, it lines up with it', s.box.x === card.x, `${s.box.x - card.x}`)
  check('box: the sticky\'s edge guide shows', s.guides.lines.some((l) => l.axis === 'x' && l.at === card.x), JSON.stringify(s.guides.lines))
  await picture('box-sticky-edge')
  s = await boxLetGo()
  check('box: the guides go when let go', !s.guides.shown, JSON.stringify(s.guides))
  // Away from every line, with Motion off: nothing drawn, no tick, it follows exactly.
  await v('settings:set', { motion: false })
  const t2 = s.taps
  s = await boxDrag({ x: work.x + 200, y: work.y + 150 })
  check('box: far from every line, no guide, no tick, exactly where carried', !s.guides.shown && s.taps === t2 && s.box.x === work.x + 200, JSON.stringify({ shown: s.guides.shown, taps: s.taps - t2, x: s.box.x - work.x }))
  s = await boxLetGo()
  await v('settings:set', { motion: true })

  // ---- The sticky, carried by the Mac: will-move, then move + moved each frame.
  const stickyDrag = (to, grip = { x: 80, y: 30 }) => electron.evaluate(async ({ BrowserWindow }, [id, to, grip]) => {
    const w = BrowserWindow.fromId(id)
    const from = w.getBounds()
    globalThis.qaCursor = { x: from.x + grip.x, y: from.y + grip.y }
    globalThis.qaButton = true
    w.emit('will-move', { preventDefault() {} }, { ...from })
    const n = 12
    for (let i = 1; i <= n; i++) {
      await new Promise((r) => setTimeout(r, 16))
      const x = Math.round(from.x + ((to.x - from.x) * i) / n)
      const y = Math.round(from.y + ((to.y - from.y) * i) / n)
      w.setPosition(x, y)
      globalThis.qaCursor = { x: x + grip.x, y: y + grip.y }
      w.emit('move')
      w.emit('moved')
    }
    await new Promise((r) => setTimeout(r, 120))
  }, [sticky.id, to, grip])
  const stickyLetGo = async () => { await electron.evaluate(() => { globalThis.qaButton = false }); await wait(900); return read() }
  s = await read()
  const cw = s.card.width
  // Card 6 points right of the screen's middle line (its middle), carried from 60 points right of it, across no other line.
  const stickyCentre = Math.round(midX - cw / 2)
  await place(sticky.id, stickyCentre + 60 - 20, s.sticky.y)
  await wait(200)
  s = await read()
  const t3 = s.taps
  await stickyDrag({ x: stickyCentre + 6 - 20, y: s.sticky.y })
  s = await read()
  check('sticky: carried near the middle, it follows the pointer exactly', s.card.x === stickyCentre + 6, `${s.card.x - stickyCentre}`)
  check('sticky: the middle guide shows while carried', s.guides.shown && s.guides.lines.some((l) => l.axis === 'x' && l.at === midX), JSON.stringify(s.guides.lines))
  check('sticky: one tick coming onto the line', s.taps === t3 + 1, `${s.taps - t3}`)
  await picture('sticky-middle')
  s = await stickyLetGo()
  check('sticky: let go, it lands on the middle line', s.card.x === stickyCentre, `${s.card.x - stickyCentre}`)
  check('sticky: let go, the guides go', !s.guides.shown && s.sheets.every((one) => !one.visible), JSON.stringify(s.guides))
  // Toward quick capture's right edge, the card above or below it.
  s = await read()
  const boxRight = s.box.x + s.box.width
  const below = s.box.y + s.box.height + 80
  await stickyDrag({ x: boxRight - cw + 5 - 20, y: below - 20 })
  s = await read()
  check('sticky: near quick capture\'s right edge, its guide shows', s.guides.lines.some((l) => l.axis === 'x' && l.at === boxRight), JSON.stringify(s.guides.lines))
  await picture('sticky-box-edge')
  s = await stickyLetGo()
  check('sticky: let go, its right edge lines up with quick capture\'s', s.card.x + s.card.width === boxRight, `${s.card.x + s.card.width - boxRight}`)
  // Toward the bottom margin.
  s = await read()
  const bottomTo = work.y + work.height - 16 - s.card.height
  await stickyDrag({ x: s.sticky.x, y: bottomTo - 5 - 20 })
  s = await read()
  check('sticky: near the bottom margin, a guide across the screen', s.guides.lines.some((l) => l.axis === 'y' && l.at === work.y + work.height - 16), JSON.stringify(s.guides.lines))
  await picture('sticky-bottom-margin')
  s = await stickyLetGo()
  check('sticky: let go, it lines up 16 points above the bottom', s.card.y === bottomTo, `${s.card.y - bottomTo}`)

  const end = await read()
  check('no window took the focus through it all', end.focused === focus0, `${focus0} -> ${end.focused}`)
  check('one guide window for the screen, made once and kept', end.sheets.length === 1 && !end.sheets[0].visible, JSON.stringify(end.sheets))
} catch (error) {
  check('ran to the end', false, error.message.split('\n')[0])
} finally {
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  done()
}

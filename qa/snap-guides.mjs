// Raycast's guides: quick capture, a sticky and a goal's card, from the first
// move of a drag, show every line they can settle on across the screen in thin
// dashes (the screen's middles, the margins in from its edges, the other
// cards' edges), and those lines stay where they are until let go; dragged near
// one, it goes solid with one haptic tick, and quiet again as they leave it. The
// lines go when they are let go. Quick capture and a sticky carried by the hand
// are carried by main (window:grab, then window:carry with each point the
// pointer moves to on the screen) and held firm on a line until the hand takes
// them well past; a sticky moved by the Mac (a window manager, an older page)
// still lands on the line as it is let go. The dashes' two inks are read in a
// light and a dark look, with their contrast on a white, a black and the worst
// desktop; with QA_SHOTS, a carry across the screen is filmed, a frame each
// 50 ms, over a white and a dark desktop, in both looks.
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
      guides: { lit: [], ...JSON.parse(JSON.stringify(globalThis.haligtreeGuides)) },
      taps: globalThis.haligtreeTapKinds().length,
      focused: BrowserWindow.getFocusedWindow()?.id ?? null,
      sheets: globalThis.haligtreeGuideSheets().map((w) => ({ id: w.id, visible: w.isVisible(), focusable: w.isFocusable() }))
    }
  }, [boxId, sticky.id])

  const place = (winId, x, y) => electron.evaluate(({ BrowserWindow }, [id, x, y]) => BrowserWindow.fromId(id).setPosition(x, y), [winId, x, y])
  const s0 = await read()
  const { work } = s0
  const midX = Math.round(work.x + work.width / 2)
  const midY = Math.round(work.y + work.height / 2)
  // The screen's own lines, drawn on every drag: its middles and the margins 16 in from its edges, both ways.
  const screenLines = [['x', midX], ['x', work.x + 16], ['x', work.x + work.width - 16], ['y', midY], ['y', work.y + 16], ['y', work.y + work.height - 16]]
  const hasLine = (lines, axis, at) => lines.some((l) => l.axis === axis && l.at === at)
  const lit = (s, axis, at) => s.guides.shown && hasLine(s.guides.lit, axis, at) && hasLine(s.guides.lines, axis, at)
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  // What the guide window draws: each line's parts shown, their dashes, and the inks as plain red, green and blue.
  const sheetLook = () => electron.evaluate(() => {
    const w = globalThis.haligtreeGuideSheets().find((one) => one.isVisible())
    return w ? w.webContents.executeJavaScript(`(() => {
      const pen = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
      const rgb = (c) => { pen.clearRect(0, 0, 1, 1); pen.fillStyle = '#000'; pen.fillStyle = c; pen.fillRect(0, 0, 1, 1); return [...pen.getImageData(0, 0, 1, 1).data].slice(0, 3) }
      const svg = document.querySelector('svg')
      const inks = Object.fromEntries(['ink', 'halo', 'lit'].map((n) => [n, rgb(svg.style.getPropertyValue('--' + n))]))
      const groups = [...svg.querySelectorAll('g')].map((g) => ({ line: g.dataset.line, on: g.classList.contains('on'), parts: [...g.children].filter((l) => getComputedStyle(l).display !== 'none').map((l) => ({ part: l.getAttribute('class'), dash: getComputedStyle(l).strokeDasharray, width: getComputedStyle(l).strokeWidth })) }))
      return { inks, groups }
    })()`) : null
  })
  const luminance = ([r, g, b]) => [r, g, b].map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
  const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }
  // The sticky well away from every line: lower right, not near any margin or the middle.
  await place(sticky.id, work.x + Math.round(work.width * 0.62), work.y + Math.round(work.height * 0.55))
  // The box up and to the left, clear of every line.
  await place(boxId, work.x + 140, work.y + 120)
  await wait(300)

  // ---- Quick capture, carried by its grabber (main moves it): its page says where the pointer is on the screen.
  const boxPointer = (p) => page.evaluate((p) => window.api.carry(p.x, p.y), p)
  const boxDrag = async (to) => {
    const start = await read()
    await page.evaluate((p) => window.api.grab(p.x, p.y), { x: start.box.x + 50, y: start.box.y - 5 })
    await wait(40)
    await boxPointer({ x: to.x + 50, y: to.y - 5 })
    await wait(80)
    return read()
  }
  const boxLetGo = async () => { await page.evaluate(() => window.api.letGo()); await wait(80); return read() }
  const focus0 = (await read()).focused
  const taps0 = (await read()).taps
  const b = s0.box
  const centreLeft = Math.round(midX - b.width / 2)
  // The first move, 3 points, near no line: every line it can settle on is drawn at once, none lit, no tick.
  let s = await boxDrag({ x: (await read()).box.x + 3, y: (await read()).box.y })
  const firstLines = s.guides.lines
  check('box: from its first move, every line it can settle on is drawn: the screen\'s middles and margins, both ways, and the sticky\'s edges', s.guides.shown && screenLines.every(([axis, at]) => hasLine(firstLines, axis, at)) && hasLine(firstLines, 'x', s.card.x) && hasLine(firstLines, 'x', s.card.x + s.card.width), JSON.stringify(firstLines))
  check('box: on no line yet, none lit and no tick', s.guides.lit.length === 0 && s.taps === taps0, JSON.stringify({ lit: s.guides.lit, taps: s.taps - taps0 }))
  const dashes = await sheetLook()
  const quiet = dashes?.groups.filter((g) => !g.on) ?? []
  check('box: each quiet line is thin even dashes, in two inks taking turns (5 on, 5 off each)', quiet.length === firstLines.length && quiet.every((g) => g.parts.length === 2 && g.parts.every((p) => /^5(px)?,\s*5(px)?$/.test(p.dash) && parseFloat(p.width) === 1)), JSON.stringify(quiet.slice(0, 2)))
  await boxPointer({ x: centreLeft + 5 + 50, y: work.y + 140 - 5 })
  await wait(80)
  s = await read()
  check('box: 5 points from the middle, it is drawn onto it', s.box.x === centreLeft, `${s.box.x - centreLeft}`)
  check('box: the middle line goes solid while carried on it, the others stay quiet', lit(s, 'x', midX) && s.guides.lit.length === 1, JSON.stringify(s.guides.lit))
  check('box: the lines drawn are the very ones drawn at its first move', same(s.guides.lines, firstLines), JSON.stringify(s.guides.lines))
  check('box: one haptic tick coming onto the line', s.taps === taps0 + 1, `${s.taps - taps0}`)
  const solid = await sheetLook()
  const on = solid?.groups.filter((g) => g.on) ?? []
  check('box: the line it is on is one solid line, 2 wide, with a rim either side', on.length === 1 && on[0].line === `x:${midX - work.x}` && on[0].parts.map((p) => `${p.part}:${p.dash}:${parseFloat(p.width)}`).join() === 'rim:none:4,lit:none:2', JSON.stringify(on))
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
    check(`${name}: the guide window's own picture holds the line`, inked > 0, `${inked} pixels inked`)
    return file
  }
  await picture('box-middle')
  // Held there while the hand goes on a little, then left: it follows exactly again, the line gone.
  await boxPointer({ x: centreLeft + 12 + 50, y: work.y + 140 - 5 })
  await wait(60)
  s = await read()
  check('box: 12 points on, still held to the line (no stutter)', s.box.x === centreLeft, `${s.box.x - centreLeft}`)
  await boxPointer({ x: centreLeft + 40 + 50, y: work.y + 140 - 5 })
  await wait(60)
  s = await read()
  check('box: 40 points on, it follows the pointer exactly, the line quiet again', s.box.x === centreLeft + 40 && s.guides.lit.length === 0, `${s.box.x - centreLeft} lit ${JSON.stringify(s.guides.lit)}`)
  check('box: the last move draws the same lines as the first, where they were', same(s.guides.lines, firstLines), JSON.stringify(s.guides.lines))
  s = await boxLetGo()
  check('box: let go, the guides go', !s.guides.shown && s.sheets.every((one) => !one.visible), JSON.stringify(s.guides))

  // Toward a margin in from the left edge.
  const t1 = s.taps
  s = await boxDrag({ x: work.x + 16 + 6, y: work.y + 140 })
  check('box: 6 points from the 16-point margin, it lines up there', s.box.x === work.x + 16, `${s.box.x - work.x}`)
  check('box: the margin line goes solid', lit(s, 'x', work.x + 16), JSON.stringify(s.guides.lit))
  check('box: one tick for the margin', s.taps === t1 + 1, `${s.taps - t1}`)
  await picture('box-margin')
  s = await boxLetGo()
  check('box: let go, it stays on the line and the guides go', s.box.x === work.x + 16 && !s.guides.shown && s.sheets.every((one) => !one.visible), `x ${s.box.x - work.x} shown ${s.guides.shown}`)

  // Toward the sticky's left edge, the box below it.
  const card = s.card
  s = await boxDrag({ x: card.x - 4, y: card.y + card.height + 60 })
  check('box: 4 points from a sticky\'s left edge, it lines up with it', s.box.x === card.x, `${s.box.x - card.x}`)
  check('box: the sticky\'s edge line goes solid', lit(s, 'x', card.x), JSON.stringify(s.guides.lit))
  await picture('box-sticky-edge')
  s = await boxLetGo()
  check('box: the guides go when let go', !s.guides.shown, JSON.stringify(s.guides))
  // Away from every line, with Motion off: nothing drawn, no tick, it follows exactly.
  await v('settings:set', { motion: false })
  const t2 = s.taps
  s = await boxDrag({ x: work.x + 200, y: work.y + 150 })
  check('box: far from every line, the lines drawn and none lit, no tick, exactly where carried', s.guides.shown && s.guides.lit.length === 0 && s.taps === t2 && s.box.x === work.x + 200, JSON.stringify({ lit: s.guides.lit, taps: s.taps - t2, x: s.box.x - work.x }))
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
  await stickyDrag({ x: stickyCentre + 3 - 20, y: s.sticky.y })
  s = await read()
  check('sticky: carried 3 points from the middle, it follows the pointer exactly', s.card.x === stickyCentre + 3, `${s.card.x - stickyCentre}`)
  check('sticky: the middle line goes solid while carried', lit(s, 'x', midX), JSON.stringify(s.guides.lit))
  check('sticky: the screen\'s middles and margins and quick capture\'s edges drawn too, quiet', screenLines.every(([axis, at]) => hasLine(s.guides.lines, axis, at)) && hasLine(s.guides.lines, 'x', s.box.x) && s.guides.lit.length === 1, JSON.stringify(s.guides))
  check('sticky: one tick coming onto the line', s.taps === t3 + 1, `${s.taps - t3}`)
  await picture('sticky-middle')
  s = await stickyLetGo()
  check('sticky: let go, it lands on the middle line', s.card.x === stickyCentre, `${s.card.x - stickyCentre}`)
  check('sticky: let go, the guides go', !s.guides.shown && s.sheets.every((one) => !one.visible), JSON.stringify(s.guides))
  // Toward quick capture's right edge, the card above or below it.
  s = await read()
  const boxRight = s.box.x + s.box.width
  const below = s.box.y + s.box.height + 80
  await stickyDrag({ x: boxRight - cw + 3 - 20, y: below - 20 })
  s = await read()
  check('sticky: near quick capture\'s right edge, its line goes solid', lit(s, 'x', boxRight), JSON.stringify(s.guides.lit))
  await picture('sticky-box-edge')
  s = await stickyLetGo()
  check('sticky: let go, its right edge lines up with quick capture\'s', s.card.x + s.card.width === boxRight, `${s.card.x + s.card.width - boxRight}`)
  // Toward the bottom margin.
  s = await read()
  const bottomTo = work.y + work.height - 16 - s.card.height
  await stickyDrag({ x: s.sticky.x, y: bottomTo - 3 - 20 })
  s = await read()
  check('sticky: near the bottom margin, the line across the screen goes solid', lit(s, 'y', work.y + work.height - 16), JSON.stringify(s.guides.lit))
  await picture('sticky-bottom-margin')
  s = await stickyLetGo()
  check('sticky: let go, it lines up 16 points above the bottom', s.card.y === bottomTo, `${s.card.y - bottomTo}`)

  // ---- The sticky carried by Haligtree's hand (a press on the card, its page's window:grab): held firm on a guide,
  // as Raycast's window is, until the hand takes it well past; then it follows again (10 Nov: "unlike Raycast's
  // rigid rulers").
  const hand = (code) => electron.evaluate(({ BrowserWindow }, [id, code]) => BrowserWindow.fromId(id).webContents.executeJavaScript(code), [sticky.id, code])
  s = await read()
  await place(sticky.id, stickyCentre + 60 - 20, s.sticky.y)
  await wait(200)
  s = await read()
  const grip = { x: s.sticky.x + 80, y: s.sticky.y + 30 }
  const pointer = (dx) => hand(`window.api.carry(${grip.x + dx}, ${grip.y})`)
  await hand(`window.api.grab(${grip.x}, ${grip.y})`)
  await wait(40)
  const handTaps = (await read()).taps
  await pointer(-57); await wait(80)
  s = await read()
  check('hand: 3 points from the middle, it is drawn onto it', s.card.x === stickyCentre, `${s.card.x - stickyCentre}`)
  check('hand: one tick coming onto the line', s.taps === handTaps + 1, `${s.taps - handTaps}`)
  await pointer(-50); await wait(80)
  s = await read()
  check('hand: 10 points on past it, it stays on the line, rigid', s.card.x === stickyCentre, `${s.card.x - stickyCentre}`)
  await pointer(-70); await wait(80)
  s = await read()
  check('hand: 10 points the other way, still on the line', s.card.x === stickyCentre, `${s.card.x - stickyCentre}`)
  await pointer(-110); await wait(80)
  s = await read()
  check('hand: taken well past, it follows the pointer again', s.card.x === stickyCentre - 50, `${s.card.x - stickyCentre}`)
  await hand('window.api.letGo()'); await wait(900)
  s = await read()
  check('hand: let go, the guides go', !s.guides.shown, JSON.stringify(s.guides))

  // ---- A goal's card, carried by the Mac in 20 small steps toward the screen's middle and past it: the guide is a
  // fixed line at the middle, shown only while the card's middle is within a few points of it, never moving.
  // An open goal's own card, stuck by hand (the sandbox puts one up as it starts, but the desk was cleared above).
  const openGoal = ((await v('items', 'goal')) ?? []).find((one) => one?.goalAt && !one.closedAt && !one.archivedAt && !one.closedHow)
  if (openGoal) await h.evaluate((id) => window.api.stick('goal', id, true), openGoal.id)
  let goalWin = null
  for (let i = 0; i < 60 && !goalWin; i++) (goalWin = (await stickyWins()).find((one) => one.url.includes('type=goal&')) ?? null), goalWin || (await wait(250))
  check('the sandbox has a goal card up', !!goalWin)
  if (goalWin) {
    const gb = () => electron.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).getBounds(), goalWin.id)
    let g = await gb()
    const gw = g.width - 40
    const gMid = Math.round(midX - gw / 2)
    // Start 12 points left of the middle, well below the other cards, and carry it right a point a step.
    await place(goalWin.id, gMid - 12 - 20, work.y + Math.round(work.height * 0.45))
    await wait(300)
    g = await gb()
    const frames = await electron.evaluate(async ({ BrowserWindow }, id) => {
      const w = BrowserWindow.fromId(id)
      const from = w.getBounds()
      globalThis.qaCursor = { x: from.x + 80, y: from.y + 30 }
      globalThis.qaButton = true
      const taps0 = globalThis.haligtreeTapKinds().length
      w.emit('will-move', { preventDefault() {} }, { ...from })
      const out = []
      for (let i = 1; i <= 20; i++) {
        w.setPosition(from.x + i * 1.2 | 0, from.y)
        globalThis.qaCursor = { x: from.x + (i * 1.2 | 0) + 80, y: from.y + 30 }
        w.emit('move')
        w.emit('moved')
        await new Promise((r) => setTimeout(r, 70))
        out.push({ x: w.getBounds().x, lines: JSON.parse(JSON.stringify(globalThis.haligtreeGuides.lines)), lit: JSON.parse(JSON.stringify(globalThis.haligtreeGuides.lit ?? globalThis.haligtreeGuides.lines)), taps: globalThis.haligtreeTapKinds().length - taps0 })
      }
      return out
    }, goalWin.id)
    for (const f of frames) console.log(`  goal step: card middle ${f.x + 20 + gw / 2 - midX >= 0 ? '+' : ''}${f.x + 20 + gw / 2 - midX} from the middle, ${f.lines.length} lines, lit ${JSON.stringify(f.lit)}, ticks ${f.taps}`)
    const shownAt = frames.filter((f) => f.lit.length)
    check('goal: from its first step every line is drawn, and the same lines at every step to the last', frames.every((f) => f.lines.length >= 6 && same(f.lines, frames[0].lines)), JSON.stringify(frames.map((f) => f.lines.length)))
    check('goal: across 20 steps, the middle line goes solid (the card came within reach of it)', shownAt.length > 0, `${shownAt.length} of 20 steps`)
    check('goal: the line lit is the screen\'s middle and nothing else, the same line every step', shownAt.every((f) => f.lit.length === 1 && f.lit[0].axis === 'x' && f.lit[0].at === midX), JSON.stringify(shownAt.map((f) => f.lit)))
    check('goal: it is lit only while the card\'s middle is within 6 points of it', frames.every((f) => !f.lit.length || Math.abs(f.x + 20 + gw / 2 - midX) <= 6), '')
    check('goal: it is lit from one step to the next with no gap, then goes quiet', shownAt.length === frames.findLastIndex((f) => f.lit.length) - frames.findIndex((f) => f.lit.length) + 1, '')
    const firstOn = frames.findIndex((f) => f.lit.length)
    check('goal: one tick, on the very step the line goes solid', frames.at(-1).taps === 1 && frames[firstOn]?.taps === 1 && (firstOn === 0 || frames[firstOn - 1].taps === 0), JSON.stringify(frames.map((f) => f.taps)))
    // Held within reach at three places, one picture each: the same still line in all three.
    for (const [n, off] of [[1, -3], [2, -1], [3, 2]]) {
      await electron.evaluate(({ BrowserWindow }, [id, x]) => { const w = BrowserWindow.fromId(id); w.setPosition(x, w.getBounds().y); w.emit('move'); w.emit('moved') }, [goalWin.id, gMid + off - 20])
      await wait(120)
      const now = await read()
      check(`goal held ${off} from the middle: the one line lit is the middle`, JSON.stringify(now.guides.lit) === JSON.stringify([{ axis: 'x', at: midX }]), JSON.stringify(now.guides.lit))
      await picture(`goal-step-${n}`)
    }
    s = await stickyLetGo()
    g = await gb()
    check('goal: let go 2 points past the line it showed, it lands on it', g.x === gMid - 20, `${g.x - (gMid - 20)}`)

    // Carried down past Today's card at the right edge, a point a step: every guide is at an edge of something on
    // the screen and none jumps to a new place without going away first.
    s = await read()
    const fixed = new Set([midX, work.x + 16, work.x + work.width - 16, Math.round(work.y + work.height / 2), work.y + 16, work.y + work.height - 16])
    const others = await electron.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows().filter((w) => w.id !== id && w.isVisible() && /view=sticky|index\.html/.test(w.webContents.getURL())).map((w) => {
      const b = w.getBounds()
      const paper = w.webContents.getURL().includes('view=sticky') && !w.webContents.getURL().includes('glass=1')
      return paper ? { x: b.x + 20, y: b.y + 20, width: b.width - 40, height: b.height - 40 } : b
    }), goalWin.id)
    for (const o of others) for (const n of [o.x, o.x + o.width, o.y, o.y + o.height]) fixed.add(n)
    const today = (await stickyWins()).find((one) => one.url.includes('type=today'))
    const tb = today && (await electron.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).getBounds(), today.id))
    if (tb) {
      await place(goalWin.id, tb.x - 30, tb.y - 40)
      await wait(300)
      const sweep = await electron.evaluate(async ({ BrowserWindow }, id) => {
        const w = BrowserWindow.fromId(id)
        const from = w.getBounds()
        globalThis.qaButton = true
        w.emit('will-move', { preventDefault() {} }, { ...from })
        const out = []
        for (let i = 1; i <= 60; i++) {
          w.setPosition(from.x + i, from.y + i)
          globalThis.qaCursor = { x: from.x + i + 80, y: from.y + i + 30 }
          w.emit('move')
          w.emit('moved')
          await new Promise((r) => setTimeout(r, 45))
          out.push({ lines: JSON.parse(JSON.stringify(globalThis.haligtreeGuides.lines)), lit: JSON.parse(JSON.stringify(globalThis.haligtreeGuides.lit ?? globalThis.haligtreeGuides.lines)) })
        }
        return out
      }, goalWin.id)
      const bad = sweep.flatMap((f) => f.lines).filter((l) => !fixed.has(l.at))
      check('goal past Today: every guide sits at a fixed place on the screen (an edge, the middle, a margin)', bad.length === 0, JSON.stringify(bad))
      check('goal past Today: the same lines from the first step to the last, none coming or going', sweep.every((f) => f.lines.length > 0 && same(f.lines, sweep[0].lines)), JSON.stringify(sweep.map((f) => f.lines.length)))
      check('goal past Today: each line lit is one of those drawn', sweep.every((f) => f.lit.every((l) => hasLine(f.lines, l.axis, l.at))), '')
      let jumps = 0
      for (let i = 1; i < sweep.length; i++) for (const axis of ['x', 'y']) {
        const a = sweep[i - 1].lit.find((l) => l.axis === axis), b = sweep[i].lit.find((l) => l.axis === axis)
        if (a && b && a.at !== b.at) jumps++
      }
      check('goal past Today: no lit line jumps to a new place while it shows', jumps === 0, `${jumps} jumps; ${JSON.stringify(sweep.map((f) => f.lit).filter((l) => l.length))}`)
      s = await stickyLetGo()
    }
  }

  // ---- Each look's inks, read from a drag in it: the dashes' two inks stand out on a white desktop, on a black one, and
  // on the worst there is (the grey where the two stand out least: the square root of their contrast with each other).
  for (const name of ['light', 'dark']) {
    await c.look(name)
    await wait(500)
    s = await read()
    await boxDrag({ x: s.box.x + 3, y: s.box.y })
    await boxPointer({ x: s.box.x + 6 + 50, y: s.box.y - 5 })
    await wait(150)
    const inks = (await sheetLook())?.inks
    if (!inks) { check(`${name} look: the guides' inks`, false); continue }
    const white = [255, 255, 255], black = [0, 0, 0]
    const onWhite = Math.max(contrast(inks.ink, white), contrast(inks.halo, white))
    const onBlack = Math.max(contrast(inks.ink, black), contrast(inks.halo, black))
    const worst = Math.sqrt(contrast(inks.ink, inks.halo))
    const said = `ink rgb(${inks.ink}) and rgb(${inks.halo}): ${onWhite.toFixed(2)}:1 on a white desktop, ${onBlack.toFixed(2)}:1 on a black one, ${worst.toFixed(2)}:1 on the worst grey; the lit line rgb(${inks.lit}) ${contrast(inks.lit, white).toFixed(2)}:1 on white, ${contrast(inks.lit, black).toFixed(2)}:1 on black`
    console.log(`  ${name} look: ${said}`)
    check(`${name} look: the quiet dashes stand out at 3:1 or more on any desktop, white, black or the worst grey`, onWhite >= 3 && onBlack >= 3 && worst >= 3, said)
    await picture(`look-${name}`)
    await boxLetGo()
  }
  await c.look('light')

  // ---- Filmed, with QA_SHOTS: the sticky carried by the hand across the screen, a frame each 50 ms, the guides and the
  // card laid over a white desktop and a dark one, in each look; and the crossing of the middles at full size.
  if (process.env.QA_SHOTS) for (const name of ['light', 'dark']) {
    await c.look(name)
    await wait(600)
    s = await read()
    await place(sticky.id, work.x + 160, work.y + 180)
    await wait(300)
    s = await read()
    const g0 = { x: s.sticky.x + 80, y: s.sticky.y + 30 }
    await hand(`window.api.grab(${g0.x}, ${g0.y})`)
    await wait(40)
    const film = []
    for (let n = 1; n <= 24; n++) {
      const t = Date.now()
      await hand(`window.api.carry(${g0.x + n * 55}, ${g0.y + n * 12})`)
      await wait(16)
      film.push(await electron.evaluate(async ({ BrowserWindow }, id) => {
        const sheet = globalThis.haligtreeGuideSheets().find((one) => one.isVisible())
        const card = BrowserWindow.fromId(id)
        const [a, b] = await Promise.all([sheet ? sheet.webContents.capturePage() : null, card.webContents.capturePage()])
        return { sheet: a && !a.isEmpty() ? a.toDataURL() : null, sheetAt: sheet?.getBounds() ?? null, card: b.toDataURL(), at: card.getBounds(), lines: JSON.stringify(globalThis.haligtreeGuides.lines), lit: globalThis.haligtreeGuides.lit }
      }, sticky.id))
      await wait(Math.max(0, 50 - (Date.now() - t)))
    }
    await hand('window.api.letGo()')
    await wait(900)
    check(`${name} look, filmed: every one of 24 frames draws the same lines, from the first`, film.every((f) => f.sheet && f.lines === film[0].lines), film.map((f) => !!f.sheet).join())
    console.log(`  ${name} look, filmed: lit by frame ${film.map((f) => (f.lit ?? []).map((l) => l.axis + l.at).join('+') || '-').join(' ')}`)
    for (const [ground, colour] of [['white', '#ffffff'], ['dark', '#1c1c1e']]) {
      const [sheetPng, crossPng] = await c.h.evaluate(async ([film, colour, work, midX, midY]) => {
        // Through an image, not fetch: the page's own rules let no fetch read a data address.
        const load = (url) => (url ? new Promise((done) => { const one = new Image(); one.onload = () => done(one); one.onerror = () => done(null); one.src = url }) : null)
        const out = async (canvas) => { const blob = await canvas.convertToBlob({ type: 'image/png' }); return new Promise((done) => { const r = new FileReader(); r.onload = () => done(String(r.result).split(',')[1]); r.readAsDataURL(blob) }) }
        const scale = 1 / 3, cols = 4
        const fw = Math.round(work.width * scale), fh = Math.round(work.height * scale)
        const sheet = new OffscreenCanvas(fw * cols, fh * Math.ceil(film.length / cols))
        const pen = sheet.getContext('2d')
        const cross = new OffscreenCanvas(480, 270)
        const near = cross.getContext('2d')
        for (const [n, f] of film.entries()) {
          const x0 = (n % cols) * fw, y0 = Math.floor(n / cols) * fh
          pen.fillStyle = colour
          pen.fillRect(x0, y0, fw, fh)
          const card = await load(f.card)
          const lines = await load(f.sheet)
          if (card) pen.drawImage(card, x0 + (f.at.x - work.x) * scale, y0 + (f.at.y - work.y) * scale, f.at.width * scale, f.at.height * scale)
          if (lines && f.sheetAt) pen.drawImage(lines, x0 + (f.sheetAt.x - work.x) * scale, y0 + (f.sheetAt.y - work.y) * scale, f.sheetAt.width * scale, f.sheetAt.height * scale)
          pen.fillStyle = '#888'
          pen.fillText(`${n * 50} ms`, x0 + 6, y0 + 14)
          if (n === 12) {
            // The middles' crossing at full size: what an eye sees of the dashes and the card beside them.
            near.fillStyle = colour
            near.fillRect(0, 0, 480, 270)
            const ox = midX - 240, oy = midY - 135
            if (card) near.drawImage(card, f.at.x - ox, f.at.y - oy, f.at.width, f.at.height)
            if (lines && f.sheetAt) near.drawImage(lines, f.sheetAt.x - ox, f.sheetAt.y - oy, f.sheetAt.width, f.sheetAt.height)
          }
        }
        return [await out(sheet), await out(cross)]
      }, [film, colour, work, midX, midY])
      for (const [file, png] of [[`snap-guides-film-${name}-over-${ground}.png`, sheetPng], [`snap-guides-cross-${name}-over-${ground}.png`, crossPng]]) {
        writeFileSync(join(shots, file), Buffer.from(png, 'base64'))
        console.log(`picture: ${join(shots, file)}`)
      }
    }
  }
  await c.look('light')

  const end = await read()
  check('no window took the focus through it all', end.focused === focus0, `${focus0} -> ${end.focused}`)
  const screens = await electron.evaluate(({ screen }) => screen.getAllDisplays().length)
  check('one guide window for each screen, made once and kept, put away', end.sheets.length === screens && end.sheets.every((one) => !one.visible), `${screens} screens: ${JSON.stringify(end.sheets)}`)
} catch (error) {
  check('ran to the end', false, error.message.split('\n')[0])
} finally {
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  done()
}

// Raycast's guides, the one look for every carried window. Quick capture's box: from the first move of a drag, three
// thin grey dashed lines run across the screen along its home (where it opens: the top middle, or the middle if
// Settings opens it there), down its left and right edges and across its top; they never move, change colour or turn
// solid while it is carried, it settles at home carried near (one haptic tick), and they go when it is let go. A
// sticky and a goal's card have no home: their lines run along the other cards on the screen (each one's left, right
// and top), in the same ink and dash, fixed from the first move to the last, never at the screen's middle or margins.
// The drawn SVG's every stroke is read at every frame: grey, 1 wide, dashed 5 and 5, never solid or blue. The two
// greys' contrast is read on a white, a black and the worst desktop, in a light and a dark look. With QA_SHOTS, a carry
// of the box and of a sticky is filmed, a frame each 50 ms, over a white and a dark desktop, in both looks.
//
// The pointer and the button are the probe's, never the person's at the Mac; windows keep their places as their own
// while parked (HALIGTREE_QA_VIRTUAL).
//
//   npx electron-vite build --outDir out-snap
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-snap/main/index.js HALIGTREE_QA_AWAY=1 node qa/snap-guides.mjs
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'
const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const shots = process.env.QA_SHOTS

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
  for (let i = 0; i < 40 && !sticky; i++) (sticky = (await stickyWins()).find((one) => one.url.includes(`id=${id}`)) ?? null), sticky || (await wait(250))
  await wait(1500)
  const boxId = await electron.evaluate(({ BrowserWindow }, url) => {
    const w = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL() === url)
    if (!w.isVisible()) w.showInactive()
    return w.id
  }, page.url())
  await wait(400)

  const read = () => electron.evaluate(({ BrowserWindow, screen }, [box, st]) => {
    const b = BrowserWindow.fromId(box).getBounds()
    const s = BrowserWindow.fromId(st).getBounds()
    const g = JSON.parse(JSON.stringify(globalThis.haligtreeGuides))
    return {
      box: b, sticky: s, card: { x: s.x + 20, y: s.y + 20, width: s.width - 40, height: s.height - 40 },
      work: screen.getDisplayMatching(b).workArea,
      guides: { shown: g.shown, lines: g.lines, on: g.on ?? g.lit ?? [] },
      taps: globalThis.haligtreeTapKinds().length,
      focused: BrowserWindow.getFocusedWindow()?.id ?? null,
      sheets: globalThis.haligtreeGuideSheets().map((w) => ({ id: w.id, visible: w.isVisible(), focusable: w.isFocusable() }))
    }
  }, [boxId, sticky.id])
  const place = (winId, x, y) => electron.evaluate(({ BrowserWindow }, [id, x, y]) => BrowserWindow.fromId(id).setPosition(x, y), [winId, x, y])
  const key = (lines) => JSON.stringify([...lines].map((l) => `${l.axis}:${l.at}`).sort())
  // What the guide window draws, every stroke shown: its colour as plain red, green and blue, its dash and its width.
  const look = () => electron.evaluate(() => {
    const w = globalThis.haligtreeGuideSheets().find((one) => one.isVisible())
    return w ? w.webContents.executeJavaScript(`(() => {
      const pen = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
      const rgb = (c) => { pen.clearRect(0, 0, 1, 1); pen.fillStyle = '#000'; pen.fillStyle = c; pen.fillRect(0, 0, 1, 1); return [...pen.getImageData(0, 0, 1, 1).data].slice(0, 3) }
      return [...document.querySelectorAll('svg line')].filter((l) => getComputedStyle(l).display !== 'none' && getComputedStyle(l).opacity !== '0').map((l) => {
        const s = getComputedStyle(l)
        return { stroke: rgb(s.stroke), dash: s.strokeDasharray, width: parseFloat(s.strokeWidth), at: l.getAttribute('x1') === l.getAttribute('x2') ? 'x:' + l.getAttribute('x1') : 'y:' + l.getAttribute('y1') }
      })
    })()`) : null
  })
  // Each stroke grey (its red, green and blue within 6 of each other), 1 wide, dashed 5 on and 5 off: never solid, never blue.
  const raycast = (strokes) => !!strokes?.length && strokes.every((s) => Math.max(...s.stroke) - Math.min(...s.stroke) <= 6 && s.width === 1 && /^5(px)?,\s*5(px)?$/.test(s.dash))
  const luminance = ([r, g, b]) => [r, g, b].map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
  const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }

  const s0 = await read()
  const { work } = s0
  // The box's home, as Settings opens it by default: the top middle of its screen, placed by its full height (600).
  const homeOf = (box) => ({ x: Math.round(work.x + (work.width - box.width) / 2), y: Math.round(work.y + Math.max(0, work.height - 600) / 4) })
  await place(sticky.id, work.x + Math.round(work.width * 0.62), work.y + Math.round(work.height * 0.55))
  await place(boxId, work.x + 140, work.y + 120)
  await wait(300)

  // A carry, a step each 50 ms: at every step the lines held, the strokes drawn, and with QA_SHOTS the frames.
  const film = []
  const frame = async (win) => {
    const now = await read()
    const strokes = await look()
    const pics = shots ? await electron.evaluate(async ({ BrowserWindow }, id) => {
      const sheet = globalThis.haligtreeGuideSheets().find((one) => one.isVisible())
      const card = BrowserWindow.fromId(id)
      const [a, b] = await Promise.all([sheet ? sheet.webContents.capturePage() : null, card.webContents.capturePage()])
      return { sheet: a && !a.isEmpty() ? a.toDataURL() : null, sheetAt: sheet?.getBounds() ?? null, card: b.toDataURL(), at: card.getBounds() }
    }, win) : null
    return { now, strokes, pics }
  }

  // ---- Quick capture, carried by its grabber (main moves it): its page says where the pointer is on the screen.
  const boxCarry = async (steps, name) => {
    const start = await read()
    const grip = { x: start.box.x + 50, y: start.box.y - 5 }
    await page.evaluate((p) => window.api.grab(p.x, p.y), grip)
    const frames = []
    for (const [dx, dy] of steps) {
      const t = Date.now()
      await page.evaluate((p) => window.api.carry(p.x, p.y), { x: grip.x + dx, y: grip.y + dy })
      await wait(16)
      frames.push(await frame(boxId))
      await wait(Math.max(0, 50 - (Date.now() - t)))
    }
    await page.evaluate(() => window.api.letGo())
    await wait(120)
    if (name) film.push({ name, frames })
    return { frames, after: await read() }
  }
  const b0 = (await read()).box
  const home = homeOf(b0)
  const want = [{ axis: 'x', at: home.x }, { axis: 'x', at: home.x + b0.width }, { axis: 'y', at: home.y }]
  // 3 points off its place, then toward a point 60 left of its home and 70 below it in 19 steps (near no line), then
  // the last step to 5 points left of home and 4 above it.
  const way = { x: home.x - 60 - b0.x, y: home.y + 70 - b0.y }
  const toHome = [[3, 0], ...Array.from({ length: 19 }, (_, n) => [Math.round((way.x * (n + 1)) / 19), Math.round((way.y * (n + 1)) / 19)]), [home.x - 5 - b0.x, home.y - 4 - b0.y]]
  const taps0 = (await read()).taps
  const { frames: bf, after: ba } = await boxCarry(toHome, 'box')
  const first = bf[0].now
  check('box: from its first move, three lines along its home, its left, its right and its top, and no others', first.guides.shown && key(first.guides.lines) === key(want), `${JSON.stringify(first.guides.lines)} want ${JSON.stringify(want)}`)
  check('box: the same three lines, where they were, at every one of its frames to the last', bf.every((f) => f.now.guides.shown && key(f.now.guides.lines) === key(first.guides.lines)), JSON.stringify(bf.map((f) => f.now.guides.lines.length)))
  check('box: every stroke drawn at every frame is grey, 1 wide and dashed (never solid, never blue)', bf.every((f) => raycast(f.strokes)), JSON.stringify(bf.map((f) => f.strokes).find((one) => !raycast(one))?.slice(0, 4)))
  check('box: the drawn strokes the same at the first frame and the last', JSON.stringify(bf[0].strokes) === JSON.stringify(bf.at(-1).strokes), '')
  check('box: carried within a few points of its home, it is drawn onto it, with one tick on that step and none before', bf.at(-1).now.box.x === home.x && bf.at(-1).now.box.y === home.y && bf.at(-1).now.taps === taps0 + 1 && bf.at(-2).now.taps === taps0, JSON.stringify({ at: bf.at(-1).now.box, home, taps: bf.map((f) => f.now.taps - taps0) }))
  check('box: let go there, it stays at home and the guides go', ba.box.x === home.x && ba.box.y === home.y && !ba.guides.shown && ba.sheets.every((one) => !one.visible), JSON.stringify({ at: ba.box, shown: ba.guides.shown }))
  // Away from home it follows the pointer exactly, the lines where they were.
  const { frames: bf2 } = await boxCarry([[3, 0], [-200, 140]])
  check('box: carried well away, it follows the pointer exactly, the lines unmoved', bf2[1].now.box.x === home.x - 200 && bf2[1].now.box.y === home.y + 140 && key(bf2[1].now.guides.lines) === key(want), JSON.stringify(bf2[1].now.box))
  check('box: the guide window is never focusable', bf2[1].now.sheets.every((one) => !one.focusable), JSON.stringify(bf2[1].now.sheets))
  // Double-clicked, back home: where its guides show it.
  await page.evaluate(() => window.api.boxHome())
  await wait(150)
  const dbl = await read()
  check('box: double-clicked, it goes back to the home its guides mark', dbl.box.x === home.x && dbl.box.y === home.y, JSON.stringify({ at: dbl.box, home }))
  await place(boxId, work.x + 140, work.y + 120)
  await wait(200)

  // ---- The sticky: no home; its lines run along the cards beside it (quick capture here), left, right and top.
  const hand = (code) => electron.evaluate(({ BrowserWindow }, [id, code]) => BrowserWindow.fromId(id).webContents.executeJavaScript(code), [sticky.id, code])
  let s = await read()
  const box = s.box
  const neighbour = [{ axis: 'x', at: box.x }, { axis: 'x', at: box.x + box.width }, { axis: 'y', at: box.y }]
  const g0 = { x: s.sticky.x + 80, y: s.sticky.y + 30 }
  // Carried by the hand from where it is to 3 points right of the box's left edge, 20 steps, then let go.
  const cw = s.card.width
  const to = { x: box.x + 3 - s.card.x, y: box.y + box.height + 40 - s.card.y }
  await hand(`window.api.grab(${g0.x}, ${g0.y})`)
  const sf = []
  const tapsS = s.taps
  for (let n = 0; n <= 20; n++) {
    const t = Date.now()
    const k = n === 0 ? 0 : n / 20
    await hand(`window.api.carry(${g0.x + (n === 0 ? 3 : Math.round(to.x * k))}, ${g0.y + Math.round(to.y * k)})`)
    await wait(16)
    sf.push(await frame(sticky.id))
    await wait(Math.max(0, 50 - (Date.now() - t)))
  }
  film.push({ name: 'sticky', frames: sf })
  const sFirst = sf[0].now
  check('sticky: from its first move, the lines of the card beside it (its left, right and top), none at the screen\'s middle or margins', sFirst.guides.shown && key(sFirst.guides.lines) === key(neighbour), `${JSON.stringify(sFirst.guides.lines)} want ${JSON.stringify(neighbour)}`)
  check('sticky: the same lines, where they were, at every frame to the last', sf.every((f) => key(f.now.guides.lines) === key(sFirst.guides.lines)), JSON.stringify(sf.map((f) => f.now.guides.lines.length)))
  check('sticky: every stroke at every frame grey, 1 wide and dashed (never solid, never blue)', sf.every((f) => raycast(f.strokes)), JSON.stringify(sf.map((f) => f.strokes).find((one) => !raycast(one))?.slice(0, 4)))
  check('sticky: carried near the box\'s left edge, it is drawn onto it with a tick on that very step', sf.at(-1).now.card.x === box.x && sf.at(-1).now.taps === sf.at(-2).now.taps + 1, JSON.stringify({ x: sf.at(-1).now.card.x - box.x, taps: sf.map((f) => f.now.taps - tapsS) }))
  await hand('window.api.letGo()')
  await wait(900)
  s = await read()
  check('sticky: let go, it stays lined up and the guides go', s.card.x === box.x && !s.guides.shown, JSON.stringify({ x: s.card.x - box.x, shown: s.guides.shown }))
  // Carried by the Mac (will-move, then a move each frame) to 3 points off the box's right edge: lands on it when let go.
  const stickyDrag = (to) => electron.evaluate(async ({ BrowserWindow }, [id, to]) => {
    const w = BrowserWindow.fromId(id)
    const from = w.getBounds()
    globalThis.qaCursor = { x: from.x + 80, y: from.y + 30 }
    globalThis.qaButton = true
    w.emit('will-move', { preventDefault() {} }, { ...from })
    const out = []
    for (let i = 1; i <= 12; i++) {
      await new Promise((r) => setTimeout(r, 16))
      const x = Math.round(from.x + ((to.x - from.x) * i) / 12), y = Math.round(from.y + ((to.y - from.y) * i) / 12)
      w.setPosition(x, y)
      globalThis.qaCursor = { x: x + 80, y: y + 30 }
      w.emit('move')
      w.emit('moved')
      out.push(JSON.stringify(globalThis.haligtreeGuides.lines))
    }
    await new Promise((r) => setTimeout(r, 120))
    return out
  }, [sticky.id, to])
  const steps = await stickyDrag({ x: box.x + box.width - cw + 3 - 20, y: s.sticky.y + 60 })
  check('sticky carried by the Mac: the same lines at all 12 steps', steps.every((one) => one === steps[0]) && key(JSON.parse(steps[0])) === key(neighbour), steps[0])
  await electron.evaluate(() => { globalThis.qaButton = false })
  await wait(900)
  s = await read()
  check('sticky carried by the Mac: let go 3 points off the box\'s right edge, its right edge lands on it', s.card.x + s.card.width === box.x + box.width, `${s.card.x + s.card.width - box.x - box.width}`)

  // ---- A goal's card, the same look: its lines run along the box and the sticky, fixed for the whole carry.
  const openGoal = ((await v('items', 'goal')) ?? []).find((one) => one?.goalAt && !one.closedAt && !one.archivedAt && !one.closedHow)
  if (openGoal) await h.evaluate((id) => window.api.stick('goal', id, true), openGoal.id)
  let goalWin = null
  for (let i = 0; i < 60 && !goalWin; i++) (goalWin = (await stickyWins()).find((one) => one.url.includes('type=goal&')) ?? null), goalWin || (await wait(250))
  check('the sandbox has a goal card up', !!goalWin)
  if (goalWin) {
    await place(goalWin.id, work.x + 300, work.y + Math.round(work.height * 0.45))
    await wait(400)
    const gsteps = await electron.evaluate(async ({ BrowserWindow }, id) => {
      const w = BrowserWindow.fromId(id)
      const from = w.getBounds()
      globalThis.qaButton = true
      w.emit('will-move', { preventDefault() {} }, { ...from })
      const out = []
      for (let i = 1; i <= 20; i++) {
        w.setPosition(from.x + i * 7, from.y + i * 3)
        globalThis.qaCursor = { x: from.x + i * 7 + 80, y: from.y + i * 3 + 30 }
        w.emit('move')
        w.emit('moved')
        await new Promise((r) => setTimeout(r, 50))
        out.push(JSON.stringify(globalThis.haligtreeGuides.lines))
      }
      globalThis.qaButton = false
      return out
    }, goalWin.id)
    // Every other card up: the box, and each sticky's card (paper keeps 20 points round it; glass fills its window).
    const others = await electron.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows().filter((w) => w.id !== id && w.isVisible() && /view=sticky|index\.html/.test(w.webContents.getURL())).map((w) => {
      const b = w.getBounds()
      const paper = w.webContents.getURL().includes('view=sticky') && !w.webContents.getURL().includes('glass=1')
      return paper ? { x: b.x + 20, y: b.y + 20, width: b.width - 40, height: b.height - 40 } : b
    }), goalWin.id)
    const fixed = new Set(others.flatMap((o) => [o.x, o.x + o.width, o.y]))
    const lines = JSON.parse(gsteps[0])
    check('goal: from its first step the same lines at all 20, each at the box\'s or the sticky\'s left, right or top', lines.length > 0 && gsteps.every((one) => one === gsteps[0]) && lines.every((l) => fixed.has(l.at)), gsteps[0])
    await wait(900)
  }

  // ---- Each look: the same two greys, standing out on a white desktop, a black one and the worst there is (the grey
  // where the two stand out least: the square root of their contrast with each other).
  const greys = {}
  for (const name of ['light', 'dark']) {
    await c.look(name)
    await wait(500)
    // The box carried 12 steps across and down, and the sticky 12 steps across and up, a frame each 50 ms.
    const { frames } = await boxCarry(Array.from({ length: 12 }, (_, n) => [3 + n * 25, n * 12]), shots ? `box-${name}` : null)
    const st = await read()
    const grip = { x: st.sticky.x + 80, y: st.sticky.y + 30 }
    await hand(`window.api.grab(${grip.x}, ${grip.y})`)
    const carried = []
    for (let n = 0; n < 12; n++) {
      const t = Date.now()
      await hand(`window.api.carry(${grip.x + 3 + n * 30}, ${grip.y - n * 15})`)
      await wait(16)
      carried.push(await frame(sticky.id))
      await wait(Math.max(0, 50 - (Date.now() - t)))
    }
    await hand('window.api.letGo()')
    await wait(900)
    if (shots) film.push({ name: `sticky-${name}`, frames: carried })
    const all = [...frames, ...carried]
    check(`${name} look: every stroke of both carries, at every frame, grey, 1 wide and dashed, and each carry's lines the same from first frame to last`, all.every((f) => raycast(f.strokes)) && [frames, carried].every((one) => one.every((f) => key(f.now.guides.lines) === key(one[0].now.guides.lines))), JSON.stringify(all.map((f) => f.strokes).find((one) => !raycast(one))?.slice(0, 4)))
    const strokes = frames.at(-1).strokes ?? []
    const inks = [...new Set(strokes.map((one) => JSON.stringify(one.stroke)))].map((one) => JSON.parse(one))
    greys[name] = JSON.stringify(inks)
    if (inks.length !== 2) { check(`${name} look: two greys`, false, JSON.stringify(inks)); continue }
    const [a, b] = inks
    const white = [255, 255, 255], black = [0, 0, 0]
    const onWhite = Math.max(contrast(a, white), contrast(b, white))
    const onBlack = Math.max(contrast(a, black), contrast(b, black))
    const worst = Math.sqrt(contrast(a, b))
    const said = `rgb(${a}) and rgb(${b}): ${onWhite.toFixed(2)}:1 on a white desktop, ${onBlack.toFixed(2)}:1 on a black one, ${worst.toFixed(2)}:1 on the worst grey`
    console.log(`  ${name} look: ${said}`)
    check(`${name} look: the dashes stand out at 3:1 or more on any desktop, white, black or the worst grey`, onWhite >= 3 && onBlack >= 3 && worst >= 3, said)
  }
  check('the same greys in the light look and the dark', greys.light === greys.dark, JSON.stringify(greys))
  await c.look('light')

  // ---- Filmed, with QA_SHOTS: each carry laid over a white desktop and a dark one, a frame each 50 ms.
  if (shots) for (const { name, frames } of film) for (const [ground, colour] of [['white', '#ffffff'], ['dark', '#1c1c1e']]) {
    const png = await h.evaluate(async ([pics, colour, work]) => {
      const load = (url) => (url ? new Promise((done) => { const one = new Image(); one.onload = () => done(one); one.onerror = () => done(null); one.src = url }) : null)
      const scale = 1 / 3, cols = 4
      const fw = Math.round(work.width * scale), fh = Math.round(work.height * scale)
      const sheet = new OffscreenCanvas(fw * cols, fh * Math.ceil(pics.length / cols))
      const pen = sheet.getContext('2d')
      for (const [n, f] of pics.entries()) {
        const x0 = (n % cols) * fw, y0 = Math.floor(n / cols) * fh
        pen.fillStyle = colour
        pen.fillRect(x0, y0, fw, fh)
        const card = await load(f.card)
        const lines = await load(f.sheet)
        if (card) pen.drawImage(card, x0 + (f.at.x - work.x) * scale, y0 + (f.at.y - work.y) * scale, f.at.width * scale, f.at.height * scale)
        if (lines && f.sheetAt) pen.drawImage(lines, x0 + (f.sheetAt.x - work.x) * scale, y0 + (f.sheetAt.y - work.y) * scale, f.sheetAt.width * scale, f.sheetAt.height * scale)
        pen.fillStyle = '#888'
        pen.fillText(`${n * 50} ms`, x0 + 6, y0 + 14)
      }
      const blob = await sheet.convertToBlob({ type: 'image/png' })
      return new Promise((done) => { const r = new FileReader(); r.onload = () => done(String(r.result).split(',')[1]); r.readAsDataURL(blob) })
    }, [frames.map((f) => f.pics).filter(Boolean), colour, work])
    const file = join(shots, `snap-guides-${name}-over-${ground}.png`)
    writeFileSync(file, Buffer.from(png, 'base64'))
    console.log(`picture: ${file}`)
  }

  const end = await read()
  check('no window took the focus through it all', end.focused === s0.focused, `${s0.focused} -> ${end.focused}`)
  const screens = await electron.evaluate(({ screen }) => screen.getAllDisplays().length)
  check('one guide window for each screen, made once and kept, put away', end.sheets.length === screens && end.sheets.every((one) => !one.visible), `${screens} screens: ${JSON.stringify(end.sheets)}`)
} catch (error) {
  check('ran to the end', false, error.message.split('\n')[0])
} finally {
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  done()
}

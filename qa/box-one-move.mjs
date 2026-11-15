// ⌘\ in quick capture as one move: the one-line pill becoming the box with its side panel, and back. Every frame of
// the move, both ways, is read: the window's frame (main), the card as drawn and each round control (the page), the
// frost's shapes as main last applied them (glass:shapes), and which of each layout's parts are drawn. Checked:
// - the window keeps its frame for the whole move (main moves nothing on its own clock);
// - the card is never cut by the window, and nothing in it is drawn past it;
// - no frost where no card or control is drawn, any frame, and the frost back under every one once landed;
// - none of the other layout's parts drawn past the first 80 ms of the move;
// - each round control travels one way, never back;
// - it lands in the same place every time, both ways, over 10 presses, and after ⌘\ twice in quick succession.
// The user's 22 frames (15 Nov, 18:02) showed each of these failing.
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/box-one-move.mjs
// QA_SHOTS=dir: every frame of one grow and one shrink, with the frost's shapes drawn on as red outlines and the
// drawn card in green, in a sheet per move. QA_LOOK=dark|light (default dark), QA_STYLE=paper, QA_PINS=0 (no pins),
// QA_CENTRED=0 ("centred" off), QA_EDGE=1 (the box near the screen's right edge).
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
// Every window keeps the place the app gives it as its own while it is really parked off screen, so where the box
// lands can be read (main's QA parking, HALIGTREE_QA_VIRTUAL).
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const shots = process.env.QA_SHOTS
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, v, electron } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => page.waitForTimeout(ms)
const tag = [process.env.QA_LOOK ?? 'dark', process.env.QA_STYLE ?? 'satin', process.env.QA_PINS === '0' ? 'nopins' : 'pins', process.env.QA_CENTRED === '0' ? 'left' : 'centred', process.env.QA_EDGE ? 'edge' : 'mid'].join('-')

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true, boxGlance: false, boxCentred: process.env.QA_CENTRED !== '0' })
  // The style rides with the theme (lib/theme.ts): set first, then the look puts both on.
  if (process.env.QA_STYLE) await c.h.evaluate((s) => localStorage.setItem('style', s), process.env.QA_STYLE)
  await c.look(process.env.QA_LOOK === 'light' ? 'light' : 'dark')
  // Two pinned notes, as in the user's frames ("How I work", "haligtree issue tracker"), stale enough to ask "Still relevant?".
  if (process.env.QA_PINS !== '0') {
    for (const text of ['How I work', 'haligtree issue tracker']) {
      const id = await c.h.evaluate((t) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] } }), text)
      await v('pin', 'captures', id, true).catch(() => {})
    }
  }
  // Main's side, logged as it happens: every frost the box's page asked for, and the box window's frame.
  await electron.evaluate(({ ipcMain, BrowserWindow }) => {
    globalThis.__glass = []
    globalThis.__frames = []
    const box = () => BrowserWindow.getAllWindows().find((w) => !/view=/.test(w.webContents.getURL()))
    ipcMain.on('glass:shapes', (event, _dark, shapes) => box()?.webContents === event.sender && globalThis.__glass.push([Date.now(), shapes]))
    let last = ''
    setInterval(() => {
      const win = box()
      if (!win) return
      // The window's own frame (its card's is getBounds, overhang), where the app put it.
      const b = BrowserWindow.prototype.getBounds.call(win)
      const said = `${b.x},${b.y},${b.width},${b.height}`
      if (said !== last) (last = said), globalThis.__frames.push([Date.now(), b])
    }, 4)
  })
  await page.evaluate(() => window.api.showPrompt())
  await wait(1200)
  if (process.env.QA_EDGE) {
    // Carried near the screen's right edge, as a hand would leave it: the box with its panel must be pushed back on.
    await electron.evaluate(({ BrowserWindow, screen }) => {
      const win = BrowserWindow.getAllWindows().find((w) => !/view=/.test(w.webContents.getURL()))
      const area = screen.getDisplayMatching(win.getBounds()).workArea
      win.setPosition(area.x + area.width - win.getBounds().width - 20, win.getBounds().y)
    })
    await page.evaluate(() => window.api.hidePrompt())
    await wait(500)
    await page.evaluate(() => window.api.showPrompt())
    await wait(1200)
  }
  await page.click('.tiptap.ProseMirror.haligtree-editor')
  const pill = () => page.evaluate(() => !!document.querySelector('.app-container[data-pill]'))
  check('opens as the one-line pill', await pill())

  // Every frame of the page: the card as drawn (the move's stand-in while it moves), what is in it, each control.
  const watch = () => page.evaluate(() => {
    window.__seen = []
    const shown = (el) => {
      let o = 1
      for (let at = el; at && at !== document.documentElement; at = at.parentElement) {
        const s = getComputedStyle(at)
        if (s.display === 'none' || s.visibility === 'hidden') return 0
        o *= Number(s.opacity)
      }
      return Math.round(o * 100) / 100
    }
    const box = (el) => {
      const r = el.getBoundingClientRect()
      return [r.left, r.top, r.width, r.height].map((n) => Math.round(n * 10) / 10)
    }
    const tick = () => {
      const card = document.querySelector('.app-container')
      const stand = document.querySelector('.mf-morph-shape')
      const group = document.querySelector('.app-container > [data-slot=resizable-panel-group]')
      window.__seen.push({
        t: Date.now(),
        card: box(stand?.isConnected ? stand : card),
        group: group ? box(group) : null,
        clipped: group ? getComputedStyle(group).clipPath !== 'none' : false,
        controls: [...document.querySelectorAll('.mf-top [data-aside] > *, .mf-top .mf-pill button')].filter((one) => one.offsetWidth > 0).map(box),
        bar: Math.max(0, ...[...document.querySelectorAll('[data-pill-ends]')].map(shown)),
        box: Math.max(0, ...[...document.querySelectorAll('.app-container [data-chrome], .app-container [data-slot=resizable-panel] ~ [data-slot=resizable-panel]')].map(shown)),
        vw: innerWidth,
        vh: innerHeight,
        pill: !!document.querySelector('.app-container[data-pill]'),
        // The pinned rows as drawn (seen at all), each's left and top.
        pins: [...document.querySelectorAll('[data-pin]')].filter((one) => shown(one) > 0.02).map((one) => box(one).slice(0, 2))
      })
      window.__watching = requestAnimationFrame(tick)
    }
    tick()
  })
  const seen = () => page.evaluate(() => (cancelAnimationFrame(window.__watching), window.__seen))
  const mainLog = () => electron.evaluate(() => ({ glass: globalThis.__glass, frames: globalThis.__frames }))
  /** Where the card lands on the screen: the window's frame and the card's place in it. */
  const landed = async () => {
    const at = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.prototype.getBounds.call(BrowserWindow.getAllWindows().find((w) => !/view=/.test(w.webContents.getURL()))))
    const card = await page.evaluate(() => { const r = document.querySelector('.app-container').getBoundingClientRect(); return [r.left, r.top, r.width, r.height] })
    return `${Math.round(at.x + card[0])},${Math.round(at.y + card[1])} ${Math.round(card[2])}x${Math.round(card[3])}`
  }
  const inside = (s, r, by = 1) => s[0] >= r[0] - by && s[1] >= r[1] - by && s[0] + s[2] <= r[0] + r[2] + by && s[1] + s[3] <= r[1] + r[3] + by
  const same = (s, r, by = 1) => Math.abs(s[0] - r[0]) <= by && Math.abs(s[1] - r[1]) <= by && Math.abs(s[2] - r[2]) <= by && Math.abs(s[3] - r[3]) <= by
  const monotonic = (xs) => xs.every((x, i) => i === 0 || (x - xs[i - 1]) * Math.sign(xs[xs.length - 1] - xs[0]) >= -0.6)

  /** One press of ⌘\, every frame read until well after it lands. */
  const move = async (name, film = false) => {
    const before = await page.evaluate(() => Date.now())
    const log0 = (await mainLog()).glass.length
    const frames0 = (await mainLog()).frames.length
    if (film) await electron.evaluate(({ BrowserWindow }) => {
      globalThis.__film = []
      BrowserWindow.getAllWindows().find((w) => !/view=/.test(w.webContents.getURL())).webContents.beginFrameSubscription(false, (image) => globalThis.__film.push([Date.now(), image.toPNG().toString('base64'), image.getSize()]))
    })
    await watch()
    await page.keyboard.press('Meta+Backslash')
    await wait(900)
    const frames = await seen()
    const log = await mainLog()
    const film_ = film ? await electron.evaluate(({ BrowserWindow }) => (BrowserWindow.getAllWindows().find((w) => !/view=/.test(w.webContents.getURL())).webContents.endFrameSubscription(), globalThis.__film)) : []
    const glass = log.glass.slice(log0)
    const glassBefore = log.glass[log0 - 1] ?? null
    const windowMoves = log.frames.slice(frames0)
    // The frost as main had it at each page frame.
    const frostAt = (t) => [...glass].reverse().find(([at]) => at <= t)?.[1] ?? glassBefore?.[1] ?? []
    // From the first frame the shape is seen to move: the frames before it show the old shape as it was.
    const start = frames.find((f, i) => i > 0 && JSON.stringify(f.card) !== JSON.stringify(frames[0].card))?.t ?? before
    const during = frames.filter((f) => f.t >= start && f.t <= start + 300)
    const ghosts = frames.filter((f) => f.t >= before).filter((f) => frostAt(f.t).some((s) => ![f.card, ...f.controls].some((r) => inside(s, r))))
    const cut = frames.filter((f) => f.t >= before).filter((f) => !inside(f.card, [0, 0, f.vw, f.vh], 0.5) || (f.group && !f.clipped && !inside(f.group, [0, 0, f.vw, f.vh], 0.5)))
    const toBox = !frames[0].pill || !frames.at(-1).pill ? !frames.at(-1).pill : false
    const other = during.filter((f) => f.t > start + 80).filter((f) => (toBox ? f.bar > 0.02 : f.box > 0.02 && !f.pill))
    const end = frames.at(-1)
    const frostEnd = frostAt(end.t + 1000)
    const covered = [end.card, ...end.controls].every((r) => frostEnd.some((s) => same(s, r)))
    const ways = end.controls.map((_, i) => monotonic(during.map((f) => f.controls[i]?.[0]).filter((x) => x !== undefined)) && monotonic(during.map((f) => f.controls[i]?.[1]).filter((x) => x !== undefined)))
    check(`${name}: the window keeps its frame through the move`, windowMoves.length === 0, `${windowMoves.length} changes of frame`)
    check(`${name}: the card never cut by the window, nothing drawn past it`, cut.length === 0, `${cut.length} of ${frames.length} frames cut${cut[0] ? `, first: card ${cut[0].card} in ${cut[0].vw}x${cut[0].vh}` : ''}`)
    check(`${name}: no frost where nothing is drawn, any frame`, ghosts.length === 0, `${ghosts.length} of ${frames.length} frames with a ghost${ghosts[0] ? `, ${ghosts[0].t - start} ms in: frost ${JSON.stringify(frostAt(ghosts[0].t).find((s) => ![ghosts[0].card, ...ghosts[0].controls].some((r) => inside(s, r))))} with the card at ${ghosts[0].card} and the controls at ${JSON.stringify(ghosts[0].controls)}` : ''}`)
    check(`${name}: landed, the frost under the card and every control`, covered, `${frostEnd.length} shapes for ${1 + end.controls.length} surfaces`)
    check(`${name}: none of the other layout drawn past the first 80 ms`, other.length === 0, `${other.length} frames${other[0] ? `, ${other.map((f) => `${f.t - start} ms in: bar ${f.bar}, box ${f.box}, card ${f.card}, clipped ${f.clipped}`).join('; ')}` : ''}`)
    check(`${name}: each round control travels one way`, ways.every(Boolean), ways.map((one) => (one ? 'one way' : 'back and forth')).join(', '))
    // Never across the card on the way (the user's frames: "2 pinned" on the card's corner): over it by 3px or more.
    const over = (r, s) => Math.min(r[0] + r[2], s[0] + s[2]) - Math.max(r[0], s[0]) >= 3 && Math.min(r[1] + r[3], s[1] + s[3]) - Math.max(r[1], s[1]) >= 3
    const across = frames.filter((f) => f.t >= before && f.controls.some((r) => over(r, f.card)))
    check(`${name}: no round control over the card, any frame`, across.length === 0, `${across.length} frames${across[0] ? `, first ${across[0].t - start} ms in: ${JSON.stringify(across[0].controls.find((r) => over(r, across[0].card)))} over the card at ${across[0].card}` : ''}`)
    // The pinned rows, any frame they are drawn: one under the other, at one left edge (never two on a line, never one
    // arriving late beside or right of the others).
    const offRows = frames.filter((f) => f.t >= before && f.pins.length > 1 && f.pins.some((p, i) => Math.abs(p[0] - f.pins[0][0]) > 1 || (i > 0 && p[1] <= f.pins[i - 1][1])))
    check(`${name}: the pinned rows in line every frame they show`, offRows.length === 0, `${offRows.length} frames${offRows[0] ? `, ${offRows[0].t - start} ms in: ${JSON.stringify(offRows[0].pins)}` : ''}`)
    return { frames, glass, glassBefore, film: film_, start }
  }

  const sheet = (name, run) => {
    if (!shots || !run.film.length) return
    mkdirSync(shots, { recursive: true })
    const frostAt = (t) => [...run.glass].reverse().find(([at]) => at <= t)?.[1] ?? run.glassBefore?.[1] ?? []
    const cells = run.film.filter(([t]) => t >= run.start - 40 && t <= run.start + 400).map(([t, png, size], i) => {
      const file = `${name}-${String(i).padStart(2, '0')}.png`
      writeFileSync(join(shots, file), Buffer.from(png, 'base64'))
      const near = run.frames.reduce((a, f) => (Math.abs(f.t - t) < Math.abs(a.t - t) ? f : a), run.frames[0])
      const k = size.width / near.vw
      const rects = frostAt(t).map((s) => `<rect x="${s[0] * k}" y="${s[1] * k}" width="${s[2] * k}" height="${s[3] * k}" rx="${s[4] * k}" fill="none" stroke="red" stroke-width="2"/>`).join('')
      const card = `<rect x="${near.card[0] * k}" y="${near.card[1] * k}" width="${near.card[2] * k}" height="${near.card[3] * k}" fill="none" stroke="lime" stroke-width="1.5" stroke-dasharray="6 4"/>`
      return `<figure><div style="position:relative"><img src="${file}" width="${size.width / 2}"><svg viewBox="0 0 ${size.width} ${size.height}" style="position:absolute;inset:0;width:100%;height:100%">${rects}${card}</svg></div><figcaption>${t - run.start} ms</figcaption></figure>`
    })
    writeFileSync(join(shots, `${name}.html`), `<!doctype html><body style="margin:0;background:#888;font:12px system-ui;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:6px">${cells.join('')}</body>`)
  }

  const places = { box: [], pill: [] }
  const pillAt = await landed()
  places.pill.push(pillAt)
  const grow = await move(`${tag} grow`, !!shots)
  sheet(`${tag}-grow`, grow)
  places.box.push(await landed())
  check('grown: the box with its panel', !(await pill()) && (await page.evaluate(() => !!document.querySelector('[data-slot=resizable-panel] ~ [data-slot=resizable-panel]'))))
  // The pinned rows each on their own line, one under the other, at one left edge.
  const pins = await page.evaluate(() => [...document.querySelectorAll('[data-pin]')].map((one) => { const r = one.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)] }))
  if (process.env.QA_PINS !== '0') check('grown: the pinned rows one under the other, in line', pins.length >= 2 && pins.every((p) => p[0] === pins[0][0]) && pins.every((p, i) => i === 0 || p[1] > pins[i - 1][1]), JSON.stringify(pins))
  const shrink = await move(`${tag} shrink`, !!shots)
  sheet(`${tag}-shrink`, shrink)
  places.pill.push(await landed())
  check('shrunk: the one-line pill again', await pill())
  // Ten presses more (five each way), each landing read.
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Meta+Backslash')
    await wait(700)
    places[(await pill()) ? 'pill' : 'box'].push(await landed())
  }
  // Turned round mid-move: ⌘\ twice in quick succession lands back as the pill, where it was.
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Meta+Backslash')
    await wait(60 + i * 40)
    await page.keyboard.press('Meta+Backslash')
    await wait(800)
    places[(await pill()) ? 'pill' : 'box'].push(await landed())
  }
  check('turned round mid-move, it lands back as the pill', await pill())
  check(`the box lands in one place every time (${places.box.length} landings)`, new Set(places.box).size === 1, [...new Set(places.box)].join(' | '))
  check(`the pill lands back where it was every time (${places.pill.length} landings)`, new Set(places.pill).size === 1 && places.pill[0] === pillAt, [...new Set(places.pill)].join(' | '))
  const errors = c.errors.filter((one) => !/Autofill|DevTools/.test(one))
  check('no page errors', !errors.length, errors.slice(0, 2).join(' / '))
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)

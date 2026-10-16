// How stickies move and answer, checked off screen: every window stays parked
// (MINDFLOW_QA_AWAY) while keeping the place Vigil gives it as its own
// (MINDFLOW_QA_VIRTUAL), so glides, fades and placing can be read back.
//
// Coming in (fade, drop, stagger), taking down (⌘W asks as X does, the peel,
// "Put it back"), picked up and let go (lift, settle, tap), the slide back from
// an edge and "Bring sticky notes here" as glides, edge and neighbour
// magnetism, "Open it" growing the note in the main window (⌥ takes it down),
// a single to-do's "Done", glass and paper keeping the card in place with a
// crossfade, the title keeping its room on hover, the grip's give, colours,
// a note gone to the Bin, an empty note's words, and glides paced on frames.
//
//   npx electron-vite build --outDir out-stickies
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-stickies/main/index.js MINDFLOW_QA_AWAY=1 MINDFLOW_QA_VIRTUAL=1 node qa/stickies-feel.mjs
import { mkdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

process.env.MINDFLOW_QA_VIRTUAL ??= '1'
const SHOTS = process.env.QA_SHOTS ?? 'scratchpad/round/stickies'
mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const c = await sandbox()
const { electron, h } = c
try {
  // Every setPosition and setOpacity, by window, with its time: what a glide or a fade really did.
  await electron.evaluate(({ BrowserWindow, Menu }) => {
    globalThis.qaTrace = []
    const proto = BrowserWindow.prototype
    for (const name of ['setPosition', 'setOpacity', 'setBounds', 'destroy']) {
      const was = proto[name]
      proto[name] = function (...args) { globalThis.qaTrace.push({ id: this.id, name, args, t: performance.now() }); return was.apply(this, args) }
    }
    // A right-click menu is kept to be read and clicked here, never shown.
    const build = Menu.buildFromTemplate
    Menu.buildFromTemplate = (template) => { globalThis.qaMenu = template; const menu = build(template); menu.popup = () => {}; return menu }
  })
  const trace = (id, name, since = 0) => electron.evaluate((_, [id, name, since]) => globalThis.qaTrace.filter((one) => one.id === id && one.name === name && one.t >= since), [id, name, since])
  const now = () => electron.evaluate(() => performance.now())
  const wins = () => electron.evaluate(({ BrowserWindow, screen }) => BrowserWindow.getAllWindows()
    .filter((w) => !w.isDestroyed() && w.webContents.getURL().includes('view=sticky'))
    .map((w) => {
      const url = new URL(w.webContents.getURL())
      return { id: w.id, key: `${url.searchParams.get('type')}:${url.searchParams.get('id')}`, glass: url.searchParams.has('glass'), b: w.getBounds(), visible: w.isVisible(), opacity: w.qaOpacity, work: screen.getDisplayMatching(w.getBounds()).workArea }
    }))
  const win = async (key) => (await wins()).find((one) => one.key === key)
  const pageOf = (key) => {
    const [type, id] = key.split(':')
    return electron.windows().find((p) => p.url().includes('view=sticky') && p.url().includes(`type=${type}&`) && p.url().includes(`id=${encodeURIComponent(id)}&`))
  }
  const settled = async (key) => { for (let i = 0; i < 40; i++) { const p = pageOf(key); if (p && (await win(key))?.visible) { await p.waitForLoadState('domcontentloaded'); await wait(500); return p } await wait(250) } return null }
  const emit = (id, event) => electron.evaluate(({ BrowserWindow }, [id, event]) => { const w = BrowserWindow.fromId(id); if (event === 'will-move') w.emit('will-move', { preventDefault() {} }, w.getBounds()); else w.emit(event) }, [id, event])
  const place = (id, x, y) => electron.evaluate(({ BrowserWindow }, [id, x, y]) => BrowserWindow.fromId(id).setPosition(x, y), [id, x, y])
  const kept = async () => {
    const dir = await electron.evaluate(({ app }) => app.getPath('userData'))
    const file = [join(dir, 'sandbox', 'stickies.json'), join(dir, 'stickies.json')].find((f) => existsSync(f))
    return file ? JSON.parse(readFileSync(file, 'utf8')) : []
  }
  const v = (channel, ...args) => h.evaluate(([c, a]) => window.api.vigil(c, ...a), [channel, args])

  // The sandbox's own stickies taken down, then notes of our own stuck, as paper first.
  await v('settings:set', { stickiesGlass: false })
  await wait(2500)
  for (let i = 0; i < 20 && (await wins()).length; i++) {
    for (const one of await wins()) await h.evaluate((k) => window.api.stick(...k.split(':'), false), one.key)
    await wait(600)
  }
  const doc = (...blocks) => ({ type: 'doc', content: blocks })
  const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
  const todo = (text, checked = false) => ({ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked }, content: [para(text)] }] })
  const make = (title, body) => h.evaluate(([title, body]) => window.api.captures.create({ title, body }), [title, body])
  const one = await make('Errand', doc(para('Errand'), todo('Post the letter')))
  const two = await make('Shopping list', doc(para('Shopping list'), para('Bread, eggs and a lemon')))
  const blank = await make('Blank page', doc())
  const A = `capture:${one}`, B = `capture:${two}`, E = `capture:${blank}`
  const t0 = await now()
  for (const id of [one, two, blank]) await h.evaluate((id) => window.api.stick('capture', id, true), id)
  const pa = await settled(A)
  await settled(B)
  const pe = await settled(E)
  check('three stickies are up', (await wins()).filter((w) => w.visible).length === 3)

  // K1: each comes in: opacity from 0 up to 1 over several frames, dropping its last 8 points, one after another.
  const ins = []
  for (const key of [A, B, E]) {
    const w = await win(key)
    const fades = (await trace(w.id, 'setOpacity', t0)).map((one) => one.args[0])
    const ys = (await trace(w.id, 'setPosition', t0)).map((one) => one.args[1])
    ins.push({ w, fades, ys, start: (await trace(w.id, 'setPosition', t0))[0]?.t })
  }
  check('K1 comes in: opacity rises from 0 to 1 over several frames', ins.every(({ fades }) => fades[0] === 0 && fades.at(-1) === 1 && fades.length >= 5 && fades.some((o) => o > 0.2 && o < 0.9)), JSON.stringify(ins.map(({ fades }) => fades.length)))
  check('K1 drops its last 8 points and settles where it rests', ins.every(({ w, ys }) => ys[0] === w.b.y - 8 && ys.at(-1) === w.b.y), JSON.stringify(ins.map(({ ys, w }) => [ys[0], ys.at(-1), w.b.y])))
  const starts = ins.map((one) => one.start).sort((a, b) => a - b)
  check('K1 several at once come one after another (about 40ms apart)', starts[1] - starts[0] >= 30 && starts[2] - starts[1] >= 30, starts.map((s) => Math.round(s - starts[0])).join(', '))

  // K1 Show sticky notes: put away then shown, they come back staggered with the fade.
  await v('settings:set', { stickiesShown: false })
  await wait(700)
  const t1 = await now()
  await v('settings:set', { stickiesShown: true })
  await wait(900)
  const back = await Promise.all([A, B, E].map(async (key) => (await trace((await win(key)).id, 'setOpacity', t1))))
  const firsts = back.map((list) => list[0]?.t).sort((a, b) => a - b)
  check('K1 Show sticky notes: each fades in again, 40ms apart', back.every((list) => list[0]?.args[0] === 0 && list.at(-1)?.args[0] === 1) && firsts[2] - firsts[0] >= 60, firsts.map((s) => Math.round(s - firsts[0])).join(', '))

  // K13: an empty note says where to start.
  check('K13 an empty sticky says "Double-click to write here."', (await pe.evaluate(() => document.body.innerText)).includes('Double-click to write here.'))

  // K9: asking (as on hover), the title keeps its room: the controls slide over the count.
  await pa.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', metaKey: true })))
  await wait(450)
  const head = await pa.evaluate(() => {
    const title = document.querySelector('p.private-text')
    const ask = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Take it off the desktop')
    return { truncated: title.scrollWidth > title.clientWidth + 1, title: title.textContent, asking: ask?.innerText.replace(/\s+/g, '').includes('Takedown?') }
  })
  check('K2 ⌘W asks first, as X does ("Take down?")', head.asking && !!(await win(A)), JSON.stringify(head))
  check('K9 with the controls out the title is not cut short', !head.truncated, head.title)
  await pa.screenshot({ path: join(SHOTS, 'k9-asking-paper.png') }).catch(() => {})
  await pa.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))

  // K7: a single to-do ticked gets a small "Done", with the glint.
  await pa.click('input[type=checkbox]')
  await wait(900)
  const done = await pa.evaluate(() => ({ text: document.body.innerText, glint: !!document.querySelector('.mf-sticky-glint'), width: document.querySelector('.mf-sticky-glint')?.getBoundingClientRect().width, slot: document.querySelector('.mf-sticky-glint')?.parentElement?.parentElement?.getBoundingClientRect().width }))
  check('K7 one to-do of one ticked: "Done" with its glint', done.text.replace(/\s+/g, '').includes('Done') && done.glint, `${done.text.replace(/\s+/g, ' ').slice(0, 60)} ${done.width}/${done.slot}`)
  await pa.screenshot({ path: join(SHOTS, 'k7-single-done-paper.png') }).catch(() => {})

  // K3: picked up by your hand the card lifts; let go it settles with a soft paper tap.
  const wa = await win(A)
  await emit(wa.id, 'will-move')
  await wait(100)
  const lifted = await pa.evaluate(() => document.querySelector('[data-held]') !== null)
  await emit(wa.id, 'moved')
  // Settled only once the hand has let go: the Mac is asked whether the button is up (hand.ts), so a moment later.
  for (let i = 0; i < 20 && (await pa.evaluate(() => document.querySelector('[data-held]') !== null)); i++) await wait(100)
  for (let i = 0; i < 10 && !(await pa.evaluate(() => (window.vigilHeard ?? []).includes('paper-tap'))); i++) await wait(100)
  const set = await pa.evaluate(() => ({ held: document.querySelector('[data-held]') !== null, heard: [...(window.vigilHeard ?? [])] }))
  check('K3 picked up: the card is held (deeper shadow, straightened)', lifted)
  check('K3 let go: it settles, with the paper tap', !set.held && set.heard.includes('paper-tap'), set.heard.slice(-3).join(','))

  // K4: let go mostly past the screen's edge, it glides back until the card is in view.
  const work = wa.work
  const t2 = await now()
  await place(wa.id, work.x + work.width - 60, wa.b.y)
  await emit(wa.id, 'moved')
  await wait(700)
  const slid = (await trace(wa.id, 'setPosition', t2)).map((one) => one.args[0])
  const afterSlide = await win(A)
  check('K4 off the edge: glides back over several frames, not a jump', slid.length >= 6 && new Set(slid).size >= 5, `${slid.length} steps`)
  check('K4 off the edge: the card ends wholly on the screen', afterSlide.b.x + afterSlide.b.width - 20 <= work.x + work.width && afterSlide.b.x + 20 >= work.x, JSON.stringify(afterSlide.b))

  // K5: let go 10 points from the line beside a neighbour, it glides into line: 8 points apart, tops aligned.
  const wb = await win(B)
  await place(wb.id, work.x + 400, work.y + 300)
  await emit(wb.id, 'moved')
  await wait(500)
  const nb = await win(B)
  // A's card right next to B's card, 8 + 10 points off, 7 points lower.
  await place(wa.id, nb.b.x + 20 - 8 - 10 - (wa.b.width - 40) - 20, nb.b.y + 7)
  await emit(wa.id, 'moved')
  await wait(700)
  const na = await win(A)
  const gap = (nb.b.x + 20) - (na.b.x + na.b.width - 20)
  check('K5 near a neighbour: glides into line 8 points apart', gap === 8, `gap ${gap}`)
  check('K5 near a neighbour: tops lined up', na.b.y === nb.b.y, `${na.b.y} vs ${nb.b.y}`)
  await place(wb.id, work.x + 3 - 20, work.y + 500)
  await emit(wb.id, 'moved')
  await wait(700)
  check('K5 near the screen edge: the card lines up 8 points in', (await win(B)).b.x + 20 === work.x + 8, `${(await win(B)).b.x + 20 - work.x}`)

  // K4: "Bring sticky notes here" glides each, one after another.
  const t3 = await now()
  await h.evaluate(() => window.api.gatherStickies())
  await wait(1000)
  const gathered = await Promise.all([A, B, E].map(async (key) => trace((await win(key)).id, 'setPosition', t3)))
  check('K4 Bring sticky notes here: each glides there over several frames', gathered.every((list) => list.length >= 6), gathered.map((l) => l.length).join(', '))
  const gStarts = gathered.map((l) => l[0]?.t).sort((a, b) => a - b)
  check('K4 Bring sticky notes here: one after another', gStarts[2] - gStarts[0] >= 60, gStarts.map((s) => Math.round(s - gStarts[0])).join(', '))

  // K14: a glide steps once a display frame, steadily, and stickies moving together step on the same beat.
  const t4 = await now()
  await h.evaluate(() => window.api.tidyStickies())
  await wait(1200)
  const tidied = await Promise.all([A, B, E].map(async (key) => trace((await win(key)).id, 'setPosition', t4)))
  const freq = await electron.evaluate(({ screen }) => screen.getPrimaryDisplay().displayFrequency || 60)
  const gaps = tidied.flatMap((list) => list.slice(1).map((one, i) => one.t - list[i].t))
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
  check('K14 tidy glides step about once a display frame', Math.abs(mean - 1000 / freq) < 1000 / freq * 0.6, `${mean.toFixed(1)}ms at ${freq}Hz`)
  const beats = new Set(tidied.flat().map((one) => Math.round(one.t * 10)))
  check('K14 stickies moving together share one clock', beats.size < tidied.flat().length, `${beats.size} beats for ${tidied.flat().length} steps`)
  await h.evaluate(() => window.api.untidyStickies())
  await wait(800)

  // K11: a colour from its right-click menu: kept, painted, with a paper sound; Tidy keeps colours together.
  await electron.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).webContents.emit('context-menu', {}, { isEditable: false, selectionText: '', editFlags: {} }), (await win(B)).id)
  const labels = await electron.evaluate(() => globalThis.qaMenu.map((one) => one.label).filter(Boolean))
  check('K11 the right-click menu offers five paper colours', ['Plain', 'Butter', 'Rose', 'Sage', 'Sky'].every((one) => labels.includes(one)), labels.join(', '))
  await electron.evaluate(() => globalThis.qaMenu.find((one) => one.label === 'Sky').click())
  await wait(600)
  const pb = pageOf(B)
  const painted = await pb.evaluate(() => ({ tint: document.documentElement.hasAttribute('data-tint') ? document.documentElement.style.getPropertyValue('--mf-tint-hue') : '', heard: [...(window.vigilHeard ?? [])] }))
  check('K11 Sky: painted on the paper, with a paper sound', painted.tint.includes('blue') && painted.heard.includes('paper-slide'), painted.tint)
  check('K11 Sky: kept in stickies.json', (await kept()).find((one) => `${one.type}:${one.id}` === B)?.tint === 'sky')
  await pb.screenshot({ path: join(SHOTS, 'k11-sky-paper.png') }).catch(() => {})

  // K10: the grip pulled far past its most gives a few points, and springs back when let go.
  await pb.evaluate(() => window.api.resizeSticky(2000, 300))
  await wait(250)
  const pulled = (await win(B)).b.width
  await pb.evaluate(() => window.api.resizeSticky(2000, 300, true))
  await wait(500)
  const sprung = (await win(B)).b.width
  check('K10 pulled past its limit it gives a little (up to 6 points)', pulled > 480 && pulled <= 486, `${pulled}`)
  check('K10 let go, it springs back to the limit', sprung === 480, `${sprung}`)

  // K6: "Open it" opens the note in the main window, growing out of the sticky; the sticky stays.
  await h.evaluate(() => { window.qaGrow = []; new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => window.qaGrow.push(n.textContent)))).observe(document.querySelector('.pointer-events-none.fixed.inset-0.z-\\[60\\]'), { childList: true }) })
  await pb.evaluate(() => document.querySelector('button[aria-label="Open it"]').click())
  await wait(1200)
  const grew = await h.evaluate(() => window.qaGrow)
  check('K6 Open it: the note grows out of the sticky in the main window', grew.includes('Shopping list'), JSON.stringify(grew))
  check('K6 Open it: the note is open in the main window', (await h.evaluate(() => document.body.innerText)).includes('Bread, eggs and a lemon'))
  check('K6 Open it: the sticky stays up', !!(await win(B))?.visible)

  // K2: ⌘W twice: it peels off (lifts 10 points as it fades), the main window offers "Put it back".
  const wbb = await win(B)
  const t5 = await now()
  await pb.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', metaKey: true })))
  await wait(150)
  await pb.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', metaKey: true })))
  await wait(600)
  const peel = { fade: (await trace(wbb.id, 'setOpacity', t5)).map((one) => one.args[0]), ys: (await trace(wbb.id, 'setPosition', t5)).map((one) => one.args[1]), gone: !(await win(B)) }
  check('K2 taken down: it peels (fades and lifts 10 points) before going', peel.fade.length >= 4 && peel.fade.at(-1) < 0.1 && wbb.b.y - Math.min(...peel.ys) === 10 && peel.gone, `${peel.fade.length} fades, lifted ${wbb.b.y - Math.min(...peel.ys)}`)
  const toast = await h.evaluate(() => document.body.innerText)
  check('K2 the main window says so, with "Put it back"', toast.includes('taken off the desktop') && toast.includes('Put it back'))
  await h.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Put it back'))?.click())
  await wait(1200)
  const again = await win(B)
  check('K2 Put it back: where it was, in its colour', again && again.b.x === wbb.b.x && again.b.y === wbb.b.y && again.key === B && (await kept()).find((one) => `${one.type}:${one.id}` === B)?.tint === 'sky', `${JSON.stringify(wbb.b)} -> ${JSON.stringify(again?.b)}`)

  // K6 ⌥-click: opens it and takes the sticky down.
  await settled(B)
  await pageOf(B).evaluate(() => document.querySelector('button[aria-label="Open it"]').dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true })))
  await wait(900)
  check('K6 ⌥-click Open it: opened, and the sticky taken down', !(await win(B)))

  // K12: its note put in the Bin: the sticky greys and says so, with the way back; brought back, it stays.
  await h.evaluate((id) => window.api.captures.save(id, { status: 'discarded' }), two)
  await h.evaluate((id) => window.api.stick('capture', id, true), one)
  await h.evaluate((id) => window.api.captures.save(id, { status: 'discarded' }), one)
  await wait(900)
  const binned = await pa.evaluate(() => document.body.innerText)
  check('K12 note to the Bin: the sticky says so, with "Bring it back"', binned.includes('This note went to the Bin') && binned.includes('Bring it back'))
  await pa.screenshot({ path: join(SHOTS, 'k12-bin-paper.png') }).catch(() => {})
  // The peel waits while the pointer rests on the card, so "Bring it back" is still there to reach.
  await pa.hover('[data-peel]')
  await wait(4800)
  check('K12 the pointer resting on it: it waits', !!(await win(A)))
  await pa.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Bring it back')).click())
  await wait(5000)
  check('K12 brought back in time: the sticky stays', !!(await win(A)) && !(await pa.evaluate(() => document.body.innerText)).includes('went to the Bin'))
  // The pointer moved off the card first: left resting there, the peel would wait for it.
  await pa.mouse.move(1, 1)
  await h.evaluate((id) => window.api.captures.save(id, { status: 'discarded' }), one)
  await wait(5200)
  check('K12 left in the Bin: four seconds on, it peels away', !(await win(A)))
  await h.evaluate((id) => window.api.captures.save(id, { status: 'open' }), one)

  // K8: paper to glass: the card stays where it was, the same size, and the old window fades out rather than blinking.
  const pw = await win(E)
  const t6 = await now()
  await v('settings:set', { stickiesGlass: true })
  // Remade as glass, then given the fade's time to finish: waited for, so a busy machine cannot read it half done.
  for (let i = 0; i < 40 && !(await win(E))?.glass; i++) await wait(150)
  await wait(600)
  const gw = await win(E)
  check('K8 to glass: remade as glass', gw?.glass === true)
  check('K8 to glass: the card stays in place, the same size', gw && gw.b.x === pw.b.x + 20 && gw.b.y === pw.b.y + 20 && gw.b.width === pw.b.width - 40 && gw.b.height === pw.b.height - 40, `${JSON.stringify(pw.b)} -> ${JSON.stringify(gw?.b)}`)
  const crossfade = (await trace(pw.id, 'setOpacity', t6)).map((one) => one.args[0])
  // Drawn once a frame over 180ms, so how many steps land depends on how busy the machine is. What makes it
  // a fade and not a blink: it passes through at least one value in between, never brightens, and ends gone.
  const between = crossfade.filter((one) => one > 0.05 && one < 0.95).length
  check('K8 to glass: the old one fades out (a crossfade, not a blink)', crossfade.length >= 2 && between >= 1 && crossfade.every((one, i) => !i || one <= crossfade[i - 1]) && crossfade.at(-1) < 0.1, crossfade.map((one) => one.toFixed(2)).join(' '))
  const newIn = (await trace(gw.id, 'setPosition', t6)).map((one) => one.args[1])
  check('K8 to glass: the new one fades in where it is, with no drop', newIn.every((y) => y === gw.b.y))
  const pg = await settled(E)
  await pg?.screenshot({ path: join(SHOTS, 'k13-blank-glass.png') }).catch(() => {})
  await v('settings:set', { stickiesGlass: false })
  for (let i = 0; i < 40 && (await win(E))?.glass !== false; i++) await wait(150)
  await wait(600)
  const back2 = await win(E)
  check('K8 back to paper: the card stays in place', back2 && back2.b.x === pw.b.x && back2.b.y === pw.b.y && back2.b.width === pw.b.width, JSON.stringify(back2?.b))

  // Motion off: a sticky comes in at once, no fade steps.
  await v('settings:set', { motion: false })
  await v('settings:set', { stickiesShown: false })
  await wait(500)
  const t7 = await now()
  await v('settings:set', { stickiesShown: true })
  await wait(500)
  const still = await trace((await win(E)).id, 'setOpacity', t7)
  check('Motion off: shown at once, with no fade', still.length === 0, `${still.length}`)
  await v('settings:set', { motion: true })

  check('no page errors in the main window', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  console.log('FAIL  the run itself', error?.stack ?? error)
  results.push(false)
} finally {
  await c.close()
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)

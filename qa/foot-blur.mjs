// Every bar at a view's foot floats over its scroller, the words blurring out under it (main.css .mf-blur-bar): a
// note's "Add a thought…" (wide, and narrow where the whole pane scrolls), read mode's foot, the writing room's foot
// and the Journal's writer line. For each: no parent of the blur fades, masks or filters (there a backdrop blur sees
// nothing), its layers do blur, the words do pass under the bar, the last line still scrolls clear of it, and
// scrolling stays inside the frame budget. Light and dark pictures of each with a folder: node qa/foot-blur.mjs <dir>
//
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/foot-blur.mjs [shots]
import { writeFileSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const SHOTS = process.argv[2] ?? process.env.SHOTS
const c = await sandbox({ width: 1300, height: 860 })
const { h, v, send, go, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const shot = async (name) => SHOTS && c.both(join(SHOTS, name))

/** The blur under the bar `bar`: what breaks it round it, whether it blurs, the words under it, and room for the last line. */
const look = (bar) => h.evaluate((bar) => {
  const edge = document.querySelector(`${bar} .mf-blur-bar`)
  if (!edge) return { none: bar }
  const breaks = []
  for (let at = edge.parentElement; at && at !== document.documentElement; at = at.parentElement) {
    const s = getComputedStyle(at)
    if (Number(s.opacity) < 1 || s.maskImage !== 'none' || s.filter !== 'none' || s.clipPath !== 'none' || s.backdropFilter !== 'none' || s.mixBlendMode !== 'normal') breaks.push(`${at.tagName}.${String(at.className).slice(0, 40)}`)
  }
  const layers = [...edge.children].map((one) => getComputedStyle(one).backdropFilter)
  const shown = [...edge.children].map((one) => getComputedStyle(one).display)
  const e = edge.getBoundingClientRect()
  return { breaks, layers, shown, edgeTop: Math.round(e.top), edgeBottom: Math.round(e.bottom), barTop: Math.round(document.querySelector(bar).getBoundingClientRect().top), rem: parseFloat(getComputedStyle(document.documentElement).fontSize) }
}, bar)

/** The scroller under it: scrolled to the end, where its last line of words sits against the bar's top. */
const toEnd = (scrollSel, lastSel, bar) => h.evaluate(async ([scrollSel, lastSel, bar]) => {
  const box = document.querySelector(scrollSel)
  // At once, and read a frame later: a note's scroller glides (scroll-behavior: smooth), so read straight after
  // setting it, the page was still on its way and the last line looked short of the end.
  box.scrollTo({ top: box.scrollHeight, behavior: 'instant' })
  await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))
  const lines = [...document.querySelectorAll(lastSel)].filter((one) => one.getClientRects().length)
  const last = lines.at(-1)?.getBoundingClientRect()
  const top = document.querySelector(bar).getBoundingClientRect().top
  return { lastBottom: last && Math.round(last.bottom), barTop: Math.round(top), clear: !!last && last.bottom <= top + 1 }
}, [scrollSel, lastSel, bar])

/** Words under the bar's top while scrolled part way: they pass under it rather than stop at a band. */
const under = (scrollSel, lastSel, bar) => h.evaluate(([scrollSel, lastSel, bar]) => {
  const box = document.querySelector(scrollSel)
  box.scrollTop = Math.max(0, (box.scrollHeight - box.clientHeight) / 2)
  const top = document.querySelector(bar).getBoundingClientRect().top
  const r = document.querySelector(bar).getBoundingClientRect()
  return [...document.querySelectorAll(lastSel)].some((one) => { const b = one.getBoundingClientRect(); return b.height && b.top < r.bottom && b.bottom > top + 4 })
}, [scrollSel, lastSel, bar])

/**
 * What shows at the bar's own height with the bar itself taken away, the words scrolled under it: the widest step
 * between any two pixels of the band from the bar's top edge to its foot (0 is one flat colour, the page's). Words
 * showing through, however faintly, are steps. Kept 16px in from each side, clear of the pane's round corners.
 */
const bare = async (bar, name) => {
  const clip = await h.evaluate((bar) => {
    const dock = document.querySelector(bar)
    for (const one of dock.children) if (!one.classList.contains('mf-blur-edge')) one.style.visibility = 'hidden'
    // "Top" floats over the bar on purpose (its own line checks it clears the bar), and its soft shadow falls a few
    // pixels onto the band's top right: a control's shadow, not words passing under. Put away while the band is read.
    for (const one of document.querySelectorAll('[data-back-to-top]')) one.style.visibility = 'hidden'
    const r = dock.getBoundingClientRect()
    return { x: Math.ceil(r.left) + 16, y: Math.ceil(r.top) + 1, width: Math.floor(r.width) - 32, height: Math.floor(r.height) - 16 }
  }, bar)
  await wait(150)
  const png = await h.screenshot({ clip })
  // The band as measured, to read by eye: what made a step, if any.
  if (SHOTS && name) writeFileSync(join(SHOTS, `band-${name}.png`), png)
  await h.evaluate((bar) => { for (const one of [...document.querySelector(bar).children, ...document.querySelectorAll('[data-back-to-top]')]) one.style.visibility = '' }, bar)
  const step = await electron.evaluate(({ nativeImage }, b64) => {
    const bits = nativeImage.createFromBuffer(Buffer.from(b64, 'base64')).toBitmap()
    const lo = [255, 255, 255], hi = [0, 0, 0]
    for (let i = 0; i < bits.length; i += 4) for (let k = 0; k < 3; k++) { if (bits[i + k] < lo[k]) lo[k] = bits[i + k]; if (bits[i + k] > hi[k]) hi[k] = bits[i + k] }
    return Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
  }, png.toString('base64'))
  return { step, clip }
}

/** The same in light and in dark. */
let measured = 0
const flats = async (bar) => { const seen = []; measured++; for (const theme of ['dark', 'light']) { await c.look(theme); seen.push({ theme, ...(await bare(bar, `${measured}-${bar.replace(/\W+/g, '')}-${theme}`)) }) } return seen }

/** Frame times while the scroller is wheeled down: the worst and the 95th percentile, in ms. */
const frames = async (x, y) => {
  await h.mouse.move(x, y)
  const p = h.evaluate(() => new Promise((ok) => { const t = []; let last = performance.now(); const end = last + 1200; const step = (now) => { t.push(now - last); last = now; now < end ? requestAnimationFrame(step) : ok(t) }; requestAnimationFrame(step) }))
  for (let i = 0; i < 20; i++) { await h.mouse.wheel(0, 60); await wait(30) }
  const t = (await p).slice(2).sort((a, b) => a - b)
  return { p95: Math.round(t[Math.floor(t.length * 0.95)] * 10) / 10, worst: Math.round(t.at(-1) * 10) / 10, n: t.length }
}

const report = (name, seen, end, passing, fr, flat) => {
  check(`${name}: no parent of the blur fades, masks or filters`, !!seen && !seen.none && seen.breaks.length === 0, JSON.stringify(seen))
  // Under a bar the words dim evenly over 3rem and soften only once mostly gone: two light layers, never the edge's four
  // (12 Nov: one smeared line stood over an empty band above the bar, "that bridge between the blur starting and the comment input").
  check(`${name}: two layers blur, lightly (2px and 5px), and the other two draw nothing`, !!seen?.layers && /blur\(2px\)/.test(seen.layers[0]) && /blur\(5px\)/.test(seen.layers[1]) && seen.shown.slice(2).every((one) => one === 'none'), JSON.stringify([seen?.layers, seen?.shown]))
  // 3rem, whatever the app's own size makes a rem (17px at the usual size: 51px).
  check(`${name}: the fade stands 3rem over the bar's top`, !!seen && Math.abs(seen.barTop - seen.edgeTop - 3 * seen.rem) <= 2, JSON.stringify(seen))
  check(`${name}: words pass under the bar`, passing)
  check(`${name}: nothing reads at the bar's own height, beside it or under it (the band is one flat colour, light and dark)`, !!flat && flat.every((one) => one.step <= 3), JSON.stringify(flat))
  check(`${name}: scrolled to the end, the last line sits clear of the bar`, !!end?.clear, JSON.stringify(end))
  if (fr) check(`${name}: scrolling keeps to the frame budget (95% of frames under 20ms)`, fr.p95 < 20, JSON.stringify(fr))
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const p = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })
  const content = []
  for (let n = 0; n < 40; n++) content.push(p(`Line ${n + 1}. Words enough to fill the width of the page and more besides, read slowly and with care.`))
  const id = await v('article:new'); await v('item:save', id, { title: 'Long Scroll', body: { type: 'doc', content } })
  await send('article', id); await wait(2500)
  const NOTE = '.haligtree-editor-content:has(.ProseMirror p)'
  const LINES = '.note-pane .ProseMirror p'

  // --- A note, wide: the words scroll in the editor's own box.
  {
    const seen = await look('[data-thought-dock]')
    const passing = await under(NOTE, LINES, '[data-thought-dock]')
    const flat = await flats('[data-thought-dock]')
    await wait(300)
    await shot('note-wide')
    const fr = await frames(950, 500)
    const end = await toEnd(NOTE, LINES, '[data-thought-dock]')
    await wait(300)
    await shot('note-wide-end')
    const top = await h.evaluate(() => { const b = document.querySelector('.note-pane [data-back-to-top] button')?.getBoundingClientRect(); const bar = document.querySelector('[data-thought-dock] [data-composer]').getBoundingClientRect(); return b ? { clear: b.bottom <= bar.top, b: Math.round(b.bottom), bar: Math.round(bar.top) } : null })
    check('a note, wide: "Top" sits over the bar, not on it', !!top?.clear, JSON.stringify(top))
    report('a note, wide', seen, end, passing, fr, flat)
  }
  // --- A note, narrow: the whole pane scrolls and the bar holds to its foot.
  {
    await c.size(620, 760); await wait(800)
    const seen = await look('[data-thought-dock]')
    const pane = await h.evaluate(() => { const one = document.querySelector('.note-pane'); return /(auto|scroll)/.test(getComputedStyle(one).overflowY) })
    const SCROLL = pane ? '.note-pane' : NOTE
    const passing = await under(SCROLL, LINES, '[data-thought-dock]')
    const flat = await flats('[data-thought-dock]')
    await wait(300)
    await shot('note-narrow')
    const end = await toEnd(SCROLL, LINES, '[data-thought-dock]')
    report('a note, narrow', seen, end, passing, undefined, flat)
    await c.size(1300, 860); await wait(800)
  }
  // --- Read mode.
  {
    await h.evaluate(() => [...document.querySelectorAll('[aria-label="Read through"]')].find((one) => one.getClientRects().length)?.click()); await wait(1500)
    if (!(await h.evaluate(() => document.querySelector('.mf-read')))) { await h.keyboard.press('Meta+Shift+r'); await wait(1500) }
    const seen = await look('[data-read-dock]')
    const passing = await under('.mf-read [data-dock-scroll]', '.mf-read .ProseMirror p', '[data-read-dock]')
    const flat = await flats('[data-read-dock]')
    await h.mouse.move(650, 700); await wait(400)
    await shot('read')
    const fr = await frames(650, 400)
    const end = await toEnd('.mf-read [data-dock-scroll]', '.mf-read .ProseMirror p', '[data-read-dock]')
    await wait(300)
    await shot('read-end')
    report('read mode', seen, end, passing, fr, flat)
    await h.keyboard.press('Escape'); await wait(1200)
  }
  // --- The writing room, from today's page.
  {
    const today = new Date().toLocaleDateString('en-CA')
    await v('notes:day:save', today, { body: { type: 'doc', content } })
    await go('day'); await wait(1200)
    await h.click('[data-room-open]'); await wait(1200)
    const seen = await look('[data-room-foot]')
    await h.mouse.move(600, 400); await h.mouse.move(640, 430); await wait(500)
    const passing = await under('[data-room]', '[data-room] .ProseMirror p', '[data-room-foot]')
    const flat = await flats('[data-room-foot]')
    await wait(300)
    await shot('room')
    const fr = await frames(650, 400)
    const end = await toEnd('[data-room]', '[data-room] .ProseMirror p', '[data-room-foot]')
    report('the writing room', seen, end, passing, fr, flat)
    // Typing, the bar and its blur step away: the foot itself never fades.
    await h.keyboard.type('x'); await wait(700)
    const typing = await h.evaluate(() => { const foot = document.querySelector('[data-room-foot]'); return { foot: getComputedStyle(foot).opacity, layer: getComputedStyle(foot.querySelector('.mf-blur-bar > span')).opacity } })
    check('the writing room: typing, the blur fades by its layers, the foot holding the blur never fades', typing.foot === '1' && typing.layer === '0', JSON.stringify(typing))
    await h.keyboard.press('Backspace')
    await h.keyboard.press('Escape'); await wait(1200)
  }
  // --- Today's page, its writer's line, while writing: the line and its blur come only with writing mode (three words
  // in), never on the caret alone (the user, 15 Nov 2026), so the words are written first.
  {
    await go('inbox'); await go('day'); await wait(1200)
    await h.click('[data-page] [data-day-write] .ProseMirror'); await wait(600)
    await h.keyboard.press('Meta+ArrowDown')
    await h.keyboard.type(' and so the day began ', { delay: 30 }); await wait(900)
    await h.mouse.move(600, 400); await h.mouse.move(640, 430); await wait(900)
    const SCROLL = '[data-pane-card] .overflow-y-auto[data-day-path]'
    const seen = await look('[data-writer-line]')
    const passing = await under(SCROLL, '[data-day-write] .ProseMirror p', '[data-writer-line]')
    const flat = await flats('[data-writer-line]')
    await wait(400)
    await shot('day')
    const fr = await frames(700, 400)
    const end = await toEnd(SCROLL, '[data-day-write] .ProseMirror p, [data-day-path] [data-row]', '[data-writer-line]')
    report('the Journal\'s writer line', seen, end, passing, fr, flat)
    const line = await h.evaluate(() => { const one = document.querySelector('[data-writer-line]'); return { line: getComputedStyle(one).opacity, mask: getComputedStyle(one.closest('body').querySelector('[data-pane-card] .overflow-y-auto[data-day-path]')).maskImage } })
    check('the Journal: the line itself never fades (its words and blur do), and the page under it is not masked away', line.line === '1' && line.mask === 'none', JSON.stringify(line))
    await h.keyboard.press('Escape'); await wait(600)
  }
  check('no page errors', !c.errors.some((one) => one.startsWith('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('the run finishes', false, String(error).slice(0, 400))
} finally {
  await c.close()
  done()
}

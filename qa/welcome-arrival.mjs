// The welcome's arrival as one composed piece: the chord rising under the
// intro's gradient bloom and title card (timed by qa/welcome-intro.mjs), and the
// first words only once it is done, on the beat; the headline resolving a word to a note; a pointer that drags
// across what each kind of app keeps and sets it in italics; Esc or a click
// showing the page whole at once (during the intro too); the bed of sound
// shifting with each page and coming home on the last; reduced motion with
// the words simply there.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-w/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-arrival.mjs [shots folder] [light|dark]
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

delete process.env.QA_ARGS
// Out of the desktop: the main window made see-through for the arrival, as a first run's is (src/main/arrival.ts).
// Every other probe leaves this unset and gets the plain arrival, inside the window.
process.env.HALIGTREE_QA_ARRIVAL = '1'
const TIMING = !!process.env.QA_ARRIVAL_TIMING
const SHOTS = process.argv[2] ?? ''
const THEME = process.argv[3] ?? 'light'
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1440, height: 900, seeded: false })
const { h, errors, close, electron } = c
const WHOLE = [
  'Most notes are written once and never seen again.',
  'Your writing lives in one app.',
  'Your plans live in another.',
  'What you want to remember and practice (flashcards) lives in a third.',
  'In each one, going back is your job. So mostly, nobody does.',
  'Haligtree changes the direction. Instead of asking you to search, it brings your writing, plans, and practice back to you.'
]
const words = () => h.evaluate(() => [...document.querySelectorAll('[data-thesis]')].map((el) => el.innerText.replace(/\s+/g, ' ').trim()))
const heard = () => h.evaluate(() => [...(window.haligtreeHeard ?? [])])
// One look at the page: how much of it can be seen, where the pointer is in its work.
const look = () => h.evaluate(() => {
  const seen = (el) => !!el && Number(getComputedStyle(el).opacity) > 0.05 && getComputedStyle(el).visibility !== 'hidden'
  const spans = [...document.querySelectorAll('.mf-welcome [data-words] span.inline-block')]
  return {
    shown: spans.filter(seen).length,
    words: Number(document.querySelector('[data-thesis="line"]')?.dataset.words ?? 0),
    pointer: seen(document.querySelector('[data-pointer]')),
    selected: [0, 1, 2].map((i) => {
      const mark = document.querySelector(`[data-thesis="gap-${i}"] [data-selected]`)
      return mark ? new DOMMatrix(getComputedStyle(mark).transform === 'none' ? undefined : getComputedStyle(mark).transform).a : -1
    }),
    slant: [0, 1, 2].map((i) => document.querySelector(`[data-thesis="gap-${i}"]`)?.dataset.slant ?? ''),
    asked: (() => { const q = document.querySelector('[data-thesis="question"]'); return !!q && Number(getComputedStyle(q).opacity) > 0.5 })(),
    noted: document.querySelector('[data-margin-note]')?.dataset.marginNote === 'on',
    typed: Number(document.querySelector('[data-thesis="answer"]')?.dataset.typed ?? 0) > 0,
    t: performance.now() - (window.qaIntroAt ?? NaN)
  }
})
try {
  // The page notes when the intro first comes (a watcher put in before it loads), so every time below is from the arrival itself.
  await c.electron.context().addInitScript(() => {
    // The window looked at, as a person's is at a first launch: a parked test window never has the keys, and the
    // mist over the desktop is not drawn on unseen (welcome-mist.tsx).
    document.hasFocus = () => true
    // Every task that held the page 50 ms or more (the browser's own long-task record), for the timing run.
    window.qaLong = []
    new PerformanceObserver((list) => list.getEntries().forEach((one) => window.qaLong.push([one.startTime, one.duration]))).observe({ type: 'longtask', buffered: true })
    new MutationObserver((_, watch) => {
      if (document.querySelector('[data-intro]')) (window.qaIntroAt = performance.now()), watch.disconnect()
    }).observe(document, { childList: true, subtree: true })
  })
  {
    await c.theme(THEME)
    if (!(await h.$('.mf-welcome'))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  }
  await h.waitForSelector('[data-intro]', { timeout: 8000 })
  if (TIMING) {
    // A timing run (QA_ARRIVAL_TIMING=1, under solo --quiet): a first run's own arrival out of the desktop, straight
    // after its page loads, with nothing asked of the page meanwhile. Every frame's gap, by the page's own clock.
    // To the arrival's end: the scene grown to fill the window again and the window a window (no longer see-through).
    await h.waitForFunction(() => { const frames = window.haligtreeArrival?.frames ?? []; return frames.some((one) => one[2] > 1) && !document.documentElement.hasAttribute('data-see-through') }, null, { timeout: 40000, polling: 500 })
    const frames = await h.evaluate(() => window.haligtreeArrival.frames)
    const gaps = frames.slice(1).map((one, i) => ({ at: one[0], ms: one[0] - frames[i][0] }))
    const shapeAt = frames.find((one) => one[2] > 0.5)?.[0] ?? Infinity
    // Each gap over 17 ms with the one after it in brackets: on a 60 Hz display a frame on time can read 18 ms, and then
    // the next reads 15 (the frames' own clock wavers); a frame missed reads 33 ms or more.
    const say = (name, list) => console.log(`${name}: ${list.length} frames, longest ${Math.max(0, ...list.map((one) => one.ms)).toFixed(1)} ms, mean ${(list.reduce((sum, one) => sum + one.ms, 0) / (list.length || 1)).toFixed(2)} ms, over 17 ms: ${list.filter((one) => one.ms > 17).map((one) => `${one.ms.toFixed(1)}@${Math.round(one.at)}(${gaps[gaps.indexOf(one) + 1]?.ms.toFixed(1) ?? '-'})`).join(' ') || 'none'}`)
    // The page's first 0.9 s are its boot (the app itself made, the window taken to the screen's size, the gradient's
    // shaders compiled), inside the arrival's first beat, in which nothing is drawn (welcome-mist.tsx CLEAR_MS) and the
    // fog's coming in is the browser's own (a compositor fade): reported, not held to the bar.
    const BOOT = 900
    say('the page\'s boot (first 0.9 s, nothing drawn for the first 0.35 s)', gaps.filter((one) => one.at < BOOT))
    say('the fog coming in (0.9 to 2.4 s)', gaps.filter((one) => one.at >= BOOT && one.at < 2400))
    say('the fog whole, the spark, its burst and the title coming out of it', gaps.filter((one) => one.at >= 2400 && one.at < shapeAt))
    say('the scene becoming the window, held, and growing to fill it', gaps.filter((one) => one.at >= shapeAt))
    check('the scene became the window and grew again, and the window stands whole', frames.length > 300 && Number.isFinite(shapeAt) && frames.at(-1)[2] === 0, `${frames.length} frames, shaped from ${Math.round(shapeAt)} ms`)
    const after = gaps.filter((one) => one.at >= BOOT)
    // The display's own beat (16.7 ms at 60 Hz, 8.3 at 120), read as the middle gap: a frame missed is a gap of one and
    // a half beats or more, whatever the display; under that, a long gap is the frames' clock wavering, and the next is short.
    const beat = [...after.map((one) => one.ms)].sort((a, b) => a - b)[Math.floor(after.length / 2)] ?? 16.7
    const missed = after.filter((one) => one.ms >= beat * 1.5)
    check('no frame missed after the page\'s first 0.9 s, the whole arrival, at 60 frames a second or more', missed.length === 0 && beat <= 17.2, `the display's beat ${beat.toFixed(1)} ms; longest gap ${Math.max(...after.map((one) => one.ms)).toFixed(1)} ms; missed: ${missed.map((one) => `${one.ms.toFixed(1)}@${Math.round(one.at)}`).join(' ') || 'none'}`)
    // Two gaps in a row are two beats however the clock wavers: the longest pair says whether any frame was late at all.
    const pairs = after.slice(1).map((one, i) => one.ms + after[i].ms)
    console.log(`longest two gaps in a row after 0.9 s: ${Math.max(...pairs).toFixed(1)} ms (two beats: ${(2 * beat).toFixed(1)} ms)`)
    // Nothing done ahead and out of sight while it plays (lib/warm.ts): the browser's own record of tasks of 50 ms or more.
    const long = await h.evaluate(() => (window.qaLong ?? []).filter(([at]) => at > (window.qaIntroAt ?? 0) + 900).map(([at, ms]) => `${Math.round(ms)} ms at ${Math.round(at - window.qaIntroAt)}`))
    check('nothing holds the page 50 ms while it plays: no warm-up, nothing unseen', long.length === 0, long.join(', '))
    const table = await electron.evaluate(() => globalThis.mainStalls?.() ?? null)
    const mine = (table?.rows ?? []).filter((row) => /welcome:(arrive|landed|gather|blur)/.test(row.name)).map((row) => `${row.name} ${row.calls}x worst ${Number(row.worst).toFixed(1)} ms`)
    check('the main process is never held 50 ms by the arrival', mine.length > 0 && (table?.rows ?? []).filter((row) => /welcome:(arrive|landed|gather|blur)/.test(row.name)).every((row) => row.worst < 50), `${mine.join('; ')}; other stalls of 50 ms or more in this run: ${(table?.slow ?? []).map((one) => `${one.name} ${Math.round(one.ms)} ms`).join(', ') || 'none'}`)
    check('no page errors', errors.length === 0, errors.join(' | '))
    await close()
    done()
  }
  const start = Date.now()
  let first = Infinity
  let frame = 0
  const most = [0, 0, 0]
  let pointed = false
  let line = 0
  const when = { slanted: Infinity, asked: Infinity, noted: Infinity, typed: Infinity }
  // Watched for up to 40 seconds (the intro is 22 beats), a frame every ~400ms while shots are wanted.
  while (Date.now() - start < 60000) {
    const now = await look()
    const t = Number.isNaN(now.t) ? Date.now() - start : Math.round(now.t)
    if (now.shown > 0 && first === Infinity) first = t
    if (now.words > 0 && now.words < 9) line = Math.max(line, now.words)
    now.selected.forEach((scale, i) => void (most[i] = Math.max(most[i], scale)))
    pointed ||= now.pointer
    for (const key of ['asked', 'noted', 'typed']) if (now[key] && when[key] === Infinity) when[key] = t
    if (now.slant.every((one) => one === 'on') && when.slanted === Infinity) when.slanted = t
    if (SHOTS && t < 26000) await h.screenshot({ type: 'jpeg', quality: 80, scale: 'css', path: join(SHOTS, `${THEME}-${String(frame++).padStart(2, '0')}-${(t / 1000).toFixed(1)}s.jpg`) }).then(() => h.waitForTimeout(300))
    else await h.waitForTimeout(150)
    if (now.typed) break
  }
  // The last italic has crossed over.
  await h.waitForTimeout(800)
  // The intro is 18 beats at 72 a minute (ARRIVE_MS in sound.ts, 15 s): the first words only after it.
  check('no words before the intro is done: the bloom, the chord and the title card first', first >= 14000, `first words at ${first}ms`)
  check('the first words come by about eighteen seconds', first <= 18000, `first words at ${first}ms`)
  check('the headline resolves a word at a time', line > 0, `seen part-way at ${line} words`)
  const end = await look()
  check('the headline resolves whole', end.words === 9, String(end.words))
  check('a pointer comes to select', pointed)
  check('each line\'s selection grows with the drag to its whole width', most.every((one) => one > 0.95), JSON.stringify(most))
  check('each line ends in italics', end.slant.every((one) => one === 'on'), JSON.stringify(end.slant))
  const italic = await h.evaluate(() => [0, 1, 2].map((i) => [...document.querySelectorAll(`[data-thesis="gap-${i}"] .inline-grid > span`)].filter((el) => getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > 0.5).map((el) => getComputedStyle(el).fontStyle).join()))
  check('then the cause, then the margin note, then the answer typed', when.slanted <= when.asked && when.asked + 1000 <= when.noted && when.noted + 2500 <= when.typed && when.typed < Infinity, JSON.stringify(when))
  check('what each kind keeps shows only in italic, once', italic.every((one) => one === 'italic'), JSON.stringify(italic))
  const sounds = await heard()
  const count = (name) => sounds.filter((one) => one === name).length
  check('the chord rises first', sounds[0] === 'cue:ambience' || sounds.includes('cue:ambience'), sounds.slice(0, 4).join())
  check('the name is said in music: three notes as Haligtree rises', count('bell:title') === 3, String(count('bell:title')))
  check('the first words land on a glass note', count('bell:arrive') === 1)
  // The headline is quiet now: no note a word (it ran up the scale like a lesson).
  check('the headline comes with no note a word', count('bell:word') === 0, String(count('bell:word')))
  check('a press for each selection, a lift for each italic', count('cue:select') === 3 && count('cue:slant') === 3, `${count('cue:select')} ${count('cue:slant')}`)
  check('no typing clicks under the headline', !sounds.slice(0, sounds.indexOf('cue:select')).some((one) => /click/.test(one)), sounds.join())

  // Esc while it plays: the page whole at once.
  await h.keyboard.press('Escape')
  await h.waitForTimeout(700)
  check('Esc shows the whole page, in order', JSON.stringify(await words()) === JSON.stringify(WHOLE), (await words()).join(' | '))

  // Played again, and Esc in the intro: the intro goes and the page is whole, the bed of sound carries on.
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForSelector('[data-intro]', { timeout: 4000 })
  await h.waitForTimeout(1200)
  const before = (await heard()).length
  await h.keyboard.press('Escape')
  await h.waitForTimeout(900)
  check('Esc in the intro shows the whole page at once', JSON.stringify(await words()) === JSON.stringify(WHOLE), (await words()).join(' | '))
  check('and the title card goes', (await h.locator('[data-title-card]').count()) === 0)
  check('and the sound carries on', !(await heard()).slice(before).includes('cue:bed-end'), (await heard()).slice(before).join())
  check('no pointer once settled', (await h.locator('[data-pointer]').count()) === 0)

  check('no header above the headline: the page opens on the problem', await h.evaluate(() => !document.querySelector('.mf-welcome [data-words] [data-tagline]')))
  check('the ruled margin runs down the page', await h.evaluate(() => { const m = document.querySelector('[data-margin]'); return !!m && m.getBoundingClientRect().height > 600 }))

  // A page turned: it lifts away as one page of a book, heard as a page; the margin stays; the bed shifts. Skipped to the end: it comes home.
  const margin = await h.evaluate(() => document.querySelector('[data-margin]')?.getBoundingClientRect().left)
  await h.click('footer button:has-text("Show me")')
  for (let i = 0; i < 6; i++) {
    if (SHOTS) await h.screenshot({ type: 'jpeg', quality: 80, scale: 'css', path: join(SHOTS, `${THEME}-turn-${i}.jpg`) })
    else await h.waitForTimeout(120)
  }
  await h.waitForTimeout(400)
  check('the page turns with a page\'s sound', (await heard()).includes('page-leaf'), (await heard()).slice(-5).join())
  check('the margin carries across to the next page, in the same place', await h.evaluate(() => document.querySelector('[data-margin]')?.getBoundingClientRect().left) === margin)
  check('one page on screen once turned', (await h.locator('.mf-welcome main > section').count()) === 1)
  check('a page turned shifts the sound', (await heard()).includes('cue:bed-shift'))
  await h.click('footer [data-skip]')
  await h.waitForTimeout(800)
  check('the last page resolves the chord', (await heard()).includes('cue:bed-resolve'))
  await h.click('footer [data-skip]')
  await h.waitForTimeout(600)
  check('leaving the welcome fades the sound out', (await heard()).slice(-6).includes('cue:bed-end'))

  // Reduced motion: no title card, no pointer, the words simply there.
  // Once the welcome has really gone (it turns over onto Home): asked again while it goes, it went anyway.
  await h.waitForSelector('.mf-welcome', { state: 'detached', timeout: 8000 }).catch(() => {})
  await h.emulateMedia({ reducedMotion: 'reduce' })
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  // There as soon as the page is: nothing types or resolves (the page itself takes a moment to come up).
  await h.waitForFunction(() => document.querySelectorAll('[data-thesis]').length > 0, null, { timeout: 5000 }).catch(() => {})
  await h.waitForTimeout(150)
  check('reduced motion: no title card', (await h.locator('[data-title-card]').count()) === 0)
  check('reduced motion: the words are there at once', JSON.stringify(await words()) === JSON.stringify(WHOLE), (await words()).join(' | '))
  check('reduced motion: no pointer', (await h.locator('[data-pointer]').count()) === 0)

  // --- Out of the desktop --------------------------------------------------------------------------------------
  {
  // The welcome arriving in a window made see-through for it, as Dia's does: nothing drawn at first, the Mac's own blur
  // and then a fog coming in over the desktop until nothing of it reads, the title in the fog, then the whole scene
  // shrinking into a window about half the screen in its middle (rounded corners, a shadow, the desktop sharp round it),
  // growing from its middle to fill the screen for the first page, the fog its ground.
  const arrival = () => electron.evaluate(() => globalThis.haligtreeArrival?.() ?? null)
  const windowNow = () => electron.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))
    return win ? { bounds: win.getBounds(), shadow: win.hasShadow(), url: win.webContents.getURL() } : null
  })
  // The page captured with nothing behind it, and read for how see-through it is: every pixel's alpha (0 clear, 255 solid).
  // `points` as shares of the width and height; `grid` the mean and least alpha over an n by n grid inside the given margin.
  const alpha = async (points = [], grid = null) => {
    const png = await h.screenshot({ type: 'png', omitBackground: true, scale: 'css' })
    return electron.evaluate(({ nativeImage }, [encoded, points, grid]) => {
      const image = nativeImage.createFromBuffer(Buffer.from(encoded, 'base64'))
      const { width, height } = image.getSize()
      const data = image.toBitmap()
      let most = 0, least = 255, total = 0
      for (let i = 3; i < data.length; i += 4) {
        const a = data[i]
        if (a > most) most = a
        if (a < least) least = a
        total += a
      }
      const read = (x, y) => data[(Math.min(height - 1, Math.max(0, Math.round(y))) * width + Math.min(width - 1, Math.max(0, Math.round(x)))) * 4 + 3]
      const at = points.map(([x, y]) => read(x * (width - 1), y * (height - 1)))
      let inner = null
      if (grid) {
        const seen = []
        for (let i = 0; i < grid.n; i++) for (let j = 0; j < grid.n; j++) seen.push(read((grid.margin + (1 - 2 * grid.margin) * (i / (grid.n - 1))) * (width - 1), (grid.margin + (1 - 2 * grid.margin) * (j / (grid.n - 1))) * (height - 1)))
        inner = { mean: seen.reduce((a, b) => a + b, 0) / seen.length, least: Math.min(...seen) }
      }
      // Along each edge, a pixel in from it, every 8 px: the least alpha found (the window's own corners left to the Mac).
      let edges = 255
      for (let x = 24; x < width - 24; x += 8) edges = Math.min(edges, read(x, 1), read(x, height - 2))
      for (let y = 24; y < height - 24; y += 8) edges = Math.min(edges, read(1, y), read(width - 2, y))
      return { most, least, mean: total / (data.length / 4), at, inner, edges, size: [width, height] }
    }, [png.toString('base64'), points, grid])
  }
  const page = () => h.evaluate(() => {
    const trace = window.haligtreeArrival
    const last = trace?.frames.at(-1)
    const skip = document.querySelector('[data-skip-intro]')
    const name = document.querySelector('[data-title-card] [data-title-name]')
    return { t: last?.[0] ?? -1, amount: last?.[1] ?? 0, box: last ? last.slice(2) : null, landed: !!trace?.landed, clear: document.documentElement.hasAttribute('data-see-through'), mist: !!document.querySelector('[data-welcome-mist="desk"]'), scene: !!document.querySelector('[data-arrival-scene]'), inner: [innerWidth, innerHeight], skip: skip ? Number(getComputedStyle(skip).opacity) : -1, title: !!name && Number(getComputedStyle(name).opacity) > 0.05, words: document.querySelectorAll('[data-thesis]').length }
  })
  // The window looked at, as a person's is: the mist is not drawn on unseen (welcome-mist.tsx).
  const looked = () => h.evaluate(() => { document.hasFocus = () => true; window.dispatchEvent(new Event('focus')) })
  const replay = async (held = false) => {
    await looked()
    await h.evaluate((held) => { document.documentElement.toggleAttribute('data-arrival-hold', held); window.dispatchEvent(new CustomEvent('haligtree:welcome')) }, held)
    await h.waitForFunction(() => !!document.querySelector('[data-thesis], [data-intro]'), null, { timeout: 5000 })
  }
  // A picture stood behind the page for the desktop, so the frames show what a person would see: a busy one, or a plain one.
  const desktop = (kind) => h.evaluate((kind) => {
    document.getElementById('qa-desktop')?.remove()
    if (!kind) return
    const el = document.createElement('div')
    el.id = 'qa-desktop'
    el.style.cssText = `position:fixed;inset:0;z-index:-1;background:${kind === 'busy'
      ? 'repeating-linear-gradient(115deg, rgba(255,255,255,.22) 0 10px, transparent 10px 64px), repeating-linear-gradient(24deg, rgba(0,0,0,.28) 0 5px, transparent 5px 92px), radial-gradient(circle at 78% 64%, #1f6b3a 0 17%, transparent 17.3%), radial-gradient(circle at 21% 28%, #ffd166 0 8%, transparent 8.3%), radial-gradient(circle at 50% 50%, #e63946 0 5%, transparent 5.3%), linear-gradient(180deg, #f78fb3 0%, #b28dff 38%, #4a78b8 62%, #1d3f72 100%)'
      : '#4a78b8'}`
    document.body.prepend(el)
  }, kind)
  // The window the scene becomes: about half the screen, in its middle (welcome.tsx windowScale), and its corner (CORNER).
  const [W, H] = await h.evaluate(() => [innerWidth, innerHeight])
  const SMALL = Math.min(0.8, Math.max(0.5, 720 / W))
  const MIDDLE = [W * (1 - SMALL) / 2, H * (1 - SMALL) / 2, W * SMALL, H * SMALL]
  const CORNER = 14
  const WHOLE_BOX = [0, 0, W, H]
  const near = (box, to, by = 1) => !!box && box.length === 4 && box.every((one, i) => Math.abs(one - to[i]) <= by)

  const made = await arrival()
  check('a first run\'s window is made see-through for the arrival, and its page told to start clear', made?.made === true && /[?&]clear=1/.test((await windowNow())?.url ?? ''), JSON.stringify(made))

  // The plain thing, page side: Reduce motion (just played, above) and the app's own Motion off.
  check('Reduce motion: the window simply there, nothing see-through', !(await page()).clear && (await alpha()).least === 255 && (await arrival())?.clear === false, JSON.stringify(await page()))
  await h.emulateMedia({ reducedMotion: 'no-preference' })
  await h.evaluate(() => (document.documentElement.dataset.motion = 'off'))
  await replay()
  await h.waitForTimeout(300)
  check('Motion off: the window simply there, nothing see-through', !(await page()).clear && (await alpha()).least === 255 && (await arrival())?.clear === false, JSON.stringify(await page()))
  await h.evaluate(() => delete document.documentElement.dataset.motion)

  // The arrival itself, held at its start: the page with nothing drawn.
  const blursBefore = (await arrival())?.blurs?.length ?? 0
  await replay(true)
  await h.waitForSelector('[data-welcome-mist="desk"]', { timeout: 4000 })
  // The window has taken the welcome's size by now (main: whenWelcoming); held, the mist's clock has not started.
  await h.waitForTimeout(400)
  const before = await windowNow()
  const empty = await alpha()
  check('the window is drawn empty at its start: every pixel of the page fully clear', empty.most === 0, JSON.stringify({ most: empty.most, mean: empty.mean }))
  check('and it stands with no shadow, nothing saying a window is there', before?.shadow === false && (await arrival())?.clear === true, JSON.stringify(before))
  check('the unseen page under the fog runs no spark of its own', await h.evaluate(() => document.querySelectorAll('[data-plate] [data-intro-spark]').length === 0))
  await h.evaluate(() => {
    // The moment the first page's words come, by the fog's clock, and where the window stood then.
    window.qaWordsBox = null
    const watch = new MutationObserver(() => {
      if (window.qaWordsBox || !document.querySelector('[data-thesis]')) return
      const at = document.querySelector('[data-arrival-scene]')?.getBoundingClientRect()
      window.qaWordsBox = { t: window.haligtreeArrival?.frames.at(-1)?.[0] ?? -1, box: at ? [at.x, at.y, at.width, at.height] : null }
      watch.disconnect()
    })
    watch.observe(document.body, { childList: true, subtree: true })
    document.documentElement.removeAttribute('data-arrival-hold')
  })
  // The fog's first three seconds read every frame in the page: its amount and the two controls' opacity together.
  const comein = await h.evaluate(() => new Promise((done) => {
    const seen = []
    const from = performance.now()
    const step = () => {
      const last = window.haligtreeArrival?.frames.at(-1)
      const skip = document.querySelector('[data-skip-intro]')
      if (last) seen.push([last[0], last[1], skip ? Number(getComputedStyle(skip).opacity) : -1, skip ? getComputedStyle(skip).backgroundColor : ''])
      if (performance.now() - from < 3200) requestAnimationFrame(step)
      else done(seen)
    }
    requestAnimationFrame(step)
  }))
  const shown = comein.filter((one) => one[2] > 0.05)
  check('"Sound on" and "Skip intro" come in over the fog, never as bare words over the desktop: first seen with the fog at 0.75 or more', shown.length > 0 && shown.every((one) => one[1] >= 0.75), `first seen at ${shown[0]?.[0]}ms with the fog at ${shown[0]?.[1]}`)
  // Opaque in whatever form the browser names it (rgb, oklab): no alpha under one.
  const opaque = (colour) => !!colour && colour !== 'transparent' && !/\/\s*(0|0?\.\d+)\s*\)$/.test(colour) && !/^rgba\(.*,\s*(0|0?\.\d+)\s*\)$/.test(colour)
  check('each on its own opaque ground', shown.length > 0 && opaque(shown.at(-1)[3]), shown.at(-1)?.[3])
  // Followed to its end: the page looked at as often as it can be captured, the fog's own record of every frame kept beside it.
  const curve = []
  let windowLook = null
  const began = Date.now()
  while (Date.now() - began < 24000) {
    // Read before the picture and after it: on a busy machine a capture can take a second, and a look is filed under when it began.
    const was = await page()
    const seen = TIMING ? { mean: 0, at: [], inner: { mean: 0, least: 0 }, edges: 0 } : await alpha([[0.5, 0.5]], { n: 7, margin: 0.06 })
    if (TIMING) await h.waitForTimeout(250)
    const now = await page()
    curve.push({ t: was.t, until: now.t, amount: was.amount, mean: Math.round(seen.mean * 10) / 10, grid: seen.inner, centre: seen.at[0], box: was.box, title: was.title || now.title, words: now.words, clear: now.clear })
    // A close look once the window stands at its size in the middle (watched for every frame once it starts to shrink): its
    // corners, its shadow, the desktop round it.
    if (!windowLook && !TIMING && now.box && now.box[2] < W - 0.5) {
      await h.waitForFunction((want) => { const at = document.querySelector('[data-arrival-scene]')?.getBoundingClientRect(); return !!at && Math.abs(at.width - want) <= 1 }, MIDDLE[2], { timeout: 4000, polling: 'raf' }).catch(() => {})
      const [x, y, w, tall] = MIDDLE
      const at = (px, py) => [px / (W - 1), py / (H - 1)]
      windowLook = await alpha([at(x + w / 2, y + tall / 2), at(x + 0.5, y + 0.5), at(x + CORNER, y + CORNER), at(x * 0.4, H / 2), at(x + w / 2, y + tall + 18)])
    }
    if (!now.clear && now.words > 0 && near(now.box, WHOLE_BOX)) break
  }
  const trace = await h.evaluate(() => window.haligtreeArrival?.frames ?? [])
  const steps = trace.slice(1).map((one, i) => one[0] - trace[i][0])
  if (SHOTS) writeFileSync(join(SHOTS, `${THEME}-curve.json`), JSON.stringify({ curve, trace, steps }))
  console.log(`curve (ms, fog, mean alpha, grid least, window width): ${curve.filter((_, i) => i % 3 === 0).map((one) => `${Math.round(one.t)}:${one.amount}/${one.mean}/${one.grid?.least}/${Math.round(one.box?.[2] ?? 0)}`).join(' ')}`)
  check('the fog comes in from nothing over about two seconds', trace.length > 60 && trace[0][1] === 0 && (trace.find((one) => one[0] >= 350 + 2000)?.[1] ?? 0) >= 0.999 && (trace.find((one) => one[0] >= 1300)?.[1] ?? 1) < 0.9, JSON.stringify(trace.filter((_, i) => i % 20 === 0).slice(0, 8).map((one) => one.slice(0, 2))))
  const blurs = ((await arrival())?.blurs ?? []).slice(blursBefore)
  check('the Mac\'s own blur comes in under the fog as it starts, and goes once the fog is whole over it', blurs.length === 2 && blurs[0].on && !blurs[1].on && blurs[1].at - blurs[0].at >= 1800 && blurs[1].at - blurs[0].at <= 4000, JSON.stringify(blurs))
  // Before the title shows: the fog over the desktop's picture, read off the page itself, nearly whole everywhere.
  const fogged = curve.filter((one) => one.t >= 2600 && !one.title && near(one.box, WHOLE_BOX) && one.words === 0)
  check('before the title shows, nothing of the desktop reads: the fog covers 0.9 or more across the screen', TIMING || (fogged.length >= 2 && fogged.every((one) => one.grid.least >= 0.9 * 255 && one.mean >= 0.9 * 255)), JSON.stringify(fogged.slice(0, 3).map((one) => ({ t: one.t, mean: one.mean, grid: one.grid }))))
  const early = curve.find((one) => one.t >= 2400)
  check('within about two and a half seconds of its start', TIMING || (!!early && early.mean >= 0.9 * 255), JSON.stringify(early && { t: early.t, mean: early.mean }))
  check('what covers the desktop only ever grows while it comes in, read from the page itself', TIMING || !curve.filter((one) => one.t < 2600).some((one, i, all) => i > 0 && one.mean < all[i - 1].mean - 4), curve.filter((one) => one.t < 2600).map((one) => one.mean).join(' '))
  // The scene becoming the window, every frame by the page's own record of where the scene stood.
  const boxes = trace.map((one) => ({ t: one[0], box: one.slice(2) }))
  const from = boxes.findIndex((one, i) => i > 0 && one.box[2] < W - 0.5 && near(boxes[i - 1].box, WHOLE_BOX))
  const least = from < 0 ? -1 : boxes.reduce((best, one, i) => (i >= from && one.box[2] < boxes[best].box[2] ? i : best), from)
  const shrink = from < 0 ? [] : boxes.slice(from - 1, least + 1)
  const widths = shrink.map((one) => one.box[2])
  const jumps = widths.slice(1).map((one, i) => widths[i] - one)
  check('the scene becomes the window: from the whole screen to about half of it, in its middle, within 1 px', from > 0 && near(shrink[0].box, WHOLE_BOX) && near(shrink.at(-1).box, MIDDLE), JSON.stringify({ first: shrink[0]?.box, last: shrink.at(-1)?.box, want: MIDDLE }))
  check('every frame of it only ever shrinking, with no jump', shrink.length > 30 && jumps.every((one) => one >= -0.5) && Math.max(...jumps) <= 0.15 * (W - MIDDLE[2]), `${shrink.length} frames; biggest step ${jumps.length ? Math.max(...jumps).toFixed(1) : '-'} px of ${Math.round(W - MIDDLE[2])}`)
  check('in one motion on the spring, of about a second and a half', shrink.length > 0 && shrink.at(-1).t - shrink[0].t >= 1100 && shrink.at(-1).t - shrink[0].t <= 1900, `${Math.round((shrink.at(-1)?.t ?? 0) - (shrink[0]?.t ?? 0))}ms`)
  check('once the title is written: the hand done, about ten and a half seconds into the fog', from > 0 && boxes[from].t >= 9500 && boxes[from].t <= 12500, `${Math.round(boxes[from]?.t ?? -1)}ms`)
  check('the window it becomes: rounded corners and a shadow, the desktop sharp round it, the fog whole inside', TIMING || (!!windowLook && windowLook.at[0] === 255 && windowLook.at[1] < 128 && windowLook.at[2] === 255 && windowLook.at[3] === 0 && windowLook.at[4] > 8), JSON.stringify(windowLook?.at))
  // Then the window growing from its middle to fill the screen for the first page.
  const grows = least < 0 ? [] : boxes.slice(least)
  const wide = grows.map((one) => one.box[2])
  check('it grows from its middle to fill the screen for the first page, only ever growing', grows.length > 20 && near(grows.at(-1).box, WHOLE_BOX) && wide.slice(1).every((one, i) => one >= wide[i] - 0.5) && grows.every((one) => Math.abs(one.box[0] + one.box[2] / 2 - W / 2) <= 1 && Math.abs(one.box[1] + one.box[3] / 2 - H / 2) <= 1), JSON.stringify({ from: grows[0]?.box, to: grows.at(-1)?.box }))
  const firstWords = await h.evaluate(() => window.qaWordsBox)
  check('whole before the first words come', !!firstWords && near(firstWords.box, WHOLE_BOX), JSON.stringify(firstWords))
  const end = await alpha()
  const stood = await windowNow()
  const after = await page()
  check('the end: the window whole, opaque along every edge, the fog its ground, with its shadow', !after.clear && after.mist && after.scene && end.least === 255 && end.edges === 255 && stood?.shadow === true && (await arrival())?.clear === false, JSON.stringify({ least: end.least, edges: end.edges, after }))
  check('the window itself never moved or changed size on the way (it is drawn inside it, so no window manager can tile it)', JSON.stringify(stood?.bounds) === JSON.stringify(before?.bounds), JSON.stringify({ before: before?.bounds, stood: stood?.bounds }))
  const late = steps.slice(1).filter((one) => one > 20).length
  console.log(`frames: ${steps.length} drawn, longest gap ${Math.max(...steps.slice(1)).toFixed(1)} ms, ${late} over 20 ms (not a timing run unless under solo --quiet)`)
  // The first page left: the fog lifts off the page's own ground, which has come up under it.
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)
  await h.keyboard.press('ArrowRight')
  await h.waitForFunction(() => !document.querySelector('[data-arrival-scene]'), null, { timeout: 4000 }).catch(() => {})
  await h.waitForTimeout(800)
  check('the first page left, the fog lifts and the page\'s own ground is the window\'s', !(await page()).scene && (await alpha()).least === 255 && await h.evaluate(() => Number(getComputedStyle(document.querySelector('[data-plate]')).opacity) === 1), JSON.stringify(await page()))

  // Esc, Enter and a click: straight to the end, whatever part the arrival is at.
  for (const [way, wait] of [['Esc', 'fog'], ['a click', 'fog'], ['Enter', 'window']]) {
    await replay()
    await h.waitForSelector('[data-welcome-mist="desk"]', { timeout: 4000 })
    if (wait === 'fog') await h.waitForTimeout(1500)
    else await h.waitForFunction((want) => { const box = window.haligtreeArrival?.frames.at(-1)?.slice(2); return !!box && Math.abs(box[2] - want) <= 1 }, MIDDLE[2], { timeout: 20000 }).catch(() => {})
    const mid = await page()
    const pressed = Date.now()
    const count = await h.evaluate(() => window.haligtreeArrival?.frames.length ?? 0)
    if (way === 'Esc') await h.keyboard.press('Escape')
    else if (way === 'Enter') await h.keyboard.press('Enter')
    else await h.mouse.click(160, 300)
    await h.waitForFunction(() => !document.documentElement.hasAttribute('data-see-through'), null, { timeout: 4000 }).catch(() => {})
    await h.waitForTimeout(200)
    const took = Date.now() - pressed
    const whole = await alpha()
    const since = await h.evaluate((count) => (window.haligtreeArrival?.frames ?? []).slice(count + 1).map((one) => one.slice(2)), count)
    check(`${way} (${wait === 'fog' ? 'in the fog' : 'with the window in the middle'}) goes straight to the end: the window whole at once, opaque, the fog its ground, with its shadow, the first page whole`, (wait === 'fog' ? near(mid.box, WHOLE_BOX) : near(mid.box, MIDDLE)) && since.length > 0 && since.every((one) => near(one, WHOLE_BOX)) && took < 3000 && whole.least === 255 && (await windowNow())?.shadow === true && (await page()).mist && JSON.stringify(await words()) === JSON.stringify(WHOLE), `${took}ms; box before ${JSON.stringify(mid.box)}; after: ${JSON.stringify(since.slice(0, 2))}; ${JSON.stringify({ least: whole.least })}`)
  }

  // Frames for the eye: the whole arrival over a busy desktop picture and a plain one (qa/welcome-arrival-film.mjs films every frame).
  if (SHOTS && !TIMING) {
    for (const kind of ['busy', 'plain']) {
      await replay(true)
      await h.waitForSelector('[data-welcome-mist="desk"]', { timeout: 4000 })
      await desktop(kind)
      await h.evaluate(() => document.documentElement.removeAttribute('data-arrival-hold'))
      const from = Date.now()
      const files = []
      const shoot = async (label) => {
        const file = `${THEME}-${kind}-${String(files.length).padStart(3, '0')}-${label}.jpg`
        await h.screenshot({ type: 'jpeg', quality: 70, scale: 'css', path: join(SHOTS, file) })
        files.push(file)
      }
      while (Date.now() - from < 24000) {
        const now = await page()
        await shoot(`${Math.max(0, Math.round(now.t))}ms`)
        if (!now.clear && now.words > 0) break
        if (now.t > 3000 && now.t < 9800) await h.waitForTimeout(700)
      }
      await h.waitForTimeout(600)
      await shoot('first-page')
      await desktop(null)
      // The frames side by side, in order, six to a row, for reading by eye: the page draws them onto one picture.
      for (let part = 0; part * 30 < files.length; part++) {
        const tiles = files.slice(part * 30, part * 30 + 30).map((file) => ({ label: file.replace(/^.*-([^-]+)\.jpg$/, '$1'), data: readFileSync(join(SHOTS, file)).toString('base64') }))
        const sheet = await h.evaluate(async (tiles) => {
          const pictures = []
          for (const one of tiles) { const picture = new Image(); picture.src = `data:image/jpeg;base64,${one.data}`; await picture.decode(); pictures.push(picture) }
          const width = 480
          const height = Math.round(width * pictures[0].naturalHeight / pictures[0].naturalWidth)
          const canvas = document.createElement('canvas')
          canvas.width = 6 * width
          canvas.height = Math.ceil(tiles.length / 6) * height
          const ctx = canvas.getContext('2d')
          pictures.forEach((picture, i) => {
            const x = (i % 6) * width, y = Math.floor(i / 6) * height
            ctx.drawImage(picture, x, y, width, height)
            ctx.fillStyle = 'rgba(0,0,0,0.75)'
            ctx.fillRect(x, y, 104, 24)
            ctx.fillStyle = 'white'
            ctx.font = '15px ui-monospace, monospace'
            ctx.fillText(tiles[i].label, x + 6, y + 17)
          })
          return canvas.toDataURL('image/jpeg', 0.82).split(',')[1]
        }, tiles).catch((error) => (console.log(`(no sheet: ${error.message})`), null))
        if (sheet) writeFileSync(join(SHOTS, `sheet-${THEME}-${kind}-${part + 1}.jpg`), Buffer.from(sheet, 'base64'))
      }
    }
  }
  }
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()

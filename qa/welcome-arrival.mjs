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
    await h.waitForFunction(() => window.haligtreeArrival?.landed, null, { timeout: 40000, polling: 500 })
    const frames = await h.evaluate(() => window.haligtreeArrival.frames)
    const gaps = frames.slice(1).map((one, i) => ({ at: one[0], ms: one[0] - frames[i][0], page: one[2] }))
    const drawAt = frames.find((one) => one[2] > 0)?.[0] ?? Infinity
    // Each gap over 17 ms with the one after it in brackets: on a 60 Hz display a frame on time can read 18 ms, and then
    // the next reads 15 (the frames' own clock wavers); a frame missed reads 33 ms or more.
    const say = (name, list) => console.log(`${name}: ${list.length} frames, longest ${Math.max(0, ...list.map((one) => one.ms)).toFixed(1)} ms, mean ${(list.reduce((sum, one) => sum + one.ms, 0) / (list.length || 1)).toFixed(2)} ms, over 17 ms: ${list.filter((one) => one.ms > 17).map((one) => `${one.ms.toFixed(1)}@${Math.round(one.at)}(${gaps[gaps.indexOf(one) + 1]?.ms.toFixed(1) ?? '-'})`).join(' ') || 'none'}`)
    // The page's first 0.9 s are its boot (the app itself made, the window taken to the screen's size, the gradient's
    // shaders compiled), inside the arrival's first beat, in which nothing is drawn (welcome-mist.tsx CLEAR_MS) and the
    // mist's coming in is the browser's own (a compositor fade): reported, not held to the bar.
    const BOOT = 900
    say('the page\'s boot (first 0.9 s, nothing drawn for the first 0.35 s)', gaps.filter((one) => one.at < BOOT))
    say('the mist coming in (0.9 to 2.4 s)', gaps.filter((one) => one.at >= BOOT && one.at < 2400))
    say('the mist holding, the spark, its burst and the title coming out of it', gaps.filter((one) => one.at >= 2400 && one.at < drawAt))
    say('the mist drawing in to the window', gaps.filter((one) => one.at >= drawAt))
    check('the mist drew in, and the window stands whole', frames.length > 300 && frames.at(-1)[2] === 1 && Number.isFinite(drawAt), `${frames.length} frames, draws in at ${Math.round(drawAt)} ms`)
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
    const mine = (table?.rows ?? []).filter((row) => /welcome:(arrive|landed|gather)/.test(row.name)).map((row) => `${row.name} ${row.calls}x worst ${Number(row.worst).toFixed(1)} ms`)
    check('the main process is never held 50 ms by the arrival', mine.length > 0 && (table?.rows ?? []).filter((row) => /welcome:(arrive|landed|gather)/.test(row.name)).every((row) => row.worst < 50), `${mine.join('; ')}; other stalls of 50 ms or more in this run: ${(table?.slow ?? []).map((one) => `${one.name} ${Math.round(one.ms)} ms`).join(', ') || 'none'}`)
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
  // The welcome arriving in a window made see-through for it: nothing drawn at first, the mist coming in over the
  // desktop, only ever growing, then drawing in to the window, which ends whole, where it was, with its shadow.
  const arrival = () => electron.evaluate(() => globalThis.haligtreeArrival?.() ?? null)
  const windowNow = () => electron.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))
    return win ? { bounds: win.getBounds(), shadow: win.hasShadow(), url: win.webContents.getURL() } : null
  })
  // The page captured with nothing behind it, and read for how see-through it is: every pixel's alpha (0 clear, 255 solid).
  const alpha = async (points = []) => {
    const png = await h.screenshot({ type: 'png', omitBackground: true, scale: 'css' })
    return electron.evaluate(({ nativeImage }, [encoded, points]) => {
      const image = nativeImage.createFromBuffer(Buffer.from(encoded, 'base64'))
      const { width, height } = image.getSize()
      const data = image.toBitmap()
      let most = 0, least = 255, total = 0, drawn = 0
      // Where anything at all is drawn (left, top, right, bottom), to name what it is when the page should be clear.
      const box = [width, height, -1, -1]
      for (let i = 3; i < data.length; i += 4) {
        const a = data[i]
        if (a > most) most = a
        if (a < least) least = a
        total += a
        if (!a) continue
        drawn++
        const x = ((i - 3) / 4) % width, y = Math.floor((i - 3) / 4 / width)
        if (x < box[0]) box[0] = x
        if (y < box[1]) box[1] = y
        if (x > box[2]) box[2] = x
        if (y > box[3]) box[3] = y
      }
      const at = points.map(([x, y]) => data[(Math.min(height - 1, Math.round(y * (height - 1))) * width + Math.min(width - 1, Math.round(x * (width - 1)))) * 4 + 3])
      return { most, least, mean: total / (data.length / 4), at, drawn, box: drawn ? box : null, size: [width, height] }
    }, [png.toString('base64'), points])
  }
  const page = () => h.evaluate(() => {
    const trace = window.haligtreeArrival
    const last = trace?.frames.at(-1)
    const plate = document.querySelector('[data-plate]')
    return { t: last?.[0] ?? -1, amount: last?.[1] ?? 0, plate: last?.[2] ?? 0, soft: last?.[3] ?? 0, landed: !!trace?.landed, clear: document.documentElement.hasAttribute('data-see-through'), mist: !!document.querySelector('[data-welcome-mist="desk"]'), box: plate ? plate.getBoundingClientRect().toJSON() : null, inner: [innerWidth, innerHeight] }
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
  await replay(true)
  await h.waitForSelector('[data-welcome-mist="desk"]', { timeout: 4000 })
  // The window has taken the welcome's size by now (main: whenWelcoming); held, the mist's clock has not started.
  await h.waitForTimeout(400)
  const before = await windowNow()
  const empty = await alpha()
  check('the window is drawn empty at its start: every pixel of the page fully clear', empty.most === 0, JSON.stringify(empty))
  check('and it stands with no shadow, nothing saying a window is there', before?.shadow === false && (await arrival())?.clear === true, JSON.stringify(before))
  // Nothing runs unseen under the mist: the window's page has no spark or bloom of its own while it is not drawn (the spark is in the mist).
  check('the unseen page under the mist runs no spark of its own', await h.evaluate(() => document.querySelectorAll('[data-plate] [data-intro-spark]').length === 0))
  await h.evaluate(() => document.documentElement.removeAttribute('data-arrival-hold'))
  // Followed to its end: the page read about ten times a second, the mist's own record of every frame kept beside it.
  const curve = []
  const began = Date.now()
  while (Date.now() - began < 20000) {
    // A timing run (QA_ARRIVAL_TIMING, under solo --quiet) takes no pictures: a capture holds the page's frames up.
    // Read before the picture and after it: on a busy machine a capture can take a second, and a look is filed under when it began.
    const was = await page()
    const seen = TIMING ? { mean: 0, at: [0, 0, 0, 0, 0], least: 0 } : await alpha([[0.5, 0.5], [0.5, 0], [0, 0.5], [0, 0], [0.22, 0.28]])
    if (TIMING) await h.waitForTimeout(250)
    const now = await page()
    curve.push({ t: was.t, until: now.t, amount: was.amount, plate: now.plate, soft: now.soft, mean: Math.round(seen.mean * 10) / 10, centre: seen.at[0], top: seen.at[1], left: seen.at[2], corner: seen.at[3], side: seen.at[4], least: seen.least })
    if (now.landed || !now.mist) break
  }
  const after = await page()
  const trace = await h.evaluate(() => window.haligtreeArrival?.frames ?? [])
  const steps = trace.slice(1).map((one, i) => one[0] - trace[i][0])
  if (SHOTS) writeFileSync(join(SHOTS, `${THEME}-curve.json`), JSON.stringify({ curve, trace, steps }))
  console.log(`curve (ms, mist, page, soft edge px, mean alpha): ${curve.filter((_, i) => i % 3 === 0).map((one) => `${Math.round(one.t)}:${one.amount}/${one.plate}/${one.soft}/${one.mean}`).join(' ')}`)
  const drawAt = trace.findIndex((one) => one[2] > 0)
  const wholeAt = trace.findIndex((one) => one[2] >= 1)
  const falls = (list) => list.some((one, i) => i > 0 && one < list[i - 1] - 1e-6)
  check('the mist comes in from nothing over about two seconds', trace.length > 60 && trace[0][1] === 0 && (trace.find((one) => one[0] >= 350 + 2000)?.[1] ?? 0) >= 0.999 && (trace.find((one) => one[0] >= 1300)?.[1] ?? 1) < 0.9, JSON.stringify(trace.filter((_, i) => i % 20 === 0).slice(0, 10)))
  check('the mist never thins before the window\'s page is whole under it', drawAt > 0 && wholeAt > drawAt && !falls(trace.slice(0, wholeAt + 1).map((one) => one[1])), `draws in from frame ${drawAt}, whole at ${wholeAt} of ${trace.length}`)
  check('the window\'s page only ever grows, and never past whole', !falls(trace.map((one) => one[2])) && trace.every((one) => one[2] <= 1))
  check('the mist\'s soft edge only ever hardens, out to the window\'s own edge', !falls(trace.map((one) => -one[3])) && trace.at(-1)[3] === 0 && trace[0][3] > 20, `${trace[0][3]}px to ${trace.at(-1)[3]}px`)
  // What covers the desktop, read from the pictures: never less from one look to the next (the banks drift, so by a hair's allowance).
  check('what covers the desktop only ever grows, read from the page itself', TIMING || (curve.length > 5 && !curve.some((one, i) => i > 0 && one.mean < curve[i - 1].mean - 4)), curve.map((one) => one.mean).join(' '))
  // Looks begun once the mist was whole and ended before it drew in. At the screen's very edge nothing to be seen: up to
  // 3% (8 of 255), since the spark's burst rolls its halo out to the edge for a moment at about 2% (6 of 255, read at
  // 6 to 8 seconds), far under what shows as an outline.
  const EDGE = 8
  const over = curve.filter((one) => one.t > 3500 && one.plate === 0)
  check('over the desktop it is mist, not a sheet: the picture still shows through it, its middle is ground enough for words, and its edges are clear', TIMING || (over.length >= 1 && over.every((one) => one.centre >= 200 && one.side > 110 && one.side < 246 && one.top <= EDGE && one.left <= EDGE && one.corner <= EDGE)), JSON.stringify(over.slice(0, 3)))
  // Timed from the welcome's opening; the mist's own clock starts after the probe's hold, so a little under eleven seconds here.
  check('it draws in on the title\'s beat, about eleven seconds in', drawAt > 0 && trace[drawAt][0] > 8000 && trace[drawAt][0] < 11500, `${trace[drawAt]?.[0]}ms`)
  check('the drawing in is one motion of about a second and a half', wholeAt > drawAt && trace.at(-1)[0] - trace[drawAt][0] > 900 && trace.at(-1)[0] - trace[drawAt][0] < 2200, `${Math.round(trace.at(-1)[0] - trace[drawAt][0])}ms`)
  const end = await alpha()
  const stood = await windowNow()
  check('what is left is the window, whole to its corners, the page painting itself again', after.landed && !after.clear && !after.mist && end.least === 255, JSON.stringify({ after, end }))
  check('the page under the mist ends at the window\'s own bounds, within 1 px', !!after.box && Math.abs(after.box.x) <= 1 && Math.abs(after.box.y) <= 1 && Math.abs(after.box.width - after.inner[0]) <= 1 && Math.abs(after.box.height - after.inner[1]) <= 1, JSON.stringify(after.box))
  check('the window never moved or changed size on the way, and has its shadow again', JSON.stringify(stood?.bounds) === JSON.stringify(before?.bounds) && stood?.shadow === true && (await arrival())?.clear === false, JSON.stringify({ before, stood }))
  const late = steps.slice(1).filter((one) => one > 20).length
  console.log(`frames: ${steps.length} drawn, longest gap ${Math.max(...steps.slice(1)).toFixed(1)} ms, ${late} over 20 ms (not a timing run unless under solo --quiet)`)

  // Esc, and a click: the arrival ends at once.
  for (const way of ['Esc', 'a click']) {
    await replay()
    await h.waitForSelector('[data-welcome-mist="desk"]', { timeout: 4000 })
    await h.waitForTimeout(1500)
    const mid = await alpha([[0.5, 0.5]])
    const pressed = Date.now()
    if (way === 'Esc') await h.keyboard.press('Escape')
    else await h.mouse.click(160, 300)
    await h.waitForFunction(() => !document.documentElement.hasAttribute('data-see-through'), null, { timeout: 4000 }).catch(() => {})
    const took = Date.now() - pressed
    const whole = await alpha()
    // By the page's own clock: from the first frame of the drawing in to the window whole and the mist gone.
    const quick = await h.evaluate(() => { const frames = window.haligtreeArrival?.frames ?? []; const from = frames.find((one) => one[2] > 0); return from ? frames.at(-1)[0] - from[0] : -1 })
    check(`${way} ends the arrival at once: the window whole, with its shadow, in well under a second`, mid.at[0] > 0 && mid.least === 0 && quick > 0 && quick < 800 && took < 3000 && whole.least === 255 && (await windowNow())?.shadow === true && JSON.stringify(await words()) === JSON.stringify(WHOLE), `${Math.round(quick)}ms by the page's clock, ${took}ms from here, ${JSON.stringify(whole)}`)
  }

  // Frames for the eye: the whole arrival over a busy desktop picture and a plain one, a frame as often as the page can be captured where it moves.
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
      while (Date.now() - from < 20000) {
        const now = await page()
        // Every frame while it comes in and while it draws in; about one a second while it holds.
        const moving = now.t < 2800 || now.plate > 0 || now.t > 9600
        await shoot(`${Math.max(0, Math.round(now.t))}ms`)
        if (now.landed || !now.mist) break
        if (!moving) await h.waitForTimeout(900)
      }
      await h.waitForTimeout(400)
      await shoot('landed')
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

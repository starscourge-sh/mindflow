// Batch P: the reader card's row in Settings stays put under the pointer; "Copy as image" eases the book round to
// flat before its picture is taken (no snap), then eases back; the download drawing plays once per hover, not on a
// loop. Pictures of the card in light and dark with the sandbox's one-line `both()`.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-p/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox [SHOTS=<dir>] node qa/batch-p.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await c.go('settings')
  await h.locator('[data-reader-card]').scrollIntoViewIfNeeded(); await wait(1200)
  // Where everything in the row is: its words, the book's place, the buttons.
  const places = () => h.evaluate(() => {
    const row = document.querySelector('[data-setting-title="Reader card"]')
    const at = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)].join(',') }
    return { row: at(row), words: at(row.querySelector('.text-body')), hold: at(row.querySelector('[data-reader-hold]')), buttons: at(row.querySelector('[data-reader-copy]').parentElement.parentElement) }
  })
  const before = await places()
  const hold = await h.locator('[data-reader-hold]').boundingBox()
  const moved = []
  for (const [x, y] of [[hold.x + hold.width / 2, hold.y + hold.height / 2], [hold.x + hold.width * 0.9, hold.y + 10], [hold.x - 300, hold.y + 40]]) {
    await h.mouse.move(x, y, { steps: 6 }); await wait(700)
    const now = await places()
    for (const key of Object.keys(now)) if (now[key] !== before[key]) moved.push(`${key} ${before[key]} → ${now[key]}`)
  }
  for (const one of ['[data-reader-copy]', '[data-reader-save]', '[data-reader-randomize]']) {
    await h.locator(one).hover(); await wait(600)
    const now = await places()
    for (const key of Object.keys(now)) if (now[key] !== before[key]) moved.push(`${one} ${key} ${before[key]} → ${now[key]}`)
  }
  check('the reader card row stays put while the pointer is over it, the book or its buttons', moved.length === 0, moved.join('; ') || JSON.stringify(before))

  // The download drawing: hovered and held there, it plays once and is still after.
  await h.mouse.move(10, 10); await wait(500)
  await h.locator('[data-reader-save]').hover()
  const arrow = () => h.evaluate(() => getComputedStyle(document.querySelector('[data-reader-save] .arrow-stem')).transform)
  await wait(1200)
  const frames = []
  for (let i = 0; i < 12; i++) (frames.push(await arrow()), await wait(80))
  check('the download drawing plays once per hover, then is still', new Set(frames).size === 1, [...new Set(frames)].join(' | '))
  await h.mouse.move(10, 10); await wait(1500)

  // "Copy as image": the book's turn read every frame from the press: it eases, no frame jumps more than a few degrees.
  const angle = 'const m = new DOMMatrix(getComputedStyle(document.querySelector("[data-reader-card]").parentElement).transform); return Math.atan2(m.m31, m.m33) * 180 / Math.PI'
  const rest = await h.evaluate((a) => new Function(a)(), angle)
  const watching = h.evaluate((a) => new Promise((done) => {
    const read = new Function(a); const out = []; const start = performance.now()
    const step = () => (out.push([performance.now() - start, read()]), performance.now() - start < 1200 ? requestAnimationFrame(step) : done(out))
    requestAnimationFrame(step)
  }), angle)
  await h.locator('[data-reader-copy]').evaluate((one) => one.click())
  const turns = await watching

  // Timed, not by frame: a busy machine drops frames, so a step per frame says little. Snapped, it was flat in one frame.
  const flatAt = turns.find(([, one]) => Math.abs(one) < 0.5)?.[0] ?? -1
  check('"Copy as image" eases the book flat, no snap', Math.abs(rest) > 20 && flatAt >= 250, `rest ${rest.toFixed(1)}°, flat after ${Math.round(flatAt)}ms`)
  await wait(2500)
  const back = await h.evaluate((a) => new Function(a)(), angle)
  check('and eases back into its pose after', Math.abs(back - rest) < 3, `${back.toFixed(1)}° / ${rest.toFixed(1)}°`)

  // The Feed: the line from a post's picture down into the thought hung under it meets it, for every kind of post.
  await c.go('feed'); await wait(1500)
  for (let i = 0; i < 6; i++) (await h.mouse.wheel(0, 2000), await wait(400))
  await h.evaluate(() => document.querySelector('[data-feed-hanging]')?.scrollIntoView({ block: 'center' })); await wait(800)
  const joins = await h.evaluate(() => [...document.querySelectorAll('[data-feed-hanging]')].map((hanging) => {
    const post = hanging.closest('[data-feed-post]')
    const line = post.querySelector(':scope > div .w-px.flex-1')?.getBoundingClientRect()
    const bend = hanging.querySelector('[data-feed-bend]').getBoundingClientRect(), tip = hanging.querySelector('[data-feed-bend-end]').getBoundingClientRect(), svg = { top: bend.top, left: bend.left, bottom: bend.bottom, right: tip.right }
    const latest = hanging.querySelector('[data-feed-latest]')
    const first = latest.getBoundingClientRect()
    const lineHeight = parseFloat(getComputedStyle(latest).lineHeight)
    const r = (n) => Math.round(n * 10) / 10
    return { kind: post.dataset.feedPost, quote: !!post.querySelector('[data-feed-quote]'), gapDown: line ? r(svg.top - line.bottom) : null, across: line ? r(svg.left - line.left) : null, toWords: r(svg.bottom - 0.5 - (first.top + lineHeight / 2)), end: r(first.left - svg.right) }
  }))
  const off = joins.filter((one) => one.gapDown === null || Math.abs(one.gapDown) > 1 || Math.abs(one.across) > 1 || Math.abs(one.toWords) > 1.5 || one.end < 0 || one.end > 6)
  check('the Feed\'s thread line meets the thought under every post', joins.length > 0 && off.length === 0, JSON.stringify(off.length ? off : joins).slice(0, 380))
  if (process.env.SHOTS) await c.both(`${process.env.SHOTS}/feed-hang`, h.locator('[data-feed-post]:has([data-feed-hanging])').first())

  // The Map's key: two groups, each on one line of its own, never broken in the middle.
  await c.size(1440, 900)
  await c.go('map'); await wait(2500)
  const key = await h.evaluate(() => [...document.querySelectorAll('[data-map-key] [data-map-key-group]')].map((group) => ({ label: group.dataset.mapKeyGroup, tops: [...new Set([...group.querySelectorAll(':scope > div > span')].map((one) => Math.round(one.getBoundingClientRect().top)))].length, items: group.querySelectorAll(':scope > div > span').length })))
  check('the Map key shows its two groups, each on one line', key.length === 2 && key.every((one) => one.tops <= 1), JSON.stringify(key))
  if (process.env.SHOTS) await c.both(`${process.env.SHOTS}/map-key`, h.locator('[data-map-foot]'))
  await c.size(1300, 900)

  // Media > Audio: the waveform mark moves while a recording plays, and is still when paused.
  await c.go('media'); await wait(1200)
  await h.locator('button, [role="tab"]').filter({ hasText: /^Audio$/ }).first().click().catch(() => {}); await wait(800)
  if (await h.locator('[data-media-play]').count()) {
    const wave = () => h.evaluate(() => [...document.querySelectorAll('[data-media-wave] line')].map((one) => one.getAttribute('transform') ?? '').join('|'))
    await h.locator('[data-media-play]').first().click(); await wait(800)
    const moving = []
    for (let i = 0; i < 8; i++) (moving.push(await wave()), await wait(90))
    await h.locator('[data-media-play]').first().click(); await wait(400)
    const paused = await wave()
    check('the audio tile\'s waveform moves with the sound, still when paused', new Set(moving).size > 3 && paused.replace(/\|/g, '') === '', `${new Set(moving).size} shapes; paused "${paused}"`)
  } else console.log('NOTE  no recording in the sandbox: the moving waveform is not checked here')

  if (process.env.SHOTS) {
    await c.go('settings'); await h.locator('[data-reader-card]').scrollIntoViewIfNeeded(); await wait(1500)
    const box = await h.locator('[data-setting-title="Reader card"]').boundingBox()
    const area = { screenshot: (o) => h.screenshot({ ...o, clip: { x: box.x - 20, y: box.y - 20, width: box.width + 40, height: box.height + 60 } }) }
    await c.both(`${process.env.SHOTS}/reader-card`, area)
    // The dark one really is dark: the light themes' class is gone from the page.
    await c.look('dark')
    const dark = await h.evaluate(() => [...document.documentElement.classList].join(' '))
    await c.look('light')
    check('`look("dark")` switches the theme', !/\b(paper|light)\b/.test(dark), dark)
  }
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  check('no page errors', c.errors.length === 0, c.errors.join('\n'))
  await c.close()
  done()
}

// Read mode's "Add a thought…" bar never goes see-through: it floats over the page's last words, so while the
// page settles to quiet (the pointer still for 1.8s) the bar itself keeps its whole fill, and only what it holds
// goes quiet. Sampled every 50ms through the settle and the wake. And the band under a docked bar is the page's
// colour, whole at the very foot.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/read-opaque.mjs
//   SHOTS=dir keeps frames of the settle, light and dark.
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 840 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
// What shows at the bar's own height with the bar itself taken away, the words scrolled under it: the widest step
// between any two pixels of the band from the bar's top edge to its foot (0 is one flat colour, the page's). Words
// showing beside the bar or under it, however faintly, are steps. 16px in from each side, clear of the corners.
const bare = async () => {
  const clip = await h.evaluate(() => {
    const bar = document.querySelector('.mf-read [data-read-dock]')
    for (const one of bar.children) if (!one.classList.contains('mf-blur-edge')) one.style.visibility = 'hidden'
    const r = bar.getBoundingClientRect()
    return { x: Math.ceil(r.left) + 16, y: Math.ceil(r.top) + 1, width: Math.floor(r.width) - 32, height: Math.floor(r.height) - 16 }
  })
  await wait(150)
  const png = await h.screenshot({ clip })
  await h.evaluate(() => { for (const one of document.querySelector('.mf-read [data-read-dock]').children) one.style.visibility = '' })
  return electron.evaluate(({ nativeImage }, b64) => {
    const bits = nativeImage.createFromBuffer(Buffer.from(b64, 'base64')).toBitmap()
    const lo = [255, 255, 255], hi = [0, 0, 0]
    for (let i = 0; i < bits.length; i += 4) for (let k = 0; k < 3; k++) { if (bits[i + k] < lo[k]) lo[k] = bits[i + k]; if (bits[i + k] > hi[k]) hi[k] = bits[i + k] }
    return Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
  }, png.toString('base64'))
}
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const body = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'A long read' }] }, ...Array.from({ length: 80 }, (_, n) => p(`Line ${n + 1}: SageMaker has R support, but for production serving, containerisation is the norm, and these words must never read through a bar.`))] }
// How much of what is behind the bar shows through it: 1 is none. Its own fill's alpha times every opacity round it.
const whole = () => h.evaluate(() => {
  const card = document.querySelector('.mf-read [data-composer] .group\\/composer')
  if (!card) return null
  let through = 1
  for (let at = card; at && at !== document.documentElement; at = at.parentElement) through *= Number(getComputedStyle(at).opacity)
  const fill = getComputedStyle(card).backgroundColor
  const alpha = (/^rgba\(.*,\s*([\d.]+)\)$/.exec(fill) ?? /\/\s*([\d.]+)\)$/.exec(fill))?.[1]
  const quiet = Number(getComputedStyle(card.lastElementChild).opacity)
  return { through, alpha: fill === 'transparent' ? 0 : alpha === undefined ? 1 : Number(alpha), quiet, awake: document.querySelector('.mf-read').hasAttribute('data-awake') }
})
try {
  await v('settings:set', { sounds: false, hintRate: 0, safeMode: false })
  await h.evaluate(() => localStorage.setItem('readExitTold', '9'))
  const id = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), body)
  await c.send('capture', id); await wait(1500)
  for (const theme of ['dark', 'light']) {
    await c.look(theme)
    await h.locator('[data-pane] button[aria-label="Read"]').first().click(); await wait(900)
    const reading = h.locator('.mf-read')
    check(`${theme}: read mode opens with its bar`, (await reading.count()) === 1 && (await h.locator('.mf-read [data-composer]').count()) === 1)
    // Scrolled so words lie under the bar, the pointer moved (awake), then left still.
    await h.mouse.move(640, 400); await h.mouse.wheel(0, 900); await wait(500)
    // Words lie under the bar now. Nothing of them reads at its height, beside it or under it.
    const step = await bare()
    check(`${theme}: nothing reads at the bar's own height, beside it or under it (the band there is one flat colour)`, step <= 3, `widest step between two pixels: ${step}`)
    await h.mouse.move(650, 410)
    const frames = []
    for (let n = 0; n < 60; n++) {
      frames.push(await whole())
      if (process.env.SHOTS && n % 6 === 0) await h.screenshot({ path: `${process.env.SHOTS}/read-opaque-${theme}-${String(n).padStart(2, '0')}.png`, clip: { x: 200, y: 640, width: 880, height: 200 } })
      await wait(50)
    }
    const slept = frames.some((one) => one && !one.awake)
    check(`${theme}: the page settles while the pointer is still`, slept, JSON.stringify(frames.at(-1)))
    const least = Math.min(...frames.map((one) => (one ? one.through * one.alpha : 0)))
    check(`${theme}: the bar keeps its whole fill through every frame of the settle (60 frames, 50ms apart)`, least === 1, `least ${least}`)
    check(`${theme}: settled, what the bar holds is a step quieter`, frames.at(-1)?.quiet < 1, JSON.stringify(frames.at(-1)))
    await h.mouse.move(700, 300); await wait(400)
    const woke = await whole()
    check(`${theme}: the pointer moves and what it holds is back at full strength, the bar still whole`, woke?.quiet === 1 && woke.through * woke.alpha === 1, JSON.stringify(woke))
    // The band under the bar: the wash at the dock's very foot is the page's colour, whole.
    const foot = await h.evaluate(() => {
      const edge = document.querySelector('.mf-read [data-read-dock] > .mf-blur-bar')
      const wash = edge && getComputedStyle(edge, '::before').backgroundImage
      const first = wash && /linear-gradient\(to top,\s*((?:rgba?|oklab|oklch|color)\([^)]*\)|[a-z]+)/.exec(wash)?.[1]
      return { first, page: getComputedStyle(document.querySelector('.mf-read')).backgroundColor }
    })
    check(`${theme}: the band under the bar starts as the page's own colour, whole`, !!foot.first && !/[,/]\s*0?\.\d+\)/.test(foot.first), JSON.stringify(foot))
    await h.keyboard.press('Escape'); await wait(700)
    check(`${theme}: Esc leaves read mode`, (await reading.count()) === 0)
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally { await c.close() }
done()

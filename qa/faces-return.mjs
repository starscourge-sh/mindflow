// Back on Sources, every face is already framed on its face in the first frame it is drawn: no frame cut from the
// picture's middle before it moves (10 Nov: "every time i leave and return to this page, the images recenter").
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/faces-return.mjs
import { readFileSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  for (let i = 0; i < 60 && (await h.evaluate(() => document.body.innerText.includes('Setting out the examples'))); i++) await wait(500)
  const lisa = await h.evaluate(([name, bytes]) => window.api.saveFile(name, new Uint8Array(bytes)), ['mona-lisa.webp', Array.from(readFileSync(new URL('../src/renderer/src/assets/sandbox/mona-lisa.webp', import.meta.url)))])
  await v('people:set', 'Lisa Gherardini', lisa)
  await h.evaluate(() => window.api.captures.create({ kind: 'quote', attribution: 'Lisa Gherardini', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Patience is a virtue.' }] }] } }))
  await go('sources'); await wait(2500)
  for (const round of [1, 2, 3]) {
    await go('home'); await wait(800)
    // Each stored picture's place, the first frame it is in the page.
    await h.evaluate(() => {
      window.__firstPlace = new Map(); window.__n = 0
      // Read after the frame is drawn (a timer after the frame's own work), so the app's own placing that frame counts.
      const look = () => setTimeout(() => {
        for (const img of document.querySelectorAll('img')) if (/assets\//.test(img.src) && getComputedStyle(img).objectFit === 'cover' && img.complete && img.naturalWidth && !img.dataset.qaFirst) { img.dataset.qaFirst = String(++window.__n); window.__firstPlace.set(img.dataset.qaFirst, [img.src, getComputedStyle(img).objectPosition]) }
        if (performance.now() < window.__until) requestAnimationFrame(look)
      }, 0)
      window.__until = performance.now() + 2500
      requestAnimationFrame(look)
    })
    await go('sources'); await wait(2800)
    const seen = await h.evaluate(() => [...window.__firstPlace.entries()].flatMap(([key, [src, at]]) => { const img = document.querySelector(`img[data-qa-first="${key}"]`); return img ? [{ src: src.slice(-12), at, now: getComputedStyle(img).objectPosition, cls: img.className.slice(0, 60) }] : [] }))
    const moved = seen.filter((one) => one.at !== one.now)
    check(`return ${round}: every face is drawn where it settles from its first frame`, seen.length > 0 && !moved.length, JSON.stringify({ n: seen.length, moved: moved.slice(0, 3) }))
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally { await c.close() }
done()

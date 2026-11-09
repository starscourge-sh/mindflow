// Quick capture's "New capture" over a written draft: the draft crumples as the Bin's paper does (React Bits'
// PaperCrumple on the shared stage, `crumpleAway`), fades where it was, and the box is left empty with
// "Draft cleared" and its Undo. The old hand-drawn CSS crumple is gone.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-clear-crumple.mjs
// QA_FRAMES=<folder> keeps a frame every 60ms through the crumple.
import { mkdirSync, writeFileSync } from 'node:fs'
import { checks, open } from './harness.mjs'

const { check, done } = checks()
const box = await open()
const h = box.page
const wait = (ms) => h.waitForTimeout(ms)
const frames = process.env.QA_FRAMES
if (frames) mkdirSync(frames, { recursive: true })
const EDITOR = '.tiptap.ProseMirror.haligtree-editor'

try {
  await box.reset()
  await h.keyboard.type('A draft to throw away, with enough words to see it crumple')
  // Idle a while, as the box is before anyone clears it: the paper is made ready then (warmBin).
  await wait(6000)
  const film = h.evaluate(async (keep) => {
    const seen = { came: false, stage: false, old: false, gone: 0, shots: [] }
    const t0 = performance.now()
    while (performance.now() - t0 < 1600) {
      const stage = document.querySelector('[data-paper-stage]')
      if (stage?.style.visibility === 'visible') seen.stage = true
      if (document.querySelector('[data-crumple]')) seen.came = true
      if (document.querySelector('[data-crumple="away"]')) seen.old = true
      if (keep && seen.shots.length < 26) {
        const png = await window.api.pictureOfRect({ x: 0, y: 0, width: innerWidth, height: innerHeight })
        if (png) seen.shots.push({ at: Math.round(performance.now() - t0), png: btoa(Array.from(png, (b) => String.fromCharCode(b)).join('')) })
      }
      await new Promise((go) => setTimeout(go, keep ? 60 : 16))
    }
    return seen
  }, !!frames)
  await h.locator('button[aria-label="New capture"]').first().click({ force: true })
  const seen = await film
  for (const [n, shot] of seen.shots.entries()) writeFileSync(`${frames}/f${String(n).padStart(2, '0')}-${shot.at}ms.png`, Buffer.from(shot.png, 'base64'))
  check('the draft crumples as the Bin\'s paper (the shared stage drawn)', seen.stage, JSON.stringify({ cover: seen.came, stage: seen.stage }))
  check('not the old hand-drawn crumple', !seen.old)
  const text = await h.locator(EDITOR).first().innerText()
  check('the box is empty after', !text.trim(), JSON.stringify(text))
  check('"Draft cleared" is said', await h.getByText(/^Draft cleared/).first().isVisible().catch(() => false))
  check('nothing of the paper is left on screen', await h.evaluate(() => !document.querySelector('[data-crumple]') && document.querySelector('[data-paper-stage]')?.style.visibility !== 'visible'))
  check('no page errors', !box.drain().some((one) => one.startsWith('PAGE ERROR')))
} finally { await box.close?.() }
done()

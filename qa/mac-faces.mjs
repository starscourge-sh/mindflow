// Faces and subjects framed (every Mac, Vision): a tall portrait given to a person as their photo is cut
// round on her face, not on the middle of the picture (where the Mona Lisa's hands are), wherever her face
// shows; a picture with no face is cut on what the eye goes to first.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/mac-faces.mjs
import { readFileSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const asset = (file) => h.evaluate(([name, bytes]) => window.api.saveFile(name, new Uint8Array(bytes)), [file, Array.from(readFileSync(new URL(`../src/renderer/src/assets/sandbox/${file}`, import.meta.url)))])
try {
  const lisa = await asset('mona-lisa.webp')
  const at = await v('picture:focus', lisa)
  check('Vision finds her face high in the portrait', at && at.y < 0.4 && Math.abs(at.x - 0.45) < 0.1, JSON.stringify(at))
  const dot = await asset('pale-blue-dot.webp')
  const there = await v('picture:focus', dot)
  check('a picture with no face is placed on what the eye goes to first', !!there && there.x > 0 && there.x < 1, JSON.stringify(there))
  await v('people:set', 'Lisa Gherardini', lisa)
  // A note by her, so her page and face show.
  await h.evaluate(() => window.api.captures.create({ kind: 'quote', attribution: 'Lisa Gherardini', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Patience is a kind of portrait.' }] }] } }))
  await h.keyboard.press('Escape')
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:source', { detail: 'attribution:Lisa Gherardini' })))
  await wait(2500)
  const faces = await h.evaluate(() => [...document.querySelectorAll('img')].filter((img) => img.src.includes('assets/') && getComputedStyle(img).objectFit === 'cover').map((img) => ({ w: img.clientWidth, h: img.clientHeight, at: img.style.objectPosition })))
  const placed = faces.filter((one) => one.at)
  check('her round photo is cut on her face (placed high), wherever it shows', placed.length > 0 && placed.every((one) => { const y = Number(one.at.split(' ')[1].replace('%', '')); return y < 30 }), JSON.stringify(faces))
  if (process.env.SHOT) await c.both(`${process.env.SHOT}/faces-person`)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()

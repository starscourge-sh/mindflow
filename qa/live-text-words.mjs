// Live Text offers only real words: in Files, Bruegel's "The Tower of Babel" (a painting Vision reads "AR ARALL" in,
// at half confidence, over the tower's windows) opens with no "Select text" pill and no words laid over it, and
// "Copy text from image" finds none (a reading kept from before, with no confidence, is read again); the 1890
// Lippincott's cover, opened from its note, still offers its words. Every
// picture in the sandbox is read: only those with words a person wrote offer them.
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [QA_SHOTS=dir] node qa/live-text-words.mjs
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const BABEL = 'f6aaea3ea2f8eea4bc1c1947f3d74defaf9eb6c74e138b7b47db08fa6b394e24'
const COVER = 'b81ff7dda7dda9cac0685ffda619a4be25357655fb83e8a80ea1941e2dcbd3f6'
const CAPTION = '0fafd53b4484f312c05ce9b18f18bc128ddce44c3b8df0b54720f495ad692b29'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 820 })
const { h, v } = c
const tile = (hash) => h.locator(`[data-media-grid] [data-media][data-src*="${hash}"]`).first()

/** The picture opened from its right-click "Look at it", as a person would; its words read before it is judged. */
const look = async (hash) => {
  await tile(hash).scrollIntoViewIfNeeded()
  await tile(hash).click({ button: 'right' })
  await h.locator('[role=menuitem]', { hasText: 'Look at it' }).last().click({ timeout: 6000 })
  await h.locator('.mf-look').waitFor({ timeout: 8000 })
  const src = await tile(hash).getAttribute('data-src')
  // The words come in the background: wait for the reading itself, then for the viewer to have drawn what it said.
  const read = await h.evaluate((src) => window.api.imageLines(src), src)
  await h.waitForTimeout(700)
  return { read, pill: await h.locator('.mf-look-text-pill').count(), layer: await h.locator('.mf-look-text [data-word]').count(), src }
}
const close = async () => {
  await h.keyboard.press('Escape')
  await h.locator('.mf-look').waitFor({ state: 'detached', timeout: 6000 }).catch(() => undefined)
  await h.waitForTimeout(300)
}

try {
  await v('settings:set', { motion: false, sounds: false })
  await c.go('media')
  await h.getByText('Images', { exact: true }).first().click()
  await h.waitForTimeout(900)

  const babel = await look(BABEL)
  check('the Tower of Babel: no "Select text", no words laid over it', babel.pill === 0 && babel.layer === 0 && babel.read?.lines.length === 0, JSON.stringify({ pill: babel.pill, layer: babel.layer, lines: babel.read?.lines.map((one) => one.text) }))
  if (process.env.QA_SHOTS) await c.both(join(process.env.QA_SHOTS, 'live-text-babel'))
  await close()
  check('"Copy text from image" finds no words in it either', (await h.evaluate((src) => window.api.imageText(src), babel.src)) === '')

  // The cover is a note's picture (Files offers "Open note" for it): opened as a person does, a double-click in the note.
  const notes = await h.evaluate(() => window.api.captures.list())
  await c.send('capture', notes.find((one) => /^The Picture of Dorian Gray/.test(one.label ?? '')).id)
  await h.waitForTimeout(1800)
  const at = await h.evaluate(async (hash) => {
    const img = [...document.querySelectorAll('.tiptap img')].find((one) => one.currentSrc.includes(hash))
    if (!img) return null
    img.scrollIntoView({ block: 'center' })
    await new Promise((next) => requestAnimationFrame(() => requestAnimationFrame(next)))
    const b = img.getBoundingClientRect()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, src: img.currentSrc }
  }, COVER)
  await h.mouse.dblclick(at.x, at.y)
  await h.locator('.mf-look').waitFor({ timeout: 8000 })
  const read = await h.evaluate((src) => window.api.imageLines(src), at.src)
  await h.locator('.mf-look-text-pill').waitFor({ timeout: 8000 }).catch(() => undefined)
  const pill = await h.locator('.mf-look-text-pill').count()
  const layer = await h.locator('.mf-look-text [data-word]').count()
  check('the Lippincott\'s cover: "Select text" and its words', pill === 1 && layer > 40 && read?.lines.some((one) => one.text === "LIPPINCOTT'S"), `${pill} pill, ${layer} words`)
  if (process.env.QA_SHOTS) await c.both(join(process.env.QA_SHOTS, 'live-text-cover'))
  await close()
  await c.go('media')
  await h.getByText('Images', { exact: true }).first().click()
  await h.waitForTimeout(900)

  // Every picture in the sandbox: only the cover and the two cartoons' captions hold words.
  const all = await h.$$eval('[data-media-grid] [data-media][data-src]', (tiles) => tiles.map((one) => one.getAttribute('data-src')).filter((src) => /assets\/[a-f0-9]{64}\./.test(src)))
  const worded = []
  for (const src of all) if ((await h.evaluate((src) => window.api.imageLines(src), src))?.lines.length) worded.push(src.match(/[a-f0-9]{8}/)[0])
  check(`of ${all.length} pictures, only the cover and the two captions offer words`, worded.length === 3 && worded.includes(COVER.slice(0, 8)) && worded.includes(CAPTION.slice(0, 8)), worded.join(', '))
  check('no page errors', !c.errors.length, c.errors.slice(0, 2).join(' | '))
} finally {
  await c.close()
}
done()

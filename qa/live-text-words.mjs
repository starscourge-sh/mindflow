// Live Text offers only real words: in Files, Bruegel's "The Tower of Babel" (a painting Vision reads "AR ARALL" in,
// at half confidence, over the tower's windows) opens with no "Select text" pill and no words laid over it, and
// "Copy text from image" finds none; the 1890 Lippincott's cover and a cartoon's caption still offer theirs. Every
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

  const cover = await look(COVER)
  check('the Lippincott\'s cover: "Select text" and its words', cover.pill === 1 && cover.layer > 40 && cover.read?.lines.some((one) => one.text === "LIPPINCOTT'S"), `${cover.pill} pill, ${cover.layer} words`)
  if (process.env.QA_SHOTS) await c.both(join(process.env.QA_SHOTS, 'live-text-cover'))
  await close()

  const caption = await look(CAPTION)
  check('a cartoon\'s caption: "Select text"', caption.pill === 1 && caption.layer > 3, `${caption.pill} pill, ${caption.layer} words`)
  await close()

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

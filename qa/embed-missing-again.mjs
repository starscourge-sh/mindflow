// A picture marked "not found in your Obsidian vaults" is looked for again each time its note opens (15 Nov 2026: the
// user's "Exam Cliff Notes" came in on 11 Nov with one picture not found; it sat in their vault, at the very path the
// note names, and the note said "not found" ever after, as a placeholder marked missing was never asked again). A vault
// stood in for (HALIGTREE_OBSIDIAN_CONFIG) holding a picture whose name has brackets and a curly apostrophe, as the
// user's has; a page holding that picture marked missing, and one truly gone: opened, the first becomes the picture and
// is kept so, the second stays a quiet "not found", and nothing breaks.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/embed-missing-again.mjs
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const root = mkdtempSync(join(tmpdir(), 'embed-again-'))
const vault = join(root, 'The Citadel')
const NAME = 'Signal Over Noise What’s the Difference [dYMyitfg9g4 - 1598x899 - 1m21s].png'
const GONE = 'Never in any vault [x1 - 10x10].png'
mkdirSync(join(vault, 'extras', 'attachments'), { recursive: true })
mkdirSync(join(vault, '.obsidian'), { recursive: true })
// A real picture: 2 by 2, red.
writeFileSync(join(vault, 'extras', 'attachments', NAME), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDK+mmyAAAAABJRU5ErkJggg==', 'base64'))
const config = join(root, 'obsidian.json')
writeFileSync(config, JSON.stringify({ vaults: { a: { path: vault, ts: 10, open: true } } }))
process.env.HALIGTREE_OBSIDIAN_CONFIG = config

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, v, send } = c
const ED = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const wait = (ms) => h.waitForTimeout(ms)
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const body = { type: 'doc', content: [
  para('Before the picture.'),
  { type: 'imagePlaceholder', attrs: { embed: `../../extras/attachments/${NAME}`, missing: NAME, width: null } },
  para('Between the two.'),
  { type: 'imagePlaceholder', attrs: { embed: `../../extras/attachments/${GONE}`, missing: GONE, width: null } },
  para('After them.')
] }
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Pictures not found once', body })
  await send('article', id)
  await h.locator(ED).first().waitFor({ timeout: 15000 })
  // Looked for as it opens (300 ms in), found in the vault, brought in.
  let shown = null
  for (let i = 0; i < 40 && !shown; i++) {
    shown = await h.evaluate((sel) => { const img = document.querySelector(`${sel} img[src^="haligtree://assets/"]`); return img ? img.getAttribute('src') : null }, ED)
    if (!shown) await wait(150)
  }
  check('opened, the picture once not found is found in the vault and shown', !!shown, String(shown))
  const notes = await h.evaluate((sel) => [...document.querySelectorAll(`${sel} *`)].filter((one) => !one.children.length && /Picture not found in your Obsidian vaults/.test(one.textContent ?? '')).map((one) => one.textContent), ED)
  check('the one in no vault stays a quiet "not found", by its name', notes.length === 1 && notes[0].includes('Never in any vault'), JSON.stringify(notes))
  // Kept so: left and read back, the stored page holds the picture.
  await send('view', 'home'); await wait(1500)
  const kept = await v('item', id)
  const stored = JSON.stringify(kept?.body ?? '')
  check('and kept so: the stored page holds the picture now', /haligtree:\/\/assets\//.test(stored) && stored.includes('Never in any vault'), stored.slice(0, 160))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()

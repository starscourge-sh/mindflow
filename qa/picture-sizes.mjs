// A tall screenshot in a note: shown narrow to fit the window, it never claims "L"; set to L, it is the column's width,
// however tall (the user, 22 Nov: "why is this claiming to be L when it's not side to side").
import { readFileSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
// A tall picture made here by the Mac from a test picture, in a folder removed at the end.
const { execFileSync } = await import('node:child_process')
const { mkdtempSync, rmSync } = await import('node:fs')
const made = mkdtempSync((await import('node:os')).tmpdir() + '/tall-')
execFileSync('/usr/bin/sips', ['-z', '3000', '900', new URL('./fixtures/notebook-page.png', import.meta.url).pathname, '--out', made + '/tall.png'])
const s = await sandbox({ width: 1400, height: 900 })
const { h, close, send } = s
try {
  const src = await h.evaluate((b) => window.api.saveImage('image/png', new Uint8Array(b)), Array.from(readFileSync(made + '/tall.png')))
  const id = await h.evaluate((src) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A tall one' }] }, { type: 'image', attrs: { src } }] } }), src)
  await send('capture', id); await h.waitForTimeout(1800)
  const pic = h.locator('.tiptap img').first()
  await pic.click(); await h.waitForTimeout(500)
  const lit = () => h.evaluate(() => [...document.querySelectorAll('[aria-label$=" width"][data-active-state="on"]')].map((one) => one.getAttribute('aria-label')))
  const before = { lit: await lit(), w: Math.round((await pic.boundingBox()).width), col: await h.evaluate(() => Math.round(document.querySelector('.tiptap').clientWidth)) }
  await h.locator('[aria-label="L width"]').click(); await h.waitForTimeout(600)
  const after = { lit: await lit(), w: Math.round((await pic.boundingBox()).width) }
  check('a tall picture held narrow does not claim to be L', !before.lit.includes('L width'), JSON.stringify(before))
  check('L chosen: it is the column’s width, however tall', after.lit.includes('L width') && after.w > before.w + 100, JSON.stringify({ before, after }))
} catch (error) { check('ran', false, error.stack) } finally { await close(); rmSync(made, { recursive: true, force: true }) }
done()

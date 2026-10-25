// The welcome's commonplace mark, and its true italic. The last page is
// sealed with an ink stamp, pressed once with a thud as the page settles,
// clear of the words and the choices; seen again, or after Esc, it is simply there, with
// no sound. The lines the pointer sets in italics are in Fraunces' own
// italic face, loaded, not the upright slanted.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-y/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-marks.mjs [shots folder] [light|dark]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

delete process.env.QA_ARGS
const SHOTS = process.argv[2] ?? ''
const THEME = process.argv[3] ?? 'light'
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800, seeded: false })
const { h, errors, close } = c
const shot = (name, clip) => SHOTS && h.screenshot({ path: join(SHOTS, `${THEME}-${name}.png`), ...(clip ? { clip } : {}) })
const heard = () => h.evaluate(() => [...(window.haligtreeHeard ?? [])])
// What a mark covers: every word on screen (by its text's own boxes, not its block's) and every control.
const covers = (selector) => h.evaluate((selector) => {
  const mark = document.querySelector(selector)?.getBoundingClientRect()
  if (!mark) return ['no mark']
  const hit = (r) => r.width > 0 && r.height > 0 && r.left < mark.right && r.right > mark.left && r.top < mark.bottom && r.bottom > mark.top
  const seen = (el) => { for (let one = el; one && one !== document.body; one = one.parentElement) { const s = getComputedStyle(one); if (s.visibility === 'hidden' || Number(s.opacity) < 0.05 || s.display === 'none') return false } return true }
  const out = []
  const root = document.querySelector('.mf-welcome')
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    if (!node.textContent.trim() || node.parentElement.closest(selector) || !seen(node.parentElement)) continue
    const range = document.createRange()
    range.selectNodeContents(node)
    if ([...range.getClientRects()].some(hit)) out.push(node.textContent.trim().slice(0, 30))
  }
  for (const el of root.querySelectorAll('button, a, input, [role="slider"]')) if (seen(el) && hit(el.getBoundingClientRect())) out.push(`<${el.tagName.toLowerCase()}> ${el.textContent.trim().slice(0, 20)}`)
  return out
}, selector)
try {
  await c.theme(THEME)
  if (!(await h.$('.mf-welcome'))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForSelector('[data-thesis="gap-2"][data-slant="on"]', { timeout: 30000 })
  await h.waitForTimeout(900)

  // The true italic.
  const face = await h.evaluate(async () => {
    const faces = await document.fonts.load('italic 24px "Fraunces Variable"', 'Notes come back')
    const el = [...document.querySelectorAll('[data-thesis="gap-0"] .inline-grid > span')].find((one) => getComputedStyle(one).fontStyle === 'italic' && Number(getComputedStyle(one).opacity) > 0.5)
    return { italic: faces.filter((f) => f.style === 'italic').length, family: el ? getComputedStyle(el).fontFamily : '' }
  })
  check('Fraunces has its own italic face, loaded on asking', face.italic > 0, JSON.stringify(face))
  // In the Mac's font (the default) or in Fraunces: either way a face with an italic of its own, never a slant put on.
  check('the italic lines are set in a font with a true italic', /Fraunces|system-ui|-apple-system/.test(face.family), face.family)
  const lines = await h.evaluate(() => { const r = document.querySelector('[data-thesis="gap-0"]').parentElement.getBoundingClientRect(); return { x: r.left - 8, y: r.top - 8, width: Math.min(900, r.width + 16), height: r.height + 16 } })
  await shot('italics', lines)

  // No thumb index: the footer already names the chapter, and a tab repeating it read as a stray word.
  check('no tab on the fore-edge', (await h.locator('[data-welcome-tab]').count()) === 0)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(500)
  await h.click('footer button:has-text("Show me")')
  await h.waitForTimeout(1400)

  // The seal on the last page, pressed once as it settles.
  const before = (await heard()).length
  await h.click('footer [data-skip]')
  await h.waitForTimeout(600)
  check('not yet pressed as the page arrives', (await h.getAttribute('[data-welcome-stamp]', 'data-welcome-stamp')) === 'waiting')
  await h.waitForTimeout(2000)
  const sounds = (await heard()).slice(before)
  check('the seal is pressed once the page settles', (await h.getAttribute('[data-welcome-stamp]', 'data-welcome-stamp')) === 'pressed')
  check('with one thud', sounds.filter((one) => one === 'click:thud').length === 1, sounds.join())
  check('the seal covers no word or control', (await covers('[data-welcome-stamp]')).length === 0, (await covers('[data-welcome-stamp]')).join(' | '))
  await shot('stamp')
  const stamp = await h.evaluate(() => { const r = document.querySelector('[data-welcome-stamp]').getBoundingClientRect(); return { x: r.left - 30, y: r.top - 30, width: r.width + 60, height: r.height + 60 } })
  await shot('stamp-close', stamp)

  // Back and on again: seen already, so simply there and silent.
  await h.click('footer button:has-text("Back")')
  await h.waitForTimeout(1200)
  const again = (await heard()).length
  await h.click('footer [data-skip]')
  await h.waitForTimeout(400)
  check('seen again, the seal is simply there', (await h.getAttribute('[data-welcome-stamp]', 'data-welcome-stamp')) === 'pressed')
  await h.waitForTimeout(1800)
  check('and makes no sound', !(await heard()).slice(again).includes('click:thud'))

  // A fresh welcome, Esc on the last page before the seal comes down: there at once, no thud.
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForTimeout(1500)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(600)
  await h.click('footer [data-skip]')
  await h.waitForTimeout(300)
  const esc = (await heard()).length
  await h.keyboard.press('Escape')
  await h.waitForTimeout(200)
  check('Esc settles the seal at once', (await h.getAttribute('[data-welcome-stamp]', 'data-welcome-stamp')) === 'pressed')
  await h.waitForTimeout(1800)
  check('settled, it makes no sound', !(await heard()).slice(esc).includes('click:thud'))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()

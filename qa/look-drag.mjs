// A picture opened large (Look) still lets the window be dragged by its top:
// a drag strip along the top edge, clear of the picture and its buttons, gone
// while zoomed in (the picture may reach the top then). The same for the
// other full-window views that once covered the window's own strip: Deciding
// and an expanded note. Paper and Dark, at 900x700 and 1600x1000.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/look-drag.mjs
// SHOTS=dir keeps pictures.
import { mkdirSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { h, v } = c

/** The drag strips inside an overlay, each with whether it is a drag region and what it overlaps. */
const strips = (within) => h.evaluate((within) => {
  const root = document.querySelector(within)
  if (!root) return null
  const box = (el) => el.getBoundingClientRect()
  const buttons = [...root.querySelectorAll('button')].map(box).filter((b) => b.width > 0)
  const picture = root.querySelector('.mf-look-frame') ? box(root.querySelector('.mf-look-frame')) : null
  const hits = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  return [...root.querySelectorAll('[data-drag-strip]')].map((el) => {
    const b = box(el)
    return { top: b.top, height: b.height, width: b.width, drag: getComputedStyle(el).getPropertyValue('-webkit-app-region') || getComputedStyle(el).webkitAppRegion,
      overButton: buttons.filter((one) => hits(one, b) && getComputedStyle(document.elementFromPoint(one.left + one.width / 2, one.top + one.height / 2) ?? el).webkitAppRegion !== 'no-drag').length, overPicture: !!picture && hits(picture, b) }
  })
}, within)

try {
  const florence = (await v('items', 'article')).find((one) => one.title.includes('Florence learned perspective'))
  for (const theme of ['paper', 'dark']) {
    await c.theme(theme)
    // Opened as Look is opened, at 1280 (a double-click on the picture), then seen at each size.
    await c.size(1280, 800)
    await c.send('article', florence.id)
    await h.waitForTimeout(1800)
    await h.evaluate(() => [...document.querySelectorAll('.tiptap img')].find((one) => one.getBoundingClientRect().width > 150)?.scrollIntoView({ block: 'center' }))
    await h.waitForTimeout(800)
    const at = await h.evaluate(() => { const b = [...document.querySelectorAll('.tiptap img')].find((one) => one.getBoundingClientRect().width > 150).getBoundingClientRect(); return { x: b.x + b.width / 2, y: Math.max(b.y, 60) + 80 } })
    await h.mouse.move(at.x, at.y, { steps: 3 })
    await h.waitForTimeout(500)
    await h.mouse.dblclick(at.x, at.y)
    await h.waitForTimeout(900)
    check(`${theme}: Look opens`, await h.locator('.mf-look').count() === 1)
    for (const [w, hh] of [[900, 700], [1600, 1000]]) {
      await c.size(w, hh)
      await h.waitForTimeout(500)
      const name = `${theme} ${w}x${hh}`
      const look = await strips('.mf-look')
      check(`${name}: Look has a drag strip along its top`, look?.length === 1 && look[0].top === 0 && look[0].height >= 32 && look[0].width === w && look[0].drag === 'drag', JSON.stringify(look))
      check(`${name}: the strip covers neither the picture nor a button`, look?.[0] && !look[0].overPicture && look[0].overButton === 0, JSON.stringify(look))
      if (shots) await h.screenshot({ path: `${shots}/look-${theme}-${w}.png` })
    }
    // Zoomed in, the picture may reach the top: the strip goes, so a drag looks around the picture.
    await h.locator('.mf-look-image').click()
    await h.waitForTimeout(500)
    const zoomed = await strips('.mf-look')
    check(`${theme}: zoomed in, no strip over the picture`, zoomed?.length === 0, JSON.stringify(zoomed))
    await h.keyboard.press('Escape')
    await h.waitForTimeout(300)
    if (await h.locator('.mf-look').count()) await h.keyboard.press('Escape')
    await h.waitForTimeout(500)
  }
  // Deciding covers the whole window too: held by its top, its Close button still a button.
  await c.send('view', 'decide')
  await h.waitForTimeout(1500)
  const pass = await strips('[data-pass]')
  check('Deciding: its top is a drag strip, its Close button left clickable', pass?.length === 1 && pass[0].top <= 1 && pass[0].drag === 'drag' && pass[0].overButton === 0, JSON.stringify(pass))
  if (shots) await h.screenshot({ path: `${shots}/deciding.png` })
  check('no errors on the page', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
}
done()

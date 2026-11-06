// Free-text answer fields read as places to write, in Make a card's way: one dashed line under the text with room above it, the example in italics, one
// shared style (mf-ruled). Visible at rest (measured against the card behind it, and darker than the card's own
// hairlines), a step darker under the pointer, a step more while typing. The Month's Focus, Season of life and
// Intentions, the Week's Summary, a goal's "Why it matters", Review's "Because…". Frames light and dark (Paper and
// Satin for Review) to QA_SHOTS.
//
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<dir> node qa/ruled-fields.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const { h, go, both, look, close, errors } = await sandbox({ width: 1280, height: 900 })
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)

// The line's colour and the card's, resolved, with their contrast and the hairline's.
const measure = (selector) => h.evaluate((selector) => {
  const field = document.querySelector(selector)
  if (!field) return null
  // Any CSS colour (oklch, color-mix) as sRGB, painted on a canvas and read back.
  const pen = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  // A see-through colour is read as it shows: painted over the card first.
  const rgb = (css, under = '#fff') => { pen.globalCompositeOperation = 'copy'; pen.fillStyle = under; pen.fillRect(0, 0, 1, 1); pen.globalCompositeOperation = 'source-over'; pen.fillStyle = css; pen.fillRect(0, 0, 1, 1); return [...pen.getImageData(0, 0, 1, 1).data.slice(0, 3)] }
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return +((x + 0.05) / (y + 0.05)).toFixed(2) }
  let card = field.parentElement
  // The first solid surface behind it (a tint over it, like a focused row's, is read on top of that).
  const alpha = (css) => { pen.globalCompositeOperation = 'copy'; pen.fillStyle = 'rgba(0,0,0,0)'; pen.fillRect(0, 0, 1, 1); pen.fillStyle = css; pen.fillRect(0, 0, 1, 1); return pen.getImageData(0, 0, 1, 1).data[3] }
  while (card && alpha(getComputedStyle(card).backgroundColor) < 255) card = card.parentElement
  const backCss = getComputedStyle(card ?? document.body).backgroundColor
  const back = rgb(backCss)
  const style = getComputedStyle(field)
  const ink = style.getPropertyValue('--mf-rule-ink').trim()
  const line = rgb(style.getPropertyValue('--mf-rule').trim() || 'transparent', backCss)
  const hair = rgb(style.getPropertyValue('--border').trim(), backCss)
  return { ink, line: ratio(line, back), hair: ratio(hair, back), ruled: style.borderBottomStyle === 'dashed' && parseFloat(style.paddingBottom) >= 8, italic: getComputedStyle(field, '::placeholder').fontStyle === 'italic' }
}, selector)

const run = async (name, selector, hover = selector) => {
  await h.locator(selector).first().scrollIntoViewIfNeeded()
  await h.mouse.move(5, 5)
  await wait(300)
  const rest = await measure(selector)
  await h.locator(hover).first().hover()
  await wait(300)
  const over = await measure(selector)
  await h.locator(selector).first().focus()
  await h.mouse.move(5, 5)
  await wait(300)
  const typing = await measure(selector)
  console.log(name, JSON.stringify({ rest, over, typing }))
  check(`${name}: one dashed line with room above it (as Make a card), visible at rest and darker than the card's hairlines`, rest?.ruled && rest.line > rest.hair && rest.line >= 1.25, JSON.stringify(rest))
  check(`${name}: a step darker under the pointer`, over && over.line > rest.line, `${rest?.line} -> ${over?.line}`)
  check(`${name}: a step darker again while typing`, typing && typing.line > over.line, `${over?.line} -> ${typing?.line}`)
  await h.locator(selector).first().blur()
}

try {
  for (const theme of ['light', 'dark']) {
    await look(theme)
    await go('monthpage')
    await wait(1200)
    await run(`${theme} Month Focus`, 'textarea[aria-label="Focus"]')
    if (shots) await h.screenshot({ path: `${shots}/ruled-month-${theme}.png` })
    await h.locator('textarea[aria-label="Focus"]').hover()
    await wait(250)
    if (shots) await h.screenshot({ path: `${shots}/ruled-month-hover-${theme}.png` })
    await h.locator('textarea[aria-label="Focus"]').click()
    await h.keyboard.type('Finish the draft; protect mornings, and a second line long enough to wrap onto the next ruled line of the page')
    await wait(250)
    if (shots) await h.screenshot({ path: `${shots}/ruled-month-typing-${theme}.png` })
    await h.keyboard.press('Meta+a'); await h.keyboard.press('Backspace')
    await h.locator('textarea[aria-label="Focus"]').blur()
    await go('weekpage')
    await wait(1200)
    await run(`${theme} Week Summary`, 'textarea[aria-label="Summary"]')
    if (shots) await h.screenshot({ path: `${shots}/ruled-week-${theme}.png` })
  }
  await look('light')
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()

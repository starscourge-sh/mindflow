// Words picked in quick capture: one floating thing at a time, and never on the words being picked.
// In the one-line pill there is no room above or below the line, so no format bar (⌘B, ⌘I and the
// right-click menu still format); no "Kind, and more" tip over them; the count of words picked stays
// off them. In the grown box the bar sits clear of the pick, and while it is up nothing else floats.
// Also: "drive to the m" is given no time (the m is half of a word).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/box-pick-one-float.mjs
import { checks } from './harness.mjs'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, v } = c
const shots = process.env.SHOT ?? `${process.env.QA_DATA}/pick`
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const look = async (name) => { await page.evaluate((n) => { localStorage.setItem('theme', n === 'light' ? 'paper' : n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, name); await page.waitForTimeout(500) }
// Everything floating now, and whether any of it lies on the words picked.
const floating = () => page.evaluate(() => {
  const shown = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && Number(s.opacity) > 0.05 ? r : null }
  const sel = window.getSelection()
  const words = sel?.rangeCount ? [...sel.getRangeAt(0).getClientRects()].filter((r) => r.width > 0) : []
  const on = (r) => !!r && words.some((w) => w.left < r.right && w.right > r.left && w.top < r.bottom && w.bottom > r.top)
  const found = {
    bar: shown(document.querySelector('[data-selection-bar]')),
    count: shown(document.querySelector('[data-picked-count]')),
    tip: shown([...document.querySelectorAll('[role=tooltip], [data-radix-popper-content-wrapper]')].find((el) => shown(el)) ?? null),
  }
  return { up: Object.entries(found).filter(([, r]) => r).map(([k]) => k), onWords: Object.entries(found).filter(([, r]) => on(r)).map(([k]) => k), picked: sel?.toString() ?? '' }
})
// A frame every 50ms for a second, each read for what floats.
const film = async (name) => {
  const seen = []
  for (let i = 0; i < 20; i++) {
    seen.push(await floating())
    if (i % 5 === 0) await page.screenshot({ path: `${shots}-${name}-f${String(i).padStart(2, '0')}.png` }).catch(() => {})
    await page.waitForTimeout(50)
  }
  return seen
}
const pickByDrag = async (from, to) => {
  const box = await page.evaluate(([a, b]) => {
    const ed = document.querySelector('.tiptap.ProseMirror.haligtree-editor:not(.is-line)')
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT)
    const text = walker.nextNode()
    const range = document.createRange()
    range.setStart(text, a); range.setEnd(text, a + 1)
    const r1 = range.getBoundingClientRect()
    range.setStart(text, b - 1); range.setEnd(text, b)
    const r2 = range.getBoundingClientRect()
    return { x1: r1.left + 1, y: r1.top + r1.height / 2, x2: r2.right - 1 }
  }, [from, to])
  // Picked right to left, ending at the line's start: the pointer comes to rest by the kind button.
  await page.mouse.move(box.x2, box.y)
  await page.mouse.down()
  await page.mouse.move(box.x1 - 2, box.y, { steps: 8 })
  await page.mouse.up()
}

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, boxHideButtons: false, boxOneLine: true })
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(700)
  await page.click(EDITOR)
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
  await page.keyboard.type('drive to the m')
  await page.waitForTimeout(900)
  const will = await page.evaluate(() => document.querySelector('[data-will-do]')?.textContent ?? '')
  const lit = await page.evaluate(() => [...document.querySelectorAll('[data-box-token]')].map((el) => el.getAttribute('data-box-token') + ':' + el.textContent))
  check('"drive to the m": no time is read and nothing is lit as a date', !/\d:\d\d|today|tomorrow/i.test(will) && !lit.some((one) => /^date/.test(one)), JSON.stringify({ will, lit }))
  for (const name of ['light', 'dark']) { await look(name); await page.screenshot({ path: `${shots}-the-m-${name}.png` }) }
  await look('light')
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
  await page.keyboard.type('Call the plumber about the leak')
  await page.waitForTimeout(600)
  // The pill: "the plumber about" picked by a drag that ends at the line's start.
  await pickByDrag(0, 16)
  await page.waitForTimeout(900)
  const pill = await film('pill')
  const pillWorst = pill.reduce((a, b) => (b.up.length > a.up.length || b.onWords.length > a.onWords.length ? b : a))
  check('pill: words are picked', pill.at(-1).picked.length > 3, pill.at(-1).picked)
  check('pill: at most one floating thing, in every frame', pill.every((one) => one.up.length <= 1), JSON.stringify(pillWorst))
  check('pill: no format bar, there is no room for it clear of the line (the window is the pill)', pill.every((one) => !one.up.includes('bar')), JSON.stringify(pillWorst))
  check('pill: nothing floats on the picked words, in every frame', pill.every((one) => one.onWords.length === 0), JSON.stringify(pillWorst))
  for (const name of ['light', 'dark']) { await look(name); await page.screenshot({ path: `${shots}-pill-${name}.png` }) }
  await look('light')

  // The grown box: a few lines, words in the middle picked.
  await v('settings:set', { boxOneLine: false })
  await page.waitForTimeout(600)
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(700)
  await page.click(EDITOR)
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
  await page.keyboard.type('Call the plumber about the leak under the sink')
  await page.waitForTimeout(500)
  await pickByDrag(5, 20)
  await page.waitForTimeout(900)
  const box = await film('box')
  const boxWorst = box.reduce((a, b) => (b.up.length > a.up.length || b.onWords.length > a.onWords.length ? b : a))
  check('box: the format bar shows', box.at(-1).up.includes('bar'), JSON.stringify(box.at(-1)))
  check('box: only the bar floats while it is up (no count, no tip)', box.every((one) => !one.up.includes('bar') || one.up.length === 1), JSON.stringify(boxWorst))
  const inFrame = await page.evaluate(() => { const b = document.querySelector('[data-selection-bar]')?.getBoundingClientRect(); const f = document.querySelector('.app-container').getBoundingClientRect(); return !!b && b.top >= f.top && b.bottom <= f.bottom && b.left >= f.left - 1 && b.right <= f.right + 1 })
  check('box: the bar sits inside the box, not past its edge', inFrame)
  check('box: the bar is never on the picked words', box.every((one) => one.onWords.length === 0), JSON.stringify(boxWorst))
  for (const name of ['light', 'dark']) { await look(name); await page.screenshot({ path: `${shots}-box-${name}.png` }) }
  await look('light')
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()

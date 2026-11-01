// "One line to start", the pill, read like macOS 26 Spotlight: one rounded pill, its kind glyph and large words
// close together, the placeholder in words (never a row of faint dots), the round controls standing beside it at
// its own height, never over it. A draft left from earlier is offered by its own round chip under the pill with room
// of its own: never over the pill's edge or its words, and no tip over it. Frames every 50ms through open, type and
// the offer, light and dark, into QA_SHOTS/pill-<step>-<look>/.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/qc-pill.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const wait = (ms) => page.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp/pill'
const film = process.env.QA_FILM !== '0'
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const reopen = async () => {
  await page.evaluate(() => window.api.hidePrompt()); await wait(500)
  await page.evaluate(() => window.api.showPrompt()); await wait(1400)
}
const theme = (look) => page.evaluate((n) => (localStorage.setItem('theme', n), window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))), look === 'light' ? 'paper' : 'dark')
async function roll(dir, name, ms, act) {
  let n = 0
  let going = true
  const rolling = (async () => {
    while (going) {
      const at = Date.now()
      await page.screenshot({ path: `${dir}/${name}-${String(n++).padStart(2, '0')}.png` }).catch(() => {})
      await new Promise((r) => setTimeout(r, Math.max(0, 50 - (Date.now() - at))))
    }
  })()
  await act()
  await wait(ms)
  going = false
  await rolling
}
const read = () => page.evaluate((sel) => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) } : null }
  const hit = (a, b) => !!a && !!b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)
  const card = box(document.querySelector('.app-container'))
  const icon = box(document.querySelector('[data-pill-kind] svg'))
  const p = document.querySelector(`${sel} p`)
  const words = p ? (() => { const range = document.createRange(); range.selectNodeContents(p); const r = range.getBoundingClientRect(); return { left: Math.round(r.left) } })() : null
  const holder = p && getComputedStyle(p, '::before')
  const offer = box(document.querySelector('[data-leftover]'))
  const controls = [...document.querySelectorAll('.mf-top [data-aside] > *, .mf-top .mf-pill button')].map(box).filter(Boolean)
  return {
    pill: !!document.querySelector('.app-container[data-pill]'),
    card, icon, offer, controls,
    textLeft: words?.left ?? null,
    font: p ? parseFloat(getComputedStyle(p).fontSize) : null,
    middle: p ? (() => { const r = p.getBoundingClientRect(); return Math.round((r.top + r.bottom) / 2) })() : null,
    placeholder: holder ? { content: holder.content, letter: holder.letterSpacing, decoration: holder.textDecorationLine, font: parseFloat(holder.fontSize) } : null,
    offerOverCard: hit(offer, card),
    controlsOverCard: controls.some((one) => hit(one, card)),
    tips: [...document.querySelectorAll('[role=tooltip]')].filter((one) => one.getBoundingClientRect().width).length
  }
}, EDITOR)

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true })
  await reopen()
  const plain = await read()
  check('the pill: a one-line box', plain.pill && plain.card && plain.card.bottom - plain.card.top <= 64, JSON.stringify(plain.card))
  check('its words are large, as Spotlight\'s (20px or more)', plain.font >= 20, String(plain.font))
  check('the kind glyph sits close to the words, Spotlight\'s way (16px or less between)', plain.icon && plain.textLeft !== null && plain.textLeft - plain.icon.right <= 16, JSON.stringify({ icon: plain.icon, textLeft: plain.textLeft }))
  check('the words sit on the pill\'s middle, level with the glyph (within 2px)', plain.middle !== null && Math.abs(plain.middle - (plain.card.top + plain.card.bottom) / 2) <= 2 && Math.abs(plain.middle - (plain.icon.top + plain.icon.bottom) / 2) <= 2, JSON.stringify({ middle: plain.middle, card: plain.card, icon: plain.icon }))
  check('the placeholder is words, never a row of dots (no wide spacing, no underline)', plain.placeholder && /Write/.test(plain.placeholder.content) && (plain.placeholder.letter === 'normal' || parseFloat(plain.placeholder.letter) < 2) && plain.placeholder.decoration === 'none', JSON.stringify(plain.placeholder))
  check('the round controls stand beside the pill\'s right end at its height, never over it', plain.controls.length >= 3 && !plain.controlsOverCard && plain.controls.every((one) => one.left >= plain.card.right + 8 && one.top === plain.card.top && one.bottom - one.top === plain.card.bottom - plain.card.top), JSON.stringify({ card: plain.card, controls: plain.controls }))

  // A draft left from earlier: offered under the pill, never over it.
  await page.evaluate(() => {
    localStorage.setItem('capture-draft', JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'what is this?' }] }] }))
    localStorage.setItem('capture-draft-at', String(Date.now() - 3 * 3600_000))
  })
  await reopen()
  const left = await read()
  check('a draft from earlier: offered by its own chip', !!left.offer, JSON.stringify(left))
  check('…never over the pill or its words', left.offer && !left.offerOverCard, JSON.stringify({ offer: left.offer, card: left.card }))
  await page.hover('[data-leftover]').catch(() => {}); await wait(900)
  check('…and no tip over it on hover (one hover, one surface)', (await read()).tips === 0)
  await page.mouse.move(2, 2)

  if (film) for (const look of ['light', 'dark']) {
    await theme(look)
    const dir = `${shots}/pill-${look}`
    mkdirSync(dir, { recursive: true })
    await page.evaluate(() => { localStorage.removeItem('capture-draft'); localStorage.removeItem('capture-draft-at') })
    await page.evaluate(() => window.api.hidePrompt()); await wait(500)
    await roll(dir, '1-open', 900, () => page.evaluate(() => window.api.showPrompt()))
    await roll(dir, '2-type', 700, async () => { await page.click(EDITOR).catch(() => {}); await page.keyboard.type('a line', { delay: 40 }) })
    await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(300)
    await page.evaluate(() => {
      localStorage.setItem('capture-draft', JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'what is this?' }] }] }))
      localStorage.setItem('capture-draft-at', String(Date.now() - 3 * 3600_000))
    })
    await page.evaluate(() => window.api.hidePrompt()); await wait(500)
    await roll(dir, '3-offer', 900, () => page.evaluate(() => window.api.showPrompt()))
    await roll(dir, '4-hover-offer', 900, () => page.hover('[data-leftover]').catch(() => {}))
    await page.mouse.move(2, 2)
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()

// Typing never draws a box round what you type in. A card's question in Review (edited in place) and a sticky's
// writing are clicked into and typed in, light and dark; the element with the keys and every one of its ancestors
// are read before and after: no outline, box-shadow or border colour may change because of the focus. Screenshots
// of both are saved to look at.
//
//   npx electron-vite build --outDir out-fx2
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-fx2/main/index.js HALIGTREE_QA_AWAY=1 node qa/focus-boxes.mjs
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'
const { check, done } = checks()
const shots = process.env.QA_SHOTS ?? join(tmpdir(), 'focus-boxes-shots')
mkdirSync(shots, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const c = await sandbox({ width: 1200, height: 900 })
const { h, electron } = c
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await wait(150)) if (await test()) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)

/** The looks of `selector` and its ancestors that a focus box would change. */
const chain = (page, selector) => page.evaluate((selector) => {
  const out = []
  for (let el = document.querySelector(selector); el && el !== document.documentElement; el = el.parentElement) {
    const s = getComputedStyle(el)
    out.push({ tag: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0, 3).join('.') : ''), outline: s.outlineStyle === 'none' || s.outlineWidth === '0px' ? 'none' : `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`, shadow: s.boxShadow, border: `${s.borderTopWidth} ${s.borderTopColor}` })
  }
  return out
}, selector)
/** A box drawn round it: an outline, or a shadow ring (no blur, a spread) in a colour you can see. */
const ringed = (one) => one.outline !== 'none' || one.shadow.split(/,(?![^(]*\))/).some((part) => !/rgba\([^)]*,\s*0\)|\/ 0\)/.test(part) && /\b0px 0px 0px [1-9]/.test(part))
const changed = (before, after) => after.filter((one, n) => before[n] && (one.outline !== before[n].outline || one.shadow !== before[n].shadow || one.border !== before[n].border)).map((one, n) => ({ ...one, was: before[after.indexOf(one)] }))
const look = async (page, name) => {
  await page.evaluate((n) => { localStorage.setItem('theme', n === 'light' ? 'paper' : n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, name)
  await wait(500)
}

try {
  // Review: a card's question, clicked and typed in.
  const mine = ['What does entropy say, in one sentence?']
  await call('cards:list', mine.map((term) => ({ term, meaning: 'Order goes to disorder #kiwi' })))
  await c.go('review')
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-review-tab="decks"]')))
  await h.evaluate(() => document.querySelector('[data-review-tab="decks"]').click())
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-own-deck="kiwi"] [data-deck-study]')))
  await h.click('[data-own-deck="kiwi"]')
  await waitFor(() => h.evaluate(() => document.querySelector('h2[contenteditable]')?.textContent === 'What does entropy say, in one sentence?'))
  for (const theme of ['light', 'dark']) {
    await look(h, theme)
    await h.evaluate(() => document.activeElement?.blur())
    const before = await chain(h, 'h2[contenteditable]')
    await h.click('h2[contenteditable]')
    await h.keyboard.press('End')
    await h.keyboard.type(' x')
    await wait(300)
    const focused = await h.evaluate(() => document.activeElement?.matches('h2[contenteditable]'))
    const after = await chain(h, 'h2[contenteditable]')
    const diff = changed(before, after)
    check(`Review (${theme}): the question has the keys`, focused)
    check(`Review (${theme}): no box drawn round the question or its card while typing`, diff.length === 0, JSON.stringify(diff))
    const box = await h.locator('h2[contenteditable]').boundingBox()
    await h.screenshot({ path: join(shots, `review-typing-${theme}.png`), clip: { x: Math.max(0, box.x - 60), y: Math.max(0, box.y - 60), width: Math.min(900, box.width + 120), height: box.height + 160 } })
    await h.keyboard.press('Backspace')
    await h.keyboard.press('Backspace')
    await h.keyboard.press('Escape')
  }
  await look(h, 'light')

  // A sticky: clicked into and typed in.
  await call('settings:set', { stickiesGlass: false })
  const id = await h.evaluate(() => window.api.captures.create({ title: 'Box me', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Words to type after' }] }] } }))
  await h.evaluate((id) => window.api.stick('capture', id, true), id)
  let note = null
  for (let i = 0; i < 60 && !note; i++) { note = electron.windows().find((p) => p.url().includes('view=sticky') && p.url().includes(`id=${id}`)); if (!note) await wait(250) }
  check('the sticky came out', !!note)
  if (note) {
    await note.waitForLoadState('domcontentloaded')
    await wait(1500)
    for (const theme of ['light', 'dark']) {
      await look(note, theme)
      const before = await chain(note, 'body > *')
      const words = note.getByText('Words to type after').first()
      await words.dblclick()
      await waitFor(() => note.evaluate(() => !!document.querySelector('.ProseMirror[contenteditable="true"]')))
      await wait(400)
      await note.keyboard.press('End')
      await note.keyboard.type(' x')
      await wait(300)
      const sel = await note.evaluate(() => { const a = document.activeElement; a?.setAttribute('data-qa-active', ''); return a?.tagName ?? null })
      const typing = await chain(note, '[data-qa-active]')
      const boxed = typing.filter(ringed)
      check(`sticky (${theme}): the writing has the keys`, !!sel, sel)
      check(`sticky (${theme}): no outline or ring round the writing or the card while typing`, boxed.length === 0, JSON.stringify(boxed))
      const card = await chain(note, 'body > *')
      check(`sticky (${theme}): the card's own look did not change on focus`, changed(before, card).length === 0, JSON.stringify(changed(before, card)))
      await note.screenshot({ path: join(shots, `sticky-typing-${theme}.png`) })
      await note.keyboard.press('Backspace')
      await note.keyboard.press('Backspace')
      await note.keyboard.press('Escape')
      await wait(500)
      // Out of the writing by Esc, the keys stay in the sticky: still no box round it.
      await note.evaluate(() => { document.querySelector('[data-qa-active]')?.removeAttribute('data-qa-active'); document.activeElement?.setAttribute('data-qa-active', '') })
      const left = (await chain(note, '[data-qa-active]')).filter(ringed)
      check(`sticky (${theme}): after Esc, no box round the sticky`, left.length === 0, JSON.stringify(left))
      await note.screenshot({ path: join(shots, `sticky-after-esc-${theme}.png`) })
    }
  }
  console.log(`  shots: ${shots}`)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()

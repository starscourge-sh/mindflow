// "Tag look" (Settings, Appearance): "Solid" or "Dot", each previewed in place with two chips of its own, the
// picked one marked; picked, every #tag chip takes it: a note's words, its Properties, quick capture.
//
//   npx electron-vite build --outDir out-h
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-h/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox SHOTS=<dir> node qa/tag-look.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, v, send, page, errors, close } = c
const SHOTS = process.env.SHOTS
const shot = (name, on = h) => SHOTS && on.screenshot({ path: `${SHOTS}/${name}.png` }).catch(() => {})
// Every tag chip in a window, as drawn: its fill, and the dot before its name.
const chips = (on) => on.evaluate(() => [...document.querySelectorAll('[data-tag-chip], .tiptap-token[data-token="tag"]')].map((one) => {
  const s = getComputedStyle(one)
  const dot = getComputedStyle(one, '::before')
  return { tag: one.dataset.tagChip ?? one.textContent, fill: s.backgroundColor, dot: dot.content !== 'none' && dot.content !== 'normal' ? dot.backgroundColor : null }
}))
const clear = (fill) => fill === 'rgba(0, 0, 0, 0)' || fill === 'transparent'
try {
  const id = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph' }] } }))
  await h.evaluate((id) => window.api.captures.save(id, { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Probe line #probelook and #ideas' }] }] }, tags: ['probelook', 'ideas'] }), id)
  await v('tag:set', 'probelook', { color: 'purple' })

  // Settings: both looks drawn, the picked one marked.
  await send('view', 'settings')
  await h.waitForTimeout(1500)
  await h.click('[data-section="Appearance"]').catch(() => {})
  await h.waitForTimeout(700)
  const group = h.locator('[data-choices="Tag look"]')
  await group.scrollIntoViewIfNeeded()
  const samples = await h.evaluate(() => [...document.querySelectorAll('[data-tag-look-sample]')].map((one) => ({ id: one.dataset.tagLookSample, chips: one.children.length, checked: one.closest('[role=radio]')?.getAttribute('aria-checked') })))
  check('Settings shows "Solid" and "Dot", two chips each', samples.length === 2 && samples.every((one) => one.chips === 2), JSON.stringify(samples))
  check('"Solid" is marked by default', samples.find((one) => one.id === 'solid')?.checked === 'true')
  await shot('settings-solid')
  await group.locator('[data-choice="dot"]').click()
  await h.waitForTimeout(500)
  check('a click on "Dot" keeps it', (await v('settings')).tagLook === 'dot')
  check('and marks it', (await h.locator('[data-choice="dot"]').getAttribute('aria-checked')) === 'true')
  check('and the app wears it', (await h.evaluate(() => document.documentElement.dataset.tagLook)) === 'dot')
  await shot('settings-dot')

  // A note's page: its words' tags and its Properties' chips.
  await send('capture', id)
  await h.waitForTimeout(1800)
  let got = await chips(h)
  check('a note\'s page shows its tags', got.length >= 2, JSON.stringify(got))
  check('Dot: every chip on the page is an outline with a coloured dot', got.length > 0 && got.every((one) => clear(one.fill) && one.dot && !clear(one.dot)), JSON.stringify(got))
  await shot('note-dot-light')

  // Quick capture: a tag typed in.
  await page.evaluate(() => window.api.haligtree?.('box:show')).catch(() => {})
  const editor = page.locator('.ProseMirror').first()
  if (await editor.count()) {
    await editor.click().catch(() => {})
    await page.keyboard.type('Check #ideas today ')
    await page.waitForTimeout(600)
    const box = await chips(page)
    check('quick capture: a typed tag is a dot chip too', box.length > 0 && box.every((one) => clear(one.fill) && one.dot), JSON.stringify(box))
    await page.keyboard.press('Meta+a')
    await page.keyboard.press('Backspace')
  } else check('quick capture: an editor to type in', false)

  // Back to "Solid": the colour's wash again, no dot.
  await v('settings:set', { tagLook: 'solid' })
  await h.waitForTimeout(600)
  got = await chips(h)
  check('Solid: every chip filled again, no dot', got.length > 0 && got.every((one) => !one.dot && !clear(one.fill)), JSON.stringify(got))

  // Dark too.
  await v('settings:set', { tagLook: 'dot' })
  await c.theme('dark')
  await send('capture', id)
  await h.waitForTimeout(1500)
  got = await chips(h)
  check('dark: every chip an outline with a dot', got.length > 0 && got.every((one) => clear(one.fill) && one.dot), JSON.stringify(got))
  await shot('note-dot-dark')
  await send('view', 'settings')
  await h.waitForTimeout(1200)
  await h.click('[data-section="Appearance"]').catch(() => {})
  await h.waitForTimeout(700)
  await h.locator('[data-choices="Tag look"]').scrollIntoViewIfNeeded()
  await shot('settings-dot-dark')
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (e) {
  check('ran to the end', false, e.message)
} finally {
  await close()
  done()
}

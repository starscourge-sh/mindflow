// The two must-fix items from the 17 Nov editor and prompt critiques, plus the kind menu's word.
// 1. The pill's right end is a Keep button, and a click keeps the line.
// 2. With Vim on, the editor names the mode.
// 3. The kind menu says kind, not type.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-skills/main/index.js HALIGTREE_QA_AWAY=1 node qa/handover-skills.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, seeded: false })
const { page, h, v } = c
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await page.evaluate(() => { localStorage.setItem('vim', 'on'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: 'on' })) })
  await h.evaluate(() => { localStorage.setItem('vim', 'on'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: 'on' })) })
  await page.evaluate(() => window.api.hidePrompt())
  await wait(400)
  await page.evaluate(() => window.api.showPrompt())
  let pill = { keep: '', vim: '', pill: false, box: '' }
  for (let i = 0; i < 8 && !pill.pill; i++) {
    await wait(400)
    pill = await page.evaluate(() => ({
      keep: document.querySelector('[data-pill-keep]')?.innerText.replace(/\s+/g, ' ').trim() ?? '',
      vim: document.querySelector('[data-vim-status]')?.textContent ?? '',
      pill: !!document.querySelector('.app-container[data-pill]'),
      box: document.querySelector('.app-container')?.getAttributeNames().filter((n) => n.startsWith('data-')).map((n) => `${n}=${document.querySelector('.app-container').getAttribute(n)}`).join(' ') ?? 'no box'
    }))
  }
  if (pill.pill) {
    await page.click(EDITOR)
    // The box was already open when Vim was turned on, so it is in normal and a letter would be swallowed.
    await page.keyboard.press('i')
    await page.keyboard.type('Fee')
    await wait(250)
    pill = await page.evaluate(() => ({
      keep: document.querySelector('[data-pill-keep]')?.innerText.replace(/\s+/g, ' ').trim() ?? '',
      vim: document.querySelector('[data-vim-status]')?.textContent ?? '',
      shown: getComputedStyle(document.querySelector('[data-vim-status]') ?? document.body).display !== 'none',
      pill: !!document.querySelector('.app-container[data-pill]'),
      box: ''
    }))
  }
  if (process.env.QA_SHOTS) await page.screenshot({ path: `${process.env.QA_SHOTS}/pill.png` }).catch(() => {})
  check('the pill names Keep, and the mode word stays off that one line', /Keep/.test(pill.keep) && pill.pill && pill.shown === false, JSON.stringify(pill))
  if (pill.pill && pill.keep) {
    await page.click('[data-pill-keep]', { timeout: 4000 })
    await wait(700)
    const kept = await page.evaluate(async () => {
      const list = await window.api.captures.list()
      return list.map((one) => `${one.kind ?? ''} ${one.label ?? ''} ${one.title ?? ''}`).join(' | ')
    })
    check('a click on Keep keeps the line', /\bFee\b/.test(kept), kept.slice(0, 180) || 'nothing kept')
  } else {
    check('a click on Keep keeps the line', false, 'no Keep button on the pill')
  }
  await page.evaluate(() => window.api.showPrompt())
  await wait(500)
  const kind = page.locator('[data-pill-kind]')
  if (await kind.count()) await kind.click({ force: true, timeout: 4000 })
  await wait(600)
  const chip = page.locator('[data-kind-chip]')
  if (await chip.count()) await chip.first().click({ force: true, timeout: 4000 })
  await wait(300)
  const said = await page.evaluate(() => [...document.querySelectorAll('[placeholder]')].map((el) => el.getAttribute('placeholder')).join(' | '))
  check('the kind menu says kind', said.includes('Change kind…'), said || 'no placeholder')
  const intro = h.locator('[data-skip-intro]')
  if (await intro.count()) await intro.click({ force: true, timeout: 2000 }).catch(() => {})
  await wait(1200)
  for (let n = 0; n < 2; n++) {
    if (await h.evaluate(() => !document.querySelector('[role=dialog]'))) break
    const skip = h.locator('[data-skip]')
    if (await skip.count()) await skip.click({ force: true, timeout: 2000 }).catch(() => {})
    await wait(800)
  }
  await wait(3200)
  const id = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A page for the mode word' }] }] } }))
  await page.evaluate((note) => window.api.openInHome('capture', note), id)
  await wait(1800)
  if (process.env.QA_SHOTS) await h.screenshot({ path: `${process.env.QA_SHOTS}/note.png` }).catch(() => {})
  const seen = await h.evaluate(() => {
    const editors = [...document.querySelectorAll('.tiptap.ProseMirror.haligtree-editor')]
    const status = [...document.querySelectorAll('[data-vim-status]')]
    return {
      url: location.pathname + location.search.slice(0, 40),
      editors: editors.length,
      status: status.map((el) => el.textContent).join(','),
      dialog: document.querySelector('[role=dialog]')?.innerText?.slice(0, 40) ?? ''
    }
  })
  const place = await h.evaluate(() => {
    const el = document.querySelector('[data-vim-status]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { t: el.textContent ?? '', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), vh: innerHeight }
  })
  await h.evaluate(() => document.querySelector('.tiptap.ProseMirror.haligtree-editor:not(.is-line)')?.focus())
  await h.keyboard.press('i')
  await wait(250)
  const after = await h.evaluate(() => document.querySelector('[data-vim-status]')?.textContent ?? '')
  const onScreen = !!place && place.y > 40 && place.y < place.vh - 8 && place.w > 8
  check('a note names Vim’s mode, and i changes it', place?.t === 'Normal' && after === 'Insert' && onScreen, `${place?.t || 'none'} -> ${after || 'none'} ${JSON.stringify(place)}`)
} catch (error) {
  check('the run finished', false, error instanceof Error ? error.message.split('\n')[0] : String(error))
} finally {
  await c.close?.()
}
done()

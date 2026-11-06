// The Rules' checks for tabs, with a real pointer and real keys. One hover, one surface: at most one floating thing as the
// pointer crosses every part of a tab row and every line of a tab's menu, and never a tip on a menu line. One act, one sound:
// open, close, switch, move and reopen each ask for one cue (run on a dev build too, for StrictMode's double effects).
// Motion off and Reduce motion: a press moves nothing. Keys: ← → and ⌫ on a tab with the keys.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-dev/main/index.js HALIGTREE_QA_AWAY=1 node qa/tabs-hover-sound.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 880 })
const { h, v, go } = c
const wait = (ms = 400) => h.waitForTimeout(ms)
const row = (name) => h.locator(`[data-side-row][aria-label="${name}"]`).first()
const floating = () => h.evaluate(() => {
  const shown = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > 0.05 }
  return {
    tips: [...document.querySelectorAll('[role="tooltip"], [data-slot="tooltip-content"]')].filter(shown).length,
    cards: [...document.querySelectorAll('[data-note-preview], [data-peek-card], [data-pair-card]')].filter(shown).length
  }
})
const centre = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
const cued = () => h.evaluate(() => { const all = window.haligtreeCued.slice(); window.haligtreeCued.length = 0; return all })
/** One act: what it asked to hear. */
const act = async (name, run) => {
  await h.mouse.move(700, 600); await wait(150)
  await cued()
  await run()
  await wait(700)
  const heard = await cued()
  check(`${name}: one sound`, heard.length === 1, heard.join() || 'none')
}
try {
  await v('settings:set', { hintRate: 0 })
  const article = (await v('items', 'article')).find((one) => one.title?.length > 30)
  await c.send('article', article.id); await wait(1500)
  await row('Calendar').click({ modifiers: ['Meta'] }); await wait(500)
  await row('Tasks').click({ modifiers: ['Meta'] }); await wait(500)
  await row('Goals').click({ modifiers: ['Alt'] }); await wait(800)
  await h.keyboard.press('Control+h'); await wait(300)

  // --- one hover, one surface: every part of each row, resting long enough for a tip
  let worst = 0
  const seen = []
  for (const sel of ['[data-tab-arrows] button:not([disabled])', '[data-tab] [role="tab"]', '[data-tab-close]', '[data-tab-add]', '[data-tab-all]']) {
    const all = h.locator(sel)
    for (let i = 0, n = await all.count(); i < n; i++) {
      const box = await all.nth(i).boundingBox()
      if (!box) continue
      await h.mouse.move(box.x + box.width / 2 - 4, box.y + box.height / 2)
      await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 })
      await wait(800)
      const now = await floating()
      worst = Math.max(worst, now.tips + now.cards)
      seen.push(`${sel}#${i}:${now.tips}/${now.cards}`)
    }
  }
  check('across every part of the rows, one floating thing at most', worst <= 1, seen.filter((one) => !one.endsWith(':0/0')).join(' '))

  // Sliding straight along the row: each tip gives way to the next.
  const tabs = h.locator('[data-tab] [role="tab"]')
  const first = await tabs.first().boundingBox()
  await h.mouse.move(first.x + 10, first.y + 10); await wait(800)
  let most = 0
  for (let x = first.x; x < first.x + 900; x += 30) { await h.mouse.move(x, first.y + 12); await wait(60); const now = await floating(); most = Math.max(most, now.tips + now.cards) }
  check('sliding along the row, never two at once', most <= 1, String(most))

  // The tab's menu: every line, a real pointer, no tip or card on a line.
  await h.locator('[data-tab-on]').first().click({ button: 'right' })
  await h.locator('[role="menu"] [role="menuitem"]').first().waitFor({ timeout: 8000 })
  const lines = h.locator('[role="menu"] [role="menuitem"]')
  const n = await lines.count()
  let onLine = 0
  for (let i = 0; i < n; i++) {
    const box = await lines.nth(i).boundingBox()
    await h.mouse.move(box.x + 30, box.y + box.height / 2, { steps: 2 }); await wait(750)
    const now = await floating()
    onLine = Math.max(onLine, now.tips + now.cards)
  }
  check(`a note tab's menu, all ${n} lines: no tip or card on a line`, onLine === 0 && n > 4, String(onLine))
  const dots = await h.locator('[role="menu"]').last().locator('[role^="menuitem"]').evaluateAll((all) => all.filter((one) => !one.querySelector('svg, img, [data-menu-icon]') || one.querySelector('.lucide-dot')).map((one) => one.textContent))
  check('every line has its own icon', dots.length === 0, dots.join(' | '))
  await h.keyboard.press('Escape'); await wait(300)

  // --- the fade clears the ✕
  const air = await h.evaluate(() => {
    const tab = document.querySelector('[data-tab-on]')
    const name = tab.querySelector('[data-tab-name]').getBoundingClientRect()
    const x = tab.querySelector('[data-tab-close]').getBoundingClientRect()
    return Math.round(x.left - name.right)
  })
  check('the open tab\'s name ends clear of its ✕', air >= 4, `${air}px`)

  // --- one act, one sound (note tabs turn a page, heard as their own sound, so places here)
  await h.keyboard.press('Control+l'); await wait(300)
  // Whatever the first visit to the Day page has to say once (a getting-started step ticked) is its own, not the tab's.
  await h.locator('[data-pane-front] [data-tab-add]').click(); await wait(800)
  await h.keyboard.press('Control+w'); await wait(500)
  await act('open with +', () => h.locator('[data-pane-front] [data-tab-add]').click())
  await act('close with ✕', () => h.locator('[data-pane-front] [data-tab-on] [data-tab-close]').click())
  await act('open with ⌘T', () => h.keyboard.press('Meta+t'))
  await act('close with ⌃W', () => h.keyboard.press('Control+w'))
  await act('open with ⌘-click', () => row('Review').click({ modifiers: ['Meta'] }))
  await act('reopen after closing', async () => { await h.keyboard.press('Control+w'); await wait(500); await cued(); await h.keyboard.press('Meta+Shift+t') })
  await act('switch by a click', () => h.locator('[data-pane-front] [data-tab]:not([data-tab-on]) [role="tab"]').first().click())
  await act('switch with ⌃Tab', () => h.keyboard.press('Control+Tab'))
  const dragTo = async (from, to) => { await h.mouse.move(from.x, from.y); await h.mouse.down(); for (let i = 1; i <= 8; i++) { await h.mouse.move(from.x + (to.x - from.x) * i / 8, from.y + (to.y - from.y) * i / 8); await wait(40) } await h.mouse.up() }
  await act('move along its row', async () => { const all = h.locator('[data-pane-front] [data-tab]'); await dragTo(await centre(all.first()), await centre(all.last())) })
  await act('move to another row', async () => {
    const left = await h.evaluate(() => [...document.querySelectorAll('[data-pane]')].find((el) => !el.hasAttribute('data-pane-front')).getAttribute('data-pane'))
    await dragTo(await centre(h.locator('[data-pane-front] [data-tab]').first()), await centre(h.locator(`[data-tab-row="${left}"]`)))
  })

  // --- keys on a tab with the keys
  const keyTabs = h.locator('[data-pane-front] [data-tab] [role="tab"]')
  await keyTabs.first().focus()
  await h.keyboard.press('ArrowRight'); await wait(150)
  const moved = await h.evaluate(() => document.activeElement?.closest('[data-tab]')?.getAttribute('data-drag-title'))
  check('→ on a tab moves the keys to the next', moved === await h.locator('[data-pane-front] [data-tab]').nth(1).getAttribute('data-drag-title'), String(moved))
  await h.keyboard.press('Enter'); await wait(400)
  check('↵ opens it', (await h.locator('[data-pane-front] [data-tab-on]').getAttribute('data-drag-title')) === moved)
  const count = await h.locator('[data-pane-front] [data-tab]').count()
  await h.locator('[data-pane-front] [data-tab-on] [role="tab"]').focus()
  await h.keyboard.press('Backspace'); await wait(500)
  check('⌫ on a tab closes it', (await h.locator('[data-pane-front] [data-tab]').count()) === count - 1)

  // --- Motion off, Reduce motion: pressed, a tab does not move
  const pressed = async () => {
    const tab = h.locator('[data-tab]:not([data-tab-on]) [role="tab"]').first()
    const at = await centre(tab)
    await h.mouse.move(at.x, at.y)
    await h.mouse.down(); await wait(220)
    const scale = await tab.evaluate((el) => getComputedStyle(el).scale)
    await h.mouse.move(at.x, at.y + 300); await h.mouse.up(); await h.keyboard.press('Escape'); await wait(300)
    return scale
  }
  await h.locator('[data-tab]').first().hover()
  const ordinary = await pressed()
  check('at rest settings, a press is 0.97', ordinary === '0.97', ordinary)
  await v('settings:set', { motion: false }); await wait(500)
  const off = await pressed()
  check('Motion off: a press does not move', off === 'none' || off === '1', off)
  const settled = async () => {
    await row('Stats').click({ modifiers: ['Meta'] })
    await h.waitForTimeout(30)
    const transform = await h.evaluate(() => { const p = document.querySelector('[data-pane-front] [data-page]') ?? document.querySelector('[data-page]'); return p ? getComputedStyle(p).transform : 'none' })
    await wait(400); await h.keyboard.press('Control+w'); await wait(300)
    return transform
  }
  check('Motion off: a new tab\'s page does not settle in', ['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(await settled()))
  await v('settings:set', { motion: true }); await wait(500)
  await h.emulateMedia({ reducedMotion: 'reduce' }); await wait(300)
  const reduce = await pressed()
  check('Reduce motion: a press does not move', reduce === 'none' || reduce === '1', reduce)
  await h.emulateMedia({ reducedMotion: null })
} finally {
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5).join('\n'))
  await c.close()
}
done()

// In a narrow window every page's header line folds its actions behind one ⋯,
// and that ⋯ opens a real menu: rows with words (and an icon each), never the
// old panel of bare buttons. Pressing a row does what the button does
// (Writing's "New page" makes a page). Then the "more below" pill: on the
// Settings page it shows while there is more under the fold, scrolls a
// screenful when pressed, and is gone at the end.
//   QA_DATA=<copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<dir>] node qa/header-menu.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const c = await sandbox({ width: 560, height: 820 })
const { h, go, close, both } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => h.waitForTimeout(ms)
const shut = () => h.keyboard.press('Escape').then(() => wait(250))
// The header's ⋯ (FitActions), opened, and what it holds.
const fold = async () => {
  const more = h.locator('header [data-fit-more]').first()
  if (!(await more.count())) return null
  await more.click()
  await wait(400)
  return h.evaluate(() => {
    const menu = document.querySelector('[data-fit-menu]')
    const cloud = document.querySelector('[data-slot="popover-content"] button')
    if (!menu) return { menu: false, cloud: !!cloud }
    const rows = [...menu.querySelectorAll('[role^="menuitem"]')]
    return {
      menu: menu.getAttribute('role') === 'menu',
      cloud: !!cloud,
      words: rows.map((one) => one.textContent.trim()),
      bare: rows.filter((one) => !one.textContent.trim()).length,
      iconless: rows.filter((one) => !one.querySelector('svg')).map((one) => one.textContent.trim())
    }
  })
}
try {
  await h.evaluate(() => window.api.haligtree('settings:set', { hintRate: 0 }))
  const pages = [['inbox'], ['articles', 'Writing'], ['nuggets', 'Gems'], ['questions'], ['today', 'Tasks'], ['goals'], ['sources'], ['media', 'Files'], ['feed'], ['queue'], ['discarded', 'Bin'], ['day', 'Journal'], ['monthpage', 'Month'], ['weekpage', 'Week']]
  let menus = 0
  for (const [id, name = id] of pages) {
    await go(id)
    await wait(600)
    const f = await fold()
    if (!f) { console.log(`  ${name}: the line fits at this width, no ⋯`); continue }
    menus++
    check(`${name}: the header's ⋯ is a menu of rows with words, not a panel of bare buttons`, f.menu && !f.cloud && f.words.length > 0 && f.bare === 0, JSON.stringify(f.words))
    check(`${name}: every row has its icon`, f.iconless?.length === 0, JSON.stringify(f.iconless))
    if (SHOT && (id === 'articles' || id === 'today')) await both(`${SHOT}/menu-${name}`)
    await shut()
  }
  check('the ⋯ menu showed on most pages at 560px', menus >= 8, `${menus} of ${pages.length}`)
  // A row does what its button does: Writing's "New page" makes a page.
  await go('articles')
  // Counted as the app counts them: the editors open in the window (a new page opens at once beside the list).
  const editors = () => h.evaluate(() => document.querySelectorAll('.tiptap.ProseMirror').length)
  const before = await editors()
  if (await fold()) {
    await h.locator('[data-fit-menu] [role="menuitem"]', { hasText: 'New page' }).first().click()
    await wait(1200)
    const after = await editors()
    check('Writing: "New page" from the ⋯ menu makes a page and opens it', after > before, `editors open ${before} → ${after}`)
    await h.keyboard.press('Escape'); await wait(300)
  }
  // Sort as a submenu, naming the order and listing the others.
  await go('inbox')
  await wait(600)
  if (await fold()) {
    const sort = h.locator('[data-fit-menu] [data-fold-sort]')
    check('Inbox: Sort is a submenu in the ⋯ menu, naming the order', (await sort.count()) === 1, await sort.textContent({ timeout: 2000 }).catch(() => ''))
    await sort.hover({ timeout: 3000 }).catch(() => {}); await wait(500)
    const options = await h.locator('[role="menuitemradio"]').allTextContents()
    check('Inbox: the Sort submenu lists the orders', options.length >= 2, JSON.stringify(options))
    if (SHOT) await h.screenshot({ path: `${SHOT}/menu-sort-sub.png` })
    await shut(); await shut()
  } else check('Inbox: the ⋯ is there to open', false)

  // "More below" on Settings, in a short window.
  await c.size(900, 520)
  await go('settings')
  await wait(800)
  // Settings' own pill, beside its scrolling column (the sidebar may show its own too, at the window's left).
  const pill = h.locator('.mf-more ~ [data-more-below] button')
  check('Settings: the ↓ pill shows while there is more below', (await pill.count()) === 1, `${await h.locator('[data-more-below] button').count()} pills in the window`)
  const top0 = await h.evaluate(() => document.querySelector('[data-more-below]')?.previousElementSibling?.scrollTop ?? -1)
  const box = await h.evaluate(() => { const s = [...document.querySelectorAll('.mf-more')].find((one) => one.scrollHeight > one.clientHeight + 8); return s ? { top: s.scrollTop, h: s.clientHeight } : null })
  if (SHOT) await both(`${SHOT}/more-below-settings`)
  await pill.click()
  await wait(900)
  const box1 = await h.evaluate(() => { const s = [...document.querySelectorAll('.mf-more')].find((one) => one.scrollHeight > one.clientHeight + 8); return s ? { top: s.scrollTop, h: s.clientHeight } : null })
  check('Settings: pressed, it scrolls about a screenful', box && box1 && box1.top - box.top > box.h * 0.5, `${box?.top} → ${box1?.top} (box ${box?.h}px; ${top0})`)
  await h.evaluate(() => { const s = [...document.querySelectorAll('.mf-more')].find((one) => one.scrollHeight > one.clientHeight + 8); if (s) s.scrollTop = s.scrollHeight })
  await wait(700)
  check('Settings: at the end the pill is gone', (await pill.count()) === 0)
  if (SHOT) await h.screenshot({ path: `${SHOT}/more-below-end.png` })
  // Reached by Tab like any button.
  await h.evaluate(() => { const s = [...document.querySelectorAll('.mf-more')].find((one) => one.scrollHeight > one.clientHeight + 8); if (s) s.scrollTop = 0 })
  await wait(700)
  const focusable = await h.evaluate(() => { const b = document.querySelector('.mf-more ~ [data-more-below] button'); return !!b && b.tabIndex >= 0 })
  check('Settings: the pill can be reached with Tab', focusable)
  check('no page errors', !c.errors.some((e) => e.includes('PAGEERROR')), c.errors.filter((e) => e.includes('PAGEERROR')).join(' | '))
} catch (error) {
  check(`ran to the end`, false, String(error?.message ?? error).split('\n')[0])
} finally {
  const passed = results.filter(Boolean).length
  console.log(`\n${passed}/${results.length} passed`)
  await close()
  process.exit(passed === results.length && results.length ? 0 : 1)
}

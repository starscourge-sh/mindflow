// Pictures of the shell for a person to look over: quick capture (its tabs,
// the kind picker, the gear menu), the sidebar (left, right, peek, Customize),
// ⌘K, the shortcut sheet, Settings, the welcome and a tip, small and large,
// light and dark. Also lists every control under 24px tall or wide.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/shell-walk.mjs
import { mkdirSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS ?? '/tmp/shell-walk'
mkdirSync(SHOTS, { recursive: true })
const c = await sandbox({ width: 1400, height: 900 })
const { h, page: box, v, go, size } = c
const shot = async (w, name) => { await w.waitForTimeout(450); await w.screenshot({ path: `${SHOTS}/${name}.png` }).catch((e) => console.log('no shot', name, e.message)) }
const esc = async (w) => { await w.keyboard.press('Escape'); await w.waitForTimeout(300) }
// Controls smaller than a 24px target, with what they are.
const small = (w, where) => w.evaluate((where) => [...document.querySelectorAll('button, [role=button], [role=menuitem], [role=tab], a[href], input[type=checkbox], [role=switch]')]
  .map((one) => {
    const r = one.getBoundingClientRect()
    // An invisible ring (::after, absolute, negative inset) counts: it is what the pointer hits.
    const a = getComputedStyle(one, '::after')
    const out = (side) => (a.content !== 'none' && a.position === 'absolute' ? Math.max(0, -parseFloat(a[side]) || 0) : 0)
    return { one, r: { top: r.top, width: r.width + out('left') + out('right'), height: r.height + out('top') + out('bottom') } }
  }).filter(({ r }) => r.width && r.height && (r.width < 24 || r.height < 24) && r.top >= 0 && r.top < innerHeight)
  .map(({ one, r }) => `${where}: ${Math.round(r.width)}x${Math.round(r.height)} ${(one.getAttribute('aria-label') ?? one.textContent ?? '').trim().slice(0, 40)}`), where)
const tiny = new Set()
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  for (const theme of ['light', 'dark']) {
    await c.theme(theme)
    for (const [label, w, hh] of [['large', 1400, 900], ['small', 820, 560]]) {
      const t = `${theme}-${label}`
      await size(w, hh)
      await go('home'); await shot(h, `${t}-home`)
      for (const one of await small(h, 'home')) tiny.add(one)
      // A tip, on the first sidebar row.
      const row = h.locator('[data-slot=tooltip-trigger]').first()
      await row.hover().catch(() => {}); await h.waitForTimeout(1000); await shot(h, `${t}-tip`); await h.mouse.move(700, 450)
      // ⌘K.
      await h.keyboard.press('Meta+k'); await shot(h, `${t}-cmdk`)
      await h.keyboard.type('set'); await shot(h, `${t}-cmdk-typed`); await esc(h); await esc(h)
      // The shortcut sheet.
      await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:shortcuts'))); await shot(h, `${t}-shortcuts`)
      for (const one of await small(h, 'shortcuts')) tiny.add(one)
      await esc(h)
      // Settings, down the page.
      await go('settings'); await shot(h, `${t}-settings-1`)
      for (const one of await small(h, 'settings')) tiny.add(one)
      for (let i = 2; i <= 6; i++) {
        await h.evaluate(() => { const s = [...document.querySelectorAll('[data-page=settings] *')].find((one) => one.scrollHeight > one.clientHeight + 40 && getComputedStyle(one).overflowY !== 'visible'); s?.scrollBy(0, s.clientHeight * 0.85) })
        await shot(h, `${t}-settings-${i}`)
        for (const one of await small(h, 'settings')) tiny.add(one)
      }
      // The sidebar on the right, then hidden with its peek.
      await go('today')
      await v('settings:set', { sidebarSide: 'right' }); await h.waitForTimeout(600); await shot(h, `${t}-sidebar-right`)
      await v('settings:set', { sidebarSide: 'left' }); await h.waitForTimeout(600)
      await h.keyboard.press('Meta+b'); await h.waitForTimeout(500)
      await h.mouse.move(2, 300, { steps: 3 }); await h.waitForTimeout(700); await shot(h, `${t}-sidebar-peek`)
      await h.mouse.move(700, 300); await h.keyboard.press('Meta+b'); await h.waitForTimeout(500)
      // Customize.
      const wrench = h.locator('button:has(svg.lucide-wrench)').first()
      if (await wrench.count()) { await wrench.click({ force: true }); await shot(h, `${t}-customize`); for (const one of await small(h, 'customize')) tiny.add(one); await esc(h) }
      // The welcome.
      await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome'))); await h.waitForTimeout(1500); await shot(h, `${t}-welcome`)
      for (const one of await small(h, 'welcome')) tiny.add(one)
      await esc(h); await h.reload(); await h.waitForTimeout(1500)
    }
    // Quick capture: each tab, the kind picker, the gear menu.
    await box.reload(); await box.waitForTimeout(1200)
    await box.evaluate(() => window.api.showPrompt()); await box.waitForTimeout(900)
    await shot(box, `${theme}-box`)
    for (const one of await small(box, 'box')) tiny.add(one)
    await box.locator('.ProseMirror').first().click().catch(() => {})
    await box.keyboard.type('Read Frankenstein by Friday https://example.com/frankenstein'); await shot(box, `${theme}-box-typed`)
    const chip = box.locator('[data-kind-chip]').first()
    if (await chip.count()) { await chip.click(); await shot(box, `${theme}-box-kinds`); for (const one of await small(box, 'kind picker')) tiny.add(one); await esc(box) }
    const gear = box.getByRole('button', { name: 'Actions' }).first()
    if (await gear.count()) { await gear.click(); await shot(box, `${theme}-box-gear`); for (const one of await small(box, 'gear menu')) tiny.add(one); await esc(box) }
    await box.evaluate(() => document.activeElement?.blur())
    for (const key of ['1', '2', '3', '4', '5']) { await box.keyboard.press(`Control+${key}`); await box.waitForTimeout(500); await shot(box, `${theme}-box-tab${key}`); for (const one of await small(box, `box tab ${key}`)) tiny.add(one) }
    await box.locator('.ProseMirror').first().click().catch(() => {})
    await box.keyboard.press('Meta+a'); await box.keyboard.press('Backspace')
    // The box made small.
    await c.electron.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((one) => !one.webContents.getURL().includes('view=')); const b = w.getBounds(); w.setBounds({ ...b, width: 480, height: 300 }) })
    await shot(box, `${theme}-box-small`)
    const chip2 = box.locator('[data-kind-chip]').first()
    if (await chip2.count()) { await chip2.click(); await shot(box, `${theme}-box-small-kinds`); await esc(box) }
    await esc(box)
  }
  // Increase contrast: the quiet words get darker.
  const muted = () => h.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground').trim())
  const plain = await muted()
  await h.emulateMedia({ contrast: 'more' })
  const more = await muted()
  console.log(`${plain !== more ? 'PASS' : 'FAIL'}  Increase contrast changes the quiet words  (${plain} → ${more})`)
  await go('settings'); await shot(h, 'contrast-settings')
  await h.emulateMedia({ contrast: 'no-preference' })
  // Worst case: one long word with no spaces, and the window at its smallest.
  await box.evaluate(() => window.api.showPrompt()); await box.waitForTimeout(800)
  await box.locator('.ProseMirror').first().click().catch(() => {})
  await box.keyboard.type('Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(5))
  const wide = await box.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
  console.log(`${!wide ? 'PASS' : 'FAIL'}  a 225-letter word never makes quick capture scroll sideways`)
  await shot(box, 'box-long-word')
  await box.keyboard.press('Meta+a'); await box.keyboard.press('Backspace')
  // Tabs pressed fast, then the last one wins.
  await box.evaluate(() => document.activeElement?.blur())
  for (let i = 0; i < 3; i++) for (const key of ['1', '2', '3', '4', '5']) await box.keyboard.press(`Control+${key}`)
  await box.keyboard.press('Control+2'); await box.waitForTimeout(700)
  const tab = await box.evaluate(() => document.querySelector('[role=tab][aria-selected=true], [role=tab][data-state=active]')?.textContent?.trim() ?? '')
  console.log(`${/^Tasks/.test(tab) ? 'PASS' : 'FAIL'}  fifteen fast tab keys, then ⌃2: Tasks is the tab on show  (${tab})`)
  await shot(box, 'box-fast-tabs')
  await esc(box)
  await size(500, 380); await go('home'); await shot(h, 'home-smallest')
  const sideways = await h.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
  console.log(`${!sideways ? 'PASS' : 'FAIL'}  the main window at 500 by 380 never scrolls sideways`)
  console.log([...tiny].join('\n'))
  if (c.errors.length) console.log('ERRORS\n' + c.errors.slice(0, 10).join('\n'))
} finally {
  await c.close()
}

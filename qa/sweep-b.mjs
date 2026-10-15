// Nothing that matters is small and grey, every mark and icon button has a
// name, every hover-only action is reachable without hovering, and no menu
// scrolls in a 1100x600 window (the quick capture box is 600 high).
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 [SHOT=<dir>] [AUDIT=1] node qa/sweep-b.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOT = process.env.SHOT ?? ''
const AUDIT = !!process.env.AUDIT
if (SHOT) mkdirSync(SHOT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1100, height: 600 })
const { h, v, go, page } = c
const wait = (ms) => h.waitForTimeout(ms)
// paper (light), dark, brutal (Brutal style over paper).
const wear = async (name) => {
  await h.evaluate((n) => { localStorage.setItem('theme', n === 'brutal' ? 'paper' : n); localStorage.setItem('style', n === 'brutal' ? 'brutal' : 'soft') }, name)
  await h.reload(); await wait(1500)
}

// In the page: colour as rgba through a canvas (oklch, color-mix and the rest
// all come out as pixels), the colour behind an element, and the WCAG ratio.
const TOOLS = () => {
  if (window.__sb) return
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const rgba = (css) => {
    ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return [r, g, b, a / 255]
  }
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1)
  const back = (el) => {
    const layers = []
    for (let at = el; at && at.nodeType === 1; at = at.parentElement) {
      const bg = rgba(getComputedStyle(at).backgroundColor)
      if (bg[3] > 0) { layers.push(bg); if (bg[3] >= 1) break }
    }
    let base = layers.length && layers.at(-1)[3] >= 1 ? layers.pop() : rgba(getComputedStyle(document.body).backgroundColor)
    if (base[3] < 1) base = [255, 255, 255, 1]
    for (const layer of layers.reverse()) base = over(layer, base)
    return base
  }
  const lum = ([r, g, b]) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const opacity = (el) => { let o = 1; for (let at = el; at && at.nodeType === 1; at = at.parentElement) o *= Number(getComputedStyle(at).opacity); return o }
  const ratio = (el) => {
    const bg = back(el)
    let fg = rgba(getComputedStyle(el).color)
    fg = [...fg.slice(0, 3), fg[3] * opacity(el)]
    const f = over(fg, bg)
    const [a, b] = [lum(f), lum(bg)].sort((x, y) => y - x)
    return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100
  }
  const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(el).visibility !== 'hidden' }
  const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || (el.getAttribute('aria-labelledby') ? document.getElementById(el.getAttribute('aria-labelledby'))?.textContent : '') || el.innerText || '').trim()
  window.__sb = { rgba, ratio, shown, name, opacity }
}

/** Every [data-important] text: its size and contrast. */
const important = (win) => win.evaluate(TOOLS).then(() => win.evaluate(() => [...document.querySelectorAll('[data-important]')].filter(window.__sb.shown).map((el) => ({
  what: el.getAttribute('data-important'), text: el.innerText.trim().slice(0, 40), size: parseFloat(getComputedStyle(el).fontSize), ratio: window.__sb.ratio(el)
}))))

/** Text of any kind that is under 13px or under 4.5:1, grouped by look (for the audit). */
const quiet = (win) => win.evaluate(TOOLS).then(() => win.evaluate(() => {
  const seen = new Map()
  for (const el of document.querySelectorAll('main *, [data-page] *, body > div *')) {
    if (!window.__sb.shown(el)) continue
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()
    if (!own) continue
    const size = parseFloat(getComputedStyle(el).fontSize)
    const ratio = window.__sb.ratio(el)
    if (size >= 13 && ratio >= 4.5) continue
    const key = `${size}px ${ratio < 4.5 ? 'LOW ' : ''}${(el.className?.baseVal ?? el.className ?? '').toString().split(' ').filter((c) => /text-|opacity/.test(c)).join(' ')}`
    const one = seen.get(key) ?? { key, count: 0, ratio, examples: [] }
    one.count++; one.ratio = Math.min(one.ratio, ratio)
    if (one.examples.length < 4 && !one.examples.includes(own.slice(0, 30))) one.examples.push(own.slice(0, 30))
    seen.set(key, one)
  }
  return [...seen.values()].sort((a, b) => b.count - a.count)
}))

/**
 * Buttons and marks with no name a screen reader could say: a control with
 * no words, or a mark named on a bare span or drawing (a name there is
 * skipped; it needs role=img).
 */
const nameless = (win) => win.evaluate(TOOLS).then(() => win.evaluate(() => [
  ...[...document.querySelectorAll('button, [role=button], a[href], [role=menuitem], [role=img], [data-mark]')]
    .filter((el) => window.__sb.shown(el) && !el.closest('[aria-hidden=true]') && !window.__sb.name(el)),
  // A rolling count (.slot-text) shows its own words; its label only repeats them.
  ...[...document.querySelectorAll('span[aria-label]:not([role], .slot-text), div[aria-label]:not([role]), svg[aria-label]:not([role])')]
    .filter((el) => window.__sb.shown(el) && !el.closest('[aria-hidden=true]'))
].map((el) => el.outerHTML.slice(0, 160))))

/** A hover-only button, focused from the keyboard: does it show? */
const showsOnFocus = (win) => win.evaluate(async () => {
  const hidden = [...document.querySelectorAll('button, [role=button]')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.top < innerHeight && r.bottom > 0 && window.__sb.opacity(el) < 0.05 })
  const out = []
  for (const el of hidden.slice(0, 12)) {
    el.focus({ focusVisible: true })
    await new Promise((done) => setTimeout(done, 260))
    out.push({ name: window.__sb.name(el).slice(0, 40), tab: el.tabIndex, shown: window.__sb.opacity(el) > 0.5 })
    el.blur()
  }
  return out
})

/** Actions drawn only while the pointer is over their row. */
const hoverOnly = (win) => win.evaluate(TOOLS).then(() => win.evaluate(() => [...document.querySelectorAll('button, [role=button]')]
  .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.top < innerHeight && r.bottom > 0 && window.__sb.opacity(el) < 0.05 })
  .map((el) => ({ name: window.__sb.name(el).slice(0, 40), tab: el.tabIndex, html: el.outerHTML.slice(0, 120) }))))

/** The open menu: does it scroll? */
const menuFits = (win) => win.evaluate(() => [...document.querySelectorAll('[role=menu]')].map((m) => ({ items: m.querySelectorAll('[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio]').length, height: Math.round(m.getBoundingClientRect().height), scrolls: m.scrollHeight > m.clientHeight + 1, top: Math.round(m.getBoundingClientRect().top), bottom: Math.round(m.getBoundingClientRect().bottom) })))

const VIEWS = (process.env.VIEWS ?? 'home,today,upcoming,all,matrix,inbox,review,goals,questions,nuggets,tags,settings,week').split(',')
const totals = { quiet: 0, nameless: 0, hoverOnly: 0, hoverOnlyUnreachable: 0, importantLow: 0, menusScrolling: 0 }
try {
  await v('settings:set', { hintRate: 0, countIn: false })
  // An overdue task with a deadline, so the important dates are on show.
  const old = new Date(Date.now() - 2 * 86400000).toISOString()
  const late = await v('task:add', 'Return the library books #sweepb', undefined, true)
  await v('task:save', late.id, { priority: 1, important: 1, due: old, deadline: new Date(Date.now() + 86400000).toISOString() })

  for (const theme of (process.env.THEMES ?? 'paper,dark,brutal').split(',')) {
    await wear(theme)
    for (const view of VIEWS) {
      await go(view); await wait(700)
      const q = await quiet(h); const n = await nameless(h); const ho = await hoverOnly(h); const imp = await important(h)
      const low = imp.filter((one) => one.size < 13 || one.ratio < 4.5)
      totals.quiet += q.reduce((s, one) => s + one.count, 0); totals.nameless += n.length; totals.hoverOnly += ho.length
      totals.importantLow += low.length
      if (AUDIT) {
        console.log(`\n== ${theme} ${view}: quiet ${q.reduce((s, one) => s + one.count, 0)}, nameless ${n.length}, hover-only ${ho.length}, important ${imp.length} (${low.length} low)`)
        for (const one of q.slice(0, 12)) console.log(`   quiet ${one.count}x ${one.key} min ${one.ratio}: ${one.examples.join(' | ')}`)
        for (const one of n.slice(0, 8)) console.log(`   nameless ${one}`)
        for (const one of ho.slice(0, 8)) console.log(`   hover-only tab=${one.tab} "${one.name}" ${one.html}`)
        for (const one of low) console.log(`   important LOW ${JSON.stringify(one)}`)
      }
      for (const one of low) check(`${theme} ${view}: "${one.text}" (${one.what}) is at least 13px and 4.5:1`, false, `${one.size}px ${one.ratio}:1`)
      if (imp.length && !low.length) check(`${theme} ${view}: ${imp.length} important lines at least 13px and 4.5:1`, true, `smallest ${Math.min(...imp.map((one) => one.size))}px, lowest ${Math.min(...imp.map((one) => one.ratio))}:1`)
      check(`${theme} ${view}: every icon button and mark has a name`, n.length === 0, n.slice(0, 3).join(' || '))
      if (theme === 'paper') {
        const focused = await showsOnFocus(h)
        const hiddenStill = focused.filter((one) => one.tab < 0 || !one.shown)
        totals.hoverOnlyUnreachable += hiddenStill.length
        if (focused.length) check(`${view}: ${focused.length} hover-only buttons are in the tab order and show when focused`, !hiddenStill.length, hiddenStill.map((one) => `${one.name} tab=${one.tab} shown=${one.shown}`).join(', '))
      }
      if (SHOT && theme !== 'brutal') await h.screenshot({ path: `${SHOT}/${theme}-${view}.png` })
    }
  }

  // Menus at 1100x600: right-click a task in Today and in the list of everything.
  await wear('paper')
  for (const [view, sel] of [['today', `[data-row][data-id="${late.id}"]`], ['home', `[data-drag-open="task:${late.id}"]`], ['all', '[data-row]'], ['matrix', `[data-row][data-id="${late.id}"]`], ['week', `[data-row][data-id="${late.id}"]`]]) {
    await go(view); await wait(600)
    const row = h.locator(sel).first()
    if (!(await row.count())) { check(`${view}: a row to right-click`, false); continue }
    await row.click({ button: 'right' }); await wait(450)
    const menus = await menuFits(h)
    if (AUDIT) console.log(`menu ${view}`, JSON.stringify(menus))
    if (!menus.length || menus.some((m) => m.scrolls || m.bottom > 600)) totals.menusScrolling++
    check(`${view}: the right-click menu fits a 600px window without scrolling`, menus.length && menus.every((m) => !m.scrolls && m.bottom <= 600), JSON.stringify(menus))
    // What shows only on pointing is in the menu too.
    const said = await h.evaluate(() => [...document.querySelectorAll('[role=menu] [role^=menuitem]')].map((one) => one.textContent.trim()))
    if (view !== 'all') check(`${view}: the task's menu offers How long it takes`, said.some((one) => one.startsWith('How long it takes')), said.join(' / '))
    if (view === 'today' || view === 'week') check(`${view}: the task's menu offers Add a thought (the hover button)`, said.some((one) => one.startsWith('Add a thought')), said.join(' / '))
    if (SHOT) await h.screenshot({ path: `${SHOT}/menu-${view}.png` })
    await h.keyboard.press('Escape'); await wait(250)
  }
  // With a session running on it, the menu still fits.
  await go('home'); await wait(600)
  const homeRow = h.locator(`[data-drag-open="task:${late.id}"]`).first()
  if (await homeRow.count()) {
    await homeRow.click({ button: 'right' }); await wait(450)
    await h.locator('[role=menu] [role=menuitem]', { hasText: 'Start a focus session' }).first().click(); await wait(1200)
    await homeRow.click({ button: 'right' }); await wait(450)
    const busy = await menuFits(h)
    if (busy.some((m) => m.scrolls || m.bottom > 600)) totals.menusScrolling++
    check('home, a session running: the menu still fits without scrolling', busy.length && busy.every((m) => !m.scrolls && m.bottom <= 600), JSON.stringify(busy))
    if (SHOT) await h.screenshot({ path: `${SHOT}/menu-running.png` })
    await h.keyboard.press('Escape'); await wait(250)
    const now = await v('focus:now')
    if (now) await v('session:abandon', now.id)
    await wait(500)
  }

  // Today written as a page: each line's Start, Time, Tomorrow and Open show on pointing, or on the line being written.
  await go('today'); await wait(700)
  const chip = (name) => h.evaluate((n) => [...document.querySelectorAll('[aria-pressed]')].find((one) => one.innerText.replace(/\s/g, '') === n)?.click(), name)
  await chip('Page'); await wait(1000)
  if (SHOT) await h.screenshot({ path: `${SHOT}/today-page.png` })
  if (AUDIT) console.log('chips', await h.evaluate(() => [...document.querySelectorAll('[aria-pressed]')].map((one) => JSON.stringify(one.innerText)).join(' ')))
  const line = h.locator('[data-day-line] [data-line]').first()
  if (await line.count()) {
    await line.focus(); await wait(350)
    const shownOnFocus = await h.evaluate(() => { const el = document.activeElement?.closest('[data-day-line]')?.querySelector('[data-open-line]'); return el ? window.__sb?.opacity?.(el) ?? Number(getComputedStyle(el.parentElement).opacity) : -1 })
    check('day page: a line\'s Start, Time, Tomorrow and Open show while it is being written', shownOnFocus > 0.5, String(shownOnFocus))
    await h.locator('[data-day-line]').first().click({ button: 'right' }); await wait(450)
    const said = await h.evaluate(() => [...document.querySelectorAll('[role=menu] [role^=menuitem]')].map((one) => one.textContent.trim()))
    check('day page: the line\'s menu has Start, How long, Tomorrow and Open', ['Start a focus session', 'How long it takes', 'Do it tomorrow', 'Open'].every((one) => said.some((s) => s.startsWith(one))), said.join(' / '))
    await h.keyboard.press('Escape'); await wait(250)
    if (SHOT) { await line.focus(); await wait(350); await h.screenshot({ path: `${SHOT}/today-page-focused-line.png` }) }
  } else check('day page: a task line to try', false)
  await chip('List'); await wait(500)
  // ⌘K finds the sidebar's wrench.
  await go('home')
  await h.keyboard.press('Meta+k'); await wait(500)
  await h.keyboard.type('Customize', { delay: 20 }); await wait(500)
  check('⌘K offers Customize the sidebar', /Customize the sidebar/.test(await h.evaluate(() => document.body.innerText)))
  await h.keyboard.press('Escape'); await wait(300)

  // The quick capture box's gear menu, with a note started so "This note" shows.
  await h.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(800)
  await page.locator('.tiptap.ProseMirror').first().click().catch(() => {})
  await page.keyboard.type('A line so the note has its own section')
  await wait(400)
  await page.locator('button[aria-label="Actions"]').first().click(); await wait(500)
  const gear = await menuFits(page)
  const boxHeight = await page.evaluate(() => innerHeight)
  if (!gear.length || gear.some((m) => m.scrolls || m.bottom > boxHeight)) totals.menusScrolling++
  check(`quick capture: the gear menu fits the ${boxHeight}px box without scrolling`, gear.length && gear.every((m) => !m.scrolls && m.bottom <= boxHeight), JSON.stringify(gear))
  // What was folded away is one line deeper, all there.
  await page.locator('[role=menu] [role=menuitem]', { hasText: 'More settings' }).first().hover(); await page.waitForTimeout(450)
  const deeper = await page.evaluate(() => [...document.querySelectorAll('[role=menu]')].slice(1).flatMap((m) => [...m.querySelectorAll('[role^=menuitem]')].map((one) => one.textContent.trim())))
  check('quick capture: “More settings” holds Vim keys, Word count, recordings and private titles', ['Vim keys', 'Word count', 'Show in screen recordings', 'Show private titles'].every((one) => deeper.some((d) => d.startsWith(one))), deeper.join(' / '))
  if (SHOT) await page.screenshot({ path: `${SHOT}/box-gear-more.png` })
  if (SHOT) await page.screenshot({ path: `${SHOT}/box-gear.png` })
  await page.keyboard.press('Escape')
} catch (error) {
  check(`ran to the end`, false, error.message.split('\n')[0])
} finally {
  console.log('TOTALS', JSON.stringify(totals))
  console.log('ERRORS', c.errors.slice(0, 5).join(' | '))
  await c.close()
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  process.exit(passed === results.length ? 0 : 1)
}

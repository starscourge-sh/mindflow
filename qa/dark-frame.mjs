// The window's frame, behind the sidebar and the page: dark in a light theme, as in the reference; the panels stay light.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=/abs/dir node qa/dark-frame.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 880 })
const { h, v, go, close } = s
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const pump = async () => { for (let i = 0; i < 8; i++) { await h.screenshot(); await wait(40) } }
const shot = async (name) => { await pump(); if (shots) await h.screenshot({ path: `${shots}/${name}.png` }) }
const theme = async (name) => { await h.evaluate((t) => localStorage.setItem('theme', t), name); await h.reload(); await wait(1500) }
try {
  await v('settings:set', { hintRate: 0 })
  for (const [t, style] of (process.env.QA_THEMES ?? 'paper,light,github,paper:brutal,paper:paper').split(',').map((one) => [one.split(':')[0], one.split(':')[1] ?? 'soft'])) {
    await h.evaluate((one) => localStorage.setItem('style', one), style)
    await theme(t)
    await go('articles'); await wait(900)
    { const row = h.locator('[data-pane] [data-row]:visible'); if (await row.count()) await row.first().click({ timeout: 8000 }) }; await wait(900)
    if (!(await h.locator('[data-tab]:not([data-tab-on])').count())) { await h.keyboard.press('Meta+t'); await wait(700); await h.locator('[data-pane] [data-tab]').first().locator('[role=tab]').click({ timeout: 5000 }); await wait(700) }
    await shot(`${t}-${style}-note`)
    if (shots) await h.screenshot({ path: `${shots}/${t}-${style}-tabs.png`, clip: { x: 260, y: 40, width: 520, height: 70 } })
    const unread = await h.evaluate(() => [...document.querySelectorAll('[data-tab]:not([data-tab-on]) [role=tab]')].map((b) => { const k = document.createElement('canvas').getContext('2d'); const lum = (c) => { k.clearRect(0, 0, 1, 1); k.fillStyle = c; k.fillRect(0, 0, 1, 1); const [r, g, bl] = k.getImageData(0, 0, 1, 1).data; return 0.2126 * r + 0.7152 * g + 0.0722 * bl }; return Math.round(lum(getComputedStyle(b).color)) }))
    if (t !== 'github') check(`${t} ${style}: a tab not open is written in light ink`, unread.length > 0 && unread.every((one) => one > 150), JSON.stringify(unread))
    const look = await h.evaluate(() => {
      const lum = (el) => { if (!el) return -1; const c = getComputedStyle(el).backgroundColor; const ink = document.createElement('canvas').getContext('2d'); ink.fillStyle = c; ink.fillRect(0, 0, 1, 1); const [r, g, b, a] = ink.getImageData(0, 0, 1, 1).data; return a ? Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b)) : -1 }
      const ink = (el) => { const c = getComputedStyle(el).color; const k = document.createElement('canvas').getContext('2d'); k.fillStyle = c; k.fillRect(0, 0, 1, 1); const [r, g, b] = k.getImageData(0, 0, 1, 1).data; return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b) }
      const tab = document.querySelector('[data-tab-on] [role=tab]')
      return { frame: lum(document.querySelector('[data-frame]')), card: lum(document.querySelector('[data-pane-card]')), side: lum(document.querySelector('aside[data-book-tint]')), tabInk: tab ? ink(tab) : -1, newInk: ink([...document.querySelectorAll('[data-on-frame] button')].find((b) => b.textContent.includes('New'))) }
    })
    if (t !== 'github') {
      check(`${t}: the frame is dark`, look.frame >= 0 && look.frame < 120, JSON.stringify(look))
      check(`${t}: the page and the sidebar are light cards on it`, look.card > 200 && look.side > 200, JSON.stringify(look))
      check(`${t}: the open tab keeps the page's dark ink, "New" is light`, look.tabInk < 90 && look.newInk > 180, JSON.stringify(look))
    } else check('a dark theme: the frame is near black, darker than the page and the sidebar', look.frame < 12 && look.card > look.frame + 6 && look.side > look.frame + 6, JSON.stringify(look))
    if (t !== 'github' || style === 'soft') for (const depth of [0, 100]) {
      await v('settings:set', { frameDepth: depth }); await wait(500)
      const at = await h.evaluate(() => { const k = document.createElement('canvas').getContext('2d'); k.fillStyle = getComputedStyle(document.querySelector('[data-frame]')).backgroundColor; k.fillRect(0, 0, 1, 1); const [r, g, b] = k.getImageData(0, 0, 1, 1).data; return { r, g, b, lum: Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b) } })
      check(`${t} ${style}, "How dark" at ${depth}: ${depth ? 'all but black, still a hint of the theme' : 'dark enough for light words, tinted'}`, (depth ? at.lum < 20 : t === 'github' ? at.lum < 17 : at.lum < 95 && at.lum > 25) && Math.max(at.r, at.g, at.b) - Math.min(at.r, at.g, at.b) >= (depth ? 2 : 6), JSON.stringify(at))
      await shot(`${t}-${style}-depth-${depth}`)
    }
    await v('settings:set', { frameDepth: 75 }); await wait(400)
    if (t === 'paper' && style === 'soft') {
      await go('settings'); await wait(900)
      await h.locator('input[type=search], [placeholder*="Search"]').first().fill('dark frame').catch(() => {}); await wait(600)
      await shot(`${t}-settings`)
      await h.locator('[aria-label="Dark frame"]').first().click(); await wait(600)
      await shot(`${t}-settings-off`)
      check('switched off, the frame is the page colour again', await h.evaluate(() => !document.querySelector('[data-frame]')))
      await h.locator('[aria-label="Dark frame"]').first().click(); await wait(600)
      check('and back on', await h.evaluate(() => !!document.querySelector('[data-frame="dark"]')))
      await go('articles'); await wait(900)
      await h.keyboard.press('Meta+Backslash').catch(() => {}); await wait(900)
      await shot(`${t}-split`)
      await h.keyboard.press('Meta+b'); await wait(900)
      await shot(`${t}-no-sidebar`)
      await h.keyboard.press('Meta+b'); await wait(600)
    }
  }
} catch (e) { check('ran', false, e.message.split('\n').slice(0, 6).join(' | ')); if (shots) await h.screenshot({ path: `${shots}/failed.png` }) }
await close()
done()

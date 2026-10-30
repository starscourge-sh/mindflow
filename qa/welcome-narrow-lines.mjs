// The welcome walked page by page at the smallest window the app allows (560 by 400) and the narrow sizes probes use
// (720 by 520, 900 by 600): no line of words is cut off, by the window's edge or by a box that clips it.
// Each page is played to its end (Esc) before it is read. Pictures go to QA_SHOTS when set.
//
//   npx electron-vite build --outDir out-w
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-w/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-narrow-lines.mjs
import { checks, open } from './harness.mjs'

const { check, done } = checks()
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const shots = process.env.QA_SHOTS ?? ''
const run = await open()
const app = run.electron
try {
  let h = null
  for (let i = 0; i < 100 && !h; i++) (h = app.windows().find((w) => w.url().includes('view=home')) ?? null), h || (await wait(200))
  await h.waitForLoadState('domcontentloaded')
  for (const [width, height] of [[560, 400], [720, 520], [900, 600]]) {
    await h.reload()
    await h.waitForLoadState('domcontentloaded')
    await wait(1200)
    await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
    await h.waitForSelector('.mf-welcome', { timeout: 8000 })
    await app.evaluate(({ BrowserWindow }, [w, hh]) => { const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home')); if (win?.isFullScreen()) win.setFullScreen(false); win?.setBounds({ x: 40, y: 40, width: w, height: hh }); win?.show() }, [width, height])
    await wait(900)
    const real = await h.evaluate(() => [innerWidth, innerHeight])
    const cut = []
    for (let page = 0; page < 12; page++) {
      for (let i = 0; i < 6; i++) {
        if (await h.evaluate(() => [...document.querySelectorAll('.mf-welcome [data-reel]')].every((el) => el.dataset.reel === 'done'))) break
        await h.keyboard.press('Escape')
        await wait(350)
      }
      await wait(500)
      const name = await h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
      const found = await h.evaluate(() => {
        const out = []
        const clips = (el) => { const s = getComputedStyle(el); return /hidden|clip/.test(s.overflowX + s.overflowY) }
        for (const el of document.querySelectorAll('.mf-welcome *')) {
          const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
          if (!own) continue
          const s = getComputedStyle(el)
          if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0 || el.closest('[aria-hidden="true"],.sr-only,[inert]')) continue
          // In a part that scrolls, a line out of view is reached by scrolling, not cut off.
          let scrolls = false
          for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) { const u = getComputedStyle(up); if (/auto|scroll/.test(u.overflowX + u.overflowY) && (up.scrollHeight > up.clientHeight + 1 || up.scrollWidth > up.clientWidth + 1)) { scrolls = true; break } }
          if (scrolls) continue
          const r = el.getBoundingClientRect()
          if (r.width < 2 || r.height < 2) continue
          const words = el.textContent.trim().slice(0, 50)
          if (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1) { out.push(`${words} (past the window)`); continue }
          if (clips(el) && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2)) { out.push(`${words} (clipped by itself)`); continue }
          for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
            if (!clips(up)) continue
            const b = up.getBoundingClientRect()
            if (r.right > b.right + 1 || r.left < b.left - 1 || r.bottom > b.bottom + 2 || r.top < b.top - 2) out.push(`${words} (clipped by its box)`)
            break
          }
        }
        return out
      })
      // Every button in the footer can be reached: nothing lies over its middle.
      // (Not under the intro's own bar, which stands in for the footer until the first words are up.)
      const covered = await h.evaluate(() => document.querySelector('[data-intro]') ? [] : [...document.querySelectorAll('.mf-welcome footer button')].filter((b) => {
        const r = b.getBoundingClientRect()
        if (r.width < 2 || getComputedStyle(b).visibility === 'hidden' || b.getAttribute('aria-hidden') === 'true') return false
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return !!top && !b.contains(top)
      }).map((b) => `${b.textContent.trim().slice(0, 30)} (covered)`))
      found.push(...covered)
      for (const one of found) cut.push(`${name || 'Welcome'}: ${one}`)
      if (shots) await h.screenshot({ path: `${shots}/narrow-${width}-${page}.png` })
      const last = await h.$('footer button:has-text("Open my book")')
      if (last) break
      if (await h.$('footer button:has-text("Skip trying it")')) await h.click('footer button:has-text("Skip trying it")', { force: true })
      else await h.click('footer button:has-text("Next"), footer button:has-text("Show me")').catch(() => {})
      await wait(700)
    }
    check(`${width} by ${height} (inside ${real.join(' by ')}): no line cut off on any page`, cut.length === 0, [...new Set(cut)].join(' | '))
  }
} finally {
  await run.close().catch(() => {})
  try { run.electron.process().kill('SIGKILL') } catch {}
}
done()

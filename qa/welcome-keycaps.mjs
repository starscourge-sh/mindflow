// The welcome's ⌘ and . keys on Catch are Haligtree's own render (scripts/render-keycaps.mjs), not a borrowed picture:
// two keys, each with its mark, cream in the dark and charcoal on paper, the same size on one baseline, and each
// swaps to its pressed frame and back on its own, in light and dark, at 1280 and 560 wide.
//
//   npx electron-vite build --outDir out-w
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-w/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-keycaps.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
// Light and dark at the welcome's usual size, and both again in a narrow window (560px wide).
for (const [theme, width] of [['light', 1280], ['dark', 1280], ['light', 560], ['dark', 560]]) {
  const c = await sandbox({ width, height: 800, seeded: false })
  const { h, v } = c
  const name = `${theme}-${width}`
  try {
    await v('settings:set', { keys: { '⌘.': '⌘.' } })
    await c.look(theme)
    await h.evaluate(() => {
      const seen = (window.__keys = { first: null, down: new Set(), back: new Set() })
      new MutationObserver(() => {
        const box = document.querySelector('[data-keycaps]')
        if (!box) return
        const keys = [...box.querySelectorAll('[data-key]')]
        if (!seen.first && keys.length) {
          const looks = keys.map((k) => [...k.querySelectorAll('[data-look]')].filter((l) => getComputedStyle(l).display !== 'none').map((l) => l.dataset.look).join('+'))
          const boxes = keys.map((k) => { const r = k.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom), top: Math.round(r.top) } })
          seen.first = { svgs: box.querySelectorAll('svg').length, keys: keys.map((k) => k.dataset.key), looks, boxes }
        }
        for (const k of keys) {
          if (k.dataset.down !== undefined) seen.down.add(k.dataset.key)
          else if (seen.down.has(k.dataset.key) && !seen.back.has(k.dataset.key)) {
            seen.back.add(k.dataset.key)
            // The moment it is let go, the frame at rest of the look on show is up again, whole.
            const look = [...k.querySelectorAll('[data-look]')].find((l) => getComputedStyle(l).display !== 'none')
            seen.rest = [...(seen.rest ?? []), getComputedStyle(look.querySelector('img:not([data-pressed])')).opacity]
            // And every picture of both looks had loaded (a broken or missing file has no natural width).
            seen.loaded = [...box.querySelectorAll('img')].map((i) => [i.currentSrc.split('/').pop(), i.naturalWidth])
          }
        }
      }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-down'] })
    })
    // A fresh book opens the welcome by itself; asked for only when it did not.
    if (!(await h.waitForSelector('.mf-welcome', { timeout: 8000 }).then(() => true, () => false))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
    for (let i = 0; i < 4 && !(await h.$('.mf-welcome')); i++) (await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome'))), await h.waitForSelector('.mf-welcome', { timeout: 10000 }).catch(() => {}))
    await h.waitForSelector('.mf-welcome', { timeout: 10000 })
    // The intro is skipped by its own button (qa/welcome-pace.mjs does the same).
    await h.click('[data-skip-intro]').catch(() => {})
    await h.waitForFunction(() => { const v = document.querySelector('[data-intro]'); return !v || Number(getComputedStyle(v).opacity) < 0.05 }, null, { timeout: 8000 }).catch(() => {})
    const chapter = () => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
    // The way on; while the intro still covers the footer, its own Skip first.
    const next = async () => { if (await h.$("[data-intro]:not(.opacity-0) [data-skip-intro]")) await h.click("[data-skip-intro]", { timeout: 3000 }).catch(() => {}); await ((await h.$(`footer button:has-text("Skip trying it")`)) ? h.click(`footer button:has-text("Skip trying it")`, { timeout: 5000 }) : h.click(`footer button:has-text("Next"), footer button:has-text("Show me")`, { timeout: 5000 })).catch(() => h.keyboard.press("Enter")) }
    for (let i = 0; i < 16 && !(await chapter()).includes('Catch'); i++) (await next(), await wait(700))
    // The keys are up for a moment only (less on a busy machine): everything about them is read in the page as it
    // happens (above), and here the probe only waits for both to have been let go.
    for (let i = 0; i < 200 && (await h.evaluate(() => window.__keys.back.size)) < 2; i++) await wait(100)
    const loaded = await h.evaluate(() => window.__keys.loaded ?? [])
    const rest = await h.evaluate(() => window.__keys.rest ?? [])
    let first = null
    for (let i = 0; i < 100; i++) {
      first = await h.evaluate(() => window.__keys.first)
      if (first && (await h.evaluate(() => window.__keys.back.size)) === 2) break
      await wait(100)
    }
    const look = theme === 'light' ? 'charcoal' : 'cream'
    check(`${name}: on Catch, the ⌘ . keys show, and every picture loaded`, !!first && loaded.length === 8 && loaded.every(([, w]) => w > 0), JSON.stringify(loaded))
    check(`${name}: two keys, ⌘ and ., pictures and no live drawing`, first?.svgs === 0 && first.keys.join('') === '⌘.', JSON.stringify(first))
    check(`${name}: each key shows the ${look} look only`, first?.looks.every((l) => l === look), JSON.stringify(first?.looks))
    const [k1, k2] = first?.boxes ?? []
    check(`${name}: both keys the same size, on one baseline`, !!k1 && k1.w === k2.w && k1.h === k2.h && k1.bottom === k2.bottom && k1.top === k2.top, JSON.stringify(first?.boxes))
    const went = await h.evaluate(() => [[...window.__keys.down], [...window.__keys.back]])
    check(`${name}: each key swaps to its pressed frame and back`, went[0].length === 2 && went[1].length === 2, JSON.stringify(went))
    check(`${name}: let go, each key is back to its frame at rest`, rest.length === 2 && rest.every((r) => r === '1'), JSON.stringify(rest))
  } finally {
    await c.close()
  }
}
done()

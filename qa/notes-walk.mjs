// Walks the notes pages at a small and a full window, in light and dark, saving a picture of each and
// flagging what reads as broken: sideways scroll, text cut off, buttons smaller than 24 points.
// Run: QA_SHOTS=dir QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-notes/main/index.js HALIGTREE_QA_AWAY=1 node qa/notes-walk.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { h, go, send, size, theme, close, errors } = await sandbox({ width: 1200, height: 800 })
const SHOT = process.env.QA_SHOTS
const ONLY = process.env.QA_PAGES?.split(',')
const PAGES = ['day', 'weekpage', 'monthpage', 'yearpage', 'review', 'stats', 'sources', 'map', 'lookups', 'nuggets', 'tags']
const found = []
try {
  for (const name of ['paper', 'dark']) {
    await theme(name)
    for (const [w, hh] of [[760, 540], [1680, 1050]]) {
      await size(w, hh)
      for (const page of PAGES.filter((one) => !ONLY || ONLY.includes(one))) {
        await go(page)
        await h.waitForTimeout(700)
        for (let i = 0; i < 3 && await h.locator('[data-celebration] [role="status"]').count(); i++) { await h.keyboard.press('Escape'); await h.waitForTimeout(400) }
        if (SHOT) await h.screenshot({ path: `${SHOT}/${page}-${w}-${name}.png` })
        const said = await h.evaluate(() => {
          const out = []
          if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`sideways scroll ${document.documentElement.scrollWidth}>${innerWidth}`)
          const main = document.querySelector('main') ?? document.body
          for (const el of main.querySelectorAll('button, [role="button"], a[href]')) {
            const r = el.getBoundingClientRect()
            if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue
            if (getComputedStyle(el).visibility === 'hidden' || el.closest('[aria-hidden="true"], [inert]')) continue
            if (r.height < 20 || r.width < 20) out.push(`small target ${Math.round(r.width)}x${Math.round(r.height)} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}"`)
            if (r.right > innerWidth + 1) out.push(`off the right edge "${(el.textContent || '').trim().slice(0, 30)}"`)
          }
          return [...new Set(out)].slice(0, 12)
        })
        for (const one of said) found.push(`${page} ${w} ${name}: ${one}`)
      }
    }
  }
} finally {
  await close()
}
console.log(found.join('\n') || 'nothing flagged')
console.log(errors.filter((e) => !/net::|Failed to load resource/.test(e)).slice(0, 10).join('\n') || 'no errors')

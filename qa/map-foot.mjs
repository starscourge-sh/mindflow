// The Map's foot works on small windows: the key (or its "Key" button) and the "wandering on their own"
// card sit side by side, never over each other, inside the map, low and short; the key folds into a button when narrow.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<dir>] node qa/map-foot.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1440, height: 900 })
const { h, v } = c
const shown = (el) => el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await c.theme('dark')
    for (const [w, hh] of [[900, 620], [1100, 700], [1440, 900]]) {
      await c.size(w, hh); await c.go('map'); await h.waitForTimeout(800)
      const got = await h.evaluate(() => {
        const box = (el) => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) } }
        const on = (el) => el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0
        const map = document.querySelector('[data-map-foot]')?.parentElement
        const key = document.querySelector('[data-map-key]'), button = document.querySelector('[data-map-key-button]'), lonely = document.querySelector('[data-map-lonely]')
        const keyed = on(key) ? key : on(button) ? button : null
        return { map: map && box(map), key: keyed && box(keyed), folded: keyed === button, lonely: lonely && on(lonely) ? box(lonely) : null, oneLine: lonely ? lonely.scrollWidth <= lonely.clientWidth + 1 : true }
      })
      const tag = `${theme} ${w}x${hh}`
      const overlap = got.key && got.lonely && !(got.key.r + 8 <= got.lonely.l || got.lonely.b <= got.key.t || got.key.b <= got.lonely.t)
      check(`${tag}: the key and the card never overlap`, got.key && !overlap, JSON.stringify(got))
      const inside = (one) => !one || (one.l >= got.map.l && one.r <= got.map.r && one.b <= got.map.b)
      check(`${tag}: both sit inside the map`, got.map && inside(got.key) && inside(got.lonely), JSON.stringify(got))
      check(`${tag}: the foot stays low: under a fifth of the map's height`, got.map && Math.max(got.key?.h ?? 0, got.lonely?.h ?? 0) <= got.map.h / 5, JSON.stringify(got))
      check(`${tag}: the card's words fit on one line`, got.oneLine, JSON.stringify(got.lonely))
      if (w === 900) check(`${tag}: the key folds into one "Key" button`, got.folded, JSON.stringify(got.key))
      if (w === 1440) check(`${tag}: with room, the key is shown in full`, !got.folded, JSON.stringify(got.key))
      if (SHOT) await h.screenshot({ path: `${SHOT}/map-${theme}-${w}.png` })
    }
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()

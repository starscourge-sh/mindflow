// Every card on What Haligtree can do has a moving picture in its stage, never a
// blank box: in a light and a dark theme, mid-play and at rest, each stage holds
// something visible (words, a drawn mark or an icon) and nothing drawn past its
// edge. Frames of each card go to OUT (default QA_DATA/shots); IDS=a,b shoots only some.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
const out = process.env.OUT ?? `${process.env.QA_DATA}/shots`
mkdirSync(out, { recursive: true })
const s = await sandbox({ width: 1200, height: 900 })
let fails = 0
let checked = 0
const look = (id) => s.h.evaluate((id) => {
  const stage = document.querySelector(`[data-power="${id}"] .pw-stage`)
  const box = stage.getBoundingClientRect()
  const shown = (el) => { for (let at = el; at && at !== stage; at = at.parentElement) if (Number(getComputedStyle(at).opacity) === 0) return false; return true }
  const all = [...stage.querySelectorAll('*')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && shown(el) })
  // Something a person sees: words, an icon or drawing, or a filled or bordered shape.
  const seen = all.filter((el) => {
    if (el.tagName === 'svg' || (el.childElementCount === 0 && el.textContent.trim())) return true
    const look = getComputedStyle(el)
    return look.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(look.borderTopWidth) > 0
  }).length
  const past = all.filter((el) => {
    // The pointer, and a progress bar's fill (moved in from off its track), are not drawn past the edge.
    if (el.closest('svg.pointer-events-none') || el.closest('[role="progressbar"]')) return false
    const r = el.getBoundingClientRect()
    return r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1
  }).map((el) => (el.textContent || el.tagName).slice(0, 40))
  return { seen, past }
}, id)
try {
  for (const theme of ['paper', 'github']) {
    await s.theme(theme)
    for (const still of [false, true]) {
      await s.h.emulateMedia({ reducedMotion: still ? 'reduce' : 'no-preference' })
      await s.go('powers'); await s.h.waitForTimeout(800)
      const ids = process.env.IDS ? process.env.IDS.split(',') : await s.h.evaluate(() => [...document.querySelectorAll('[data-power]')].map((one) => one.dataset.power))
      let blank = 0
      for (const id of ids) {
        const card = s.h.locator(`[data-power="${id}"]`)
        await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
        const stage = card.locator('.pw-stage')
        // Off screen, a window draws only when shot: each shot is a frame, so a few pump the play along.
        for (const [i, t] of (still ? [300] : [700, 1200, 1500]).entries()) {
          await s.h.waitForTimeout(t)
          await stage.screenshot({ path: `${out}/${id}-${theme}-${still ? 'rest' : `play${i}`}.png` })
          const one = await look(id)
          checked++
          if (!one.seen || one.past.length) { fails++; if (!one.seen) blank++; console.log(`FAIL ${id} ${theme} ${still ? 'rest' : 'play' + i}: seen=${one.seen} past=${JSON.stringify(one.past)}`) }
        }
      }
      console.log(`${theme} ${still ? 'at rest' : 'playing'}: ${ids.length} cards, ${blank} blank`)
    }
  }
  if (s.errors.length) { fails++; console.log('errors:', s.errors.join('\n')) }
} finally { await s.close() }
console.log(`${checked - fails}/${checked} passed`)
process.exit(fails ? 1 : 0)

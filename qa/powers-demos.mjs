// Every card's little picture on What Vigil can do: filled, inside its stage,
// no words cut short, shot mid-play and at rest, in Paper and a dark theme.
// OUT=dir; THEMES=paper,github; IDS=a,b to shoot only some.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
const out = process.env.OUT ?? `${process.env.QA_DATA}/shots`
mkdirSync(out, { recursive: true })
const themes = (process.env.THEMES ?? 'paper,github').split(',')
const s = await sandbox({ width: 1200, height: 900 })
let fails = 0
const check = () => s.h.evaluate(() => [...document.querySelectorAll('[data-power]')].map((card) => {
  const stage = card.querySelector('.pw-stage')
  const box = stage.getBoundingClientRect()
  const all = [...stage.querySelectorAll('*')]
  const filled = all.some((el) => el.getBoundingClientRect().width > 0 && (el.tagName === 'svg' || (el.childElementCount === 0 && el.textContent.trim())))
  // Anything drawn past the stage's edge (opacity 0 and the pointer aside).
  const out = all.filter((el) => {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height || el.closest('svg.pointer-events-none') || el.closest('[role="progressbar"]')) return false
    if (Number(getComputedStyle(el).opacity) === 0) return false
    // A layer that only carries what is inside it (a slider's knob moved by transform) draws nothing of its own.
    const look = getComputedStyle(el)
    if (el.childElementCount > 0 && !el.textContent.trim() && look.backgroundColor === 'rgba(0, 0, 0, 0)' && look.borderStyle === 'none' && look.boxShadow === 'none') return false
    return r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1
  }).map((el) => (el.textContent || el.tagName).slice(0, 40))
  // Words cut short by a truncate.
  const cut = all.filter((el) => getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && Number(getComputedStyle(el).opacity) > 0).map((el) => el.textContent.slice(0, 40))
  return { id: card.dataset.power, filled, out, cut }
}))
try {
  for (const theme of themes) {
    await s.theme(theme)
    for (const still of [false, true]) {
      await s.h.emulateMedia({ reducedMotion: still ? 'reduce' : 'no-preference' })
      await s.go('powers'); await s.h.reload(); await s.h.waitForTimeout(1500); await s.go('powers'); await s.h.waitForTimeout(800)
      const ids = process.env.IDS ? process.env.IDS.split(',') : await s.h.evaluate(() => [...document.querySelectorAll('[data-power]')].map((one) => one.dataset.power))
      for (const id of ids) {
        const card = s.h.locator(`[data-power="${id}"]`)
        await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
        const stage = card.locator('.pw-stage')
        const times = still ? [400] : (process.env.TIMES ? process.env.TIMES.split(',').map(Number) : [900, 1400, 1600])
        for (const [i, t] of times.entries()) {
          await s.h.waitForTimeout(t)
          await stage.screenshot({ path: `${out}/${id}-${theme}-${still ? 'rest' : `play${i}`}.png` })
          const one = (await check()).find((c) => c.id === id)
          const bad = !one.filled || one.out.length || one.cut.length
          if (bad) { fails++; console.log(`FAIL ${id} ${theme} ${still ? 'rest' : 'play' + i}: filled=${one.filled} out=${JSON.stringify(one.out)} cut=${JSON.stringify(one.cut)}`) }
        }
      }
      console.log(`${theme} ${still ? 'rest' : 'play'}: ${ids.length} cards shot`)
    }
  }
  console.log('errors:', s.errors.join('\n'))
} finally { await s.close() }
process.exit(fails ? 1 : 0)

// Every card's picture, through every step it plays: nothing cut off with an
// ellipsis, nothing spilling past its stage. At the narrow and the wide size.
import { sandbox } from './sandbox-lib.mjs'
const sizes = (process.env.SIZES ?? '1000x700,1600x1000').split(',').map((s) => s.split('x').map(Number))
const s = await sandbox({ width: sizes[0][0], height: sizes[0][1] })
const found = new Map()
try {
  for (const [w, hh] of sizes) {
    await s.size(w, hh)
    await s.go('powers'); await s.h.waitForTimeout(800)
    const [total, view] = await s.h.evaluate(() => { const el = document.querySelector('[data-power]').closest('.overflow-y-auto'); return [el.scrollHeight, el.clientHeight] })
    for (let y = 0; y < total; y += Math.round(view * 0.45)) {
      await s.h.evaluate((y) => { const el = document.querySelector('[data-power]').closest('.overflow-y-auto'); el.scrollTop = y }, y)
      for (let t = 0; t < 34; t++) {
        await s.h.waitForTimeout(250)
        const bad = await s.h.evaluate(() => {
          const out = []
          for (const stage of document.querySelectorAll('.pw-stage')) {
            const card = stage.closest('[data-power]').dataset.power
            const box = stage.getBoundingClientRect()
            if (box.bottom < 0 || box.top > innerHeight) continue
            for (const el of stage.querySelectorAll('*')) {
              const style = getComputedStyle(el)
              if (style.opacity === '0' || el.closest('[style*="opacity: 0"]')) continue
              if (el.scrollWidth > el.clientWidth + 1 && (style.textOverflow === 'ellipsis' || style.overflowX === 'hidden') && el.textContent.trim()) out.push(`${card}: cut "${el.textContent.trim().slice(0, 40)}"`)
              const r = el.getBoundingClientRect()
              if (r.width && r.height && el.textContent.trim() && (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1)) out.push(`${card}: spills "${el.textContent.trim().slice(0, 40)}"`)
            }
          }
          return out
        })
        for (const one of bad) found.set(`${w} ${one}`, (found.get(`${w} ${one}`) ?? 0) + 1)
      }
    }
  }
  console.log([...found.keys()].join('\n') || 'nothing cut off or spilling')
} finally { await s.close() }

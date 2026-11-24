// A sticky's tape is whole at rest, and hidden while the card is still growing, so it is never shown cut.
import { join } from 'node:path'
import { sandbox } from './sandbox-lib.mjs'

const shots = process.env.QA_SHOTS
const c = await sandbox({ width: 1100, height: 800 })
const fails = []
const check = (ok, name, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: ${JSON.stringify(got)}`}`); if (!ok) fails.push(name) }
try {
  await c.v('settings:set', { sounds: false, hintRate: 0 })
  let page = null
  for (let i = 0; i < 40 && !page; i++) {
    await c.h.waitForTimeout(250)
    page = c.electron.windows().find((one) => /view=sticky/.test(one.url()) && /type=today/.test(one.url())) ?? null
  }
  check(!!page, 'Today’s sticky is open', page ? 'open' : c.electron.windows().map((one) => one.url()))
  if (page) {
    const read = await page.evaluate(() => {
      const root = document.getElementById('root')
      const tape = document.querySelector('[data-pill-later] .mf-tape')
      if (!root || !tape) return { missing: true }
      const box = tape.getBoundingClientRect()
      root.dataset.growing = ''
      root.style.setProperty('--pill-later', '0')
      const later = tape.closest('[data-pill-later]')
      const hidden = getComputedStyle(later).opacity
      root.style.setProperty('--pill-later', '1')
      const shown = getComputedStyle(later).opacity
      delete root.dataset.growing
      root.style.removeProperty('--pill-later')
      return { hidden, shown, top: Math.round(box.top), height: Math.round(box.height), window: window.innerHeight }
    })
    check(read.hidden === '0' && Number(read.shown) === 1, 'while the card is growing the tape is hidden, and it is whole once the opening has cleared it', read)
    check(read.top >= 0 && read.top + read.height <= read.window + 1, 'at rest the tape sits inside the window', read)
    if (shots) await page.screenshot({ path: join(shots, 'sticky-tape.png') })
  }
} catch (error) {
  fails.push('threw: ' + error.message.split('\n')[0])
  console.log('threw', error.message.split('\n').slice(0, 8).join(' '))
} finally {
  await c.close()
}
console.log(fails.length ? `FAIL ${fails.length}: ${fails.join('; ')}` : 'PASS sticky-tape')
process.exit(fails.length ? 1 : 0)

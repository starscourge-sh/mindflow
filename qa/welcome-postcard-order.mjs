// Remember's postcard comes one thing at a time: its words written in, then the name signed, then where it is from;
// and Next only offers itself well after (never arriving with the card's last line).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-postcard-order.mjs
import { sandbox } from './sandbox-lib.mjs'
let failed = 0
const check = (name, ok, more = '') => (ok || failed++, console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${more ? `  (${more})` : ''}`))
const c = await sandbox({ width: 1400, height: 900, seeded: false })
const { h } = c
const chapter = () => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
try {
  if (!(await h.waitForSelector('.mf-welcome', { timeout: 8000 }).then(() => true, () => false))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForSelector('.mf-welcome', { timeout: 8000 })
  await h.click('[data-skip-intro]').catch(() => {})
  await h.waitForTimeout(1500)
  for (let i = 0; i < 40 && !(await chapter()).includes('Write'); i++) {
    for (let j = 0; j < 8; j++) (await h.keyboard.press('Escape'), await h.waitForTimeout(150))
    const skip = await h.$('footer button:has-text("Skip trying it")')
    if (skip) await skip.click()
    else await h.keyboard.press('Enter')
    await h.waitForTimeout(900)
  }
  for (let j = 0; j < 8; j++) (await h.keyboard.press('Escape'), await h.waitForTimeout(150))
  // When each part of the postcard is first seen, and when Next is ready, from the moment Remember starts.
  await h.evaluate(() => {
    const w = window
    w.__seen = {}
    const t0 = performance.now()
    const tick = () => {
      const t = Math.round(performance.now() - t0)
      const card = document.querySelector('#day-postcard, [data-day-postcard]') ?? [...document.querySelectorAll('.mf-welcome p')].find((p) => p.textContent?.startsWith('Saved a year ago'))?.closest('div')
      const words = [...document.querySelectorAll('.mf-welcome [data-written]')]
      const last = words.at(-1)
      const op = (el) => (el ? Number(getComputedStyle(el).opacity) : 0)
      if (last && op(last) > 0.9) w.__seen.words ??= t
      const sig = document.querySelector('.mf-welcome .mf-signature')
      if (sig) { const clip = getComputedStyle(sig.closest('span[style*="clip-path"]') ?? sig).clipPath; if (!/100%/.test(clip)) w.__seen.signed ??= t }
      const from = [...document.querySelectorAll('.mf-welcome span')].find((s) => /^in \S/.test(s.textContent ?? '') && s.children.length === 0)
      if (from && op(from) > 0.9) w.__seen.from ??= t
      if (document.querySelector('.mf-welcome footer [data-next][data-ready]') && w.__seen.words) w.__seen.next ??= t
      void card
      if (t < 16000) setTimeout(tick, 16)
    }
    tick()
  })
  await h.keyboard.press('Enter')
  await h.waitForTimeout(16500)
  const seen = await h.evaluate(() => window.__seen)
  console.log(JSON.stringify(seen))
  check('reached Remember', (await chapter()).includes('Remember'), await chapter())
  check('the words are written before the name is signed', seen.words !== undefined && seen.signed !== undefined && seen.words <= seen.signed, JSON.stringify(seen))
  check('where it is from comes after the name', seen.from !== undefined && seen.from > seen.signed, JSON.stringify(seen))
  check('Next offers itself at least 0.8s after the card\'s last line', seen.next !== undefined && seen.next - seen.from >= 800, `${seen.next - seen.from}ms`)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)

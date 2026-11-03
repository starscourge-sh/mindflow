// Two small things in the welcome, read every frame in the page:
// - Back blobs into being on the second page: from small, soft and clear to its size (a touch past, then back),
//   over a few hundred ms, never there in one frame
// - on Write, the "caught on a walk" thought starts typing within 2s of the chapter opening (it waited about 4.7s)
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [QA_SHOTS=dir] node qa/welcome-small.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = (process.env.QA_ARGS ?? '').replace('--sandbox', '').trim()
const { check, done } = checks()
const shots = process.env.QA_SHOTS
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const c = await sandbox({ width: 1280, height: 800, seeded: false })
const { h } = c
try {
  if (!(await h.waitForSelector('.mf-welcome', { timeout: 8000 }).then(() => true, () => false))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForSelector('.mf-welcome', { timeout: 10000 })
  await h.click('[data-skip-intro]').catch(() => {})
  await h.waitForFunction(() => { const v = document.querySelector('[data-intro]'); return !v || Number(getComputedStyle(v).opacity) < 0.05 }, null, { timeout: 8000 }).catch(() => {})
  await wait(800)
  const back = () => h.evaluate(() => [...document.querySelectorAll('.mf-welcome footer button')].find((el) => el.textContent.trim() === 'Back'))
  // Every frame of Back for 700ms after Next: its opacity and scale.
  await h.evaluate(() => {
    window.__back = []
    const end = performance.now() + 6000
    const tick = () => { const all = [...document.querySelectorAll('.mf-welcome footer button')].filter((one) => one.textContent.trim() === 'Back'); window.__many = all.length; const el = all.at(-1); const s = getComputedStyle(el); window.__back.push([Math.round(Number(s.opacity) * 100) / 100, Math.round(parseFloat(s.scale === 'none' ? '1' : s.scale) * 100) / 100, s.visibility]); if (performance.now() < end) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
  void back
  await h.click('footer button:has-text("Next")', { timeout: 5000 }).catch(() => h.keyboard.press('Enter'))
  for (let n = 0; n < 8; n++) { if (shots) await h.screenshot({ path: `${shots}/back-${n}.png`, clip: { x: 0, y: 690, width: 640, height: 110 } }); await wait(50) }
  await wait(5800)
  const frames = await h.evaluate(() => window.__back)
  console.log('Back now:', await h.evaluate(() => { const el = [...document.querySelectorAll('.mf-welcome footer button')].find((one) => one.textContent.trim() === 'Back'); const st = getComputedStyle(el); return `${st.opacity} ${st.scale} ${st.visibility} ${st.transitionDuration} | ${el.className.slice(-80)}` }))
  const shown = frames.filter(([o]) => o > 0)
  const between = shown.filter(([o, s]) => o < 0.98 || Math.abs(s - 1) > 0.02)
  check('Back blobs in: several frames on the way from small and clear to its size', between.length >= 4 && frames[0][0] === 0 && frames.at(-1)[2] === 'visible' && frames[0][1] < 0.6 && frames.at(-1)[0] === 1 && frames.at(-1)[1] === 1, frames.map(([o, s]) => `${o}/${s}`).join(' '))
  check('...a touch past its size on the way (a blob, not a fade)', frames.some(([, s]) => s > 1.01), String(Math.max(...frames.map(([, s]) => s))))
  // On to Write.
  const chapter = () => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
  const next = async () => { await ((await h.$('footer button:has-text("Skip trying it")')) ? h.click('footer button:has-text("Skip trying it")', { timeout: 5000 }) : h.click('footer button:has-text("Next"), footer button:has-text("Show me")', { timeout: 5000 })).catch(() => h.keyboard.press('Enter')) }
  for (let i = 0; i < 16 && !(await chapter()).includes('Write'); i++) {
    // Arm the clock just before each turn: the one that lands on Write is the one read.
    await h.evaluate(() => { window.__opened = null; window.__typed = null; const end = performance.now() + 9000; const tick = () => { const el = document.querySelector('[data-flow-caught]'); if (el && window.__opened === null) window.__opened = performance.now(); if (el && window.__typed === null && Number(el.dataset.flowCaught) > 0) window.__typed = performance.now(); if (performance.now() < end && window.__typed === null) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
    await next()
    await wait(700)
  }
  await wait(6000)
  const [opened, typed] = await h.evaluate(() => [window.__opened, window.__typed])
  const ms = opened !== null && typed !== null ? Math.round(typed - opened) : null
  check('Write: the caught thought starts typing within 2s of the chapter opening', ms !== null && ms < 2000, `${ms}ms`)
  if (shots) await h.screenshot({ path: `${shots}/write.png` })
  check('no errors on the page', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()

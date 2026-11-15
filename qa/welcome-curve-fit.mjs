// The welcome's Remember page in each of the five stories, at six window sizes: the forgetting-curve banner fits (the
// page never scrolls, the banner ends above the footer) and leaves no big empty gap under it on a tall, wide window. From
// the welcome's smallest window (1100 by 688: main's welcomePlace never makes it smaller) up, and at 1100 by 620, a window
// made smaller by hand.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-f/main/index.js HALIGTREE_QA_AWAY=1 [QA_SHOTS=<dir>] node qa/welcome-curve-fit.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
import { STORIES } from '../src/renderer/src/lib/welcome-stories.ts'
if (/--sandbox/.test(process.env.QA_ARGS ?? '')) delete process.env.QA_ARGS

const { check, done } = checks()
const shots = process.env.QA_SHOTS
const NEXT = 'footer button:has-text("Next"), footer button:has-text("Show me")'
const SIZES = [[1100, 620], [1100, 688], [1100, 700], [1190, 744], [1440, 900], [1920, 1200]]
const c = await sandbox({ width: 1440, height: 900, seeded: false })
const { h } = c
const chapter = () => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    if (await h.evaluate(() => [...document.querySelectorAll('.mf-welcome [data-reel]')].every((el) => el.dataset.reel === 'done'))) return
    await h.keyboard.press('Escape')
    await h.waitForTimeout(400)
  }
}
const until = async (name) => {
  for (let i = 0; i < 40 && !(await chapter()).includes(name); i++) {
    await settle()
    const skip = await h.$('footer button:has-text("Skip trying it")')
    await (skip ? skip.click() : h.click(NEXT))
    await h.waitForTimeout(600)
  }
  return (await chapter()).includes(name)
}
const measure = () => h.evaluate(() => {
  const curve = document.querySelector('[data-curve]')?.getBoundingClientRect()
  const foot = document.querySelector('.mf-welcome footer')?.getBoundingClientRect()
  const scrollers = [...document.querySelectorAll('.mf-welcome *')].filter((el) => el.scrollHeight > el.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)).length
  const moments = document.querySelector('[data-moments]')?.getBoundingClientRect()
  return curve && foot ? { curveTop: Math.round(curve.top), curveBottom: Math.round(curve.bottom), curveH: Math.round(curve.height), footTop: Math.round(foot.top), gapUnder: Math.round(foot.top - curve.bottom), gapOver: Math.round(curve.top - moments.bottom), scrollers } : null
})
try {
  const seen = new Set()
  for (let run = 0; run < 60 && seen.size < STORIES.length; run++) {
    if (run) {
      // Closed first, so each opening starts from its first page with the story it picks.
      if (await h.$('.mf-welcome footer button:has-text("Skip the welcome")')) (await h.click('.mf-welcome footer button:has-text("Skip the welcome")'), await h.waitForSelector('.mf-welcome', { state: 'detached', timeout: 8000 }).catch(() => null))
      await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
    } else if (!(await h.waitForSelector('.mf-welcome', { timeout: 8000 }).then(() => true, () => false))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
    await h.waitForSelector('.mf-welcome', { timeout: 8000 })
    await h.waitForTimeout(150)
    const id = await h.evaluate(() => document.querySelector('.mf-welcome')?.dataset.story ?? '')
    if (seen.has(id)) continue
    seen.add(id)
    await c.size(1440, 900)
    await h.waitForSelector('[data-thesis="line"]', { timeout: 30000 })
    await h.waitForTimeout(800)
    check(`${id}: reached Remember`, await until('Remember'), await chapter())
    await h.waitForTimeout(1500)
    await settle()
    for (const [w, ht] of SIZES) {
      await c.size(w, ht)
      await h.waitForTimeout(900)
      const m = await measure()
      console.log(`${id} ${w}x${ht}`, JSON.stringify(m))
      if (shots) await h.screenshot({ path: `${shots}/curve-${id}-${w}x${ht}.png` })
      check(`${id} ${w}x${ht}: nothing scrolls, the banner ends above the footer`, m && m.scrollers === 0 && m.curveBottom <= m.footTop, JSON.stringify(m))
      check(`${id} ${w}x${ht}: no big empty gap under the banner (under 12% of the window)`, m && m.gapUnder < ht * 0.12, JSON.stringify(m))
    }
  }
  check('all five stories seen', seen.size === STORIES.length, [...seen].join())
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()

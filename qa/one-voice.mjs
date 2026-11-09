// One voice per screen: landing on the Journal's Day, Week, Month and Year and on Home, at most one line of text animates
// (types in or rolls) in the first 6 seconds (a line queued behind another used to start within 2). Every running animation on a short piece of text is read every 50ms and
// grouped by the line it is in.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-e/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/one-voice.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
// In the evening, when the day page has most to say (the night pages, “For the morning”).
const s = await sandbox({ width: 1400, height: 900, at: process.env.AT ?? '21:30' })
const { h, v, go, send, close } = s
const PAGES = (process.env.PAGES ?? 'day,weekpage,monthpage,yearpage,today').split(',')
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false, hidden: true })
  await v('settings:set', { sounds: false, dayHints: true })
  for (const id of PAGES) {
    await go('inbox')
    await h.waitForTimeout(800)
    await h.evaluate(() => {
      const seen = (window.__voices = new Map())
      const line = (el) => el.closest('[data-line]') ?? el.closest('p, h1, h2, h3, li, label, button, [data-day-count]') ?? el
      const tick = () => {
        for (const one of document.getAnimations()) {
          const el = one.effect?.target
          if (!(el instanceof Element) || one.playState !== 'running') continue
          const timing = one.effect.getComputedTiming()
          if (!(timing.progress > 0 && timing.progress < 1)) continue
          const text = (el.textContent ?? '').trim()
          if (!text || text.length > 160 || !el.getClientRects().length) continue
          // On the page itself: the sidebar and the tabs answer a click, they are not lines said.
          if (!el.closest('section .overflow-y-auto') || el.closest('nav, [role=tablist], aside')) continue
          // Words that type in (Typed) or roll (Rolling); a whole block fading up with its page is not a line speaking.
          const name = one.animationName ?? ''
          if (!(el.classList.contains('mf-typed') || el.closest('[data-line]') || /slot|roll/i.test(String(el.className)) || el.parentElement?.closest('.mf-roll, [class*=slot]') || (name === '' && el.childElementCount === 0 && text.length <= 12))) continue
          const at = line(el)
          if (!seen.has(at)) seen.set(at, (at.textContent ?? '').trim().slice(0, 60))
        }
      }
      window.__voiceTimer = setInterval(tick, 50)
    })
    await send('view', id)
    await h.waitForTimeout(Number(process.env.WINDOW ?? 6000))
    const lines = await h.evaluate(() => (clearInterval(window.__voiceTimer), [...window.__voices.values()]))
    check(`${id}: at most one line animates its text on arrival`, lines.length <= 1, `${lines.length}: ${lines.join(' | ')}`)
  }
} finally {
  await close()
}
done()

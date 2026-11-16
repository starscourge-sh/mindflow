// The Journal's word and clock line sits on the page's foot: with a hint under the page it never lies over the hint's
// words, and with the hint gone it comes back down. A notice keeps clear of it.
//
//   npx electron-vite build --outDir out-wl
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-wl/main/index.js HALIGTREE_QA_AWAY=1 node qa/writer-line-hint.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, go, v, send } = c
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const today = new Date().toLocaleDateString('en-CA')
const boxes = () => h.evaluate(() => {
  const box = (one) => { if (!one) return null; const r = one.getBoundingClientRect(); return { top: r.top, bottom: r.bottom } }
  // The line's words, not the blur under them (BlurEdge, the line's first span since 72c5ea8fa: 3rem taller than the line).
  const words = document.querySelector('[data-writer-line] > span:not(.mf-blur-edge)')
  const got = [...document.querySelectorAll('button')].find((one) => one.textContent?.trim().startsWith('Got it') && one.closest('.mf-prose, div')?.querySelector('.mf-prose'))
  const hint = got?.closest('.mf-prose, div')?.parentElement?.querySelector('.mf-prose') ?? null
  // The line itself (its band: the words with their room round them), what must keep inside the page and off the hint.
  return { words: box(words), line: box(document.querySelector('[data-writer-line]')), hint: box(hint), page: box(document.querySelector('[data-day-write]')?.closest('[data-pane-card]')), height: innerHeight, toast: box(document.querySelector('[data-sonner-toast], [data-toast]')) }
})

await go('inbox')
await v('notes:day:save', today, { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Morning: three coffees, one idea, and a few more words to count.' }] }] } })
await send('day', today)
await wait(1200)
// A reload lands on the Journal as an arrival, with the hint docked under the page.
await h.reload()
await wait(2000)
if (!(await h.locator('[data-day-write] .tiptap').count())) { await send('day', today); await wait(1200) }
await h.locator('[data-day-write] .tiptap').click()
// The line comes with writing mode (three words in), never on the caret alone (the user, 15 Nov 2026).
await h.keyboard.press('Meta+ArrowDown')
await h.keyboard.type(' and then the day went on ', { delay: 30 })
await wait(900)
const up = await boxes()
if (shots) await h.screenshot({ path: `${shots}/with-hint-light.png` })
check('a hint shows under the page', !!up.hint, JSON.stringify(up.hint))
check('the line shows', !!up.words, JSON.stringify(up.words))
check('the line sits inside the page', up.line.bottom <= up.page.bottom + 0.5, `${up.line.bottom} of ${up.page.bottom}`)
check('the line never lies over the hint', up.line.bottom <= up.hint.top || up.line.top >= up.hint.bottom, `${JSON.stringify(up.line)} ${JSON.stringify(up.hint)}`)
await h.evaluate(() => document.documentElement.classList.add('dark'))
await wait(200)
if (shots) await h.screenshot({ path: `${shots}/with-hint-dark.png` })
await h.evaluate(() => document.documentElement.classList.remove('dark'))
const lift = await h.evaluate(() => getComputedStyle(document.querySelector('[data-toast-lane]') ?? document.documentElement).getPropertyValue('--toast-bottom').trim())
check('notices are lifted over the line, as a plain number', lift.endsWith('px') && parseFloat(lift) >= up.height - up.words.top - 24, lift)
await h.getByRole('button', { name: /^Got it/ }).first().click()
await wait(700)
await h.locator('[data-day-write] .tiptap').click()
await wait(500)
const gone = await boxes()
if (shots) await h.screenshot({ path: `${shots}/no-hint-light.png` })
check('with the hint gone the line comes down with the page', gone.line.bottom > up.line.bottom + 20, `${up.line.bottom} to ${gone.line.bottom}`)
check('still inside the page', gone.line.bottom <= gone.page.bottom + 0.5, `${gone.line.bottom} of ${gone.page.bottom}`)
await h.keyboard.press('Meta+Shift+Enter')
await wait(900)
const room = await h.evaluate(() => getComputedStyle(document.querySelector('[data-toast-lane]') ?? document.documentElement).getPropertyValue('--toast-bottom').trim())
check('the writing room keeps its own notice height', !room.includes('60px') && room !== String(lift), room)
await h.keyboard.press('Escape')
done()

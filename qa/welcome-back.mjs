// Back in the welcome does what a person expects, and the footer and demos read plainly:
//  - Back (the button, ← and ⌘[) returns to the screen seen just before, as it was left: the answers' summary
//    goes back to the questions with every answer kept; coming back to You shows the summary again; A day steps
//    back a moment at a time; Ready's import map closes first; after a skip, Back goes to the page skipped from
//  - Back is not offered on the first page, and ⌘[ there never says "That waits until the welcome is done"
//  - quick capture never stays open over a page Back or Next went to
//  - the step marks: the one you are on is lit, ones skipped past stay faint
//  - no footer words sit next to the arrow: only Next is beside it
//  - the goal row says how to log progress, with the line itself drawn as a token, and the word "progress"
//  - the picture's bar in Write (and every other demo) takes no pointer and nothing in it can be focused
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/welcome-back.mjs [shots-dir]
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let failed = 0
const check = (name, ok, more = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${more ? `  (${more})` : ''}`)
}
const open = async (h) => {
  const own = await h.waitForSelector('.mf-welcome', { timeout: 8000 }).then(() => true, () => false)
  if (!own) await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:welcome')))
  await h.waitForSelector('.mf-welcome', { timeout: 8000 })
}
const chapter = (h) => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
const done = (h) => h.evaluate(() => [...document.querySelectorAll('.mf-welcome [data-reel]')].every((el) => el.dataset.reel === 'done'))
const settle = async (h) => {
  for (let i = 0; i < 12 && !(await done(h)); i++) (await h.keyboard.press('Escape'), await h.waitForTimeout(400))
}
const backButton = (h) => h.click('.mf-welcome footer button:has-text("Back")')
const nextButton = async (h) => {
  const skip = await h.$('footer button:has-text("Skip trying it")')
  await (skip ? skip.click() : h.click('footer [data-next]'))
}
/** On to the named chapter, settling each page on the way. */
const until = async (h, name) => {
  for (let i = 0; i < 30 && !(await chapter(h)).includes(name); i++) (await settle(h), await nextButton(h), await h.waitForTimeout(650))
  return (await chapter(h)).includes(name)
}
const nextLabel = (h) => h.evaluate(() => document.querySelector('.mf-welcome footer [data-next]')?.textContent?.trim() ?? '')
const ready = (h) => h.evaluate(() => document.querySelector('.mf-welcome footer [data-next]')?.hasAttribute('data-ready') ?? false)
/** Which moment of A day is on screen (0 morning, 1 lunchtime, 3 evening). */
const moment = (h) => h.evaluate(() => [...document.querySelectorAll('.mf-welcome [data-frame^="moment-"]')].filter((el) => Number(getComputedStyle(el).opacity) > 0.5).map((el) => el.dataset.frame).join(','))
const boxUp = (c) => c.electron.evaluate(({ BrowserWindow }, url) => BrowserWindow.getAllWindows().some((w) => w.webContents.getURL() === url && w.isVisible()), c.page.url())
/** The footer: what sits just left of the arrow, and how far. */
const beside = (h) => h.evaluate(() => {
  const footer = document.querySelector('.mf-welcome footer')
  const slot = footer.querySelector('[data-next-arrow]')?.parentElement ?? [...footer.querySelectorAll('span[aria-hidden]')].find((el) => el.className.includes('w-8'))
  if (!slot || slot.getBoundingClientRect().width === 0) return { gap: Infinity, what: 'no arrow at this width' }
  const a = slot.getBoundingClientRect()
  const words = [...footer.querySelectorAll('button, p, span')].filter((el) => !el.closest('[data-next]') && !slot.contains(el) && !el.contains(slot) && el.innerText?.trim() && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden')
  let gap = Infinity
  let what = ''
  for (const el of words) {
    const r = el.getBoundingClientRect()
    if (r.right <= a.left + 1 && a.left - r.right < gap) (gap = a.left - r.right, what = el.innerText.trim())
  }
  return { gap, what }
})
/** Buttons and fields in the page's demos (not the welcome's own controls) a person could point at or tab to. */
const live = (h) => h.evaluate(() => [...document.querySelectorAll('.mf-welcome main button, .mf-welcome main [tabindex], .mf-welcome main input')]
  .filter((el) => !el.closest('[inert]') && getComputedStyle(el).pointerEvents !== 'none' && el.getBoundingClientRect().width > 0)
  .map((el) => el.getAttribute('aria-label') || el.innerText.trim().slice(0, 30) || el.tagName))

for (const [theme, width, height] of [['light', 1280, 800], ['dark', 1280, 800]]) {
  const c = await sandbox({ width, height, seeded: false })
  const { h } = c
  const shot = async (name) => SHOTS && h.screenshot({ path: `${SHOTS}/${theme}-${name}.png` })
  try {
    await c.theme(theme)
    await open(h)
    // --- Why: no Back ---
    const hidden = await h.evaluate(() => { const b = [...document.querySelectorAll('.mf-welcome footer button')].find((el) => el.textContent.trim() === 'Back'); return !b || getComputedStyle(b).visibility === 'hidden' })
    check(`${theme}: Back is not offered on the first page`, hidden)
    await h.keyboard.press('ArrowLeft')
    await h.keyboard.press('Meta+BracketLeft')
    await h.waitForTimeout(400)
    const held = await h.evaluate(() => document.querySelector('.mf-welcome footer [role="status"]')?.textContent ?? '')
    check(`${theme}: ← and ⌘[ on the first page stay there, and never say “That waits”`, (await chapter(h)).includes('Why') && !/waits/.test(held), held)
    const gapWhy = await beside(h)
    check(`${theme}: Why: no footer words beside the arrow`, gapWhy.gap >= 48, JSON.stringify(gapWhy))
    if (theme === 'light') await shot('why-footer')
    // --- You: answer, then the summary ---
    await until(h, 'You')
    // Answers are kept between runs on the same data: pressed only if not yet.
    if ((await h.getAttribute('button[aria-pressed]:has-text("Study")', 'aria-pressed')) !== 'true') await h.click('button[aria-pressed]:has-text("Study")')
    const field = await h.$('[aria-label="Your own tag"]')
    await field.click()
    await h.keyboard.type('chemistry')
    await h.keyboard.press('Enter')
    await h.fill('input[aria-label="A goal"]', 'Finish reading The Godfather')
    await h.click('.mf-welcome h1')
    await h.waitForTimeout(300)
    await h.click('footer [data-next]')
    await h.waitForSelector('[data-payoff]', { timeout: 6000 })
    await h.waitForTimeout(1500)
    const how = await h.evaluate(() => ({ text: document.querySelector('[data-made="goal"]')?.innerText.replace(/\s+/g, ' ') ?? '', token: document.querySelector('[data-made="goal"] [data-log-line] .tiptap-token')?.textContent ?? '', grid: [...document.querySelectorAll('[data-payoff] svg[role="img"]')].some((svg) => !svg.closest('[data-goal-desk]')), card: !!document.querySelector('[data-goal-desk] [data-goal-preview]') }))
    check(`${theme}: the goal row shows the line to write as a token`, how.token === '+the godfather:', how.token)
    check(`${theme}: the goal row says it goes in the goal's progress log, on the Goals page`, /progress log/.test(how.text) && /Goals page/.test(how.text) && !/log a step/.test(how.text), how.text)
    check(`${theme}: no unlabelled dot grid on the summary; the goal's own card is there, said for what it is`, !how.grid && how.card)
    const over = await h.evaluate(() => {
      const card = document.querySelector('[data-goal-desk]')?.getBoundingClientRect()
      if (!card) return []
      return [...document.querySelectorAll('[data-payoff] [data-made] p, [data-payoff] [data-made] button, [data-goal-how]')].filter((el) => { const r = el.getBoundingClientRect(); return r.right > card.left && r.left < card.right && r.bottom > card.top && r.top < card.bottom }).map((el) => el.innerText.slice(0, 30))
    })
    check(`${theme}: the goal's card covers none of the summary`, over.length === 0, over.join(' | '))
    const gapYou = await beside(h)
    check(`${theme}: You: no footer words beside the arrow`, gapYou.gap >= 48, JSON.stringify(gapYou))
    await shot('payoff')
    // Back from the summary: the questions, every answer kept.
    await backButton(h)
    await h.waitForTimeout(700)
    const kept = await h.evaluate(() => ({
      payoff: !!document.querySelector('[data-payoff]'),
      study: document.querySelector('button[aria-pressed="true"]')?.textContent ?? '',
      tag: [...document.querySelectorAll('button[aria-pressed="true"]')].some((b) => b.textContent.includes('#chemistry')),
      goal: document.querySelector('input[aria-label="A goal"]')?.value ?? ''
    }))
    check(`${theme}: Back from the summary goes to the questions, still on You`, !kept.payoff && (await chapter(h)).includes('You'), await chapter(h))
    check(`${theme}: ...with every answer kept`, /Study/.test(kept.study) && kept.tag && kept.goal === 'Finish reading The Godfather', JSON.stringify(kept))
    if (theme === 'light') await shot('back-to-questions')
    // Next shows the summary again; Next on to Catch; Back (←) shows the summary as it was left.
    await h.click('footer [data-next]')
    await h.waitForSelector('[data-payoff]', { timeout: 6000 })
    await h.waitForTimeout(600)
    await h.click('footer [data-next]')
    await h.waitForTimeout(800)
    check(`${theme}: from the summary, Next goes on to Catch`, (await chapter(h)).includes('Catch'), await chapter(h))
    await h.keyboard.press('ArrowLeft')
    await h.waitForTimeout(800)
    check(`${theme}: Back (←) from Catch returns to the summary, as it was left`, (await chapter(h)).includes('You') && !!(await h.$('[data-payoff]')))
    // ⌘[ from the summary: the questions; ⌘] twice: the summary, then Catch.
    await h.keyboard.press('Meta+BracketLeft')
    await h.waitForTimeout(700)
    check(`${theme}: ⌘[ works as Back`, !(await h.$('[data-payoff]')) && (await chapter(h)).includes('You'))
    await h.keyboard.press('Meta+BracketRight')
    await h.waitForSelector('[data-payoff]', { timeout: 6000 })
    await h.waitForTimeout(600)
    await h.keyboard.press('Meta+BracketRight')
    await h.waitForTimeout(800)
    check(`${theme}: ⌘] works as Next`, (await chapter(h)).includes('Catch'), await chapter(h))
    // --- Catch: quick capture open, then Back ---
    await settle(h)
    await h.waitForTimeout(500)
    const gapCatch = await beside(h)
    check(`${theme}: Catch (Your turn): no footer words beside the arrow`, gapCatch.gap >= 48, JSON.stringify(gapCatch))
    await shot('catch-footer')
    await h.click('footer button:has-text("Try it in quick capture")')
    await h.waitForTimeout(900)
    const upBefore = await boxUp(c)
    await backButton(h)
    await h.waitForTimeout(900)
    check(`${theme}: Back with quick capture open goes back and puts quick capture away`, upBefore && !(await boxUp(c)) && (await chapter(h)).includes('You'), `box was up: ${upBefore}`)
    // --- Write: the picture's bar is a picture ---
    await h.click('footer [data-next]')
    await h.waitForTimeout(800)
    await until(h, 'Write')
    const bar = await h.waitForSelector('[data-picture-bar]', { timeout: 30000 }).then(() => true, () => false)
    const barLive = await h.evaluate(() => {
      const el = document.querySelector('[data-picture-bar]')
      if (!el) return null
      const focusable = [...el.querySelectorAll('button, [tabindex]')].filter((one) => !one.closest('[inert]') && one.tabIndex >= 0)
      return { pointer: getComputedStyle(el).pointerEvents, inert: el.closest('[inert]') !== null, focusable: focusable.length }
    })
    check(`${theme}: Write: the picture's bar shows itself`, bar)
    check(`${theme}: Write: the bar takes no pointer and nothing in it can be focused`, !!barLive && barLive.pointer === 'none' && barLive.inert && barLive.focusable === 0, JSON.stringify(barLive))
    if (bar) {
      await h.hover('[data-picture]', { force: true }).catch(() => undefined)
      await h.waitForTimeout(200)
      await shot('write-bar')
    }
    await h.waitForFunction(() => (document.querySelector('[data-example-note] figcaption')?.textContent ?? '').includes('1481'), null, { timeout: 15000 }).catch(() => undefined)
    check(`${theme}: Write: the caption types itself in`, (await h.evaluate(() => document.querySelector('[data-example-note] figcaption')?.textContent ?? '')).includes('Perugino'))
    await settle(h)
    await h.waitForTimeout(700)
    await h.hover('[data-picture]', { force: true }).catch(() => undefined)
    await h.waitForTimeout(400)
    check(`${theme}: Write: pointing at the picture once it has played brings no bar back`, !(await h.$('[data-picture-bar]')))
    const liveWrite = await live(h)
    check(`${theme}: Write: nothing in the demo can be pressed or tabbed to`, liveWrite.length === 0, liveWrite.join(', '))
    // --- The flow, then A day: Back a moment at a time ---
    await until(h, 'The flow')
    await settle(h)
    const liveFlow = await live(h)
    check(`${theme}: The flow: nothing in the demo can be pressed or tabbed to`, liveFlow.length === 0, liveFlow.join(', '))
    await until(h, 'A day')
    await settle(h)
    await h.waitForTimeout(1200)
    const liveDay = await live(h)
    check(`${theme}: A day: nothing in the demo can be pressed or tabbed to`, liveDay.length === 0, liveDay.join(', '))
    check(`${theme}: A day played to the evening`, (await moment(h)) === 'moment-3', await moment(h))
    await backButton(h)
    await h.waitForTimeout(1300)
    const lunch = { at: await moment(h), label: await nextLabel(h), ready: await ready(h), words: await done(h), answer: await h.evaluate(() => document.querySelector('[data-frame="moment-1"] [data-answer]')?.innerText.trim().length ?? 0) }
    check(`${theme}: Back from the evening shows lunchtime, whole, and Next says “Next: evening”`, lunch.at === 'moment-1' && /evening/.test(lunch.label) && lunch.ready && lunch.words && lunch.answer > 20, JSON.stringify(lunch))
    if (theme === 'light') await shot('day-back-lunchtime')
    await h.keyboard.press('ArrowLeft')
    await h.waitForTimeout(1300)
    const morning = { at: await moment(h), label: await nextLabel(h), postcard: await h.evaluate(() => !!document.querySelector('[data-frame="moment-0"] [data-answer]')) }
    check(`${theme}: Back again shows the morning, whole, and Next says “Next: lunchtime”`, morning.at === 'moment-0' && /lunchtime/.test(morning.label), JSON.stringify(morning))
    await h.click('footer [data-next]')
    await h.waitForTimeout(1300)
    check(`${theme}: Next from a moment gone back to goes on to the next one, not off the page`, (await chapter(h)).includes('A day') && (await moment(h)) === 'moment-1', `${await chapter(h)} ${await moment(h)}`)
    await backButton(h)
    await h.waitForTimeout(900)
    await backButton(h)
    await h.waitForTimeout(900)
    check(`${theme}: Back from the first moment goes to The flow, as it was left`, (await chapter(h)).includes('The flow') && (await done(h)), await chapter(h))
    // --- Ready: the import map closes first ---
    await until(h, 'Ready')
    await h.waitForTimeout(800)
    const gapReady = await beside(h)
    check(`${theme}: Ready: no footer words beside the arrow`, gapReady.gap >= 48, JSON.stringify(gapReady))
    await shot('ready-footer')
    await h.click('.mf-welcome main button:has-text("Bring my notes")')
    await h.waitForTimeout(500)
    const map = !!(await h.$('[role="tablist"][aria-label="Bring notes from"]'))
    await backButton(h)
    await h.waitForTimeout(500)
    check(`${theme}: Back with the import map open closes it, still on Ready`, map && !(await h.$('[role="tablist"][aria-label="Bring notes from"]')) && (await chapter(h)).includes('Ready'))
    await backButton(h)
    await h.waitForTimeout(800)
    check(`${theme}: Back from Ready goes to Make it yours`, (await chapter(h)).includes('Make it yours'), await chapter(h))
    // --- A skip, then Back: the page skipped from ---
    await backButton(h)
    await h.waitForTimeout(800)
    for (let i = 0; i < 6 && !(await chapter(h)).includes('Write'); i++) (await backButton(h), await h.waitForTimeout(800))
    check(`${theme}: Back walks back to Write`, (await chapter(h)).includes('Write'), await chapter(h))
    await h.click('footer button:has-text("Skip the welcome")')
    await h.waitForTimeout(900)
    check(`${theme}: Skip the welcome goes to Ready`, (await chapter(h)).includes('Ready'))
    await backButton(h)
    await h.waitForTimeout(900)
    check(`${theme}: Back after a skip returns to the page skipped from, whole`, (await chapter(h)).includes('Write') && (await done(h)), await chapter(h))
  } catch (error) {
    check(`${theme}: ran to the end`, false, String(error).slice(0, 300))
  } finally {
    if (c.errors.length) console.log(c.errors.join('\n'))
    await c.close()
  }
}

// A skip from the first page: the marks of pages never seen stay faint; Back returns to Why; narrow, still nothing beside the arrow.
{
  const c = await sandbox({ width: 820, height: 620, seeded: false })
  const { h } = c
  try {
    await c.theme('dark')
    await open(h)
    await settle(h)
    const gapNarrow = await beside(h)
    check('narrow: Why: no footer words beside the arrow', gapNarrow.gap >= 48, JSON.stringify(gapNarrow))
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/dark-narrow-why-footer.png` })
    await h.click('footer button:has-text("Skip the welcome")')
    await h.waitForTimeout(900)
    const marks = await h.evaluate(() => [...document.querySelectorAll('.mf-welcome footer span[aria-hidden] > span.rounded-full')].map((el) => Number(getComputedStyle(el).opacity).toFixed(2)))
    check('after a skip from Why, the marks of pages never seen stay faint, Ready lit', marks.length === 8 && Number(marks[0]) > 0.3 && marks.slice(1, 7).every((one) => Number(one) < 0.2) && Number(marks[7]) > 0.7, marks.join(' '))
    const gapNarrowReady = await beside(h)
    check('narrow: Ready: no footer words beside the arrow', gapNarrowReady.gap >= 48, JSON.stringify(gapNarrowReady))
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/dark-narrow-ready-footer.png` })
    await h.keyboard.press('ArrowLeft')
    await h.waitForTimeout(900)
    check('Back after a skip from Why returns to Why', (await chapter(h)).includes('Why'), await chapter(h))
    await until(h, 'Catch')
    await settle(h)
    await h.waitForTimeout(800)
    const gapNarrowCatch = await beside(h)
    check('narrow: Catch (Your turn): no footer words beside the arrow', gapNarrowCatch.gap >= 48, JSON.stringify(gapNarrowCatch))
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/dark-narrow-catch-footer.png` })
  } catch (error) {
    check('skip run ran to the end', false, String(error).slice(0, 300))
  } finally {
    if (c.errors.length) console.log(c.errors.join('\n'))
    await c.close()
  }
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)

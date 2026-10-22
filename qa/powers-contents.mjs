// What Haligtree can do has the same contents list as Settings (page-contents.tsx):
// each section, with how many of its cards you have tried ("Catching 2 of 9"),
// the one in view lit as you scroll, a click bringing its heading into view.
// The row of chips it replaces is gone. Nothing is cut off at 900x700 or
// 1600x1000, in a light theme and a dark one.
// Run it in the sandbox (nothing ticked) and without (one power used):
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-toc/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=<dir> node qa/powers-contents.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
let passed = 0, failed = 0
const check = (ok, what) => (ok ? passed++ : failed++, console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`))

const c = await sandbox({ width: 1600, height: 1000 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const toc = '[data-page-contents]'
const listed = () => h.$$eval(`${toc} .tiptap-toc-item`, (all) => all.map((one) => one.textContent.trim()))
const lit = () => h.$eval(`${toc} [data-active="true"]`, (one) => one.textContent.trim()).catch(() => null)
const scroller = () => h.$eval('[data-power]', (one) => one.closest('.overflow-y-auto').scrollTop)
// What each section should say, read from the cards themselves: a tick on a card is a power you have used.
const expected = () => h.$$eval('section[data-group]', (all) => all.map((section) => {
  const cards = section.querySelectorAll('[data-power]')
  if (!cards.length) return section.dataset.group
  const used = [...cards].filter((card) => card.querySelector('[title="You have used this"]')).length
  return `${section.dataset.group} ${used} of ${cards.length}`
}))
const headingTop = (name) => h.evaluate((name) => {
  const head = document.querySelector(`section[data-group="${name}"] > h2`)
  return head.getBoundingClientRect().top - head.closest('.overflow-y-auto').getBoundingClientRect().top
}, name)

try {
  await v('settings:set', { motion: true })
  // One power used (a note shown as a board), so a count is more than 0. The sandbox ticks nothing: it is not your notes.
  const sandboxed = (process.env.QA_ARGS ?? '').includes('--sandbox')
  if (!sandboxed) await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await h.evaluate(() => localStorage.setItem('board:qa', 'on'))
  await h.reload()
  await wait(1500)
  await c.go('powers')
  await wait(800)

  // --- Listed, with the right counts; the chips are gone.
  check(await h.locator(toc).count() === 1, 'the page has a contents list')
  check(await h.locator('nav[aria-label="Groups"]').count() === 0, 'the row of chips is gone')
  const names = await listed()
  const want = await expected()
  console.log(`     ${names.join(' | ')}`)
  check(want.length === 8, `eight sections on the page (${want.length})`)
  check(JSON.stringify(names) === JSON.stringify(want), 'each section is listed, in order, with how many of its cards are tried')
  const total = await h.$eval('[data-powers-tried] span', (one) => one.textContent)
  const sum = names.reduce((all, one) => all + Number(one.match(/(\d+) of/)?.[1] ?? 0), 0)
  check(total.startsWith(`${sum} of`), `the counts add up to the page's own (${sum}, "${total}")`)
  check(sandboxed ? sum === 0 : sum >= 1, `${sandboxed ? 'in the sandbox nothing is ticked' : 'the board used shows in its section\'s count'} (${sum})`)
  check(await h.locator(`${toc}[data-wide]`).count() === 1, 'at 1600 wide it is open, its words showing')

  // --- A click brings the heading into view, and lights the entry.
  for (const name of ['Windows', 'Remembering', 'Every page']) {
    await h.click(`${toc} .tiptap-toc-item:has-text("${name}")`)
    await wait(1100)
    const top = await headingTop(name)
    // The last section cannot reach the top: the page ends first. In view is what counts.
    const room = await h.evaluate(() => document.querySelector('[data-power]').closest('.overflow-y-auto').clientHeight)
    check(top >= 0 && (top < 80 || (name === 'Every page' && top < room - 200)), `"${name}" brings its heading into view (${Math.round(top)}px down)`)
    check((await lit())?.startsWith(name), `and "${name}" is lit (${await lit()})`)
  }

  // --- Scrolling by hand moves the light.
  await h.mouse.move(700, 500)
  await h.mouse.wheel(0, -100000)
  await wait(1200)
  check((await lit())?.startsWith('Catching'), `at the top "Catching" is lit (${await lit()})`)
  const toWriting = await h.evaluate(() => {
    const head = document.querySelector('section[data-group="Writing"]')
    const box = head.closest('.overflow-y-auto')
    return head.getBoundingClientRect().top - box.getBoundingClientRect().top + 30
  })
  await h.mouse.wheel(0, toWriting)
  await wait(1400)
  check((await lit())?.startsWith('Writing'), `scrolled down to Writing, "Writing" is lit (${await lit()})`)
  await h.mouse.wheel(0, 100000)
  await wait(1400)
  check((await lit())?.startsWith('Every page'), `at the bottom "Every page" is lit (${await lit()})`)

  // --- Keys, as in Settings: ↑ ↓ move, Return goes.
  await h.mouse.wheel(0, -100000)
  await wait(1000)
  await h.focus(toc)
  await wait(200)
  await h.keyboard.press('ArrowDown')
  await h.keyboard.press('ArrowDown')
  await h.keyboard.press('Enter')
  await wait(1100)
  const third = names[2].replace(/ \d+ of \d+$/, '')
  check((await headingTop(third)) < 80 && (await headingTop(third)) >= 0, `↓ ↓ then Return goes to "${third}"`)
  await h.keyboard.press('Escape')
  await h.mouse.wheel(0, -100000)
  await wait(800)

  // --- Nothing cut off, light and dark, wide and small.
  for (const theme of ['paper', 'github']) {
    await c.theme(theme)
    for (const [w, hh] of [[1600, 1000], [900, 700]]) {
      await c.size(w, hh)
      await c.go('powers')
      await wait(900)
      const state = await h.evaluate((sel) => {
        const nav = document.querySelector(sel)
        const sideways = [document.documentElement, ...document.querySelectorAll('.overflow-y-auto')].some((one) => one.scrollWidth > one.clientWidth + 1)
        const title = document.querySelector('h1').getBoundingClientRect()
        const pane = document.querySelector('[data-power]').closest('.overflow-y-auto').getBoundingClientRect()
        const cards = [...document.querySelectorAll('[data-power], section[data-group] > h2')].map((one) => one.getBoundingClientRect()).filter((r) => r.bottom > 0 && r.top < innerHeight)
        if (!nav) return { nav: false, sideways, title: title.right <= pane.right }
        const strip = nav.getBoundingClientRect()
        const wide = nav.hasAttribute('data-wide')
        const cut = wide ? [...nav.querySelectorAll('.tiptap-toc-text')].filter((one) => one.scrollWidth > one.clientWidth + 1).map((one) => one.textContent) : []
        return {
          nav: true,
          wide,
          sideways,
          title: title.right <= pane.right,
          inside: strip.left >= pane.left && strip.right <= pane.right + 1 && strip.top >= pane.top - 1,
          clear: cards.every((one) => strip.left >= one.right - 1 || strip.right <= one.left),
          cut
        }
      }, toc)
      const at = `${theme} ${w}x${hh}`
      check(state.nav, `${at}: the list is there (${state.wide ? 'open' : 'folded'})`)
      check(!state.sideways, `${at}: no sideways scroll`)
      check(state.title, `${at}: the title fits`)
      check(state.inside, `${at}: the list sits inside the pane`)
      check(state.clear, `${at}: the list sits clear of every card`)
      check(!state.cut?.length, `${at}: no entry cut off (${state.cut?.join(', ')})`)
      await h.screenshot({ path: `${dir}/top-${theme}-${w}.png` })
      await h.click(`${toc} .tiptap-toc-item >> nth=3`)
      await wait(1100)
      await h.mouse.move(w - 30, Math.round(hh / 2))
      await h.hover(`${toc} .tiptap-toc-item >> nth=3`)
      await wait(400)
      const open = await h.$$eval(`${toc} .tiptap-toc-text`, (all) => all.filter((one) => one.checkVisibility() && one.scrollWidth > one.clientWidth + 1).map((one) => one.textContent))
      check(await h.locator(`${toc} .tiptap-toc-text >> nth=0`).isVisible(), `${at}: pointed at, it shows the names`)
      check(open.length === 0, `${at}: pointed at, no name cut off (${open.join(', ')})`)
      await h.screenshot({ path: `${dir}/hover-${theme}-${w}.png` })
      await h.mouse.move(Math.round(w * 0.6), 20)
    }
  }
  await c.size(1600, 1000)
  await h.evaluate(() => localStorage.removeItem('board:qa'))
  check(c.errors.length === 0, `no errors (${c.errors.slice(0, 3).join(' | ')})`)
} catch (error) {
  failed++
  console.log('FAIL', error.message)
} finally {
  console.log(`\n${passed} passed, ${failed} failed`)
  await c.close()
  process.exit(failed ? 1 : 0)
}

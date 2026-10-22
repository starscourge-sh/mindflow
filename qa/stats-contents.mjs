// Stats has the same contents list as Settings and What Haligtree can do
// (page-contents.tsx): every section on show, the one in view lit as you
// scroll, a click bringing its heading into view. Nothing cut off at 900x700
// or 1600x1000, in a light theme and a dark one.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-toc/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/stats-contents.mjs
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
const shown = () => h.$$eval('section[data-group]', (all) => all.filter((one) => one.checkVisibility()).map((one) => one.dataset.group))
const headingTop = (name) => h.evaluate((name) => {
  const head = [...document.querySelectorAll('section[data-group]')].find((one) => one.dataset.group === name).querySelector('h2')
  return head.getBoundingClientRect().top - head.closest('.overflow-y-auto').getBoundingClientRect().top
}, name)

try {
  await v('settings:set', { motion: true })
  await c.go('stats')
  await wait(1200)

  check(await h.locator(toc).count() === 1, 'Stats has a contents list')
  const names = await listed()
  console.log(`     ${names.join(' | ')}`)
  check(names.length >= 8, `it lists the sections (${names.length})`)
  check(JSON.stringify(names) === JSON.stringify(await shown()), 'exactly the sections on show, in order')
  check(await h.locator(`${toc}[data-wide]`).count() === 1, 'at 1600 wide it is open, its words showing')

  for (const name of [names[4], names[8]]) {
    await h.click(`${toc} .tiptap-toc-item >> text="${name}"`)
    await wait(1100)
    const top = await headingTop(name)
    check(top >= 0 && top < 80, `"${name}" brings its heading to the top (${Math.round(top)}px down)`)
    check(await lit() === name, `and "${name}" is lit (${await lit()})`)
  }

  await h.mouse.move(500, 500)
  await h.mouse.wheel(0, -100000)
  await wait(1200)
  check(await lit() === names[0], `at the top "${names[0]}" is lit (${await lit()})`)
  await h.mouse.wheel(0, 100000)
  await wait(1400)
  check(await lit() !== names[0] && !!(await lit()), `scrolled to the end, a later one is lit (${await lit()})`)

  for (const theme of ['paper', 'github']) {
    await c.theme(theme)
    for (const [w, hh] of [[1600, 1000], [900, 700]]) {
      await c.size(w, hh)
      await c.go('stats')
      await wait(1200)
      const state = await h.evaluate((sel) => {
        const nav = document.querySelector(sel)
        const sideways = [document.documentElement, ...document.querySelectorAll('.overflow-y-auto')].some((one) => one.scrollWidth > one.clientWidth + 1)
        if (!nav) return { nav: false, sideways }
        const strip = nav.getBoundingClientRect()
        const pane = nav.parentElement.getBoundingClientRect()
        const islands = [...document.querySelectorAll('section[data-group] .mf-island')].map((one) => one.getBoundingClientRect()).filter((r) => r.bottom > 0 && r.top < innerHeight)
        const wide = nav.hasAttribute('data-wide')
        return {
          nav: true,
          wide,
          sideways,
          inside: strip.left >= pane.left && strip.right <= pane.right + 1,
          clear: islands.every((one) => strip.left >= one.right - 1),
          cut: wide ? [...nav.querySelectorAll('.tiptap-toc-text')].filter((one) => one.scrollWidth > one.clientWidth + 1).map((one) => one.textContent) : []
        }
      }, toc)
      const at = `${theme} ${w}x${hh}`
      check(state.nav, `${at}: the list is there (${state.wide ? 'open' : 'folded'})`)
      check(!state.sideways, `${at}: no sideways scroll`)
      check(state.inside, `${at}: the list sits inside the pane`)
      check(state.clear, `${at}: the list sits clear of every section`)
      check(!state.cut?.length, `${at}: no entry cut off (${state.cut?.join(', ')})`)
      await h.screenshot({ path: `${dir}/stats-${theme}-${w}.png` })
    }
  }
  await c.size(1600, 1000)
  check(c.errors.length === 0, `no errors (${c.errors.slice(0, 3).join(' | ')})`)
} catch (error) {
  failed++
  console.log('FAIL', error.message)
} finally {
  console.log(`\n${passed} passed, ${failed} failed`)
  await c.close()
  process.exit(failed ? 1 : 0)
}

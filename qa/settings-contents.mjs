// Settings has the note editor's outline beside its column: the groups on show
// and the settings under each, the one in view lit as you scroll; a click goes
// there (a glide, or at once with Motion off) and lights the setting. It
// follows the search and settings that depend on others, is reached by Tab and
// ⇧⌘O, folds where the room beside the column is short (the column giving a
// little way, as a note does for its outline) and never makes the page scroll sideways.
// "Bubble sits" is always listed, saying when it shows.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-toc/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/settings-contents.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
let passed = 0, failed = 0
const check = (ok, what) => (ok ? passed++ : failed++, console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`))

const c = await sandbox({ width: 1440, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const toc = '[data-page-contents]'
const room = () => h.evaluate(() => { const col = document.querySelector('.mf-island')?.getBoundingClientRect(); const pane = document.querySelector('[data-setting]')?.closest('.overflow-y-auto')?.getBoundingClientRect(); return col && pane ? Math.round(pane.right - col.right) : null })
const listed = () => h.$$eval(`${toc} .tiptap-toc-item`, (all) => all.map((one) => one.textContent))
const lit = () => h.$eval(`${toc} [data-active="true"]`, (one) => one.textContent).catch(() => null)
const shown = () => h.$$eval('section[data-group], [data-setting-title]', (all) => all.filter((one) => one.checkVisibility()).map((one) => one.dataset.group ?? one.dataset.settingTitle))
const scrollTop = () => h.$eval('[data-setting]', (one) => one.closest('.overflow-y-auto').scrollTop)
const section = async (name) => { await h.click(`[data-section="${name}"]`); await wait(800) }
const noSideways = () => h.evaluate(() => [document.documentElement, ...document.querySelectorAll('.overflow-y-auto')].every((one) => one.scrollWidth <= one.clientWidth + 1))

try {
  await v('settings:set', { focusShows: 'bubble', motion: true, postcards: false })
  await c.go('settings')
  await section('Appearance')

  // --- Wide: open, in the space beside the column, listing what is on show.
  check(await h.locator(toc).count() === 1, 'Settings has a contents list')
  check(await h.locator(`${toc}[data-wide]`).count() === 1, 'with room beside the column it is open, its words showing')
  const names = await listed()
  check(['Colours', 'Layout', 'Window placement', 'Theme', 'Session bubble', 'Bubble sits'].every((one) => names.includes(one)), `it lists groups and settings (${names.length} rows)`)
  check(JSON.stringify(names) === JSON.stringify(await shown()), 'it lists exactly the groups and settings on show, in order')
  const beside = await h.evaluate((sel) => {
    const nav = document.querySelector(sel).getBoundingClientRect()
    const island = document.querySelector('.mf-island').getBoundingClientRect()
    return nav.left >= island.right && nav.right <= window.innerWidth
  }, toc)
  check(beside, 'it sits right of the column, clear of every setting')
  check(await lit() === 'Colours' || await lit() === 'Theme', `at the top the first entry is lit (${await lit()})`)
  check(await noSideways(), 'no sideways scroll')

  // --- Settings shown by others' values: always listed, saying so.
  await v('settings:set', { focusShows: 'note' })
  await wait(700)
  check((await listed()).includes('Bubble sits'), '"Bubble sits" is listed with the timer in the note alone')
  check((await listed()).includes('Postcard border'), '"Postcard border" is listed with Postcards off')
  check(await h.locator('[data-setting-title="Bubble sits"] [data-bubble-off]').count() === 1, '"Bubble sits" says when it shows')

  // --- A click glides there, lights the entry, and the setting glows.
  for (const theme of ['paper', 'github']) {
    if (theme !== 'paper') { await c.theme(theme); await c.go('settings'); await section('Appearance') }
    await h.screenshot({ path: `${dir}/wide-${theme}.png` })
  }
  const before = await scrollTop()
  await h.click(`${toc} .tiptap-toc-item:has-text("Window placement")`)
  await wait(120)
  const mid = await scrollTop()
  await wait(1000)
  const after = await scrollTop()
  const landed = await h.evaluate(() => {
    const head = document.querySelector('section[data-group="Window placement"] > h3')
    const box = head.closest('.overflow-y-auto').getBoundingClientRect()
    return head.getBoundingClientRect().top - box.top
  })
  check(after > before + 200 && landed >= 0 && landed < 60, `"Window placement" is brought to the top (${Math.round(landed)}px down)`)
  check(mid > before && mid < after, `with Motion on it glides (${before} -> ${mid} -> ${after})`)
  check(await lit() === 'Window placement', `the entry gone to is lit (${await lit()})`)
  await h.click(`${toc} .tiptap-toc-item:has-text("Bubble sits")`)
  await wait(200)
  check(await h.locator('[data-setting-title="Bubble sits"][data-landed]').count() === 1, 'the setting gone to lights up')
  await h.screenshot({ path: `${dir}/landed-github.png` })
  await wait(1800)
  check(await h.locator('[data-landed]').count() === 0, 'and the light goes after a moment')

  // --- Scrolling by hand moves the light.
  await h.mouse.move(500, 400)
  await h.mouse.wheel(0, -100000)
  await wait(1200)
  const top = await lit()
  await h.mouse.wheel(0, 1500)
  await wait(1200)
  check(top !== await lit() && !!(await lit()), `scrolling moves the light (${top} -> ${await lit()})`)

  // --- Motion off: there at once.
  await v('settings:set', { motion: false })
  await wait(500)
  await h.mouse.wheel(0, -100000)
  await wait(500)
  await h.click(`${toc} .tiptap-toc-item:has-text("Sidebar and tabs")`)
  await wait(40)
  const at = await scrollTop()
  await wait(700)
  check(at > 200 && Math.abs(at - await scrollTop()) < 2, `with Motion off it is there at once (${at})`)
  await v('settings:set', { motion: true })

  // --- The search: only what matches.
  await h.fill('input[placeholder="Search…"]', 'bubble')
  await wait(700)
  const found = await listed()
  check(found.length > 0 && JSON.stringify(found) === JSON.stringify(await shown()), `searching, it lists only what matches (${found.join(', ')})`)
  check(!found.includes('Theme'), 'a setting the search hides is not listed')
  await h.screenshot({ path: `${dir}/search-github.png` })
  await h.fill('input[placeholder="Search…"]', '')
  await wait(500)

  // --- Keys: Tab from the search reaches it, arrows move, Return goes.
  await h.focus('input[placeholder="Search…"]')
  await h.keyboard.press('Tab')
  await wait(200)
  check(await h.evaluate((sel) => document.activeElement === document.querySelector(sel), toc), 'Tab from the search reaches the contents')
  check(await h.locator(`${toc} [data-keyed]`).count() === 1, 'focused, one entry is picked for the keys')
  await h.keyboard.press('End')
  await wait(100)
  const last = (await listed()).at(-1)
  await h.keyboard.press('Enter')
  await wait(1000)
  check(await h.locator(`[data-setting-title="${last}"][data-landed]`).count() === 1 || await lit() === last, `End then Return goes to the last (${last})`)
  await h.keyboard.press('Escape')

  // --- Brutal.
  await h.evaluate(() => { localStorage.setItem('style', 'brutal'); window.dispatchEvent(new StorageEvent('storage', { key: 'style' })) })
  await h.reload(); await wait(1500); await c.go('settings'); await section('Appearance')
  await h.screenshot({ path: `${dir}/wide-brutal.png` })
  await h.evaluate(() => { localStorage.setItem('style', 'soft'); window.dispatchEvent(new StorageEvent('storage', { key: 'style' })) })
  await h.reload(); await wait(1500)

  // --- Narrower: folded to rules beside the column (the column giving way a little), opened by hover; ⇧⌘O at any width.
  for (const theme of ['paper', 'github']) {
    await c.theme(theme)
    await c.size(1300, 800)
    await c.go('settings')
    await section('Appearance')
    console.log(`     room beside the column at 1300: ${await room()}px`)
    const folded = await h.locator(`${toc}:not([data-wide])`).count()
    check(folded === 1, `${theme}: at 1300 wide it folds to rules`)
    check(await noSideways(), `${theme}: no sideways scroll at 1300`)
    await h.screenshot({ path: `${dir}/folded-${theme}.png` })
    if (folded) {
      await h.hover(`${toc} .tiptap-toc-item >> nth=3`)
      await wait(300)
      await h.screenshot({ path: `${dir}/folded-hover-${theme}.png` })
      check(await h.locator(`${toc} .tiptap-toc-text >> nth=0`).isVisible(), `${theme}: hovering opens it to the names`)
      await h.mouse.move(300, 300)
    }
    // The user's own window is about 1000 wide with the sidebar: the list is there, beside the column, never over it.
    for (const width of [1000, 900, 800]) {
      await c.size(width, 800)
      await wait(500)
      const there = await h.evaluate((sel) => {
        const nav = document.querySelector(sel)
        if (!nav) return null
        const strip = nav.getBoundingClientRect()
        const islands = [...document.querySelectorAll('.mf-island')].map((one) => one.getBoundingClientRect())
        return { wide: nav.hasAttribute('data-wide'), clear: islands.every((one) => strip.left >= one.right), sidebar: !!document.querySelector('[data-sections]') }
      }, toc)
      check(!!there, `${theme}: at ${width} wide the list is there (${there?.wide ? 'open' : 'folded'}, room ${await room()}px)`)
      check(!!there?.clear, `${theme}: at ${width} it sits clear of every setting`)
      check(await noSideways(), `${theme}: no sideways scroll at ${width}`)
      await h.screenshot({ path: `${dir}/w${width}-${theme}.png` })
    }
    await c.size(640, 800)
    await wait(500)
    console.log(`     at 640: ${await h.locator(toc).count() ? 'shown' : 'out of sight'}, room ${await room()}px`)
    check(await noSideways(), `${theme}: no sideways scroll at 640`)
    await h.screenshot({ path: `${dir}/narrow-${theme}.png` })
    await h.mouse.click(400, 300)
    await h.keyboard.press('Meta+Shift+O')
    await wait(400)
    check(await h.locator(`${toc}[data-open]`).count() === 1, `${theme}: ⇧⌘O opens it at any width`)
    await h.screenshot({ path: `${dir}/narrow-open-${theme}.png` })
    await h.keyboard.press('Escape')
    await wait(300)
    check(await h.locator(`${toc}[data-open]`).count() === 0, `${theme}: Escape lets it go`)
    await c.size(1440, 900)
  }
  await v('settings:set', { focusShows: 'bubble' })
  check(c.errors.length === 0, `no errors (${c.errors.slice(0, 3).join(' | ')})`)
} catch (error) {
  failed++
  console.log('FAIL', error.message)
} finally {
  console.log(`\n${passed} passed, ${failed} failed`)
  await c.close()
  process.exit(failed ? 1 : 0)
}

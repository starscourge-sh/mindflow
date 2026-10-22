// Settings show what they change: each look, motion or sound setting has a
// preview, thumbnails or a sample right in its row, and each answers its
// control. Rows are shot in Paper and a dark theme (GitHub).
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-show/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/settings-show.mjs
import { mkdirSync, writeFileSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
let passed = 0, failed = 0
const check = (ok, what) => (ok ? passed++ : failed++, console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`))

const c = await sandbox({ width: 1180, height: 900 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const section = async (name) => { await h.click(`[data-section="${name}"]`); await wait(700) }
/** The row a selector sits in, scrolled to and shot. */
const shoot = async (selector, name) => {
  const row = h.locator(selector).first().locator('xpath=ancestor::*[@data-setting][1]')
  await row.scrollIntoViewIfNeeded()
  await wait(250)
  await row.screenshot({ path: `${dir}/${name}.png` })
}
const setting = async (patch) => { await v('settings:set', patch); await wait(450) }

try {
  check((await v('settings')).countIn === true, 'Count in is on for someone who never touched it')
  for (const theme of ['paper', 'github']) {
    await c.theme(theme)
    await go('settings')
    await section('Appearance')

    // Theme: tiles, each a page in its own colours; pointing wears it, leaving puts yours back.
    const tiles = h.locator('[data-theme-tile]')
    check((await tiles.count()) >= 14, `${theme}: the theme is picked from ${await tiles.count()} tiles`)
    // Off at first: a pointer resting on a tile wears nothing; the switch beside Theme turns it on.
    if (theme === 'paper') {
      await setting({ themePreview: false })
      await h.hover('[data-theme-tile="dracula"]'); await wait(300)
      check(!(await h.evaluate(() => document.documentElement.classList.contains('dracula'))), `${theme}: preview off, pointing at Dracula wears nothing`)
      await h.mouse.move(5, 5)
      await h.locator('[data-setting-title="Theme"] [role=switch][aria-label="Preview on hover"]').click(); await wait(450)
      check((await v('settings')).themePreview === true, `${theme}: the switch beside Theme turns preview on`)
    }
    await h.hover('[data-theme-tile="dracula"]')
    await wait(300)
    check(await h.evaluate(() => document.documentElement.classList.contains('dracula')), `${theme}: pointing at Dracula wears it`)
    const tileBg = await h.locator('[data-theme-tile="gruvbox"] > span').first().evaluate((el) => getComputedStyle(el).backgroundColor)
    check(tileBg === 'rgb(31, 23, 16)', `${theme}: the Gruvbox tile is in Gruvbox's own page colour (${tileBg})`)
    await h.mouse.move(5, 5)
    await wait(300)
    check(await h.evaluate((t) => document.documentElement.classList.contains(t), theme), `${theme}: leaving the tiles puts ${theme} back`)
    await shoot('[data-theme-tiles]', `theme-${theme}`)
    await shoot('[data-theme-dial]', `dial-${theme}`)

    // Colours from a file: an example of each kind, what is needed, a starter, and a CSS file that loads.
    check(await h.locator('[data-theme-sample="json"]').count() === 1, `${theme}: the theme file row shows a JSON example`)
    check(await h.getByRole('button', { name: 'Get a starter file…' }).count() === 1, `${theme}: a starter file can be saved`)
    await shoot('[data-theme-guide]', `theme-file-json-${theme}`)
    await h.locator('[data-theme-guide] [aria-pressed]').nth(1).click()
    await wait(300)
    check(await h.locator('[data-theme-sample="css"]').count() === 1, `${theme}: CSS file shows the CSS example`)
    await shoot('[data-theme-guide]', `theme-file-css-${theme}`)
    if (theme === 'paper') {
      const css = await h.locator('[data-theme-sample="css"]').innerText()
      const file = `${process.env.QA_DATA}/harbour.css`
      writeFileSync(file, css)
      await h.locator('input[type=file][accept*=".css"]').setInputFiles(file)
      await wait(600)
      const made = await h.evaluate(() => JSON.parse(localStorage.getItem('custom-themes') ?? '[]').find((one) => one.id === 'custom-harbour'))
      check(made?.vars?.['--black'] === '#10202b' && made?.vars?.['--tt-brand-color-400'] === '#4fb3bf', 'the CSS example, loaded as a file, makes a whole theme')
      const tile = await h.locator('[data-theme-tile="custom-harbour"] > span').first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => '')
      check(tile === 'rgb(16, 32, 43)', `the loaded theme gets a tile in its own colours (${tile})`)
      await c.theme('paper')
      await h.evaluate(() => localStorage.setItem('custom-themes', JSON.stringify(JSON.parse(localStorage.getItem('custom-themes') ?? '[]').filter((one) => one.id !== 'custom-harbour'))))
      await go('settings')
      await section('Appearance')
    }

    // Choices drawn as thumbnails, each answering a click.
    for (const [label, count] of [['Page width', 3], ['Postcard border', 5], ['Link pictures', 2], ['Progress bars', 3], ['Session bubble', 3], ['Session timer shows in', 3], ['Bubble sits', 2], ['Where quick capture appears', 3], ['Which screen', 2]]) {
      const tilesOf = h.locator(`[data-choices="${label}"] [data-choice]`)
      check((await tilesOf.count()) === count, `${theme}: ${label} has ${count} thumbnails`)
      if (await tilesOf.count()) await shoot(`[data-choices="${label}"]`, `${label.toLowerCase().replace(/ /g, '-')}-${theme}`)
    }
    await h.click('[data-choices="Page width"] [data-choice="wide"]')
    await wait(500)
    check((await v('settings')).pageWidth === 'wide', `${theme}: a page width thumbnail picks it`)
    await h.click('[data-choices="Page width"] [data-choice="narrow"]')
    await wait(400)

    // Progress bars play: each fills on a loop.
    const bar = h.locator('[data-loop-bar="dino"] [role=progressbar]')
    const seen = []
    for (let i = 0; i < 8; i++) (seen.push(Number(await bar.getAttribute('aria-valuenow'))), await wait(600))
    check(new Set(seen).size > 2 && seen.includes(100) || seen.some((one, i) => i && one > seen[i - 1]), `${theme}: the Dino run thumbnail runs (${seen.join(', ')})`)

    // Samples beside switches, each following its switch.
    check(await h.locator('[data-preview="motion"]').count() === 1, `${theme}: Motion has its sample`)
    const blurred = () => h.locator('[data-preview="blur"] .private-text').evaluate((el) => getComputedStyle(el).filter)
    check((await blurred()).includes('blur'), `${theme}: the private sample is blurred with Blurring on`)
    await setting({ blur: false })
    check((await blurred()) === 'none', `${theme}: and sharp with it off`)
    await setting({ blur: true })
    await shoot('[data-preview="blur"]', `blurring-${theme}`)
    await shoot('[data-preview="motion"]', `motion-${theme}`)

    await setting({ tiltPictures: true })
    const tilt = h.locator('[data-setting]', { hasText: 'Tilt pictures in notes' }).locator('[data-picture-sample] img')
    await tilt.scrollIntoViewIfNeeded()
    const box = await tilt.boundingBox()
    await h.mouse.move(box.x + 5, box.y + 5)
    for (let i = 0; i < 6; i++) await h.mouse.move(box.x + 10 + i * 4, box.y + 8 + i * 2)
    await wait(400)
    const tipped = await tilt.evaluate((el) => el.parentElement.style.transform)
    check(/rotate/.test(tipped) && !/rotateX\(0deg\) rotateY\(0deg\)/.test(tipped), `${theme}: the tilt sample leans toward the pointer (${tipped.slice(0, 50)})`)
    await shoot('[data-setting]:has-text("Tilt pictures in notes") [data-picture-sample]', `tilt-${theme}`)
    await h.mouse.move(5, 5)
    await setting({ tiltPictures: false })

    const capt = h.locator('[data-setting]', { hasText: 'Caption follows the pointer' }).locator('[data-picture-sample] img')
    await capt.scrollIntoViewIfNeeded()
    const cbox = await capt.boundingBox()
    for (let i = 0; i < 4; i++) await h.mouse.move(cbox.x + 20 + i * 5, cbox.y + 20)
    await wait(300)
    check(await h.evaluate(() => [...document.querySelectorAll('body > span.fixed')].some((el) => el.textContent === 'Harbour at dawn')), `${theme}: the caption rides beside the pointer`)
    await shoot('[data-setting]:has-text("Caption follows the pointer") [data-picture-sample]', `caption-${theme}`)
    await h.mouse.move(5, 5)

    check(await h.locator('[data-preview="marks"] .mf-mark').count() > 0, `${theme}: Margin marks shows a hand-drawn strike`)
    await shoot('[data-preview="marks"]', `marks-${theme}`)
    check(await h.locator('[data-preview="list-picture"] img').count() === 1, `${theme}: Pictures in lists shows the picture`)
    await setting({ thumbnails: false })
    check(await h.locator('[data-preview="list-picture"] img').count() === 0, `${theme}: and not with it off`)
    await setting({ thumbnails: true })
    await shoot('[data-preview="list-picture"]', `list-picture-${theme}`)
    await shoot('[data-setting]:has-text("Postcards") [data-picture-sample]', `postcards-${theme}`)
    await shoot('[data-preview="centred"]', `centred-${theme}`)

    // Count in: a sample that counts 5 to 1, then starts.
    const play = h.getByRole('button', { name: 'Play the count' })
    check(await play.count() === 1, `${theme}: Count in has a sample to play`)
    await play.click()
    await wait(300)
    const counting = await h.locator('[data-preview="count-in"] [data-mini-bubble]').innerText()
    check(/Starting in/.test(counting), `${theme}: playing it counts in`)
    await shoot('[data-preview="count-in"]', `count-in-${theme}`)
    await wait(5600)
    check(!/Starting in/.test(await h.locator('[data-preview="count-in"] [data-mini-bubble]').innerText()), `${theme}: then its clock starts`)

    // Motion off: the bars rest full, still.
    await setting({ motion: false })
    await wait(400)
    check(await h.locator('[data-loop-bar="saber"] [role=progressbar]').getAttribute('aria-valuenow') === '100', `${theme}: with Motion off the bar thumbnails rest full`)
    await setting({ motion: true })

    // Sound: the bubble's gleam and smoke samples.
    await section('Sound')
    await wait(4000)
    check(await h.locator('[data-setting]:has-text("Gleam on the bubble") [data-gleam]').count() >= 1, `${theme}: the gleam sample gleams`)
    await shoot('[data-setting]:has-text("Gleam on the bubble") [data-mini-bubble]', `gleam-${theme}`)
    const wisps = () => h.locator('[data-setting]:has-text("Smoke in the bubble") [data-mini-bubble] style').count()
    check((await wisps()) >= 1, `${theme}: the smoke sample smokes`)
    await setting({ sessionSmoke: false })
    check((await wisps()) === 0, `${theme}: and stops with it off`)
    await setting({ sessionSmoke: true })
    await shoot('[data-setting]:has-text("Smoke in the bubble") [data-mini-bubble]', `smoke-${theme}`)

    await section('What comes back to you')
    const dots = () => h.locator('[data-preview="tempus"] .rounded-full.size-\\[5px\\]').count()
    check((await dots()) === 0, `${theme}: Time as dots shows a bar while off`)
    await setting({ tempusDots: true })
    check((await dots()) === 10, `${theme}: and beads while on`)
    await shoot('[data-preview="tempus"]', `tempus-${theme}`)
    await setting({ tempusDots: false })
    check(await h.locator('[data-choices="Sticky note material"] [data-choice]').count() === 3, `${theme}: sticky materials have thumbnails`)
    await shoot('[data-choices="Sticky note material"]', `sticky-made-${theme}`)
    check(await h.locator('[data-preview="stir"]').count() === 1, `${theme}: Stickies stir has its sample`)
    await shoot('[data-preview="stir"]', `stir-${theme}`)

    // Sort and view: each way to view a list is named under its picture.
    await go('inbox')
    await wait(800)
    const display = h.locator('[data-display]').first()
    if (await display.count()) {
      await display.click()
      await wait(500)
      const named = await h.evaluate(() => [...document.querySelectorAll('[data-radix-popper-content-wrapper] button[aria-pressed], [data-slot="sheet-content"] button[aria-pressed]')].map((one) => one.textContent.trim()).filter(Boolean))
      check(['Compact', 'List', 'Small grid', 'Grid'].every((name) => named.includes(name)), `${theme}: Sort and view names each view (${named.join(', ')})`)
      // A popover where it fits, else the side sheet (display.tsx).
      const pop = h.locator('[data-radix-popper-content-wrapper], [data-slot="sheet-content"]').first()
      await pop.screenshot({ path: `${dir}/sort-and-view-${theme}.png` })
      await h.keyboard.press('Escape')
    } else check(false, `${theme}: the Inbox has Sort and view`)
  }
} catch (error) {
  failed++
  console.log('FAIL threw', error.message.split('\n')[0])
} finally {
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5))
  console.log(`\n${passed} passed, ${failed} failed`)
  await c.close()
}

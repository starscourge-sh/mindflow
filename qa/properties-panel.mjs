// A note's properties live in its details, the way Linear shows an issue's:
// with the details out beside the page they head the details as their own
// "Properties" group, values shown and editable there, "Add property" there
// too, and the block under the title steps aside so the words start right
// under it. Details put away, or a page too narrow for them beside it, and
// the block is back under the title. Shot in light and dark.
//
//   npx electron-vite build --outDir out-p
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-p/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/properties-panel.mjs
process.env.QA_ARGS ??= '--sandbox'
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
const s = await sandbox({ width: 1400, height: 900 })
const { h, v, send, go, theme, errors } = s
const wait = (ms) => h.waitForTimeout(ms)
const visible = (sel) => h.evaluate((sel) => [...document.querySelectorAll(sel)].filter((one) => one.offsetParent !== null).length, sel)
const panel = '.mf-details [data-property-strip]'
const inline = '[data-property-strip]:not([data-in-panel])'
const shot = async (name) => {
  // The page with its details, cut to the note and the panel.
  const box = await h.evaluate(() => {
    const pane = document.querySelector('.note-pane')?.getBoundingClientRect()
    return pane && { x: pane.x, y: pane.y, width: pane.width, height: Math.min(pane.height, 640) }
  })
  await h.screenshot({ path: `${dir}/${name}.png`, clip: box ?? undefined })
}
const detailsOn = async (on) => {
  const button = h.locator(`button[aria-label="Details"][aria-pressed="${on ? 'false' : 'true'}"]`).first()
  if (await button.count()) { await button.click(); await wait(900) }
}
try {
  const hal = (await h.evaluate(() => window.api.captures.list())).find((one) => one.label?.includes('HAL or TARS'))
  check('0. the sandbox has the HAL or TARS note', !!hal)
  await go('captures')
  await send('capture', hal.id)
  await wait(1800)

  // Details put away (as every launch starts): the block under the title, as before.
  check('1. details away: the block is under the title', (await visible(inline)) === 1 && (await visible(panel)) === 0)

  await detailsOn(true)
  check('2. details out: the properties head the details', (await visible(panel)) === 1)
  check('2. the block under the title is gone', (await visible(inline)) === 0)
  const said = await h.evaluate((sel) => document.querySelector(sel)?.textContent ?? '', panel)
  check('2. values show in the details', /Check back/i.test(said) && /Is TARS still the one/.test(said) && /created/.test(said), said.slice(0, 200))
  const first = await h.evaluate(() => document.querySelector('.mf-details')?.firstElementChild?.matches('[data-property-strip]'))
  check('2. it is the first group in the details', !!first)
  // Its rows line up with the rows of the groups under it, at the same height and size of type.
  const fit = await h.evaluate((sel) => {
    const strip = document.querySelector(sel)
    // A one-line row: Check back on's day.
    const ours = strip.querySelector('[data-property="back"]').getBoundingClientRect()
    const ourName = strip.querySelector('[data-property="back"]').previousElementSibling.querySelector('svg').getBoundingClientRect()
    const head = strip.querySelector('[data-properties-head] h2')
    // A plain row of the groups under it (Surfacing's "Not private"), and that group's heading.
    const row = document.querySelector('.mf-details [data-island-body] > button')
    const other = row.closest('[data-details-group]')
    const theirIcon = row.querySelector('svg')?.getBoundingClientRect()
    return {
      rowH: Math.round(ours.height), theirH: Math.round(row.getBoundingClientRect().height),
      iconX: Math.round(ourName.x), theirIconX: Math.round(theirIcon?.x ?? 0),
      iconW: Math.round(ourName.width), theirIconW: Math.round(theirIcon?.width ?? 0),
      font: getComputedStyle(strip.querySelector('[data-property="back"]')).fontSize, theirFont: getComputedStyle(row).fontSize,
      headFont: getComputedStyle(head).fontSize, theirHeadFont: getComputedStyle(other.querySelector('h2')).fontSize,
      headX: Math.round(head.getBoundingClientRect().x), theirHeadX: Math.round(other.querySelector('h2').getBoundingClientRect().x),
      rule: getComputedStyle(strip).borderBottomWidth
    }
  }, panel)
  check('3. rows as tall as the details\' own', Math.abs(fit.rowH - fit.theirH) <= 2, JSON.stringify(fit))
  check('3. icons on the same left edge and size', Math.abs(fit.iconX - fit.theirIconX) <= 1 && fit.iconW === fit.theirIconW)
  check('3. same type sizes, row and heading', fit.font === fit.theirFont && fit.headFont === fit.theirHeadFont)
  check('3. heading on the same left edge', Math.abs(fit.headX - fit.theirHeadX) <= 1)
  check('3. a faint rule under the group', fit.rule === '1px')
  await shot('panel-light')

  // Edited in the details: saved, read back through the app.
  await h.click(`${panel} [data-property="ask"]`)
  await wait(500)
  await h.keyboard.press('Meta+a')
  await h.keyboard.type('Does TARS still fly it best?')
  await h.keyboard.press('Enter')
  await wait(900)
  const saved = await v('notes:fields', 'captures', hal.id)
  check('4. a value changed in the details is saved', saved?.ask === 'Does TARS still fly it best?', JSON.stringify(saved?.ask))
  check('4. and shows there', (await h.evaluate((sel) => document.querySelector(sel)?.textContent ?? '', panel)).includes('Does TARS still fly it best?'))

  // "Add property" in the details: a named row with a value.
  await h.click(`${panel} [data-add-property]`)
  await wait(400)
  check('5. "Add property" opens a new row in the details', await h.evaluate((sel) => !!document.querySelector(`${sel} [data-new-property] input`) && document.activeElement === document.querySelector(`${sel} [data-new-property] input`), panel))
  await h.keyboard.type('Pilot')
  await h.keyboard.press('Enter')
  await wait(900)
  await h.keyboard.type('Cooper')
  await h.keyboard.press('Enter')
  await wait(900)
  const added = await v('notes:fields', 'captures', hal.id)
  check('5. its value is saved', added?.Pilot === 'Cooper', JSON.stringify(added?.Pilot))
  check('5. and shows in the details', /Pilot\s*Cooper/.test(await h.evaluate((sel) => document.querySelector(sel)?.textContent ?? '', panel)))
  await h.mouse.move(10, 10)
  await wait(300)
  await shot('panel-light-added')

  // Narrow: the details stack under the page, so the block stays under the title.
  await s.size(560, 900)
  await wait(900)
  check('6. narrow: the block is under the title, none in the details', (await visible(inline)) === 1 && (await visible(panel)) === 0)
  await s.size(1400, 900)
  await wait(900)

  await detailsOn(false)
  check('7. details away again: the block is back under the title', (await visible(inline)) === 1 && (await visible(panel)) === 0)
  await shot('inline-light')

  // Dark: the same, both ways.
  await theme('dark')
  await go('captures')
  await send('capture', hal.id)
  await wait(1800)
  await shot('inline-dark')
  await detailsOn(true)
  check('8. dark, details out: properties in the details', (await visible(panel)) === 1 && (await visible(inline)) === 0)
  await shot('panel-dark')

  // A gem shows its properties in its details the same way.
  const gem = await v('promote', (await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A gem with a property' }] }] } }))))
  await v('notes:fields:set', 'nuggets', gem, 'Mood', 'Calm')
  await send('nugget', gem)
  await wait(1800)
  await detailsOn(true)
  check('9. a gem: properties in its details, none under the title', (await visible(panel)) === 1 && (await visible(inline)) === 0 && /Mood\s*Calm/.test(await h.evaluate((sel) => document.querySelector(sel)?.textContent ?? '', panel)))
  await shot('gem-dark')

  check('no page errors', !errors.some((one) => /PAGEERROR/.test(one)), errors.filter((one) => /PAGEERROR/.test(one)).join(' | '))
} catch (error) {
  check('ran to the end', false, error.message)
} finally {
  await s.close()
}
done()

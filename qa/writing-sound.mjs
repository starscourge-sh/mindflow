// Sound while you write: the soundscape (Shore, Rain, Hearth). Off at first;
// once chosen, it fades in over about 6 seconds when you write on today's page
// and goes when you leave, stop for a while, or turn sounds off; it follows
// the volume. Read through the test hooks (haligtreeScape, haligtreeHeard), so
// it runs muted.
//
//   npx electron-vite build --outDir out-s
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-s/main/index.js HALIGTREE_QA_AWAY=1 node qa/writing-sound.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS
const scape = () => h.evaluate(() => window.haligtreeScape?.() ?? null)
const heard = () => h.evaluate(() => [...(window.haligtreeHeard ?? [])])
const into = async () => {
  await h.evaluate(() => document.querySelector('.tiptap')?.focus())
  await h.keyboard.press('Meta+ArrowDown')
}
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

try {
  await v('settings:set', { sounds: true, volume: 0.8, hintRate: 0 })
  const first = await v('settings')
  check('off at first: no soundscape', first.writingSound === 'off', first.writingSound)
  const today = new Date().toLocaleDateString('en-CA')
  await v('notes:day:save', today, { body: { type: 'doc', content: [para('The morning was grey and the sea was out.')] } })
  await go('day')
  await wait(800)
  await into()
  await h.keyboard.type(' quiet', { delay: 80 })
  check('off: typing plays nothing', (await scape()) === null)
  check('the writer\'s line says "Sound: Off"', (await h.textContent('[data-writer-line] [data-writing-sound]'))?.trim() === 'Sound: Off')

  // The soundscape comes in over about 6 seconds once you write.
  await v('settings:set', { writingSound: 'shore' })
  await wait(400)
  await into()
  await h.keyboard.type(' a', { delay: 60 })
  const levels = []
  for (const at of [300, 1500, 3000, 4500, 6500]) {
    await wait(at - (levels.at(-1)?.at ?? 0))
    levels.push({ at, level: (await scape())?.level ?? -1 })
  }
  const full = 0.55 * 0.8
  check('Shore: its synthesis starts on the first key', (await heard()).includes('scape:shore'))
  check('it fades in, rising each step', levels.every((one, i) => !i || one.level > levels[i - 1].level - 1e-4), levels.map((one) => `${one.at}ms ${one.level.toFixed(3)}`).join(', '))
  check('about 6 seconds to full: under half at 1.5s, full by 6.5s', levels[1].level < full / 2 && Math.abs(levels[4].level - full) < 0.01, `${levels[1].level.toFixed(3)} then ${levels[4].level.toFixed(3)} of ${full}`)
  check('the writer\'s line says "Sound: Shore"', (await h.textContent('[data-writer-line] [data-writing-sound]'))?.trim() === 'Sound: Shore')

  // It follows the volume.
  await v('settings:set', { volume: 0.4 })
  await wait(1200)
  const quieter = (await scape())?.level ?? -1
  check('it follows the volume: 0.8 to 0.4 halves it', Math.abs(quieter - 0.55 * 0.4) < 0.01, quieter.toFixed(3))

  // Sounds off stops it, and nothing starts while off.
  await v('settings:set', { sounds: false })
  await wait(500)
  check('Sounds off: it goes', (await scape()) === null && (await heard()).includes('scape-end'))
  await into()
  await h.keyboard.type('b', { delay: 60 })
  check('Sounds off: writing does not bring it back', (await scape()) === null)
  await v('settings:set', { sounds: true })
  await wait(400)

  // A rest of a while takes it away (here 1.5s, for the probe; 2 minutes in use), timed.
  await h.evaluate(() => (window.haligtreeScapeIdle = 1500))
  await into()
  await h.keyboard.type('c', { delay: 60 })
  await wait(700)
  check('back on writing: it starts again', (await scape())?.kind === 'shore')
  await wait(1400)
  check('a rest: it goes, fading out', (await scape()) === null)
  await h.evaluate(() => delete window.haligtreeScapeIdle)

  // Leaving the page takes it away.
  await into()
  await h.keyboard.type('d', { delay: 60 })
  await wait(300)
  const was = (await scape())?.kind
  await go('feed')
  check('leaving today\'s page: it goes', was === 'shore' && (await scape()) === null, was)

  // Rain and Hearth fire their own synthesis.
  for (const kind of ['rain', 'hearth']) {
    await v('settings:set', { writingSound: kind })
    await go('day')
    await wait(500)
    await into()
    await h.keyboard.type('e', { delay: 60 })
    await wait(300)
    check(`${kind}: its synthesis starts on writing`, (await heard()).includes(`scape:${kind}`) && (await scape())?.kind === kind)
  }
  await v('settings:set', { writingSound: 'off' })
  await wait(400)

  // The same control in the writing room's foot, beside Focus and Aim; the menu has both choices.
  await v('settings:set', { writingSound: 'rain' })
  await wait(400)
  await h.click('[data-room-open]')
  await wait(700)
  check('the writing room\'s foot has it beside Focus and Aim', (await h.textContent('[data-room-foot] [data-writer-tools] [data-writing-sound]'))?.trim() === 'Sound: Rain')
  await h.click('[data-room-foot] [data-writing-sound]')
  await wait(400)
  const menu = await h.evaluate(() => [...document.querySelectorAll('[data-scape-choice]')].map((one) => one.textContent.trim()).join(', '))
  check('its menu: Off, Shore, Rain, Hearth', menu === 'Off, Shore, Rain, Hearth', menu)
  const n = (await heard()).filter((one) => one === 'scape:hearth').length
  await h.evaluate(() => document.querySelector('[data-scape-choice="hearth"]').dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' })))
  await wait(300)
  check('resting on a choice plays it', (await heard()).filter((one) => one === 'scape:hearth').length === n + 1)
  if (shots) await h.screenshot({ path: `${shots}/room-sound-menu.png` })
  await h.evaluate(() => document.querySelector('[data-scape-choice="shore"]').click())
  await wait(500)
  check('picking from the menu keeps it', (await v('settings')).writingSound === 'shore')
  await h.keyboard.press('Escape')
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()

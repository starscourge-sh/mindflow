// The speaker at the top right: a quick click still turns sounds on or off and opens nothing; held, it opens the
// volume, and sliding on from the hold sets it live with a tick at each new level; arrow keys move it; the speaker's
// waves follow the level; Settings' Volume shows the same; Esc closes. Shots of the hold and the open control.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/volume-hold.mjs
import { mkdirSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.env.QA_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const s = await sandbox({ width: 1100, height: 700 })
const { h, v, go, close, theme } = s
const button = h.locator('[data-sound-toggle]')
const control = h.locator('[data-volume-control]')
const waves = async () => Number(await button.locator('[data-waves]').getAttribute('data-waves'))
const heard = () => h.evaluate(() => [...(window.haligtreeHeard ?? [])])
const forget = () => h.evaluate(() => void (window.haligtreeHeard ?? []).splice(0))
const middle = async () => {
  const box = await button.boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
const shoot = async (name) => {
  if (!SHOTS) return
  const box = await button.boundingBox()
  await h.screenshot({ path: `${SHOTS}/${name}.png`, clip: { x: Math.max(0, box.x - 260), y: Math.max(0, box.y - 10), width: 300, height: 150 } })
}
try {
  await v('settings:set', { sounds: true, volume: 0.5 })
  await h.waitForTimeout(600)
  await button.waitFor({ timeout: 10000 })
  await button.hover()
  await h.waitForTimeout(1200)
  check('the tip says both', await h.getByText('Sounds on: click for quiet, hold for volume').first().isVisible().catch(() => false))
  check('at half, two waves', (await waves()) === 2, await waves())

  // A quick click: sounds off, nothing opens.
  await button.click()
  await h.waitForTimeout(500)
  check('a quick click turns sounds off', (await v('settings')).sounds === false)
  check('a quick click opens nothing', (await control.count()) === 0)
  check('sounds off shows no waves', (await waves()) === 0, await waves())
  await button.click()
  await h.waitForTimeout(500)
  check('and on again', (await v('settings')).sounds === true)

  for (const name of ['light', 'dark']) {
    if (name === 'dark') await theme('dark'), await button.waitFor()
    const at = await middle()
    await h.mouse.move(at.x, at.y)
    await h.mouse.down()
    await h.waitForTimeout(190)
    await shoot(`hold-${name}`)
    check(`${name}: the ring is drawing mid-hold, nothing open yet`, (await button.locator('[data-hold-ring]').count()) === 1 && (await control.count()) === 0)
    await h.waitForTimeout(310)
    check(`${name}: a hold opens the volume`, await control.isVisible().catch(() => false))
    const before = (await v('settings')).volume
    await forget()
    for (let i = 1; i <= 8; i++) {
      await h.mouse.move(at.x + i * 8, at.y)
      await h.waitForTimeout(40)
    }
    await h.waitForTimeout(250)
    const during = (await v('settings')).volume
    check(`${name}: sliding on from the hold sets the volume live`, during > before + 0.2, `${before} to ${during}`)
    const ticks = (await heard()).filter((one) => one === 'cue:tap').length
    check(`${name}: ticks while sliding`, ticks >= 2, ticks)
    check(`${name}: the level shows in words`, (await control.locator('[data-volume-level]').textContent()) === `${Math.round(during * 100)}%`, await control.locator('[data-volume-level]').textContent())
    check(`${name}: three waves when loud`, (await waves()) === 3, await waves())
    await h.mouse.up()
    await shoot(`open-${name}`)
    check(`${name}: let go and it stays set`, Math.abs((await v('settings')).volume - during) < 0.001)
    await h.waitForTimeout(1100)
    check(`${name}: and closes a moment later`, (await control.count()) === 0)
    await v('settings:set', { volume: 0.5 })
    await h.waitForTimeout(400)
  }

  // Held and let go without sliding: stays open for the keys.
  const at = await middle()
  await h.mouse.move(at.x, at.y)
  await h.mouse.down()
  await h.waitForTimeout(500)
  await h.mouse.up()
  await h.waitForTimeout(900)
  check('held and let go, it stays open', await control.isVisible().catch(() => false))
  check('and the press was no click', (await v('settings')).sounds === true)
  const from = (await v('settings')).volume
  await forget()
  for (let i = 0; i < 4; i++) await h.keyboard.press('ArrowLeft'), await h.waitForTimeout(150)
  await h.waitForTimeout(300)
  const keyed = (await v('settings')).volume
  check('arrow keys turn it down', Math.abs(keyed - (from - 0.2)) < 0.011, `${from} to ${keyed}`)
  check('each key ticks', (await heard()).filter((one) => one === 'cue:tap').length >= 3, (await heard()).join(' '))
  check('one wave when quiet', (await waves()) === 1, await waves())
  for (let i = 0; i < 8; i++) await h.keyboard.press('ArrowLeft'), await h.waitForTimeout(40)
  await h.waitForTimeout(400)
  check('at 0 the speaker is crossed out', (await v('settings')).volume === 0 && (await waves()) === 0, `${(await v('settings')).volume} ${await waves()}`)
  check('and says Silent', (await control.locator('[data-volume-level]').textContent()) === 'Silent')
  await h.keyboard.press('ArrowRight')
  await h.keyboard.press('ArrowRight')
  await h.keyboard.press('ArrowRight')
  await h.waitForTimeout(400)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(400)
  check('Esc closes it', (await control.count()) === 0)
  const set = (await v('settings')).volume
  check('kept at 15%', Math.abs(set - 0.15) < 0.011, set)

  await go('settings')
  await h.waitForTimeout(1000)
  await h.click('[data-section="Sound"]')
  await h.waitForTimeout(1000)
  const slider = h.locator('[data-setting]').filter({ hasText: 'How loud every sound is' }).locator('[role="slider"]').first()
  check("Settings' Volume shows the same", Math.abs(Number(await slider.getAttribute('aria-valuenow')) - set) < 0.011, await slider.getAttribute('aria-valuenow'))
  // And the other way: Settings' Volume moves the speaker.
  await slider.focus()
  for (let i = 0; i < 12; i++) await h.keyboard.press('ArrowRight'), await h.waitForTimeout(30)
  await h.waitForTimeout(800)
  check("Settings' Volume moves the speaker's waves", (await waves()) === 3, `${(await v('settings')).volume} ${await waves()}`)
  check('no errors', !s.errors.length, s.errors.join(' | '))
} finally {
  await close()
}
done()

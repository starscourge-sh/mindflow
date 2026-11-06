// Your sun, not the clock (every Mac, no location): Settings › What comes back to you › "Evening at sunset"
// says today's sunrise and sunset for this Mac's time zone's city, turned on makes Close the day and "For
// tomorrow" start at sunset ("At sunset, 16:31"), and a city picked from the list moves the sun there.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/mac-sun.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  const here = await v('sun')
  const zone = await h.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  check(`main reckons the sun for this Mac's time zone's city (${zone})`, !!here?.place && zone.replace(/_/g, ' ').endsWith(here.place) && (here.polar || (here.rise < here.set)), JSON.stringify(here))
  await c.go('settings')
  await h.evaluate(() => document.querySelector('[data-section="What comes back to you"]')?.click())
  await wait(700)
  const row = () => h.evaluate(() => {
    const one = [...document.querySelectorAll('[data-setting]')].find((el) => el.textContent.includes('Evening at sunset'))
    one?.scrollIntoView({ block: 'center' })
    return one ? { text: one.textContent, switch: one.querySelector('[role="switch"]')?.getAttribute('aria-checked') } : null
  })
  let said = await row()
  check('the row says today’s sunrise and sunset where you are', /sunrise \d{1,2}:\d\d.*sunset \d{1,2}:\d\d|does not (set|rise)/.test(said?.text ?? '') && said.text.includes(here.place), said?.text)
  if (process.env.SHOT) await c.both(`${process.env.SHOT}/sun-setting`)
  await h.evaluate(() => [...document.querySelectorAll('[data-setting]')].find((el) => el.textContent.includes('Evening at sunset'))?.querySelector('[role="switch"]')?.click())
  await wait(800)
  const settings = await v('settings')
  const close = await h.evaluate(() => [...document.querySelectorAll('[data-setting]')].find((el) => el.textContent.startsWith('Close the day'))?.textContent ?? '')
  check('turned on, Close the day starts at sunset and says when', settings.closeDayAt === 'sunset' && /At sunset, \d{2}:\d{2}/.test(close), `${settings.closeDayAt} | ${close.slice(0, 120)}`)
  // A city picked.
  await h.click('[data-sun-place]')
  await wait(400)
  await h.keyboard.type('Reykjav')
  await wait(300)
  await h.evaluate(() => [...document.querySelectorAll('[data-sun-places] [role="menuitemradio"]')].find((one) => one.textContent.includes('Reykjavik'))?.click())
  await wait(900)
  const there = await v('sun')
  said = await row()
  check('a city picked moves the sun there (Reykjavik), and the row says so', there?.place === 'Reykjavik' && said.text.includes('Reykjavik') && there.set !== here.set, `${JSON.stringify(there)} | ${said.text.slice(0, 160)}`)
  if (process.env.SHOT) await c.both(`${process.env.SHOT}/sun-picked`)
  await v('settings:set', { closeDayAt: '18:00', sunPlace: '' })
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()

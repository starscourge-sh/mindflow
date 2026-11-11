// "This is me" on a person: they wear your photo (the one saved as "You") everywhere a face is shown, on their
// page and on Sources; only one person is you, so choosing another moves it; the notice's Undo moves it back;
// chosen again it reads "This is not me". Settings' "Your photo" says "Shown as <name>" and changes it by name.
//
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<dir> node qa/this-is-me.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, v, go, both, errors } = c
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const make = (patch) => h.evaluate((p) => window.api.captures.create(p), patch)
const openPerson = async (who) => { await h.evaluate((d) => window.dispatchEvent(new CustomEvent('haligtree:source', { detail: d })), `attribution:${who}`); await wait(1200) }
/** The face on the open person page: picture or initials, and the picture's address. */
const headFace = () => h.evaluate(() => { const one = document.querySelector('[data-person-head] .mf-avatar'); return { look: one?.dataset.avatar ?? null, src: one?.querySelector('img')?.getAttribute('src') ?? null } })
const menuLine = () => h.evaluate(() => document.querySelector('[data-this-is-me]')?.textContent?.trim() ?? null)
const openMenu = async () => { await h.locator('[data-person-photo]').click({ button: 'right' }); await wait(400) }
const toastText = () => h.evaluate(() => [...document.querySelectorAll('[role=status]')].map((one) => one.textContent).join(' | '))

try {
  for (const who of ['Reed', 'Ann Example']) await make({ kind: 'quote', body: doc(`A line from ${who}.`), attribution: who })
  // Your photo, as Settings' "Add a photo…" saves one.
  const url = await h.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 200
    const g = canvas.getContext('2d')
    g.fillStyle = 'hsl(30 60% 60%)'; g.fillRect(0, 0, 200, 200)
    g.fillStyle = 'hsl(210 50% 30%)'; g.beginPath(); g.arc(100, 80, 40, 0, 7); g.fill()
    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/png'))
    return window.api.saveImage('image/png', new Uint8Array(await blob.arrayBuffer()))
  })
  await v('people:set', 'You', url)
  await v('settings:set', { me: '' })
  await h.reload()
  await wait(2000)

  await openPerson('Reed')
  check('1. Reed\'s page shows initials before', (await headFace()).look === 'initials', JSON.stringify(await headFace()))
  await openMenu()
  check('2. the menu offers “This is me”', (await menuLine()) === 'This is me', await menuLine())
  if (shots) await both(`${shots}/me-menu`)
  await h.locator('[data-this-is-me]').click()
  await wait(900)
  const worn = await headFace()
  check('3. Reed\'s page now wears your photo', worn.look === 'picture' && worn.src === url, JSON.stringify(worn))
  check('4. one notice says so', /Reed is you now/.test(await toastText()), await toastText())
  check('5. kept in the book\'s settings', (await v('settings')).me === 'Reed')
  await openMenu()
  check('6. the line now reads “This is not me”', (await menuLine()) === 'This is not me', await menuLine())
  await h.keyboard.press('Escape')
  await wait(300)

  await go('sources')
  await wait(1200)
  const onSources = () => h.evaluate(() => Object.fromEntries(['Reed', 'Ann Example'].map((who) => [who, document.querySelector(`[data-face="${who}"] .mf-avatar`)?.dataset.avatar ?? null])))
  check('7. on Sources, Reed wears your photo too', (await onSources()).Reed === 'picture', JSON.stringify(await onSources()))

  await openPerson('Ann Example')
  await openMenu()
  await h.locator('[data-this-is-me]').click()
  await wait(900)
  check('8. choosing Ann moves it: Ann wears it', (await headFace()).look === 'picture' && (await v('settings')).me === 'Ann Example')
  check('9. the notice names who it moved from', /Ann Example is you now, not Reed/.test(await toastText()), await toastText())
  await h.getByRole('button', { name: /^Undo/ }).first().click()
  await wait(900)
  check('10. Undo moves it back to Reed', (await v('settings')).me === 'Reed' && (await headFace()).look === 'initials', JSON.stringify({ me: (await v('settings')).me, face: await headFace() }))
  await go('sources')
  await wait(1200)
  const after = await onSources()
  check('11. Sources follows: Reed the photo, Ann initials', after.Reed === 'picture' && after['Ann Example'] === 'initials', JSON.stringify(after))

  await go('settings')
  await h.getByText('Appearance', { exact: true }).first().click()
  await wait(700)
  await h.locator('[data-your-profile]').scrollIntoViewIfNeeded()
  await wait(300)
  const shownAs = () => h.evaluate(() => document.querySelector('[data-choose-me]')?.parentElement?.textContent?.trim() ?? null)
  check('12. Settings says “Shown as Reed”', /^Shown as\s*Reed/.test(await shownAs() ?? ''), await shownAs())
  if (shots) await both(`${shots}/me-settings`, h.locator('[data-your-profile]').locator('xpath=ancestor::*[@data-setting][1]'))
  // Changed from Settings, by name: the field completes from People.
  await h.locator('[data-choose-me]').click()
  await wait(500)
  if (shots) await h.screenshot({ path: `${shots}/me-settings-ask.png` })
  await h.locator('[data-ask] [data-ask-field]').fill('Ann Example')
  await h.locator('[data-ask] [data-ask-go]').click()
  await wait(900)
  check('13. chosen in Settings: “Shown as Ann Example”, kept', /^Shown as\s*Ann Example/.test(await shownAs() ?? '') && (await v('settings')).me === 'Ann Example', await shownAs())
  // "No one" turns it off.
  await h.locator('[data-choose-me]').click()
  await wait(500)
  await h.locator('[data-ask] [data-ask-skip]').click()
  await wait(900)
  check('14. “No one”: not anyone, and kept so', (await shownAs()) === 'Not anyone in People yetChoose who you are…' && (await v('settings')).me === '', await shownAs())
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await c.close()
}
done()

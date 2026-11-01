// People's faces are one family: a photo wears its person's shape (the same Coolshapes mask
// their initials sit in), so a list mixing photos and shapes never looks mismatched. Under
// "Avatars: Initials" both are round. The person page's hover shade takes the same frame.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<dir> node qa/avatar-frame.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, errors } = c
const shots = process.env.QA_SHOTS
const shot = (name) => shots && h.screenshot({ path: `${shots}/${name}.png` }).catch(() => {})
const wait = (ms) => h.waitForTimeout(ms)
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const make = (patch) => h.evaluate((p) => window.api.captures.create(p), patch)
const people = ['Ada Lovelace', 'Marcus Aurelius', 'Toni Morrison', 'Seneca', 'Mary Oliver', 'Rumi']
const theme = async (dark) => { await h.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark); await wait(300) }

try {
  for (const [at, who] of people.entries()) await make({ kind: 'quote', body: doc(`A line from ${who}, number ${at}.`), attribution: who })
  // Three of them get a photo: a drawn square of colour with a face-ish circle, saved as the app saves one.
  for (const [at, who] of people.slice(0, 3).entries()) {
    const url = await h.evaluate(async (hue) => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 256
      const g = canvas.getContext('2d')
      g.fillStyle = `hsl(${hue} 45% 55%)`; g.fillRect(0, 0, 256, 256)
      g.fillStyle = `hsl(${hue} 30% 85%)`; g.beginPath(); g.arc(128, 110, 60, 0, Math.PI * 2); g.fill()
      g.beginPath(); g.ellipse(128, 260, 100, 80, 0, 0, Math.PI * 2); g.fill()
      const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'))
      return window.api.saveImage('image/png', new Uint8Array(await blob.arrayBuffer()))
    }, 40 + at * 90)
    await v('people:set', who, url)
  }
  await c.go('sources')
  await wait(1500)
  const read = () => h.evaluate(() => [...document.querySelectorAll('.mf-avatar')].map((one) => {
    const img = one.querySelector('img')
    const style = getComputedStyle(img ?? one.querySelector('svg') ?? one)
    return { picture: !!img, mask: img ? (style.maskImage || style.webkitMaskImage) : null, radius: getComputedStyle(one).borderRadius }
  }))
  const faces = await read()
  await shot('avatars-light')
  await theme(true)
  await shot('avatars-dark')
  await theme(false)
  const pictures = faces.filter((one) => one.picture)
  check('1. photos and shapes both show on Sources', pictures.length > 0 && faces.some((one) => !one.picture), JSON.stringify(faces.slice(0, 6)))
  check('2. every photo is cut to its person\'s shape', pictures.length > 0 && pictures.every((one) => one.mask && one.mask !== 'none'), JSON.stringify(pictures.slice(0, 3)))
  await h.evaluate(() => document.documentElement.setAttribute('data-avatars', 'initials'))
  await wait(300)
  const round = await read()
  await shot('avatars-initials')
  check('3. under "Initials", photos and initials are both round, no shape mask', round.every((one) => one.radius !== '0px') && round.filter((one) => one.picture).every((one) => !one.mask || one.mask === 'none'), JSON.stringify(round.slice(0, 4)))
  await h.evaluate(() => document.documentElement.removeAttribute('data-avatars'))
  // The person page: the hover shade wears the same frame as the face.
  await h.evaluate((d) => window.dispatchEvent(new CustomEvent('haligtree:source', { detail: d })), 'attribution:Ada Lovelace')
  await wait(1500)
  await h.locator('[data-person-photo]').hover()
  await wait(400)
  await shot('person-hover')
  const shade = await h.evaluate(() => { const s = getComputedStyle(document.querySelector('[data-photo-hint]')); return s.maskImage || s.webkitMaskImage })
  check('4. the person page\'s hover shade is cut to the same shape', !!shade && shade !== 'none', shade?.slice(0, 40))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await c.close()
}
done()

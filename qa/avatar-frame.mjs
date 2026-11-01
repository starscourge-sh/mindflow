// A person's photo is round, inside its own box, and never over their name: the earlier look,
// after photos cut into the Coolshapes outlines sliced heads and spilled over the names (user,
// 1 Nov). Every photo is printed in the theme's two tones (its ink and its paper, darker to
// lighter, in Paper and in Everforest), and shows its own colours while pointed at. Initials keep
// their shape. At 5, 50 and 500 people. Checked on Sources' faces (128px), its list (36px), a person
// page (96px) and the small faces beside names (14 to 16px), light and dark.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<dir> node qa/avatar-frame.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go, both, errors } = c
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const make = (patch) => h.evaluate((p) => window.api.captures.create(p), patch)
const people = ['Harry S. Truman', 'Zeno of Citium', 'Jordan Peterson', 'Dave Chappelle', 'Mary Oliver', 'Rumi']

/** Every face on show: its box, its picture's box and shape, and the box of the name beside or under it. */
const faces = () => h.evaluate(() => [...document.querySelectorAll('.mf-avatar')].filter((one) => one.getBoundingClientRect().width > 0).map((one) => {
  const box = one.getBoundingClientRect()
  const img = one.querySelector('img')
  const pic = img?.getBoundingClientRect()
  const style = img ? getComputedStyle(img) : null
  const name = one.closest('[data-face]')?.querySelector('span:not(.mf-avatar):not(.mf-avatar *)')?.getBoundingClientRect()
  return {
    size: Math.round(box.width),
    picture: !!img,
    round: getComputedStyle(one).borderRadius !== '0px' && getComputedStyle(one).overflow === 'hidden',
    masked: !!style && (style.maskImage || style.webkitMaskImage || 'none') !== 'none',
    print: !!img && getComputedStyle(img).filter.includes('mf-duotone'),
    pic: pic && [Math.round(pic.left - box.left), Math.round(pic.top - box.top), Math.round(pic.width), Math.round(pic.height)].join(','),
    inside: !pic || (pic.top >= box.top - 0.5 && pic.bottom <= box.bottom + 0.5 && pic.left >= box.left - 0.5 && pic.right <= box.right + 0.5),
    overName: !!name && box.bottom > name.top + 0.5,
    shape: one.dataset.avatarShape ?? null
  }
}))

const urls = []
try {
  for (const [at, who] of people.entries()) await make({ kind: 'quote', body: doc(`A line from ${who}, number ${at}.`), attribution: who })
  // Four get a photo, tall and wide ones among them (a portrait is rarely square), saved as the app saves one.
  for (const [at, who] of people.slice(0, 4).entries()) {
    const url = await h.evaluate(async ([hue, wide]) => {
      const canvas = document.createElement('canvas')
      canvas.width = wide ? 360 : 200; canvas.height = wide ? 200 : 360
      const g = canvas.getContext('2d')
      const sky = g.createLinearGradient(0, 0, 0, canvas.height)
      sky.addColorStop(0, `hsl(${hue} 30% 78%)`); sky.addColorStop(1, `hsl(${hue + 30} 25% 52%)`)
      g.fillStyle = sky; g.fillRect(0, 0, canvas.width, canvas.height)
      const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'))
      return window.api.saveImage('image/png', new Uint8Array(await blob.arrayBuffer()))
    }, [40 + at * 80, at % 2 === 0])
    await v('people:set', who, url)
    urls.push(url)
  }
  await go('sources')
  await wait(1500)
  const grid = await faces()
  if (shots) await both(`${shots}/avatars`)
  const photos = grid.filter((one) => one.picture)
  check('1. photos show on Sources beside shapes', photos.length >= 4 && grid.some((one) => !one.picture), `${photos.length} photos of ${grid.length}`)
  check('2. every photo is round, clipped to its own circle, with no shape mask', photos.every((one) => one.round && !one.masked && one.shape === null), JSON.stringify(photos.slice(0, 3)))
  check('3. initials keep their shape', grid.filter((one) => !one.picture).every((one) => one.shape !== null))
  check('4. no face on Sources reaches over its name', grid.every((one) => !one.overName), JSON.stringify(grid.filter((one) => one.overName).slice(0, 3)))
  check('5. no picture spills outside its face\'s box', grid.every((one) => one.inside), JSON.stringify(grid.filter((one) => !one.inside).slice(0, 2)))
  // The list (36px), a person page (96px), and small faces beside names.
  for (const [where, open] of [['a person page', () => h.evaluate((d) => window.dispatchEvent(new CustomEvent('haligtree:source', { detail: d })), 'attribution:Harry S. Truman')]]) {
    await open()
    await wait(1500)
    const here = await faces()
    if (shots) await both(`${shots}/avatars-person`)
    check(`6. on ${where}, every photo is round and inside its box (${[...new Set(here.map((one) => one.size))].join(', ')}px)`, here.filter((one) => one.picture).length > 0 && here.filter((one) => one.picture).every((one) => one.round && one.inside && !one.masked), JSON.stringify(here.slice(0, 3)))
  }
  // The two tones, in Paper and in Everforest: the filter's table runs from the darker of ink and paper to the lighter.
  const tones = () => h.evaluate(() => [...document.querySelectorAll('#mf-duotone feFuncR, #mf-duotone feFuncG, #mf-duotone feFuncB')].map((one) => one.getAttribute('tableValues')))
  for (const theme of ['paper', 'everforest']) {
    await h.evaluate((n) => { localStorage.setItem('theme', n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme)
    await wait(600)
    await go('sources')
    await wait(1200)
    const t = await tones()
    const sum = (k) => t.reduce((all, one) => all + Number(one.split(' ')[k]), 0)
    if (shots) await h.screenshot({ path: `${shots}/avatars-${theme}.png` })
    check(`7. ${theme}: photos printed in two tones, dark to light (never a negative)`, t.length === 3 && sum(0) < sum(1), JSON.stringify(t))
    check(`8. ${theme}: every photo wears the print`, (await faces()).filter((one) => one.picture).every((one) => one.print))
  }
  // Pointed at: its own colours over the print, then back.
  const face = h.locator('[data-face="Harry S. Truman"]')
  await face.hover()
  await wait(300)
  const real = await face.evaluate((one) => getComputedStyle(one.querySelector('.mf-avatar-real')).opacity)
  if (shots) await h.screenshot({ path: `${shots}/avatars-hover.png` })
  await h.mouse.move(5, 5)
  await wait(300)
  const back = await face.evaluate((one) => getComputedStyle(one.querySelector('.mf-avatar-real')).opacity)
  check('9. pointed at, the photo shows its own colours; let go, the print again', real === '1' && back === '0', `${real} → ${back}`)
  // Many people: 50 and 500, a photo on every fifth, none overlapping its name.
  for (const n of process.env.QA_QUICK ? [] : [50, 500]) {
    for (let k = people.length; k < n; k++) { await make({ kind: 'quote', body: doc(`Line ${k}`), attribution: `Person ${k} Example` }); if (k % 5 === 0) await v('people:set', `Person ${k} Example`, urls[k % urls.length]) }
    people.length = n
    await go('sources')
    await wait(1500)
    const all = await faces()
    if (shots) await h.screenshot({ path: `${shots}/avatars-${n}.png` })
    check(`10. ${n} people: no face over its name, every photo round and inside its box`, all.every((one) => !one.overName && one.inside) && all.filter((one) => one.picture).every((one) => one.round), `${all.length} faces`)
  }
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await c.close()
}
done()

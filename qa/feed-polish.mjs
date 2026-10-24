// The Feed, polished: a day of about 24 posts (the sandbox book holds
// enough pictures that six or more come up, with no weighting for them), every
// picture shown whole (a tall one is never cropped), faces as shapes with
// initials over them (the same shape for the same name, "Initials" in
// Settings switches back to circles), "Use this" and its Undo showing at once
// in a Journal page open in the other pane, and "Less of this" said in words
// with "Show as before".
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/feed-polish.mjs
import { mkdirSync, readFileSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/briefs/shots/feed6'
mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const s = await sandbox({ width: 1600, height: 1000 })
const { h, v, go, theme, close } = s
const wait = (ms = 900) => h.waitForTimeout(ms)
try {
  await go('feed')
  await wait(1800)
  // 1. The day: 22 to 26 posts, at least 6 with a picture.
  const posts = await h.locator('[data-feed-post]').count()
  check('a day of 22 to 26 posts', posts >= 22 && posts <= 26, posts)
  await h.evaluate(async () => { const box = document.querySelector('[data-feed]')?.closest('.overflow-y-auto'); for (let y = 0; box && y < box.scrollHeight; y += 600) { box.scrollTop = y; await new Promise((r) => setTimeout(r, 120)) } if (box) box.scrollTop = 0 })
  await wait(800)
  const pictures = await h.locator('[data-feed-picture]').count()
  check('at least 6 picture posts in the sandbox day', pictures >= 6, pictures)
  const picking = readFileSync(new URL('../src/main/feed.ts', import.meta.url), 'utf8').match(/const due = [^\n]*/)?.[0] ?? ''
  check('the day is picked with no weighting for pictures', !!picking && !/pict/i.test(picking), picking)
  check('the header says what the day holds', /\d+ \w+/.test(await h.locator('[data-feed-holds]').innerText().catch(() => '')), await h.locator('[data-feed-holds]').innerText().catch(() => ''))

  // The action row, X's way: Reply, Restack, Still true and ⋯, with Less of this as the × at the top right.
  const actions = await h.locator('[data-feed-post="nugget"]').first().evaluate((post) => ({
    row: [...post.querySelectorAll('[data-feed-actions] > *')].filter((one) => one.getBoundingClientRect().width > 0 && one.tagName !== 'SPAN').map((one) => one.getAttribute('aria-label') || one.textContent.trim()),
    hide: !!post.querySelector('[data-feed-reaction="less"][aria-label="Less of this"]')
  }))
  check('the action row is slim: Reply, Restack, Read later, Still true and More, with a × to see less', actions.row.join(",") === "Reply,Restack,Read later,Still true,More" && actions.hide, JSON.stringify(actions))

  // 2. Pictures whole, at their own shape: never cropped, no bars beside them, no taller than 520px.
  const shown = await h.locator('[data-feed-picture]').evaluateAll((all) => all.map((box) => {
    const img = box.querySelector('img:not([aria-hidden])')
    return { fit: getComputedStyle(img).objectFit, h: Math.round(box.getBoundingClientRect().height), w: Math.round(box.getBoundingClientRect().width), nw: img.naturalWidth, nh: img.naturalHeight, iw: Math.round(img.getBoundingClientRect().width), ih: Math.round(img.getBoundingClientRect().height) }
  }))
  // Its box is the picture: drawn at the picture's own proportions, so nothing is cut and no bars sit beside it.
  check('every picture is whole, its box the picture\'s own shape', shown.length > 0 && shown.every((one) => one.h <= 522 && Math.abs(one.iw / one.ih - one.nw / one.nh) < 0.03 && Math.abs(one.w - one.iw) <= 3), JSON.stringify(shown.slice(0, 3)))
  const wide = shown.find((one) => one.nw > one.nh * 1.2)
  check('a wide picture fills the width', !wide || Math.abs(wide.iw - wide.w) <= 3, JSON.stringify(wide))
  // A tall picture: one put in for the check if the sandbox has none.
  const tallIn = async () => {
    await h.evaluate(async () => { const box = document.querySelector('[data-feed]')?.closest('.overflow-y-auto'); for (let y = 0; box && y < box.scrollHeight; y += 600) { box.scrollTop = y; await new Promise((r) => setTimeout(r, 150)) } })
    await wait(600)
    const real = await h.locator('[data-feed-picture]').evaluateAll((all) => all.findIndex((box) => { const img = box.querySelector('img:not([aria-hidden])'); return img.naturalHeight > img.naturalWidth * 1.15 }))
    if (real >= 0) return h.locator('[data-feed-picture]').nth(real)
    await h.evaluate(() => {
      const box = document.querySelector('[data-feed-picture]')
      const img = box.querySelector('img:not([aria-hidden])')
      const c = document.createElement('canvas'); c.width = 300; c.height = 600
      const g = c.getContext('2d'); g.fillStyle = '#c84'; g.fillRect(0, 0, 300, 600); g.fillStyle = '#248'; g.fillRect(0, 0, 300, 40); g.fillRect(0, 560, 300, 40)
      img.src = c.toDataURL()
    })
    await wait(400)
    return h.locator('[data-feed-picture]').first()
  }
  let box = await tallIn()
  const tall = await box.evaluate((one) => { const img = one.querySelector('img:not([aria-hidden])'); const r = img.getBoundingClientRect(); const scale = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight); return { h: Math.round(one.getBoundingClientRect().height), nw: img.naturalWidth, nh: img.naturalHeight, fit: getComputedStyle(img).objectFit, shownH: Math.round(img.naturalHeight * scale), boxH: Math.round(r.height) } })
  const tallW = await box.evaluate((one) => ({ box: Math.round(one.getBoundingClientRect().width), img: Math.round(one.querySelector('img').getBoundingClientRect().width), ratio: one.querySelector('img').naturalWidth / one.querySelector('img').naturalHeight, iw: one.querySelector('img').getBoundingClientRect().width, ih: one.querySelector('img').getBoundingClientRect().height }))
  check('a portrait picture shows whole, no taller than 520px, its box only as wide as the picture', tall.h <= 522 && tall.h >= 300 && Math.abs(tallW.box - tallW.img) <= 3 && Math.abs(tallW.iw / tallW.ih - tallW.ratio) < 0.03, JSON.stringify({ ...tall, ...tallW }))
  const feedAgain = async () => { await go('feed'); await wait(1500) }
  for (const name of ['light', 'dark']) {
    await theme(name)
    await feedAgain()
    box = await tallIn()
    await box.evaluate((one) => one.scrollIntoView({ block: 'center' }))
    await wait(500)
    await h.screenshot({ path: `${SHOTS}/portrait-${name}.png` })
  }
  await theme('light')
  await feedAgain()

  // 3. Avatars: shapes by default, initials over them, the same shape for the same name.
  await h.evaluate(() => document.querySelector('[data-feed]')?.closest('.overflow-y-auto')?.scrollTo(0, 0))
  await wait(400)
  const faces = await h.locator('[data-feed-post] .mf-avatar[data-avatar-shape]').evaluateAll((all) => all.map((one) => ({
    name: one.closest('[data-feed-post]').querySelector('[data-feed-account]')?.textContent, shape: one.dataset.avatarShape,
    svg: getComputedStyle(one.querySelector('.mf-avatar-shape')).display, letters: one.querySelector(':scope > span')?.textContent, color: getComputedStyle(one).color
  })))
  check('faces are shapes by default, with initials over them', faces.length > 3 && faces.every((one) => one.svg === 'block' && one.letters), JSON.stringify(faces.slice(0, 2)))
  const byName = new Map()
  for (const one of faces) byName.set(one.name, [...(byName.get(one.name) ?? []), one.shape])
  check('the same name always wears the same shape', [...byName.values()].every((list) => new Set(list).size === 1) && new Set(faces.map((one) => one.shape)).size >= 2, [...byName].slice(0, 4).map(([n, l]) => `${n}:${l[0]}`).join(' '))
  // Readable: the letters against the shape's lighter end, in both themes.
  const contrast = () => h.evaluate(() => {
    const one = document.querySelector('[data-feed-post] .mf-avatar[data-avatar-shape]')
    const probe = document.createElement('span'); one.appendChild(probe)
    const read = (css) => { probe.style.color = css; const c = getComputedStyle(probe).color; const cv = document.createElement('canvas').getContext('2d'); cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data].slice(0, 3) }
    const lum = ([r, g, b]) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
    const ink = read('var(--foreground)')
    const ratios = ['var(--mf-shape-a)', 'var(--mf-shape-b)'].map((css) => { const a = lum(ink); const b = lum(read(css)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) })
    probe.remove()
    return Math.min(...ratios)
  })
  const lightRatio = await contrast()
  await theme('dark'); await feedAgain()
  const darkRatio = await contrast()
  await theme('light'); await feedAgain()
  check('initials read over the shape (4.5:1 or more) in light and dark', lightRatio >= 4.5 && darkRatio >= 4.5, `${lightRatio.toFixed(1)} / ${darkRatio.toFixed(1)}`)
  for (const name of ['light', 'dark']) {
    await theme(name)
    await feedAgain()
    await h.screenshot({ path: `${SHOTS}/notes-${name}.png` })
  }
  await theme('light')
  await feedAgain()
  // 4. Use this, with the Journal open in the other pane: the link shows at once, and Undo takes it out at once.
  const target = (await v('feed')).posts.find((one) => one.type === 'nugget' && !one.react && !one.poll && !one.quiz)
  await go('day')
  await wait(1200)
  await h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await h.keyboard.press('Alt+Meta+Backslash')
  await wait(1200)
  await go('feed')
  await wait(1500)
  const panes = await h.locator('[data-pane]').count()
  check('the Journal in one pane and the Feed in the other', panes === 2 && await h.locator('[data-pane] [data-day-write] .ProseMirror').count() === 1 && await h.locator('[data-pane] [data-feed]').count() === 1, panes)
  const post = h.locator(`[data-pane] [data-feed-id="${target.id}"]`)
  await post.scrollIntoViewIfNeeded()
  await post.locator('[data-feed-actions] [data-menu="post"]').click()
  await wait(300)
  await h.locator('[role="menu"] [data-menu-item="use"]').click()
  await wait(1200)
  const journal = h.locator('[data-pane] [data-day-write] .ProseMirror')
  const label = target.title.replace(/\s+/g, ' ').trim().slice(0, 30)
  const linked = async () => (await journal.innerText()).replace(/\s+/g, ' ').includes(label)
  check('"Use this" shows the link in the open Journal page at once', await linked(), label)
  await h.locator('button:has-text("Undo")').first().click()
  await wait(1200)
  check('Undo takes it out of the open Journal page at once', !(await linked()))

  // 5. Less of this: "Shown less often (once)", and "Show as before" puts it back.
  const other = (await v('feed')).posts.find((one) => one.type === 'nugget' && !one.react && one.id !== target.id && !one.faded)
  const less = h.locator(`[data-pane] [data-feed-id="${other.id}"]`)
  await less.scrollIntoViewIfNeeded()
  await less.locator('[data-feed-reaction="less"]').click()
  await wait(1200)
  const said = await less.locator('[data-feed-faded]').innerText().catch(() => '')
  check('the post says how far it has faded', /Shown less often \(once\)/.test(said), said)
  const after = (await v('feed')).posts.find((one) => one.id === other.id)
  check('the Feed counts the fade', after?.faded === 1, after?.faded)
  await less.locator('[data-show-as-before]').click()
  await wait(1200)
  const back = (await v('feed')).posts.find((one) => one.id === other.id)
  check('"Show as before" puts it back', back?.faded === 0 && back?.react === null && await less.locator('[data-feed-faded]').count() === 0, JSON.stringify({ faded: back?.faded, react: back?.react }))
  check('its details say the same', await v('feed:faded', 'nugget', other.id) === 0)

  // The avatar setting, light and dark.
  await h.keyboard.press('Control+w').catch(() => {})
  await wait(600)
  await go('settings')
  await wait(1200)
  const row = h.locator('[data-choices="Avatars"]')
  await row.scrollIntoViewIfNeeded()
  check('Settings has "Avatars" with a sample of each', await row.locator('[data-preview="avatars"]').count() === 2)
  await row.locator('[data-choice="initials"]').click()
  await wait(800)
  check('choosing "Initials" in Settings keeps it', (await v('settings')).avatars === 'initials')
  const sample = await row.locator('[data-choice="initials"] .mf-avatar').first().evaluate((one) => getComputedStyle(one.querySelector('.mf-avatar-shape')).display)
  check('the "Initials" sample shows circles', sample === 'none', sample)
  await go('feed')
  await wait(1500)
  const round = await h.locator('[data-feed-post] .mf-avatar[data-avatar-shape]').first().evaluate((one) => ({ svg: getComputedStyle(one.querySelector('.mf-avatar-shape')).display, radius: getComputedStyle(one).borderRadius }))
  check('"Initials" switches the Feed to the round faces', round.svg === 'none' && round.radius !== '0px', JSON.stringify(round))
  await go('settings')
  await wait(1200)
  await h.locator('[data-choices="Avatars"] [data-choice="shapes"]').click()
  await wait(800)
  for (const name of ['light', 'dark']) {
    await theme(name)
    await go('settings')
    await wait(1200)
    await h.locator('[data-choices="Avatars"]').scrollIntoViewIfNeeded()
    await h.locator('[data-choices="Avatars"]').evaluate((one) => one.closest('[data-setting], section, div')?.scrollIntoView({ block: 'center' }))
    await wait(400)
    await h.screenshot({ path: `${SHOTS}/avatar-setting-${name}.png` })
  }
} finally {
  await close()
}
done()

// The welcome's first questions and what follows them, on a fresh install:
//  - the tag field: "#" drawn in it, never typed; "#draft", "draft" and "##draft" all give #draft, "two words" gives #two-words
//  - what Vigil did with the answers is shown at once, and the demos after use the tag and the goal
//  - with nothing answered, Next goes straight on
//  - no words are ever stretched: every frame of Catch and Become, no text has a different scale across than down
//  - the postcard floats with Motion on, holds still on hover and with Motion off
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/welcome-answers.mjs [shots-dir] [light|dark]
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
const THEME = process.argv[3] ?? 'light'
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let failed = 0
const check = (name, ok, more = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${more ? `  (${more})` : ''}`)
}
const open = async (h) => {
  const own = await h.waitForSelector('.mf-welcome', { timeout: 8000 }).then(() => true, () => false)
  if (!own) await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:welcome')))
  await h.waitForSelector('.mf-welcome', { timeout: 8000 })
}
const NEXT = 'footer button:has-text("Next"), footer button:has-text("Show me")'
const chapter = (h) => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
const until = async (h, name, tries = 40) => {
  for (let i = 0; i < tries && !(await chapter(h)).includes(name); i++) {
    await h.click(NEXT)
    await h.waitForTimeout(700)
  }
  return (await chapter(h)).includes(name)
}

/**
 * Every frame for `ms`: each element with words of its own inside the welcome,
 * its scale across and down summed up through every parent (transform and
 * scale both). A 3D turn (a card flipping) is left out. The worst gap found.
 */
const stretch = (h, ms) => h.evaluate((ms) => new Promise((done) => {
  const scaleOf = (el) => {
    let m = new DOMMatrix()
    for (let at = el; at && at !== document.documentElement; at = at.parentElement) {
      const css = getComputedStyle(at)
      if (css.transform && css.transform !== 'none') {
        const t = new DOMMatrix(css.transform)
        if (!t.is2D) return null
        m = t.multiply(m)
      }
      if (css.scale && css.scale !== 'none') {
        const [x, y = x] = css.scale.split(' ').map(Number)
        m = new DOMMatrix().scale(x, y).multiply(m)
      }
    }
    return [Math.hypot(m.a, m.b), Math.hypot(m.c, m.d)]
  }
  let worst = { gap: 0, text: '' }
  let frames = 0
  const end = performance.now() + ms
  const tick = () => {
    frames++
    for (const el of document.querySelectorAll('.mf-welcome main *')) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      const s = scaleOf(el)
      if (!s) continue
      const gap = Math.abs(s[0] - s[1]) / Math.max(s[0], s[1])
      if (gap > worst.gap) worst = { gap, text: `${el.textContent.trim().slice(0, 40)} ${s[0].toFixed(3)}x${s[1].toFixed(3)}` }
    }
    if (performance.now() < end) requestAnimationFrame(tick)
    else done({ ...worst, frames })
  }
  requestAnimationFrame(tick)
}), ms)

const c = await sandbox({ width: 1280, height: 800, seeded: false })
const { h } = c
const shot = async (name) => SHOTS && h.screenshot({ path: `${SHOTS}/${THEME}-${name}.png` })
try {
  await c.theme(THEME)
  await open(h)
  await h.click(NEXT)
  await h.waitForTimeout(900)

  // --- the tag field ---
  const field = await h.$('input[aria-label="Your own tag"], input[aria-label="Or a tag of your own"]')
  check('there is a field for your own tag', !!field)
  const hash = await h.$('[data-hash]')
  check('the "#" is drawn in the field, not in its placeholder', !!hash && !/#/.test((await field?.getAttribute('placeholder')) ?? '#'), (await field?.getAttribute('placeholder')) ?? '')
  const kept = async (typed, how) => {
    await field.click()
    await h.keyboard.press('Meta+A')
    await h.keyboard.press('Backspace')
    if (how === 'paste') await field.fill(typed)
    else await h.keyboard.type(typed, { delay: 20 })
    const value = await field.inputValue()
    await h.keyboard.press('Enter')
    await h.waitForTimeout(250)
    const chip = await h.evaluate(() => [...document.querySelectorAll('.mf-welcome button[aria-pressed="true"]')].map((b) => b.textContent.trim()).find((t) => t.startsWith('#')) ?? '')
    return { value, chip }
  }
  for (const [typed, how, want] of [['#draft', 'type', 'draft'], ['draft', 'paste', 'draft'], ['##draft', 'paste', 'draft'], ['two words', 'type', 'two-words']]) {
    if (!field) break
    const got = await kept(typed, how)
    check(`"${typed}" (${how}d) shows as ${want} after the "#", and is kept as the chip #${want}`, got.value === want && got.chip === `#${want}`, `field "${got.value}", chip "${got.chip}"`)
  }
  if (field) {
    await field.click()
    await h.keyboard.type('2024')
    const hint = await h.textContent('[data-tag-hint]').catch(() => '')
    check('a tag starting with a number says why it cannot be one', /starts with a letter/.test(hint ?? ''), hint ?? '')
    await shot('tag-hint')
    await h.keyboard.press('Meta+A')
    await h.keyboard.press('Backspace')
  }
  await shot('you-answered')

  // --- the payoff ---
  const study = await h.$('button[aria-pressed]:has-text("Study")')
  await study?.click()
  await h.waitForTimeout(200)
  if (field) {
    await field.click()
    await h.keyboard.type('chemistry')
    await h.keyboard.press('Enter')
  }
  const goal = await h.$('input[aria-label="A goal"]')
  await goal?.fill('Pass the chemistry exam')
  await h.click('.mf-welcome h1')
  await h.waitForTimeout(300)
  await h.click(NEXT)
  await h.waitForTimeout(1200)
  const paid = await h.$('[data-payoff]')
  const said = paid ? (await paid.innerText()).replace(/\s+/g, ' ') : ''
  check('after the questions, what Vigil did with them shows at once', !!paid, said.slice(0, 160))
  check('it names the tag, the goal and what was set up for study', /#chemistry/.test(said) && /Pass the chemistry exam/.test(said) && /study/i.test(said))
  const goals = await c.v('items', 'goal').catch(() => null)
  check('the goal is really made, on your Goals page', Array.isArray(goals) && goals.some((g) => g.title === 'Pass the chemistry exam'), Array.isArray(goals) ? goals.map((g) => g.title).join(', ') : 'no goals')
  const undo = await h.$('[data-payoff] [data-made="goal"] button:has-text("Undo")')
  check('each change has its own Undo', !!undo)
  await shot('payoff')
  if (undo) {
    await undo.click()
    await h.waitForTimeout(600)
    const after = await c.v('items', 'goal').catch(() => [])
    check('Undo takes the goal back off', !after.some((g) => g.title === 'Pass the chemistry exam'))
    await h.click('[data-payoff] [data-made="goal"] button:has-text("Redo")').catch(() => undefined)
    await h.waitForTimeout(600)
    const again = await c.v('items', 'goal').catch(() => [])
    check('Redo puts it back, once', again.filter((g) => g.title === 'Pass the chemistry exam').length === 1)
  }

  // --- Catch: no stretched words ---
  await h.click(NEXT)
  await h.waitForTimeout(300)
  check('Next goes on to Catch', (await chapter(h)).includes('Catch'), await chapter(h))
  // Every size a window may have, full screen too: the footer's controls whole inside it, the margins even.
  for (const [w, hh] of [[860, 600], [1024, 700], [1280, 800], [1440, 900], [1728, 1080]]) {
    await c.size(w, hh)
    await h.waitForTimeout(500)
    const fit = await h.evaluate(() => {
      const W = innerWidth
      const out = [...document.querySelectorAll('.mf-welcome footer button')].filter((b) => b.offsetParent).map((b) => [b.textContent.trim().slice(0, 20), b.getBoundingClientRect()]).filter(([, r]) => r.left < 0 || r.right > W).map(([t]) => t)
      const left = document.querySelector('.mf-welcome h1')?.getBoundingClientRect().left ?? 0
      const right = W - (document.querySelector('.mf-welcome footer [data-next]')?.getBoundingClientRect().right ?? W)
      return { W, out, left: Math.round(left), right: Math.round(right) }
    })
    check(`${w}x${hh}: footer controls whole inside the window, margins even`, !fit.out.length && Math.abs(fit.left - fit.right) <= 4, `width ${fit.W}, left ${fit.left}, right ${fit.right}${fit.out.length ? `, cut: ${fit.out.join(', ')}` : ''}`)
  }
  await c.size(1280, 800)
  const caught = await stretch(h, 16000)
  check(`Catch: no words stretched in any frame (${caught.frames} frames)`, caught.gap < 0.01, caught.text ? `worst ${(caught.gap * 100).toFixed(1)}%: ${caught.text}` : '')

  // --- the demos use the answers ---
  if (await until(h, 'Write')) {
    await h.waitForTimeout(1500)
    const meta = await h.textContent('[data-example-note]').catch(() => '')
    check('the Write example is tagged with your tag', /#chemistry/.test(meta ?? ''))
  }
  if (await until(h, 'Become')) {
    const became = await stretch(h, 14000)
    check(`Become: no words stretched in any frame (${became.frames} frames)`, became.gap < 0.01, became.text ? `worst ${(became.gap * 100).toFixed(1)}%: ${became.text}` : '')
    await h.waitForSelector('[data-float]', { timeout: 15000 }).catch(() => undefined)
    // Played to its end, so nothing else moves under the pointer.
    await h.waitForFunction(() => [...document.querySelectorAll('.mf-welcome [data-reel]')].every((el) => el.dataset.reel === 'done'), null, { timeout: 30000 }).catch(() => undefined)
    await h.waitForTimeout(800)
    await shot('become-postcard')
    const note = await h.textContent('[data-frame="note"]').catch(() => '')
    check('the Become note carries your tag', /#chemistry/.test(note ?? ''))
    const caption = await h.evaluate(() => document.querySelector('.mf-welcome main')?.innerText ?? '')
    check('the welcome says this is how old notes come back', /how old notes come back/i.test(caption))

    // --- the postcard floats ---
    const float = '[data-float] > .mf-float'
    const moves = async (ms) => {
      const seen = new Set()
      for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(120)) seen.add(await h.$eval(float, (el) => getComputedStyle(el).transform).catch(() => 'missing'))
      return seen
    }
    const on = await moves(2000)
    check('Motion on: the postcard floats (its transform changes over time)', on.size >= 4 && !on.has('missing'), `${on.size} positions`)
    const shadow = await h.$eval('[data-float] > .mf-float-shadow', (el) => getComputedStyle(el).animationName).catch(() => '')
    check('its shadow moves on its own layer, not by animating box-shadow', shadow === 'mf-float-shadow', shadow)
    if (await h.$('[data-float]')) {
    await h.hover('[data-float]')
    await h.waitForTimeout(200)
    const held = await moves(1200)
    check('pointed at, it holds still', held.size === 1, `${held.size} positions`)
    await h.mouse.move(5, 5)
    await h.evaluate(() => (document.documentElement.dataset.motion = 'off'))
    await h.waitForTimeout(200)
    const off = await moves(1200)
    check('Motion off: it does not float', off.size === 1 && [...off][0] === 'none', [...off].join(' | '))
    await h.evaluate(() => (document.documentElement.dataset.motion = 'on'))
    }
  }
  // Their tag and goal on the last page too.
  await h.click('footer button:has-text("Skip trying it")').catch(() => undefined)
  await h.waitForTimeout(900)
  await h.click('footer button:has-text("Skip the welcome")').catch(() => undefined)
  await h.waitForTimeout(900)
  const last = await h.evaluate(() => document.querySelector('.mf-welcome main')?.innerText ?? '')
  check('the last page names your goal', /Pass the chemistry exam/.test(last))
  await shot('last')
} finally {
  await c.close()
}

// --- nothing answered: it flows straight on ---
{
  // A fresh install of its own: a first run, nothing answered.
  const fresh = mkdtempSync(join(tmpdir(), 'mindflow-qa-'))
  process.env.QA_DATA = fresh
  const d = await sandbox({ width: 1280, height: 800, seeded: false })
  try {
    await open(d.h)
    await d.h.click(NEXT)
    await d.h.waitForTimeout(900)
    await d.h.click(NEXT)
    await d.h.waitForTimeout(900)
    check('nothing answered: Next goes straight to Catch, no empty summary', (await chapter(d.h)).includes('Catch') && !(await d.h.$('[data-payoff]')), await chapter(d.h))
    if (await until(d.h, 'Write')) {
      await d.h.waitForTimeout(1500)
      const meta = await d.h.textContent('[data-example-note]').catch(() => '')
      check('nothing answered: the Write example keeps its own tag', /#reading/.test(meta ?? ''))
    }
  } finally {
    await d.close()
    rmSync(fresh, { recursive: true, force: true })
  }
}
console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)

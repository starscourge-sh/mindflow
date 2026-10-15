// The welcome as a first-time reader meets it: the first line and the example
// captures are typed in, a letter at a time (whole at once with Motion off);
// each capture says what Vigil just did; the Write chapter's note is about
// a Renaissance reading note on the app's card radius, walks the real "/" menu,
// shows a picture's Caption control on hover (with a first-time hint), and
// makes no gem (a gem is shown once, in The flow), so no Gems shelf stands empty.
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/welcome-write.mjs [shots-dir]
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let failed = 0
const check = (name, ok, more = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${more ? `  (${more})` : ''}`)
}

// A fresh install opens the welcome on its own, as a first run: only then does the first line type
// (opened again from a menu it is whole). So wait for that, and open it by hand only if it never comes.
const open = async (h) => {
  const own = await h.waitForSelector('.mf-welcome', { timeout: 8000 }).then(() => true, () => false)
  if (!own) await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:welcome')))
  await h.waitForSelector('.mf-welcome', { timeout: 8000 })
  return own
}
// On, or past Your turn without trying it.
const next = async (h) => ((await h.$('footer button:has-text("Skip trying it")')) ? h.click('footer button:has-text("Skip trying it")') : h.click('footer button:has-text("Next"), footer button:has-text("Show me")'))
const chapter = (h) => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
/** Next until the named chapter is up (a press on a playing page settles it first). */
const until = async (h, name) => {
  for (let i = 0; i < 30 && !(await chapter(h)).includes(name); i++) (await next(h), await h.waitForTimeout(500))
}
/** How a line grows over `ms`: the distinct lengths it passed through, and the first and last. */
const grows = async (h, read, ms) => {
  const seen = []
  for (const end = Date.now() + ms; Date.now() < end; ) {
    seen.push(await h.evaluate(read))
    await h.waitForTimeout(60)
  }
  return { steps: new Set(seen).size, first: seen[0], last: seen[seen.length - 1] }
}
// The first line as a reader sees it: the letters typed so far (the rest is laid out but hidden), or the whole line when it does not type.
const titleText = () => document.querySelector('.mf-welcome h1')?.innerText.trim().length ?? 0
const boxText = () => document.querySelector('.mf-welcome [data-frame="box"]')?.innerText.replace(/\s+/g, ' ').trim().length ?? 0

for (const theme of ['light', 'dark']) {
  const c = await sandbox({ width: 1280, height: 800, seeded: false })
  const { h } = c
  try {
    // Each run its own first time: the caption hint shows once ever.
    await h.evaluate(() => localStorage.removeItem('welcome-caption-hint'))
    await c.theme(theme)
    const first = await open(h)
    const shot = async (name) => SHOTS && h.screenshot({ path: `${SHOTS}/${theme}-${name}.png` })
    if (theme === 'light') {
      check('a fresh install opens the welcome on its own', first)
      const line = await grows(h, titleText, 1500)
      check('the first line types in, a letter at a time', line.steps >= 5 && line.last > line.first, `${line.steps} lengths, ${line.first} to ${line.last}`)
    }
    await until(h, 'Catch')
    // The box waits until the words over it are read, then its first example starts typing.
    await h.waitForFunction(() => (document.querySelector('.mf-welcome [data-frame="box"] [data-caught]')?.textContent ?? '').length > 0, null, { timeout: 15000 })
    const box = await grows(h, boxText, 1800)
    check(`${theme}: the example capture is typed in, not popped in`, box.steps >= 8 && box.last > box.first, `${box.steps} lengths, ${box.first} to ${box.last}`)
    await shot('catch-typing')
    const aha = await h.waitForSelector('[data-aha="quote"]', { timeout: 10000 }).then(() => true, () => false)
    check(`${theme}: the quote says it was kept with its source`, aha && /source/.test(await h.textContent('[data-aha="quote"]')))
    await shot('catch-aha')
    // Its line goes with its example: while the next one types, the quote's line is gone.
    const nextOne = await h.waitForFunction(() => /^pe/.test(document.querySelector('.mf-welcome [data-caught]')?.textContent ?? ''), null, { timeout: 12000 }).then(() => true, () => false)
    check(`${theme}: each aha line leaves with its example`, nextOne && !(await h.$('[data-aha="quote"]')))
    // On to Write: settle Catch, wait until it is settled, then Next.
    await next(h)
    await h.waitForFunction(() => [...document.querySelectorAll('.mf-welcome [data-reel]')].every((el) => el.dataset.reel === 'done'), null, { timeout: 5000 })
    await h.waitForTimeout(500)
    await next(h)
    await h.waitForSelector('[data-example-note]', { timeout: 6000 })
    const radius = await h.$eval('[data-example-note]', (el) => parseFloat(getComputedStyle(el).borderTopLeftRadius))
    check(`${theme}: the example note sits on the app's card radius, smaller than before (14px)`, radius > 0 && radius <= 11, `${radius}px`)
    const words = await h.$eval('[data-example-note]', (el) => el.innerText)
    check(`${theme}: the example note is a Renaissance reading note, with its table of painters`, /perspective/i.test(words) && /Painter/.test(words) && /Masaccio/.test(words) && !/Gandalf|Frodo/.test(words), words.replace(/\s+/g, ' ').slice(0, 160))
    const glance = await h.waitForSelector('[data-slash-glance]', { timeout: 15000 }).then(() => true, () => false)
    // The line said under the page while the menu is open (it moves on to the picture's once the menu is done).
    const glanceSaid = await h.textContent('[data-write-step="slash"]').catch(() => '')
    const picked = new Set()
    let rows = 0
    for (let i = 0; i < 30 && glance; i++) {
      const now = await h.evaluate(() => ({ rows: document.querySelectorAll('[data-slash-glance] button').length, on: document.querySelector('[data-slash-glance] .is-selected')?.textContent ?? '' }))
      rows = Math.max(rows, now.rows)
      if (now.on) picked.add(now.on)
      if (i === 8) await shot('slash-glance')
      await h.waitForTimeout(90)
    }
    check(`${theme}: "/" opens the real block menu and walks through it`, glance && rows >= 15 && picked.size >= 8, `${rows} rows, ${picked.size} passed`)
    check(`${theme}: the glance names what "/" holds`, /opens every kind of block/.test(glanceSaid ?? ''), glanceSaid ?? '')
    const pic = await h.waitForSelector('[data-write-step="pic"]', { timeout: 60000 }).then(() => true, () => false)
    check(`${theme}: then the picture's bar and its caption`, pic && /Caption/.test(await h.textContent('[data-write-step="pic"]').catch(() => '')))
    await h.waitForFunction(() => [...document.querySelectorAll('.mf-welcome [data-reel]')].every((el) => el.dataset.reel === 'done'), null, { timeout: 30000 })
    await shot('write-end')
    // A gem is made once in the welcome, in The flow: none here, and no empty Gems shelf.
    check(`${theme}: Write makes no gem and shows no empty Gems shelf`, !(await h.$('[data-gems-shelf]')) && !(await h.$('[data-write-step="gem"]')) && !/gem/i.test(await h.innerText('.mf-welcome main')))
    // Pointed at, the picture shows its own bar, Caption on it, and the first time a hint.
    await h.waitForFunction(() => [...document.querySelectorAll('.mf-welcome [data-reel]')].every((el) => el.dataset.reel === 'done'), null, { timeout: 15000 })
    await h.waitForTimeout(800)
    await h.hover('[data-picture]')
    await h.waitForTimeout(500)
    const bar = await h.$('[data-picture-bar] [aria-label="Caption"]')
    const hint = await h.$('[data-caption-hint]')
    check(`${theme}: hovering the picture shows its Caption control`, !!bar)
    check(`${theme}: the first hover says what Caption does`, !!hint && /Caption/.test(await hint.textContent()))
    await shot('picture-hover')
    // Gems sits in the note's own bar: over nothing, at any window size.
    if (theme === 'light') {
      for (const [w, hh] of [[1100, 700], [1280, 800], [1600, 1000]]) {
        await c.size(w, hh)
        await h.waitForTimeout(600)
        // The note and the line under it both whole inside the window.
        const fit = await h.evaluate(() => {
          const note = document.querySelector('[data-example-note]')?.getBoundingClientRect()
          const step = document.querySelector('[data-write-step]')?.getBoundingClientRect()
          return !!note && !!step && note.bottom <= innerHeight && step.bottom <= innerHeight && note.right <= innerWidth
        })
        check(`${w}x${hh}: the note and its line fit the window`, fit)
        await shot(`write-${w}x${hh}`)
      }
    }
    if (bar) {
      // Pointed at again: a resize above can move the picture out from under the pointer, and its bar with it.
      await h.hover('[data-picture]', { force: true })
      await h.waitForTimeout(400)
      await h.click('[data-picture-bar] [aria-label="Caption"]')
      await h.waitForTimeout(200)
      check(`${theme}: Caption puts the caret in the caption`, await h.evaluate(() => document.activeElement?.tagName === 'FIGCAPTION'))
    }
  } finally {
    if (c.errors.length) console.log(c.errors.join('\n'))
    await c.close()
  }
}

// Motion off (Reduce motion): nothing types, everything is there at once.
{
  const c = await sandbox({ width: 1280, height: 800, seeded: false })
  const { h } = c
  try {
    await h.emulateMedia({ reducedMotion: 'reduce' })
    await h.reload()
    await open(h)
    const line = await grows(h, titleText, 600)
    check('motion off: the first line is whole at once', line.steps === 1 && line.first > 40, `${line.steps} lengths, ${line.first}`)
    await until(h, 'Write')
    await h.waitForSelector('[data-example-note]', { timeout: 6000 })
    const whole = await h.evaluate(() => ({ pic: !!document.querySelector('[data-write-step="pic"]'), caption: document.querySelector('[data-example-note] figcaption')?.textContent ?? '', painting: !!document.querySelector('[data-example-note] img[src*="delivery-of-the-keys"]') }))
    check('motion off: the note\'s picture is Perugino\'s Delivery of the Keys, captioned with its painter, title and date', whole.painting && /Perugino, The Delivery of the Keys, 1481-82/.test(whole.caption), JSON.stringify(whole))
    check('motion off: Write is whole at once, its caption written and said', whole.pic && whole.caption.length > 10, JSON.stringify(whole))
  } finally {
    if (c.errors.length) console.log(c.errors.join('\n'))
    await c.close()
  }
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)

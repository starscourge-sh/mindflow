// Can a first-time reader take in every step of the welcome? Plays it the
// way a newcomer would (no keys pressed while a chapter plays), samples what
// is on screen every 150ms, and for each line of words says how long it was
// up against how long a normal reader needs (225 words a minute plus a second
// to find it), its type size, and whether it left before it could be read.
// A line still up when the chapter ends waits for Next: the reader's pace.
// It fails only when one of the welcome's own lines (19px and up) goes too soon.
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/welcome-read.mjs [shots-dir] [json-out]
import { mkdirSync, writeFileSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
const OUT = process.argv[3] ?? ''
// A theme to walk it in, light by default (as a newcomer first sees it): `node qa/welcome-read.mjs shots out.json dark`.
const THEME = process.argv[4] ?? 'light'
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const c = await sandbox({ width: 1280, height: 800, seeded: false })
const { h } = c
const needed = (words) => 1000 + (words * 60000) / 225
let failed = 0
let moved = 0
const rows = []
try {
  await c.theme(THEME)
  await h.waitForTimeout(1500)
  if (!(await h.$('.mf-welcome'))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:welcome')))
  await h.waitForSelector('.mf-welcome', { timeout: 8000 })
  // Every line of words in the welcome's stage, as a reader would see it: on screen, not faded out, its size.
  const sample = () => h.evaluate(() => {
    const root = document.querySelector('.mf-welcome main')
    if (!root) return []
    const out = new Map()
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const blockOf = (el) => el.closest('p, h1, h2, h3, li, figcaption, button, [role=status], td, span.font-heading') ?? el
    const alpha = (el) => {
      let a = 1
      for (let at = el; at && at !== document.body; at = at.parentElement) {
        const css = getComputedStyle(at)
        if (css.visibility === 'hidden' || css.display === 'none') return 0
        a *= Number(css.opacity)
      }
      return a
    }
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      if (!node.textContent.trim()) continue
      const block = blockOf(node.parentElement)
      if (out.has(block)) continue
      const text = (block.innerText ?? '').replace(/\s+/g, ' ').trim()
      if (text.length < 3 || !/[a-z]{2}/i.test(text)) continue
      const box = block.getBoundingClientRect()
      if (box.width < 2 || box.bottom < 0 || box.top > innerHeight || box.right < 0 || box.left > innerWidth) continue
      const a = alpha(block)
      if (a < 0.6) continue
      out.set(block, { text: text.slice(0, 140), size: parseFloat(getComputedStyle(block).fontSize), a: Math.round(a * 100) / 100 })
    }
    return [...out.values()]
  })
  // One focal point at a time: the headline and its line, and everything else on the stage, as a fingerprint of
  // where each thing is, how big and how faded (a blinking caret and a floating postcard aside: they idle, they do not act). The stage must hold still while the words are read.
  const focus = () => h.evaluate(() => {
    // The page arriving, not the one leaving: the last section.
    const section = [...document.querySelectorAll('.mf-welcome main section')].pop()
    const words = section?.querySelector('[data-words]') ?? section?.querySelector('[data-reel]')
    if (!section) return { words: '', stage: '' }
    const parts = []
    for (const el of [...section.querySelectorAll('*')].slice(0, 600)) {
      if (words?.contains(el) || el.closest('.mf-ghost-caret, .mf-caret, svg, [data-float]')) continue
      const r = el.getBoundingClientRect()
      if (!r.width) continue
      parts.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}@${Math.round(r.x / 4)},${Math.round(r.y / 4)},${Math.round(r.width / 4)},${Math.round(Number(getComputedStyle(el).opacity) * 5)}`)
    }
    return { words: (words?.innerText ?? '').replace(/\s+/g, ' ').trim(), stage: parts.join(';') + `;text ${section.innerText.length - (words?.innerText.length ?? 0)}` }
  })
  // Demo parts on the stage: no panel sits over another, and no panel stands empty (a frame with nothing in it reads as unfinished).
  const layout = () => h.evaluate(() => {
    const section = [...document.querySelectorAll('.mf-welcome main section')].pop()
    if (!section) return { empty: [], over: [] }
    const seen = (el) => {
      if (el.closest('[aria-hidden="true"], [data-words]')) return false
      let a = 1
      for (let at = el; at && at !== section; at = at.parentElement) a *= Number(getComputedStyle(at).opacity)
      return a >= 0.6
    }
    const name = (el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')}`
    const surface = (el) => {
      const css = getComputedStyle(el)
      const filled = css.backgroundColor !== 'rgba(0, 0, 0, 0)' && css.backgroundColor !== 'transparent' && parseFloat(css.borderTopWidth) > 0
      // A shadow drawn in a see-through colour (a ring waiting to light) is no surface.
      const shadow = css.boxShadow !== 'none' && css.boxShadow.split(/,(?![^(]*\))/).some((one) => !/^\s*(rgba\(0, 0, 0, 0\)|transparent)/.test(one))
      return shadow || filled || el.matches('img, [data-picture]')
    }
    // Where it is seen: cut to every clipping box around it (a page scrolled under its own bar is not over the bar).
    const shown = (el) => {
      let r = el.getBoundingClientRect()
      r = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
      for (let at = el.parentElement; at && at !== section; at = at.parentElement) {
        const css = getComputedStyle(at)
        if (css.overflow === 'visible' && css.overflowX === 'visible' && css.overflowY === 'visible') continue
        const c = at.getBoundingClientRect()
        r = { left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) }
      }
      return r
    }
    const panels = [...section.querySelectorAll('*')].filter((el) => {
      const r = el.getBoundingClientRect()
      // Parts that belong on top of another (a picture's own bar) are left out.
      return r.width >= 80 && r.height >= 30 && r.bottom > 0 && r.top < innerHeight && !el.closest('[data-overlay]') && surface(el) && seen(el)
    })
    // Words a reader can see in it: text whose own element is not faded out.
    const shows = (el) => {
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let node = walk.nextNode(); node; node = walk.nextNode()) if (node.textContent.trim() && seen(node.parentElement) && getComputedStyle(node.parentElement).visibility !== 'hidden') return true
      return [...el.querySelectorAll('img, svg, canvas, video, [data-picture]')].some((one) => one.getBoundingClientRect().width > 16 && seen(one))
    }
    const empty = panels.filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width >= 120 && r.height >= 60 && !el.matches('img, [data-picture]') && !shows(el)
    }).map(name)
    const over = []
    for (const [i, a] of panels.entries()) {
      for (const b of panels.slice(i + 1)) {
        if (a.contains(b) || b.contains(a)) continue
        const [p, q] = [shown(a), shown(b)]
        const w = Math.min(p.right, q.right) - Math.max(p.left, q.left)
        const hh = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top)
        if (w > 4 && hh > 4) over.push(`${name(a)} over ${name(b)}`)
      }
    }
    return { empty, over }
  })
  // Words in the accent colour that nothing explains: only the words that shine (.mf-sheen), the app's own lit tokens
  // drawn as it draws them (a date read, an @ being typed: [data-accent-ok]; a kind's wash on its card: [data-wash]), a marker that says
  // what it marks ([data-accent-ok]) and the buttons may wear it. And thesis lines as they come, for their order.
  const marks = () => h.evaluate(() => {
    const root = document.querySelector('.mf-welcome main')
    if (!root) return { accent: [], thesis: [] }
    const probe = document.createElement('span')
    probe.style.color = 'var(--primary)'
    root.append(probe)
    const primary = getComputedStyle(probe).color
    probe.remove()
    const accent = new Set()
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      const el = node.parentElement
      if (!node.textContent.trim() || !el || el.closest('.mf-sheen, [data-accent-ok], [data-wash], button, [aria-hidden="true"], [data-overlay]')) continue
      const r = el.getBoundingClientRect()
      if (!r.width) continue
      if (getComputedStyle(el).color === primary) accent.add(el.innerText.trim().slice(0, 60))
    }
    const thesis = [...root.querySelectorAll('[data-thesis]')].filter((el) => {
      let a = 1
      for (let at = el; at && at !== root; at = at.parentElement) a *= Number(getComputedStyle(at).opacity)
      return a > 0.6 && el.innerText.trim()
    }).map((el) => el.dataset.thesis)
    return { accent: [...accent], thesis }
  })
  // A line that opens on a bare time of day and a stop reads as a greeting ("Evening. You read it..."): none may.
  const SALUTE = /^(good )?(morning|evening|afternoon|night|tonight|midday|noon|lunchtime|between classes)\s*[.!]/i
  const salutes = new Set()
  const accents = new Set()
  let thesisOrder = []
  let empties = 0
  let overs = 0
  const early = []
  const unready = []
  const blankCaps = []
  let sheenCaps = 0
  {
    const fake = await h.evaluate(() => {
      const section = [...document.querySelectorAll('.mf-welcome main section')].pop()
      const el = document.createElement('div')
      el.id = 'qa-fake-panel'
      el.style.cssText = 'position:fixed;left:40%;top:40%;width:200px;height:100px;box-shadow:0 1px 4px black;background:white;border:1px solid gray'
      const twin = el.cloneNode()
      twin.id = 'qa-fake-twin'
      twin.textContent = 'words'
      twin.style.left = '42%'
      section?.append(el, twin)
      return !!section
    })
    const caught = fake ? await layout() : { empty: [], over: [] }
    await h.evaluate(() => (document.getElementById('qa-fake-panel')?.remove(), document.getElementById('qa-fake-twin')?.remove()))
    const works = caught.empty.length > 0 && caught.over.length > 0
    console.log(`${works ? 'ok' : 'BROKEN'}: the empty-frame and overlap checks catch a made-up empty panel over another`)
    if (!works) failed++
  }
  const steps = ['Hello', 'Why', 'You', 'Catch', 'Write', 'The flow', 'Become', 'A day', 'Connect', 'Return', 'Make it yours']
  for (let at = 0; at < steps.length; at++) {
    const seen = new Map()
    // When the words last changed, how long they take to read, and whether the stage moved meanwhile.
    let said = null
    const busy = []
    const empty = new Set()
    const over = new Set()
    const overSince = new Map()
    const start = Date.now()
    let doneFor = 0
    let earlyFor = 0
    let shot = 0
    for (;;) {
      const t = Date.now() - start
      const m = await marks()
      m.accent.forEach((one) => accents.add(`${steps[at]}: ${one}`))
      for (const one of m.thesis) if (!thesisOrder.includes(one)) thesisOrder.push(one)
      for (const one of await sample()) {
        if (SALUTE.test(one.text)) salutes.add(`${steps[at]}: ${one.text.slice(0, 60)}`)
        const was = seen.get(one.text)
        if (was) (was.last = t, (was.size = Math.min(was.size, one.size)))
        else seen.set(one.text, { ...one, first: t, last: t })
      }
      const now = await focus()
      if (now.words && now.words !== said?.words) {
        // Only the words not read yet count; a page's first words have been up since it arrived, 700ms before this step's first look.
        // The words it shares with what was up before (the headline, kept) were read already.
        const [was, is] = [(said?.words ?? '').split(' '), now.words.split(' ')]
        let same = 0
        while (same < was.length && was[same] === is[same]) same++
        const fresh = is.slice(same).join(' ')
        said = { words: now.words, at: said ? t : t - 700, read: Math.max(1200, (fresh.trim().split(/\s+/).length * 60000) / 400), stage: null }
      }
      else if (said && t > said.at + 500 && t < said.at + said.read - 600) {
        // Let the page settle in for half a second, then the stage must hold still until the words are skimmed
        // (a headline and its line: about 400 words a minute, at least 1.2s; welcome-reel.tsx, leadMs), less
        // 600ms for this loop's own sampling (a look takes 100-300ms on a busy machine).
        if (said.stage === null) said.stage = now.stage
        else if (now.stage !== said.stage && !busy.includes(said.words)) {
          busy.push(said.words)
          // What moved, for whoever fixes it.
          const [a, b] = [said.stage.split(';'), now.stage.split(';')]
          const i = a.findIndex((one, k) => one !== b[k])
          console.log(`   moved at ${t - said.at}ms: ${a[i]} -> ${b[i]}`)
        }
      }
      const parts = await layout()
      parts.empty.forEach((one) => empty.add(one))
      for (const one of parts.over) {
        overSince.set(one, overSince.get(one) ?? t)
        if (t - overSince.get(one) >= 1000) over.add(one)
      }
      for (const one of overSince.keys()) if (!parts.over.includes(one)) overSince.delete(one)
      const done = await h.evaluate(() => [...document.querySelectorAll('.mf-welcome [data-reel]')].every((el) => el.dataset.reel === 'done'))
      doneFor = done ? doneFor + 1 : 0
      // Next says whether the page still plays: never ready while it does (two looks in a row, so a hand-over between parts is not counted).
      const ready = await h.evaluate(() => document.querySelector('.mf-welcome footer [data-next]')?.hasAttribute('data-ready') ?? null)
      earlyFor = ready === true && !done ? earlyFor + 1 : 0
      if (earlyFor === 2) (early.push(steps[at]), console.log(`   READY while still playing, at ${t}ms`))
      if (SHOTS && t > shot * 4000) await h.screenshot({ path: `${SHOTS}/${String(at).padStart(2, '0')}-${steps[at].replace(/\W+/g, '-').toLowerCase()}-${shot++}.png` })
      if (doneFor > 12 || t > 150000) break
      await h.waitForTimeout(120)
    }
    const end = Date.now() - start
    // Played to its end: Next is ready, waiting for the reader.
    const readyAtEnd = await h.evaluate(() => document.querySelector('.mf-welcome footer [data-next]')?.hasAttribute('data-ready') ?? true)
    if (!readyAtEnd) (unready.push(steps[at]), console.log('   NOT READY at the end'))
    // Keys inside shining words keep their own glyph colour, readable on their cap (the shine clears the fill of its own letters only).
    const caps = await h.evaluate(() => {
      const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
      const rgba = (css) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data] }
      const over = (top, under) => top.slice(0, 3).map((v, i) => (v * top[3] + under[i] * (255 - top[3])) / 255)
      const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
      const page = rgba(getComputedStyle(document.body).backgroundColor)
      return [...document.querySelectorAll('.mf-sheen kbd')].filter((el) => el.getBoundingClientRect().width > 0).map((el) => {
        const st = getComputedStyle(el)
        const fill = rgba(st.webkitTextFillColor)
        const cap = over(rgba(st.backgroundColor), page)
        const ink = over(fill, cap)
        const [l1, l2] = [lum(ink), lum(cap)].sort((x, y) => y - x)
        return { key: el.innerText || '(icon)', clear: fill[3] === 0, ratio: Math.round(((l1 + 0.05) / (l2 + 0.05)) * 10) / 10 }
      })
    })
    sheenCaps += caps.length
    for (const one of caps) if (one.clear || one.ratio < 3) (blankCaps.push(`${steps[at]}: ${one.key} ${one.clear ? 'clear' : one.ratio}`), console.log(`   KEY BLANK in shining words: ${one.key}, contrast ${one.ratio}`))
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/${String(at).padStart(2, '0')}-${steps[at].replace(/\W+/g, '-').toLowerCase()}-end.png` })
    const texts = [...seen.keys()]
    for (const one of seen.values()) {
      // A line still being typed: the whole line it grows into is the one to read.
      if (texts.some((other) => other !== one.text && other.length > one.text.length && other.startsWith(one.text))) continue
      const words = one.text.split(/\s+/).length
      const up = one.last - one.first
      // Still up at the end: it waits for the reader.
      const held = end - one.last < 400
      const short = !held && up + 150 < needed(words)
      rows.push({ step: steps[at], text: one.text, words, upMs: up, needMs: Math.round(needed(words)), held, size: one.size, short })
    }
    console.log(`-- ${steps[at]}: played ${Math.round(end / 100) / 10}s${busy.length ? `; the stage moved while these were being read: ${busy.map((one) => `“${one.slice(0, 50)}”`).join(', ')}` : ''}`)
    moved += busy.length
    for (const one of empty) console.log(`   EMPTY frame: ${one}`)
    for (const one of over) console.log(`   OVERLAP: ${one}`)
    empties += empty.size
    overs += over.size
    // On: Next, or past Your turn without trying it.
    const chapter = () => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
    const was = await chapter()
    const skip = await h.$('footer button:has-text("Skip trying it")')
    if (skip) await skip.click()
    else await h.click('footer button:has-text("Next"), footer button:has-text("Show me")')
    await h.waitForTimeout(700)
    // A page told in parts that waited for the press (A day's comparisons, then its day): the same step again, its next part.
    if (at > 0 && (await chapter()) === was) at--
  }
  const shorts = rows.filter((one) => one.short)
  const small = rows.filter((one) => one.size < 13)
  for (const one of rows) console.log(`${one.short ? 'SHORT' : one.size < 13 ? 'SMALL' : 'ok   '} ${one.step.padEnd(13)} ${String(one.words).padStart(3)}w up ${one.held ? 'held ' : `${(one.upMs / 1000).toFixed(1)}s`} need ${(one.needMs / 1000).toFixed(1)}s ${one.size}px  ${one.text.slice(0, 90)}`)
  console.log(`\n${rows.length} lines; ${shorts.length} gone before they could be read; ${small.length} under 13px`)
  if (OUT) writeFileSync(OUT, JSON.stringify(rows, null, 1))
  // What fails: a line of the welcome's own words (its titles, step lines, comparisons; 19px and up)
  // leaving before it can be read. Smaller words inside the moving pictures are listed, not failed.
  const lost = shorts.filter((one) => one.size >= 19)
  console.log(`${lost.length} of the welcome's own lines (19px and up) gone before they could be read`)
  console.log(`${moved} times the stage moved while its headline was still being read`)
  console.log(`${empties} empty demo frames, ${overs} demo parts over one another`)
  // Why comes first after the opening, and tells its story in order: the line, the three gaps, the answer, then what the picture means.
  const want = ['line', 'gap-0', 'gap-1', 'gap-2', 'answer', 'split']
  const thesisOk = steps[1] === 'Why' && want.every((one, i) => thesisOrder[i] === one)
  console.log(`${thesisOk ? 'ok' : 'FAIL'}: the thesis screen is the first chapter and shows its lines in order (${thesisOrder.join(' > ')})`)
  for (const one of accents) console.log(`   ACCENT, unexplained: ${one}`)
  console.log(`${accents.size} words in the accent colour that nothing explains`)
  for (const one of salutes) console.log(`   GREETING-LIKE: ${one}`)
  console.log(`${salutes.size} lines that open on a bare time of day`)
  failed += (thesisOk ? 0 : 1) + accents.size + salutes.size
  console.log(`${unready.length} steps not ready at their end${unready.length ? ` (${unready.join(', ')})` : ''}; ${early.length} ready while still playing${early.length ? ` (${early.join(', ')})` : ''}`)
  console.log(`${sheenCaps} keys seen inside shining words, ${blankCaps.length} blank or hard to read${blankCaps.length ? ` (${blankCaps.join(', ')})` : ''}`)
  if (!sheenCaps) (failed++, console.log('BROKEN: no key inside shining words was seen, so the key check checked nothing'))
  failed += blankCaps.length
  failed += lost.length + moved + empties + overs + unready.length + early.length
} finally {
  if (c.errors.length) console.log(c.errors.join('\n'))
  await c.close()
}
process.exit(failed ? 1 : 0)

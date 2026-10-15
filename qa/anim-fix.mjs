// The animation review's main fixes, in the built app: what a key reaches
// shows no in-between frame (Review grading by 1 to 4, Recap pages, ⌘K's
// preview as you type, a Bin row restored by Enter); a click's answer is done
// inside its budget (a grade by click, the capture beam, a sticky's tick); no
// ease-in in the stylesheets or in any animation played; Motion off and
// Reduce motion leave nothing moving, Brutal's buttons included; Radix menus
// fade out on close.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/anim-fix.mjs [shots]
import { sandbox } from './sandbox-lib.mjs'

const shots = process.argv[2]
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1300, height: 860 })
const { h, go, v } = c

// Part way: the element or any parent up to the page (or a dialog) half faded,
// or moved or scaled off its place.
await h.evaluate(() => {
  window.__part = (el) => {
    let o = 1
    for (let at = el; at && at !== document.body && !at.matches('[role="main"], [role="dialog"], [aria-label="Recap"]'); at = at.parentElement) {
      const style = getComputedStyle(at)
      o *= Number(style.opacity)
      const t = style.transform
      if (t !== 'none' && !new DOMMatrix(t).isIdentity) return ((window.__why = `${at.tagName}.${String(at.className).slice(0, 30)} ${t}`), true)
    }
    return o > 0.02 && o < 0.98 && ((window.__why = `opacity ${o}`), true)
  }
})

// Every animation played from here on, with its easing (WAAPI and Motion's own).
await h.evaluate(() => {
  window.__eases = []
  const animate = Element.prototype.animate
  Element.prototype.animate = function (frames, options) {
    const list = Array.isArray(frames) ? frames : []
    window.__eases.push([typeof options === 'object' ? options?.easing : undefined, ...list.map((one) => one?.easing)].filter(Boolean).join(' | '))
    return animate.call(this, frames, options)
  }
})

/**
 * Samples every frame for `ms` and counts the frames in which something
 * matching `selector` is part way: opacity between 0 and 1, or a transform
 * that is not at rest. Starts with `act` (a key press) run in the page.
 */
const between = (selector, ms) => h.evaluate(([sel, wait]) => new Promise((done) => {
  const start = performance.now()
  let frames = 0
  let seen = 0
  // How each element looks on each frame (its own and its parents' opacity and
  // transform, up to the page). Simply there means at most two looks, before
  // and after; a third is a frame in between.
  const looks = new Map()
  const look = (el) => {
    const parts = []
    for (let at = el; at && at !== document.body && !at.matches('[role="main"], [role="dialog"], [aria-label="Recap"]'); at = at.parentElement) {
      const style = getComputedStyle(at)
      parts.push(`${Number(style.opacity).toFixed(2)} ${style.transform}`)
    }
    return parts.join('|')
  }
  const step = () => {
    seen++
    for (const el of document.querySelectorAll(sel)) {
      const all = looks.get(el) ?? new Set()
      all.add(look(el))
      looks.set(el, all)
    }
    if (performance.now() - start < wait) requestAnimationFrame(step)
    else {
      const moved = [...looks].filter(([, all]) => all.size > 2)
      frames = moved.reduce((n, [, all]) => n + all.size - 2, 0)
      done(frames ? { frames, seen, what: `${moved[0][0].tagName}:${(moved[0][0].textContent ?? '').slice(0, 24)} ${[...moved[0][1]].slice(1, 2).join('')}`.slice(0, 160) } : { frames, seen })
    }
  }
  requestAnimationFrame(step)
}), [selector, ms])

/** How long until nothing matching `selector` is part way, in ms (sampled each frame). */
const settles = (selector, ms) => h.evaluate(([sel, wait]) => new Promise((done) => {
  const start = performance.now()
  let last = 0
  const part = window.__part
  const step = () => {
    const now = performance.now()
    if ([...document.querySelectorAll(sel)].some(part)) last = now - start
    if (now - start < wait) requestAnimationFrame(step)
    else done(Math.round(last))
  }
  requestAnimationFrame(step)
}), [selector, ms])

/** Finite animations running now anywhere in the window (infinite scenery left out). */
const moving = () => h.evaluate(() => document.getAnimations().filter((a) => {
  if (a.playState !== 'running') return false
  const timing = a.effect?.getComputedTiming?.()
  return timing && timing.iterations !== Infinity && Number(timing.duration) > 0
}).map((a) => `${a.animationName ?? a.constructor.name}@${a.effect?.target?.className?.toString?.().slice(0, 40) ?? ''}`))

/** A rule with an ease-in curve: `ease-in`, or a cubic-bezier that starts flat and ends below its target. */
const easeInRules = () => h.evaluate(() => {
  const bad = []
  const easeIn = (text) => /\bease-in\b(?!-out)/.test(text) || [...text.matchAll(/cubic-bezier\(\s*([\d.]+)\s*,\s*([\d.-]+)\s*,\s*([\d.]+)\s*,\s*([\d.-]+)\s*\)/g)].some(([, x1, y1, , y2]) => Number(y1) <= 0.05 && Number(x1) >= 0.3 && Number(y2) < 0.6)
  const walk = (rules) => {
    for (const rule of rules) {
      if (rule.cssRules) walk(rule.cssRules)
      const text = rule.style ? `${rule.style.transitionTimingFunction} ${rule.style.animationTimingFunction} ${rule.style.transition} ${rule.style.animation}` : ''
      if (text && easeIn(text)) bad.push(rule.cssText.slice(0, 120))
    }
  }
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules) } catch {}
  }
  return bad
})

try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: true, rotCount: 0 })
  await v('onboarding:set', { pageHints: false })
  await go('home')
  await h.mouse.click(600, 400)

  // ---- What a key reaches: no frame in between ----
  await go('review')
  await h.waitForTimeout(800)
  await h.keyboard.press('Space')
  await h.waitForTimeout(500)
  const grading = between('[role="main"] h2', 400)
  await h.keyboard.press('3')
  const graded = await grading
  check('Review: a card graded with 3 has no in-between frame', graded.frames === 0, JSON.stringify(graded))

  // By a click: the next card arrives within the 300ms budget.
  await h.keyboard.press('Space')
  await h.waitForTimeout(500)
  const button = h.locator('button', { hasText: 'Good' }).first()
  if (await button.count()) {
    const box = await button.boundingBox()
    await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    const took = settles('[role="main"] h2', 800)
    await h.mouse.down()
    await h.mouse.up()
    const ms = await took
    check('Review: a card graded by a click settles within 300ms', ms <= 300, `${ms}ms`)
  } else check('Review: a card graded by a click settles within 300ms', false, 'no Good button')

  // ⌘K: the empty-result pane does not re-fade as you type.
  await h.mouse.click(600, 400)
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(400)
  await h.keyboard.type('zqxv', { delay: 30 })
  await h.waitForTimeout(400)
  // Each keystroke: in the next frames, nothing in the preview half fades in again
  // (the "Searching…" mark is a state of its own and may).
  const typing = h.evaluate(() => new Promise((done) => {
    const start = performance.now()
    const found = new Set()
    let pane = 0
    const step = () => {
      const dialog = document.querySelector('[role="dialog"]')
      if ([...(dialog?.querySelectorAll('p') ?? [])].some((p) => p.textContent?.startsWith('Nothing called that yet.'))) pane++
      for (const a of dialog?.getAnimations({ subtree: true }) ?? []) {
        const el = a.effect?.target
        if (a.playState === 'running' && a.animationName === 'enter' && !el?.textContent?.includes('Searching')) found.add(el.textContent.slice(0, 30))
      }
      if (performance.now() - start < 900) requestAnimationFrame(step)
      else done({ pane, fading: [...found] })
    }
    requestAnimationFrame(step)
  }))
  for (const ch of 'wkj') (await h.keyboard.type(ch), await h.waitForTimeout(150))
  const fading = await typing
  check('⌘K: typing does not re-fade the preview', fading.pane > 0 && fading.fading.length === 0, JSON.stringify(fading))
  // Arrows over the actions: the action line is simply there.
  await h.keyboard.press('Meta+a')
  await h.keyboard.press('Backspace')
  await h.waitForTimeout(300)
  await h.keyboard.type('new')
  await h.waitForTimeout(500)
  // Down through the list, counting frames where an action's line is half there.
  const lines = h.evaluate(() => new Promise((done) => {
    const start = performance.now()
    let frames = 0
    let shown = 0
    const step = () => {
      const all = [...document.querySelectorAll('[data-action-line]')]
      if (all.length) shown++
      if (all.some((el) => el.getAnimations().some((a) => a.playState === 'running'))) frames++
      if (performance.now() - start < 1600) requestAnimationFrame(step)
      else done({ frames, shown })
    }
    requestAnimationFrame(step)
  }))
  for (let i = 0; i < 6; i++) (await h.keyboard.press('ArrowDown'), await h.waitForTimeout(200))
  const stepped = await lines
  check('⌘K: ↑↓ over the actions shows no in-between frame', stepped.shown > 0 && stepped.frames === 0, JSON.stringify(stepped))
  await h.keyboard.press('Escape')
  await h.waitForTimeout(400)

  // Recap: a page turned by → is simply there.
  await c.send('recap', 'year')
  await h.waitForTimeout(1500)
  const turning = between('[aria-label="Recap"] .font-heading.w-full', 500)
  await h.keyboard.press('ArrowRight')
  const turned = await turning
  const pages = await h.locator('[aria-label="Recap"] .font-heading.w-full').count()
  check('Recap: a page turned by → shows no in-between frame', turned.frames === 0 && pages === 1, `${JSON.stringify(turned)} pages ${pages}`)
  if (shots) await h.screenshot({ path: `${shots}/recap-turned.png` })
  await h.keyboard.press('Escape')
  await h.waitForTimeout(500)

  // Bin: a row restored with Enter goes at once.
  await go('discarded')
  await h.waitForTimeout(800)
  const rows = await h.locator('[data-bin-row]').count()
  if (rows) {
    await h.locator('[data-bin-row]').first().hover()
    await h.keyboard.press('j')
    await h.keyboard.press('k')
    const restoring = between('[data-bin-row]', 700)
    await h.keyboard.press('Enter')
    const restored = await restoring
    check('Bin: a row restored with Enter shows no in-between frame', restored.frames === 0, `${JSON.stringify(restored)} rows ${rows} -> ${await h.locator('[data-bin-row]').count()}`)
  } else check('Bin: a row restored with Enter shows no in-between frame', false, 'no rows in the Bin')

  // ---- A click's answer, within budget ----
  const budget = await h.evaluate(() => {
    const read = (html) => {
      const holder = document.createElement('div')
      holder.innerHTML = html
      document.body.append(holder)
      const el = holder.firstElementChild
      const s = getComputedStyle(el)
      const out = { duration: parseFloat(s.animationDuration) * (s.animationDuration.endsWith('ms') ? 1 : 1000), easing: s.animationTimingFunction }
      holder.remove()
      return out
    }
    return {
      beam: read('<div class="mf-beam" data-beam="success"></div>'),
      glint: read('<div class="mf-sticky-glint"></div>')
    }
  })
  check('The capture beam is a short confirmation (at most 400ms)', budget.beam.duration > 0 && budget.beam.duration <= 400, JSON.stringify(budget.beam))
  check("A sticky's tick glint is under 300ms", budget.glint.duration > 0 && budget.glint.duration <= 300, JSON.stringify(budget.glint))

  // ---- Menus fade out on close ----
  await go('home')
  await h.waitForTimeout(600)
  const row = h.locator('aside nav button[data-side-row]').first()
  await row.click({ button: 'right' })
  await h.waitForTimeout(400)
  // Each frame until the menu is closing (or gone): what it plays as it goes.
  const closing = h.evaluate(() => new Promise((done) => {
    let tries = 0
    const step = () => {
      const menu = document.querySelector('[role="menu"]')
      if (!menu) return done([])
      if (menu.getAttribute('data-state') === 'closed') return done(menu.getAnimations().map((a) => `${a.animationName}:${a.effect.getComputedTiming().duration}`))
      if (++tries > 120) return done(null)
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }))
  // Put away by the pointer (a key puts it away at once, as it opens by one).
  await h.mouse.click(650, 16)
  const fade = await closing
  check('A right-click menu fades out on close (60ms)', Array.isArray(fade) && fade.some((one) => one.startsWith('exit:') && Number(one.split(':')[1]) <= 80), JSON.stringify(fade))
  // The first frame the menu is there: nothing about it is moving.
  const opening = h.evaluate(() => new Promise((done) => {
    let tries = 0
    const step = () => {
      const menu = document.querySelector('[role="menu"][data-state="open"]')
      if (menu) return done(menu.getAnimations({ subtree: true }).filter((a) => a.playState === 'running' && a.timeline === document.timeline).map((a) => `${a.animationName ?? a.constructor.name}@${String(a.effect?.target?.className).slice(0, 30)}`))
      if (++tries > 120) return done(-1)
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }))
  await h.waitForTimeout(400)
  await row.click({ button: 'right' })
  const opens = await opening
  check('…and opens at once', Array.isArray(opens) && opens.length === 0, JSON.stringify(opens))
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)

  // ---- No ease-in ----
  const rules = await easeInRules()
  check('No ease-in curve in any stylesheet', rules.length === 0, `${rules.length}: ${rules.slice(0, 3).join(' || ')}`)
  const played = await h.evaluate(() => window.__eases.filter((one) => /\bease-in\b(?!-out)/.test(one) || /cubic-bezier\(0\.4, 0, 1, 1\)|cubic-bezier\(0\.7, 0, 0\.84, 0\)/.test(one)))
  check('No animation played with an ease-in', played.length === 0, played.slice(0, 3).join(' || '))

  // ---- Motion off: nothing moves, Brutal included ----
  await v('settings:set', { motion: false })
  await h.waitForTimeout(400)
  await h.evaluate(() => (document.documentElement.dataset.style = 'brutal'))
  await h.waitForTimeout(200)
  const timed = await h.evaluate(() => [...document.querySelectorAll('button, a, [role="button"]')].filter((el) => getComputedStyle(el).transitionDuration.split(',').some((d) => parseFloat(d) > 0)).length)
  check('Motion off: no button keeps a transition (Brutal style)', timed === 0, `${timed} with a transition`)
  await go('review')
  await h.waitForTimeout(150)
  const offMoving = await moving()
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(60)
  const offMoving2 = await moving()
  await h.keyboard.press('Escape')
  check('Motion off: nothing is moving after a page change and ⌘K', offMoving.length + offMoving2.length === 0, [...offMoving, ...offMoving2].slice(0, 4).join(', '))
  await h.evaluate(() => delete document.documentElement.dataset.style)

  // ---- Reduce motion: nothing slides or grows (fades may stay) ----
  await v('settings:set', { motion: true })
  await h.emulateMedia({ reducedMotion: 'reduce' })
  await h.waitForTimeout(300)
  await h.evaluate(() => (window.__moves = []))
  await h.evaluate(() => {
    window.__moveWatch = setInterval(() => {
      for (const a of document.getAnimations()) {
        if (a.playState !== 'running') continue
        const frames = a.effect?.getKeyframes?.() ?? []
        // Each keyframe's transform as a matrix (one that cannot be read counts as a move).
        const at = (one) => { try { return new DOMMatrix(one ?? 'none').toString() } catch { return `?${one}` } }
        const t = [...new Set(frames.map((f) => f.transform).filter(Boolean).map(at))]
        const timing = a.effect?.getComputedTiming?.()
        if (t.length > 1 && timing?.iterations !== Infinity) window.__moves.push(`${t.join(' > ').slice(0, 60)}@${a.effect?.target?.className?.toString?.().slice(0, 30) ?? ''}`)
      }
    }, 16)
  })
  await go('review')
  await h.waitForTimeout(500)
  await h.keyboard.press('Space')
  await h.waitForTimeout(300)
  const good = h.locator('button', { hasText: 'Good' }).first()
  if (await good.count()) await good.click()
  await h.waitForTimeout(400)
  await h.mouse.click(600, 400)
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(300)
  await h.keyboard.press('Escape')
  await c.send('recap', 'year')
  await h.waitForTimeout(1200)
  await h.mouse.click(1000, 500)
  await h.waitForTimeout(500)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)
  const moves = await h.evaluate(() => (clearInterval(window.__moveWatch), [...new Set(window.__moves)]))
  check('Reduce motion: nothing slides or grows on a transform', moves.length === 0, moves.slice(0, 4).join(' || '))
  await h.emulateMedia({ reducedMotion: 'no-preference' })

  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.slice(0, 2).join(' | '))
} finally {
  await c.close()
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)

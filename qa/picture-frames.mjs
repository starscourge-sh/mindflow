// A row's picture in the first frame the row is seen. `pictureWatch` starts a watch in the page, before an act that
// draws rows (a glance opening, a list's first draw), reading every frame the page draws (requestAnimationFrame) for
// `ms`: each row, the first frame it is seen (in the page and not hidden, as a page holding its first paint keeps it),
// with every picture drawn in it then (its own, a paper drawing, a file's face): loaded, its opacity, and whether a fade
// is running on it. `pictureVerdict` reads the rows again at rest and names each row whose picture was not there,
// whole, at its resting look, in that first frame: a still square waiting, a picture not loaded, or one fading in.
// Shared by qa/box-glance.mjs (PART=first) and qa/list-pictures.mjs.

export async function pictureWatch(page, rows, ms = 1500) {
  await page.evaluate(({ rows, ms }) => {
    const seen = {}
    let frames = 0
    const from = performance.now()
    // A row by its note (a list's row, a board's card, a tag's entry), or by its words (a grid's tile).
    const keyOf = (row) => row.dataset.id ?? row.dataset.sortableId ?? row.querySelector('[data-pick]')?.dataset.pick ?? row.closest('[data-id]')?.dataset.id ?? row.getAttribute('aria-label') ?? row.textContent.trim().slice(0, 40)
    window.__pictureRows = { rows, keyOf }
    const fading = (el, top) => {
      for (let at = el; at && at !== top.parentElement; at = at.parentElement)
        if (at.getAnimations().some((one) => one.playState === 'running' && JSON.stringify(one.effect?.getKeyframes?.() ?? []).includes('opacity'))) return true
      return false
    }
    // A picture by its file's name, or a data: one by its start and end.
    const name = (img) => { const src = img.getAttribute('src') ?? ''; return src.startsWith('data:') ? `${src.slice(0, 24)}…${src.slice(-16)}` : src.split('/').pop() }
    const look = () => {
      frames++
      for (const row of document.querySelectorAll(rows)) {
        const key = keyOf(row)
        if (!key || seen[key] || !row.checkVisibility({ visibilityProperty: true })) continue
        seen[key] = {
          at: Math.round(performance.now() - from),
          coming: !!row.querySelector('[data-picture-coming]'),
          pictures: [...row.querySelectorAll('img')].filter((img) => img.checkVisibility({ visibilityProperty: true })).map((img) => ({
            src: name(img),
            loaded: img.complete && img.naturalWidth > 0,
            opacity: Number(getComputedStyle(img).opacity),
            fading: fading(img, row)
          }))
        }
      }
      if (performance.now() - from < ms) requestAnimationFrame(look)
      else window.__pictureSeen = { seen, frames }
    }
    window.__pictureSeen = null
    // The press, as the page heard it: how long from it to the rows' first frame.
    window.__picturePress = null
    addEventListener('pointerdown', () => (window.__picturePress ??= performance.now() - from), { capture: true, once: true })
    requestAnimationFrame(look)
  }, { rows, ms })
  return rows
}

export async function pictureVerdict(page) {
  await page.waitForFunction(() => window.__pictureSeen, null, { timeout: 10_000 })
  return page.evaluate(() => {
    const { seen, frames } = window.__pictureSeen
    const late = []
    let pictured = 0
    const { rows, keyOf } = window.__pictureRows
    for (const [key, first] of Object.entries(seen)) {
      const row = [...document.querySelectorAll(rows)].find((one) => keyOf(one) === key)
      const name = (img) => { const src = img.getAttribute('src') ?? ''; return src.startsWith('data:') ? `${src.slice(0, 24)}…${src.slice(-16)}` : src.split('/').pop() }
      const rest = row ? [...row.querySelectorAll('img')].filter((img) => img.checkVisibility({ visibilityProperty: true })).map((img) => ({ src: name(img), opacity: Number(getComputedStyle(img).opacity) })) : []
      if (!rest.length && !first.pictures.length && !first.coming) continue
      pictured++
      const wrong = []
      if (first.coming) wrong.push('a still square waiting')
      for (const one of rest) {
        const then = first.pictures.find((was) => was.src === one.src)
        if (!then) wrong.push('not drawn yet')
        else if (!then.loaded) wrong.push('not loaded')
        else if (then.fading || Math.abs(then.opacity - one.opacity) > 0.01) wrong.push(`opacity ${then.opacity} of ${one.opacity}${then.fading ? ', fading in' : ''}`)
      }
      if (wrong.length) late.push({ row: key.slice(0, 12), at: first.at, wrong: [...new Set(wrong)].join(', '), src: rest[0]?.src ?? '' })
    }
    const first = Math.min(...Object.values(seen).map((one) => one.at))
    const press = window.__picturePress
    return { rows: Object.keys(seen).length, pictured, late, frames, shownAfter: press === null || !Number.isFinite(first) ? null : Math.round(first - press) }
  })
}

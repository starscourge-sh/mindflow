// The measure the final pass runs in any window (qa/final-outside.mjs): what is
// on show, read off the page, and each fault found in it.
//  - clip: text cut short (ellipsis or hidden overflow) where the whole of it
//    is not given another way (a title, an aria-label, or a tip on hover)
//  - poke: a child past its scroll container's side, or the page scrolling sideways
//  - wrap: a button, tab, chip or menu line whose own words wrap onto a second line
//  - small: a control on show less than 24 pixels to press either way
// Pass `measure` to page.evaluate; it returns a list of { kind, what, detail }.

export function measure(options = {}) {
  const MIN = options.min ?? 24
  const faults = []
  const say = (el) => {
    const label = el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent.trim().replace(/\s+/g, ' ')
    const tag = el.tagName.toLowerCase()
    const data = [...el.attributes].filter((a) => a.name.startsWith('data-') && !a.name.startsWith('data-state') && !a.name.startsWith('data-slot')).map((a) => a.name.slice(5)).slice(0, 2).join(',')
    return `${tag}${data ? `[${data}]` : ''} "${label.slice(0, 50)}"`
  }
  const seen = (el) => {
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false
    // Inside a scroller, only what is scrolled into view.
    for (let up = el.parentElement; up; up = up.parentElement) {
      const s = getComputedStyle(up)
      if (/(auto|scroll|hidden|clip)/.test(s.overflowY + s.overflowX)) {
        const b = up.getBoundingClientRect()
        if (r.bottom <= b.top + 1 || r.top >= b.bottom - 1 || r.right <= b.left + 1 || r.left >= b.right - 1) return false
      }
    }
    // Faded right out by an ancestor (a fold, an exit), not on show.
    for (let up = el; up; up = up.parentElement) if (Number(getComputedStyle(up).opacity) < 0.05) return false
    return true
  }
  // The editor and its block handle belong to the editor's own pass; the box's
  // window dots are drawn at the Mac's own size (12 to 14 pixels), as Raycast's are.
  const inEditor = (el) => !!el.closest('[contenteditable="true"], .ProseMirror, [aria-hidden="true"], [inert], .excalidraw, .tiptap-drag-handle, .mf-dots')
  // `root`: only this part of the page (Settings' own pane, not the sidebar round it).
  const scope = (options.root && document.querySelector(options.root)) || document.body
  const all = [...scope.querySelectorAll('*')]

  // --- clip
  for (const el of all) {
    if (inEditor(el)) continue
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (!own) continue
    const s = getComputedStyle(el)
    const clips = s.textOverflow === 'ellipsis' || /(hidden|clip)/.test(s.overflowX) || s.webkitLineClamp !== 'none'
    if (!clips) continue
    // Words kept for a screen reader only (sr-only): a 1px box on purpose.
    if (el.clientWidth <= 2 || el.closest('.sr-only')) continue
    const wide = el.scrollWidth > el.clientWidth + 1
    const tall = s.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 1
    // A preview held to two or more lines (a row's first words) is cut on purpose; one line cut short is not.
    if (!wide && (!tall || Number(s.webkitLineClamp) >= 2)) continue
    if (!seen(el)) continue
    // The whole of it given another way: a title or label holding it, or a tip.
    const text = el.textContent.trim()
    const told = (one) => one && [one.getAttribute('title'), one.getAttribute('aria-label'), one.getAttribute('data-full')].some((t) => t && t.length >= text.length - 1)
    let given = false
    for (let up = el, i = 0; up && i < 4; up = up.parentElement, i++) if (told(up) || up.hasAttribute('data-tip-full')) given = true
    if (given) continue
    faults.push({ kind: 'clip', what: say(el), detail: `${el.scrollWidth}>${el.clientWidth}${tall ? ` tall ${el.scrollHeight}>${el.clientHeight}` : ''}` })
  }

  // --- poke: sideways overflow of a scroller, or of the page
  if (!options.root && document.documentElement.scrollWidth > innerWidth + 1) faults.push({ kind: 'poke', what: 'the page', detail: `${document.documentElement.scrollWidth}>${innerWidth}` })
  for (const el of all) {
    if (inEditor(el)) continue
    const s = getComputedStyle(el)
    if (!/(auto|scroll)/.test(s.overflowY) || /(auto|scroll)/.test(s.overflowX)) continue
    if (el.scrollHeight <= el.clientHeight && s.overflowX !== 'hidden' && s.overflowX !== 'clip') continue
    if (!seen(el)) continue
    const b = el.getBoundingClientRect()
    for (const kid of el.querySelectorAll('button, a[href], input, [role=tab], [role=menuitem], [role=option], img, p, h1, h2, h3, span')) {
      if (inEditor(kid) || !seen(kid)) continue
      const k = kid.getBoundingClientRect()
      if (k.right > b.right + 2 || k.left < b.left - 2) {
        // Only the outermost of a run: the child that itself sticks out, not each inside it.
        const up = kid.parentElement?.closest('button, a[href], [role=tab], [role=menuitem], p, h1, h2, h3, span')
        if (up && el.contains(up) && up !== el && (up.getBoundingClientRect().right > b.right + 2 || up.getBoundingClientRect().left < b.left - 2)) continue
        faults.push({ kind: 'poke', what: say(kid), detail: `${Math.round(k.left)}..${Math.round(k.right)} outside ${Math.round(b.left)}..${Math.round(b.right)} of ${say(el)}` })
      }
    }
  }

  // --- wrap and small: the controls
  const controls = scope.querySelectorAll('button, a[href], [role=button], [role=tab], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=option], [role=switch], [role=checkbox], [role=radio], input:not([type=hidden]), select, [data-chip]')
  for (const el of controls) {
    // The note's outline ticks belong to the editor (another pass): left to it.
    if (inEditor(el) || !seen(el) || el.closest('.tiptap-toc, [data-settings-contents]') && el.hasAttribute('data-level')) continue
    if (el.disabled && el.getAttribute('aria-hidden')) continue
    const r = el.getBoundingClientRect()
    // A control that is a whole row or card (a title over a line) is meant to take lines.
    const block = [...el.querySelectorAll('*')].some((one) => ['block', 'flex', 'grid', 'list-item'].includes(getComputedStyle(one).display) && one.textContent.trim() && one.getBoundingClientRect().width > r.width * 0.6)
    const text = el.textContent.trim()
    // A task's own title is words to read, not a label: it may take two lines.
    if (!block && text && text.length < 48 && !el.hasAttribute('data-task-title')) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      const tops = new Set()
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim() || inEditor(n.parentElement)) continue
        const range = document.createRange()
        range.selectNodeContents(n)
        for (const rect of range.getClientRects()) if (rect.width > 1) tops.add(Math.round(rect.top / 4))
      }
      // Lines more than 6 pixels apart: words on a second line, not a badge sat a little higher.
      const lines = [...tops].sort((a, b) => a - b).filter((t, i, list) => i === 0 || t - list[i - 1] > 2)
      if (lines.length > 1) faults.push({ kind: 'wrap', what: say(el), detail: `${lines.length} lines in ${Math.round(r.width)}px` })
    }
    const role = el.getAttribute('role')
    const isInputText = el.tagName === 'INPUT' && !['checkbox', 'radio', 'range'].includes(el.type)
    // An inline link in running words is exempt by the rule itself; and so is a field's own height.
    if ((el.tagName === 'A' && el.closest('p')) || getComputedStyle(el).display === 'inline') continue
    if (isInputText) continue
    // Its press area may be larger than its drawing: an ::after or ::before laid
    // over it with negative insets (after:-inset-2) widens what takes the click.
    let hitW = r.width, hitH = r.height
    // Not past its own edge if it clips what it holds: hidden overflow clips the press too.
    const clipsOwn = /(hidden|clip)/.test(getComputedStyle(el).overflowX + getComputedStyle(el).overflowY)
    for (const pseudo of clipsOwn ? [] : ['::after', '::before']) {
      const p = getComputedStyle(el, pseudo)
      if (p.content === 'none' || p.position !== 'absolute') continue
      const px = (v) => (v.endsWith('px') ? parseFloat(v) : 0)
      hitW = Math.max(hitW, r.width - px(p.left) - px(p.right))
      hitH = Math.max(hitH, r.height - px(p.top) - px(p.bottom))
    }
    // Or the whole of a label round it takes the press.
    const label = el.closest('label')
    if (label) { const l = label.getBoundingClientRect(); hitW = Math.max(hitW, l.width); hitH = Math.max(hitH, l.height) }
    if (hitW < MIN - 0.5 || hitH < MIN - 0.5) {
      faults.push({ kind: 'small', what: say(el), detail: `${Math.round(r.width)}x${Math.round(r.height)}${role ? ` ${role}` : ''}` })
    }
  }
  // One line per fault: the same thing twice (in a list of rows) is one fault.
  const keyed = new Map()
  for (const f of faults) {
    const key = `${f.kind}|${f.what.replace(/"[^"]*"/, '')}|${f.detail.replace(/\d+/g, '#')}`
    const was = keyed.get(key)
    if (was) was.n++
    else keyed.set(key, { ...f, n: 1 })
  }
  return [...keyed.values()]
}

/**
 * Every list or page that fades at an edge while there is more past it (main.css: .mf-more, .mf-fade-end, the
 * reading pane, the page dock, quick capture's note) is driven by its own scroll, a scroll timeline. A scroller that
 * stops scrolling (its rows narrowed, its box grown) leaves that timeline inactive, and Chromium keeps the last value
 * it gave: a list scrolled down, then all in view, kept a faded top over rows with nothing above them. This marks
 * each one data-fits while all of it is in view, so its fade is off whatever the scroll last left (qa/fade-stale.mjs).
 * Imported once by every window's entry (for its effect); it watches the page for faded scrollers coming, going, resizing and changing.
 */
const FADED = [
  '.mf-more',
  '.mf-fade-end',
  '.page-dock-side',
  '.page-dock-scroll',
  '[data-reading-pane] .note-pane',
  '[data-reading-pane] .note-pane .haligtree-editor-content',
  '.mf-faded .haligtree-editor-content'
].join(', ')

const watched = new WeakSet<Element>()
const inner = new WeakSet<Element>()

/**
 * Each scroller is measured only when its own box or content changed, never every faded list in the window on every
 * change: with hundreds of rows and a calendar open, measuring them all laid the whole page out mid-commit and froze it.
 * Its box (or its first child's) resizing is told by the ResizeObserver, which runs once layout is done, so reading
 * there costs nothing. Rows added, removed or retyped inside it are told by the MutationObserver, which runs in the
 * middle of React's changes: those scrollers are only noted, and read in one batch after the frame is painted.
 */
function measure(lists: Iterable<HTMLElement>): void {
  const live = [...lists].filter((one) => one.isConnected)
  // Every size read first, then every mark: a mark between reads made the page lay itself out again for each scroller.
  const fits = live.map((one) => one.scrollHeight <= one.clientHeight + 1)
  live.forEach((one, i) => one.hasAttribute('data-all-shown') !== fits[i] && one.toggleAttribute('data-all-shown', fits[i]))
}

const sized = new ResizeObserver((entries) => {
  const lists = new Set<HTMLElement>()
  for (const { target } of entries) {
    // Gone from the page: let it go, so a closed menu is not held for good.
    if (!target.isConnected) {
      sized.unobserve(target)
      watched.delete(target)
      inner.delete(target)
      continue
    }
    const list = watched.has(target) ? target : target.parentElement
    if (list && watched.has(list)) lists.add(list as HTMLElement)
  }
  measure(lists)
})

/** A faded scroller seen for the first time: watched from now on. Observing it reports its size once, which marks it. */
function watch(one: HTMLElement): void {
  if (!watched.has(one)) {
    watched.add(one)
    sized.observe(one)
  }
  // Its first child too, whose growing is its content growing; a new first child (the list redrawn) is watched again.
  const first = one.firstElementChild
  if (first && !inner.has(first)) {
    inner.add(first)
    sized.observe(first)
  }
}

const touched = new Set<HTMLElement>()
let found = false
let pending = false

function flush(): void {
  pending = false
  // A list can start to fade by a class put on it or on a parent, not only by being added: looked for once a batch,
  // a selector match that reads no sizes.
  if (found) {
    found = false
    document.querySelectorAll<HTMLElement>(FADED).forEach(watch)
  }
  const lists = [...touched]
  touched.clear()
  lists.forEach(watch)
  measure(lists)
}

/** After the frame being drawn is painted, when the page is laid out and React is done changing it. */
function soon(): void {
  if (pending) return
  pending = true
  const later = (): void => void setTimeout(flush, 0)
  if (document.hidden) later()
  else requestAnimationFrame(later)
}

// A PDF's pages change by the dozen as they are scrolled, and hold no faded list: their changes are passed over, as are
// those of anything marked data-unfaded (the Calendar's run of weeks and its heading, changing with each week a fling brings in).
const PASSED = '.pdf-pages, [data-unfaded]'
new MutationObserver((changes) => {
  const seen = new Set<Node>()
  for (const change of changes) {
    const at = change.target instanceof Element ? change.target : change.target.parentElement
    if (!at || seen.has(at)) {
      if (at && change.addedNodes.length && !at.closest(PASSED)) found = true
      continue
    }
    seen.add(at)
    if (at.closest(PASSED)) continue
    if (change.addedNodes.length) found = true
    // Every faded scroller holding the change, nested ones too (a note pane and the editor inside it).
    for (let list = at.closest<HTMLElement>(FADED); list; list = list.parentElement?.closest<HTMLElement>(FADED) ?? null)
      if (watched.has(list)) touched.add(list)
  }
  if (found || touched.size) soon()
}).observe(document.documentElement, { childList: true, subtree: true, characterData: true })
found = true
soon()

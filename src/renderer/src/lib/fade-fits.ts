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
let frame = 0

const sized = new ResizeObserver(() => soon())

function mark(): void {
  frame = 0
  const all = [...document.querySelectorAll<HTMLElement>(FADED)]
  for (const one of all) {
    if (watched.has(one)) continue
    watched.add(one)
    sized.observe(one)
    if (one.firstElementChild) sized.observe(one.firstElementChild)
  }
  // Every size read first, then every mark: a mark between reads made the page lay itself out again for each scroller.
  const fits = all.map((one) => one.scrollHeight <= one.clientHeight + 1)
  all.forEach((one, i) => one.hasAttribute('data-all-shown') !== fits[i] && one.toggleAttribute('data-all-shown', fits[i]))
}

function soon(): void {
  if (!frame) frame = requestAnimationFrame(mark)
}

new MutationObserver(soon).observe(document.documentElement, { childList: true, subtree: true, characterData: true })
soon()

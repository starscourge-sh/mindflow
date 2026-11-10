/**
 * Frost only where it can draw (main.css .mf-frost). A backdrop blur sees nothing past its nearest parent that
 * fades (opacity below 1), masks, clips, filters or blurs itself: inside one, the frosted fill would show the page
 * under it sharp. So each frosted surface, as it comes into the page, has what is round it looked at once, and if
 * any of those is there it is marked data-frost-off and keeps the whole, opaque fill. Menus, tips, cards and ⌘K
 * sit outside all of these (qa/frost.mjs); this holds for any surface a later change puts inside one.
 */
/** Every frosted surface: FLOAT's mark, and the editor's own menus and panels (haligtree-editor.scss), one material. */
const FROSTED = '.mf-frost, .tiptap-slash-menu, .tiptap-block-menu, .tiptap-emoji-list, .tiptap-table-menu, .tiptap-image-panel, .tiptap-icon-picker'

const breaks = (el: Element): boolean => {
  for (let at = el.parentElement; at && at !== document.documentElement; at = at.parentElement) {
    const s = getComputedStyle(at)
    if (Number(s.opacity) < 1 || s.maskImage !== 'none' || s.filter !== 'none' || s.clipPath !== 'none' || s.backdropFilter !== 'none' || s.mixBlendMode !== 'normal') return true
  }
  return false
}

const look = (node: Node): void => {
  if (!(node instanceof Element)) return
  const found = node.matches(FROSTED) ? [node] : []
  for (const one of [...found, ...node.querySelectorAll(FROSTED)]) {
    if (breaks(one)) one.setAttribute('data-frost-off', '')
    else one.removeAttribute('data-frost-off')
  }
}

export function guardFrost(): void {
  new MutationObserver((changes) => {
    for (const change of changes) change.addedNodes.forEach(look)
  }).observe(document.body, { childList: true, subtree: true })
  // A pop-up that comes in while its parent is still unseen, held back while quick capture grows to fit it
  // (html[data-growing], lib/fit-box.ts) or fading in, was looked at only then and stayed opaque for good (the "/"
  // list in quick capture). Every one is looked at again as the box has grown, and as any fade round one ends.
  new MutationObserver(() => 'growing' in document.documentElement.dataset || look(document.body)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-growing'] })
  const settled = (event: Event): void => void (event.target instanceof Element && look(event.target))
  document.addEventListener('transitionend', settled, true)
  document.addEventListener('animationend', settled, true)
  look(document.body)
}

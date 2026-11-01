// The box, quick capture: index.html. Each window's page loads only its own code (see main.tsx).
//
// Every entry here imports in the same order: the app's styles, then the
// window's own code, then the shell in main.tsx. That is the order the one
// page always read them in, so the app's own styles still come first and its
// code still runs before the shell's.
import '../assets/main.css'
import 'slot-text/style.css'
import App from '../App'
import { start } from '../main'
import { clearRoom } from '../lib/clear-room'

start(<App />)
// Quick capture is a card inside a larger see-through window (main's overhang): the page draws the card inside
// the room, its menus may hang past the card's edge into it, and clicks on the empty room pass to the app behind.
// A note's own window (the same page) has no room and is left as it is.
if (window.api.room.left) {
  document.documentElement.dataset.overhang = ''
  document.documentElement.style.setProperty('--mf-room', `${window.api.room.left}px`)
  document.documentElement.style.setProperty('--mf-room-top', `${window.api.room.top}px`)
  clearRoom()
  document.documentElement.style.setProperty('--mf-room-left', `${window.api.room.left}px`)
  document.documentElement.style.setProperty('--mf-room-right', `${window.api.room.right}px`)
  // The room round the card for a hint (above it, or beside it on the side with room), set by main while the box is
  // away: the card moves by as much in the same frame, so on screen it stays exactly where main put it, and main
  // shows the box once that is drawn.
  // "One line to start", Spotlight's way: at rest the pill is the bar alone. Tab (or the pointer at the bar's right
  // end) brings its round controls out of that end; Tab and ⇧Tab move between them, the chosen one filled and named
  // in the bar; Enter runs it; Esc, or a word typed, puts them back (main.css, data-controls-out).
  const root = document.documentElement
  const buttons = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.mf-top [data-aside] > *, .mf-top .mf-pill button')].filter((one) => one.offsetWidth > 0)
  const asPill = (): boolean => !!document.querySelector('.app-container[data-pill]') && !('controlsAbove' in root.dataset)
  let picked = -1
  const name = document.createElement('span')
  name.dataset.controlName = ''
  document.body.append(name)
  const pick = (n: number): void => {
    const all = buttons()
    picked = n
    all.forEach((one, i) => one.toggleAttribute('data-picked', i === n))
    const chosen = all[n]
    name.textContent = chosen ? (chosen.getAttribute('aria-label') ?? chosen.textContent ?? '').trim() : ''
    name.toggleAttribute('data-shown', !!chosen)
  }
  // The blob escape: while they come out (or go back) the controls are drawn through a goo filter, so each one buds
  // out of the one before it on a liquid neck that stretches and snaps. Each is tucked, at rest, to the bar's right
  // end (--mf-tuck: how far it sits from there); the filter is on only while they move, so their shadows come back.
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.style.position = 'absolute'
  svg.innerHTML = '<filter id="mf-goo"><feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur"/><feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="goo"/><feComposite in="SourceGraphic" in2="goo" operator="atop"/></filter>'
  document.body.append(svg)
  let moving: ReturnType<typeof setTimeout> | undefined
  const tuck = (): void => {
    // From the layout, not the screen: tucked, each is drawn moved and shrunk.
    const all = buttons()
    const at = (one: HTMLElement): number => { let x = 0; for (let el: HTMLElement | null = one; el && !el.classList.contains('mf-top'); el = el.offsetParent as HTMLElement | null) x += el.offsetLeft; return x }
    const first = all[0] ? at(all[0]) : undefined
    if (first === undefined) return
    all.forEach((one) => one.style.setProperty('--mf-tuck', `${Math.round(at(one) - first + 24)}px`))
  }
  const bringOut = (on: boolean): void => {
    if (on === root.hasAttribute('data-controls-out')) return
    if (on) tuck()
    root.setAttribute('data-controls-moving', '')
    clearTimeout(moving)
    // As long as the last of them takes to land: 3 x 40ms apart and a 360ms spring.
    moving = setTimeout(() => root.removeAttribute('data-controls-moving'), 520)
    root.toggleAttribute('data-controls-out', on)
    if (!on) pick(-1)
  }
  window.addEventListener('keydown', (event) => {
    if (!asPill()) return bringOut(false)
    const out = root.hasAttribute('data-controls-out')
    if (event.key === 'Tab' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.defaultPrevented) {
      const all = buttons()
      if (!all.length) return
      event.preventDefault()
      bringOut(true)
      pick(!out || picked < 0 ? (event.shiftKey ? all.length - 1 : 0) : (picked + (event.shiftKey ? -1 : 1) + all.length) % all.length)
      return
    }
    if (!out) return
    if (event.key === 'Enter' && picked >= 0) {
      event.preventDefault()
      event.stopPropagation()
      const chosen = buttons()[picked]
      bringOut(false)
      chosen?.click()
    } else if (event.key.length === 1 || event.key === 'Backspace') bringOut(false)
  })
  // Esc puts them back before it would put the box away.
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !root.hasAttribute('data-controls-out')) return
    event.preventDefault()
    event.stopImmediatePropagation()
    bringOut(false)
  }, true)
  // The pointer at the bar's right end, or on the controls themselves, brings them out; away, they go back.
  window.addEventListener('mousemove', (event) => {
    if (!asPill() || picked >= 0) return
    const bar = document.querySelector('.app-container')?.getBoundingClientRect()
    const top = document.querySelector('.mf-top')?.getBoundingClientRect()
    const near = !!bar && event.clientY >= bar.top - 8 && event.clientY <= bar.bottom + 8 && event.clientX >= bar.right - 72 && event.clientX <= (top?.right ?? bar.right) + 8
    bringOut(near)
  })
  // The pill opens with a small spring, the bar settling into place: never when opened again straight after closing
  // (a key held, or pressed twice), and not with Reduce Motion.
  let lastOpen = 0
  window.api.onShown(() => {
    const now = Date.now()
    const again = now - lastOpen < 600
    lastOpen = now
    bringOut(false)
    // Each open tries them beside the bar again (the text size or the screen may have changed); tucked away at rest,
    // the try is never seen.
    // Measured at once, not on the next frame: the box can come up before a frame is drawn, and the old answer stood.
    delete root.dataset.controlsAbove
    fitControls()
    tuck()
    const pill = document.querySelector<HTMLElement>('.app-container[data-pill]')
    if (!pill || again || matchMedia('(prefers-reduced-motion: reduce)').matches || root.dataset.motion === 'off') return
    pill.animate([{ transform: 'scale(0.96)', opacity: 0.6 }, { transform: 'scale(1.008)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' })
  })
  // The round controls, the grabber, the hint and the offer belong to the card: drawn only while the card itself is
  // drawn in the window at a real size. A card squeezed to a line, or out of the window, takes them with it, so they
  // never float alone over whatever is behind (main.css, data-card-gone; qa/box-never-bare.mjs).
  const watchCard = (): void => {
    const card = document.querySelector('.app-container')
    const r = card?.getBoundingClientRect()
    const drawn = !!r && r.height >= 48 && r.width >= 120 && r.top < window.innerHeight - 20 && r.bottom > 20 && r.left < window.innerWidth - 20 && r.right > 20
    document.documentElement.toggleAttribute('data-card-gone', !drawn)
  }
  const sizes = new ResizeObserver(watchCard)
  const watchNow = (): void => {
    const card = document.querySelector('.app-container')
    if (card) sizes.observe(card)
    watchCard()
  }
  new MutationObserver(watchNow).observe(document.body, { childList: true, subtree: true })
  window.addEventListener('resize', watchCard)
  // "One line to start" sets its round controls beside the pill. Every one of them is kept in the window: where they
  // would run past its edge, they go above the pill instead, and a new room from main (an open somewhere else) tries beside again (main.css).
  const fitControls = (): void => {
    const root = document.documentElement
    if (!document.querySelector('.app-container[data-one-line]') || 'controlsAbove' in root.dataset) return
    const controls = document.querySelector('.mf-top')?.getBoundingClientRect()
    if (controls?.width && controls.right > window.innerWidth - 4) root.dataset.controlsAbove = ''
  }
  new MutationObserver(() => requestAnimationFrame(fitControls)).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-one-line'] })
  window.addEventListener('resize', () => requestAnimationFrame(fitControls))
  window.api.onRoomHint(({ top, left, right, side }) => {
    const root = document.documentElement
    delete root.dataset.controlsAbove
    root.style.setProperty('--mf-room-top', `${top}px`)
    root.style.setProperty('--mf-room-left', `${left}px`)
    root.style.setProperty('--mf-room-right', `${right}px`)
    if (side) root.dataset.hintSide = side
    else delete root.dataset.hintSide
    // What places itself by the card's place in the window (the toast lane in the footer, the hint) measures again:
    // the window's resize came before the card moved in it.
    window.dispatchEvent(new Event('resize'))
    requestAnimationFrame(() => (fitControls(), requestAnimationFrame(() => window.api.roomDrawn())))
  })
}

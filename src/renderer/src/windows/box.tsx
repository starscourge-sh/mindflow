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
  // The round controls stay where they are, shown, whatever you do: typing only dims them a little (box-extras.css,
  // data-zen), so nothing pops in or out, moves or overlaps between typing and not typing. The keys reach them:
  // in the one-line pill Tab always goes to them (the editor never takes it there); in the grown box Tab is the
  // writing's (a list's indent, else a tab) and ⌃Tab goes to them, said once, quietly, the first time Tab is used.
  // Tab and ⇧Tab (⌃Tab and ⌃⇧Tab) move between them, the chosen one filled and, in the pill, named in the bar;
  // Enter runs it; Esc, or a word typed, lets them go (main.css, data-controls-out).
  const root = document.documentElement
  const buttons = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.mf-top [data-aside] > *, .mf-top .mf-pill button')].filter((one) => one.offsetWidth > 0)
  const asPill = (): boolean => !!document.querySelector('.app-container[data-pill]')
  let picked = -1
  const name = document.createElement('span')
  name.dataset.controlName = ''
  document.body.append(name)
  const pick = (n: number): void => {
    const all = buttons()
    picked = n
    all.forEach((one, i) => one.toggleAttribute('data-picked', i === n))
    const chosen = all[n]
    // What it opens, as its tip says it, without the keys after it ("Open the Inbox in the side panel  ⌘\\").
    name.textContent = chosen ? (chosen.getAttribute('aria-label') ?? chosen.textContent ?? '').split('  ')[0].trim() : ''
    name.toggleAttribute('data-shown', !!chosen)
    root.toggleAttribute('data-controls-out', n >= 0)
  }
  const TOLD = 'mf-ctrl-tab-told'
  let told: ReturnType<typeof setTimeout> | undefined
  /** "⌃Tab for the buttons", once ever, beside the round controls, the first time Tab is used in the grown box. */
  const tell = (): void => {
    if (localStorage.getItem(TOLD)) return
    localStorage.setItem(TOLD, '1')
    const hint = document.createElement('span')
    hint.dataset.ctrlTabHint = ''
    hint.textContent = '⌃Tab for the buttons'
    const controls = document.querySelector('.mf-top')?.getBoundingClientRect()
    if (controls) hint.style.right = `${Math.round(window.innerWidth - controls.left + 12)}px`
    document.body.append(hint)
    requestAnimationFrame(() => hint.setAttribute('data-shown', ''))
    clearTimeout(told)
    // Long enough to read four words twice, then it goes.
    told = setTimeout(() => (hint.removeAttribute('data-shown'), setTimeout(() => hint.remove(), 400)), 3200)
  }
  window.addEventListener('keydown', (event) => {
    const out = picked >= 0
    if (event.key === 'Tab' && !event.metaKey && !event.altKey) {
      const toControls = asPill() ? !event.ctrlKey : event.ctrlKey
      if (!toControls) {
        if (asPill() || out) return
        // The grown box: Tab is the writing's. What the editor did not use (a list's indent) is a tab in the
        // words while writing; in Vim's normal mode it is nothing. Never the browser's move to the next field.
        tell()
        const editor = (event.target as Element | null)?.closest?.<HTMLElement>('.ProseMirror')
        if (editor) before = { editor, html: editor.innerHTML }
        return
      }
      const all = buttons()
      if (!all.length) return
      event.preventDefault()
      event.stopPropagation()
      // ⇧Tab from the first of them comes back to the writing.
      if (out && event.shiftKey && picked === 0) return pick(-1)
      pick(!out ? (event.shiftKey ? all.length - 1 : 0) : (picked + (event.shiftKey ? -1 : 1)) % all.length)
      return
    }
    if (!out) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      event.stopPropagation()
      const chosen = buttons()[picked]
      pick(-1)
      if (!chosen) return
      // As a hand would press it: a menu's button (the gear, a Radix trigger) opens on the press, not on the click,
      // so a click alone left the gear doing nothing. A plain button runs on the click; one of the two acts, never both.
      const menu = chosen.getAttribute('aria-haspopup') === 'menu'
      if (menu) chosen.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse', isPrimary: true }))
      else chosen.click()
    } else if (event.key === 'Escape') {
      // Esc lets them go before it would put the box away.
      event.preventDefault()
      event.stopImmediatePropagation()
      pick(-1)
    } else if (event.key.length === 1 || event.key === 'Backspace') pick(-1)
  }, true)
  // After the editor has had it: a Tab that changed nothing (no list to indent; Vim's insert mode only keeps it in
  // the note) writes a tab while writing, and is nothing in Vim's normal mode. Never the browser's move to the next field.
  let before: { editor: HTMLElement; html: string } | null = null
  window.addEventListener('keydown', (event) => {
    const was = before
    before = null
    if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey || !was || asPill()) return
    if (was.editor.innerHTML !== was.html) return
    event.preventDefault()
    if (was.editor.getAttribute('data-vim-mode') !== 'normal' && !event.shiftKey) document.execCommand('insertText', false, '\t')
  })
  window.api.onShown(() => {
    pick(-1)
    // Each open tries them beside the bar again (the text size or the screen may have changed).
    // Measured at once, not on the next frame: the box can come up before a frame is drawn, and the old answer stood.
    delete root.dataset.controlsAbove
    fitControls()
  })
  // Real glass, Raycast's way (main/glass.ts): the Mac's blur of the desktop under the card, each round control and
  // the hint, and nowhere else in the window. Told to main as they move, grow and come and go, each frame the box is
  // on screen, only when something changed. Off with Reduce Transparency or a solid look: the surfaces are opaque then.
  const glassOff = (): boolean => matchMedia('(prefers-reduced-transparency: reduce)').matches || 'solid' in root.dataset
  let sentGlass = ''
  const shapesNow = (): number[][] => {
    if (glassOff() || root.hasAttribute('data-card-gone')) return []
    const shown = (el: Element | null): el is HTMLElement => {
      if (!el) return false
      for (let at: Element | null = el; at && at !== document.body; at = at.parentElement) if (Number(getComputedStyle(at).opacity) < 0.5 || getComputedStyle(at).visibility === 'hidden') return false
      return true
    }
    const parts = [document.querySelector('.app-container'), ...buttons(), document.querySelector('[data-hint-room] [data-hint-surface]')].filter(shown)
    return parts.map((el) => {
      const r = el.getBoundingClientRect()
      return [r.left, r.top, r.width, r.height, Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, r.height / 2)].map((n) => Math.round(n * 10) / 10)
    }).filter((one) => one[2] > 1 && one[3] > 1)
  }
  const paint = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  let darkFor = ''
  let darkWas = false
  const pageIsDark = (): boolean => {
    const colour = getComputedStyle(root).getPropertyValue('--background').trim()
    if (colour === darkFor || !paint) return darkWas
    paint.clearRect(0, 0, 1, 1)
    paint.fillStyle = colour
    paint.fillRect(0, 0, 1, 1)
    const [r, g, b] = paint.getImageData(0, 0, 1, 1).data
    darkFor = colour
    darkWas = 0.2126 * r + 0.7152 * g + 0.0722 * b < 128
    return darkWas
  }
  const glassFrame = (): void => {
    const shapes = shapesNow()
    // Dark or light by the page's own colour, not a class: a theme like Paper is light whatever the Mac's appearance.
    const dark = pageIsDark()
    const said = JSON.stringify([dark, shapes])
    if (said !== sentGlass) {
      sentGlass = said
      window.api.glass(dark, shapes)
    }
    if (shapes.length) root.dataset.glass = dark ? 'dark' : 'light'
    else delete root.dataset.glass
    requestAnimationFrame(glassFrame)
  }
  requestAnimationFrame(glassFrame)
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

/**
 * The welcome's arrival out of the desktop (welcome.tsx, welcome-mist.tsx): the main window is see-through, the Mac's
 * own blur and then a fog come in over the desktop until nothing of it reads, the title comes out of the fog, and then
 * the whole scene becomes a window about half the screen in its middle, which grows to fill the screen for the first
 * page. A window is see-through or not from the moment it is made, so this is asked as the main window is
 * made, and again each time the welcome is about to arrive: shown again from a window not made see-through, the
 * window is made again in its place for the showing (main: remakeHome), with the old one's tabs and places.
 *
 * In every case below the plain thing is done instead: the window simply there, the welcome arriving inside it.
 */
export type ArrivalCase = {
  /** A Mac: the only place a window with its buttons set into the page can be see-through and keep its shape. */
  mac: boolean
  /** The welcome will open in this window by itself (a first run), or a test asks for the arrival. */
  welcome: boolean
  /** A test run that did not ask for it: probes keep the window they set. */
  test: boolean
  /** Reduce motion, or the app's own Motion off. */
  still: boolean
  /** Safe mode: nothing of yours over the desktop. */
  safe: boolean
  /** The Mac's Reduce transparency: surfaces are asked to be solid, as the stickies' glass already is not used then. */
  solid: boolean
  /** Not the Mac's main screen: its menu bar and Dock are elsewhere, and a sheet over a second screen reads as a fault. */
  secondDisplay: boolean
  /** The window in a Space of its own: there is no desktop behind it to arrive out of. */
  fullScreen: boolean
}

/** Why the welcome arrives the plain way, or null when it may arrive out of the desktop. */
export function plainArrival(now: ArrivalCase): 'not a Mac' | 'no welcome' | 'a test run' | 'motion off' | 'safe mode' | 'reduce transparency' | 'a second display' | 'full screen' | null {
  if (!now.mac) return 'not a Mac'
  if (now.test) return 'a test run'
  if (!now.welcome) return 'no welcome'
  if (now.still) return 'motion off'
  if (now.safe) return 'safe mode'
  if (now.solid) return 'reduce transparency'
  if (now.secondDisplay) return 'a second display'
  if (now.fullScreen) return 'full screen'
  return null
}

/** How long a see-through window may stand before it is made solid whatever the page says, in ms: past the arrival's whole length. */
export const CLEAR_LIMIT = 20000

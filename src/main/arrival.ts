/**
 * The welcome's arrival (welcome-scene.tsx, main: makeScene): a fog over the whole screen, drawn by a window of its own,
 * that draws in to the welcome's window in the middle of the screen, where the whole welcome then plays.
 *
 * In every case below the plain thing is done instead: the welcome's window put in the middle at once, the welcome
 * arriving inside it.
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

/** The scene's moments main keeps to, in ms from its start, as welcome-scene.tsx SCENE says (test/arrival.test.ts holds them together). */
/** The fog is whole: the welcome's window is put in its place under it. */
export const SCENE_COVERED = 3500
/** The scene has drawn in to the welcome's window, which takes over. */
export const SCENE_HANDOVER = 12800
/** The first words: the scene window's corner buttons go with it. */
export const SCENE_WORDS = 17500

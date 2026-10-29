/**
 * Whether this window has traffic lights in its top-left corner (the main
 * window, a note's own, a drawing's): floating things keep its top 52px clear
 * for them, as its menus and popovers do. The small windows (the box, the
 * focus pill, nudges, stickies) have none.
 */
const LIGHTS = /(home|note|drawing)\.html$/.test(location.pathname) || /[?&](view=home|note=|drawing=)/.test(location.search)

/** Room kept from the window's edges by a floating thing: the traffic lights' 52px at the top where there are any. */
export const roomFrom = (edge: number): number | { top: number; right: number; bottom: number; left: number } =>
  LIGHTS ? { top: 52, right: edge, bottom: edge, left: edge } : edge

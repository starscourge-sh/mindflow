import { screen, systemPreferences, type BrowserWindow } from 'electron'

import { motionOn } from './haligtree'
import { outQuart, tween } from './sticky-place'

/**
 * One window's frame (and how see-through it is) moving to somewhere new, as
 * one glide: the way a page carried between windows travels. Its own clock
 * per window, so two windows can move at once (one page leaving as another
 * lands) without one stopping the other, each step on the display's own
 * frames (the one clock in sticky-place.ts). Kept small on purpose: anything
 * that moves a window from one place to another can share it.
 */

const clocks = new WeakMap<BrowserWindow, () => void>()

/** Motion off in Settings, or Reduce motion on in the Mac's Accessibility settings. */
export const stillNow = (): boolean => !motionOn() || systemPreferences.getAnimationSettings().prefersReducedMotion

/**
 * Glide `win` to `to` (any of x, y, width, height) and to `opacity`, over
 * `ms`, easing out (quick off the mark, settling gently). Started again
 * mid-way, it turns round from where the window is now. At once with Motion
 * off or Reduce motion. Resolves when it lands.
 */
export function glide(win: BrowserWindow, to: Partial<Electron.Rectangle>, { ms = 220, opacity }: { ms?: number; opacity?: number } = {}): Promise<void> {
  clocks.get(win)?.()
  if (win.isDestroyed()) return Promise.resolve()
  const from = win.getBounds()
  const end = { ...from, ...to }
  const fade = opacity === undefined ? null : { from: win.getOpacity(), to: opacity }
  if (stillNow() || ms <= 0) {
    win.setBounds(end, false)
    if (fade) win.setOpacity(fade.to)
    return Promise.resolve()
  }
  return new Promise((done) => {
    const stop = tween(ms, (t) => {
      if (win.isDestroyed()) return (clocks.delete(win), done(), false)
      const k = outQuart(t)
      const at = (a: number, b: number): number => Math.round(a + (b - a) * k)
      win.setBounds({ x: at(from.x, end.x), y: at(from.y, end.y), width: at(from.width, end.width), height: at(from.height, end.height) }, false)
      if (fade) win.setOpacity(fade.from + (fade.to - fade.from) * Math.min(1, t * 1.6))
      return true
    }, () => (clocks.delete(win), done()))
    clocks.set(win, stop)
  })
}

/** `box` moved (never resized) to sit wholly on the screen it is mostly on. */
export function onScreen(box: Electron.Rectangle): Electron.Rectangle {
  const { workArea: area } = screen.getDisplayMatching(box)
  const width = Math.min(box.width, area.width)
  const height = Math.min(box.height, area.height)
  return {
    x: Math.round(Math.min(Math.max(box.x, area.x), area.x + area.width - width)),
    y: Math.round(Math.min(Math.max(box.y, area.y), area.y + area.height - height)),
    width: Math.round(width),
    height: Math.round(height)
  }
}

/** A box of `width` × `height` centred on the middle of `around`, then kept on screen. */
export const centredOn = (around: Electron.Rectangle, width: number, height: number): Electron.Rectangle =>
  onScreen({ x: around.x + around.width / 2 - width / 2, y: around.y + around.height / 2 - height / 2, width, height })

// window.api's type is the preload's object itself (index.ts), so each method is written once.
import type { Api } from './index'

/** A sticky's frost (main/frost.ts): whether to frost, its screen's desktop picture small and blurred (or null), where that screen is, and where the window is. */
export type Frost = { on: boolean; image: string | null; display: { x: number; y: number; width: number; height: number }; at: { x: number; y: number } }

export interface LinkMetadata {
  href: string
  title: string
  description: string
  image: string
  icon: string
  site: string
}

/** A picture as the look window shows it; `rect` is where it sits on screen, if it is in view. */
export interface LookPicture {
  src: string
  width: number
  height: number
  caption: string
  rect?: { x: number; y: number; width: number; height: number }
}

declare global {
  interface Window {
    api: Api
  }
}

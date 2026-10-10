/// <reference types="electron-vite/node" />

interface ImportMetaEnv {
  /** The Giphy key built into a local build, from .env.local (never committed). */
  readonly MAIN_VITE_GIPHY_KEY?: string
}

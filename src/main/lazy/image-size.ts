import type * as Sizes from 'image-size'
import type * as FromFile from 'image-size/fromFile'

// What main reads of image-size (a picture's width and height: pictures.ts, web-articles.ts, anki-apkg.ts), loaded
// the first time a picture is measured rather than as Haligtree opens: required as main started, it held every
// window back until it had loaded (qa/start-time.mjs). electron.vite.config.ts points main's imports of it here; the
// tests import the real one.
let sizes: typeof Sizes | undefined
let fromFile: typeof FromFile | undefined
export const imageSize: typeof Sizes.imageSize = (...args) => (sizes ??= require('image-size') as typeof Sizes).imageSize(...args)
export const imageSizeFromFile: typeof FromFile.imageSizeFromFile = (...args) => (fromFile ??= require('image-size/fromFile') as typeof FromFile).imageSizeFromFile(...args)

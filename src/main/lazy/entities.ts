import type * as Entities from 'entities'

// What main reads of entities (a link card's title and words, `&amp;` read as `&`: index.ts), loaded the first time a
// card is looked up rather than as Haligtree opens (qa/start-time.mjs). electron.vite.config.ts points main's import
// of it here; the tests import the real one.
let real: typeof Entities | undefined
export const decodeHTML: typeof Entities.decodeHTML = (...args) => (real ??= require('entities') as typeof Entities).decodeHTML(...args)

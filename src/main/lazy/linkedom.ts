import type * as Linkedom from 'linkedom'

// What main reads of linkedom (a web page read as a document: article-clean.ts, free-sites.ts, web-articles.ts),
// loaded the first time a page is read rather than as Haligtree opens: required as main started, it was the slowest
// library to load, and held every window back until it had (qa/start-time.mjs). electron.vite.config.ts points
// main's imports of it here; the tests import the real one.
let real: typeof Linkedom | undefined
export const parseHTML: typeof Linkedom.parseHTML = (...args) => (real ??= require('linkedom') as typeof Linkedom).parseHTML(...args)

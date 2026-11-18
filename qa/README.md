# QA harness

Drives the built app with Playwright's Electron driver: the same code you run,
not jsdom and not the extensions in isolation.

```
npx electron-vite build --outDir out-x
QA_DATA=<a copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-parity.mjs
```

The probes walk the main journeys a person takes through the app, end to end
(capturing, writing, reading, studying, finding, organising), plus the checks a
rule or the app's own code names. The list of main journeys, and why every
other probe went on 18 Nov 2026, is in `REMOVED-18nov.md`. Several probes run
in one launch of the app with `batch.mjs`:
`node qa/batch.mjs --from <data to copy> --copies <folder> <probe> <probe> ...`.

`harness.mjs` opens the app and gives each case a few verbs: `reset`, `type`,
`line` (click the nth line), `press`, `shape` (the document as indented text),
`caretLine`, and `drain` (console output, for debugging a failure).

Tiptap hangs the editor off its own DOM node, so
`document.querySelector(EDITOR).editor` is the handle for anything the verbs
above do not cover: `editor.commands.setContent(json)` builds a document
through the real schema.

Two things it has to do that are easy to get wrong: type slowly enough that the
input rules keep up, and let each keypress settle before the next click: a
command re-renders the document, and acting too soon acts on the shape that was
there a moment ago.

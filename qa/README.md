# QA harness

Drives the built app with Playwright's Electron driver — the same code you run,
not jsdom and not the extensions in isolation.

```
npm run build && node qa/lists.mjs
```

The suites are `lists.mjs` (turning one kind of list into another), `drag.mjs`
(moving blocks by the handle), `scroll.mjs` (dragging past the edge of the
view), `highlight.mjs` (a few words marked versus a whole line) and
`themes.mjs`, which wears every theme in turn and measures the
contrast of the body, the headings, the accent, the caret and the chrome
against the page. A palette can only be judged by eye, but the failures that
matter are arithmetic, so a new theme cannot ship unreadable.

`harness.mjs` opens the app and gives each case a few verbs: `reset`, `type`,
`line` (click the nth line), `press`, `shape` (the document as indented text),
`caretLine`, and `drain` (console output, for debugging a failure).

Two things it has to do that are easy to get wrong: type slowly enough that the
input rules keep up, and let each keypress settle before the next click — a
command re-renders the document, and acting too soon acts on the shape that was
there a moment ago.

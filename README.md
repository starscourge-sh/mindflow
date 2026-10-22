# Haligtree

(It was called Vigil, and mindflow before that. Only the repository folder keeps the name `mindflow`.)

A capture box you summon with a key, and the editor inside it.

The editor is the part worth knowing about. It is a self-contained React
component - blocks, a `/` menu, drag handles, tags, drawings, tables, vim
bindings - that stores nothing itself and asks the app around it to do that.
This repo is one app built on it: an Electron window that keeps notes on disk.
The same component drops into a web app that keeps them in S3 without changing
a line of it.

## Running it

```bash
npm install
npm run dev
```

`npm run build:mac` (or `:win`, `:linux`) packages it.

## Where things are

| | |
| --- | --- |
| [`docs/components.md`](docs/components.md) | **Start here.** Every prop, every type it takes, and worked examples of building a Linear-, Obsidian- or Notion-shaped app out of it. |
| [`docs/extending.md`](docs/extending.md) | Adding a block, a command, a `/` menu item, a kind of thing to store. |
| [`docs/captures.md`](docs/captures.md) | How this app saves: the SQLite table, the asset store, and how a capture reaches the main window. |
| [`qa/README.md`](qa/README.md) | The tests. They drive the built app with Playwright rather than mocking it. |

## The shape of it

```
src/main/        the Electron side: the windows, the global key, the capture store
src/preload/     the bridge, which is what `HaligtreeHost` is implemented over
src/renderer/
  components/haligtree/   the editor, and its public surface in `index.ts`
  extensions/            one file per block or behaviour
  lib/                   host, theme, vim, and the pure functions over a document
qa/              Playwright suites, run with `node qa/<name>.mjs` after a build
```

Anything not named in `components/haligtree/index.ts` is the component's own
business and may move.

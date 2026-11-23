# Haligtree: guide for agents

Read this first. It is all you need to pick up work with no chat history.

## What the app is

Haligtree (once called Vigil, and mindflow before that; only the repo folder keeps `mindflow`) is a Mac desktop app
built with Electron, React and TipTap. It is a **commonplace book**: notes, quotes, gems, PDFs, words and study cards
kept in one place, which come back to you through spaced review, the Feed, Home and resurfacing. The test of success
is "did I learn it and can I find it again?", not "is it in the system?".

- Two equal audiences: the Anki and Obsidian (or Notion) academic who reads hundreds of PDFs and makes cards, and the
  person "interested in too many things" whose notes rot in a pile.
- You do the thinking; the app does the remembering and the timing. AI is optional, outside, and never writes the
  person's notes.
- Local-first: a SQLite database per book, no servers. Typical libraries are large (thousands of notes and cards), so
  everything must still work and read well at scale.
- It will be sold: no non-commercial APIs and no fair-use images in shipped features. Art is drawn or public domain.
- It must feel native to macOS and alive (a sound per action, animated icons, hint sentences that type in) without
  being noisy.

More: `PRODUCT.md`, `DESIGN.md` (the look), `GLOSSARY.md` (the app's own words), `README.md`,
`docs/` (the editor component, how saving works, ADRs).

## Run it

```bash
npm install
npm run dev            # the app from source, with hot reload
npm run typecheck      # both TypeScript projects (main and web)
npm run lint
```

The person who owns this app keeps their own dev app running. Never kill their `electron-vite dev`.

## Build the Mac app

1. Bump the version first. Versions are betas: `0.4.0-beta.N`. Next build in the same round:
   `npm version prerelease --preid beta --no-git-tag-version` (beta.219 to beta.220). Never 1.0.0 until the owner
   says so. Commit `package.json` and `package-lock.json` with it.
2. `npm run build:mac`
3. Keep only the newest build: `find dist -maxdepth 1 -name "Haligtree-*" ! -name "*beta.N*" -delete` (put the new N
   in). Never delete by piping `ls`.

## Code map

- `src/main/`: the Electron main process. Windows, the global capture key, the database (`captures.ts`), books and the
  sandbox (`sandbox.ts`), backups, imports, the app menu. `src/main/real-folder.ts` refuses to run on the real data
  folder under test.
- `src/preload/`: the bridge. The renderer reaches main only through `window.api`.
- `src/renderer/src/`: the React app. The editor and every view live in `components/haligtree/`; TipTap blocks and
  behaviours in `extensions/` (one file each); pure functions in `lib/`.
- Shared parts, in `src/renderer/src/components/haligtree/ui.tsx`. Use these, never a new one-off:
  - `Island`: a labelled rounded group of rows. Every popover and panel groups its rows in islands.
  - `PanelRow`: one labelled row inside a panel.
  - `toast(text, undo?, tone?)`: the one notice, with Undo.
  - `Tip`: the hover tip for any control.
  - `VirtualList`: long lists. `SortableList` (in `sortable.tsx`): lists you can reorder.
- Drags: `carry.tsx` (carrying things between places) and `sortable.tsx` (reordering). Never add a second drag system.
- `test/`: unit tests. `qa/`: end-to-end probes. `scripts/`, `native/`, `build/`: build helpers and the Quick Look
  extension.

## Tests

Fewer, intentional tests. Each one is a real journey by a real kind of person: a first-timer who clicks the wrong
thing, an everyday user, a power user on keys. Nothing trivial, nothing twice, nothing that only restates the code.
A one-line look fix gets a screenshot read by eye, not a new probe. Deleting a useless probe counts as a fix.

**Unit tests**: `node --test test/*.test.ts` (Node 24 runs TypeScript directly).

**Probes** (`qa/*.mjs`): Playwright's Electron driver starts the real built app and drives it like a person.
`qa/harness.mjs` opens the app; `qa/sandbox-lib.mjs` opens it on the sandbox (an example book full of notes, decks
and PDFs) and waits for it to be laid down. `qa/README.md` says more; `qa/REMOVED-18nov.md` lists the main journeys.

```bash
./node_modules/.bin/electron-vite build --outDir out-gate     # build once into a folder of your own
qa/run-one.sh out-gate box-parity                            # one probe
qa/run-one.sh out-gate book-shelf+book                       # one probe on a copy of a several-books folder
qa/run-one.sh out-gate one-float QA_SHOTS=/tmp/shots         # extra settings for the probe
```

`qa/run-one.sh`:
- makes the seed the first time: `qa/make-seed.mjs` starts the built app once with `--sandbox` on an empty folder,
  waits until the example book is laid down, and closes it. The seed is kept in `qa/local.noindex/seed` (ignored by
  git). Delete that folder after changing what the sandbox lays down (`components/haligtree/sandbox.tsx`).
- copies the seed for every run, so a probe can never change it, and deletes the copy afterwards.
- runs with `HALIGTREE_QA_AWAY=1`: windows parked off screen, every sound muted, no outside services.
- runs through `qa/solo.sh`, which lets **one heavy job at a time** run on the whole Mac (builds, typechecks, test
  runs, probes), from every worktree. Run your own builds and typechecks through it too:
  `qa/solo.sh ./node_modules/.bin/electron-vite build --outDir out-gate`. It stops any job after 300 seconds
  (`SOLO_MAX`, at most 600) and kills everything the job started. `qa/solo.sh --status` shows what is running.
- prints `<probe>: N passed, M failed, exit X` and each FAIL line; the full log is in `qa/local.noindex/logs/`.

Rules for test runs:
- Nothing a test starts may outlive it: cap every loop, kill every child process on exit, never spawn audio or other
  device-holding processes.
- Never on the person's screen: no `HALIGTREE_QA_ONSCREEN`, no `screencapture`, `osascript` or System Events, no
  full-screen test windows. Take pictures with `page.screenshot`.
- Build inside the repo (`out-*` folders). A build outside it cannot find its libraries and pops an error box on
  the person's screen.
- Never touch the clipboard: never write it, never read it, not even to put it back. Probes paste with a synthetic
  paste event (`qa/pasteboard.mjs`).
- Clean up: delete `out-*` builds and temp data folders you made; leave no test processes.
- If you are a helper agent: write or update tests and hand them over; the lead session runs them, in one batch per
  round. Each fix's own probe runs once.
- A failure taken while the Mac's load is above 15, or while the screen is locked
  (`ioreg -n Root -d1 -a | grep -c CGSSessionScreenIsLocked` prints 1), is run again once before it counts. Never
  unlock or wake the screen.

## Hard rules

Data
- Never write to the real data folder, `~/Library/Application Support/haligtree`, or the Obsidian vault
  (`~/Documents/obsidian/The Citadel of Reed`). Work on read-only copies only.

Git
- Commit messages say what the person now sees and why, in plain words (see `git log`). No `Co-Authored-By` or any
  other attribution line, ever.
- Never `git branch -D`. Delete a merged branch with `git branch -d` only.
- Merge step by step: rebase, check `git status`, fast-forward, check again, run the typecheck and the probe, and
  only then remove the branch. Never chain git steps behind pipes that hide a failure.
- Never `git merge` into a working tree with uncommitted changes. Avoid `git stash` (the stash is shared with other
  sessions); use a temporary commit instead.
- A new worktree may start behind: run `git merge --ff-only main` first.
- Never commit secrets, `.env*` files or hostname overrides. Look at the diff before committing.

Writing
- Plain English, high-school level. No jargon. No em dashes anywhere: replies, commits, UI copy.
- A button or menu name inside a sentence goes in curly quotes (“Start fresh…”); keys stay keycaps.

Working
- Never say fixed or checked without running it and reading the result. Prove a deletion with `grep`.
- After any fix, sweep the app for the same problem elsewhere before calling it done.
- Fix the cause, never with timeouts or other duct tape. If the cause can't be fixed, lay out the options.
- Build only what was asked. A "maybe" or a question gets discussion, not code.
- Every move, resize or scroll glides or fades, never jumps. Every clickable thing shows the hand cursor.
- Controls are built from the app's own look (`ui.tsx`), never stock browser controls.
- Nested things are drawn as a tree with lines and a fold chevron. Writing comes first; notes before tasks.
- Loading is always the orb with shimmering words, never grey skeleton bars (`test/no-grey-bars.test.ts`).

## The playbook (the standard for every app)

`playbook/` in this repo is a link to `../playbook`, the owner's playbook repo, kept beside every project. On a new computer, clone it next to this repo and the link works.
- Start at `playbook/README.md`, then its four chapters in `playbook/handbook/` (build, test, check, improve).
- Look things up in `playbook/reference/` (look, interaction, design values).
- Nothing is done until it passes the gate in `playbook/handbook/3-check.md`, with screenshots.
- `playbook/playbook/` is Claude's working copy of the same rules, with their history. Other agents can skip it.

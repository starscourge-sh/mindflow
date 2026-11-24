# Handover: where Haligtree stands

For any agent picking up this app with no chat history. Read this, then `AGENTS.md` (how to run, build and test), then the playbook at `playbook/` (a link to `../playbook`) (how every app here is built and checked).

## Read first

1. `docs/product/positioning.md`: what Haligtree is and is not.
2. `docs/product/audience.md`: who it is for, in their own words.
3. `docs/product/work-waiting.md`: everything queued, split into what any agent can take and what needs Claude or the owner. Start with its "Any agent" list.
4. `playbook/handbook/3-check.md`: the gate every change passes before it is called done.

## State on 24 Nov 2026

- Branch: everything is on `main`. The newest build is `dist/Haligtree-0.4.0-beta.220.dmg` (the owner may still have beta.219 installed: check `/Applications/Haligtree.app` before blaming new code); the next build is beta.221 (bump `package.json` first, keep only the newest `dist/Haligtree-*`).
- Wrapped Midori → F49 → F51 → F53/F53b → F54: journal pages, not a Spotify deck. Grade talk, ranked tags, photo carousel and bar charts gone (user shots 12–15). Shots under the store `break-shots/wrapped-full-walk/`. Grainient stays; no card smoke. Probe `wrap-book-first` 41/41. **Not WOW yet**.
- The owner runs `npm run dev` from this folder and reports bugs with screenshots. Fix on `main`, commit each fix on its own with a plain message saying what the user now sees and why.

## Known failures (not caused by the newest work)

- `qa/task-in-session.mjs`: 5 of 63 checks fail (the running session's time, the task's page).
- `qa/tasks-drag.mjs`: stops at its last step ("A tab's menu"); same on older code.
- `qa/drag-hint-still.mjs`: on Today with "Write out my day" open, starting a drag moves "For tomorrow" down 19px (the write line closes on the drag and the list's height catches up late). Real; not fixed.
- Unit tests: 3 fail in the Wrapped files (`wrap-art.tsx`, `wrap-story.tsx`: see-through words, a count not through num(), round dots that squash), from the Wrapped work in progress.
- `qa/folders.mjs` "about seven rows show": the fresh test book has too few folders to scroll.
- `qa/folder-page.mjs` "Home is above Inbox": the fresh test book lists Inbox first.
- The reminder card's new look (`nudge-card.tsx`) has not been seen on screen: no test raises a task reminder yet.
- A "Maximum update depth exceeded" crash was reported once (24 Nov) and not reproduced; today's three now write once a day, the likely cause.
- `qa/ctrl-l-stall.mjs` dark typed-* checks and one deck-count check in `qa/deck-counts.mjs`: failing on main for a while.

## Decided recently (keep to these)

- Islands are every popover's look: a small heading over each group of rows, the rows in a rounded island (the list's Sort/View popover is the model).
- The current item in a list stands apart, above the list and larger, never a label in an identical row.
- Continuity: walk into any change from its neighbours (the tabs either side, pages that link in, other places the same object shows) and compare screenshots side by side. One tab bar, one task row, one month grid across the app is queued as the "Continuity pass".
- Tasks: projects live in Tasks (archived ones fold under "Archived"); "On hold" (from Start fresh) is folded at the foot of every tab; "N open" counts what is shown; dropping a task on "Today" or "Tomorrow" sets that day and moves a past deadline with it; drops into another part open room where the task lands, never a lit heading.
- Today's three: a part of their own at the top of Today ("Today's three"), kept for the day in localStorage `three:<day>` (day-list.tsx `keptThree`). A task dragged onto them is swapped in; one ticked stays there struck until tomorrow; dragging one out is refused. The Journal and Tasks number the same three. The desktop sticky does not show them yet.
- Callouts are a slip of the paper's grain (no grid), corner 0.875rem as the note panels, title in the page's ink, each type's emoji drawn as a line icon; a picked emoji shows as itself.
- Page tabs are one component everywhere (`tab-chips.tsx`), plain pills by default, "Boxed" in Settings › Appearance.
- Folder and project menus open on a row of colour swatches.
- Reminder cards: what it is about first, why under it in quiet ink, the app's own buttons, never a coloured badge or pill.
- A tag added from the Properties row, or with "Add a tag…" on one note or a selection, stays on the note (`fields._tags`) and is not written into its words. The row ends in a quiet "+". Undo puts the tag list back.
- Export everything shows a preview first (pages, gems, notes, decks, highlights, the readme), then saves a folder: Writing, Gems, Notes, Decks, Library, assets, and haligtree.json. The Markdown copies setting still writes one file a note.
- Deleting a book: any book but your last; the open one opens another first.
- Start fresh puts things away (never deletes notes); "Bring it back" or dragging out of "On hold" returns a task.

## Haligtree's own product rules

These are the app's, not the studio's, so they live here.

- Writing comes first: notes before tasks in every list, chip row and section order.
- Folders open (a page of their own, never collapsed in place); a note in a folder shows only inside it; the top level is folders, then loose notes.
- Groups are not folders: a group is an inline panel made by dropping a note on a note (⌘G, ⇧⌘G).
- Nested things are drawn as a tree with lines and a fold chevron.
- Gems (kept lines) are not study cards; a deck is a tag on cards.
- Files is the library of everything added; a note's attachments live with the note.
- Anything the app wrote into a note, not the person, is set apart (a quiet panel or muted ink, labelled).
- Task names stay plain text: no bold or italic.
- Study and deck cards have small corners (4 to 8px).
- Every wait is the orb with shimmering words, never grey skeleton bars.
- It will be sold: no non-commercial APIs or fair-use pictures in shipped features.

## Never

- Write to the owner's real data (`~/Library/Application Support/haligtree`, the Obsidian vault). Read-only copies only (`sqlite3 -readonly "file:…?mode=ro"`).
- Touch the clipboard, unlock or wake the screen, or show a test window on the owner's screen.
- Use em dashes, add Co-Authored-By or attribution lines, run `git branch -D`, merge into a dirty tree, or commit secrets.
- Run mutating `aws` or `sam` commands.

## Where the rest lives

- The work list is `docs/product/work-waiting.md` (the source of truth); Claude mirrors it to https://claude.ai/artifact/2YdeKjnQJsKiwsFgdqPkyX for the owner.
- Claude's own project memory (useful history, not required): `~/.claude/projects/-Users-starscourge-Documents-forge-mindflow/memory/`, indexed by `MEMORY.md` there.
- Claude's working copy of the studio standard: `playbook/playbook/` (Claude Code loads it through `~/.claude/skills/app-playbook`).

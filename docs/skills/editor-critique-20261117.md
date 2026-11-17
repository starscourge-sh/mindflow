Method: dual-agent (A: bc-cc50c4e2-60a3-51da-9d4e-cef25d52fcde · B: bc-4d5cd222-0b5e-506c-ac56-7b8304ea9e49)

Date: 2026-11-17. Surface: the note editor, Operate mode. Target: `src/renderer/src/components/haligtree/haligtree-editor.tsx` and the bars it mounts (`selection-menu.tsx`, `block-menu.tsx`, `vim-mode.ts`). Live Electron window was not opened. Browser overlay skipped: Electron, not a page URL.

# Design health

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 2 | With Vim on, a note opens in normal mode. Letters are swallowed. The only count is an aria-hidden digit. Nothing says Normal or Insert. |
| 2 | Match system / real world | 3 | Rows say Gem, Capture, Save a copy. The structure still says Color, Turn into, Basic blocks, and the empty page says "type / for commands…". |
| 3 | User control and freedom | 3 | Escape drops a selection. The link box has Cancel. A click clears a waiting Vim count. Block Delete removes the block in one click and the row never names Undo. |
| 4 | Consistency and standards | 2 | The format bar is a 55% accent mix. The link box, the Aa panel, and the selection count are frost. Slash and block menus are popover, then frosted again in veil. |
| 5 | Error prevention | 3 | A bad address is refused before it is kept. A click abandons a half-typed Vim count so the next dd is not a silent 2dd. Delete still sits in the same undivided list as Copy and Duplicate. |
| 6 | Recognition rather than recall | 2 | Bold, Italic, and Link are icons. "Turn this link into a card" is an icon with no tooltip. The word More is hidden unless Settings turns bar words on. |
| 7 | Flexibility and efficiency | 3 | Slash hints teach the markdown. Capture is ⌃⌘C and Gem is ⌃⌘I. Task, Move out, Sync, and Card have no keys and live inside More. |
| 8 | Aesthetic and minimalist design | 2 | A note has no dock. Selecting a sentence summons a 7-control floating bar. |
| 9 | Error recovery | 2 | The link box says the address is not a web address. Normal mode eats the same letters and offers no sentence and no way back except knowing to press i. |
| 10 | Help and documentation | 2 | Mark buttons have tooltips. The block menu's filter field is hidden until a character is already typed. |
| **Total** | | **24/40** | **Needs work** |

# Design specificity

The page under the chrome is this book: cream paper, Fraunces, and words like Gem and Capture. The bars, the grip, and the slash list are a Tiptap toolbar and a Notion-shaped menu. Authored in the words, interchangeable in the chrome.

Deterministic scan: `impeccable detect` on the editor tsx plus scss exited 0 with 49 findings, all in `haligtree-editor.scss` (31 radius, 14 color, 4 font size). The tsx contributed 0. A second scan of `selection-menu.tsx` and `block-menu.tsx` exited 0 with `[]`.

The radius and `#000` / `rgba(0,0,0,…)` hits are mostly 1px carets, hairlines, and shadows, not a second palette. The four font sizes are off the ramp: `0.5rem` (line 1257), `1.75rem` (1752), `1rem` (2701), `1.125rem` (3958). No user-visible overlay.

# Overall

The sheet is quiet until a selection. Then a lit accent bar and a slash list called "commands" make the book feel like a page builder, until a row such as Gem pulls the voice back. The single biggest gap is that Vim normal mode takes the keyboard and does not say so.

# What's working

- The format bar waits 180ms on a whole-note selection so ⌘A then delete never flashes it, and it stays hidden when the line has no room (`selection-menu.tsx`).
- The document count is a paper pill, absent under 40 words, and it steps aside for Find and for any open menu (`word-count.tsx`).
- The spelling pill uses the page background, control size, and Tab in the key size (`spell-pill.tsx`).

# Priority issues

**[P1] Vim normal mode takes the keyboard and does not say so.** Suggested command: `/impeccable clarify`, taken in harden because the task (writing) fails with no status.

With Vim on, Operate starts in normal mode (`haligtree-editor.tsx` around the editor mount; `vim-mode.ts` `handleTextInput` returns true outside insert). The caret shape changes (`haligtree-editor.scss` 475). The count widget is `aria-hidden` (`vim-mode.ts` 2184). Old installs can be turned on for you. Put a meta-size word, Normal or Insert, where it can be read, and announce the change.

**[P1] The format bar and the block grip are pointer-only.** Suggested command: `/impeccable adapt`.

Bold, the Aa button, and both grip buttons are `tabIndex={-1}`. Escape clears the selection instead of entering the bar. Task, Move out, Sync, Card, Duplicate, Color, and Copy link to this line have no keyboard path. Not fixed in this pass: a roving tabindex on a floating bar is a new interaction, and slash already covers "turn into". Recorded so it is not lost.

**[P2] The format bar fill is a kit panel.** Suggested command: `/impeccable polish`.

Left as decided. The 55% accent mix is on purpose so the bar does not read as a lit panel. It is opaque, not frost. Findings log, second critique, 17 Nov.

**[P2] Slash and the block menu are one long builder list.** Suggested command: `/impeccable layout`.

"Basic blocks" holds layout, math, and citations in one group. Delete has no rule above it. Not regrouped here. A split of that menu is a new information architecture, not a broken write.

**[P3] The filter is invisible, and two fields are body type.** Suggested command: `/impeccable typeset`.

The filter stays hidden until a character is typed. The field is `0.875rem` while the rows use `--text-control`.

# Personas

**Alex (power user).** `.vim-count` shows digits only, never the operator waiting after `d` or `c`. The document count is removed for the whole time the format bar is up, so a long selection cannot be counted and formatted together.

**Jordan (first-timer).** The empty page says "type / for commands…". Bold is an icon whose name is only in a tooltip. The grip labeled "Block actions" is invisible until hover and is not in the tab order.

# Minor

- Chrome copy uses an ellipsis, not an em dash. Align centre is spelled the book's way.
- An in-note h1 at `1.875em` on a `0.875rem` body is larger than the page title at `1.5rem`.
- The spell pill is `aria-hidden`, so the suggestion is visual only.

# Questions

Questions skipped: this pass was ordered through audit, harden, and polish. The P1 that blocks writing (Vim with no status) is the harden item. The accent-mix bar stays.

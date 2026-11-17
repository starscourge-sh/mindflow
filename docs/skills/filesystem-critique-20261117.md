Method: dual-agent (A: bc-6f90f3ac-4aad-59a7-ac45-2a38986d2f3a · B: bc-21fc4ac6-3523-5572-9155-c0ef3a23a72f)

Date: 2026-11-17. Surface: the note list, folders, groups, and drag, Operate mode. Files read: `note-list.tsx`, `kept-groups.tsx`, `carry.tsx`, `side-folders.tsx`, `split-drop.tsx`, `drag-words.ts`. Live Electron was not opened for the review. Browser overlay skipped: Electron, not a page URL.

# Design health

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 2 | In the list the card and the drop are the same sentence. Over the shelf, several notes still got a sentence about a list row at that height. |
| 2 | Match system / real world | 2 | A folder looks like a folder. A group is a second object, and the row offers Separate. |
| 3 | User control and freedom | 2 | Escape puts a drag back, and toasts undo. A reorder in a sorted list switches the sort with the suffix " · Custom order". |
| 4 | Consistency and standards | 1 | One gesture uses Move into, Move to, Add to, Remove from, Put inside, and Move out of. |
| 5 | Error prevention | 2 | A folder inside itself is refused. A multi-note drag onto the shelf was not: it reordered the list. |
| 6 | Recognition rather than recall | 2 | During a drag the card says the landing. After Got it, the three-gesture hint is gone. |
| 7 | Flexibility and efficiency | 3 | Several picked notes move as one block. The fast shelf gesture was the one that missed. |
| 8 | Aesthetic and minimalist design | 3 | The row and the hollow folder are quiet. Picking notes replaces the header with seven or eight buttons. |
| 9 | Error recovery | 2 | Refusals are sentences. A shelf miss only chimed stay, then moved the list. |
| 10 | Help and documentation | 1 | The help is one line, and Got it retires it. |
| **Total** | | **20/40** | **Acceptable** |

# Design specificity

The list is this book: a folder is a drawn tab, an empty one is a dashed hollow, a nameless note is "New note". The shelf and the selection bar are not. A folder under the pointer used to light blue, and the card kept talking about a row in the list.

Deterministic scan: `impeccable detect` on `note-list.tsx`, `kept-groups.tsx`, `carry.tsx`, `side-folders.tsx`, and `split-drop.tsx` exited 0 with `[]`. The row is drawn inside `note-list.tsx`. No user-visible overlay.

# Overall

Picking up a row feels like lifting a card. The shelf was a guess: several notes let go on a folder reordered the list. That is the gap.

# What's working

- The drop sentence is built from the layout the release would leave (`kept-groups.tsx`, the words for Move into, Add to, New group).
- An opened empty folder says the folder's own name and one button, New page or New gem (`items-view.tsx`).
- Several picked notes travel as one block, the ghost keeps titles, and Open on the left stays down. Verified in `split-drop.tsx` and left out of the issues.

# Priority issues

**[P2] Several notes onto a shelf folder edited the list.** `split-drop.tsx` returns no source when more than one row is picked, so the shelf never took the drag. The list aimed by height and the card said "Move N here". Filing from the menu still worked, so the task was not blocked. The gesture did a different edit. Fix taken in harden: the card says "Move N into Essays" and letting go files them. Suggested command was clarify.

**[P2] The left edge can take a single note aimed at a shelf folder.** The left place starts 40px left of the page. A folder under the pointer should beat Open on the left. Not this pass: one note already has a folder path, and the multi-note miss was the one that lied.

**[P2] The selection bar offers seven or eight actions and omits Move to folder.** That is a new arrangement of the bar. Left as it is. Move to folder stays in the row menu and on the open page.

**[P2] Filing uses four verbs, and a sort change hides in a suffix.** One verb for folder and group would be a new rule for the card. Left as it is. The shelf card now says Move into, which is the folder's own verb.

**[P3] An empty group borrowed the folder's sentence.** "Nothing in it yet" / "Drag notes in". A group does not take notes out of the list. Fix taken in polish.

# Personas

**Alex.** Selects several notes, drags them to a folder in the shelf, reads "Move 2 here", and lets go. The notes reorder. That was the red flag. The menu would have filed them.

**Jordan.** The hint is three gestures, and Got it removes it. A folder and a group then explain opposite jobs. The right-click offers Archive, Remove folder only, and Bin folder and notes.

# Minor

- The ghost fans at most three titles. The badge carries the rest.
- VoiceOver gets "Picked up" and how to drop or put it back (`drag-words.ts`).
- A shelf folder used to light blue. The multi-note landing now uses the same drop-hot ring as a list target.

# Questions

Questions skipped: this pass was already ordered (critique, audit, harden, polish) and leftovers are steered rather than parked. Five priority issues, so the skip is by that order, not by the under-3 count.

**Trend:** first run for `er-src-components-haligtree-note-list-tsx-b6049677`, no trend yet.

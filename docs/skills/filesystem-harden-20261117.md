Date: 2026-11-17. Surface: folders, groups, and drag. Command: harden.

# What broke on a real gesture

Two or more picked notes, let go on a folder in the shelf, reordered the list. The card said "Move 2 here". The folder stayed empty. One note already filed. The menu already filed. The several-note gesture did not.

# What changed

`kept-groups.tsx`. While several notes are carried, the real pointer is read (`pointerAt`, not the drag's vertical delta). Over `[data-folder-drop]` the card says "Move 2 into Essays", the folder takes the same drop-hot ring as a list target, and letting go sends `haligtree:folder-drop` with those ids. A folder of the other list is refused with the sentence already used for one note. Open on the left stays down.

# Left

- One note over the left edge can still prefer Open on the left. That path already files when the pointer is on the folder's name.
- The selection bar is unchanged.
- The four verbs on a list drag are unchanged.
- A sorted list can still switch to custom order from a drag.

# Taste

The folder lights with the existing drop-hot accent, not a new blue. The sentence is the one a single note already uses, with the count in front. No frost, no em dash.

# Proof

`qa/handover-shelf.mjs`. Old build: card "Move 2 here", Essays still 0 pages, load 2.51. New build: card "Move 2 into Essays", toast "Moved 2 notes to Essays", Essays 2 pages. Three times, loads 5.12, 6.11, 5.36.

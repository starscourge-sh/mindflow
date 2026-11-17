Date: 2026-11-17. Surface: the note list, folders, groups, and drag. Command: audit. No fixes in this command.

# Audit health

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | A drag tells VoiceOver the name and how to drop or put it back. Some shelf rows are shorter than 44px. |
| 2 | Performance | 3 | A long group draws only the rows near the screen. The drag does not animate layout on the shelf. |
| 3 | Responsive | 3 | A long folder name wraps to two lines. The drag is a pointer gesture. |
| 4 | Theming | 3 | Drop light uses the accent token. One shelf state still mixes a blue wash (`data-queue-hot`). |
| 5 | Integrity | 4 | Detector exit 0, `[]`, on the five markup files. |
| **Total** | | **16/20** | **Good** |

# Integrity

The list, the folder mark, and the drag card are one system. The detector found nothing to rename. The blue wash on a queue-hot folder is one leftover, not a second palette.

# Findings

**[P2] Several notes dropped on a shelf folder reordered the list.** Location: `kept-groups.tsx` aim, before this pass's harden. Category: implementation. The card said "Move N here" about a row at the same height. Recommendation: aim at `[data-folder-drop]` and file there. Taken in harden.

**[P3] Shelf rows are short.** `side-folders.tsx` uses `py-1` on the folder button. A pointer hits it. A finger on a phone would not. This app is the desktop window. Left.

No P0. No P1.

# What holds

Virtual rows, a refusal sentence for a folder that cannot take the note, and a drag overlay that does not depend on a new color.

# Next

Harden the shelf drop. Polish the empty group's sentence. Do not restyle the selection bar.

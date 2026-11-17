Method: dual-agent (A: bc-79d1b177-6081-50fa-9aa4-54af86636f6c · B: bc-40237fb4-2beb-526a-bcfa-713a5414bb06)

Date: 2026-11-17. Surface: the rest of the app after the editor, the prompt, and the note list. Operate mode. Files: `home.tsx`, `home-view.tsx`, `search.tsx`, `settings-view.tsx`, `goals-view.tsx`, `tasks-view.tsx`. Browser overlay skipped: Electron, not a page URL.

# Design health

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 3 | Safe mode, counts, and "Searching…" are clear. Settings is a blank section until the settings load. |
| 2 | Match system / real world | 3 | "Made it" and "Hold to delete" are plain. "Gems" and `kind:quote` still need a gloss. |
| 3 | User control and freedom | 3 | Esc, Cancel, and "Show everything". "Fresh start" acts at once and undoes from the toast. |
| 4 | Consistency and standards | 2 | Home's chip says "Notes". Search's chip says "Captures". |
| 5 | Error prevention | 3 | "Hold to delete" waits. Today warns when the list is long and still lets you add. |
| 6 | Recognition rather than recall | 2 | Wide sidebar rows are named. The foot is three icons. Search teaches `kind:quote`. |
| 7 | Flexibility and efficiency | 4 | ⌘K, ⌘B, ⌘,, splits, tabs, and drag onto Upcoming and Later. |
| 8 | Aesthetic and minimalist design | 3 | One settings section at a time. A lived-in Home still stacks many equal shelves. |
| 9 | Error recovery | 3 | Search and Settings say what failed. A miss is often a toast. |
| 10 | Help and documentation | 3 | "Show me around", keyboard shortcuts, and empty pages that say the next sentence. |
| **Total** | | **29/40** | **Good** |

# Design specificity

The shell is a Mac sidebar and a command palette, which is the right shape for a tool. The book shows up in the type, the cream and brown, and the sidebar foot being the book's name. Settings opens on "Your book". Search is built like a command bar and Settings is grouped like System Settings. The nouns on them are this book's: Gems, Journal, Look back, Bin.

Deterministic scan: exit 0. Four `design-system-font-size` hits, all in `settings-view.tsx` (0.625rem, 0.6rem, 0.6rem, 0.5625rem). The other five files were `[]`. No overlay.

# Overall

Coming back and a missed search are written in the book's voice. The gap is words that name one pile two ways, and a search row of six filters before you have typed.

# What's working

- Coming back says where you are and gives one way out: "Welcome back after {days} days" and "Show everything" (`home.tsx`).
- A search that misses tells you the next move, including a near spelling (`search.tsx`).

# Priority issues

**[P2] Home says "Notes" and search says "Captures".** Left. Search's Captures sits beside Gems, Tasks, and Events, so it is a type. Home's Notes is the inbox chip. Swapping one word would make the other row lie.

**[P2] Search shows six filters before a query.** Left. Hiding four chips until a word is typed is a new arrangement of the command bar.

**[P2] Appearance sets the theme twice.** "Theme" and "Turn the dial" are the same themes. Left. Removing the dial is a product cut, not a wording fix.

**[P3] The sidebar foot is three icons, and folder arrows wait for hover.** Left. The tips already name Bin, Archived, and What Haligtree can do.

**[P3] Today has three places to type one task.** The top field, "Write out my day", and the empty paper. Left. They are three arrivals at one list, and folding them is a new layout.

# Personas

**Alex.** Shortcuts are named. The New button's tip says ⌘N and the pill shows C. "Fresh start" has no confirm. The undo is the toast.

**Jordan.** An empty Home says the first act. She then meets Gems with no definition on the chip, and a foot of icons. Settings Help has "Show me around".

# Questions

Questions skipped: this pass was already ordered, and the five issues are wording and arrangement that were steered rather than parked. The skip is by that order, not by the under-3 count.

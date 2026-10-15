# A sidebar page switched off is gone from the sidebar

We first folded switched-off pages behind a "3 more" row inside each group and a More section for the rest (bee4f9b). It kept everything one click away but made the sidebar longer and harder to read, which defeated the point of switching pages off. Now a page switched off is not drawn at all; it is still a G and its letter, or ⌘K, away, "Show hidden pages" brings one back, and a group with nothing shown disappears. Commit a5dcbd3.

## Considered options

- Folds per group plus More: rejected, see above.
- Hide but keep a count: rejected, a count of things you chose not to see is noise.

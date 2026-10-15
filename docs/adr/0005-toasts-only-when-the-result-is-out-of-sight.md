# A toast only when the result is out of sight

Every change used to say itself in a toast, so a moved row, a tick or a changed colour all produced words to read about something already on screen. Now a change you can see answers with its sound and the change itself, and registers its undo through `quietly()` so ⌘Z still takes it back for ten seconds. A toast is kept for results out of sight, for saying where something went (the Bin, Archived), or for teaching the way back. Commit 5ecb33b.

## Consequences

- New code that changes something visible calls `quietly(undo)`, not `toast(...)`. A probe that expected a toast for a visible change is wrong, not the code.

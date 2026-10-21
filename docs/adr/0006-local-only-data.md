# Your notes live on this Mac, with no account

Haligtree keeps everything in one SQLite file and an assets folder in the app's data folder, opened only by the main process; there is no server, account or sync service. The only copy that leaves is a daily backup to your own iCloud Drive (or a folder beside the database without one). This keeps a private commonplace book private and makes it work offline, at the cost of no built-in multi-device sync. Small lookups that send a word or place (dictionary fallback, weather) send no notes. See docs/captures.md and src/main/backup.ts.

## Consequences

- Features that need a server (sharing, sync, collaboration) are out of scope unless this decision is revisited.
- A second set of notes is a second data folder (a book), which is how the sandbox works.

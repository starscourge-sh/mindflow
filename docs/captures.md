# Captures

Every capture is a row in one SQLite file:
`~/Library/Application Support/mindflow/mindflow.db` on macOS, and the
equivalent user data directory elsewhere. Pictures and files are not in it.
They sit in `assets/` beside it, named by the hash of their bytes, and a
capture points at them with a `mindflow://assets/<hash>.<ext>` URL.

```sql
create table captures (
  id          text primary key,
  number      integer,                    -- counts up from 1, shown as MF-30
  title       text not null default '',   -- the first line with words in it
  kind        text not null,              -- note, task, ...
  status      text not null default 'open',
  body        text,                       -- the TipTap document, as JSON
  captured_at text not null               -- ISO time
);
```

Only the main process opens the file (`src/main/captures.ts`, using Node's
built-in `node:sqlite`). Windows ask it over IPC.

## What the renderer can do

```ts
window.api.captures.list()            // every capture without its body, newest first
window.api.captures.get(id)           // one, with its body
window.api.captures.search(text)      // what `@` offers: title contains it, or MF-n starts with it
window.api.captures.create(patch)     // a new one, returns its id
window.api.captures.save(id, patch)   // title, kind, status or body; only what you pass
                                      // `markdown` in either patch is written to the backups, not the table
window.api.captures.onChange(reload)  // any window wrote; returns the unsubscribe
```

## How a capture reaches the main window

1. Cmd+Enter in the prompt calls `captures.create(...)`.
2. The main process inserts the row and sends `captures:changed` to every window.
3. The main window hears it and calls `captures.list()` again.

The windows never talk to each other. They each talk to the main process, so a
new window only has to listen for the same message.

## Backups

`src/main/backup.ts` copies everything to iCloud Drive
(`~/Library/Mobile Documents/com~apple~CloudDocs/mindflow/`), or to `backups/`
beside the database when there is no iCloud Drive.

```
database/   mindflow-2026-10-02.db, one a day, the last 30 kept
assets/     every picture and file, copied once and never removed
captures/   MF-30.md, each capture as Markdown, rewritten on every save
```

The database copy is made with `vacuum into`, on start and checked hourly. To
restore one, quit the app and copy it over `mindflow.db`.

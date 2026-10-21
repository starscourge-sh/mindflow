# "Task" is the one word for things to do

Haligtree had a capture kind called Todo, a task list called Tasks, and tick boxes inside notes also called to-dos, so one idea wore three names. We call the kind and the list item a Task everywhere on screen, and a tick list inside a note a Checklist. The stored kind id stays `todo`, because renaming it would mean migrating every existing database and backup file for a word nobody sees; typing "todo" still finds both. Commit 95cd231.

## Consequences

- New UI copy must never say "todo" or "to-do". Code and comments may still say `todo` when they mean the stored id.

# What Haligtree is

Copied from the product notes on 23 Nov 2026. Read with [audience.md](audience.md) (who it is for) and [work-waiting.md](work-waiting.md) (what is queued).

## A commonplace book

Haligtree (formerly Vigil; the code, the repo folder `mindflow` and the data folder still carry old names) is a commonplace book for the Mac. In the founder's words: "it's a commonplace book for the most part, what I have converged on that Notion, Obsidian, Todoist and Anki were missing."

It fills what each of those misses:

- **Notion and Obsidian** let notes sit. In Haligtree notes come back: spaced review, the Feed, Home and resurfacing.
- **Todoist** keeps tasks without the why. Haligtree keeps tasks with their context, linked to the note they came from.
- **Anki** makes you write cards by hand, apart from your reading. In Haligtree cards come from what you read and wrote, and keep their source and page.
- **Notion and planners** are workspaces for what you are doing. Haligtree is a book for what you are learning.

It is quick captures plus long notes (wiki or Notion-like pages), for researchers, students and anyone who reads and writes to think. It is not a Raindrop-style capture tool. Success is "did I learn it and can I find it again?", not "is it in the system?".

The line: "Your notes, books and cards in one place, and they come back to you." You do the thinking; Haligtree does the remembering and the timing. AI is optional, outside, and never writes the person's notes.

Copy and onboarding speak of "your commonplace book". Naming the tools in plain text is fine ("for you if you've lived in Obsidian, Notion, Anki and a bit of Todoist"); no logos. Show long notes and the note-to-capture flow, not only quick capture.

## Order says what it is for

Haligtree is writing first. In every sidebar, chip row, grouped list, kind picker, menu and section order, notes and pages come first and tasks after (Note, Task, then Quote, Word, Link, Check back). Keep one shared kind order in the code and check every new list against it. The founder raised this twice: the sidebar "looks like a tasks app first", and a page once listed Tasks before Note.

## It will be sold

Anything shipped must be licensed for commercial use. No feature may rest on a non-commercial API key (for example TMDB's free key or OMDb) or on fair-use images (modern film posters are copyrighted). Use original drawn art or public-domain art. The welcome's film stories use drawn posters for this reason.

## The sandbox's flavour

The sandbox (the demo book) should read like a real person's commonplace book and show every feature. Its flavour: Star Wars, Lord of the Rings, Dune, Frankenstein, Greek myth, Renaissance art (Leonardo, Michelangelo, Botticelli, Masaccio, Raphael), Elden Ring lore (flavour titles only), Austen, Shelley, Wilde, Orwell, Sagan, Nietzsche, Aristotle, maths and physics.

Anything bundled stays public domain: pre-1900 paintings and public-domain texts live in `src/renderer/src/assets/sandbox` with a `SOURCES.txt`. The founder's own copyrighted books and pictures may be pulled from their Documents folder at seed time, on their machine only, and are never committed.

## The first imports

The first real imports will come from the founder's Obsidian vault: a long engineering handbook note, a YouTube content pipeline (several linked notes with screenshots), a product's requirements and specification documents, about 146 university course notes (85 MB with attachments) and about 459 AWS cloud notes. These are long, structured, technical documents (headings, tables, code, images, links), not short captures, so they are the real test of the importer and of reading and editing long notes. Test against copies, never the vault itself, and judge fidelity, long-note speed and how they read.

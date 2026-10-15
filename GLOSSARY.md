# Vigil

Vigil is a commonplace book for students, readers and writers: you catch a thought in a second, keep what matters, and it comes back to you. These are the words the app uses on screen, the one to pick when several exist, and (where the code says it differently) the name a developer will find in the source.

The bold word is what a person sees. `Code:` names what to grep for. `Not:` says what it is easily mistaken for. `_Avoid_:` lists words that must not appear in the UI for it.

## Catching things

**Quick capture**:
The small window that opens over any app with ⌘. (or the menu bar) to write one thing down and send it with ⌘↵. Spoken of as "the box" only in passing.
Code: `App.tsx`, `box`, `prompt`.
Not: a page of the main window.
_Avoid_: prompt, popup, launcher

**Capture**:
Anything sent from quick capture (or imported), of any kind, from the moment it is caught. Every capture starts in the Inbox.
Code: `captures` table, `type: 'capture'`.
Not: a gem, question, goal or article; those are made *from* a capture and live apart from it.
_Avoid_: item, entry, record

**Kind**:
What a capture is, picked in quick capture or guessed from its words. One of: Note, Task, Quote, Word, Link, Decision, Experiment.
Code: `kind`, `CAPTURE_TYPES`.
_Avoid_: type (in the UI), category

**Note** (kind):
A capture that is none of the other kinds; the default.
Code: kind `note`.
Not: the general word "note", which in sentences means anything with a page you can open and write in (a capture, gem, article, question or goal).
_Avoid_: memo, thought (as a kind name)

**Task** (kind):
A capture that is something to do. It goes straight to the task lists, its day, time and priority read from the words as you type.
Code: stored kind id `todo` (kept for old data and search; never shown).
Not: a "todo" or "to-do": that word is retired in the UI, though typing "todo" still finds tasks and checklists.
_Avoid_: todo, to-do, action, action item

**Quote**:
Someone else's words, kept with who said them and where.
Code: kind `quote` (old `excerpt` became a quote).
_Avoid_: excerpt, highlight, clipping

**Word**:
A word you want to learn; it comes back in Review asking what it means. Its meaning comes from the Mac's dictionary as you type.
Code: kind `word`, `word_meanings`.
_Avoid_: vocab, term, definition

**Link**:
A web page kept as a card with why it is worth reading.
Code: kind `link`.
_Avoid_: bookmark, URL (in prose)

**Decision**:
A choice you made, which comes back on the date you set so you can check it still holds.
Code: kind `decision`.
_Avoid_: choice, ADR

**Experiment**:
Something you are trying until a date, after which Vigil asks what you found.
Code: kind `experiment`.
_Avoid_: trial, test

**Tag**:
A `#word` in a capture's text that groups it with others; listed under Tags in the sidebar.
Code: `tags`, `tag_meta`.
_Avoid_: label, category, folder

## Where captures go next

**Inbox**:
The place every new capture waits until you deal with it. Capitalised as a place name.
Code: view id `inbox`; captures with status `open` and not archived.
_Avoid_: queue, unsorted, triage

**Everything**:
One list of all you have kept, notes and tasks together, with chips to choose what shows.
Code: view id `all`, `everything.tsx` (once called "All captures").
Not: the Inbox (Everything keeps things after they leave it).
_Avoid_: All captures, All notes, Library

**Saved as a gem**:
A capture you chose to keep in your own words; the capture stays as it was and a gem is made from it.
Code: capture status `promoted`.
Not: a capture that went into a question, which shares the stored status but says where it went: "Made into a question", or "A clue in “…”" (code: `keptIn` on the capture list).
_Avoid_: promoted, kept as an idea

**Resolved**:
A capture you are done with, out of the Inbox but still in Everything. Making a capture into tasks also resolves it.
Code: capture status `resolved`; exit key R.
_Avoid_: done, closed, dealt with

**Made into tasks**:
A capture that became one or more tasks; Everything hides it behind the task it became until you pick the "Made into tasks" chip.
Code: status `resolved` plus `task_links`.
_Avoid_: converted, promoted

**Bin**:
The one place anything removed goes, of every kind, until you bring it back or delete it for good. The action is always "Move to the Bin".
Code: view id `discarded`; capture status `discarded`, task status `dropped`.
_Avoid_: Trash, Discard, Delete (except "Delete for good" inside the Bin), Let it go

**Archived**:
Kept, but out of sight: not in the Inbox or lists, never in the Bin, back any time. "Put old captures away" archives on its own after a while.
Code: `archived_at`, view id `archived`, `put_away`.
Not: the Bin.
_Avoid_: hidden, shelved, stored

**Let go** (questions and goals only):
How a question or goal ends when you stop pursuing it. On screen: "Stop asking" for a question, "Give it up" for a goal.
Code: `closedHow: 'let go'`.
Not: moving something to the Bin.
_Avoid_: "Let go" as a label anywhere

## What you keep

**Gem**:
An idea kept in your own words, made from a capture or written fresh; it comes back to you and can be tested in Review.
Code: `nuggets` table, tier `nugget`, view id `nuggets`.
_Avoid_: nugget, idea, insight (in the UI)

**Writing**:
The page that holds your articles. One item on it is an Article, in every list, search result and the Bin.
Code: view id `articles`, tier `article`.
Not: Settings' Writing section (how writing in a note behaves), nor the keys for writing in a note (the "Editing" group).

**Article**:
One longer piece in your own words, one idea each, often started from several gems or from a question's clues. Listed under Writing.
Code: tier `article`.
_Avoid_: essay, post, document

**Question**:
Something you are still working out and are not ready to answer; you hold it open and add clues as they turn up.
Code: tier `question`.
_Avoid_: open question, problem, inquiry

**Clue**:
A line kept under a question because it may help answer it ("a piece of the answer"). Taken off with "Remove the clue", which never goes to the Bin.
Code: a row in `glosses` on a question; `addClue`, `cutClue`.
_Avoid_: note, evidence, gloss

**Goal**:
A day you are aiming for and the road of days to it, kept in sight by a goal card on the desktop.
Code: tier `goal`.
_Avoid_: target, objective, milestone (a milestone is a step on a goal's road)

**Log**:
One dated line kept against a goal or a task: what you did, where it stands, what you think. All of them are its logs ("2 logs", "kept with its logs"); one is taken off with "Remove the log".
Code: goal logs are `glosses` rows; a task's thoughts and a focus session's log (`session_log`) read into the task's logs.
_Avoid_: journal, diary, update, entry, "the log" for the whole list

**Thought**:
One dated line kept beside a note, gem or other kept thing, without changing the note itself: what it means to you now. They pile up newest first under "Thoughts on this note"; the ; key adds one. On a question the same line is a Clue, on a goal or a task a Log.
Code: a row in `glosses`; `GlossTimeline`, `keepGloss`, word note id `gloss`.
_Avoid_: gloss, comment, annotation, "note on an item"

**Goal card**:
A goal's small card on the desktop, with the days left.
Code: `goal-beacon.tsx`, setting `goalBeacon`, word note id `beacon`.
_Avoid_: beacon

**Old captures**:
A few captures you never dealt with that come back as cards when quick capture opens (Settings: "Captures that come back").
Code: `rot-cards.tsx`, word note id `rot`.
_Avoid_: rot cards, rot

**Queue**:
What you mean to read next, in order.
Code: view id `queue`, `reading_queue`.
Not: Review's set of cards for today.
_Avoid_: reading list, backlog

**Checklist**:
A list of boxes to tick inside a note. A checklist line can be linked to a task and ticks with it.
Code: Tiptap `taskList` / `taskItem`.
Not: a Task.
_Avoid_: to-do list, todo

**Sticky note**:
A note or list stuck on the desktop, outside the main window.
Code: `sticky-note.tsx`.
_Avoid_: widget, pin

## Review

**Review**:
The daily session where cards come back to you for recall, graded Again, Hard, Good or Easy, and spaced so each returns just before you would forget it.
Code: view id `review`, `review_log`.
_Avoid_: study, flashcards, quiz (as the page name)

**Paused** (in Review):
A card taken out of Review until you bring it back ("Pause", "Back in Review"), offered when a card keeps slipping and on the Struggling shelf.
Code: `suspended`.
Not: Set aside (Tidy's wait for deciding day), nor a card put off with Not today (back tomorrow).
_Avoid_: set aside, suspended, resting

**Card**:
One thing to recall in Review: a gem, a word, or a line written as a card in a note.
Code: tier `card` for a line card; `Due`.
Not: a board card (a row in a note's board), a link card (a web page's preview), or a goal card (on the desktop). Say those in full.
_Avoid_: flashcard, item

## Tasks

**Task**:
Something to do, with an optional day, time, length, priority and steps. Made in quick capture, in Today, from a note's line, or from captures. One not done yet is Open (Everything's chips: Open, Done, Both); counts say "6 open · 1 done".
Code: `tasks` table.
_Avoid_: todo, to-do, action, "To do" (as the state or a count)

**Today**:
The tasks due today and any that are late. Shown as a List, a Page or the Matrix (the same three words in the Display menu).
Code: view id `today`; the Page way is group `page`.
Not: Today's page.
_Avoid_: Written out

**Upcoming**:
Tasks with a day ahead of today, by day.
Code: view id `upcoming`.
_Avoid_: Scheduled, Future

**This week's tasks**:
This week's tasks, day by day, with how full each day is.
Code: view id `week`.
Not: the Week's page.

**Later**:
Tasks with no day yet: This month, This year and Someday.
Code: view id `later`.
_Avoid_: Someday (as the page name), Backlog

**Routines**:
Tasks that repeat.
Code: view id `routines`.
_Avoid_: Habits, Recurring

**Matrix**:
Tasks in four boxes, urgent by date and important by flag. Both its own page (all tasks) and a way to show Today (today's tasks only).
Code: view id `matrix`, `matrix-view.tsx`; Today's `group: 'matrix'`.
_Avoid_: Eisenhower, Quadrants, Priority grid

**I have 15 minutes**:
The open tasks short enough for the time you have.
Code: `fits.tsx`.

**For tomorrow**:
The box at the end of Today and Today's page after the evening hour, where each line becomes a task for tomorrow.
Code: `tomorrow-lines.tsx`.
_Avoid_: brain dump, worry list

**Focus session**:
A timed stretch of work on one task, shown in the session bubble, with breaks between.
Code: `focus-pill.tsx`, `sessions`, `focus`.
_Avoid_: pomodoro, timer (a timer has no task), pill (in the UI: it is the "bubble")

## Days and seasons

**Today's page**:
One page a day: a line you write, with what you caught, finished and reviewed that day gathered under it.
Code: view id `day`, `day_pages`.
Not: Today (the task list), nor Today's "Page" way of showing tasks.
_Avoid_: daily note, journal

**Week's page** / **Month's page** / **Year's page**:
A week, month or year in a few lines, written and gathered like Today's page.
Code: view ids `weekpage`, `monthpage`, `yearpage`; `period_pages`.

**Close the day**:
The short evening pass: what got done, each open task sent to tomorrow, next week or the Bin, anything for tomorrow, one line for Today's page, and tomorrow's first task.
Code: `close-day.tsx`.
_Avoid_: wrap up, shutdown, end of day review

**Close the week**:
The weekly pass: how the week went and whether next week fits.
Code: `close-week.tsx`.

**Close the season**:
The part Close the week grows once a quarter: is the playbook still true, what mattered most, how the goals stand.
Code: `season.tsx`.
Not: a screen of its own.
_Avoid_: quarterly review

**Playbook**:
One pinned article called "How I work", about yourself, brought back each season.
Code: `lib/playbook.ts`.
_Avoid_: manual, README

**Tidy**:
A few minutes tagging your latest captures.
Code: `openPass('tidy')`, `pass.tsx`.

**Deciding day**:
The day each week you decide what waited: keep it, finish it, or move it to the Bin.
Code: `openPass('decide')`.

**Set aside**:
A capture marked in Tidy (or on a card that has waited) to wait for deciding day. Only that.
Code: `back_at`, `comeBack`.
Not: Paused, in Review.

## Coming back

**Hint**:
Something you kept, shown back to you in quick capture now and then.
Code: `hint-card.tsx`, `hint_events`.
Not: what a page is for (the one line explaining a page the first time you reach it; the setting "What pages are for", code `pageHints`).

**Memory**:
A hint from around this day in an earlier year ("A year ago today"), the way Photos brings them back.
Code: `memory`.

**Postcard**:
How a memory and the pictures in notes look when the Postcards setting is on: a white-bordered print on the desk.
Code: setting `postcards`, `memory-postcard.tsx`.
_Avoid_: polaroid, print (as the name)

## The app

**Home**:
Where the main window opens and things come back to you.
Code: view id `home`.

**Sidebar**:
The main window's list of pages, in four parts: those at the top, the **Tasks** group, the **Saved** group, and those at the bottom. A page switched off is not in the sidebar at all; G and its letter or ⌘K still opens it.
Code: `SECTIONS`, `sidebarParts`, settings `sidebarShown`, `sidebarOrder`.
_Avoid_: More, "3 more", folds (retired)

**Saved**:
The sidebar group (and quick capture tab) for what you keep: Gems, Writing, Questions, Goals, Queue.
Code: group `Saved`; box tab id `kept`.
_Avoid_: Library, Kept

**Book**:
One set of your notes, in its own data folder.
Code: data folder.
_Avoid_: vault, workspace, account

**Sandbox**:
Someone else's book full of examples, to look around in without touching your own.
Code: `--sandbox`, `sandbox.ts`.
_Avoid_: demo, playground

**Welcome**:
The two-minute start on a fresh install: the one key, your first capture, and a few questions whose answers set up the sidebar.
Code: `welcome*.tsx`.
_Avoid_: onboarding (in the UI)

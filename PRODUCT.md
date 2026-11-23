# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Mac-first desktop app built with Electron, React and TipTap. It must feel native to macOS: traffic lights, haptic taps, system dictation and transcription, Apple, Arc and Things-level polish. A phone app is not built; phone review over home Wi-Fi is planned, not decided.

## Users

Two primary audiences, equal weight:

1. **The Anki and Obsidian (or Notion) academic.** An Anki enthusiast who also takes notes in Obsidian or Notion: a PhD student or academic (history, science, psychology, biology, maths) or a lifelong learner. They read hundreds of PDFs, keep quotes with citations, make cards (basic, cloze, reversed, image occlusion), and live by the review heatmap and streak. Haligtree must let them do everything they did in Anki and Obsidian, at least as fast, plus what only works when cards, notes and PDFs share one place.
2. **The person "interested in too many things".** Curious across words, old art, ancient history, physics, films, music and poetry. They notice the links between unrelated things, go deep in seasons, and feel guilty about the pile ("piles of notes rotting in Obsidian", "what was I saving this for"). They value doing the thinking themselves and have taste.

Second audience: curious builders and developers who find Haligtree through the founder's Starskourge channel.

## Product Purpose

Haligtree is a commonplace book: notes, quotes, gems, PDFs, words and study cards kept in one place, and they come back to you through spaced review, the Feed, Home and resurfacing. Success is "did I learn it and can I find it again?", not "is it in the system?".

## Positioning

"Your notes, books and cards in one place, and they come back to you." You do the thinking; Haligtree does the remembering and the timing.
- Against an AI second brain: nothing ingests while you sleep, and no AI writes your notes.
- Against Obsidian alone: notes resurface instead of rotting.
- Against Anki alone: cards come from what you read and wrote, and keep their source and page.
- Against Notion and planners: a book for what you are learning, not a workspace for what you are doing.

## Operating Context

The user reads a PDF or web page beside a note, highlights, and turns lines into gems, quotes and cards with their page. They capture fast from anywhere: the ⌘. quick capture window, dictation, snips, and stickies on the desktop. They review daily, and the heatmap and streaks matter. They import from Anki (.apkg), Obsidian vaults, Notion and Markdown. Typical libraries are large: hundreds of PDFs, thousands of cards and notes, long lists.

## Capabilities and Constraints

- Local-first: SQLite database, an optional live Markdown copy, full export. No servers run by the maker.
- Spaced review built in (FSRS-style scheduling, per-deck retention), decks as tags, Anki import.
- PDF and web reader with highlights, page links and citations.
- Links, embeds (![[ ]]), backlinks, a Map (graph) as a way back in, never the headline.
- Will be sold: no non-commercial APIs or fair-use images in shipped features; art is drawn or public domain.
- Undecided: sync (CloudKit vs plain files), price shape, MCP for outside AI, phone app.

## Brand Commitments

- Name: Haligtree (formerly Vigil). Elden Ring naming runs through the founder's world.
- Voice: plain English at a high-school level, no jargon, no em dashes; UI labels quoted in curly quotes in sentences.
- The app feels alive: sounds per action, animated icons, hint sentences that type in, without becoming noisy.
- AI is optional, outside, and never writes the user's notes.

## Evidence on Hand

- Audience research in the founder's words and the audience's own posts: the Haligtree Audience artifact, the founder profile ("Who Starskourge Is"), and transcripts of Anki and Obsidian users (Ali Abdaal, Meredith, Ray Amjad, Ishan, Corinna, an academic physician, a novelist).
- No customers, testimonials, pricing or press yet. Do not invent any.

## Product Principles

1. You do the thinking; the app does the remembering. Every connection shows why it exists and links to its source.
2. Capture in one or two steps everywhere; a feature that adds steps fails.
3. Everything still works and reads well at scale: thousands of items, long titles, big numbers.
4. The right-click menu does the work; hovers preview, one surface at a time.
5. Every claim the app makes is true in the current build.

---
name: Haligtree
description: A commonplace book for the Mac, set in cream paper and brown ink.
colors:
  golden-brown: "#8f5c0c"
  on-accent-white: "#ffffff"
  ochre-heading: "#816421"
  moss-green: "#4f6e3c"
  brick-red: "#a2433a"
  stone-gray: "#6e6457"
  walnut-brown: "#85603f"
  burnt-orange: "#985424"
  slate-blue: "#3f6787"
  faded-plum: "#6f5486"
  dusty-rose: "#94506e"
  cream-paper: "#f3ead7"
  brown-ink: "#4a4034"
  faded-ink: "#62584b"
  paper-shade: "#ece3d0"
  parchment: "#e4dbc8"
  worn-parchment: "#d8cfbd"
  ink-hairline: "rgba(74, 64, 52, 0.11)"
typography:
  title:
    fontFamily: "'Fraunces Variable', Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 500
    lineHeight: "1.875rem"
    fontVariation: "'SOFT' 20, 'WONK' 1"
  lead:
    fontFamily: "'Fraunces Variable', Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: "1.5rem"
    fontVariation: "'SOFT' 20, 'WONK' 1"
  reading:
    fontFamily: "'Fraunces Variable', Georgia, serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: "1.625rem"
    fontVariation: "'SOFT' 20, 'WONK' 1"
  heading:
    fontFamily: "'Fraunces Variable', Georgia, serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: "1.25rem"
    fontVariation: "'SOFT' 20, 'WONK' 1"
  body:
    fontFamily: "'Fraunces Variable', Georgia, serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
    fontVariation: "'SOFT' 20, 'WONK' 1"
  control:
    fontFamily: "'Fraunces Variable', Georgia, serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: "1.125rem"
    fontVariation: "'SOFT' 20, 'WONK' 1"
  meta:
    fontFamily: "'Fraunces Variable', Georgia, serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1rem"
    fontVariation: "'SOFT' 20, 'WONK' 1"
  key:
    fontFamily: "'Fraunces Variable', Georgia, serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1
    fontVariation: "'SOFT' 20, 'WONK' 1"
  signature:
    fontFamily: "'Haligtree Signature', cursive"
rounded:
  xs: "4px"
  sm: "4px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  full: "999px"
spacing:
  unit: "4px"
  inset: "8px"
  edge: "12px"
  gap: "16px"
  page: "20px"
  chrome-top: "52px"
components:
  button-primary:
    backgroundColor: "{colors.golden-brown}"
    textColor: "{colors.on-accent-white}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "28px"
  button-primary-hover:
    backgroundColor: "color-mix(in oklab, #8f5c0c 80%, transparent)"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.brown-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "28px"
  button-ghost-hover:
    backgroundColor: "color-mix(in oklab, #d8cfbd 50%, transparent)"
  input:
    backgroundColor: "color-mix(in oklab, rgba(74, 64, 52, 0.22) 30%, transparent)"
    textColor: "{colors.brown-ink}"
    rounded: "{rounded.md}"
    padding: "2px 8px"
    height: "28px"
  menu:
    backgroundColor: "{colors.parchment}"
    textColor: "{colors.brown-ink}"
    rounded: "{rounded.lg}"
  menu-item:
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "4px 8px"
    height: "28px"
  menu-item-hover:
    backgroundColor: "{colors.worn-parchment}"
  tooltip:
    backgroundColor: "{colors.parchment}"
    textColor: "{colors.brown-ink}"
    typography: "{typography.meta}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
  hover-card:
    backgroundColor: "{colors.parchment}"
    textColor: "{colors.brown-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.xl}"
    padding: "12px"
    width: "320px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.faded-ink}"
    rounded: "{rounded.full}"
    padding: "0 10px"
    height: "24px"
  chip-on:
    backgroundColor: "color-mix(in srgb, #8f5c0c 18%, transparent)"
    textColor: "{colors.brown-ink}"
  tab-track:
    backgroundColor: "color-mix(in oklab, #d8cfbd 40%, transparent)"
    typography: "{typography.control}"
    rounded: "{rounded.lg}"
    padding: "2px"
    height: "32px"
  tab-selected:
    backgroundColor: "{colors.cream-paper}"
    textColor: "{colors.brown-ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "28px"
  switch-on:
    backgroundColor: "{colors.golden-brown}"
    rounded: "{rounded.full}"
    width: "28px"
    height: "16.6px"
  settings-island:
    backgroundColor: "color-mix(in oklab, #d8cfbd 25%, transparent)"
    rounded: "{rounded.xl}"
    padding: "12px 16px"
---

# Design System: Haligtree

## Overview

**Creative North Star: "The Kept Book"**

Haligtree is a well-made commonplace book lying open on a scholar's desk: cream paper, brown ink, a golden-brown thread for the one thing that matters, and marginalia in a quiet hand. The chrome around the page is deliberately quiet. Sidebars, toolbars and menus are drawn in the same paper and ink as the page, a few tones apart, so the eye passes over them and lands on what the reader kept. The app recedes; the reader's own words are the hero.

The standard is the founder's own: "calm, warm, crafted, paper-like", minimal "but not empty and souless", "alive, not ingratiating", and finished to the bar of "something a top 3 design agency would output", where "a human trully took their time obssessing over the (alsmost) unneccessry detail". The craft they admire is cinematic (pacing, sound design, editing rhythm), and it shows here as motion and sound timed like a film rather than decoration. The world is named from Elden Ring and flavoured with references people love (myth, Tolkien, Renaissance art), told through drawn or public-domain art: scenery that drifts like handheld video, never a stock picture or a game screenshot.

The density is that of a good notebook: tight vertical rhythm, one column, one left edge, nothing cramped and nothing touching an edge. Everything is set in one characterful serif with its soft terminals and wonky letterforms switched on, so labels, menus and notes read as one book rather than an app wrapped around a document. Depth comes from tone first; floating things are solid sheets with one soft shadow, never glass. Controls look as if macOS made them, but they are built from Haligtree's own pieces, sit still at rest, and answer every touch: a 0.97 press, a short synthesised cue, a haptic tap, an icon that moves when pointed at.

Named visual rejections, in the founder's words: "vibe coded slop" and every AI-slop tell (a rounded element with a coloured border on one side, which "reaks of a.i slop ui"; identical tall tiles; stock icon clusters; pills on things that are not buttons; bright icon tiles; neon glows on what should be ink; clip-art on things meant to look real); stock browser controls and bolted-on cards; "little random popups and tooltips that dont even look like they belong in the app"; greeting-card headlines; zoom-drift scenery, which "can look tacky"; and any see-through layer in the main window.

### References
| reference | what Haligtree takes from it |
|---|---|
| Dia | serif display headings over a plain text face; explanations as a bold first phrase, one plain sentence and an italic "Try it" line; a misty, slow onboarding arrival; quiet indicators instead of coloured borders; handwriting for attributions; "Tuesday morning familiarity" |
| Arc | the onboarding spark and burst; a colour per space tinting accent and sidebar; a calm inbox where old things tidy themselves away |
| Apple / macOS | continuity (small windows grow into the main one), Quick Look peeks that grow from their spot, System Settings islands, the wrong-password shake, drop-in notifications, keycaps, Finder selection, the Calendar header |
| Linear | three panes, the Display menu, ↑↓ "3 / 30" stepping, properties in a right Details panel, a Format menu in the selection bar |
| Notion | a six-dot grip that opens a menu, an emoji before the title, captions, columns, a quiet footer, sidebar hover previews, radius that scales with the box, the Calendar month and week look |
| Raycast | quick capture summoned over any app, Esc backs out one layer, an action palette with keys, a Settings window with a left list, the focus-end screen glow, zen mode |
| Obsidian | backlinks, hover preview, ghost links, App size and Text size controls |
| Todoist | quick add that highlights each parsed token as you type |
| Things | keyboard selection on every list |
| Spotify | Home shelves and quick tiles, cover zoom, a Wrapped-style monthly story |
| Stripe Press | real 3D book objects you can grab, turn and throw |
| Wikipedia | the hover card: bold name in one lead sentence, picture square-cornered on the right |
| Nothing phone | dense dot fields for countdowns, always full |
| Gruvbox | the warm gold-brown accent of the Paper theme |
| Midori / Stalogy notebooks | grid and dot paper that sits in the page |
| Claude Code | a moving shimmer on the one line you must act on |
| WhatsApp | a link card fetched in the background as soon as a link is pasted |
| Apple Preview | grouped pill toolbars, a highlighter split button, the sidebar display menu, the Info inspector in grouped rounded cards, "Page 1 of 296" under the title |
| iPad Books Look Up | a popover tied by an arrow to the picked word, lead picture, short extract with an inline "More" |
| Finder gallery | a reading pile as a cover grid with a right inspector |
| Attachment hover scrub | hovering a PDF shows its cover in a small card; sliding across flips pages with "8 / 17" in the corner; a click opens at that page |
| Anki (as experts use it) | the comeback time as the big line, a heatmap shaded by volume, a monthly Wrapped; Anki's own look is not copied |
| Mento | one calm "Start" with "Maybe later"; not its locks, "0 day streak" or confetti for one card |

**Key Characteristics:**
- Cream paper and brown ink, never white and black; one golden-brown accent.
- One serif face (Fraunces, SOFT 20, WONK 1) for chrome and content alike; six sizes only.
- One page column and one left edge on every page.
- Opaque floating sheets in one material with one shadow token; glass only from the shared frost materials (.mf-frost, .mf-blur-edge), never a blur of its own.
- Radius that grows with the box: 4, 8, 10, 14, fully round.
- Native, quiet, alive: every press answers within 120ms with motion, sound or a haptic tap.
- Drawn or public-domain art only; realism first.

### Named Rules
**The Quiet Chrome Rule.** Chrome is paper and ink a few tones off the page, plain line icons in muted theme colours, controls that appear when you go looking. Only the reader's words, and the one line that needs acting on, get colour or motion.

**The Alive Not Ingratiating Rule.** Every action answers in proportion to how often it happens: a press gets 0.97 and a quiet cue, a real milestone gets a ceremony. Celebrations are rare, never one per tick, never guilt.

## Colors

A warm, low-contrast palette of old paper and brown ink, every surface mixed from the same two colours, with one golden-brown accent and nine ink hues pulled toward the page so nothing shouts.

### Primary
- **Golden Brown** (golden-brown): the accent of the default Paper theme, after Gruvbox light. It is the caret, the selection (at 30%), the focus outline (at 70%), filled primary buttons, the on state of switches, the tick in a chosen chip and the Undo link in a toast. It carries the accent ramp: 50 to 300 mixed toward white at 15, 30, 50 and 72%, 500 to 950 mixed toward black at 91, 84, 68, 52, 40 and 24%.
- **On-Accent White** (on-accent-white): never hand-picked. Text on a filled accent is computed from the accent's lightness, dark ink above oklch L 0.62 and white below it; on Golden Brown that gives white.

### Secondary
- **Ochre Heading** (ochre-heading): headings inside notes (the prose heading role) and the middle dot of the Paper theme's swatch.
- **Moss Green** (moss-green): quotes in prose, and the only colour that means success (the toast's check).
- **Brick Red** (brick-red): inline code in prose and every destructive action, always as text or a tint (10 to 20%), never a solid red fill.

### Tertiary
- **Stone Gray, Walnut Brown, Burnt Orange, Slate Blue, Faded Plum, Dusty Rose** (stone-gray, walnut-brown, burnt-orange, slate-blue, faded-plum, dusty-rose): the remaining block hues the editor paints text, marks and highlights with, and the set tags and kinds are coloured from. Burnt Orange marks warnings, Slate Blue information, Dusty Rose gems, Faded Plum what Review asks. Each reaches 4.5:1 on the page.

### Neutral
- **Cream Paper** (cream-paper): the page. On Paper and Light the window is painted solid in it.
- **Brown Ink** (brown-ink): body text and the source of every surface, hover and border.
- **Faded Ink** (faded-ink): quiet words (metadata, idle chips, placeholders, and the quiet parts of notes and the PDF reader, whose `--mf-muted` is Faded Ink); ink at 74% over the page, raised to 86% on Paper, 81% on Everforest and 78% on Tokyo Night and Obsidian Nord, so small text reaches 4.5:1 on the page, on a card or menu and on a hovered or picked row or a keycap in every theme (test/theme-contrast.test.ts). `--mf-muted-strong` sits half way from it to the ink, and is what a word a step louder than quiet wears (never the ink at 80%). On a fill louder than the row wash (Brutal's accent wash under a row pointed at, open or chosen; a picked row's accent tint) quiet words and their icons step up to the strong step, set again on the row (brutal.css, main.css), as frost and glass set Faded Ink again. A row set aside (a closed question or goal, a paused card, a held task) is never dimmed whole: every word in it wears Faded Ink, its name too, and its pictures and icons drop to half (`data-set-aside`).
- **Paper Shade** (paper-shade): surface step 50 (ink at 4%), the card behind a panel.
- **Parchment** (parchment): surface step 100 (ink at 9%), the card and popover fill: every menu, tooltip, hover card and dialog.
- **Worn Parchment** (worn-parchment): surface step 200 (ink at 16%), the hover and selected wash for rows, ghost buttons and menu items; the sidebar wears it at 20% and settings islands at 25%.
- **Ink Hairline** (ink-hairline): ink at 11% alpha, every border and divider. Hovers and borders use ink alpha steps (5, 7, 11, 22%) so they never cool a warm page.
- **Float** (`--mf-float`, the theme's popover, opaque): the one fill of everything that floats over other apps: stickies, the focus pill, the meeting card and the nudge card, with `--mf-float-ring` (ink at 10%). Quick capture wears macOS 26 Spotlight's material instead: the Mac's blur of the desktop cut to the card, its round controls and every menu hanging from them, under a wash of the page colour (`--mf-glass-fill`, 78% light, 74% dark), a lit white hairline brighter along the top edge (`--mf-glass-rim`), a fine dark outer line and a wide soft shadow, 24px corners and a capsule for the one-line pill; opaque under Reduce Transparency or a solid look.
- **Practice Gold** (`--mf-gold`, oklch 0.8 0.15 82; ink on it `--mf-gold-ink`): a practice's first five minutes, its tick and its glow, and nothing else.
- **Break Mint** (`--mf-mint-*`, light and dark sets): the pill while a break runs, and the sparks as one arrives (`--mf-spark-*`).

### Other themes
Each theme is twelve colours (page, ink, accent and nine hues) run through one recipe, so every theme has the same structure. **Light**: Warm Linen page (#faf8f5), Charcoal Brown ink (#2b2724), Rust Orange accent (#b8420f). **Dark** (the vendored ramp): Near-Black page (rgb 14 14 17), Ember Red-Orange accent (#c23600). **GitHub**: Blue-Black page (#0d1117), Pale Steel ink (#c9d1d9), Sky Blue accent (#58a6ff). **Midnight**: True Black page (#000000), Soft Silver ink (#d4d4d4), Periwinkle accent (#8ab4f8). Also Catppuccin, Dracula, Gruvbox, Tokyo Night, Obsidian Nord, Everforest, Kanagawa, Adwaita and Rosé Pine, each in its author's own colours. Paper, Light and Midnight paint the main window solid. Independently, any theme can wear a shape style: Soft (default), Paper (square, hairline rules, no shadows) or Brutal.

### Named Rules
**The Paper and Ink Rule.** The page is cream and the words are brown; surfaces are ink mixed into page at 4, 9, 16 and 26%. Every colour comes from a theme token: a fixed hex in a component clashes with every other theme.

**The One Meaning Rule.** A colour means one thing. Green is only success; information is neutral or the accent; a search match and a highlight never share a colour.

## Typography

**Display Font:** Fraunces Variable, `full` build (with Georgia, serif)
**Body Font:** Fraunces Variable (with Georgia, serif)
**Label/Mono Font:** the same face; a handwriting face, La Belle Aurore bundled as "Haligtree Signature", for one motif only
**Notes' Body Font:** Fraunces by default (`noteFont: 'default'`), the same serif as the page; Settings' "Font" picks another, kept only when chosen. The app's own labels stay in their sans beside a serif note.
**Code Font:** JetBrains Mono NL (`--mf-mono`), for code only: inline code and code blocks, never as a costume for labels.

**Character:** One soft, slightly wonky old-style serif for everything, chrome and content alike, so the app reads as one printed book. The handwriting is the reader's marginal hand and appears nowhere else.

### Hierarchy
- **Title** (500, 24px, 30px line): the title of a task, an article, a review question, an empty state. Only title-size headings take the heading face chosen in Settings. Compact windows step it down to 20px for that element only.
- **Lead** (600, 20px, 24px line): a Feed moment, such as "You're all caught up". Feed only.
- **Reading** (400, 17px, 26px line): words you read rather than scan: Feed posts and quotes, Reading's page titles (600), Liked's group headings (600). Feed only.
- **Heading** (600, 15px, 20px line): section titles and compact empty-state titles. Panel and group headings stay in the text font.
- **Body** (400, 14px, 20px line): list rows and panels; notes run in a 36em column.
- **Control** (500 on buttons, 400 elsewhere, 13px, 18px line): properties, toolbars, buttons, menus and panel inputs. The most used role.
- **Meta** (400, 12px, 16px line): metadata, ages, counts and tooltips. Counts are `tabular-nums`.
- **Key** (500, 11px, line-height 1): the letters on keycaps, always drawn as caps, never as bare letters.

Labels move between 400 at rest and 550 when chosen, with both weights stacked so the label never shifts. Paragraphs wrap `pretty`, headings `balance`.

### Named Rules
**The One Face Rule.** Fraunces with SOFT 20 and WONK 1 everywhere; change weight with `font-weight` only, never by setting `font-variation-settings` on a label (it wipes SOFT and WONK).

**The Six Sizes Rule.** 11, 12, 13, 14, 15 and 24px, nothing else. Mixed text sizes in one panel are a bug.

**The Preview Miniature Rule.** The `/` menu's peek (slash-peek.tsx) draws each block as a small specimen page: its sizes (9 to 10px), gradients and stand-in colours are a scaled drawing of the block, not app type or tokens, and are intended. Nothing outside a preview miniature may use them.

**The Note Name Rule.** As in Apple Notes, a page is named by its first line everywhere (header, tab, Recent, lists, ⌘K, search, links) until it is given a title of its own ("Give it a title" in its menu); an empty page reads "New note". A stored title of "Untitled" counts as none.

**The Marginal Hand Rule.** The Signature face is for attributions, "kept by" on the title card and naming your book. Never for a UI label.

## Layout

The main window is a sheet inset 8px on all sides, with the sidebar (14rem, or 3rem narrow) and the page floating as rounded panels 8px apart. Pages share one column: 56rem (76rem in wide mode), centred, with 20px side padding; notes run at 36em (52em wide), the editor at 54rem (72rem wide). Page headers are a slim 40px bar with a hairline under it; the window toolbar names the section, so there is no big page title.

Rhythm is a 4px grid and tight: heading margins about 0.9em above and 0.3em below, rules 0.75em. Lists have two named insets: boxes, highlights and rules sit 12px in (`--list-edge`); words and marks sit 20px in (`--list-ink`). Settings rows pad 12px top and bottom and 16px at the sides. About 16px separates neighbouring controls. Small controls keep a 24px invisible hit area.

### Named Rules
**The One Left Edge Rule.** Every block on a page (input, headings, tick boxes, cards, tab text) starts on one left edge, at rest and not only on hover, and every page matches every other within 2px. Grouped rows start where ungrouped ones start.

**The Room to Breathe Rule.** Nothing touches an edge. Menus and popovers keep `MENU_ROOM = { top: 52, right: 12, bottom: 12, left: 12 }` from the window; tooltips 8px; 52px clear under the traffic lights; buttons on pictures 12px in from the corner. Measure to every border line, not just to the text.

## Elevation & Depth

Depth comes from tone first: a surface is a few percent more ink than the page under it. Shadows are reserved for things that lift off the page, and there is one shadow per role, all cast in a shadow ink rather than grey. Every floating sheet (menu, popover, tooltip, ⌘K, toast, dialog) is opaque and shares one material: the Parchment fill, a 1px ring of ink at 10%, and the panel shadow. The main window has no glass and no blur; only small windows that float over other apps (quick capture, glass stickies) may use native vibrancy, and the welcome arriving out of the desktop, whose window softens the desktop with the Mac's own blur for its first two seconds, under a fog that covers it whole (src/main/arrival.ts).

### Shadow Vocabulary
- **Panel** (`box-shadow: 0 1px 2px color-mix(in oklab, var(--mf-shadow-ink) 16%, transparent), 0 12px 32px -6px color-mix(in oklab, var(--mf-shadow-ink) 32%, transparent)`; on dark themes `0 1px 2px` at 40% and `0 14px 36px -6px` at 62% in black): every floating sheet. A crisp edge where it nearly touches and a soft spread further out, the way paper lifts.
- **Control** (`box-shadow: 0 1px 2px color-mix(in oklab, var(--mf-shadow-ink) 22%, transparent)`): a control sitting on the page.
- **Lift** (`box-shadow: 0 1px 2px color-mix(in oklab, var(--mf-shadow-ink) 16%, transparent), 0 10px 26px -8px color-mix(in oklab, var(--mf-shadow-ink) 40%, transparent)`): something picked up or dragged.
- **Small** (`box-shadow: 0 1px 3px 0 color-mix(in oklab, var(--mf-shadow-ink) 10%, transparent), 0 1px 2px -1px color-mix(in oklab, var(--mf-shadow-ink) 10%, transparent)`): the selected pill in a tab track.

### Named Rules
**The One Shadow Rule.** One soft two-layer shadow for everything that floats, never a heavy multi-layer stack, and only where it separates two areas. Where a shadow would not separate, use a lightly tinted rounded panel and a thin rule instead.

**The Opaque Sheet Rule.** Floating surfaces are solid and share one material string. Two near-identical greys from two token sets are a bug. Text over text is never acceptable.

**The No Glass Rule.** No `backdrop-filter` blur in the main window. Chromium blurs only inside a fading, masked or filtered wrapper, so text behind shows through sharp.

## Shapes

Corners grow with the box. Inline highlights, tick boxes and keycap-sized marks take 4px; buttons of every size, inputs, menu rows, tab pills and tooltips 8px; menus and tab tracks 10px; cards (the note hover card too), panels, the sidebar, dialogs, ⌘K and settings islands 14px; chips (filter chips and single-choice rows), switches, dots and round icon buttons are fully round, and circles are true circles. Dividers inside content are square hairlines. Borders are 1px of Ink Hairline. Writing surfaces have no box at all: words sit on the bare page. Paper textures sit in the paper: grid lines about 5% of the ink, dots about 14%.

**The Scaled Corner Rule.** Radius follows size: 4 / 8 / 10 / 14 / full. A small thing never wears a card's corner, and a card never wears a button's.

**The No One-Sided Border Rule.** A rounded element never carries a coloured border on one side only. Use a faint tint, a dot or a quiet mark.

**The Drawn Not Borrowed Rule.** Every picture is drawn or public domain and looks real before it looks decorative: paper placeholders for pictureless items, square-cornered pictures in the hover card, never stock imagery, game screenshots or clip-art.

## Components

Native, quiet, alive. Every control looks as if macOS made it, is built from Haligtree's own tokens and pieces, sits still at rest, and answers every touch.

### Buttons
- **Shape:** gently rounded (8px); 28px tall by default, 24px small, 32px large; icons 14px.
- **Primary:** Golden Brown fill with computed accent ink, control type at 500, 8px side padding; hover drops the fill to 80%.
- **Hover / Focus:** press scales to 0.97 and back; focus shows a 2px ring of the accent at 30% (outlines elsewhere are 1.5px of accent at 70%, drawn inside the edge).
- **Ghost / Outline / Secondary:** ghost washes Worn Parchment at 50% on hover; outline adds a hairline; secondary sits on Worn Parchment. Destructive is a Brick Red tint (10%, 20% on hover), never solid. Disabled is 50% opacity and says why in words.

### Chips
- **Style:** filter chips are fully round, 24px tall, 10px side padding, hairline border, Faded Ink text; hover darkens the border to ink at 25% and the text to Brown Ink.
- **State:** on is a Golden Brown border at 55% over an 18% fill, Brown Ink text and an accent tick in the mark's place, so a chip is one width on or off. Single-choice rows are fully round too, and carry one fully round travelling highlight that glides between choices. Rows sound only on press.

### Cards / Containers
- **Corner Style:** 14px for panels, islands, dialogs and hover cards.
- **Background:** Parchment for floating cards; Worn Parchment at 25% for settings islands, rows divided by hairlines at 60%.
- **Shadow Strategy:** panel shadow for floating cards only; islands rest on the page with a faint inset top light.
- **Border:** one hairline.
- **Internal Padding:** 12px for hover cards, 12px by 16px for island rows, 20px for dialogs.

### Inputs / Fields
- **Style:** 28px tall, 8px corners, hairline in the input tone, a faint ink fill, 8px side padding; placeholders in ink at 70%. No spinner arrows, no stock clock, no stock dropdown; suggestions are drawn inline in the app's style.
- **Focus:** border turns to the accent with a 2px accent ring at 30%. The caret is Golden Brown.
- **Error / Disabled:** Brick Red border and a 20% red ring; disabled at 50% opacity with a not-allowed cursor.

### Navigation
- **Sidebar:** a 14rem rounded panel (14px) on Worn Parchment at 20%, holding the traffic lights in its 40px top strip; folds to a 3rem icon rail. Trees hang every row off one trunk-and-branch line and light the path to where you are. Under the places come sections, each a heading over its rows on a trunk-and-branch line: Favorites, Recent, Library (Gems, Sources, Files) and Tags (only the tags starred for it, as Todoist's favourite labels). A favorite is a shortcut in the sidebar; a pinned tab is a tab that stays, small at the left of its row; the same note can be both. A section moves whole by dragging its heading, or Move section up and down on its menu.
- **Pane tabs (the row over each page):** the open tab is part of its page: the page's own fill, rounded top corners (9px), small 8px inward feet where it meets the page, no line along its top on the dark frame. Other tabs are quiet ink on the frame. Switching tabs never animates (it happens tens of times a day); presses scale to 0.97. Back and Forward sit at the row's left, + and every tab's list at its right.
- **Chip tabs (a page's own tabs, e.g. Review, Feed):** a 32px track (10px corners, ink hairline at 10%, Worn Parchment at 40%) holding 28px tabs; the selected one a raised Cream Paper pill. Their attributes are their own (data-chips), never the pane tabs' (data-tabs).

### Menus and Tooltips
- **Menus:** 10px corners in the floating material, rows 28px tall with 8px corners and 14px icons, one gliding highlight per menu, shortcuts as keycaps at the right. They open at once with a soft cue and close in 60ms; the picked row blinks twice. A right-clicked row stays lit while its menu is open.
- **Tooltips:** 8px corners, 6px by 10px padding, meta size, 4px from their control, opening after 600ms. One at a time; never over an open menu or dialog; never on a menu row. Format is the action and its keys, separated by two spaces.

### Note Hover Card (signature)
The one look for any hover that has content: a 320px Parchment card (14px corners, the floating material: ring of ink at 10% and panel shadow, 12px padding) with a kind line (icon and words in meta size), a bold title with a small picture beside it, up to ten lines of the note fading out at the foot, and a hairline above a quiet foot. It opens after about half a second of rest and closes when its anchor scrolls away. Where it shows, no tip shows too, and opening any menu closes it.

### Named Rules
**The No Wall of Text Rule.** A page holding several kinds of thing gives each kind an island (the Inbox's: icon, count and fold in a small heading, rows inside one 14px surface with a hairline, each row an icon or thumbnail, a title and one quiet line). Loose headings over loose paragraphs are a bug.

**The Bare Over Canvas Rule.** Controls laid over a canvas (the Map) wear no card, border or fill. The canvas softens under them instead through the edge blur (`.mf-blur-edge`), which thins out as it rises, so marks passing under the words go soft rather than running sharp beneath them.

**The Shared Frost Rule.** Glass comes only from `.mf-frost` or `.mf-blur-edge`; nothing that holds a backdrop blur ever fades its opacity (the blur would draw nothing until the fade ends). Frost is revealed by a clip; only the words fade. Captions over pictures rise out of a frosted foot, two lines at most.

**The Square Highlight Rule.** Highlights and marked lines have square corners; nothing (a playhead, a dot, a grip) touches a highlight's edge. Picked blocks are the one exception (the user, 15 Nov): each wears the accent's quiet wash with Notion's slight 4px corner, a picked callout keeps its own 8px corner, and a picked table stays square.

**The One Hover Rule.** Hovers have two looks only, and one hover shows one thing: a label is the Tip, anything with content is the note hover card. Where a card shows, no tip shows; menu rows never get tips.

**The Native Not Stock Rule.** Every control looks as if macOS made it and is built from Haligtree's own pieces. A stock browser or third-party control, or a card bolted on in another material, is a bug.

**The One Curve Rule.** Everything moves on `cubic-bezier(0.16, 1, 0.3, 1)`: 120ms by default, presses to 0.97, menus open at once and close in 60ms, and anything reached by a key does not move at all.

### Window frame
- **Dark frame (on by default):** the window round the sidebar and the page is a dark shade of the theme's own accent colour, never grey or black (only its lightness drops, so the hue stays). "How dark" in Settings goes from a deep shade to all but black. The page and the sidebar are light cards on it; what sits on the frame (top bar, tab strip) is in light ink. A style's boxes (Brutal, Paper) on the frame are outlined in that light ink.

### Carrying (every drag)
- **Lift:** past 6px the thing lifts as a carried card that keeps the side it was taken by under the pointer (scaled to the smaller card), the hover light stops (`data-dragging`), and the cursor is grabbing. A thing with more under it (a group, a task with its steps or its question open) folds to its one row in the hand. Esc puts it back; letting go anywhere it cannot go puts it back too, and so does letting go out of the window, where nothing is aimed at and the card says nothing. A folded group opened by holding something over it folds again unless the drop lands in it.
- **One look, drawn by `components/haligtree/carry.tsx`:** the card always says what letting go will do (“Move here”, “Move to Today”, “Make it a step of …”), or why it cannot go there, with the not-allowed pointer. The other rows glide aside on one clock to open a room as tall as the carried row, a quiet band with one line through its middle and a dot at the line's start (`DropLine`, the only place a drop line is drawn). Where the place is decided by what takes it (a folded group, a tab, a part of a list with a rule of its own such as Today, a task taking a step), nothing opens: that thing lights and the words name it. Its own place, while carried, is the same quiet band, never a faded copy.
- **A list a rule of its own keeps in order** (Goals by day, Tasks' Overdue, pages and gems under headings) takes a row only among the rows of its own part, with the same room and line. Over another part's rows nothing opens: that part's heading lights and the card says what letting go does (“Move to 31 Dec 2026”), or the card says why it cannot go there and what would move it. A page's tabs take a row where its own menu has that move, under the menu's words (“Put on ice”): the tab lights, the card rides just under it so the tab's name stays in sight, and a tab at the page's edge is the tab, not the edge's split. Level with a heading itself, its own part is meant. A refusal is a sentence and may take a second line inside the card. One piece of code for every list: `useTargets` in `carry.tsx`. Never a quiet band that says nothing.
- **Several carried** (notes picked with ⌘-click or ⇧-click): the one in hand opens the room, exactly as one carried does, and the others wait, faded, in their places. The card rests on a small pile, a card a little lower and narrower under it for each one more (two at most), with how many in a badge under it (`CarriedCount`); all of it rides clear of the line. A room for all of them, or the others gathered into it, was a tall band moving half the list (16 Nov).
- **A group or a step forms only after a rest:** the pointer held still (within 4px) on a row's middle for about half a second (`useRest`). A row carried slowly past forms nothing.
- **What a drag does is said once over the list** (`DragHint`), per kind of list, until “Got it”: the grip on a row promises no more than that line says.
- **Where it can land is always shown:** another pane's page lights with "Open here"; an edge shows "Open on the left/right".

### Result rows (⌘K and every search list)
- One line that never wraps: kind icon, title cut with "…", at most two tags then "+N", the kind word right-aligned in quiet text. A second line only for why it matched, starting under the title. Rows of one shape are one height.

### Picture rows (carousels)
- A row wider than its box by one whole set loops, the picked picture centred, nothing in view twice. A picture coming to the middle ticks and taps the trackpad. Wide pictures are cropped to 3:2. The row is outlined only when Tab brings the keys to it.

## Do's and Don'ts

### Do:
- **Do** set every page in cream paper and brown ink from theme tokens (Paper: page Cream Paper, ink Brown Ink, accent Golden Brown); derive tints from one accent with `color-mix` (about 2% fill and 20% border for a callout).
- **Do** show one surface per hover: a preview card (the note hover card) or a tip, never both, and never a tip on a menu row; its words go in the row or its preview.
- **Do** close hover cards when their anchor scrolls out of view, keep them filled while they fade, open them after about half a second of rest, and close them when any menu opens.
- **Do** make every floating surface opaque in one material: Parchment fill, `ring-1` of ink at 10%, and the one panel shadow token (`--mf-panel-shadow`).
- **Do** keep menus and popovers inside `MENU_ROOM = { top: 52, right: 12, bottom: 12, left: 12 }`, tooltips 8px from every edge, popovers 19px from their source button, buttons on pictures 12px in from the corner, and 52px clear under the traffic lights.
- **Do** follow the radius scale: 4px inline highlights, 8px buttons, inputs, menu rows and tooltips, 10px menus, 14px cards, panels, dialogs and islands, fully round chips and dots; content dividers stay square.
- **Do** show the hand cursor on everything clickable: buttons, rows, menu items, swatches, submenu triggers, ⌘K rows, toggle labels, cards that open, folding headings and links. The arrow stays only on disabled controls, tooltips and plain panels; the text cursor only over editable text; grips show grab, carrying shows grabbing everywhere.
- **Do** start every block on a page on one left edge, at rest as well as on hover, with every page's column and edge matching within 2px; grouped rows start where ungrouped ones start, the group shown by a faint background and a very subtle border.
- **Do** keep controls still under the cursor: buttons keep their width, a changing label reserves its widest width, hidden controls take no space, tabs stay fixed on the left and per-view actions group on the right.
- **Do** build controls that look native to macOS from Haligtree's own pieces (Button, Chips, Switch, Slider, Tip, the menus and popovers), so they share its type, radius, colour and sound.
- **Do** put the one thing a screen needs the reader to know on its own line, larger, near its target, with a bold lead-in; a disabled control says why in Brown Ink, never in grey.
- **Do** answer every press within 120ms: scale 0.97 and back over 120 to 150ms, its own quiet cue, a haptic tap where a row lands or a capture is made, an icon that moves when its control is pointed at.
- **Do** move on one curve, `cubic-bezier(0.16, 1, 0.3, 1)`: 120ms transitions, 0.2s for the motion library, springs of 0.08s, 0.16s and 0.24s (bounce 0.12). Menus open at once and close in 60ms; enters take 150 to 220ms and exits about two thirds of that. The light under the pointer is the one quicker thing: on the same curve it is wholly on the row under the pointer within two frames (32ms), already moving in the frame the pointer crossed over, and it goes straight to a row it has fallen more than one behind; it is moved by the pointer's own event, never through React state.
- **Do** let anything reached by a key arrive instantly; pointer gestures may slide.
- **Do** switch themes with one 220ms crossfade (a 2px blur at the crossing); previews on hover switch instantly.
- **Do** roll numbers when they change in view, type hint lines in about 0.6 to 1s after first paint, one voice per screen, and grow full-screen views out of their block (about 220ms).
- **Do** honour Reduce motion (keep fades, drop travel) and the app's own Motion switch (everything instant).
- **Do** use Lucide line icons (14px in buttons and menus, 16px in sidebars, stroke 2) with the animated layer, which plays when the host control is pointed at, never on the icon alone and never with motion off. Set icon colour explicitly.
- **Do** make icons name the noun on screen; "hide for now" uses − with a tip saying the item stays, and × only means gone.
- **Do** draw theme pickers as three overlapping dots (accent, heading, quote colours), 12px each.
- **Do** use drawn or public-domain art; give pictureless items a designed paper placeholder; draw thumbnails at 2x; keep feed images in their own shape; set the hover card's picture square-cornered beside the title, as Wikipedia does, with people round.
- **Do** keep writing surfaces boxless (words on the bare page) and paper textures in the paper: grid lines about 5% of the ink, dots about 14%, fading toward the edges.
- **Do** use one soft shadow on the side that needs it, warm ink on light themes, black and fuller on dark; otherwise a lightly tinted rounded panel and a thin rule.
- **Do** dim a window that loses focus with a veil of its own background over 200ms.
- **Do** check that it looks right at scale: at 5, 50, 500 and 5,000 items, long lists group with counts, fold, search and render only what is visible; chip rows, legends and labels never overflow, wrap mid-label or crowd; rows that scroll sideways show no scrollbar, only a soft fade on the side with more.
- **Do** use `text-wrap: pretty` on paragraphs and `balance` on headings; truncate at a word with "…"; draw keys as keycaps, even inside sentences.
- **Do** use colons, commas, full stops or brackets in UI copy, and put a UI label named in a sentence in curly quotes.

### Don't:
- **Don't** use em dashes anywhere in the interface, nor " - " standing in for one.
- **Don't** use `backdrop-filter` blur or any see-through layer in the main window, or blur inside anything that fades, masks or filters. (One thing is see-through on purpose, and it is the whole window, never a layer over the app: the welcome arrives out of the desktop, on a first run and each time it is shown again (the main window then made again in its place, your tabs and places carried), the window clear while its fog, and then the window it shapes out of that fog, stand over the desktop, until that window has grown to fill the screen; `src/main/arrival.ts` says when, and when not.)
- **Don't** stack two hover surfaces, or put a tooltip on a menu row or over an open menu or dialog; a tip never rewrites what it sits on.
- **Don't** draw a menu under a hover card, or let a popover over text hide the words around the selection.
- **Don't** use a second shadow or a heavy multi-layer shadow for floating things, or a second grey for their fill.
- **Don't** ship a stock browser or third-party control as is (video controls, file inputs, datalist arrows, default toolbars, spinner arrows), or bolt on a card that does not match the floating material.
- **Don't** put a coloured border on one side of a rounded element.
- **Don't** use pills or outlined boxes for things that are not buttons, identical tall tiles with each title shown twice, shelves all built from one template, stock icon clusters, bright saturated icon tiles, neon glows on things that should be ink, or clip-art on objects meant to look real.
- **Don't** use generic imagery (game screenshots) or non-commercial and fair-use art; never hand pictures to the OS viewer.
- **Don't** let a scene zoom ("can look tacky"), show its image edges, or keep animating while the window is hidden; ambient particles stay faint, slow and away from reading areas.
- **Don't** let a hero reveal shrink, pause and restart, or pulse; it only grows and quickens.
- **Don't** animate anything reached by a key, or reorder a random reshuffle on open.
- **Don't** play a sound on hover that sounds like a press, or two sounds for one action.
- **Don't** leave a clickable thing with the arrow cursor.
- **Don't** set a fixed hex in a component, put key information in small grey text, or use any type size outside the six roles.
- **Don't** fade words with an alpha on the ink or on Faded Ink (`text-foreground/70`, `text-muted-foreground/60`, a placeholder at /70): on Paper they fall to 2.0:1 to 4.4:1. Quiet words, hints and placeholders wear Faded Ink (`text-muted-foreground`), a step louder its strong step (`text-(--mf-muted-strong)`), so they reach 4.5:1 on every ground in every look (qa/faded-words.mjs). An alpha is for icons beside words, rules and a lone dot between words.
- **Don't** fade a word by see-through either: `opacity-70` on a key hint, a count or a tooltip's second line, a row dimmed whole, white at 90% over a picture, an editor's hint in a grey near 3:1 (they read 2.0:1 to 3.6:1). A key is quieter than its label by size, or by the strong step; on a filled button it wears the fill's own ink. A row's state is set aside (`data-set-aside`), never dimmed. Opacity is for pictures, icons and marks, a disabled control, a setting's preview while it is off, and a carried thing's place (test/faded-words.test.ts; qa/faded-words.mjs with QA_PART=places measures the places that open).
- **Don't** let a menu, popover or tooltip touch a window or container edge, or a label wrap or truncate on a button.
- **Don't** use the handwriting face for a UI label, or set `font-variation-settings` on a label.
- **Don't** show tags or groups at 100+ as a wrap of chips.

### Known drift (code vs rules)
None known. The shadow cascade, the editor's floating material, the radius scale, the one curve and the theme comment were brought into line on 1 November (qa/one-material.mjs checks them).

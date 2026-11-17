Method: dual-agent (A: bc-ba720e60-ab94-510b-beab-7f6d0fce017d · B: bc-50335a8c-2f32-5399-9457-2c753e296e34)

Date: 2026-11-17. Surface: every form of quick capture, Operate mode. Forms read: the pill and the grown box in `App.tsx` (`CapturePrompt`, leftover chip, WillDo, "How long?", footer), `windows/box.tsx`, `box-glance.tsx` (Write, Notes, Today), `box-offers.tsx`, `capture-kind-picker.tsx`, `kind-fields.ts`, `voice-note.tsx`, `recorder-bar.tsx`, `shot-button.tsx`, and the glass rules in `main.css`. Live Electron window was not opened. Browser overlay skipped: Electron, not a page URL.

# Design health

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 3 | On the pill the kind mark's name is always "Show the kind and more". WillDo, which says what sending will do, is hidden while it is the pill. |
| 2 | Match system / real world | 3 | The rest of the prompt says "kind". The menu says "Change type…" and "No type" (`capture-kind-picker.tsx` 165, 169). |
| 3 | User control and freedom | 3 | In the grown box, Tab either writes a tab character or takes the offer. The buttons are reached with ⌃Tab, explained once. |
| 4 | Consistency and standards | 2 | The pill shows ⌘↵. Return on one line grows the box. Notes and Today put ↵ on that same end. The welcome is the only place a lone Return keeps the line. |
| 5 | Error prevention | 3 | Check back's own table says the day and the question always show. The prompt asks "Which day?" and saves only the day. |
| 6 | Recognition rather than recall | 2 | The pill's keep affordance is a keycap inside the drag region (`App.tsx` 2212). There is no verb on it. A click there drags the window. |
| 7 | Flexibility and efficiency | 3 | ⌘1 to ⌘6 set a kind without the menu. A person using the pointer cannot keep the thought from the pill. |
| 8 | Aesthetic and minimalist design | 3 | The pill is one line. A second line reveals Kind, camera, microphone, Create more, and Create. |
| 9 | Error recovery | 3 | A failed save puts the words back. A leftover shown three times used to vanish on the next open. That click is fixed (F35, `c8c002035`). The dismiss control is still named "Not this one". |
| 10 | Help and documentation | 3 | Notes and Today say one job in the empty line. Write's empty line lists a thought, a quote, a link, and slash. |
| **Total** | | **28/40** | **Acceptable** |

# Design specificity

The one-line pill, the glance tabs, the leftover chip, WillDo, and the voice bar are this book: one frosted sheet, Fraunces, plain verbs. The grown footer and the kind picker are the generic seam. A command menu that says "type", and a row of tool icons that appears because a sentence wrapped.

Deterministic scan: `impeccable detect` on `App.tsx`, `box.tsx`, `box-glance.tsx`, `box-offers.tsx`, and `capture-kind-picker.tsx` exited 0 with `[]`. A second scan of `voice-note.tsx` exited 0 with `[]`. The detector and the review agree that the tokens are clean. The review's issues are words and hit targets, which the detector does not score. No user-visible overlay.

# Overall

You get a quiet line, and the thought is the thing in the room. The line wraps, or the kind mark is pressed, and the same sheet fills with a camera and a switch called Create more. The single biggest gap is that the pill cannot be kept with a click.

# What's working

- The box is one frosted sheet, and the words stay the same size when the pill grows (`App.tsx` 3126, `main.css` glass rules).
- WillDo says the consequence in ordinary words, and each × keeps those words plain (`will-do.tsx`).
- Glance tabs stand on the pill. Choosing Notes or Today does not move the window (`box-glance.tsx`). The voice bar has two actions, Esc and ⌘↵.

# Priority issues

**[P1] The pill cannot be kept with a click.** Suggested command: `/impeccable clarify`, taken in harden.

The right end is the letters ⌘↵ inside the drag region (`App.tsx` 2212-2214). Verified in source: a `kbd` inside `data-pill-drag="end"`, not a button. Return on one line still grows the sheet (`App.tsx` 2014 keeps only while `data-welcome-ph` is set). Fix: put the verb Keep on that end, as a button, outside the drag. Return on the pill stays the way the sheet grows. The welcome is the one place a lone Return keeps, and that stays. A click must be able to finish.

**[P2] Check back never asks the question.** Suggested command: `/impeccable clarify`.

Choosing the kind opens the calendar and the footer shows "Which day?". The kind's copy says it asks again on a date. Not built in this pass. The day still saves. The missing sentence is a copy gap, not a blocked save.

**[P2] A second line earns a camera.** Suggested command: `/impeccable quieter`.

Growing reveals the kind chip, the camera, the microphone, Create more, and Create. Left. Hiding the camera in the gear would change a control people already use from the footer. Recorded, not moved.

**[P2] Tab in the grown box writes a tab.** Suggested command: `/impeccable harden`.

With an offer up, Tab adds it. With no offer, Tab inserts a tab character (`windows/box.tsx`). Not changed. A commonplace note should not gain a tab character, but taking Tab away from indent is a second keyboard map. Left as a known leftover.

**[P3] The kind menu says "type", and some chrome is `text-xs`.** Suggested command: `/impeccable typeset`.

`text-xs` is 0.75rem, the same size as meta, but it is not the named role. The menu placeholder "Change type…" is the word that is wrong. Polish renames it to kind.

# Personas

**Alex.** On the grown box, Tab writes a tab or fires the offer, and the buttons have moved to ⌃Tab. ⌘6 sets Check back and opens the calendar on top of the sentence.

**Jordan.** On the pill, the ⌘↵ keycap looks like the way to finish, it does not click, and Return opens the rest of the sheet. On the grown box, Create more is a switch whose job is in a tip. The kind mark's tip says "Kind, and more", and the click replaces the line with the footer.

# Minor

- The kind picker is the weaker form. Six rows still get a search field.
- The voice bar is a solid capsule on the frosted sheet. Cancel and Stop are clear. The material is the odd one out.
- Notes' empty state says ⌘↵ starts a note, while the keycap on that line says ↵.
- No em dashes in the copy of these forms.

# Questions

Questions skipped: the pass continues to audit, harden, and polish. The clickable Keep is the harden item. Return on the pill still grows the sheet, on purpose.

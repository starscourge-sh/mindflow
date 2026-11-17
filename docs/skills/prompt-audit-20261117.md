Date: 2026-11-17. Surface: every form of quick capture (pill, grown box, glance tabs, kind picker, offers, voice bar, leftover chip). Code audit. Evidence is `docs/skills/prompt-critique-20261117.md` and the detector runs recorded there. Lines below were checked in the current premium-pass source. No fixes in this report.

# Audit health

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2 | The pill's keep affordance is a `kbd` inside a drag region (`App.tsx` 2212), not a button. The kind mark's accessible name is always "Show the kind and more", even after the kind is chosen. |
| 2 | Performance | 3 | The pill and the sheet share one editor. Chrome fades instead of remounting. No extra list is mounted on the pill. Glance tabs are the only second surface, and they replace the line. |
| 3 | Responsive Design | 3 | The pill is the small-window form (one line, ends inset). The grown footer wraps. Touch targets on the kind mark are `size-8` (32px). This is a pointer app. The failure is that the keep end is not a control at all. |
| 4 | Theming | 3 | Detector on the prompt files and `voice-note.tsx`: exit 0, `[]`. The sheet is frost on purpose. The voice bar is a solid capsule on that sheet, the one material that does not match. |
| 5 | Implementation Integrity | 3 | The pill, WillDo, the leftover chip, and the glance tabs are one product. The kind menu still says "type". `text-xs` is used where the ramp has `text-meta` and `text-control`. |
| **Total** | | **14/20** | **Good** |

# Integrity verdict

Pass. The prompt is a specific object: one frosted sheet, a line, a verb for what sending will do. The detector found no token drift in the files that draw it. The gaps are a missing button and one wrong word, not a second design system.

# Summary

- Score: **14/20** (Good).
- P1: 1. P2: 3. P3: 1. P0: 0.
- The P1 is the keep end of the pill, which cannot be clicked.
- Next: harden that button. Rename "type" to "kind" in polish. Leave Return-to-grow, the camera in the footer, and Tab-inserts-a-tab.

# Findings

**[P1] Keep is not a control.** Location: `App.tsx` 2212-2214. Category: Accessibility. Impact: a click on the place that reads ⌘↵ drags the window. The only keep from the pill is the chord. WCAG: 2.1.1 is met by ⌘↵, but the visible affordance is not the thing that works. Recommendation: a button, "Keep", with the key beside it, `WebkitAppRegion: no-drag`. Command: `/impeccable harden`.

**[P2] Check back asks for a day and not the question.** Location: `App.tsx` footer "Which day?", `kind-fields.ts` 62-66, `capture-kind-picker.tsx` 46. Category: Implementation integrity. Impact: the kind's own sentence says it will ask again, and the form never collects that sentence. The day still saves. Command: `/impeccable clarify`. Not this pass.

**[P2] Tab writes a tab into the note.** Location: `windows/box.tsx` 117-126. Category: Accessibility. Impact: in the grown box, Tab does not move to Keep. ⌃Tab does, and it is explained once. Command: `/impeccable harden`. Not changed: taking Tab from indent is a second map.

**[P2] The grown footer reveals the camera with the second line.** Location: `main.css` rule that hides `data-chrome` only while `data-pill` is set, `App.tsx` 2756. Category: Implementation integrity. Impact: catching a thought becomes a small app. Command: `/impeccable quieter`. Not moved. The camera is a real action people use from that row.

**[P3] The kind menu says "type".** Location: `capture-kind-picker.tsx` 165 and 169, placeholders "Change type…" and "No type". Category: Implementation integrity. Impact: the rest of the prompt says kind. Command: `/impeccable polish`.

# Patterns

`text-xs` stands in for meta on WillDo, the offers, the leftover chip, and "How long?". The size matches meta (0.75rem). The name does not. A rename to `text-meta` is the ramp, and it should not move layout. Done in polish only where the string is also wrong. A blanket class rename across the prompt is more churn than the audit earned.

# What is already solid

- Detector clean on every prompt file scanned, including the voice note.
- A failed save puts the draft back (`App.tsx` 1955).
- The third showing of a leftover now returns the words (F35). The audit does not reopen that.
- Glance tabs do not move the window.
- The voice bar has two labeled actions.

# Recommended actions

1. **[P1] `/impeccable harden`**: make the pill's keep end a button.
2. **[P3] `/impeccable polish`**: say kind, not type.
3. **[P2] `/impeccable clarify`**: Check back's question. Not this pass.

You can ask me to run these one at a time, all at once, or in any order you prefer.

Re-run `/impeccable audit` after fixes to see your score improve.

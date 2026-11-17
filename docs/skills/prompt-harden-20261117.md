Date: 2026-11-17. Surface: every form of quick capture. Command: harden. This takes the one P1 from `prompt-critique-20261117.md`.

# What was brittle

The pill's right end was a `kbd` reading ⌘↵, inside a drag region (`App.tsx`). A click dragged the window. There was no verb, and no way to keep the line with the pointer.

# What changed

That end is a button, `data-pill-keep`, labelled Keep, with the ⌘↵ keycap beside it. It is `no-drag`, takes the pointer only while the sheet is the pill, and calls the same submit as ⌘↵. The line's right padding is 7.5rem so the words stop before the button.

# Left as it was

- Return on the one-line pill still grows the sheet. The welcome is still the only place a lone Return keeps.
- The camera, the microphone, and Create more stay in the grown footer.
- Tab in the grown box still inserts a tab or takes the offer. ⌃Tab still reaches the buttons.
- Check back still asks "Which day?" only.

# Taste

Keep is `text-control`, muted, and the keycap is `text-key`. Same press scale as the kind mark. No new frost, no em dash. A short line ("Fee") sits clear of the button.

# Proof

`qa/handover-skills.mjs`. Old build: the end is not a button, and a click keeps nothing. New build: the button reads "Keep ⌘↵", a click keeps a note whose label is "Fee". Three passes, loads 2.24, 2.58, 2.65. The mode word stays hidden on that one line (`shown: false`).

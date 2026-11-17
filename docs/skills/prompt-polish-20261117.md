Date: 2026-11-17. Surface: every form of quick capture. Command: polish. Read against `prompt-critique-20261117.md` and `prompt-audit-20261117.md`.

# What was refined

The kind menu said "type" while the rest of the prompt says "kind". `capture-kind-picker.tsx`: the field placeholder is "Change kind…" and the empty line is "No kind". The search still matches `value={type.label}`.

# Left on purpose

- Return on the pill still grows the sheet.
- The camera stays in the grown footer, not in the gear.
- Tab still writes a tab or takes the offer.
- Check back still asks only "Which day?".
- The slash list is not regrouped.

# Taste

Two words, same control size, no layout change. No em dash.

# Proof

`qa/handover-skills.mjs`. Old build placeholder: "Change type…". New build: "Change kind…", three times (loads 2.24, 2.58, 2.65).

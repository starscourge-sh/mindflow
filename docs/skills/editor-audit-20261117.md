Date: 2026-11-17. Surface: the note editor. This is a code audit, not a second design review. Evidence is the 2026-11-17 critique (`docs/skills/editor-critique-20261117.md`), the detector run in that critique, and the lines those reviews cited. No fixes in this report.

# Audit health

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2 | Format marks and both block grips are `tabIndex={-1}`. The Vim count widget is `aria-hidden`. The spell pill is `aria-hidden`. Mode is a caret shape, not a name. |
| 2 | Performance | 3 | The format bar waits 180ms before it shows on a whole-note selection, so a select-all does not paint a bar that is about to go. No layout-thrash loop was found in the files the detector scanned. |
| 3 | Responsive Design | 3 | This is a Mac window, not a phone page. Icon buttons in the floating bar are smaller than a 44px touch target. The grip is hover-only. Keyboard is the gap, and it is scored under accessibility. |
| 4 | Theming | 2 | Detector: 14 colors and 31 radii in `haligtree-editor.scss` are outside DESIGN.md. Most are 1px carets, hairlines, and black shadows. Four font sizes are off the ramp (`0.5rem`, `1rem`, `1.125rem`, `1.75rem`). The format bar fill is a 55% accent mix, on purpose. |
| 5 | Implementation Integrity | 2 | Detector on the tsx, the selection menu, and the block menu: 0 findings. The scss carries the token drift. The words (Gem, Capture) are this book. The bar and the slash list are a block-editor kit. |
| **Total** | | **12/20** | **Acceptable** |

# Integrity verdict

Fail as a single system, pass as a page. The document, the spelling pill, and the word count use the paper and the type ramp. The floating bar, the frost on the link box and the Aa panel, and the slash group "Basic blocks" could sit on another editor unchanged. The detector agrees on the stylesheet and is silent on the components.

# Summary

- Score: **12/20** (Acceptable).
- P1: 2. P2: 2. P3: 1. P0: 0.
- The two P1s are the silent Vim mode and the pointer-only format bar.
- Next: harden the Vim status. Leave the accent-mix bar. Do not regroup slash in this pass.

# Findings

**[P1] Vim mode is not announced.** Location: `vim-mode.ts` 2184-2204 and 2225, `haligtree-editor.scss` 475. Category: Accessibility. Impact: with Vim on, typing does nothing and the page does not say why. WCAG: 4.1.3 status messages, and 2.1.1 if the mode is the only way back. Recommendation: a meta-size word, Normal or Insert, that updates when `data-vim-mode` changes. Command: `/impeccable harden`.

**[P1] Format bar and grips are out of the tab order.** Location: `mark-button.tsx` `tabIndex={-1}`, grip buttons in `haligtree-editor.tsx`. Category: Accessibility. Impact: Bold, Aa, and block actions need a pointer. Slash covers turn-into. The rest of More does not. Recommendation: a later keyboard pass, not this harden, because a roving tabindex on a bar that also dismisses on Escape is its own design. Command: `/impeccable adapt`.

**[P2] Stylesheet tokens drift from DESIGN.md.** Location: `haligtree-editor.scss`, 49 detector hits. Category: Theming. Impact: hairlines and shadows will not follow a theme retune. The four off-ramp font sizes will. Recommendation: leave 1px carets. Revisit the four font sizes in a typeset pass, not by bulk-replacing every radius. Command: `/impeccable typeset`.

**[P2] Frost on the link box, the Aa panel, and the selection count.** Location: `link-editor.tsx`, `sub-menu.tsx`, `word-count.tsx`. Category: Implementation integrity. Impact: three materials for one job. The quick-capture sheet is the frosted one, on purpose. These are editor chrome. Recommendation: not in this polish. The accepted bar fill stays the accent mix. Command: `/impeccable polish`.

**[P3] Block-menu filter is hidden until the first character.** Location: `block-menu.tsx` around 482, `haligtree-editor.scss` 1442. Category: Implementation integrity. Impact: the menu looks unfilterable until you type. Command: `/impeccable polish`.

# Patterns

Hard-coded radii of `0.375rem` repeat through the editor stylesheet. That is one shortcut, not forty decisions. A token for the small chrome radius would retire most of the detector's radius list. Not done here. A mass rename of radii without a visual check would move marks, carets, and pills together.

# What is already solid

- Selection menu and block menu markup: detector clean.
- The format bar refuses to cover the words.
- Delete of a half-typed Vim count on click is already in (`vim-mode.ts` 2206), so a later `dd` is not a silent `2dd`.

# Recommended actions

1. **[P1] `/impeccable harden`**: name the Vim mode on the page.
2. **[P1] `/impeccable adapt`**: keyboard path for the format bar. Not this pass.
3. **[P3] `/impeccable polish`**: show the filter, and do not repaint the accent-mix bar.

You can ask me to run these one at a time, all at once, or in any order you prefer.

Re-run `/impeccable audit` after fixes to see your score improve.

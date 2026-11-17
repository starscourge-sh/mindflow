Date: 2026-11-17. Surface: the page editor. Command: harden. This takes the one P1 from `editor-critique-20261117.md`.

# What was brittle

With Vim on, a note opens in normal mode. Letters are swallowed. The only sign was the caret shape (`vim-mode.ts` block caret). Nothing on the page said Normal, Insert, or Visual.

# What changed

`VimSaid` in `haligtree-editor.tsx` reads `vimPluginKey` on each transaction and writes one word: Normal, Insert, or Visual. It is `text-meta`, muted, `role="status"`, at the foot of the page (`data-vim-status`). It is not drawn on the one-line pill (`main.css`: `[data-pill] [data-vim-status] { display: none }`), because that line already holds the kind mark.

# Left as it was

- Format-bar buttons stay `tabIndex={-1}`. That is an adapt pass, not this one.
- The selection bar stays `color-mix(in srgb, var(--accent) 55%, var(--background))`.
- The four font sizes off the ramp in `haligtree-editor.scss` (0.5rem, 1.75rem, 1rem, 1.125rem) were not bulk-edited. Most of the detector's 49 hits are 1px carets, hairlines, and shadows.

# Taste

The word uses the existing meta size and muted ink. It is absolutely placed, so the writing line does not move. No frost, no em dash.

# Proof

`qa/handover-skills.mjs`. Old build `out-skills-old`: no `[data-vim-status]` (`none -> none`). New build: a note reads Normal, then Insert after `i`, on screen at x 670, y 1045 of a 1080-tall window. 4/4 three times (loads 2.24, 2.58, 2.65). Old run 0/4 at load 2.76.

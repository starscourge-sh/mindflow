# 003 — Chart bar duration cap

- **Status**: DONE
- **Commit**: 8db6cd62b
- **Severity**: MEDIUM
- **Category**: Easing & duration
- **Estimated scope**: 1 file, 3 sites

## Problem

Ranked / hour / plan bars use 0.36–0.40s fills (AUDIT.md UI under 300ms; wrap is occasional but bars are UI chrome).

## Target

All three bar transitions: `duration: 0.28`, keep `ease: EASE`.

## Steps

1. `wrap-story.tsx` Ranked `scaleX` duration `0.4` → `0.28`
2. HourBars `scaleY` duration `0.36` → `0.28`
3. Plan did-bar `scaleX` duration `0.4` → `0.28`

## Verification

- Typecheck; open focus/hours/plan cards; bars fill crisply under 300ms.

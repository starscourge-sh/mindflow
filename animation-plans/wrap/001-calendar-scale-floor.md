# 001 — Calendar cell scale floor

- **Status**: DONE
- **Commit**: 8db6cd62b
- **Severity**: HIGH
- **Category**: Physicality & origin
- **Estimated scope**: 1 file, 1 line

## Problem

Busy-day cells in the run calendar enter from `scale: 0.6`, which is too close to `scale(0)` (AUDIT.md: never scale(0); target 0.9–0.97).

```tsx
// wrap-story.tsx — current
initial={still() ? false : { opacity: 0, scale: 0.6 }}
```

## Target

```tsx
initial={still() ? false : { opacity: 0, scale: 0.92 }}
```

## Repo conventions

- Use `still()` gates already present.
- Keep spring `stiffness: 400, damping: 24`.

## Steps

1. In `src/renderer/src/components/haligtree/wrap-story.tsx`, change the calendar cell `initial` scale from `0.6` to `0.92`.

## Boundaries

- Do NOT touch other wrap springs or welcome motion.
- Do NOT change grainient / FogClear.

## Verification

- Mechanical: `npm run typecheck`; `qa/run-one.sh out-gate wrap-book-first`
- Feel: open a wrap with a run calendar; cells should lift in, not pop from nothing. Reduce motion: no scale travel.
- Done when: no `scale: 0.6` remains under the calendar map.

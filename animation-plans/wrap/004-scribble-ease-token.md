# 004 — Scribble uses EASE token

- **Status**: DONE
- **Commit**: 8db6cd62b
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file, 1 line

## Problem

`Scribble` uses `duration: 1.1` and `ease: [0.45, 0, 0.2, 1]` instead of app `EASE`.

## Target

```tsx
transition={{ duration: still() ? 0 : 0.7, delay, ease: EASE }}
```

## Steps

1. In `wrap-art.tsx` Scribble `motion.path`, replace ease array with `EASE` and duration `1.1` → `0.7`.

## Verification

- Typecheck; scribble on collage cards draws with the same curve as the rest of the app.

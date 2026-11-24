# 002 — Pop entrance scale floor

- **Status**: DONE
- **Commit**: 8db6cd62b
- **Severity**: HIGH
- **Category**: Physicality & origin
- **Estimated scope**: 1 file, 1 line

## Problem

`In` with `from="pop"` starts at `scale: 0.55` (AUDIT.md scale floor 0.9–0.97).

```tsx
// wrap-art.tsx — current
: from === 'pop' ? { scale: 0.55, rotate: ((Math.round(at * 97) % 17) - 8) }
```

## Target

```tsx
: from === 'pop' ? { scale: 0.92, rotate: ((Math.round(at * 97) % 17) - 8) }
```

## Steps

1. Change `0.55` to `0.92` in `In`'s `from === 'pop'` branch in `wrap-art.tsx`.

## Boundaries

- Do NOT retune snap spring stiffness.
- Wrapped only.

## Verification

- Typecheck; wrap-click / wrap-book-first.
- Feel: desk clutter / pop entrances settle from nearly full size.

# UI Standards

Codified visual and interaction patterns for consistent UI. `app/src/styles.css` is the source of truth for implementation.

## Core Rule

Prefer existing utility classes and patterns before inventing a one-off treatment.

If a new pattern is genuinely needed, add it as a reusable CSS class in `styles.css` and document it here.

## Button Hierarchy

| Class | Use | Examples |
|-------|-----|----------|
| `ui-cta` | Primary positive actions that advance the current flow | Start, Continue, Confirm |
| `ui-button` | Secondary actions and navigation | Close, Back, Info |
| `ui-disabled` | Visually disabled non-interactive state | Locked features, unavailable actions |

Rules:

- Use `ui-cta` for forward momentum, not every clickable thing.
- Pair `ui-disabled` with actual non-interactivity (`disabled` attribute or click guard).

## Panel Styles

| Class | Use |
|-------|-----|
| `ui-panel` | Solid themed panels, dialogs, detail cards |

## Text

| Context | Class |
|---------|-------|
| Primary text | `ink-strong` |
| Secondary / muted text | `ink-soft` |
| Text on dark / image backgrounds | `ink-inverse` |

## Touch and Pointer Rules

- Target touch areas should be at least ~44px.
- Decorative elements should use `pointer-events-none`.
- Rapid taps on spend/claim buttons must not create duplicate actions.

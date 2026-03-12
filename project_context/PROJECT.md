# FloppyCat

A Flappy Bird clone starring a cat. Part fun side project, part feasibility study: can you prototype a mobile game using web tech (React + Canvas) and distribute it through app stores in a native shell (e.g. Capacitor, PWA, or similar wrapper)? The goal is to understand the full pipeline — from gameplay prototyping speed to store submission friction — and decide whether web-based mobile games are a viable path for future projects.

A secondary design goal: keep all gameplay tuning in external CSV files so anyone can tweak difficulty, physics, and sizing without touching code.

## Status

**v0.1.0 — Playable MVP.** The full core loop works: menu → play → game over → restart. There are no sprite assets yet — the cat, obstacles, clouds, and ground are all drawn procedurally on a canvas. No sound, no animations beyond jump particles and a tail wag. One commit so far (`c73dd81 Bootstrap project scaffold`).

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | React 18 + TypeScript |
| Bundler | Vite 5 |
| Styling | Tailwind CSS 3 (for UI chrome; game itself is canvas-rendered) |
| Rendering | HTML5 Canvas 2D (no game framework, no WebGL) |
| Data | CSV files loaded at runtime — no build-time processing |
| State persistence | localStorage (high score only) |

No backend. No external APIs. Runs entirely client-side.

## Project structure

```
floppycat/
├── app/                    # Vite project root
│   ├── index.html
│   └── src/
│       ├── main.tsx        # React entry point
│       ├── App.tsx         # App shell, config loading, viewport management
│       ├── styles.css      # Tailwind base + theme tokens + UI component classes
│       ├── components/
│       │   └── GameCanvas.tsx   # React ↔ canvas bridge (ResizeObserver, Controller lifecycle)
│       ├── data/
│       │   └── loadData.ts     # CSV fetcher + validator
│       └── engine/             # MVC game engine (zero React dependency)
│           ├── types.ts        # Shared interfaces (GameState, GameConfig, etc.)
│           ├── GameModel.ts    # All game data + rules (physics, collision, scoring, difficulty)
│           ├── GameView.ts     # Canvas renderer (procedural cat, pipes, background, UI overlays)
│           └── GameController.ts  # Game loop (rAF), input handling, DPR canvas setup
├── data/
│   └── config.csv          # All gameplay tunables (gravity, speeds, sizes, difficulty curve)
└── project_context/        # Documentation for collaborators
    ├── PROJECT.md           # ← you are here
    ├── ARCHITECTURE.md      # Code structure + data flow
    ├── DATA.md              # CSV schemas + validation rules
    ├── WORKING_MODEL.md     # AI collaboration model + commit conventions
    └── UI_STANDARDS.md      # Reusable CSS patterns
```

## Core gameplay loop

1. **Menu screen** — "FloppyCat" title with a bobbing cat and pulsing "Tap to Play" prompt. Shows high score if one exists.
2. **Playing** — tap/click/Space to make the cat jump upward. Gravity pulls it down. Scratching-post obstacles scroll from right to left with gaps to fly through. Jump emits small colored particles for feedback.
3. **Scoring** — +1 point for each obstacle fully passed. Score shown at top of screen with a stroked white font for readability.
4. **Difficulty** — every 10 seconds (configurable), the gap between pipes shrinks and scroll speed increases, with a floor on minimum gap size.
5. **Game over** — collision with a pipe, floor, or ceiling ends the game. Dark overlay shows score, high score (persisted to localStorage), and whether it's a new best. 500ms debounce prevents accidental immediate restart.
6. **Restart** — tap to return to menu, then tap again to play.

## Key design decisions

- **Data-driven tuning.** All physics constants, sizes, and difficulty curve parameters live in `data/config.csv`. Changing a value and refreshing is the intended workflow for balancing — no rebuild needed.
- **MVC engine separation.** The game engine in `app/src/engine/` has zero React imports. Model owns state, View renders it, Controller glues them. This makes the engine testable and portable.
- **Procedural rendering.** Everything is drawn with Canvas 2D primitives — no image assets to manage. The cat has a body, head, ears, eyes, whiskers, nose, paws, and a wagging tail, all from basic shapes.
- **Mobile-first viewport.** The app shell is capped at 400×800px and centered on desktop (black bezel). On mobile it fills the screen with safe-area-inset handling and visualViewport tracking for URL bar changes.
- **Forgiving hitboxes.** Collision uses AABB with a 3px inset on each side of the cat, making near-misses feel fair.

## Run locally

```bash
npm install
npm run dev
```

Open the Vite dev server URL (defaults to `http://localhost:5173`).

## Testing

- High score is saved to `localStorage` under key `floppycat_highscore`.
- Resetting: clear site data or use an incognito window.
- All game tunables are in `data/config.csv` — change values and refresh to retune.
- No automated tests yet. Manual testing only.

## Related docs

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — file responsibilities, MVC details, data flow, where to change things.
- **[DATA.md](DATA.md)** — CSV schemas, column types, validation rules.
- **[WORKING_MODEL.md](WORKING_MODEL.md)** — commit conventions, git workflow, AI collaboration principles.
- **[UI_STANDARDS.md](UI_STANDARDS.md)** — reusable CSS classes for buttons, panels, text.

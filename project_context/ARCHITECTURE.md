# Architecture Map

## Key files

- `app/index.html`: Vite entry HTML.
- `app/src/main.tsx`: React entry point.
- `app/src/App.tsx`: Main app shell and UI layout.
- `app/src/styles.css`: Tailwind base, theme variables, viewport management (app-shell/game-screen/app-screen).
- `app/src/data/loadData.ts`: CSV loading + validation.
- `data/config.csv`: Global tunables.

## Data flow

- CSVs in `data/` are loaded at runtime via `loadData.ts` (Vite `publicDir` points to `../data`). See DATA.md for CSV schemas.
- Game state lives in React state (context/reducer pattern when complexity warrants it).

## Where to change things

- React UI: `app/src/App.tsx` + `app/src/components/*`
- Game state + rules: `app/src/engine/*` (create files as needed)
- Data loading + validation: `app/src/data/loadData.ts`
- Tuning values: `data/config.csv` or new CSV files (document in DATA.md)

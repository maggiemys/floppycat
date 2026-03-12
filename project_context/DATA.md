# Data Reference

All CSVs live in `data/` and are loaded at runtime. Values are read as strings and parsed to numbers where expected.

## data/config.csv

- Schema: `key,value`
- Meaning: global tunables.
- Example rows:
  - `app_name,FloppyCat`

## Validation rules

- When adding a new CSV, document its schema and constraints in this file.
- Use fail-fast validation in `loadData.ts` — missing required columns should throw on load, not fail silently at runtime.

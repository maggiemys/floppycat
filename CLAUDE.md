# Claude Code Instructions

Read these baseline docs at session start:

- @project_context/PROJECT.md
- @project_context/ARCHITECTURE.md
- @project_context/DATA.md
- @project_context/WORKING_MODEL.md
- @project_context/UI_STANDARDS.md

Read specialist docs only when working on those areas (add as the project grows):

- (none yet)

## Key rules

- Follow commit conventions and doc update rules in WORKING_MODEL.md.
- Prefer data-driven changes in `data/*.csv` over hard-coded tuning.
- Keep changes localized; avoid refactors unless required.
- React + TypeScript + Vite + Tailwind stack (`app/` directory).
- **UI consistency:** Check `UI_STANDARDS.md` and `styles.css` for existing patterns before building new UI. Use established classes (`ui-cta`, `ui-button`, `ui-panel`, `ink-strong`, `ink-soft`, etc.) when they fit. When a new pattern is genuinely needed, add it as a reusable CSS class in `styles.css` with CSS variables for tunables. Then document it in `UI_STANDARDS.md`.

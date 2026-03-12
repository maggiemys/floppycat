# Working Model

## AI Collaboration Principles

This document describes collaboration principles for working with AI coding assistants on this project.

## Sources of truth

| Doc | What it covers |
|-----|----------------|
| PROJECT.md | What the repo is, how to run it |
| ARCHITECTURE.md | Code structure, data flow, where to change things |
| DATA.md | CSV schemas, column types, validation rules |
| DESIGN.md | Design intent, principles, decision log |
| UI_STANDARDS.md | Button/panel/interaction patterns |

Feature plans live in `project_plans/active/` (move to `archive/` when shipped).

## How to treat docs vs active iteration

These docs are a shared baseline snapshot, not a gate.

- **DATA.md is strict.** CSV schemas and invariants must be respected. If a change implies a schema change, update DATA.md and code together.
- **DESIGN.md is directional.** It should not block implementation. If we're actively experimenting, the latest chat messages override DESIGN.md until we commit the direction.
- **PROJECT.md and ARCHITECTURE.md describe current behavior.** Update them when behavior changes.

Conflict handling:

- If a chat request conflicts with PROJECT/ARCH/DESIGN: call it out briefly, then proceed with the chat request.
- If a chat request conflicts with DATA/schema invariants: stop and propose the minimal schema + code updates needed.

## Doc update rules

When code changes land, update docs based on what changed:

| What changed | Update |
|---|---|
| CSV schema (new column, new file, changed constraints) | DATA.md (required) |
| New game behavior or rule change | PROJECT.md |
| New file, moved file, changed file responsibility | ARCHITECTURE.md |
| Design decision or direction change | DESIGN.md |
| New button/panel pattern or visual rule | UI_STANDARDS.md |
| Major feature plan | `project_plans/active/*.md` |

If a change doesn't affect any of these, no doc update is needed.

## Feature plans

When brainstorming or planning a major feature, create a plan doc in `project_plans/active/`. Plans are living documents. Once shipped, move to `project_plans/archive/` and migrate stable parts into the appropriate `project_context/` docs.

Plan template:

```
# Feature Name
Status: Active / Shipped / Abandoned
Last updated: YYYY-MM-DD

## Problem
What's broken, missing, or limiting today.

## Design
How it works from the player perspective.

## Implementation
Technical approach.

## Open Questions
Unresolved product or technical questions.
```

**Stub data in plans:** Feature plans that introduce new CSVs must include stub CSV data (realistic example rows) inline. Seeing concrete data catches schema problems that abstract column tables miss.

## Commit conventions

**Never commit or push without explicit approval.** When a task reaches a natural completion point, suggest committing and note what would be included — but wait for confirmation.

**Only commit files from this session.** Multiple people may be editing concurrently. Only stage files that were created or modified during the current session.

When committing:

1. Stage only files relevant to the change (not `git add -A`).
2. First line: imperative summary, under 70 characters.
3. Body: 1-3 sentences of context (what motivated the change, any non-obvious decisions).
4. Include doc updates in the same commit when needed per the table above.
5. Do not commit secrets (.env, credentials, API keys).

## Git workflow

| Branch | Purpose |
|---|---|
| `dev` | Active development |
| `staging` | Shared preview |
| `main` | Production |

Rules:

- Commit to whatever branch is currently checked out. Do not switch branches before committing.
- Before starting work, pull latest: `git pull`.
- Push to your dev branch freely.
- Run `npm run build` before merging to `staging` or `main`.

Never:

- Force-push to `staging` or `main`.
- Commit `node_modules/`, `.env`, or credential files.

## Debugging rule

When debugging, avoid guessing.

- Prefer fail-fast errors and explicit logging over silent fallbacks.
- When context is missing, read the relevant file(s) before making assumptions.

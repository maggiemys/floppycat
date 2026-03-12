---
name: version-bump
description: Bump the game version (patch, minor, or major), create a git tag, and commit.
---

# Version Bump

Bump the semver version in `package.json`, create the corresponding git tag, and commit.

## Steps

1. Ask the user which segment to bump: **patch**, **minor**, or **major**.
2. Read the current version from `package.json`.
3. Compute the new version:
   - **patch**: increment patch (e.g., 0.1.0 -> 0.1.1)
   - **minor**: increment minor, reset patch (e.g., 0.1.2 -> 0.2.0)
   - **major**: increment major, reset minor+patch (e.g., 0.2.1 -> 1.0.0)
4. Show: `Version: {old} -> {new}`. Ask for confirmation.
5. Update `"version"` in `package.json`.
6. Stage and commit: `git add package.json && git commit -m "Bump version to {new}"`
7. Create git tag: `git tag v{new}`
8. Report success. Do NOT push automatically.

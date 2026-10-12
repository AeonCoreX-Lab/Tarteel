# Contributing

1. Read `CLAUDE.md` (the rules apply to humans and AI tools equally).
2. `npm run check` must pass. Add tests for data, storage, repositories and search changes.
3. Schema change = new migration + migration test. Never edit an applied migration.
4. New asset = new line in `docs/licensing/INVENTORY.md`.
5. Do not open PRs that modify Quran or translation files without the source, license and the updated manifest hashes.

# PDF Organizer

## Tests

- Install deps and run from this folder: `npm test` (or `npm run test:watch`).
- The Jest setup defaults to the Node environment for logic-heavy suites. Add `@jest-environment jsdom` to individual test files if you start covering UI components.
- Shared fixtures live in `lib/heuristics/__tests__/fixtures` for exercising deterministic heuristics inputs.

## Project layout

- Root keeps only required entry-point config filenames; full configs live in `config/`.
- Jest setup moved to `config/jest.setup.ts`; Jest config points there via `setupFilesAfterEnv`.
- TypeScript options live in `config/tsconfig.base.json`; root `tsconfig.json` extends it.
- Next, ESLint, PostCSS configs are re-exported from `config/`.

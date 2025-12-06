# PDF Organizer

## Tests

- Install deps and run from this folder: `npm test` (or `npm run test:watch`).
- The Jest setup defaults to the Node environment for logic-heavy suites. Add `@jest-environment jsdom` to individual test files if you start covering UI components.
- Shared fixtures live in `lib/heuristics/__tests__/fixtures` for exercising deterministic heuristics inputs.

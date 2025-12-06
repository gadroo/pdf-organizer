// <reference types="jest" />

const SILENCED_CONSOLE_METHODS = ['log', 'warn', 'error'] as const;

type SilencedMethod = (typeof SILENCED_CONSOLE_METHODS)[number];

// Narrow the console instance so Jest's type inference picks the standard spy overload.
const consoleInstance: Pick<Console, SilencedMethod> = console;

beforeEach(() => {
  SILENCED_CONSOLE_METHODS.forEach(method => {
    jest.spyOn(consoleInstance, method).mockImplementation(() => {});
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});


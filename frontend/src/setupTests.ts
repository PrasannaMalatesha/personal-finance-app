import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// With vitest `globals: false`, RTL's auto-cleanup doesn't hook up — the
// previous test's DOM leaks into the next, so `getByRole('textbox', ...)`
// starts finding two email inputs. Explicit afterEach fixes it.
afterEach(() => {
  cleanup();
});

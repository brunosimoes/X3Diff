import { describe, it, expect } from 'vitest';
import { initialTheme } from '../src/app/preferences';

describe('the theme the workbench opens in', () => {
  it('follows the light landing page on a first visit, unless the system asks for dark', () => {
    expect(initialTheme(null, false)).toBe('light');
    expect(initialTheme(null, true)).toBe('dark');
    expect(initialTheme('', false)).toBe('light');
    expect(initialTheme('sepia', true)).toBe('dark');
  });
  it('keeps a saved choice whatever the system prefers', () => {
    expect(initialTheme('dark', false)).toBe('dark');
    expect(initialTheme('light', true)).toBe('light');
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { categoryLabel, categoryNames } from '../src/report/presentation';

describe('category filter labels', () => {
  // Every `category: '...'` literal the comparison engine can put in a report.
  const source = readFileSync(
    fileURLToPath(new URL('../src/diff/compare.ts', import.meta.url)),
    'utf8',
  );
  const emitted = [...new Set([...source.matchAll(/category: '([^']+)'/g)].map((m) => m[1]))];

  it('names every category the engine emits', () => {
    expect(emitted.length).toBeGreaterThanOrEqual(14);
    for (const category of emitted) expect(categoryNames[category]).toBeTruthy();
  });

  it('formats every entry as "Name · count" without brackets', () => {
    expect(categoryLabel('identity', 5)).toBe('Identifiers · 5');
    expect(categoryLabel('reference', 2)).toBe('References · 2');
    expect(categoryLabel('all', 12)).toBe('All categories · 12');
    for (const category of ['all', ...emitted])
      expect(categoryLabel(category, 3)).toMatch(/^[^()]+ · 3$/);
  });
});

import { expect, it } from 'vitest';
import { parseTabPreferences } from '../src/app/analysisTabs';

it('recovers from unavailable, null and corrupt saved tab settings', () => {
  for (const value of [null, 'null', '{broken', '42']) {
    expect(parseTabPreferences(value)).toEqual({ active: 'differences', order: [], hidden: [] });
  }
});

it('preserves extension IDs, removes duplicates, and rejects malformed settings', () => {
  expect(
    parseTabPreferences(
      JSON.stringify({
        active: 'sections',
        order: ['sections', 'future-view', 'sections', 42, '<html>'],
        hidden: ['sections', 'sections'],
      }),
    ),
  ).toEqual({ active: 'sections', order: ['sections', 'future-view'], hidden: ['sections'] });
});

it('bounds saved lists so malformed storage cannot grow the navigation indefinitely', () => {
  const order = Array.from({ length: 100 }, (_, i) => `view-${i}`);
  expect(parseTabPreferences(JSON.stringify({ order })).order).toHaveLength(64);
});

import { BoxGeometry, Matrix4, SphereGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import {
  enclosedVolume,
  hasMeasurableVolumes,
  summarizeVolumes,
} from '../src/viewer/volumeMetrics';

describe('volume measurements', () => {
  it('requires finite positive totals on both sides while allowing zero regions', () => {
    expect(hasMeasurableVolumes({ beforeOnly: 0, shared: 0, afterOnly: 0 })).toBe(false);
    expect(hasMeasurableVolumes({ beforeOnly: 0, shared: 0, afterOnly: 1 })).toBe(false);
    expect(hasMeasurableVolumes({ beforeOnly: 1, shared: 0, afterOnly: 0 })).toBe(false);
    expect(hasMeasurableVolumes({ beforeOnly: 0, shared: 1, afterOnly: 0 })).toBe(true);
    expect(hasMeasurableVolumes({ beforeOnly: 1, shared: 0, afterOnly: 1 })).toBe(true);
    for (const invalid of [-1, NaN, Infinity])
      expect(hasMeasurableVolumes({ beforeOnly: invalid, shared: 1, afterOnly: 1 })).toBe(false);
    expect(
      hasMeasurableVolumes({
        beforeOnly: Number.MAX_VALUE,
        shared: Number.MAX_VALUE,
        afterOnly: 0,
      }),
    ).toBe(false);
  });
  it('measures a translated, rotated and scaled closed box independent of indexing', () => {
    const geometry = new BoxGeometry(2, 3, 4);
    geometry.applyMatrix4(new Matrix4().makeScale(2, 1, 3));
    geometry.applyMatrix4(new Matrix4().makeRotationZ(0.6));
    geometry.applyMatrix4(new Matrix4().makeTranslation(1000, -500, 80));
    const triangles = geometry.toNonIndexed();
    try {
      expect(enclosedVolume(geometry)).toBeCloseTo(144, 2);
      expect(enclosedVolume(triangles)).toBeCloseTo(enclosedVolume(geometry), 8);
    } finally {
      geometry.dispose();
      triangles.dispose();
    }
  });
  it('curved tessellation approaches the analytic sphere volume as detail increases', () => {
    const low = new SphereGeometry(2, 16, 12),
      high = new SphereGeometry(2, 64, 48);
    try {
      const exact = (4 * Math.PI * 8) / 3;
      expect(enclosedVolume(low)).toBeGreaterThan(0);
      expect(Math.abs(enclosedVolume(high) - exact)).toBeLessThan(
        Math.abs(enclosedVolume(low) - exact),
      );
    } finally {
      low.dispose();
      high.dispose();
    }
  });
  it('distinguishes changed space from net growth and defines the retention baseline', () => {
    expect(summarizeVolumes({ beforeOnly: 20, shared: 80, afterOnly: 30 })).toEqual({
      before: 100,
      after: 110,
      net: 10,
      changed: 50,
      retained: 80,
    });
    expect(summarizeVolumes({ beforeOnly: 4, shared: 4, afterOnly: 4 })).toEqual({
      before: 8,
      after: 8,
      net: 0,
      changed: 8,
      retained: 50,
    });
    expect(summarizeVolumes({ beforeOnly: 0, shared: 0, afterOnly: 1 }).retained).toBeNull();
  });
});

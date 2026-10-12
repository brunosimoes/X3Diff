import { DEFAULT_TOLERANCE } from '../diff/tolerance';
import type { VolumeResolution } from '../viewer/shapeGeometry';

export interface Settings {
  pointTolerance: number;
  volumeResolution: VolumeResolution;
}
const key = 'x3diff-settings';
export function readSettings(): Settings {
  const result: Settings = {
    pointTolerance: DEFAULT_TOLERANCE.vectorAbs,
    volumeResolution: 'medium',
  };
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    if (saved && typeof saved === 'object') {
      if (
        typeof saved.pointTolerance === 'number' &&
        Number.isFinite(saved.pointTolerance) &&
        saved.pointTolerance >= 0
      )
        result.pointTolerance = saved.pointTolerance;
      if (['low', 'medium', 'high'].includes(saved.volumeResolution))
        result.volumeResolution = saved.volumeResolution;
    }
  } catch {
    /* Settings work without browser storage. */
  }
  return result;
}
export function saveSettings(value: Settings): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Settings still work in memory if storage is unavailable. */
  }
}

export type Theme = 'light' | 'dark';
/**
 * A saved theme takes precedence over the system preference.
 */
export function initialTheme(saved: string | null, systemPrefersDark: boolean): Theme {
  if (saved === 'light' || saved === 'dark') return saved;
  return systemPrefersDark ? 'dark' : 'light';
}

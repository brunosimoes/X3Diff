export interface ViewerPreferences {
  region?: 'all' | 'before' | 'shared' | 'after';
  expanded?: boolean;
  volumeResolution?: 'low' | 'medium' | 'high';
}
const key = 'x3diff-viewer-preferences';
export function readPreferences(): ViewerPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    if (!saved || typeof saved !== 'object') return {};
    const result: ViewerPreferences = {};
    if (['low', 'medium', 'high'].includes(saved.volumeResolution))
      result.volumeResolution = saved.volumeResolution;
    if (['all', 'before', 'shared', 'after'].includes(saved.region)) result.region = saved.region;
    if (typeof saved.expanded === 'boolean') result.expanded = saved.expanded;
    return result;
  } catch {
    return {};
  }
}
export function savePreferences(value: ViewerPreferences): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Settings still work in memory if storage is unavailable. */
  }
}

export type Theme = 'light' | 'dark';
/**
 * The theme the workbench opens in. A choice saved with the theme button always wins.
 * Without one it follows the landing page, which is light, unless the system asks for dark.
 */
export function initialTheme(saved: string | null, systemPrefersDark: boolean): Theme {
  if (saved === 'light' || saved === 'dark') return saved;
  return systemPrefersDark ? 'dark' : 'light';
}

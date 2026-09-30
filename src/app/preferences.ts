export interface ViewerPreferences {
  region?: 'before' | 'shared' | 'after';
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
    if (['before', 'shared', 'after'].includes(saved.region)) result.region = saved.region;
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

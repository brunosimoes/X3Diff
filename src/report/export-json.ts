import type { X3DiffReport } from './schema';
export function exportReportJson(report: X3DiffReport): string {
  return JSON.stringify(report, (_key, value: unknown) => typeof value === 'number' && !Number.isFinite(value) ? {nonFiniteNumber:String(value)} : value, 2) + '\n';
}

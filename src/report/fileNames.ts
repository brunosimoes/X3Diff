import type { X3DiffReport } from './schema';

/**
 * One input name as a safe part of a download name: the extension is dropped, letters and
 * digits of any script are kept, and everything else (path separators, quotes, control and
 * bidirectional characters, spaces) becomes a single hyphen.
 */
export function safeNamePart(name: string | undefined, fallback: string): string {
  const trim = (text: string) => text.replace(/^[-._]+|[-._]+$/g, '');
  const cleaned = trim(
    trim((name ?? '').normalize('NFC').replace(/[^\p{L}\p{N}._-]+/gu, '-')).replace(
      /\.(x3d|xml)$/i,
      '',
    ),
  )
    .replace(/_{2,}/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/-{2,}/g, '-');
  return trim(Array.from(cleaned).slice(0, 60).join('')) || fallback;
}

/** `part-v1__part-v2.x3diff.html`: both exports are named after the two files compared. */
export function exportFileName(report: X3DiffReport, extension: 'html' | 'json'): string {
  return `${safeNamePart(report.inputs.before.name, 'before')}__${safeNamePart(report.inputs.after.name, 'after')}.x3diff.${extension}`;
}

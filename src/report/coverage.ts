import type { Diagnostic, X3DiffReport } from './schema';

/** One line of "this was not compared", aggregated from the report's own diagnostics. */
export interface NotCompared {
  /** Which file the gap is in; absent when it concerns the pair (for example an uncertain match). */
  side?: 'before' | 'after';
  /**
   * `node`: an element type outside the catalog (its own fields were not compared).
   * `field`: an attribute outside the catalog on a known node.
   * `problem`: an invalid declaration the engine could not interpret.
   * `uncertain`: objects whose identity could not be matched with confidence.
   */
  kind: 'node' | 'field' | 'problem' | 'uncertain';
  /** Node type, `Node.field`, or the engine's message for a problem. */
  subject: string;
  /** How many elements / declarations / matches this line stands for. */
  count: number;
}

export interface Coverage {
  /** True when the report must not be read as a complete result. */
  partial: boolean;
  /** True when no scene content was compared at all (failed read or version boundary). */
  comparedNothing: boolean;
  items: NotCompared[];
}

/**
 * The node type or `Node.field` an `UNSUPPORTED_*` diagnostic is about. A skipped element
 * names its own fields after the type; they are not separate entries.
 */
export function opaqueSubject(message: string): string {
  return message.replace(/ is opaque(?:; its fields were not compared: .*)?$/, '');
}

/**
 * What an incomplete report does not vouch for. It reads only fields that schema 1.0
 * already exports (`summary.status`, `diagnostics`, `changes`), so the workbench banner
 * and any consumer of the exported JSON derive the same list.
 */
export function describeCoverage(report: X3DiffReport): Coverage {
  const status = report.summary.status;
  if (status === 'complete' || status === 'completeWithWarnings')
    return { partial: false, comparedNothing: false, items: [] };
  const items = new Map<string, NotCompared>();
  const add = (item: Omit<NotCompared, 'count'>) => {
    const key = `${item.side ?? ''}|${item.kind}|${item.subject}`;
    const existing = items.get(key);
    if (existing) existing.count++;
    else items.set(key, { ...item, count: 1 });
  };
  // A skipped element already implies its own settings; listing each one again is noise.
  // (Earlier reports listed them as separate UNSUPPORTED_FIELD entries.)
  const skippedTypes = new Set(
    report.diagnostics
      .filter((d) => d.code === 'UNSUPPORTED_NODE')
      .map((d) => `${d.side}|${opaqueSubject(d.message)}`),
  );
  for (const d of report.diagnostics) {
    const subject = opaqueSubject(d.message);
    if (d.code === 'UNSUPPORTED_NODE') add({ side: d.side, kind: 'node', subject });
    else if (d.code === 'UNSUPPORTED_FIELD') {
      if (!skippedTypes.has(`${d.side}|${subject.split('.')[0]}`))
        add({ side: d.side, kind: 'field', subject });
    } else if (d.severity === 'error') add({ side: d.side, kind: 'problem', subject: d.message });
  }
  for (const change of report.changes)
    if (change.kind === 'matchUncertain') add({ kind: 'uncertain', subject: 'identity' });
  return {
    partial: true,
    comparedNothing:
      status === 'failed' || report.diagnostics.some((d) => d.code === 'VERSION_UNSUPPORTED'),
    items: [...items.values()],
  };
}

/** Reader-facing wording for engine diagnostics; the exported data keeps the original text. */
export function describeDiagnostic(
  d: Diagnostic,
  names?: { before?: string; after?: string },
): string {
  const side = d.side ? (d.side === 'before' ? 'Before' : 'After') : '';
  const name = d.side && names?.[d.side];
  const file = side ? `${side}${name ? ` file (${name})` : ''}: ` : '';
  const subject = opaqueSubject(d.message);
  if (d.code === 'UNSUPPORTED_NODE')
    return `${file}${subject} nodes are outside the supported catalog and were not compared`;
  if (d.code === 'UNSUPPORTED_FIELD')
    return `${file}${subject} is not a supported field and was not compared`;
  if (d.code === 'XML_PARSE') return `${file}not well-formed XML (${d.message})`;
  return file + d.message;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Reader-facing lines, one per file plus one for uncertain matches. */
export function coverageLines(
  coverage: Coverage,
  names: { before?: string; after?: string } = {},
): string[] {
  const lines: string[] = [];
  for (const side of ['before', 'after'] as const) {
    const mine = coverage.items.filter((item) => item.side === side);
    if (!mine.length) continue;
    const parts: string[] = [];
    const nodes = mine.filter((item) => item.kind === 'node');
    if (nodes.length)
      parts.push(
        `${plural(
          nodes.reduce((sum, item) => sum + item.count, 0),
          'element',
        )} of unsupported type (${nodes.map((item) => `${item.subject} × ${item.count}`).join(', ')})`,
      );
    const fields = mine.filter((item) => item.kind === 'field');
    if (fields.length)
      parts.push(
        `${plural(
          fields.reduce((sum, item) => sum + item.count, 0),
          'unsupported setting',
        )} (${fields.map((item) => `${item.subject} × ${item.count}`).join(', ')})`,
      );
    for (const item of mine.filter((item) => item.kind === 'problem'))
      parts.push(`${item.subject}${item.count > 1 ? ` × ${item.count}` : ''}`);
    const file = names[side] ? ` (${names[side]})` : '';
    lines.push(`${side === 'before' ? 'Before' : 'After'} file${file}: ${parts.join('; ')}`);
  }
  for (const item of coverage.items.filter((item) => !item.side))
    lines.push(
      item.kind === 'uncertain'
        ? `${plural(item.count, 'object')} could not be matched between the files with confidence`
        : `${item.subject}${item.count > 1 ? ` × ${item.count}` : ''}`,
    );
  return lines;
}

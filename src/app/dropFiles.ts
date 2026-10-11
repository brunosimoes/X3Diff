export type Side = 'before' | 'after';

/** The same file types the Before/After file buttons offer (`accept` on their inputs). */
export function acceptsFile(file: { name: string; type: string }): boolean {
  return (
    /\.(x3d|xml)$/i.test(file.name) ||
    ['application/xml', 'text/xml', 'model/x3d+xml'].includes(file.type)
  );
}

const sideHint = (name: string): Side | undefined => {
  const base = name.replace(/\.[^.]*$/, '');
  if (/(^|[^a-z])(before|original|old)([^a-z]|$)/i.test(base)) return 'before';
  if (/(^|[^a-z])(after|revised|edited|new)([^a-z]|$)/i.test(base)) return 'after';
  return undefined;
};

export type DropPlan =
  | { error: string }
  | { sides: Side[]; /** How a pair was ordered, for the status line. */ rule?: string };

/**
 * Decide where dropped files go. `sides[i]` is the side for `names[i]`.
 * One file fills the next empty side (Before first); with both sides loaded it replaces After.
 * Two files fill both sides: a name saying before/original/old or after/revised/edited/new
 * decides, otherwise file-name order (so `part-v1` is Before and `part-v2` is After).
 */
export function planDrop(
  files: ReadonlyArray<{ name: string; type: string }>,
  loaded: { before: boolean; after: boolean },
): DropPlan {
  if (!files.length) return { error: 'Nothing was dropped.' };
  if (files.length > 2) return { error: 'Drop one or two files: a Before and an After revision.' };
  const rejected = files.find((file) => !acceptsFile(file));
  if (rejected)
    return { error: `Only .x3d or .xml files can be loaded here: ${rejected.name} is not one.` };
  if (files.length === 1) return { sides: [!loaded.before ? 'before' : 'after'] };
  const [first, second] = files.map((file) => sideHint(file.name));
  if (first !== second) {
    const firstSide = first ?? (second === 'before' ? 'after' : 'before');
    return {
      sides: [firstSide, firstSide === 'before' ? 'after' : 'before'],
      rule: 'from the words in the file names',
    };
  }
  const firstIsBefore =
    files[0].name.localeCompare(files[1].name, undefined, {
      numeric: true,
      sensitivity: 'base',
    }) <= 0;
  return {
    sides: firstIsBefore ? ['before', 'after'] : ['after', 'before'],
    rule: 'in file-name order',
  };
}

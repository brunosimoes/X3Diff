/** A stretch of text both sides share (`same`), or one only the first (`out`) or second (`in`) has. */
export interface TextRun {
  kind: 'same' | 'out' | 'in';
  text: string;
}

/** Above this many word pairs the alignment table is not worth its memory. */
const MAX_CELLS = 250_000;
const tokens = (text: string) => text.match(/[A-Za-z]+|\d+|\s+|[^A-Za-z\d\s]/g) ?? [];

/**
 * Word-by-word difference of two texts: the longest run of words they share, in order, stays
 * `same`; everything outside it is `out` (only in `from`) or `in` (only in `to`). Joining the
 * `same` and `out` runs gives `from` back; joining `same` and `in` gives `to`.
 */
export function diffWords(from: string, to: string): TextRun[] {
  const runs: TextRun[] = [];
  const push = (kind: TextRun['kind'], part: string) => {
    if (!part) return;
    const last = runs.at(-1);
    if (last?.kind === kind) last.text += part;
    else runs.push({ kind, text: part });
  };
  const first = tokens(from),
    second = tokens(to);
  // What the two texts start and end with alike needs no alignment, however long it is.
  let head = 0;
  while (head < first.length && head < second.length && first[head] === second[head]) head++;
  let tail = 0;
  while (
    tail < first.length - head &&
    tail < second.length - head &&
    first[first.length - 1 - tail] === second[second.length - 1 - tail]
  )
    tail++;
  push('same', first.slice(0, head).join(''));
  const a = first.slice(head, first.length - tail),
    b = second.slice(head, second.length - tail);
  const ending = first.slice(first.length - tail).join('');
  if (a.length * b.length > MAX_CELLS) {
    // Too long to align word by word: the middle of one text replaced by the other's.
    push('out', a.join(''));
    push('in', b.join(''));
    push('same', ending);
    return runs;
  }
  const cols = b.length + 1;
  const shared = new Uint16Array((a.length + 1) * cols);
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      shared[i * cols + j] =
        a[i] === b[j]
          ? shared[(i + 1) * cols + j + 1] + 1
          : Math.max(shared[(i + 1) * cols + j], shared[i * cols + j + 1]);
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push('same', a[i++]);
      j++;
    } else if (
      i < a.length &&
      (j === b.length || shared[(i + 1) * cols + j] >= shared[i * cols + j + 1])
    )
      push('out', a[i++]);
    else push('in', b[j++]);
  }
  push('same', ending);
  return runs;
}

/**
 * Shorten the shared stretches of a difference to a few words next to each change, with "…"
 * for what was dropped. A text that did not change at all is returned whole.
 */
export function trimShared(runs: readonly TextRun[], keep = 16): TextRun[] {
  if (runs.length < 2) return runs.slice();
  return runs.map((run, index) => {
    if (run.kind !== 'same' || run.text.length <= keep * 2) return run;
    const head = index ? `${run.text.slice(0, keep).replace(/\s\S*$/, '')} ` : '';
    const tail = index < runs.length - 1 ? run.text.slice(-keep).replace(/^\S*\s/, '') : '';
    return { kind: 'same', text: `${head}… ${tail}` };
  });
}

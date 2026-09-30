import type { Diagnostic } from '../report/schema';
export const MAX_XML_DEPTH = 256;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Scan markup before either parser runs. Ignore declarations inside inert text. */
export function prescan(text: string, side: 'before' | 'after'): Diagnostic[] {
  const out: Diagnostic[] = [];
  const add = (code: string, message: string) =>
    out.push({ code, severity: 'error' as const, side, message });
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) {
    add('FILE_LIMIT', 'File exceeds 20 MiB limit');
    return out;
  }
  let depth = 0;
  for (let i = 0; i < text.length;) {
    const start = text.indexOf('<', i);
    if (start < 0) break;
    const skip: [string, number] | undefined = text.startsWith('<!--', start)
      ? ['-->', 4]
      : text.startsWith('<![CDATA[', start)
        ? [']]>', 9]
        : text.startsWith('<?', start)
          ? ['?>', 2]
          : undefined;
    if (skip) {
      const end = text.indexOf(skip[0], start + skip[1]);
      if (end < 0) {
        add('XML_PARSE', 'Unclosed XML comment, CDATA or processing instruction');
        break;
      }
      i = end + skip[0].length;
      continue;
    }
    const doctype = /^<!DOCTYPE\b/i.test(text.slice(start, start + 12));
    if (/^<!ENTITY\b/i.test(text.slice(start, start + 11))) {
      add('ENTITY_FORBIDDEN', 'ENTITY declarations are forbidden');
      break;
    }
    let quote = '',
      end = start + 1;
    for (; end < text.length; end++) {
      const ch = text[end];
      if (quote) {
        if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (doctype && ch === '[') {
        add('DTD_SUBSET_FORBIDDEN', 'Internal DTD subsets are forbidden');
        return out;
      }
      if (ch === '>') break;
    }
    if (end === text.length) {
      add('XML_PARSE', 'Unclosed XML markup');
      break;
    }
    const markup = text.slice(start, end + 1);
    if (doctype) {
      if (
        !/^<!DOCTYPE\s+X3D\s+(?:SYSTEM\s+(?:"[^"]*"|'[^']*')|PUBLIC\s+(?:"[^"]*"|'[^']*')\s+(?:"[^"]*"|'[^']*'))\s*>$/.test(
          markup,
        )
      )
        add('DTD_FORBIDDEN', 'Only an external X3D DOCTYPE without an internal subset is accepted');
    } else if (markup.startsWith('</')) {
      depth--;
    } else if (!markup.startsWith('<!')) {
      if (depth + 1 > MAX_XML_DEPTH) {
        add('DEPTH_LIMIT', 'XML nesting exceeds 256 elements, including X3D and Scene');
        break;
      }
      if (!/\/\s*>$/.test(markup)) depth++;
    }
    i = end + 1;
  }
  return out;
}

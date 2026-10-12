import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8');

/** Directives a browser ignores in a meta tag, so they can only live in the response header. */
const HEADER_ONLY = ['frame-ancestors', 'report-uri', 'report-to', 'sandbox'];

const directives = (policy: string) =>
  policy
    .split(';')
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

function metaPolicy(page: string): string[] {
  const html = read(page);
  const tag = /<meta\s[^>]*http-equiv="Content-Security-Policy"[^>]*>/.exec(html)?.[0];
  const content = tag && /content="([^"]*)"/.exec(tag)?.[1];
  if (!content) throw new Error(`${page} has no meta Content-Security-Policy`);
  return directives(content);
}

/** `_headers` format: a path line, then indented `Name: value` lines; `#` starts a comment. */
function headerPolicies(): Map<string, string[][]> {
  const rules = new Map<string, string[][]>();
  let path = '';
  for (const line of read('public/_headers').split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      path = line.trim();
      if (!rules.has(path)) rules.set(path, []);
      continue;
    }
    const [, name, value] = /^\s+([^:]+):\s*(.*)$/.exec(line) ?? [];
    if (name?.toLowerCase() === 'content-security-policy') rules.get(path)!.push(directives(value));
  }
  return rules;
}

describe('public/_headers stays in step with the meta CSP of each page', () => {
  const rules = headerPolicies();
  for (const [path, page] of [
    ['/', 'index.html'],
    ['/index.html', 'index.html'],
    ['/app.html', 'app.html'],
    ['/coverage.html', 'coverage.html'],
  ] as const)
    it(`${path} sends the policy of ${page}`, () => {
      const policies = rules.get(path) ?? [];
      expect(policies).toHaveLength(1);
      const header = policies[0];
      expect(header.filter((d) => !HEADER_ONLY.includes(d.split(' ')[0]))).toEqual(
        metaPolicy(page),
      );
      expect(header).toContain("frame-ancestors 'none'");
    });

  it('has no catch-all policy that would be enforced on top of the per-page ones', () => {
    // Hosts merge matching rules, and a browser enforces every CSP header it receives.
    expect(rules.get('/*') ?? []).toEqual([]);
  });

  it('keeps header-only directives out of the meta tags, where they do nothing', () => {
    for (const page of ['index.html', 'app.html', 'coverage.html'])
      expect(metaPolicy(page).filter((d) => HEADER_ONLY.includes(d.split(' ')[0]))).toEqual([]);
  });
});

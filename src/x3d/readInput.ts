import { MAX_FILE_BYTES } from './prescan';
/** UTF-8 is explicit: reject decoding errors instead of silently replacing data. */
export async function readInput(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Files must be at most 20 MiB.');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    throw new Error('This file is not UTF-8. Save it as UTF-8 XML and try again.');
  }
  const encoding = /^\s*<\?xml\s[^?]*\bencoding\s*=\s*['"]([^'"]+)['"]/i.exec(text)?.[1];
  if (encoding && !/^utf-?8$/i.test(encoding))
    throw new Error('Only UTF-8 XML files are supported; declared encoding: ' + encoding);
  return text;
}

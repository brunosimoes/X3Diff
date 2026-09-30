import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DOMParser, type Element } from '@xmldom/xmldom';

const modelUrl = 'https://www.web3d.org/specifications/X3dUnifiedObjectModel-3.3.xml';
const schemaUrl = 'https://www.web3d.org/specifications/x3d-3.3.xsd';
const expectedModelHash = '6d9561c4398512e9a891e1221667b6a11994c20979aa4bbcabc21cbf056c0eae';
const expectedSchemaHash = 'a687b059a480a599b4bba0ca78c20ed17202ffe06450c24379833e3a26fe875b';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
async function source(flag:string,url:string,expected:string):Promise<string>{
  const i=process.argv.indexOf(flag);
  const value=i<0?await (await fetch(url)).text():readFileSync(process.argv[i+1],'utf8');
  if(hash(value)!==expected) throw new Error(`${flag} SHA-256 mismatch: ${hash(value)}; expected ${expected}`);
  return value;
}
const modelText = await source('--model',modelUrl,expectedModelHash);
const schemaText = await source('--schema',schemaUrl,expectedSchemaHash);
const model = new DOMParser().parseFromString(modelText, 'application/xml');
const schema = new DOMParser().parseFromString(schemaText, 'application/xml');
const selected = `Anchor Appearance Background BooleanFilter BooleanTrigger Box ColorInterpolator Coordinate Cylinder FontStyle Group ImageTexture IndexedFaceSet Inline IntegerTrigger Material MetadataBoolean MetadataDouble MetadataFloat MetadataInteger MetadataSet MetadataString OrientationInterpolator ScalarInterpolator Shape Sphere Switch Text TimeSensor TimeTrigger TouchSensor Transform Viewpoint WorldInfo`.split(' ');

const result: Record<string, {containerField: string; fields: Record<string, {type: string; accessType: string; default?: string}>}> = {};
for (const name of selected) {
  const concrete = [...Array.from(model.getElementsByTagName('ConcreteNode'))].find(e => e.getAttribute('name') === name);
  const xsd = [...Array.from(schema.getElementsByTagName('xs:element'))].find(e => e.getAttribute('name') === name);
  if (!concrete || !xsd) throw new Error(`Missing node ${name}`);
  const container = [...Array.from(xsd.getElementsByTagName('xs:attribute'))].find(e => e.getAttribute('name') === 'containerField')?.getAttribute('default');
  if (!container) throw new Error(`Missing containerField ${name}`);
  const fields: Record<string, {type: string; accessType: string; default?: string}> = {};
  const iface = concrete.getElementsByTagName('InterfaceDefinition')[0];
  for (const field of Array.from(iface.childNodes).filter((n): n is Element => n.nodeType === 1 && n.localName === 'field')) {
    const fieldName = field.getAttribute('name')!;
    if (['DEF', 'USE', 'containerField', 'IS'].includes(fieldName)) continue;
    const type = field.getAttribute('type')!;
    const accessType = field.getAttribute('accessType')!;
    if (accessType === 'inputOnly' || accessType === 'outputOnly') continue;
    const def = field.getAttribute('default');
    fields[fieldName] = { type, accessType, ...(def === null ? {} : { default: def }) };
  }
  result[name] = { containerField: container, fields: Object.fromEntries(Object.entries(fields).sort(([a],[b]) => a.localeCompare(b))) };
}
const out = `// Generated from official Web3D X3DUOM 3.3 and X3D 3.3 XSD. Do not hand edit.\n`+
  `export const catalogProvenance = ${JSON.stringify({ modelUrl, modelSha256: hash(modelText), schemaUrl, schemaSha256: hash(schemaText) }, null, 2)} as const;\n`+
  `export const catalog = ${JSON.stringify(result, null, 2)} as const;\n`+
  `export type CatalogNodeName = keyof typeof catalog;\n`;
writeFileSync('src/x3d/catalog.ts', out);
console.log(`Generated ${selected.length} nodes`);

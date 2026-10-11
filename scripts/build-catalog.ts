import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DOMParser, type Element } from '@xmldom/xmldom';

const modelUrl = 'https://www.web3d.org/specifications/X3dUnifiedObjectModel-3.3.xml';
const schemaUrl = 'https://www.web3d.org/specifications/x3d-3.3.xsd';
const expectedModelHash = '6d9561c4398512e9a891e1221667b6a11994c20979aa4bbcabc21cbf056c0eae';
const expectedSchemaHash = 'a687b059a480a599b4bba0ca78c20ed17202ffe06450c24379833e3a26fe875b';
// The 4.0 model supplies the X3D 4.0 light fields and checks every catalogued default against 4.0.
const model40Url = 'https://www.web3d.org/specifications/X3dUnifiedObjectModel-4.0.xml';
const expectedModel40Hash = '51a02e414fee63ec58fd590dbc9d05b2acc3a32aa470241e04b39acdf40067bd';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
async function source(flag:string,url:string,expected:string):Promise<string>{
  const i=process.argv.indexOf(flag);
  const value=i<0?await (await fetch(url)).text():readFileSync(process.argv[i+1],'utf8');
  if(hash(value)!==expected) throw new Error(`${flag} SHA-256 mismatch: ${hash(value)}; expected ${expected}`);
  return value;
}
const modelText = await source('--model',modelUrl,expectedModelHash);
const schemaText = await source('--schema',schemaUrl,expectedSchemaHash);
const model40Text = await source('--model40',model40Url,expectedModel40Hash);
const model = new DOMParser().parseFromString(modelText, 'application/xml');
const schema = new DOMParser().parseFromString(schemaText, 'application/xml');
const model40 = new DOMParser().parseFromString(model40Text, 'application/xml');
const selected = `Anchor Appearance Background BooleanFilter BooleanTrigger Box ColorInterpolator Coordinate Cylinder FontStyle Group ImageTexture IndexedFaceSet Inline IntegerTrigger Material MetadataBoolean MetadataDouble MetadataFloat MetadataInteger MetadataSet MetadataString OrientationInterpolator ScalarInterpolator Shape Sphere Switch Text TimeSensor TimeTrigger TouchSensor Transform Viewpoint WorldInfo Billboard Collision Color Cone Extrusion IndexedLineSet IntegerSequencer LOD NavigationInfo PixelTexture PositionInterpolator TextureTransform DirectionalLight PointLight SpotLight OrthoViewpoint`.split(' ');

// Fields that X3D 4.0 adds to a catalogued node and that are compared as well (ISO/IEC 19775-1:2023,
// 17 Lighting component). Other 4.0 additions stay outside the catalog and are diagnosed as not compared.
const additions40: Record<string, string[]> = {
  DirectionalLight: ['shadowIntensity', 'shadows'],
  PointLight: ['shadowIntensity', 'shadows'],
  SpotLight: ['shadowIntensity', 'shadows'],
};

// Errors in the published X3DUOM 3.3, corrected to the X3D 3.3 specification (ISO/IEC 19775-1,
// Extrusion: these fields are initializeOnly and creaseAngle is SFFloat). The 4.0 model has them right.
const errata: Record<string, Record<string, {type?: string; accessType?: string}>> = {
  Extrusion: {
    ...Object.fromEntries(['beginCap','ccw','convex','creaseAngle','crossSection','endCap','orientation','scale','spine'].map(name => [name, {accessType: 'initializeOnly'}])),
    creaseAngle: {type: 'SFFloat', accessType: 'initializeOnly'},
  },
};
type Field = {type: string; accessType: string; default?: string; default40?: string; since?: '4.0'};
const result: Record<string, {containerField: string; fields: Record<string, Field>}> = {};
const interfaceFields = (concrete: Element) => Array.from(concrete.getElementsByTagName('InterfaceDefinition')[0].childNodes).filter((n): n is Element => n.nodeType === 1 && n.localName === 'field');
for (const name of selected) {
  const concrete = [...Array.from(model.getElementsByTagName('ConcreteNode'))].find(e => e.getAttribute('name') === name);
  const xsd = [...Array.from(schema.getElementsByTagName('xs:element'))].find(e => e.getAttribute('name') === name);
  if (!concrete || !xsd) throw new Error(`Missing node ${name}`);
  const container = [...Array.from(xsd.getElementsByTagName('xs:attribute'))].find(e => e.getAttribute('name') === 'containerField')?.getAttribute('default');
  if (!container) throw new Error(`Missing containerField ${name}`);
  const fields: Record<string, Field> = {};
  for (const field of interfaceFields(concrete)) {
    const fieldName = field.getAttribute('name')!;
    if (['DEF', 'USE', 'containerField', 'IS'].includes(fieldName)) continue;
    const fix = errata[name]?.[fieldName];
    const type = fix?.type ?? field.getAttribute('type')!;
    const accessType = fix?.accessType ?? field.getAttribute('accessType')!;
    if (accessType === 'inputOnly' || accessType === 'outputOnly') continue;
    const def = field.getAttribute('default');
    fields[fieldName] = { type, accessType, ...(def === null ? {} : { default: def }) };
  }
  // X3D 4.0: a catalogued field must keep its type; a default that changed is recorded so a 4.0
  // file is read with its own default (SpotLight.beamWidth is the only one).
  const concrete40 = [...Array.from(model40.getElementsByTagName('ConcreteNode'))].find(e => e.getAttribute('name') === name);
  if (!concrete40) throw new Error(`Missing X3D 4.0 node ${name}`);
  const fields40 = new Map(interfaceFields(concrete40).map(field => [field.getAttribute('name')!, field]));
  for (const [fieldName, field] of Object.entries(fields)) {
    const next = fields40.get(fieldName);
    if (!next || errata[name]?.[fieldName]) continue;
    if (next.getAttribute('type') !== field.type) throw new Error(`${name}.${fieldName} changes type in X3D 4.0`);
    const def40 = next.getAttribute('default');
    if (def40 !== null && field.default !== undefined && def40 !== field.default) field.default40 = def40;
  }
  for (const fieldName of additions40[name] ?? []) {
    const added = fields40.get(fieldName);
    if (!added || fieldName in fields) throw new Error(`${name}.${fieldName} is not an X3D 4.0 addition`);
    const def = added.getAttribute('default');
    fields[fieldName] = { type: added.getAttribute('type')!, accessType: added.getAttribute('accessType')!, ...(def === null ? {} : { default: def }), since: '4.0' };
  }
  result[name] = { containerField: container, fields: Object.fromEntries(Object.entries(fields).sort(([a],[b]) => a.localeCompare(b))) };
}
const out = `// Generated from official Web3D X3DUOM 3.3 and X3D 3.3 XSD, with the X3D 4.0 light fields and defaults from X3DUOM 4.0. Do not hand edit.\n`+
  `export const catalogProvenance = ${JSON.stringify({ modelUrl, modelSha256: hash(modelText), schemaUrl, schemaSha256: hash(schemaText), model40Url, model40Sha256: hash(model40Text) }, null, 2)} as const;\n`+
  `export const catalog = ${JSON.stringify(result, null, 2)} as const;\n`;
writeFileSync('src/x3d/catalog.ts', out);
console.log(`Generated ${selected.length} nodes`);

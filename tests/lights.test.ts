import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compareX3D } from '../src/diff/compare';
import { catalog } from '../src/x3d/catalog';
import { LIGHTS } from '../src/x3d/lights';

const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../fixtures/${p}`, import.meta.url)), 'utf8');
const scene = (body: string, version = '3.3') =>
  `<X3D version="${version}"><Scene>${body}</Scene></X3D>`;
const diff = (before: string, after: string) => compareX3D(scene(before), scene(after));
const rows = (r: ReturnType<typeof compareX3D>) =>
  r.changes.map(
    (c) =>
      `${c.category}:${c.kind}:${(c.afterNode ?? c.beforeNode)?.nodeType}.${c.field ?? ''}:${JSON.stringify(c.before?.value)}>${JSON.stringify(c.after?.value)}`,
  );

describe('lights', () => {
  it('catalogues every field of the three light nodes, with the specification defaults', () => {
    const fields = (name: keyof typeof catalog) =>
      Object.fromEntries(
        Object.entries(catalog[name].fields as Record<string, { type: string; default?: string }>)
          .filter(([key]) => key !== 'class' && key !== 'metadata')
          .map(([key, field]) => [key, `${field.type} ${field.default}`]),
      );
    const common = {
      ambientIntensity: 'SFFloat 0',
      color: 'SFColor 1 1 1',
      intensity: 'SFFloat 1',
      on: 'SFBool true',
      shadowIntensity: 'SFFloat 1',
      shadows: 'SFBool false',
    };
    expect(fields('DirectionalLight')).toEqual({
      ...common,
      direction: 'SFVec3f 0 0 -1',
      global: 'SFBool false',
    });
    expect(fields('PointLight')).toEqual({
      ...common,
      attenuation: 'SFVec3f 1 0 0',
      global: 'SFBool true',
      location: 'SFVec3f 0 0 0',
      radius: 'SFFloat 100',
    });
    expect(fields('SpotLight')).toEqual({
      ...common,
      attenuation: 'SFVec3f 1 0 0',
      beamWidth: 'SFFloat 0.7854',
      cutOffAngle: 'SFFloat 1.570796',
      direction: 'SFVec3f 0 0 -1',
      global: 'SFBool true',
      location: 'SFVec3f 0 0 0',
      radius: 'SFFloat 100',
    });
    for (const name of LIGHTS) {
      expect(catalog[name as keyof typeof catalog].containerField).toBe('children');
      expect(catalog[name as keyof typeof catalog].fields).toMatchObject({
        shadows: { since: '4.0' },
        shadowIntensity: { since: '4.0' },
      });
    }
    // The one catalogued default that X3D 4.0 changed.
    expect(catalog.SpotLight.fields.beamWidth).toMatchObject({ default40: '0.589049' });
  });

  it('reports each changed light setting as a lighting entry with its values', () => {
    const r = diff(
      '<PointLight DEF="Lamp" intensity="1" color="1 1 0" location="0 0 12"/><DirectionalLight direction="0 0 -1"/><SpotLight on="true" beamWidth="0.4" cutOffAngle="0.6"/>',
      '<PointLight DEF="Lamp" intensity="0.6" color="1 0.5 0" location="0 2 12"/><DirectionalLight direction="1 0 -1"/><SpotLight on="false" beamWidth="0.5" cutOffAngle="0.6"/>',
    );
    expect(r.summary.status).toBe('complete');
    expect(r.diagnostics).toEqual([]);
    expect(rows(r)).toEqual([
      'lighting:lightChanged:DirectionalLight.direction:[0,0,-1]>[1,0,-1]',
      'lighting:lightChanged:PointLight.color:[1,1,0]>[1,0.5,0]',
      'lighting:lightChanged:PointLight.intensity:1>0.6',
      'lighting:lightChanged:PointLight.location:[0,0,12]>[0,2,12]',
      'lighting:lightChanged:SpotLight.beamWidth:0.4>0.5',
      'lighting:lightChanged:SpotLight.on:true>false',
    ]);
    expect(r.changes.every((c) => c.severity === 'medium' && c.confidence === 'high')).toBe(true);
    expect(r.changes.find((c) => c.field === 'intensity')).toMatchObject({
      message: 'PointLight.intensity changed',
      beforeNode: { defName: 'Lamp', path: '/X3D/Scene/PointLight[1]' },
    });
    expect(r.summary.countsByKind).toEqual({ lightChanged: 6 });
  });

  it('applies the defaults, so an omitted setting equals its written default', () => {
    expect(
      diff(
        '<PointLight/><DirectionalLight/><SpotLight/>',
        '<PointLight intensity="1" color="1 1 1" location="0 0 0" radius="100" attenuation="1 0 0" global="true" on="true" ambientIntensity="0" shadows="false" shadowIntensity="1"/>' +
          '<DirectionalLight direction="0 0 -1" global="false"/>' +
          '<SpotLight beamWidth="0.7854" cutOffAngle="1.570796" direction="0 0 -1"/>',
      ).changes,
    ).toEqual([]);
    expect(rows(diff('<DirectionalLight/>', '<DirectionalLight global="true"/>'))).toEqual([
      'lighting:lightChanged:DirectionalLight.global:false>true',
    ]);
  });

  it('uses the number, colour and vector tolerances', () => {
    expect(
      diff(
        '<PointLight intensity="0.5" color="1 0.5 0" location="1 2 3"/>',
        '<PointLight intensity="0.5000004" color="1 0.50005 0" location="1 2 3.000004"/>',
      ).changes,
    ).toEqual([]);
    expect(
      rows(diff('<PointLight color="1 0.5 0"/>', '<PointLight color="1 0.5002 0"/>')),
    ).toHaveLength(1);
    expect(
      rows(diff('<PointLight location="1 2 3"/>', '<PointLight location="1 2 3.00002"/>')),
    ).toHaveLength(1);
  });

  it('compares a direction as a direction, whatever its length', () => {
    const light = (direction: string) => `<DirectionalLight direction="${direction}"/>`;
    expect(diff(light('0 -1 0'), light('0 -2.5 0')).changes).toEqual([]);
    expect(diff(light('1 -1 0'), light('0.5 -0.5 0')).changes).toEqual([]);
    expect(rows(diff(light('0 -1 0'), light('0 1 0')))).toHaveLength(1);
    expect(rows(diff(light('0 -1 0'), light('0.001 -1 0')))).toHaveLength(1);
    // A zero vector has no direction: it is compared as written.
    expect(rows(diff(light('0 0 0'), light('0 -1 0')))).toHaveLength(1);
    expect(diff(light('0 0 0'), light('0 0 0')).changes).toEqual([]);
  });

  it('follows DEF and USE like other nodes', () => {
    const lit = (intensity: number, reuse: string) =>
      `<Group><PointLight DEF="Lamp" intensity="${intensity}"/>${reuse}</Group>`;
    const edited = diff(
      lit(1, '<PointLight USE="Lamp"/><PointLight USE="Lamp"/>'),
      lit(0.5, '<PointLight USE="Lamp"/><PointLight USE="Lamp"/>'),
    );
    expect(rows(edited)).toEqual(['lighting:lightChanged:PointLight.intensity:1>0.5']);
    expect(edited.changes[0].affectedUseCount).toBe(2);
    expect(
      diff(lit(1, '<PointLight USE="Lamp"/>'), lit(1, '')).changes.map((c) => c.message),
    ).toEqual(['USE Lamp removed']);
    const renamed = diff('<SpotLight DEF="Key" on="false"/>', '<SpotLight DEF="Main" on="false"/>');
    expect(renamed.changes.map((c) => c.kind)).toEqual(['nodeRenamed']);
    expect(
      diff('<PointLight/>', '<PointLight/><DirectionalLight DEF="Sun"/>').changes.map(
        (c) => c.message,
      ),
    ).toEqual(['DirectionalLight DEF Sun added']);
    expect(diff('<PointLight USE="Nowhere"/>', '<PointLight/>').summary.status).toBe('incomplete');
  });

  it('reads the X3D 4.0 shadow settings and the 4.0 SpotLight default', () => {
    const v4 = (body: string) => compareX3D(scene(body, '4.0'), scene(body, '4.0'));
    const shadows = compareX3D(
      scene('<PointLight shadows="false"/>', '4.0'),
      scene('<PointLight shadows="true" shadowIntensity="0.5"/>', '4.0'),
    );
    expect(shadows.summary.status).toBe('completeWithWarnings');
    expect(rows(shadows)).toEqual([
      'lighting:lightChanged:PointLight.shadowIntensity:1>0.5',
      'lighting:lightChanged:PointLight.shadows:false>true',
    ]);
    expect(v4('<SpotLight/>').changes).toEqual([]);
    // An omitted beamWidth means π/4 up to 3.3 and 3π/16 in 4.0: the cone really differs.
    const upgraded = compareX3D(scene('<SpotLight/>', '3.3'), scene('<SpotLight/>', '4.0'));
    expect(rows(upgraded)).toEqual([
      'document:documentContextChanged:undefined.:"3.3">"4.0"',
      'lighting:lightChanged:SpotLight.beamWidth:0.7854>0.589049',
    ]);
    // Written out, the same value is the same in both versions; the shadow defaults add nothing.
    expect(
      compareX3D(
        scene('<SpotLight beamWidth="0.5"/><PointLight/>', '3.3'),
        scene('<SpotLight beamWidth="0.5"/><PointLight/>', '4.0'),
      ).changes.map((c) => c.message),
    ).toEqual(['X3D version changed']);
    // Other 4.0 additions stay outside the catalog.
    const other = compareX3D(
      scene('<Viewpoint/>', '4.0'),
      scene('<Viewpoint nearDistance="0.1"/>', '4.0'),
    );
    expect(other.summary.status).toBe('incomplete');
    expect(other.diagnostics.map((d) => d.message)).toContain('Viewpoint.nearDistance is opaque');
  });

  it('still refuses an invalid light value', () => {
    const r = diff('<PointLight on="true"/>', '<PointLight on="TRUE" intensity="bright"/>');
    expect(r.summary.status).toBe('incomplete');
    expect(r.diagnostics.map((d) => d.code)).toEqual(['INVALID_FIELD', 'INVALID_FIELD']);
  });

  it('compares the fixture pair with changed lights', () => {
    const r = compareX3D(read('lights/before.x3d'), read('lights/after.x3d'));
    expect(r.summary.status).toBe('complete');
    expect(r.diagnostics).toEqual([]);
    expect(
      r.changes.map(
        (c) => `${(c.afterNode ?? c.beforeNode)?.defName ?? 'USE'}.${c.field ?? c.kind}`,
      ),
    ).toEqual([
      'Sun.intensity',
      'Lamp.color',
      'Lamp.location',
      'Spot.direction',
      'Spot.on',
      'USE.defUseChanged',
    ]);
    // The Sun's direction is written twice as long and is still the same direction.
    expect(r.changes.some((c) => c.afterNode?.defName === 'Sun' && c.field === 'direction')).toBe(
      false,
    );
  });

  it('reads the Web3D textbook example PointLightColor.x3d completely', () => {
    const original = read('official/PointLightColor.x3d');
    const same = compareX3D(original, original);
    expect(same.summary.status).toBe('complete');
    expect(same.diagnostics).toEqual([]);
    expect(same.changes).toEqual([]);
    const edited = original.replace(
      "<PointLight DEF='Lamp' color='1 1 0' location='0 0 12' radius='15'/>",
      "<PointLight DEF='Lamp' color='1 1 0' intensity='0.6' location='0 0 9' radius='15'/>",
    );
    expect(edited).not.toBe(original);
    const r = compareX3D(original, edited);
    expect(r.summary.status).toBe('complete');
    expect(rows(r)).toEqual([
      'lighting:lightChanged:PointLight.intensity:1>0.6',
      'lighting:lightChanged:PointLight.location:[0,0,12]>[0,0,9]',
    ]);
  });
});

describe('other everyday nodes', () => {
  it('compares viewpoints, navigation, background and world information', () => {
    const cases: Array<[string, string, string]> = [
      [
        '<Viewpoint position="0 0 10"/>',
        '<Viewpoint position="0 1 10"/>',
        'viewpoint:viewpointChanged:Viewpoint.position:[0,0,10]>[0,1,10]',
      ],
      [
        '<OrthoViewpoint fieldOfView="-1 -1 1 1"/>',
        '<OrthoViewpoint fieldOfView="-2 -2 2 2"/>',
        'viewpoint:viewpointChanged:OrthoViewpoint.fieldOfView:[-1,-1,1,1]>[-2,-2,2,2]',
      ],
      [
        '<NavigationInfo headlight="true"/>',
        '<NavigationInfo headlight="false"/>',
        'viewpoint:viewpointChanged:NavigationInfo.headlight:true>false',
      ],
      [
        '<Background skyColor="0 0 0"/>',
        '<Background skyColor="1 1 1"/>',
        'field:fieldChanged:Background.skyColor:[[0,0,0]]>[[1,1,1]]',
      ],
      [
        '<WorldInfo title="a"/>',
        '<WorldInfo title="b"/>',
        'metadata:metadataChanged:WorldInfo.title:"a">"b"',
      ],
    ];
    for (const [before, after, expected] of cases) {
      const r = diff(before, after);
      expect(r.summary.status).toBe('complete');
      expect(rows(r)).toEqual([expected]);
    }
    // OrthoViewpoint defaults are compared.
    expect(
      diff(
        '<OrthoViewpoint/>',
        '<OrthoViewpoint position="0 0 10" orientation="0 0 1 0" fieldOfView="-1 -1 1 1" jump="true"/>',
      ).changes,
    ).toEqual([]);
  });
});

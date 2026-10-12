import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compareX3D } from '../src/diff/compare';
import { exportReportJson } from '../src/report/export-json';
import { parseX3D } from '../src/x3d/parse';

const read=(p:string)=>readFileSync(fileURLToPath(new URL(`../fixtures/${p}`,import.meta.url)),'utf8');
describe('curated inputs',()=>{
  for(const demo of ['forgeworks','fitlab']) it(`${demo} revisions have complete, unambiguous comparisons`,()=>{
    const scene=(side:string)=>readFileSync(fileURLToPath(new URL(`../public/examples/${demo}/${side}.x3d`,import.meta.url)),'utf8');
    const r=compareX3D(scene('before'),scene('after'));
    expect(r.summary.status).toBe('complete');
    expect(r.diagnostics).toHaveLength(0);
    expect(r.changes.some(c=>c.confidence==='low')).toBe(false);
    for(const kind of ['nodeAdded','nodeRemoved']) expect(r.changes.some(c=>c.kind===kind)).toBe(true);
    if(demo==='forgeworks') {
      const timing=r.changes.find(c=>c.field==='cycleInterval');
      expect([timing?.before?.value,timing?.after?.value]).toEqual([6,4]);
    } else {
      expect(r.changes.filter(c=>c.category==='transform').map(c=>c.field).sort()).toEqual(['rotation','translation']);
      expect(r.changes.filter(c=>c.category==='transform').every(c=>c.afterNode?.defName==='HousingPlacement')).toBe(true);
    }
  });
  it('compares the animated Brickhaven showcase without unsupported declarations',()=>{
    const scene=(side:string)=>readFileSync(fileURLToPath(new URL(`../public/examples/brickhaven/${side}.x3d`,import.meta.url)),'utf8');
    const r=compareX3D(scene('before'),scene('after'));
    expect(r.summary.status).toBe('complete');
    const timing=r.changes.find(c=>c.field==='cycleInterval');
    expect([timing?.before?.value,timing?.after?.value]).toEqual([32,24]);
    for(const kind of ['materialChanged','geometryChanged','nodeAdded','nodeRemoved']) expect(r.changes.some(c=>c.kind===kind)).toBe(true);
    expect(r.changes.some(c=>c.confidence==='low')).toBe(false);
  });
  it('parses official HelloWorld with external DOCTYPE',()=>{const p=parseX3D(read('official/HelloWorld.x3d'),'before');expect(p.fatal).toBe(false);expect(p.summary.x3dVersion).toBe('3.3')});
  it('reports real refactor identity and ROUTEs',()=>{const r=compareX3D(read('refactor/before.x3d'),read('refactor/after.x3d'));expect(r.changes.filter(c=>c.kind==='nodeRenamed')).toHaveLength(5);expect(r.changes.filter(c=>c.kind.startsWith('route'))).toHaveLength(0)});
  it('counts index-matched dolphin points',()=>{const r=compareX3D(read('dolphin/before.x3d'),read('dolphin/after.x3d'));const c=r.changes.find(c=>c.field==='point');expect([c?.movedPoints,c?.totalPoints]).toEqual([387,508])});
  it('reads an X3D 4.0 revision against its 3.3 original without inventing differences',()=>{
    const r=compareX3D(read('version/before.x3d'),read('version/after.x3d'));
    // The official 3.3 and 4.0 twins of one scene: only the header and the title differ.
    expect(r.changes.map(c=>c.message).sort()).toEqual(['Document META changed','WorldInfo.title changed','X3D version changed']);
    expect(r.changes.find(c=>c.message==='X3D version changed')).toMatchObject({before:{value:'3.3'},after:{value:'4.0'},category:'document'});
    expect(r.diagnostics.filter(d=>d.code==='VERSION_READ_AS_3_3').map(d=>d.side)).toEqual(['after']);
    expect(r.diagnostics.map(d=>d.code)).not.toContain('VERSION_UNSUPPORTED');
  });
  it('gives a 4.0 metadata set its own default containment, and only there',()=>{
    const set=(version:string,inner:string)=>`<X3D version="${version}"><Scene><WorldInfo><MetadataSet containerField="metadata">${inner}</MetadataSet></WorldInfo><MetadataString name="root"/></Scene></X3D>`;
    const explicit=set('3.3','<MetadataFloat containerField="value" name="a"/>'),implied=set('4.0','<MetadataFloat name="a"/>');
    expect(compareX3D(explicit,implied).changes.map(c=>c.message)).toEqual(['X3D version changed']);
    // In 3.3 the same omission really is a different containment.
    expect(compareX3D(explicit,set('3.3','<MetadataFloat name="a"/>')).changes.map(c=>c.kind)).toEqual(['nodeMoved']);
  });
  it.each(['3.0','3.1','3.2'])('reads X3D %s with a note',(version)=>{
    const scene=(v:string,size:number)=>`<X3D version="${v}"><Scene><Shape><Box size="${size} 1 1"/></Shape></Scene></X3D>`;
    const r=compareX3D(scene(version,1),scene(version,2));
    expect(r.summary.status).toBe('completeWithWarnings');
    expect(r.changes.map(c=>c.kind)).toEqual(['geometryChanged']);
    expect(r.diagnostics.map(d=>d.code)).toEqual(['VERSION_READ_AS_3_3','VERSION_READ_AS_3_3']);
  });
  it('stops at a version it does not know',()=>{
    for(const version of ['5.0','2.0','']){
      const r=compareX3D(read('version/before.x3d'),read('version/after.x3d').replace("version='4.0'",`version='${version}'`));
      expect(r.summary.status).toBe('failed');expect(r.changes).toHaveLength(0);expect(r.diagnostics.map(d=>d.code)).toContain('VERSION_UNSUPPORTED');
    }
  });
  for(const demo of ['refactor','dolphin','example'] as const) it(`${demo} deterministic golden`,()=>{
    const before=demo==='example'?readFileSync(fileURLToPath(new URL('../public/examples/HelloWorld.x3d',import.meta.url)),'utf8'):read(`${demo}/before.x3d`);
    const after=demo==='example'?readFileSync(fileURLToPath(new URL('../public/examples/HelloWorld-edited.x3d',import.meta.url)),'utf8'):read(`${demo}/after.x3d`);
    const beforeName=demo==='example'?'HelloWorld.x3d':'before.x3d',afterName=demo==='example'?'HelloWorld-edited.x3d':'after.x3d';
    expect(exportReportJson(compareX3D(before,after,{}, {before:beforeName,after:afterName}))).toBe(read(`golden/${demo}.json`));
  });
});

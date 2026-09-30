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
  it('stops at version boundary',()=>{const r=compareX3D(read('version/before.x3d'),read('version/after.x3d'));expect(r.summary.status).toBe('incomplete');expect(r.diagnostics.map(d=>d.code)).toContain('VERSION_UNSUPPORTED')});
  for(const demo of ['refactor','dolphin','example'] as const) it(`${demo} deterministic golden`,()=>{
    const before=demo==='example'?readFileSync(fileURLToPath(new URL('../public/examples/HelloWorld.x3d',import.meta.url)),'utf8'):read(`${demo}/before.x3d`);
    const after=demo==='example'?readFileSync(fileURLToPath(new URL('../public/examples/HelloWorld-edited.x3d',import.meta.url)),'utf8'):read(`${demo}/after.x3d`);
    const beforeName=demo==='example'?'HelloWorld.x3d':'before.x3d',afterName=demo==='example'?'HelloWorld-edited.x3d':'after.x3d';
    expect(exportReportJson(compareX3D(before,after,{}, {before:beforeName,after:afterName}))).toBe(read(`golden/${demo}.json`));
  });
});

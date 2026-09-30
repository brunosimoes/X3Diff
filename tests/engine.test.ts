import { describe,it,expect } from 'vitest';
import { compareX3D } from '../src/diff/compare';
import { exportReportJson } from '../src/report/export-json';
const scene=(body:string)=>`<X3D version="3.3" profile="Interchange"><Scene>${body}</Scene></X3D>`;
describe('safe deterministic semantic subset',()=>{
  it('normalizes attributes, numeric lexical forms, defaults and containerField',()=>{
    const a=scene('<Shape><Appearance><Material diffuseColor="0.8 0.8 0.8"/></Appearance><Box size="2, 2, 2"/></Shape>');
    const b=scene('<Shape><Box containerField="geometry" size="2e0 2.0 2"/><Appearance><Material/></Appearance></Shape>');
    expect(compareX3D(a,b).changes).toHaveLength(0);
  });
  it('distinguishes transform, geometry and material edits',()=>{
    const a=scene('<Transform DEF="T" translation="0 0 0"><Shape><Appearance><Material diffuseColor="1 0 0"/></Appearance><Box size="1 1 1"/></Shape></Transform>');
    const b=scene('<Transform DEF="T" translation="1 0 0"><Shape><Appearance><Material diffuseColor="0 1 0"/></Appearance><Box size="2 1 1"/></Shape></Transform>');
    const kinds=compareX3D(a,b).changes.map(c=>c.kind);expect(kinds).toContain('transformChanged');expect(kinds).toContain('geometryChanged');expect(kinds).toContain('materialChanged');
  });
  it('accepts equivalent rotations and rejects uppercase XML booleans',()=>{
    const a=scene('<Transform rotation="0 1 0 3.141592653589793"/>');const b=scene('<Transform rotation="0 -1 0 -3.141592653589793"/>');
    expect(compareX3D(a,b).changes).toHaveLength(0);
    const bad=compareX3D(scene('<Box solid="false"/>'),scene('<Box solid="FALSE"/>'));
    expect(bad.summary.status).toBe('incomplete');expect(bad.diagnostics.map(d=>d.code)).toContain('INVALID_FIELD');
  });
  it('parses MFString escapes and comma-separated numeric lists',()=>{
    const a=scene('<Inline url="&quot;a\\&quot;b.x3d&quot; &quot;c.x3d&quot;"/><ScalarInterpolator key="0, 0.5, 1"/>');
    const b=scene('<Inline url="&quot;a\\&quot;b.x3d&quot;   &quot;c.x3d&quot;"/><ScalarInterpolator key="0 0.5 1"/>');
    expect(compareX3D(a,b).changes).toHaveLength(0);
  });
  it('blocks internal DTD/entity payload and leaves no trusted diff',()=>{
    const malicious='<!DOCTYPE X3D [<!ENTITY x SYSTEM "file:///secret">]>'+scene('<Shape/>');
    const r=compareX3D(malicious,scene('<Shape/>'));
    expect(r.summary.status).toBe('failed');expect(r.changes).toHaveLength(0);
    expect(r.diagnostics.some(d=>d.code.includes('DTD')||d.code.includes('ENTITY'))).toBe(true);
  });
  it('exports identical bytes for identical inputs',()=>{
    const a=scene('<Transform translation="1 0 0"/>'),b=scene('<Transform translation="2 0 0"/>');
    expect(exportReportJson(compareX3D(a,b))).toBe(exportReportJson(compareX3D(a,b)));
  });
  it('does not claim ambiguous DEF renames',()=>{
    const a=scene('<TimeSensor DEF="A"/><TimeSensor DEF="B"/>');
    const b=scene('<TimeSensor DEF="C"/><TimeSensor DEF="D"/>');
    const r=compareX3D(a,b);expect(r.changes.some(c=>c.kind==='nodeRenamed')).toBe(false);expect(r.summary.status).toBe('incomplete');
  });
  it('counts USE occurrences without cloning the DEF node',()=>{
    const a=scene('<Group><Shape DEF="S"><Box size="1 1 1"/></Shape><Shape USE="S"/><Shape USE="S"/></Group>');
    const b=scene('<Group><Shape DEF="S"><Box size="2 1 1"/></Shape><Shape USE="S"/><Shape USE="S"/></Group>');
    const r=compareX3D(a,b);expect(r.changes.filter(c=>c.kind==='geometryChanged')).toHaveLength(1);expect(r.changes.filter(c=>c.kind==='defUseChanged')).toHaveLength(0);
  });
  it('preserves ordered children but ignores ROUTE order and duplicates',()=>{
    const a=scene('<Group><Shape DEF="A"/><Shape DEF="B"/></Group><TimeSensor DEF="T"/><ROUTE fromNode="T" fromField="fraction_changed" toNode="T" toField="set_fraction"/>');
    const b=scene('<Group><Shape DEF="B"/><Shape DEF="A"/></Group><TimeSensor DEF="T"/><ROUTE fromNode="T" fromField="fraction_changed" toNode="T" toField="set_fraction"/><ROUTE fromNode="T" fromField="fraction_changed" toNode="T" toField="set_fraction"/>');
    const r=compareX3D(a,b);expect(r.changes.some(c=>c.kind==='childOrderChanged')).toBe(true);expect(r.changes.some(c=>c.kind.startsWith('route'))).toBe(false);
  });
  it('fails malformed XML without a partial semantic report',()=>{
    const r=compareX3D(scene('<Shape>'),scene('<Shape/>'));
    expect(r.summary.status).toBe('failed');expect(r.changes).toHaveLength(0);
  });
  it('keeps an unknown field opaque instead of reporting a trusted typed edit',()=>{
    const a=scene('<Box experimentalValue="one"/>');
    const b=scene('<Box experimentalValue="two"/>');
    const r=compareX3D(a,b);
    expect(r.summary.status).toBe('incomplete');
    expect(r.diagnostics.filter(d=>d.code==='UNSUPPORTED_FIELD')).toHaveLength(2);
    expect(r.changes.filter(c=>c.kind==='fieldChanged'||c.kind==='geometryChanged')).toHaveLength(0);
  });
  it('does not certify a DEF rename from an opaque subtree',()=>{
    const a=scene('<Shape DEF="Old"><UnsupportedGeometry hiddenValue="one"/></Shape>');
    const b=scene('<Shape DEF="New"><UnsupportedGeometry hiddenValue="two"/></Shape>');
    const r=compareX3D(a,b);
    expect(r.summary.status).toBe('incomplete');
    expect(r.changes.some(c=>c.kind==='nodeRenamed')).toBe(false);
  });
});

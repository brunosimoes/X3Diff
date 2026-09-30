import type { ChangeRecord, X3DiffReport } from "../report/schema";
import { sanitizePreview } from "./sanitize";

type Side = "before" | "after";
type ShapeState = "unchanged" | "changed" | "added" | "removed";
export interface DiffSceneResult {
  xml: string;
  shapeCounts: Record<ShapeState, number>;
  notices: string[];
  cueByChangeId: Record<string, string>;
}

const PALETTE: Record<ShapeState | "beforeChanged", { diffuse: string; glow: string; transparency: string }> = {
  unchanged: { diffuse: "0.42 0.50 0.63", glow: "0.02 0.03 0.05", transparency: "0.55" },
  changed: { diffuse: "0.08 0.78 1", glow: "0.02 0.18 0.28", transparency: "0.62" },
  beforeChanged: { diffuse: "1 0.18 0.70", glow: "0.27 0.02 0.16", transparency: "0.12" },
  added: { diffuse: "0.30 1 0.45", glow: "0.07 0.25 0.08", transparency: "0.10" },
  removed: { diffuse: "1 0.22 0.31", glow: "0.28 0.03 0.04", transparency: "0.27" },
};

const VISUAL_CATEGORIES = new Set(["geometry", "material", "appearance", "transform", "structure"]);
const INERT_NODES = new Set(["ROUTE", "TimeSensor", "TouchSensor", "BooleanFilter", "BooleanTrigger", "IntegerTrigger", "TimeTrigger", "ColorInterpolator", "OrientationInterpolator", "ScalarInterpolator"]);

function mapsToShape(shapePath: string, changePath?: string): boolean {
  return !!changePath && (shapePath === changePath || shapePath.startsWith(`${changePath}/`) || changePath.startsWith(`${shapePath}/`));
}

function classify(path: string, side: Side, changes: ChangeRecord[]): ShapeState {
  let changed = false;
  for (const change of changes) {
    if (change.confidence === "low") continue;
    const target = side === "before" ? change.beforeNode?.path : change.afterNode?.path;
    if (!mapsToShape(path, target)) continue;
    if (side === "before" && change.kind === "nodeRemoved") return "removed";
    if (side === "after" && change.kind === "nodeAdded") return "added";
    if (VISUAL_CATEGORIES.has(change.category)) changed = true;
  }
  return changed ? "changed" : "unchanged";
}

function elements(parent: Element): Element[] { return Array.from(parent.children); }

function shapePaths(scene: Element): Array<{ node: Element; path: string }> {
  const found: Array<{ node: Element; path: string }> = [];
  const walk = (node: Element, path: string) => {
    if (node.localName === "Shape") found.push({ node, path });
    const counts = new Map<string, number>();
    for (const child of elements(node)) {
      if (child.localName === "ROUTE") continue;
      const n = (counts.get(child.localName) ?? 0) + 1;
      counts.set(child.localName, n);
      walk(child, `${path}/${child.localName}[${n}]`);
    }
  };
  const counts = new Map<string, number>();
  for (const child of elements(scene)) {
    if (child.localName === "ROUTE") continue;
    const n = (counts.get(child.localName) ?? 0) + 1;
    counts.set(child.localName, n);
    walk(child, `/X3D/Scene/${child.localName}[${n}]`);
  }
  return found;
}

function tint(shape: Element, state: ShapeState, side: Side, doc: Document): void {
  for (const child of elements(shape)) if (child.localName === "Appearance") child.remove();
  const appearance = doc.createElement("Appearance");
  const material = doc.createElement("Material");
  const color = side === "before" && state === "changed" ? PALETTE.beforeChanged : PALETTE[state];
  material.setAttribute("diffuseColor", color.diffuse);
  material.setAttribute("emissiveColor", color.glow);
  material.setAttribute("transparency", color.transparency);
  appearance.append(material);
  shape.insertBefore(appearance, shape.firstChild);
}

function removeInertNodes(scene: Element): void {
  for (const node of Array.from(scene.getElementsByTagName("*"))) if (INERT_NODES.has(node.localName)) node.remove();
}

function prefixNames(scene: Element, prefix: string): void {
  for (const node of Array.from(scene.getElementsByTagName("*"))) {
    for (const key of ["DEF", "USE"]) {
      const value = node.getAttribute(key);
      if (value) node.setAttribute(key, `${prefix}${value}`);
    }
  }
}

/** A visual explanation of mapped Shape changes, built only from sanitized local XML. */
export function buildDiffScene(beforeXML: string, afterXML: string, report: X3DiffReport): DiffSceneResult {
  if (report.summary.status !== "complete" && report.summary.status !== "completeWithWarnings") throw new Error("A complete X3D 3.3 report is required for the change scene.");
  const beforeSafe = sanitizePreview(beforeXML);
  const afterSafe = sanitizePreview(afterXML);
  const parser = new DOMParser();
  const beforeDoc = parser.parseFromString(beforeSafe.xml, "application/xml");
  const afterDoc = parser.parseFromString(afterSafe.xml, "application/xml");
  const sceneOf = (doc: Document) => elements(doc.documentElement).find(e => e.localName === "Scene");
  const beforeScene = sceneOf(beforeDoc), afterScene = sceneOf(afterDoc);
  if (!beforeScene || !afterScene) throw new Error("The change scene needs two Scene elements.");
  const result = parser.parseFromString('<X3D version="3.3" profile="Immersive"><Scene><Background skyColor="0.025 0.04 0.075"/></Scene></X3D>', "application/xml");
  const targetScene = sceneOf(result)!;
  const viewpoint = elements(afterScene).find(e => e.localName === "Viewpoint");
  if (viewpoint) targetScene.append(result.importNode(viewpoint, true));
  const counts: Record<ShapeState, number> = { unchanged: 0, changed: 0, added: 0, removed: 0 };
  const cueByChangeId: Record<string, string> = {};

  for (const [side, source, safe] of [["before", beforeScene, beforeSafe], ["after", afterScene, afterSafe]] as const) {
    const sourcePathByCue = new Map<string, string>();
    for (const [path, cue] of safe.pathToCue) if (/\/Shape\[\d+\]$/.test(path)) sourcePathByCue.set(cue, path);
    const clone = result.importNode(source, true) as Element;
    const originalShapes = shapePaths(clone);
    for (const { node, path } of originalShapes) {
      const sourcePath = sourcePathByCue.get(node.getAttribute("DEF") ?? "") ?? path;
      const state = classify(sourcePath, side, report.changes);
      if (side === "before" && state === "unchanged") { node.remove(); continue; }
      counts[state]++;
      const def = node.getAttribute("DEF");
      if (def && state !== "unchanged") for (const change of report.changes) {
        const target = side === "before" ? change.beforeNode?.path : change.afterNode?.path;
        if (mapsToShape(sourcePath, target) && (side === "after" || !cueByChangeId[change.id])) cueByChangeId[change.id] = `${side === "before" ? "B_" : "A_"}${def}`;
      }
      tint(node, state, side, result);
    }
    removeInertNodes(clone);
    for (const child of elements(clone)) {
      if (child.localName === "Viewpoint" || child.localName === "Background" || child.localName === "WorldInfo") { child.remove(); continue; }
      if (child.localName !== "Shape" && !child.getElementsByTagName("Shape").length) child.remove();
    }
    prefixNames(clone, side === "before" ? "B_" : "A_");
    const group = result.createElement("Group");
    group.setAttribute("DEF", side === "before" ? "X3DIFF_BEFORE_GHOST" : "X3DIFF_AFTER_SCENE");
    for (const child of elements(clone)) group.append(child);
    targetScene.append(group);
  }

  return {
    xml: new XMLSerializer().serializeToString(result),
    shapeCounts: counts,
    notices: [...new Set([...beforeSafe.notices, ...afterSafe.notices])],
    cueByChangeId,
  };
}

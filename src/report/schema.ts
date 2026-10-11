// Report format, schema 1.0. Reader-facing description: docs/REPORT_SCHEMA.md.
// "Reserved — not emitted yet" marks names that are part of the 1.0 contract but that
// the engine does not produce today. Consumers should accept them and must not rely on them.
export type Severity = 'critical'|'high'|'medium'|'low'|'info';
/**
 * Reserved — not emitted yet (6 of 27): `nodeReplaced`, `fieldBelowTolerance`, `routeRewired`,
 * `interactionChanged`, `unsupportedFeature`, `invalidReference`.
 * Unsupported content and invalid references are reported in `diagnostics` instead.
 */
export type ChangeKind = 'nodeAdded'|'nodeRemoved'|'nodeReplaced'|'nodeMoved'|'nodeRenamed'|'fieldChanged'|'fieldBelowTolerance'|'childOrderChanged'|'transformChanged'|'geometryChanged'|'appearanceChanged'|'materialChanged'|'textureReferenceChanged'|'defUseChanged'|'routeAdded'|'routeRemoved'|'routeRewired'|'animationConfigChanged'|'timeConfigChanged'|'interactionChanged'|'viewpointChanged'|'lightChanged'|'metadataChanged'|'documentContextChanged'|'unsupportedFeature'|'invalidReference'|'matchUncertain';
export interface ToleranceConfig { floatAbs: number; floatRel: number; vectorAbs: number; rotationRadians: number; colorAbs: number }
/** `line` and `column` are reserved — not emitted yet; only `elementPath` is filled. */
export interface SourceLocation { line?: number; column?: number; elementPath: string }
/** `scopePath` is always `'/'` today (no PROTO or Inline scopes are analysed). */
export interface NodeRef { nodeType: string; defName?: string; scopePath: string; path: string; source?: SourceLocation }
export interface ValueSnapshot { fieldType?: string; value: unknown; lexicalValue?: string }
/** `source` is reserved — not emitted yet; `path` locates the element. */
export interface Diagnostic { code: string; severity: 'warning'|'error'; side?: 'before'|'after'; message: string; path?: string; source?: SourceLocation }
/** `relatedChangeIds` and `unsupportedReason` are reserved — not emitted yet. */
export interface ChangeRecord { id: string; kind: ChangeKind; severity: Severity; confidence: 'high'|'medium'|'low'; category: string; message: string; before?: ValueSnapshot; after?: ValueSnapshot; beforePath?: string; afterPath?: string; beforeNode?: NodeRef; afterNode?: NodeRef; field?: string; toleranceApplied?: number; affectedUseCount?: number; relatedChangeIds?: string[]; unsupportedReason?: string; movedPoints?: number; totalPoints?: number }
/** `sha256` is reserved — not emitted yet. */
export interface InputSummary { name?: string; byteLength: number; sha256?: string; x3dVersion?: string; profile?: string; components: Array<{name:string;level:number}>; parsedNodeCount: number }
/**
 * `config.enabledCategories` is always `['all']` today (category filtering happens in the workbench only).
 * `summary.status === 'incomplete'` means some content was not compared: every skipped element or
 * setting has its own entry in `diagnostics` (see src/report/coverage.ts for the aggregation the workbench shows).
 */
export interface X3DiffReport { schemaVersion: '1.0'; toolVersion: string; inputs: {before:InputSummary;after:InputSummary}; config: ToleranceConfig & {enabledCategories:string[]}; summary: {status:'complete'|'completeWithWarnings'|'incomplete'|'failed';countsByKind:Record<string,number>;countsBySeverity:Record<Severity,number>;unsupportedCount:number}; changes: ChangeRecord[]; diagnostics: Diagnostic[]; catalog: {version:'3.3'; modelSha256:string; schemaSha256:string; supportedNodes:string[]; supportedFieldTypes:string[]} }

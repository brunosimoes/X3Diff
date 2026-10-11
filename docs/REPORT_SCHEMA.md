# Report format (schema 1.0)

**Export → Data (JSON)** in the workbench downloads this report, named after the two inputs (for example `part-v1__part-v2.x3diff.json`). **Export → Report (HTML)** is a readable rendering of the same report with analysis measurements added; it has no schema of its own. The TypeScript definition is [`src/report/schema.ts`](../src/report/schema.ts); this page says what each part means which fields are emitted and which are **reserved**. Reserved names are part of schema 1.0, so a consumer should accept them, but the engine does not emit them and nothing should depend on them.

## Top level

| Field                           | Meaning                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `schemaVersion`                 | Always `"1.0"`.                                                                           |
| `toolVersion`                   | X3Diff version that wrote the report (from `package.json`).                               |
| `inputs.before`, `inputs.after` | File name, size in bytes, X3D version, profile, components and number of parsed elements. |
| `config`                        | The tolerances used, plus `enabledCategories`.                                            |
| `summary`                       | `status`, counts by change kind and severity, and `unsupportedCount`.                     |
| `changes`                       | One record per difference found.                                                          |
| `diagnostics`                   | Notes and problems met while reading the files.                                           |
| `catalog`                       | The node types and field types the comparison understands, with source hashes.            |

## Status

| `summary.status`       | Meaning                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `complete`             | Declarations within the supported model were compared.                                                                          |
| `completeWithWarnings` | Supported declarations were compared; `diagnostics` holds notes (for example external content that is declared but not loaded). |
| `incomplete`           | Some content was compared and some was not. `changes` lists the differences found; it is not the full list.                     |
| `failed`               | A file could not be read. `changes` is empty.                                                                                   |

An `incomplete` report says what was not compared in `diagnostics`:

- `UNSUPPORTED_NODE`: an element whose type is outside the catalog. Exactly one entry per element, with `side` (which file), `path` (where) and `message`: `"<Type> is opaque"`, followed by `"; its fields were not compared: <field>, <field>"` when the element has attributes. Its settings are not listed as separate entries. The element and its contents are not interpreted; descendants do not enter the scene's DEF scope.
- `UNSUPPORTED_FIELD`: a setting the catalog does not cover on a node type it does cover (`"<Type>.<field> is opaque"`).
- any entry with `severity: "error"`: a declaration that could not be interpreted, such as an invalid value, a duplicate DEF or an unresolved USE or ROUTE. `VERSION_UNSUPPORTED` means a file declares a version outside 3.0 to 4.0 and nothing was compared.
- in `changes`, records of kind `matchUncertain`: objects that could not be matched between the files with confidence.

A changed field of a `DirectionalLight`, `PointLight` or `SpotLight` is a `lightChanged` record with category `lighting`.

A file that declares 3.0, 3.1, 3.2 or 4.0 is compared with the 3.3 catalog (plus the 4.0 light fields `shadows` and `shadowIntensity`, and the 4.0 default of `SpotLight.beamWidth`) and carries a `VERSION_READ_AS_3_3` warning (status `completeWithWarnings` if nothing else is wrong); `inputs.*.x3dVersion` holds the declared version, and a version that differs between the two files is a `documentContextChanged` change.

`summary.unsupportedCount` is the number of `UNSUPPORTED_*` diagnostics: one per skipped element, plus one per unsupported setting on a supported node. [`src/report/coverage.ts`](../src/report/coverage.ts) groups these entries into the per-file list the workbench shows in its "Incomplete comparison" notice; it reads only the fields above, so it gives the same answer for an exported report.

## Reserved fields and kinds

**Change kinds.** `ChangeRecord.kind` allows 27 values. The engine emits 21. These 6 are reserved:

| Reserved kind         | Emitted representation                                                                |
| --------------------- | ------------------------------------------------------------------------------------- |
| `nodeReplaced`        | A `nodeRemoved` and a `nodeAdded`.                                                    |
| `fieldBelowTolerance` | Nothing: values within tolerance are equal.                                           |
| `routeRewired`        | A `routeRemoved` and a `routeAdded`.                                                  |
| `interactionChanged`  | `fieldChanged` (for example on a TouchSensor).                                        |
| `unsupportedFeature`  | `UNSUPPORTED_NODE` / `UNSUPPORTED_FIELD` diagnostics.                                 |
| `invalidReference`    | `UNRESOLVED_USE` / `UNRESOLVED_ROUTE` diagnostics.                                    |

**Fields.** These are never filled:

| Field               | Where                                                 |
| ------------------- | ----------------------------------------------------- |
| `sha256`            | `inputs.before`, `inputs.after`                       |
| `relatedChangeIds`  | each change                                           |
| `unsupportedReason` | each change                                           |
| `line`, `column`    | `source` of a node reference; `elementPath` is filled |
| `source`            | each diagnostic; `path` is filled                     |

**Fields with a single value.**

- `config.enabledCategories` is always `["all"]`. The category filter in the workbench changes what is shown, not what is compared or exported.
- `scopePath` in every node reference is always `"/"`. PROTO and Inline scopes are not analysed.
